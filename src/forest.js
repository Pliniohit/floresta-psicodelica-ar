import {
  Group, InstancedMesh, Mesh, Points, BufferGeometry, BufferAttribute,
  Shape, ShapeGeometry, IcosahedronGeometry, Matrix4, Vector2, Vector3,
  Quaternion,
} from '../vendor/three/three.module.min.js';
import * as G from './geometry.js';
import * as M from './shaders/materials.js';
import {
  pointInPolygon, polygonArea, polygonBounds, polygonCentroid, distanceToEdges,
} from './room.js';

/** PRNG determinístico: a mesma semente devolve exatamente a mesma floresta. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Regras de caminhabilidade. São o coração do ajuste: o tronco é o que bloqueia
// a passagem, a copa não — ela fica acima de 2,1 m. Então espaçamos troncos com
// folga e deixamos as copas se cruzarem por cima, que é o que forma o dossel.
// ---------------------------------------------------------------------------
const WALK = {
  trunkGapOpen: 2.00,   // distância mínima entre troncos no meio do cômodo
  trunkGapWall: 1.15,   // perto da parede pode adensar: ninguém circula ali
  openFrom: 2.00,       // a partir desta distância da parede já é "meio do cômodo"
  wallMargin: 0.40,     // troncos não encostam na parede
  obstacleMargin: 0.30, // nem dentro de móveis
};

/** Densidades por metro quadrado de piso livre. */
const PER_M2 = { tree: 0.42, mushroom: 1.1, crystal: 0.55, grass: 95, orb: 1.1 };
const CAPACITY = { tree: 60, mushroom: 90, crystal: 40, grass: 1600, orb: 40 };
const SPORES = 900;

class InstanceSet {
  constructor(meshes, capacity) {
    this.meshes = meshes;
    this.capacity = capacity;
    this.count = 0;
    for (const m of meshes) { m.count = 0; m.frustumCulled = false; }
  }

  write(i, pos, quat, scale) {
    _m.compose(pos, quat, scale);
    for (const m of this.meshes) m.setMatrixAt(i, _m);
  }

  add(pos, quat, scale) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.write(i, pos, quat, scale);
    for (const m of this.meshes) m.count = this.count;
    return i;
  }

  /** Lê a transformação de uma instância de volta para objetos Three. */
  read(i, pos, quat, scale) {
    this.meshes[0].getMatrixAt(i, _m);
    _m.decompose(pos, quat, scale);
  }

  clear() { this.count = 0; for (const m of this.meshes) m.count = 0; }
  flush() { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; }
  dispose() { for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); } }
}

