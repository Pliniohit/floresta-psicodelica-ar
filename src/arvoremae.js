import { Group, Mesh, Vector3 } from '../vendor/three/three.module.min.js';
import * as G from './geometry.js';
import {
  barkMaterial, canopyMaterial, raizMaterial, raizGlowMaterial,
} from './shaders/materials.js';

/**
 * A ÁRVORE-MÃE — uma só, no meio do cômodo, e as duas portas são dela.
 *
 * É o argumento inteiro de Raízes Cósmicas cabendo num objeto: o casulo pende
 * de um galho e leva para fora, a raiz abre no pé e leva para dentro. Não são
 * dois adereços espalhados pelo cenário — são as duas pontas da mesma árvore,
 * e é por isso que a ligação entre o magma e o universo profundo tem onde ser
 * vista.
 *
 * ELA ATRAVESSA O CÔMODO. Quase sete metros numa sala de dois e meio: o tronco
 * e três galhos baixos ficam aqui dentro, e a copa inteira fica lá FORA, acima
 * do forro, onde o céu é virtual e portanto visível. É o que faz o cômodo
 * virar um lugar dentro de algo maior — e é de um dos galhos de dentro que o
 * casulo pende.
 *
 * ELA É GERADA POR CÓDIGO. Já foi um modelo fotogramétrico de dois milhões de
 * triângulos, reduzido, com a textura fotografada viajando junto: um megabyte
 * e meio de malha, oitocentos kilobytes de textura e uma licença de terceiro
 * por resolver. Agora custa oitocentos triângulos e nenhum arquivo, muda de
 * cor com o cenário porque a cor vem da paleta, e a silhueta é ESCOLHIDA em
 * vez de herdada. Ver `G.arvoreMae`.
 *
 * ELA NÃO BALANÇA, e ELA SOME NO ESPAÇO. Uma árvore adulta não oscila inteira
 * na fase do capim; e nos dois pólos — o Olho e o Núcleo — não existe árvore
 * nenhuma, porque lá a saída é escolher um corpo, não abrir uma porta.
 */

const _p = new Vector3();
const _d = new Vector3();

export class ArvoreMae extends Group {
  constructor() {
    super();
    this.name = 'arvore-mae';
    this.frustumCulled = false;
    this.visible = false;

    const forma = G.arvoreMae();
    this.tronco = new Mesh(forma.tronco, barkMaterial);
    this.copa = new Mesh(forma.copa, canopyMaterial);
    for (const m of [this.tronco, this.copa]) {
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.add(m);
    }
    this.pontoGalho = forma.galho;

    // Onde o casulo pende, em coordenadas locais deste grupo.
    this.galho = new Vector3();

    // A RAIZ: o corpo e o calor que sobe dele. Duas malhas na mesma pose, do
    // mesmo jeito que o casulo e o halo dele.
    const geoRaiz = G.raiz();
    this.raiz = new Mesh(geoRaiz, raizMaterial);
    this.raiz.renderOrder = 5;
    this.raiz.frustumCulled = false;
    this.raizHalo = new Mesh(geoRaiz, raizGlowMaterial);
    this.raizHalo.renderOrder = 8;
    this.raizHalo.frustumCulled = false;
    this.add(this.raiz, this.raizHalo);
    this.raizAberta = false;
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

    for (const m of [this.tronco, this.copa]) m.position.set(cx, 0, cz);

    // O galho de onde o casulo pende: a ponta do galho mais baixo, e nunca
    // acima do forro — um casulo do lado de fora do teto existiria, brilharia,
    // e seria impossível de alcançar.
    const g = this.pontoGalho;
    this.galho.set(cx + g.x, Math.min(g.y, alturaTeto - 0.55), cz + g.z);

    // A RAIZ, no pé do tronco e um pouco à frente: encaixada no eixo ela
    // ficaria escondida pelo próprio tronco de metade dos ângulos da sala, e
    // é a única porta para dentro.
    for (const m of [this.raiz, this.raizHalo]) {
      // Um pouco acima do piso: os braços mergulham para baixo, e assentada
      // exatamente em zero metade deles ficava enterrada no chão do cômodo —
      // que é o que os fazia sumir e o bulbo virar um caroço solto.
      m.position.set(cx + 0.62, 0.055, cz + 0.86);
      m.scale.setScalar(1.15);
      m.visible = true;
    }
    this.raizAberta = false;
    raizMaterial.uniforms.uReady.value = 0;

    this.visible = true;
    return this.galho;
  }

  /**
   * Some, e é para sumir mesmo.
   *
   * Nos dois pólos não há árvore: a saída de lá é escolher um corpo e
   * atravessar para o mundo dele, não abrir uma porta. Deixá-la em pé no meio
   * do enxame de planetas diria que ainda existe uma porta ali — e o casulo
   * ficaria pendurado no meio do espaço, prometendo uma saída que não é a
   * daquele lugar.
   */
  setEnabled(on) {
    this.visible = !!on;
    return this.visible;
  }

  /**
   * A raiz está sob a mira?
   *
   * O corredor é o mesmo do casulo, e generoso pelo mesmo motivo: mira de mão
   * treme, e errar a raiz é errar a única porta para dentro. Aqui vale ainda
   * mais, porque ela fica no CHÃO — apontar para baixo com o braço estendido é
   * o gesto menos preciso que existe.
   *
   * @returns {number|null} distância até ela, ou null
   */
  pickRaizAlongRay(origem, direcao, alcance = 8, corredor = 0.5) {
    if (!this.visible || this.raizAberta) return null;
    this.raiz.getWorldPosition(_p);
    // A boca fica acima da base; mirar o centro do bulbo é mais natural.
    _p.y += 0.12 * this.raiz.scale.y;
    _d.copy(_p).sub(origem);
    const t = _d.dot(direcao);
    if (t < 0.05 || t > alcance) return null;
    _d.copy(origem).addScaledVector(direcao, t);
    if (_d.distanceTo(_p) > corredor) return null;
    return t;
  }

  /** A raiz também responde ao toque, para quem alcança o chão. */
  pickRaiz(mundo, alcance = 0.30) {
    if (!this.visible || this.raizAberta) return false;
    this.raiz.getWorldPosition(_p);
    _p.y += 0.12 * this.raiz.scale.y;
    return _p.distanceTo(mundo) < alcance;
  }

  /**
   * Abre a raiz. Devolve o ponto de onde a descida começa, em MUNDO, ou null
   * se ela já estava aberta.
   */
  abrirRaiz() {
    if (!this.visible || this.raizAberta) return null;
    this.raizAberta = true;
    this.raiz.getWorldPosition(_p);
    _p.y += 0.10 * this.raiz.scale.y;
    // Some da cena, como o casulo faz: a porta usada não pode ser usada de
    // novo, senão o mundo pisca entre dois cenários.
    this.raiz.visible = false;
    this.raizHalo.visible = false;
    return _p.clone();
  }

  dispose() {
    this.tronco.geometry.dispose();
    this.copa.geometry.dispose();
    this.raiz.geometry.dispose();
    this.clear();
  }
}
