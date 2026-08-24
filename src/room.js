import {
  Group, Mesh, BufferGeometry, BufferAttribute, Matrix4, Vector2, Vector3,
} from '../vendor/three/three.module.min.js';
import { reticleRing } from './geometry.js';
import { reticleMaterial } from './shaders/materials.js';

/** Lado da área quadrada criada quando o espaço vem de um toque no chão. */
const TAP_AREA = 3.5;

// ---------------------------------------------------------------------------
// Geometria de polígono (tudo no plano XZ, em metros)
// ---------------------------------------------------------------------------

/** Ray casting padrão. `poly` é um array de Vector2 com (x, z). */
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > z) !== (b.y > z)
      && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Área com sinal — o valor absoluto é a área, o sinal dá a orientação. */
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(s) / 2;
}

export function polygonBounds(poly) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of poly) {
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
    b.minZ = Math.min(b.minZ, p.y); b.maxZ = Math.max(b.maxZ, p.y);
  }
  return b;
}

export function polygonCentroid(poly) {
  const c = new Vector2();
  for (const p of poly) c.add(p);
  return c.divideScalar(poly.length || 1);
}

/** Menor distância de (x, z) até qualquer aresta do polígono. */
export function distanceToEdges(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].x, az = poly[j].y, bx = poly[i].x, bz = poly[i].y;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    const px = ax + t * dx, pz = az + t * dz;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

/** Retângulo usado quando o headset não oferece nenhuma geometria de sala. */
export function fallbackRoom(center = new Vector2(0, 0), w = 4.0, d = 4.0) {
  const hw = w / 2, hd = d / 2;
  return [
    new Vector2(center.x - hw, center.y - hd),
    new Vector2(center.x + hw, center.y - hd),
    new Vector2(center.x + hw, center.y + hd),
    new Vector2(center.x - hw, center.y + hd),
  ];
}

// ---------------------------------------------------------------------------
// Visualização do espaço durante o mapeamento
// ---------------------------------------------------------------------------

/**
 * Fita plana seguindo uma polilinha no plano XZ. Usada em vez de LineSegments
 * porque a espessura de linha é travada em 1 px na maioria das plataformas,
 * e 1 px praticamente some num headset.
 */
function ribbon(poly, width = 0.035, y = 0.02, closed = true) {
  const verts = [];
  const n = poly.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b.x - a.x, dz = b.y - a.y;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * width, nz = (dx / len) * width;
    verts.push(
      a.x - nx, y, a.y - nz, b.x - nx, y, b.y - nz, b.x + nx, y, b.y + nz,
      a.x - nx, y, a.y - nz, b.x + nx, y, b.y + nz, a.x + nx, y, a.y + nz,
    );
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Aresta inferior de um plano vertical: os dois vértices mais baixos, que
 * juntos dão a linha onde a parede encontra o chão. É por ali que as
 * trepadeiras começam a subir.
 */
function lowestEdge(points) {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.y - b.y);
  const [a, b] = sorted;
  if (Math.hypot(a.x - b.x, a.z - b.z) < 0.25) return null;   // degenerado
  return { a: new Vector2(a.x, a.z), b: new Vector2(b.x, b.z), y: (a.y + b.y) / 2 };
}

// ---------------------------------------------------------------------------
// Captura do espaço
// ---------------------------------------------------------------------------

const HORIZONTAL = 'horizontal';
const FLOOR_LABELS = new Set(['floor']);
const OBSTACLE_LABELS = new Set(['table', 'couch', 'bed', 'desk', 'shelf', 'screen', 'other']);

/** Superfícies onde vale fazer musgo e cogumelos brotarem por cima. */
const COLONIZABLE = new Set(['table', 'couch', 'bed', 'desk', 'shelf', 'cabinet', 'other']);

/**
 * Lê as superfícies que o usuário já mapeou no Space Setup do Quest e monta:
 *   - `footprint`  polígono caminhável do chão, em Vector2(x, z)
 *   - `obstacles`  polígonos de móveis, para não plantar dentro do sofá
 *   - `floorY`     altura do piso no espaço de referência
 *   - `ceilingY`   altura do teto, quando detectada
 *
 * Se o Space Setup nunca foi feito, cai para `bounded-floor` (o limite do
 * guardian) e, em último caso, para um retângulo à frente do usuário.
 */