export class Forest extends Group {
  constructor() {
    super();
    this.name = 'floresta';
    this.growing = [];
    this.footprint = null;     // polígono do cômodo, em coordenadas locais
    this.obstacles = [];
    this.seedValue = 1;

    this.geo = {};
    this.species = [G.speciesTower(), G.speciesUmbrella(), G.speciesPagoda()].map((sp) => {
      this.geo.trunk ??= sp.trunk;
      const trunkMesh = new InstancedMesh(sp.trunk, M.barkMaterial, CAPACITY.tree);
      const canopyMesh = new InstancedMesh(sp.canopy, M.canopyMaterial, CAPACITY.tree);
      this.add(trunkMesh, canopyMesh);
      return { set: new InstanceSet([trunkMesh, canopyMesh], CAPACITY.tree) };
    });

    const mush = G.mushroom();
    this.geo.cap = mush.cap;
    const stemMesh = new InstancedMesh(mush.stem, M.stemMaterial, CAPACITY.mushroom);
    const capMesh = new InstancedMesh(mush.cap, M.capMaterial, CAPACITY.mushroom);
    this.add(stemMesh, capMesh);
    this.mushrooms = new InstanceSet([stemMesh, capMesh], CAPACITY.mushroom);

    const crystalGeo = G.crystal();
    this.geo.crystal = crystalGeo;
    const crystalMesh = new InstancedMesh(crystalGeo, M.crystalMaterial, CAPACITY.crystal);
    crystalMesh.renderOrder = 3;
    this.add(crystalMesh);
    this.crystals = new InstanceSet([crystalMesh], CAPACITY.crystal);

    const grassMesh = new InstancedMesh(G.blade(), M.grassMaterial, CAPACITY.grass);
    this.add(grassMesh);
    this.grass = new InstanceSet([grassMesh], CAPACITY.grass);

    const orbMesh = new InstancedMesh(new IcosahedronGeometry(0.05, 0), M.orbMaterial, CAPACITY.orb);
    orbMesh.renderOrder = 4;
    this.add(orbMesh);
    this.orbs = new InstanceSet([orbMesh], CAPACITY.orb);

    // Casca de realce mostrada em volta do objeto que a mão vai pegar.
    this.highlights = {
      mushroom: new Mesh(this.geo.cap, M.highlightMaterial),
      crystal: new Mesh(this.geo.crystal, M.highlightMaterial),
      tree: new Mesh(this.geo.trunk, M.highlightMaterial),
    };
    for (const h of Object.values(this.highlights)) {
      h.visible = false;
      h.frustumCulled = false;
      h.renderOrder = 7;
      this.add(h);
    }

    this.held = new Set();
    this.ground = null;
    this.spores = null;
  }

  // -------------------------------------------------------------------------
  // Encaixe no cômodo mapeado
  // -------------------------------------------------------------------------

  /**
   * Recebe o polígono do cômodo em coordenadas de mundo, reposiciona o grupo
   * no centróide e passa a trabalhar em coordenadas locais a partir daí — o
   * que mantém escala e rotação girando em torno do centro da sala.
   */
  applyRoom(room) {
    const centroid = polygonCentroid(room.footprint);
    this.position.set(centroid.x, room.floorY, centroid.y);

    this.footprint = room.footprint.map((p) => new Vector2(p.x - centroid.x, p.y - centroid.y));
    this.obstacles = (room.obstacles ?? []).map(
      (ob) => ob.map((p) => new Vector2(p.x - centroid.x, p.y - centroid.y)),
    );

    this.#rebuildGround();
    this.#rebuildSpores();
    this.seed(this.seedValue);
    return this;
  }

  /** Tapete de micélio recortado exatamente no formato do piso mapeado. */
  #rebuildGround() {
    if (this.ground) { this.ground.geometry.dispose(); this.remove(this.ground); }

    // Shape vive no plano XY; invertemos y para que rotateX(-90°) devolva o z original.
    const shape = new Shape(this.footprint.map((p) => new Vector2(p.x, -p.y)));
    const geo = new ShapeGeometry(shape).rotateX(-Math.PI / 2);
    geo.translate(0, 0.012, 0);

