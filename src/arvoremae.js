import {
  Group, Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { NuvemDePontos } from './nuvem.js';
import { arvoreMaeMaterial } from './shaders/materials.js';
import { nuvem as nuvemArvore, cores as coresArvore } from './nuvens/arvoremae.js';

/**
 * A ÁRVORE-MÃE — uma só, no meio do cômodo, e é dela que o casulo pende.
 *
 * Todo o resto da vegetação é procedural: formas geradas por código, das quais
 * os pontos são amostrados na hora. Esta não. Ela vem de um modelo
 * fotogramétrico de dois milhões de triângulos, e é a única coisa da cena com
 * a irregularidade que só uma árvore de verdade tem — o nó, a torção, a vinha
 * subindo torta. É o que ancora o cômodo: uma coisa reconhecivelmente real no
 * meio de um mundo desenhado.
 *
 * COMO ELA CABE. O modelo tem noventa e sete megabytes e nenhum navegador de
 * headset o abriria. O que viaja é uma nuvem de quarenta e seis mil pontos
 * assada na bancada — meio megabyte — com a COR que a textura tinha em cada
 * ponto. Ver o cabeçalho de scripts/assar-nuvem.mjs.
 *
 * A cor baixada do modelo não é usada como cor. Ela é um mapa de VARIAÇÃO: o
 * tom vem da paleta do cenário, como em toda a vegetação, e o que a textura
 * acrescenta é o relevo — a casca clara e a fenda escura no lugar certo. Sem
 * isso a árvore ficaria de um marrom chapado só, e a troca de cenário pararia
 * de alcançá-la.
 *
 * ELA NÃO BALANÇA. Nada de vento aqui: uma árvore adulta não oscila inteira,
 * e vê-la ondular na mesma fase do capim desfaz a escala dela num segundo.
 */

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _e = new Vector3();

/**
 * Altura da árvore, em metros, e o quanto ela deixa livre abaixo do teto.
 *
 * Ela é grande de propósito — precisa passar a impressão de que o cômodo
 * ficou pequeno — mas a copa não pode atravessar o teto lido, senão a metade
 * de cima some atrás do oclusor e o que sobra é um toco.
 */
const ALTURA_ALVO = 3.4;
const FOLGA_TETO = 0.25;

/** Onde o casulo pende, em fração da altura e do raio da copa. */
const GALHO_ALTURA = 0.62;
const GALHO_RAIO = 0.34;

export class ArvoreMae extends Group {
  constructor() {
    super();
    this.name = 'arvore-mae';
    this.frustumCulled = false;
    this.visible = false;

    const pontos = nuvemArvore();
    const cores = coresArvore();

    // A nuvem assada é normalizada: o maior lado vale 1 e a base está em
    // y = 0. A escala em metros é aplicada por instância, e não aqui, para o
    // gabarito continuar servindo a qualquer tamanho.
    this.nuvem = new NuvemDePontos(pontos, arvoreMaeMaterial, 1, 0, 7, {
      aCor: cores,
    });
    this.nuvem.renderOrder = 4;
    this.add(this.nuvem);

    this.altura = ALTURA_ALVO;
    // Onde o casulo pende, em coordenadas locais deste grupo.
    this.galho = new Vector3();
  }

  /**
   * Planta a árvore no centro do cômodo lido.
   *
   * @param {Array<{x:number,z:number}>} footprint  planta baixa, local
   * @param {number} alturaTeto                     pé-direito, em metros
   * @returns {THREE.Vector3} de onde o casulo pende, em coordenadas locais
   */
  plantar(footprint, alturaTeto = 2.6) {
    // O centro é o CENTROIDE da planta baixa, e não a origem: a origem é onde
    // a pessoa estava quando confirmou o mapeamento, que costuma ser junto de
    // uma parede. Uma árvore nascida ali fica com metade dentro do gesso.
    let cx = 0, cz = 0;
    if (footprint?.length) {
      for (const v of footprint) { cx += v.x; cz += v.z ?? v.y; }
      cx /= footprint.length; cz /= footprint.length;
    }

    this.altura = Math.min(ALTURA_ALVO, Math.max(1.6, alturaTeto - FOLGA_TETO));

    _p.set(cx, 0, cz);
    _q.identity();
    _e.setScalar(this.altura);
    _m.compose(_p, _q, _e);
    this.nuvem.setMatrixAt(0, _m);
    this.nuvem.instanceMatrix.needsUpdate = true;
    this.nuvem.count = 1;

    // O galho de onde o casulo pende. Fora do eixo de propósito: um casulo
    // no centro exato ficaria escondido atrás do tronco de metade dos
    // ângulos da sala.
    this.galho.set(
      cx + this.altura * GALHO_RAIO,
      this.altura * GALHO_ALTURA,
      cz - this.altura * GALHO_RAIO * 0.45,
    );
    this.visible = true;
    return this.galho;
  }

  dispose() {
    this.nuvem.geometry.dispose();
    this.clear();
  }
}
