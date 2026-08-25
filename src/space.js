import {
  Group, Mesh, InstancedMesh, Points, BufferGeometry, BufferAttribute,
  SphereGeometry, TorusGeometry, Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { planetMaterial, trailMaterial } from './shaders/materials.js';
import { rng } from './forest.js';
import { biomes } from './biomes.js';

/**
 * A cena do espaço, para onde a borboleta leva.
 *
 * Planetas ficam ao alcance do braço de propósito: a graça é poder pegá-los.
 * Escala de brinquedo, distância de mesa — se estivessem em escala real seriam
 * pontos no céu e não haveria nada para fazer.
 *
 * E ficam PARADOS no mundo. A cúpula do céu acompanha a cabeça, porque céu não
 * se aproxima; planeta ao alcance da mão é o oposto — se ele te seguisse, você
 * nunca conseguiria dar a volta nele, e a cena inteira pareceria colada ao
 * rosto. Andar tem que aproximar.
 */

const PLANETS = 7;
/** Escala a partir da qual o planeta se abre e você atravessa para o mundo dele. */
export const ENTER_SCALE = 3.4;
const MIN_SCALE = 0.5;
const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

export class Space extends Group {
  constructor() {
    super();
    this.name = 'espaco';
    this.frustumCulled = false;
    this.visible = false;
    this.progress = 0;      // 0 floresta .. 1 espaço

    const r = rng(90210);
    this.planets = [];

    // Um único InstancedMesh não serve aqui: cada planeta precisa de matriz
    // própria mexida pela mão, e são só sete — sete draw calls é barato.
    for (let i = 0; i < PLANETS; i++) {
      const raio = 0.20 + r() * 0.40;   // tamanho de bola de praia: dá vontade de pegar
      // Material por planeta: cada um carrega a cor do bioma que guarda. O
      // programa de shader continua sendo um só, então o custo é de uniforms.
      const mat = planetMaterial.clone();
      const bioma = biomes[i % biomes.length];
      mat.uniforms.uTint.value = bioma.planetColor.clone();

      const corpo = new Mesh(new SphereGeometry(raio, 20, 14), mat);
      corpo.frustumCulled = false;

      const grupo = new Group();
      grupo.add(corpo);

      // Anéis em alguns, inclinados.
      if (r() < 0.4) {
        // Anel com o mesmo material do corpo: aditivo fazia o anel brilhar
        // e sumir conforme o ângulo, que lia como piscada.
        const anel = new Mesh(
          new TorusGeometry(raio * 1.9, raio * 0.045, 5, 36), mat);
        anel.rotation.x = Math.PI / 2 + (r() - 0.5) * 0.7;
        anel.rotation.z = (r() - 0.5) * 0.5;
        anel.frustumCulled = false;
        grupo.add(anel);
      }

      const orbita = {
        raio: 1.1 + r() * 1.7,     // ao alcance do braço, não no horizonte
        alt: 0.75 + r() * 1.35,
        fase: r() * Math.PI * 2,
        vel: 0.016 + r() * 0.040,
        giro: 0.06 + r() * 0.16,
        inclina: (r() - 0.5) * 0.6,
      };
      grupo.userData = { orbita, corpo, raio, preso: false, bioma: bioma.id, mat };
      this.planets.push(grupo);
      this.add(grupo);
    }

    // Sem campo de estrelas em Points aqui: pontos de um pixel numa casca
    // distante serrilham a cada movimento de cabeça, e era isso que fazia o
    // espaço piscar. As estrelas do espaço vêm do shader do céu, onde nascem
    // no centro de uma célula e somem suavemente na borda.
  }

  /** 0 esconde tudo, 1 mostra por inteiro. */
  setProgress(v) {
    this.progress = v;
    this.visible = v > 0.01;
    for (const g of this.planets) g.userData.mat.uniforms.uWarp.value = v;
    return v;
  }

  /**
   * Redimensiona o planeta na mão. Devolve true quando ele passa do limiar —
   * é o momento de atravessar para o mundo dele.
   */
  scaleHeld(planeta, fator) {
    const s = Math.min(ENTER_SCALE + 0.4, Math.max(MIN_SCALE, fator));
    planeta.scale.setScalar(s);
    // Acende conforme se aproxima do limiar.
    planeta.userData.mat.uniforms.uGrow.value =
      Math.max(0, (s - 1.6) / (ENTER_SCALE - 1.6));
    return s >= ENTER_SCALE;
  }

  /** Devolve todos os planetas ao tamanho normal. */
  resetScales() {
    for (const g of this.planets) {
      g.scale.setScalar(1);
      g.userData.mat.uniforms.uGrow.value = 0;
    }
  }

  update(t, dt) {
    if (!this.visible) return;

    for (const g of this.planets) {
      const o = g.userData.orbita;
      if (!g.userData.preso) {
        const a = o.fase + t * o.vel;
        g.position.set(
          Math.cos(a) * o.raio,
          o.alt + Math.sin(a * 1.6 + o.fase) * 0.35,
          Math.sin(a) * o.raio * (1 + o.inclina),
        );
      }
      g.userData.corpo.rotation.y = t * o.giro;
    }
  }

  /** Planeta ao alcance de `world`, ou null. */
  pick(world) {
    let melhor = null, dist = Infinity;
    for (const g of this.planets) {
      const d = g.getWorldPosition(_p).distanceTo(world);
      const limite = g.userData.raio * 1.9 + 0.12;
      if (d < limite && d < dist) { dist = d; melhor = g; }
    }
    return melhor;
  }

  lift(planeta) {
    planeta.userData.preso = true;
    return planeta;
  }

  carry(planeta, world) {
    this.worldToLocal(_p.copy(world));
    planeta.position.copy(_p);
  }

  /** Solta o planeta: ele volta à órbita a partir de onde foi deixado. */
  drop(planeta) {
    planeta.userData.preso = false;
    const o = planeta.userData.orbita;
    const p = planeta.position;
    o.raio = Math.max(0.9, Math.hypot(p.x, p.z));
    o.alt = Math.max(0.35, p.y);
    o.fase = Math.atan2(p.z, p.x);
  }

  dispose() {
    for (const g of this.planets) {
      g.traverse((o) => o.isMesh && o.geometry.dispose());
      g.userData.mat.dispose();
    }
    this.clear();
  }
}

/**
 * A borboleta que sai do casulo e sobe, deixando rastro de luz.
 *
 * O rastro é um anel de posições reaproveitado: o índice mais velho é
 * sobrescrito a cada emissão, então o buffer nunca cresce e não há alocação
 * durante a animação.
 */
export class Emergence extends Group {
  constructor(butterflyGeometry, butterflyMaterial, trailLength = 90) {
    super();
    this.name = 'eclosao';
    this.frustumCulled = false;
    this.visible = false;

    this.mesh = new Mesh(butterflyGeometry, butterflyMaterial);
    this.mesh.scale.setScalar(2.2);       // maior que as comuns: é a protagonista
    this.mesh.frustumCulled = false;
    this.add(this.mesh);

    this.n = trailLength;
    this.pos = new Float32Array(trailLength * 3);
    this.age = new Float32Array(trailLength).fill(1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aAge', new BufferAttribute(this.age, 1));
    this.trail = new Points(g, trailMaterial);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 12;
    this.add(this.trail);

    this.cursor = 0;
    this.t = 0;
    this.duration = 8.0;   // a subida da borboleta É a transição; sem pressa
    this.from = new Vector3();
    this.active = false;
  }

  /** Dispara a subida a partir de `origem` (mundo). */
  launch(origem) {
    this.from.copy(origem);
    this.t = 0;
    this.active = true;
    this.visible = true;
    this.age.fill(1);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = origem.x; this.pos[i * 3 + 1] = origem.y; this.pos[i * 3 + 2] = origem.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAge.needsUpdate = true;
  }

  /** @returns {number} 0..1 de quanto da subida já passou */
  update(dt, t) {
    if (!this.active) return 0;
    this.t = Math.min(1, this.t + dt / this.duration);

    // Sobe acelerando devagar, em espiral que abre com a altura. O expoente
    // 2,4 no lugar de 2 deixa o início mais demorado — ela hesita ao sair.
    const k = Math.pow(this.t, 2.4);
    const altura = k * 16;
    const giro = this.t * 5.5;
    const abre = 0.18 + this.t * 0.9;
    _p.set(
      this.from.x + Math.cos(giro) * abre,
      this.from.y + altura,
      this.from.z + Math.sin(giro) * abre,
    );
    this.mesh.position.copy(_p);
    this.mesh.rotation.y = giro + Math.PI / 2;
    this.mesh.rotation.z = Math.sin(t * 2.2) * 0.22;

    // Emite no anel, envelhecendo o resto.
    const i = this.cursor;
    this.pos[i * 3] = _p.x; this.pos[i * 3 + 1] = _p.y; this.pos[i * 3 + 2] = _p.z;
    this.age[i] = 0;
    this.cursor = (this.cursor + 1) % this.n;
    for (let j = 0; j < this.n; j++) this.age[j] = Math.min(1, this.age[j] + dt * 0.30);

    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAge.needsUpdate = true;

    if (this.t >= 1) { this.active = false; this.visible = false; }
    return this.t;
  }

  dispose() { this.trail.geometry.dispose(); this.clear(); }
}
