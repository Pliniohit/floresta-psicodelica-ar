import {
  Points, InstancedBufferGeometry, BufferAttribute, InstancedBufferAttribute,
  Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { samplePoints } from './geometry.js';
import { rng } from './forest.js';

/**
 * NUVEM DE PONTOS INSTANCIADA.
 *
 * Troca a malha de uma planta por uma nuvem de pontos amostrada na superfície
 * dela — a estética do estudo de partículas, sem depender de modelo nenhum:
 * os pontos saem da geometria procedural que o projeto já tem.
 *
 * O TRUQUE está na interface. Esta classe finge ser um `InstancedMesh`:
 * expõe `setMatrixAt`, `instanceMatrix` e `count` com o mesmo comportamento.
 * Com isso ela entra no `InstanceSet` da floresta como se fosse mais uma
 * malha, e todo o resto — plantar, pegar, carregar, soltar, crescer — segue
 * funcionando sem saber que agora está mexendo em pontos.
 *
 * Uma nuvem inteira de uma espécie é UMA chamada de desenho: o gabarito de
 * pontos vai uma vez, e cada planta é uma instância com posição, giro e
 * escala próprios.
 */

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

export class NuvemDePontos extends Points {
  /**
   * @param {THREE.BufferGeometry} fonte  malha de onde os pontos saem
   * @param {THREE.Material} material     material de nuvem
   * @param {number} capacidade           quantas plantas cabem
   * @param {number} pontos               pontos por planta
   * @param {number} semente              para a amostragem ser repetível
   */
  constructor(fonte, material, capacidade, pontos = 220, semente = 1, extras = null) {
    const geo = new InstancedBufferGeometry();

    // O gabarito: os pontos em espaço de objeto, iguais para toda instância.
    //
    // A fonte pode ser uma MALHA, e aí os pontos são amostrados na superfície
    // dela agora; ou já vir PRONTA como um Float32Array, que é o caso das
    // nuvens assadas de um .glb — ali a amostragem aconteceu na bancada, uma
    // vez, e o que viaja são só as coordenadas.
    const amostra = fonte instanceof Float32Array
      ? fonte
      : samplePoints(fonte, pontos, rng(semente));
    pontos = amostra.length / 3;
    geo.setAttribute('position', new BufferAttribute(amostra, 3));

    // Atributos extras por PONTO, quando quem chama tem algo a dizer sobre
    // cada um deles — o lado e a envergadura da asa, a cor que a textura do
    // modelo tinha ali.
    //
    // O tamanho do item é DEDUZIDO do próprio arranjo. Fixá-lo em 1 obrigava
    // quem quisesse passar cor a inventar três atributos separados.
    for (const [nome, arr] of Object.entries(extras ?? {})) {
      const itens = Math.round(arr.length / pontos);
      geo.setAttribute(nome, new BufferAttribute(arr, itens));
    }

    // Uma semente por PONTO, para variar cor e brilho dentro da mesma planta
    // sem que dois pontos vizinhos fiquem idênticos.
    const rp = rng(semente * 31 + 7);
    const semPonto = new Float32Array(pontos);
    for (let i = 0; i < pontos; i++) semPonto[i] = rp();
    geo.setAttribute('aPonto', new BufferAttribute(semPonto, 1));

    // E os atributos por INSTÂNCIA, que é onde a transformação mora.
    const iPos = new InstancedBufferAttribute(new Float32Array(capacidade * 3), 3);
    const iQuat = new InstancedBufferAttribute(new Float32Array(capacidade * 4), 4);
    const iEsc = new InstancedBufferAttribute(new Float32Array(capacidade * 3), 3);
    const iSem = new InstancedBufferAttribute(new Float32Array(capacidade), 1);
    geo.setAttribute('iPos', iPos);
    geo.setAttribute('iQuat', iQuat);
    geo.setAttribute('iEsc', iEsc);
    geo.setAttribute('iSemente', iSem);
    geo.instanceCount = 0;

    super(geo, material);

    this.name = 'nuvem';
    this.frustumCulled = false;
    this.capacidade = capacidade;
    this.pontosPorPlanta = pontos;
    this._i = { iPos, iQuat, iEsc, iSem };

    // Semente estável por instância, sorteada uma vez. Tirá-la da posição
    // faria a planta trocar de identidade ao ser carregada pela mão.
    const rs = rng(semente * 17 + 3);
    for (let i = 0; i < capacidade; i++) iSem.setX(i, rs());
    iSem.needsUpdate = true;

    // O xerife do `InstancedMesh`: o InstanceSet chama
    // `instanceMatrix.needsUpdate = true` para publicar as escritas, e aqui
    // isso precisa marcar os quatro atributos de uma vez.
    const marcar = () => {
      iPos.needsUpdate = true;
      iQuat.needsUpdate = true;
      iEsc.needsUpdate = true;
    };
    this.instanceMatrix = {
      set needsUpdate(v) { if (v) marcar(); },
      get needsUpdate() { return false; },
      // O InstanceSet checa `instanceMatrix.count` para não estourar.
      count: capacidade,
    };
  }

  /** Quantas plantas estão vivas. Espelha o `count` do InstancedMesh. */
  get count() { return this.geometry.instanceCount; }

  set count(n) { this.geometry.instanceCount = Math.max(0, Math.min(this.capacidade, n)); }

  /**
   * Decompõe a matriz nos atributos por instância.
   *
   * Guardar posição, giro e escala separados — em vez da matriz inteira —
   * custa dez floats no lugar de dezesseis, e é o suficiente: planta não
   * cisalha nem se projeta.
   */
  setMatrixAt(i, m) {
    if (i < 0 || i >= this.capacidade) return;
    m.decompose(_p, _q, _s);
    this._i.iPos.setXYZ(i, _p.x, _p.y, _p.z);
    this._i.iQuat.setXYZW(i, _q.x, _q.y, _q.z, _q.w);
    this._i.iEsc.setXYZ(i, _s.x, _s.y, _s.z);
  }

  /** Lê de volta, para o InstanceSet poder consultar a transformação. */
  getMatrixAt(i, m) {
    _p.fromBufferAttribute(this._i.iPos, i);
    _q.fromBufferAttribute(this._i.iQuat, i);
    _s.fromBufferAttribute(this._i.iEsc, i);
    m.compose(_p, _q, _s);
    return m;
  }
}
