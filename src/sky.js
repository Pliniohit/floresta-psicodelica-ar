import {
  Group, Mesh, InstancedMesh, InstancedBufferAttribute, SphereGeometry,
  PlaneGeometry, TorusGeometry, Vector3,
} from '../vendor/three/three.module.min.js';
import { skyMaterial, meteorMaterial, planetMaterial, cloneMaterial } from './shaders/materials.js';
import { rng } from './forest.js';

/**
 * O CÉU DE NOITE.
 *
 * A cúpula é grande o bastante para nunca ser atravessada dentro de um cômodo,
 * mas cabe no `far` da câmera. Ela acompanha a cabeça em POSIÇÃO — nunca em
 * rotação — para que caminhar não aproxime o horizonte, que é como céu se
 * comporta.
 *
 * Três coisas moram nela:
 *
 * A CÚPULA, cujo shader desenha o gradiente da cena, o véu de nebulosa e três
 * densidades de estrela. A opacidade cresce com a elevação do olhar: à frente
 * o cômodo real continua lá.
 *
 * Os GIGANTES — planetas grandes o suficiente para se ver a olho nu, parados
 * em direções fixas do firmamento. São eles que dão escala ao céu; sem algo
 * com tamanho reconhecível lá em cima, a cúpula é só um fundo.
 *
 * As CADENTES, que atravessam de tempos em tempos. Cada uma tem o próprio
 * relógio dentro do shader, e como os períodos não têm razão simples entre si,
 * elas nunca caem juntas.
 */

const RADIUS = 40;

/** Um pouco à frente da cúpula, senão disputam profundidade com ela. */
const R_GIGANTE = RADIUS * 0.92;
const R_METEORO = RADIUS * 0.95;

const METEOROS = 14;

/**
 * Os gigantes. Direções fixas, escolhidas para não caírem todas no mesmo
 * pedaço do céu nem bem em cima da cabeça — um planeta no zênite só é visto
 * por quem deita.
 *
 * `raio` em metros na cúpula: 2,2 m a 38 m dá cerca de 6,6° de diâmetro
 * aparente, umas treze luas cheias lado a lado. É o tamanho em que a coisa
 * lê como mundo e não como estrela grande.
 */
const GIGANTES = [
  { az: -0.55, el: 0.42, raio: 4.4, elemento: 0, anel: false, giro: 0.008 },
  { az: 1.95, el: 0.28, raio: 2.6, elemento: 2, anel: true, giro: 0.012 },
  { az: 3.30, el: 0.62, raio: 3.4, elemento: 1, anel: false, giro: 0.006 },
  { az: 5.10, el: 0.34, raio: 2.1, elemento: 2, anel: false, giro: 0.015 },
];

export class Sky extends Group {
  constructor() {
    super();
    this.name = 'ceu';
    this.frustumCulled = false;

    // Poucos segmentos: o shader é todo direcional, a malha só precisa
    // envolver o usuário sem facetar visivelmente.
    this.dome = new Mesh(new SphereGeometry(RADIUS, 32, 20), skyMaterial);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -2000;
    this.add(this.dome);

    // --- gigantes ---------------------------------------------------------
    const r = rng(8821);
    this.gigantes = [];
    for (const g of GIGANTES) {
      // Material próprio por planeta, mas com os uniforms globais ainda
      // apontando para os de verdade: um clone cru congelaria no tempo e
      // pararia de acompanhar a troca de cena.
      const mat = cloneMaterial(planetMaterial, {
        uWarp: 1, uGrow: 0, uSeed: r(), uElement: g.elemento,
        uTint: new Vector3(0.6 + r() * 0.4, 0.5 + r() * 0.4, 0.5 + r() * 0.5),
      });

      const grupo = new Group();
      const corpo = new Mesh(new SphereGeometry(g.raio, 24, 16), mat);
      corpo.frustumCulled = false;
      grupo.add(corpo);

      if (g.anel) {
        const anel = new Mesh(
          new TorusGeometry(g.raio * 1.85, g.raio * 0.05, 5, 40), mat);
        anel.rotation.x = Math.PI / 2 + 0.42;
        anel.rotation.z = 0.3;
        anel.frustumCulled = false;
        grupo.add(anel);
      }

      grupo.position.set(
        Math.sin(g.az) * Math.cos(g.el) * R_GIGANTE,
        Math.sin(g.el) * R_GIGANTE,
        Math.cos(g.az) * Math.cos(g.el) * R_GIGANTE,
      );
      grupo.userData = { corpo, giro: g.giro, mat };
      this.gigantes.push(grupo);
      this.add(grupo);
    }

    // --- cadentes ---------------------------------------------------------
    // Um plano por meteoro; o vertex shader curva cada um sobre a cúpula e
    // decide sozinho quando ele existe. Nada aqui roda por quadro.
    const geo = new PlaneGeometry(1, 1, 12, 1);
    const sementes = new Float32Array(METEOROS);
    const rm = rng(9137);
    for (let i = 0; i < METEOROS; i++) sementes[i] = rm();
    geo.setAttribute('aSeed', new InstancedBufferAttribute(sementes, 1));

    meteorMaterial.uniforms.uRaio.value = R_METEORO;
    this.meteoros = new InstancedMesh(geo, meteorMaterial, METEOROS);
    this.meteoros.frustumCulled = false;
    this.meteoros.renderOrder = -1990;   // depois da cúpula, ainda no fundo
    this.meteoros.count = METEOROS;
    this.add(this.meteoros);
  }

  /** @param {number} t tempo decorrido  @param {THREE.Vector3} head posição da cabeça */
  update(t, head) {
    // Segue a cabeça em posição: andar não deve aproximar o horizonte.
    this.position.set(head.x, 0, head.z);
    for (const g of this.gigantes) g.userData.corpo.rotation.y = t * g.userData.giro;
  }

  /** Liga e desliga com transição, mexendo no uniform em vez de em `visible`. */
  setEnabled(on) {
    this.enabled = on;
    return on;
  }

  get uniforms() { return skyMaterial.uniforms; }

  dispose() {
    this.dome.geometry.dispose();
    this.meteoros.geometry.dispose();
    for (const g of this.gigantes) {
      g.traverse((o) => o.isMesh && o.geometry.dispose());
      g.userData.mat.dispose();
    }
    this.clear();
  }
}
