import {
  Group, Mesh, InstancedMesh, SphereGeometry, IcosahedronGeometry,
  Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { skyMaterial, skyLifeMaterial } from './shaders/materials.js';
import { rng } from './forest.js';

/**
 * Céu psicodélico visível ao olhar para cima.
 *
 * O raio é grande o bastante para a cúpula nunca ser atravessada dentro de um
 * cômodo, mas fica dentro do `far` da câmera. Ela acompanha a cabeça do usuário
 * em posição — nunca em rotação — para que caminhar não aproxime o horizonte,
 * que é como céu se comporta.
 *
 * A opacidade cresce com a elevação do olhar (ver `skyMaterial`): à frente o
 * cômodo real continua lá, e o céu só domina quando você levanta a cabeça.
 */

const RADIUS = 40;
const MEDUSAS = 16;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _axis = new Vector3(0, 1, 0);

export class Sky extends Group {
  constructor() {
    super();
    this.name = 'ceu';
    this.frustumCulled = false;

    // Poucos segmentos: o shader é todo direcional, a malha só precisa
    // envolver o usuário sem facetar visivelmente.
    this.dome = new Mesh(new SphereGeometry(RADIUS, 32, 20), skyMaterial);
    this.dome.frustumCulled = false;
    // Antes do oclusor (-1000), senão o teto real apaga o céu inteiro.
    this.dome.renderOrder = -2000;
    this.add(this.dome);

    // Medusas à deriva: dão movimento e escala ao céu. Sem elas o céu é bonito
    // mas estático, e olhar para cima cansa rápido.
    this.medusas = new InstancedMesh(
      new IcosahedronGeometry(1, 1), skyLifeMaterial, MEDUSAS);
    this.medusas.frustumCulled = false;
    this.medusas.renderOrder = -1999;   // logo após a cúpula, ainda antes do oclusor
    this.add(this.medusas);

    this.drift = [];
    const r = rng(4711);
    for (let i = 0; i < MEDUSAS; i++) {
      this.drift.push({
        raio: 9 + r() * 16,
        altura: 6 + r() * 13,
        fase: r() * Math.PI * 2,
        vel: 0.010 + r() * 0.028,
        escala: 0.35 + r() * 1.15,
        pulso: 0.22 + r() * 0.55,
      });
    }
    this.medusas.count = MEDUSAS;
  }

  /** @param {number} t tempo decorrido  @param {THREE.Vector3} head posição da cabeça */
  update(t, head) {
    // Segue a cabeça em posição: andar não deve aproximar o horizonte.
    this.position.set(head.x, 0, head.z);

    for (let i = 0; i < MEDUSAS; i++) {
      const d = this.drift[i];
      const a = d.fase + t * d.vel;
      const respira = 1 + Math.sin(t * d.pulso + d.fase) * 0.22;
      _p.set(Math.cos(a) * d.raio, d.altura + Math.sin(a * 1.7) * 1.4, Math.sin(a) * d.raio);
      _q.setFromAxisAngle(_axis, a * 1.5);
      _s.set(d.escala * respira, d.escala * (2 - respira) * 0.75, d.escala * respira);
      _m.compose(_p, _q, _s);
      this.medusas.setMatrixAt(i, _m);
    }
    this.medusas.instanceMatrix.needsUpdate = true;
  }

  /** Liga e desliga com transição, mexendo no uniform em vez de em `visible`. */
  setEnabled(on) {
    this.enabled = on;
    return on;
  }

  get uniforms() { return skyMaterial.uniforms; }

  dispose() {
    this.dome.geometry.dispose();
    this.medusas.geometry.dispose();
    this.clear();
  }
}
