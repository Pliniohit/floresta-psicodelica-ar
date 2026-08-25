import {
  Group, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, Box3, Matrix4,
} from '../vendor/three/three.module.min.js';
import { scanMaterial } from './shaders/materials.js';

/**
 * A malha do cômodo capturada pelo headset (`mesh-detection`), usada para
 * duas coisas.
 *
 * Durante o escaneamento ela é DESENHADA, com o shader de varredura, para o
 * usuário ver o que o aparelho entendeu do espaço.
 *
 * Depois ela vira OCLUSOR: renderizada só no buffer de profundidade, antes de
 * tudo. É o maior ganho de integração do projeto inteiro — uma árvore atrás do
 * seu sofá passa a ficar atrás do sofá, em vez de atravessá-lo. Sem isso a
 * floresta parece um adesivo colado sobre a imagem; com isso ela parece estar
 * na sala.
 */

/** Rótulos que o Quest costuma devolver, agrupados pelo que significam aqui. */
const FURNITURE = new Set(['table', 'couch', 'bed', 'desk', 'shelf', 'cabinet', 'lamp', 'plant', 'other']);
const STRUCTURE = new Set(['floor', 'ceiling', 'wall', 'wall_face', 'door', 'window', 'screen']);

/**
 * O TETO NÃO OCLUI — e o corte é por ALTURA, não por rótulo.
 *
 * Se o teto escreve profundidade, a copa que passa dele fica escondida atrás
 * do gesso, e olhar para cima não mostra nem céu nem árvore. Ele precisa virar
 * abertura. Parede e chão continuam ocluindo, porque ali a sala é sala.
 *
 * A tentativa anterior filtrava pelo rótulo `ceiling`, e não funcionou: o
 * Quest costuma entregar o cômodo inteiro como UMA malha, rotulada
 * `global mesh` — teto, parede, chão e móveis no mesmo objeto. Não há o que
 * excluir da lista. Por altura funciona nos dois casos, porque a decisão passa
 * a ser por fragmento: acima da linha, descarta.
 *
 * Margem abaixo do teto. Sem ela, o corte exato na altura do teto deixaria
 * escapar a irregularidade da malha, que raramente é um plano.
 *
 * Duas margens porque as duas fontes têm confiabilidade diferente. A detecção
 * de PLANOS entrega um plano de verdade, e ali dá para cortar rente — cada
 * centímetro a mais é parede real que some e vira céu. O topo da MALHA é
 * estimativa: um lustre, uma viga ou um pedaço de leitura ruim empurram o
 * máximo para cima, e a margem larga absorve isso.
 */
const MARGEM_PLANO = 0.10;
const MARGEM_MALHA = 0.32;

/**
 * Só o oclusor precisa deste material — ele escreve profundidade e mais nada.
 *
 * É shader cru em vez de MeshBasicMaterial por causa do `uCorte`: acima
 * daquela altura de mundo o fragmento é descartado e deixa de ocupar o
 * Z-buffer. É assim que o teto vira abertura sem depender de rótulo.
 */
function makeOccluderMaterial() {
  const m = new ShaderMaterial({
    uniforms: { uCorte: { value: Infinity } },
    vertexShader: /* glsl */ `
      varying float vAltura;
      void main(){
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vAltura = mundo.y;
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uCorte;
      varying float vAltura;
      void main(){
        if (vAltura > uCorte) discard;
        gl_FragColor = vec4(0.0);
      }
    `,
  });
  m.colorWrite = false;   // invisível, mas ocupa o Z-buffer
  m.name = 'oclusor';
  return m;
}

const _caixa = new Box3();

export class RoomMesh extends Group {
  constructor() {
    super();
    this.name = 'malha-do-comodo';
    this.matrixAutoUpdate = false;

    this.occluderMaterial = makeOccluderMaterial();
    this.ceilingY = null;      // altura do teto informada de fora, se houver
    this.mode = 'scan';        // scan | occlude | off
    this.occlusionEnabled = true;

    this.entries = [];         // { mesh, label, triangles }
    this.revision = 0;
    this._signature = '';
    this.supported = false;
  }

  /** Quantidade de volumes lidos e de triângulos, para o painel do scanner. */
  get volumeCount() { return this.entries.length; }
  get objectCount() { return this.entries.filter((e) => FURNITURE.has(e.label)).length; }
  get triangleCount() { return this.entries.reduce((n, e) => n + e.triangles, 0); }

