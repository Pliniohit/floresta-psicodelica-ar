import {
  Group, Mesh, BufferGeometry, BufferAttribute, TextureLoader,
  SRGBColorSpace, RepeatWrapping, LinearMipmapLinearFilter, Vector3,
} from '../vendor/three/three.module.min.js';
import * as G from './geometry.js';
import {
  arvoreMaeMaterial, raizMaterial, raizGlowMaterial,
} from './shaders/materials.js';
import { malha as malhaArvore, TEXTURA } from './malhas/arvoremae.js';

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
 * COMO ELA CABE. O modelo tem noventa e sete megabytes e dois milhões de
 * triângulos; nenhum navegador de headset o abriria. O que viaja é a mesma
 * malha reduzida para cinquenta e nove mil triângulos por agrupamento em
 * grade — um megabyte — mais a textura de cor em oitocentos kilobytes. Ver o
 * cabeçalho de scripts/assar-malha.mjs.
 *
 * ELA JÁ FOI NUVEM DE PONTOS, e estava errado. A dois metros do olho, quarenta
 * e seis mil pontos numa árvore viram um monte de bolinhas: a distância entre
 * pontos vizinhos fica maior que o detalhe que eles deveriam descrever, e o
 * objeto se desfaz justamente onde precisava convencer. Ponto é certo para
 * milhares de plantas pequenas, não para uma coisa grande e perto.
 *
 * ELA ATRAVESSA O CÔMODO. Sete metros de altura numa sala de dois e meio: o
 * tronco e os galhos mais baixos ficam aqui dentro, e a copa inteira fica lá
 * FORA, acima do teto, onde o céu é virtual e portanto visível. É o que faz o
 * cômodo virar um lugar dentro de algo maior — e é de um dos poucos galhos de
 * dentro que o casulo pende.
 *
 * ELA NÃO BALANÇA. Nada de vento aqui: uma árvore adulta não oscila inteira,
 * e vê-la ondular na mesma fase do capim desfaz a escala dela num segundo.
 *
 * AS DUAS PORTAS SÃO DELA. É o argumento inteiro de Raízes Cósmicas cabendo
 * num objeto só: o casulo pende de um galho e leva para fora, a raiz abre no
 * pé e leva para dentro. Não são dois adereços espalhados pelo cenário — são
 * as duas pontas da mesma árvore, e é por isso que a ligação entre o magma e
 * o universo profundo tem onde ser vista.
 *
 * O casulo mora na floresta, junto dos outros, porque nasce de semente. A
 * raiz mora AQUI, porque não existe sem a árvore.
 */

const _p = new Vector3();
const _q2 = new Vector3();

/**
 * O TAMANHO — e por que ele é este.
 *
 * Sete metros. A árvore não cabe no cômodo, e é justamente esse o ponto: o
 * teto é virtual daqui para cima, então a copa aparece lá fora e a sala passa
 * a ser um lugar DENTRO de algo maior. Uma árvore que coubesse no pé-direito
 * seria um vaso grande.
 *
 * O modelo é uma árvore velha e espraiada — medida, ela tem raio parecido em
 * toda a altura, com galhos saindo desde bem baixo. Por isso não existe aqui
 * um "começo da copa": o que fica dentro do cômodo é a base do tronco e os
 * galhos mais baixos, e é de um deles que o casulo pende.
 */
const ALTURA = 7.0;

/** Onde o casulo pende: em metros, e sempre DENTRO do cômodo. */
const GALHO_ALTURA = 1.78;
const GALHO_RAIO = 0.92;

export class ArvoreMae extends Group {
  constructor() {
    super();
    this.name = 'arvore-mae';
    this.frustumCulled = false;
    this.visible = false;

    // A malha assada vem normalizada: o maior lado vale 1 e a base está em
    // y = 0. A escala em metros mora na malha, e não no gabarito, para o
    // arquivo continuar servindo a qualquer tamanho.
    const d = malhaArvore();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(d.posicao, 3));
    geo.setAttribute('normal', new BufferAttribute(d.normal, 3));
    geo.setAttribute('uv', new BufferAttribute(d.uv, 2));
    geo.setIndex(new BufferAttribute(d.indice, 1));
    geo.computeBoundingSphere();

    this.arvore = new Mesh(geo, arvoreMaeMaterial);
    this.arvore.frustumCulled = false;
    this.arvore.renderOrder = 3;
    this.add(this.arvore);

    // A TEXTURA chega depois, e a cena não espera por ela: o material desenha
    // uma casca neutra até `uTemMapa` virar 1. Bloquear a entrada em AR por
    // causa de um JPEG seria pagar o pior preço pelo melhor detalhe.
    if (TEXTURA) {
      new TextureLoader().load(TEXTURA, (tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.anisotropy = 4;
        arvoreMaeMaterial.uniforms.uMapa.value = tex;
        arvoreMaeMaterial.uniforms.uTemMapa.value = 1;
        this.texturaPronta = true;
      }, undefined, () => { /* sem textura: fica a casca neutra */ });
    }
    this.texturaPronta = false;

    this.altura = ALTURA;
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

    this.altura = ALTURA;
    this.arvore.position.set(cx, 0, cz);
    this.arvore.scale.setScalar(ALTURA);

    // O galho de onde o casulo pende, em METROS e dentro do cômodo. Fora do
    // eixo de propósito: um casulo no centro exato ficaria escondido atrás do
    // tronco de metade dos ângulos da sala.
    //
    // A altura é fixa e baixa, e não uma fração da árvore: a árvore agora tem
    // sete metros, e uma fração dela poria o casulo do lado de fora do teto —
    // onde ele existiria, brilharia, e seria impossível de alcançar.
    this.galho.set(
      cx + GALHO_RAIO,
      Math.min(GALHO_ALTURA, alturaTeto - 0.55),
      cz - GALHO_RAIO * 0.45,
    );
    // A RAIZ, no pé do tronco e um pouco à frente: encaixada no eixo ela
    // ficaria escondida pelo próprio tronco de metade dos ângulos da sala, e
    // é a única porta para dentro.
    for (const m of [this.raiz, this.raizHalo]) {
      // Um pouco acima do piso: os braços mergulham para baixo, e assentada
      // exatamente em zero metade deles ficava enterrada no chão do cômodo —
      // que é o que os fazia sumir e o bulbo virar um caroço solto.
      //
      // A distância do tronco é em METROS, e não uma fração da árvore: com
      // sete metros de altura, uma fração jogaria a raiz para fora da sala.
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
    _q2.copy(_p).sub(origem);
    const t = _q2.dot(direcao);
    if (t < 0.05 || t > alcance) return null;
    _q2.copy(origem).addScaledVector(direcao, t);
    if (_q2.distanceTo(_p) > corredor) return null;
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
    this.arvore.geometry.dispose();
    this.raiz.geometry.dispose();
    arvoreMaeMaterial.uniforms.uMapa.value?.dispose();
    this.clear();
  }
}