    this.ground = new Mesh(geo, M.groundMaterial);
    this.ground.renderOrder = 1;
    this.ground.frustumCulled = false;
    this.add(this.ground);
  }

  #rebuildSpores() {
    if (this.spores) { this.spores.geometry.dispose(); this.remove(this.spores); }

    const b = polygonBounds(this.footprint);
    const r = rng(9137);
    const pos = new Float32Array(SPORES * 3);
    const seeds = new Float32Array(SPORES);
    const speeds = new Float32Array(SPORES);

    for (let i = 0; i < SPORES; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 30; t++) {
        x = b.minX + r() * (b.maxX - b.minX);
        z = b.minZ + r() * (b.maxZ - b.minZ);
        if (pointInPolygon(x, z, this.footprint)) break;
      }
      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = r() * 40;      // fase inicial; o shader remapeia para altura
      pos[i * 3 + 2] = z;
      seeds[i] = r();
      speeds[i] = 0.6 + r() * 1.6;
    }

    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    g.setAttribute('aSpeed', new BufferAttribute(speeds, 1));
    this.spores = new Points(g, M.sporeMaterial);
    this.spores.renderOrder = 5;
    this.spores.frustumCulled = false;
    this.add(this.spores);
  }

  // -------------------------------------------------------------------------
  // Semeadura
  // -------------------------------------------------------------------------

  /** Um ponto só vale se está dentro do cômodo, longe da parede e fora dos móveis. */
  #valid(x, z, wallMargin, obstacleMargin) {
    if (!pointInPolygon(x, z, this.footprint)) return false;
    if (distanceToEdges(x, z, this.footprint) < wallMargin) return false;
    for (const ob of this.obstacles) {
      if (pointInPolygon(x, z, ob)) return false;
      if (obstacleMargin > 0 && distanceToEdges(x, z, ob) < obstacleMargin
        && pointInPolygon(x, z, ob)) return false;
    }
    return true;
  }

  /**
   * Amostragem por rejeição dentro do polígono. `gap` pode ser um número ou
   * uma função de (distância até a parede) — é assim que adensamos junto às
   * paredes e mantemos o miolo do cômodo livre para caminhar.
   */
  #scatter(r, count, gap, taken, { wallMargin = 0.2, obstacleMargin = 0 } = {}) {
    const b = polygonBounds(this.footprint);
    const out = [];
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 80; tries++) {
        const x = b.minX + r() * (b.maxX - b.minX);
        const z = b.minZ + r() * (b.maxZ - b.minZ);
        if (!this.#valid(x, z, wallMargin, obstacleMargin)) continue;

        const edge = distanceToEdges(x, z, this.footprint);
        const need = typeof gap === 'function' ? gap(edge) : gap;
        let ok = true;
        for (const t of taken) {
          if ((t.x - x) ** 2 + (t.z - z) ** 2 < need * need) { ok = false; break; }
        }
        if (!ok) continue;

        const pt = { x, z };
        taken.push(pt); out.push(pt);
        break;
      }
    }
    return out;
  }

  /** Perto da parede os troncos podem se aproximar; no meio, ficam bem afastados. */
  static trunkGap(edgeDistance) {
    const t = Math.min(1, edgeDistance / WALK.openFrom);
    return WALK.trunkGapWall + (WALK.trunkGapOpen - WALK.trunkGapWall) * t;
  }

  seed(seedValue) {
    if (!this.footprint) return this;
    const r = rng(seedValue);
    this.seedValue = seedValue;
    this.growing.length = 0;
    for (const sp of this.species) sp.set.clear();
    this.mushrooms.clear(); this.crystals.clear(); this.grass.clear(); this.orbs.clear();

    const area = polygonArea(this.footprint);
    const n = (per, cap) => Math.min(cap, Math.max(3, Math.round(area * per)));
    const trunks = [];   // só troncos entram aqui: é o que precisa de folga

    // Árvores, distribuídas em rodízio entre as três espécies.
    const spots = this.#scatter(r, n(PER_M2.tree, CAPACITY.tree), Forest.trunkGap, trunks, {
      wallMargin: WALK.wallMargin,
      obstacleMargin: WALK.obstacleMargin,
    });
    spots.forEach((pt, i) => {
      const sp = this.species[i % this.species.length];
      const s = 0.88 + r() * 0.42;
      _p.set(pt.x, 0, pt.z);
      _q.setFromAxisAngle(_up, r() * Math.PI * 2);
      _s.set(s, s * (0.92 + r() * 0.3), s);
      sp.set.add(_p, _q, _s);
    });
    for (const sp of this.species) sp.set.flush();

    // Cristais: altos o bastante para atrapalhar, então respeitam os troncos.
    for (const pt of this.#scatter(r, n(PER_M2.crystal, CAPACITY.crystal), 0.8, trunks, {
      wallMargin: 0.3,
    })) {
      const s = 0.4 + r() * 0.85;
      _p.set(pt.x, 0, pt.z);
      _q.setFromAxisAngle(new Vector3(r() - 0.5, 2, r() - 0.5).normalize(), r() * Math.PI * 2);
      _s.set(s, s * (0.7 + r() * 1.1), s);
      this.crystals.add(_p, _q, _s);
    }
    this.crystals.flush();

    // Cogumelos: baixos, você passa por cima — lista de espaçamento própria.
    const lowStuff = [];
    for (const pt of this.#scatter(r, n(PER_M2.mushroom, CAPACITY.mushroom), 0.34, lowStuff, {
      wallMargin: 0.12,
    })) {
      const s = 0.35 + r() * 0.5;   // chapéu de 0,15 a 0,36 m de raio
      _p.set(pt.x, 0, pt.z);
      _q.setFromAxisAngle(_up, r() * Math.PI * 2);
      _s.set(s, s * (0.8 + r() * 0.6), s);
      this.mushrooms.add(_p, _q, _s);
    }
    this.mushrooms.flush();

    // Capim: sem checagem de distância, só precisa cair dentro do cômodo.
    const b = polygonBounds(this.footprint);
    const wanted = n(PER_M2.grass, CAPACITY.grass);
    for (let i = 0, guard = 0; i < wanted && guard < wanted * 12; guard++) {
      const x = b.minX + r() * (b.maxX - b.minX);
      const z = b.minZ + r() * (b.maxZ - b.minZ);
      if (!pointInPolygon(x, z, this.footprint)) continue;
      const s = 0.6 + r() * 0.9;
      _p.set(x, 0, z);
      _q.setFromAxisAngle(_up, r() * Math.PI * 2);
      _s.set(1, s, 1);
      this.grass.add(_p, _q, _s);
      i++;
    }
    this.grass.flush();

    // Orbes: pairam acima da cabeça, sem restrição de piso.
    const orbCount = n(PER_M2.orb, CAPACITY.orb);
    for (let i = 0, guard = 0; i < orbCount && guard < orbCount * 12; guard++) {
      const x = b.minX + r() * (b.maxX - b.minX);
      const z = b.minZ + r() * (b.maxZ - b.minZ);
      if (!pointInPolygon(x, z, this.footprint)) continue;
      const s = 0.5 + r() * 1.4;
      _p.set(x, 1.7 + r() * 1.6, z);
      _q.identity();
      _s.set(s, s, s);
      this.orbs.add(_p, _q, _s);
      i++;
    }
    this.orbs.flush();

    return this;
  }

  /** O ponto está dentro do cômodo mapeado? Usado antes de plantar. */
  accepts(local) {
    return !!this.footprint
      && pointInPolygon(local.x, local.z, this.footprint)
      && distanceToEdges(local.x, local.z, this.footprint) >= WALK.wallMargin;
  }

  /**
   * Distância do ponto ao tronco mais próximo. `skip` exclui a própria árvore
   * que está na mão — senão ela sempre se veria como obstáculo de si mesma.
   */
  #nearestTrunk(x, z, skip = null) {
    let best = Infinity;
    for (const sp of this.species) {
      for (let i = 0; i < sp.set.count; i++) {
        if (skip && skip.set === sp.set && skip.idx === i) continue;
        sp.set.meshes[0].getMatrixAt(i, _m);
        const dx = _m.elements[12] - x, dz = _m.elements[14] - z;
        best = Math.min(best, Math.hypot(dx, dz));
      }
    }
    return best;
  }

  /**
   * Planta uma árvore em `local`. Recusa se o ponto ficar perto demais de um
   * tronco existente — senão o usuário fecha o próprio caminho sem perceber.
   * Devolve 'ok' | 'fora' | 'apertado' | 'cheio'.
   */
  plant(local, r = Math.random) {
    if (!this.accepts(local)) return 'fora';

    const edge = distanceToEdges(local.x, local.z, this.footprint);
    if (this.#nearestTrunk(local.x, local.z) < Forest.trunkGap(edge) * 0.8) return 'apertado';

    const order = [0, 1, 2].sort(() => r() - 0.5);
    const idxSpecies = order.find((i) => this.species[i].set.count < CAPACITY.tree);
    if (idxSpecies === undefined) return 'cheio';
    const sp = this.species[idxSpecies];

    const s = 0.88 + r() * 0.42;
    const pos = new Vector3(local.x, 0, local.z);
    const quat = new Quaternion().setFromAxisAngle(_up, r() * Math.PI * 2);
    const scale = new Vector3(s, s * (0.92 + r() * 0.3), s);
    const idx = sp.set.add(pos, quat, scale);
    if (idx < 0) return 'cheio';

    this.#tween(sp.set, idx,
      { pos, quat, scale: new Vector3(0.001, 0.001, 0.001) }, { pos, quat, scale });

    for (let i = 0; i < 3 && this.mushrooms.count < CAPACITY.mushroom; i++) {
      const a = r() * Math.PI * 2, d = 0.3 + r() * 0.5;
      const mp = new Vector3(local.x + Math.cos(a) * d, 0, local.z + Math.sin(a) * d);
      if (!this.accepts(mp)) continue;
      const ms = 0.35 + r() * 0.5;
      const mq = new Quaternion().setFromAxisAngle(_up, r() * Math.PI * 2);
      const msc = new Vector3(ms, ms, ms);
      const mi = this.mushrooms.add(mp, mq, msc);
      if (mi >= 0) {
        this.#tween(this.mushrooms, mi,
          { pos: mp, quat: mq, scale: new Vector3(0.001, 0.001, 0.001) },
          { pos: mp, quat: mq, scale: msc });
      }
    }
    return 'ok';
  }

  // -------------------------------------------------------------------------
  // Animação
  // -------------------------------------------------------------------------

  /**
   * Interpola uma instância de um estado a outro. Plantar é um caso particular
   * (escala 0 -> cheia); replantar e voltar para o lugar de origem usam o mesmo
   * caminho, o que evita três sistemas de animação fazendo quase a mesma coisa.
   */
  #tween(set, idx, from, to, dur = 0.9, bounce = true) {
    // Um alvo novo para a mesma instância cancela o anterior.
    const at = this.growing.findIndex((g) => g.set === set && g.idx === idx);
    if (at >= 0) this.growing.splice(at, 1);
    this.growing.push({ set, idx, from, to, t: 0, dur, bounce });
  }

  /** Estado atual de uma instância, como objeto solto. */
  #snapshot(set, idx) {
    const pos = new Vector3(), quat = new Quaternion(), scale = new Vector3();
    set.read(idx, pos, quat, scale);
    return { pos, quat, scale };
  }

  update(dt) {
    if (!this.growing.length) return;
    const touched = new Set();

    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      g.t = Math.min(1, g.t + dt / g.dur);

      let k = 1 - Math.pow(1 - g.t, 3);
      if (g.bounce) k += Math.sin(g.t * Math.PI) * 0.18 * (1 - g.t);

      _p.copy(g.from.pos).lerp(g.to.pos, k);
      _q.copy(g.from.quat).slerp(g.to.quat, Math.min(1, k));
      _s.copy(g.from.scale).lerp(g.to.scale, k);
      g.set.write(g.idx, _p, _q, _s);

      touched.add(g.set);
      if (g.t >= 1) this.growing.splice(i, 1);
    }
    for (const set of touched) set.flush();
  }

  // -------------------------------------------------------------------------
  // Pegar com as mãos
  // -------------------------------------------------------------------------

  /**
   * O que está ao alcance de `local`, se houver. Cogumelo e cristal são
   * pegos pelo corpo (distância 3D); árvore é pega pelo tronco, então a
   * distância é medida no plano — você agarra o tronco na altura que quiser.
   */
  pick(local) {
    const inv = 1 / (this.scale.x || 1);
    let best = null, bestD = Infinity;

    const consider = (kind, set, idx, dist, limit) => {
      if (dist >= limit || dist >= bestD) return;
      if (this.#isHeld(set, idx)) return;
      bestD = dist;
      best = { kind, set, idx };
    };

    const body = [
      ['mushroom', this.mushrooms, 0.60, 0.30 * inv],
      ['crystal', this.crystals, 0.66, 0.32 * inv],
    ];
    for (const [kind, set, hFrac, limit] of body) {
      for (let i = 0; i < set.count; i++) {
        set.read(i, _p, _q, _s);
        _p.y += hFrac * _s.y;
        consider(kind, set, i, _p.distanceTo(local), limit);
      }
    }

    const treeLimit = 0.34 * inv;
    for (const sp of this.species) {
      for (let i = 0; i < sp.set.count; i++) {
        sp.set.read(i, _p, _q, _s);
        if (local.y < 0.15 || local.y > 2.3 * _s.y) continue;
        consider('tree', sp.set, i, Math.hypot(_p.x - local.x, _p.z - local.z), treeLimit);
      }
    }
    return best;
  }

  #isHeld(set, idx) {
    for (const h of this.held) if (h.set === set && h.idx === idx) return true;
    return false;
  }

  /** Mostra a casca de realce sobre um alvo (ou esconde tudo com null). */
  highlight(target) {
    for (const h of Object.values(this.highlights)) h.visible = false;
    if (!target) return;
    const mesh = this.highlights[target.kind];
    if (!mesh) return;
    target.set.read(target.idx, _p, _q, _s);
    mesh.position.copy(_p);
    mesh.quaternion.copy(_q);
    mesh.scale.copy(_s);
    mesh.visible = true;
  }

  /** Arranca o objeto do chão. Devolve a alça usada em carry/drop. */
  lift(target) {
    const home = this.#snapshot(target.set, target.idx);
    const handle = { ...target, home, carried: home.scale.clone().multiplyScalar(0.42) };
    this.held.add(handle);
    // Cancela qualquer animação pendente: a mão manda agora.
    const at = this.growing.findIndex((g) => g.set === handle.set && g.idx === handle.idx);
    if (at >= 0) this.growing.splice(at, 1);
    return handle;
  }

  /** Faz o objeto seguir a mão, encolhido e girando devagar. */
  carry(handle, local, spin = 0) {
    _q.copy(handle.home.quat);
    _p.set(0, 1, 0);
    _q.multiply(new Quaternion().setFromAxisAngle(_p, spin));
    handle.set.write(handle.idx, local, _q, handle.carried);
    handle.set.flush();
  }

  /**
   * Solta em `local`. Replanta ali se couber; senão devolve ao lugar de origem.
   * Devolve 'plantado' | 'devolvido'.
   */
  drop(handle, local) {
    this.held.delete(handle);
    const ground = new Vector3(local.x, 0, local.z);

    const fits = this.accepts(ground)
      && (handle.kind !== 'tree'
        || this.#nearestTrunk(ground.x, ground.z, handle) >= Forest.trunkGap(
          distanceToEdges(ground.x, ground.z, this.footprint)) * 0.8);

    const from = this.#snapshot(handle.set, handle.idx);
    const to = fits
      ? { pos: ground, quat: handle.home.quat, scale: handle.home.scale }
      : handle.home;

    this.#tween(handle.set, handle.idx, from, to, fits ? 0.45 : 0.7);
    return fits ? 'plantado' : 'devolvido';
  }

  get treeCount() { return this.species.reduce((n, sp) => n + sp.set.count, 0); }

  get triangleCount() {
    let n = 0;
    this.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const g = o.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      n += tris * (o.isInstancedMesh ? o.count : 1);
    });
    return Math.round(n);
  }

  dispose() {
    for (const sp of this.species) sp.set.dispose();
    this.mushrooms.dispose(); this.crystals.dispose();
    this.grass.dispose(); this.orbs.dispose();
    this.ground?.geometry.dispose();
    this.spores?.geometry.dispose();
    this.clear();
  }
}