  /** Rótulos distintos encontrados, do mais frequente para o menos. */
  get labels() {
    const tally = new Map();
    for (const e of this.entries) tally.set(e.label, (tally.get(e.label) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }

  /**
   * Lê `frame.detectedMeshes`. Reconstrói só quando algo muda de verdade —
   * a malha da sala tem dezenas de milhares de triângulos e refazer isso a
   * cada frame derrubaria o frame rate.
   */
  update(frame, refSpace) {
    const meshes = frame?.detectedMeshes;
    if (!meshes) return false;
    this.supported = true;
    if (meshes.size === 0) return false;

    let sig = `${meshes.size}`;
    for (const m of meshes) sig += `|${m.lastChangedTime}`;
    if (sig === this._signature) return this.entries.length > 0;
    this._signature = sig;

    this.#clear();

    for (const xrMesh of meshes) {
      const pose = frame.getPose(xrMesh.meshSpace, refSpace);
      if (!pose || !xrMesh.vertices?.length || !xrMesh.indices?.length) continue;

      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(xrMesh.vertices), 3));
      // A malha do Quest vem com índices de 32 bits; o BufferAttribute aceita
      // Uint32Array direto e o three.js liga a extensão de índice quando precisa.
      geo.setIndex(new BufferAttribute(new Uint32Array(xrMesh.indices), 1));
      geo.computeVertexNormals();

      const mesh = new Mesh(geo, scanMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(pose.transform.matrix);
      mesh.frustumCulled = false;
      this.add(mesh);

      this.entries.push({
        mesh,
        label: xrMesh.semanticLabel ?? 'other',
        triangles: xrMesh.indices.length / 3,
      });
    }

    this.setMode(this.mode);
    this.revision++;
    return this.entries.length > 0;
  }

  /**
   * 'scan' desenha a malha com o shader de varredura.
   * 'occlude' troca para profundidade-apenas e joga para o início da fila.
   * 'off' esconde tudo.
   */
  setMode(mode) {
    this.mode = mode;
    const occluding = mode === 'occlude' && this.occlusionEnabled;
    this.visible = mode !== 'off' && (mode === 'scan' || occluding);

    for (const e of this.entries) {
      e.mesh.material = occluding ? this.occluderMaterial : scanMaterial;
      // Profundidade primeiro: o oclusor tem de estar no Z-buffer antes de
      // qualquer parte da floresta ser testada contra ele.
      e.mesh.renderOrder = occluding ? -1000 : 6;
    }
    this.#applyCut();
  }

  /**
   * Altura do teto, quando a detecção de planos souber dizer. Sem ela, o topo
   * da própria malha serve: o ponto mais alto de um cômodo é o teto.
   */
  setCeiling(y) {
    this.ceilingY = Number.isFinite(y) ? y : null;
    this.#applyCut();
    return this.cutY;
  }

  /** Altura acima da qual nada oclui. Infinity = oclusão inteira. */
  get cutY() { return this.occluderMaterial.uniforms.uCorte.value; }

  /** Ponto mais alto da malha lida, em coordenadas de mundo. */
  get topY() {
    let topo = -Infinity;
    for (const e of this.entries) {
      const g = e.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      _caixa.copy(g.boundingBox).applyMatrix4(e.mesh.matrix);
      topo = Math.max(topo, _caixa.max.y);
    }
    return topo;
  }

  #applyCut() {
    const doPlano = this.ceilingY != null;
    const teto = doPlano ? this.ceilingY : this.topY;
    const margem = doPlano ? MARGEM_PLANO : MARGEM_MALHA;
    this.occluderMaterial.uniforms.uCorte.value =
      Number.isFinite(teto) ? teto - margem : Infinity;
  }

  setOcclusion(on) {
    this.occlusionEnabled = on;
    this.setMode(this.mode);
    return this.occlusionEnabled;
  }

  /** Esquece a malha lida. A assinatura precisa ir junto, senão a leitura
   *  nova é descartada como "nada mudou". */
  reset() {
    this.#clear();
    this._signature = '';
    this.revision++;
  }

  #clear() {
    for (const e of this.entries) {
      e.mesh.geometry.dispose();
      this.remove(e.mesh);
    }
    this.entries.length = 0;
  }

  dispose() {
    this.#clear();
    this.occluderMaterial.dispose();
  }
}