export class RoomScan {
  constructor() {
    this.footprint = null;
    this.obstacles = [];
    this.surfaces = [];    // tampos de móveis, para colonizar por cima
    this.wallBases = [];   // linha pé-de-parede, para trepadeiras
    this.floorY = 0;
    this.ceilingY = null;
    this.source = 'nenhuma';
    this.planeCount = 0;
    this.revision = 0;

    this.view = new Group();
    this.view.name = 'mapeamento';
    this.view.visible = false;
    this.view.frustumCulled = false;

    this._signature = '';
    this._boundedSpace = null;
    this._hitTestSource = null;
    this.hitPoint = null;      // pose viva do retículo, enquanto não confirmado

    // Retículo de mira: no celular é ele que diz onde a floresta vai nascer.
    this.reticle = new Mesh(reticleRing(0.26), reticleMaterial);
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.reticle.frustumCulled = false;
    this.reticle.renderOrder = 10;
    this.view.add(this.reticle);
  }

  /**
   * Prepara as fontes que precisam de await. Nenhuma é obrigatória: um Quest
   * com Space Setup usa planos, um celular Android usa hit-test, e o que
   * sobrar cai no bounded-floor ou na área padrão.
   */
  async prepare(session) {
    try {
      this._boundedSpace = await session.requestReferenceSpace('bounded-floor');
    } catch {
      this._boundedSpace = null;
    }
    try {
      const viewer = await session.requestReferenceSpace('viewer');
      this._hitTestSource = await session.requestHitTestSource({ space: viewer });
    } catch {
      this._hitTestSource = null;
    }
  }

  /**
   * Chamado a cada frame durante o mapeamento. A ordem é deliberada: planos
   * primeiro porque descrevem a sala inteira, hit-test depois porque só dá um
   * ponto, e bounded-floor por último porque costuma ser mais largo que o
   * cômodo real.
   */
  update(frame, refSpace) {
    if (!frame || !refSpace) return false;
    if (this.#fromPlanes(frame, refSpace)) return true;
    this.#updateReticle(frame, refSpace);
    if (this.hitPoint) return false;       // esperando o toque do usuário
    return this.#fromBounds(frame, refSpace);
  }

  /** Mira do hit-test: só desenha o anel, não decide nada sozinha. */
  #updateReticle(frame, refSpace) {
    if (!this._hitTestSource) { this.hitPoint = null; return; }
    const hits = frame.getHitTestResults(this._hitTestSource);
    const pose = hits.length ? hits[0].getPose(refSpace) : null;
    if (!pose) {
      this.reticle.visible = false;
      this.hitPoint = null;
      return;
    }
    this.reticle.matrix.fromArray(pose.transform.matrix);
    this.reticle.visible = true;
    const p = pose.transform.position;
    this.hitPoint = new Vector3(p.x, p.y, p.z);
  }

  /** Converte o ponto mirado num quadrado de piso. Devolve false se não há mira. */
  commitFromReticle() {
    if (!this.hitPoint) return false;
    this.footprint = fallbackRoom(new Vector2(this.hitPoint.x, this.hitPoint.z), TAP_AREA, TAP_AREA);
    this.floorY = this.hitPoint.y;
    this.obstacles = [];
    this.surfaces = [];
    this.wallBases = [];
    this.source = 'toque no chão';
    this.reticle.visible = false;
    this.#rebuildView([]);
    this.revision++;
    return true;
  }

  /** Há mira viva esperando confirmação? */
  get aiming() { return !!this.hitPoint && !this.footprint; }

  /** O runtime concedeu hit-test? Muda o que pedimos ao usuário. */
  get hasHitTest() { return !!this._hitTestSource; }

  #fromPlanes(frame, refSpace) {
    const planes = frame.detectedPlanes;
    if (!planes || planes.size === 0) return false;

    // Assinatura barata: só reconstruímos quando algo realmente mudou.
    let sig = `${planes.size}`;
    for (const p of planes) sig += `|${p.lastChangedTime}`;
    if (sig === this._signature) return !!this.footprint;
    this._signature = sig;
    this.planeCount = planes.size;

    const horizontals = [];
    const verticals = [];

    for (const plane of planes) {
      const pose = frame.getPose(plane.planeSpace, refSpace);
      if (!pose || !plane.polygon?.length) continue;
      const m = new Matrix4().fromArray(pose.transform.matrix);
      const pts3 = plane.polygon.map((p) => new Vector3(p.x, p.y, p.z).applyMatrix4(m));
      const poly = pts3.map((p) => new Vector2(p.x, p.z));
      const y = pts3.reduce((a, p) => a + p.y, 0) / pts3.length;
      const entry = { plane, poly, y, area: polygonArea(poly), label: plane.semanticLabel };
      if (plane.orientation === HORIZONTAL) {
        horizontals.push(entry);
      } else {
        entry.base = lowestEdge(pts3);
        verticals.push(entry);
      }
    }

    if (!horizontals.length) return !!this.footprint;

    // Chão: rótulo explícito quando existe; senão, o maior plano horizontal baixo.
    const labelled = horizontals.filter((h) => FLOOR_LABELS.has(h.label));
    const low = horizontals.filter((h) => h.y < 0.35);
    const pool = labelled.length ? labelled : (low.length ? low : horizontals);
    const floor = pool.reduce((a, b) => (b.area > a.area ? b : a));

