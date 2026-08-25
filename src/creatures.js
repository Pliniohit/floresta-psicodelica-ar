import {
  Group, InstancedMesh, BufferGeometry, BufferAttribute, IcosahedronGeometry,
  Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { butterflyMaterial, fireflyMaterial } from './shaders/materials.js';
import { rng } from './forest.js';

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Borboletas
// ---------------------------------------------------------------------------

/**
 * Uma borboleta: corpo fino e duas asas de dois triângulos cada. Os atributos
 * `aWing` e `aSpan` dizem ao vertex shader qual asa é e a que distância da
 * dobradiça o vértice está — é o que permite a asa flexionar ao bater.
 */
function butterflyGeometry() {
  const pos = [], wing = [], span = [];

  const tri = (a, b, c, w, spans) => {
    pos.push(...a, ...b, ...c);
    wing.push(w, w, w);
    span.push(...spans);
  };

  // corpo: um losango estreito ao longo de Y
  tri([0, -0.035, 0], [0.006, 0.035, 0], [-0.006, 0.035, 0], 0, [0, 0, 0]);

  for (const lado of [-1, 1]) {
    const x = (v) => v * lado;
    // asa dianteira, maior
    tri([0, 0.020, 0], [x(0.052), 0.034, 0.004], [x(0.044), -0.004, 0.002], lado, [0, 1, 0.8]);
    // asa traseira, menor
    tri([0, 0.004, 0], [x(0.044), -0.004, 0.002], [x(0.030), -0.036, 0.004], lado, [0, 0.8, 0.7]);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aWing', new BufferAttribute(new Float32Array(wing), 1));
  g.setAttribute('aSpan', new BufferAttribute(new Float32Array(span), 1));
  g.computeVertexNormals();
  return g;
}

/**
 * Enxame de borboletas vagando pela clareira.
 *
 * O caminho de cada uma é a soma de duas senóides de frequências que não são
 * múltiplas — o padrão leva minutos para se repetir, então o voo não fica
 * obviamente cíclico como uma órbita simples ficaria.
 */
export class Butterflies extends Group {
  constructor(count = 22) {
    super();
    this.name = 'borboletas';
    this.frustumCulled = false;

    this.mesh = new InstancedMesh(butterflyGeometry(), butterflyMaterial, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.count = 0;
    this.add(this.mesh);

    this.count = count;
    this.paths = [];
    this.radius = 3.0;
    this._prev = [];

    const r = rng(20260824);
    for (let i = 0; i < count; i++) {
      this.paths.push({
        cx: 0, cz: 0,
        rx: 0.5 + r() * 0.9, rz: 0.5 + r() * 0.9,
        wx: 0.14 + r() * 0.22, wz: 0.11 + r() * 0.25,
        px: r() * 6.28, pz: r() * 6.28,
        alt: 0.7 + r() * 1.5, bob: 0.15 + r() * 0.35, wb: 0.5 + r() * 0.9,
        escala: 0.75 + r() * 0.7,
      });
      this._prev.push(new Vector3());
    }
  }

  /** Redistribui os centros de voo dentro do cômodo recém-lido. */
  fitTo(radius) {
    this.radius = Math.max(1.0, radius);
    const r = rng(97 + Math.round(radius * 100));
    for (const p of this.paths) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * this.radius * 0.7;
      p.cx = Math.cos(a) * d;
      p.cz = Math.sin(a) * d;
    }
    this.mesh.count = this.count;
  }

  update(t) {
    if (!this.mesh.count) return;
    for (let i = 0; i < this.count; i++) {
      const p = this.paths[i];
      const x = p.cx + Math.cos(t * p.wx + p.px) * p.rx + Math.sin(t * p.wx * 2.3 + p.pz) * p.rx * 0.35;
      const z = p.cz + Math.sin(t * p.wz + p.pz) * p.rz + Math.cos(t * p.wz * 1.9 + p.px) * p.rz * 0.35;
      const y = p.alt + Math.sin(t * p.wb + p.px) * p.bob;
      _p.set(x, y, z);

      // Aponta para onde está indo: a direção sai do próprio deslocamento,
      // sem precisar derivar a curva analiticamente.
      _dir.copy(_p).sub(this._prev[i]);
      this._prev[i].copy(_p);
      if (_dir.lengthSq() > 1e-8) {
        _dir.normalize();
        _q.setFromUnitVectors(_up, _dir);
      }

      _s.setScalar(p.escala);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.clear(); }
}

// ---------------------------------------------------------------------------
// Vaga-lumes
// ---------------------------------------------------------------------------

/**
 * Enxame que orbita um alvo. Usado de duas formas: preso ao corpo inferido do
 * próprio usuário, e solto num ponto onde ele "abençoou" alguém.
 *
 * O alvo é seguido com atraso, então o enxame se estica ao acompanhar um
 * movimento rápido e volta a se juntar quando ele para — que é como um bando
 * de verdade se comporta.
 */
export class Fireflies extends Group {
  constructor(count = 26, seed = 7) {
    super();
    this.name = 'vagalumes';
    this.frustumCulled = false;

    this.mesh = new InstancedMesh(new IcosahedronGeometry(0.016, 0), fireflyMaterial, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.count = count;
    this.add(this.mesh);

    this.count = count;
    this.target = new Vector3();
    this.follow = new Vector3();
    this.height = 1.0;
    this.spread = 0.55;

    const r = rng(seed);
    this.orbits = Array.from({ length: count }, () => ({
      raio: 0.28 + r() * 0.55,
      alt: r() * 1.35,
      fase: r() * Math.PI * 2,
      vel: 0.35 + r() * 0.75,
      bob: 0.06 + r() * 0.16,
      wb: 0.7 + r() * 1.6,
      inc: (r() - 0.5) * 0.5,
    }));
  }

  setTarget(v) { this.target.copy(v); return this; }
  snapTo(v) { this.target.copy(v); this.follow.copy(v); return this; }

  update(t, dt) {
    // Atraso: o bando se estica ao seguir e se junta ao parar.
    this.follow.lerp(this.target, 1 - Math.exp(-dt * 2.4));

    for (let i = 0; i < this.count; i++) {
      const o = this.orbits[i];
      const a = o.fase + t * o.vel;
      _p.set(
        this.follow.x + Math.cos(a) * o.raio * this.spread / 0.55,
        this.follow.y + o.alt * this.height + Math.sin(t * o.wb + o.fase) * o.bob,
        this.follow.z + Math.sin(a) * o.raio * (1 + o.inc) * this.spread / 0.55,
      );
      _q.identity();
      _s.setScalar(1);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.clear(); }
}