    this.floorY = floor.y;
    this.footprint = floor.poly;
    this.source = labelled.length ? 'Space Setup' : 'planos detectados';

    const ceil = horizontals.filter((h) => h.y > this.floorY + 1.7)
      .sort((a, b) => a.y - b.y)[0];
    this.ceilingY = ceil ? ceil.y : null;

    // Móveis: horizontais acima do chão e abaixo da altura do peito.
    const furniture = horizontals
      .filter((h) => h !== floor && h.y > this.floorY + 0.12 && h.y < this.floorY + 1.5)
      .filter((h) => !h.label || OBSTACLE_LABELS.has(h.label));
    this.obstacles = furniture.map((h) => h.poly);

    // Tampos onde a floresta pode subir: a mesma geometria, mas guardada com
    // a altura, porque aqui a intenção é plantar EM CIMA e não desviar.
    this.surfaces = furniture
      .filter((h) => !h.label || COLONIZABLE.has(h.label))
      .map((h) => ({ poly: h.poly, y: h.y, label: h.label ?? 'other', area: h.area }));

    // Base das paredes, para trepadeiras subirem. Guardamos o segmento mais
    // baixo de cada plano vertical.
    this.wallBases = verticals
      .filter((v) => !v.label || v.label === 'wall' || v.label === 'wall_face')
      .map((v) => v.base)
      .filter(Boolean);

    this.#rebuildView(verticals);
    this.revision++;
    return true;
  }

  /** Sem Space Setup: usa o polígono do guardian. */
  #fromBounds(frame, refSpace) {
    if (this.footprint) return true;
    const space = this._boundedSpace;
    const bounds = space?.boundsGeometry;
    if (!bounds?.length) return false;

    const pose = frame.getPose(space, refSpace);
    if (!pose) return false;
    const m = new Matrix4().fromArray(pose.transform.matrix);
    const poly = bounds.map((p) => {
      const v = new Vector3(p.x, p.y, p.z).applyMatrix4(m);
      return new Vector2(v.x, v.z);
    });
    if (polygonArea(poly) < 1.0) return false;

    this.footprint = poly;
    this.floorY = 0;
    this.obstacles = [];
    this.surfaces = [];
    this.wallBases = [];
    this.source = 'limite do guardian';
    this.#rebuildView([]);
    this.revision++;
    return true;
  }

  /** Último recurso, quando nada foi detectado e o usuário quis começar mesmo assim. */
  useFallback(center) {
    this.footprint = fallbackRoom(center, 4.0, 4.0);
    this.floorY = 0;
    this.obstacles = [];
    this.surfaces = [];
    this.wallBases = [];
    this.source = 'área padrão';
    this.#rebuildView([]);
    this.revision++;
  }

  #rebuildView(verticals) {
    for (const child of [...this.view.children]) {
      if (child === this.reticle) continue;   // o retículo é permanente
      child.geometry.dispose();
      this.view.remove(child);
    }
    if (!this.footprint) return;

    const outline = new Mesh(ribbon(this.footprint, 0.04, this.floorY + 0.015), reticleMaterial);
    outline.frustumCulled = false;
    this.view.add(outline);

    for (const ob of this.obstacles) {
      const m = new Mesh(ribbon(ob, 0.025, this.floorY + 0.02), reticleMaterial);
      m.frustumCulled = false;
      this.view.add(m);
    }

    // Rodapé das paredes: dá a sensação de que a sala foi realmente lida.
    for (const w of verticals.slice(0, 12)) {
      const m = new Mesh(ribbon(w.poly, 0.02, this.floorY + 0.01, false), reticleMaterial);
      m.frustumCulled = false;
      this.view.add(m);
    }
  }

  /**
   * Esquece tudo que foi lido. Usado depois de um reescaneamento: a geometria
   * antiga não vale mais, e manter a assinatura faria a leitura nova ser
   * descartada como "nada mudou".
   */
  reset() {
    this.footprint = null;
    this.obstacles = [];
    this.surfaces = [];
    this.wallBases = [];
    this.hitPoint = null;
    this.planeCount = 0;
    this.source = 'nenhuma';
    this._signature = '';
    for (const c of [...this.view.children]) {
      if (c === this.reticle) continue;
      c.geometry.dispose();
      this.view.remove(c);
    }
  }

  get area() { return this.footprint ? polygonArea(this.footprint) : 0; }
  get ready() { return !!this.footprint && this.area > 0.8; }

  dispose() {
    for (const c of [...this.view.children]) c.geometry.dispose();
    this.view.clear();
    this._hitTestSource = null;
  }
}
