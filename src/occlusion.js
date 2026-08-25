import {
  Group, Mesh, BufferGeometry, BufferAttribute, MeshBasicMaterial, Matrix4,
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

/** Só o oclusor precisa deste material — ele escreve profundidade e mais nada. */
function makeOccluderMaterial() {
  const m = new MeshBasicMaterial();
  m.colorWrite = false;   // invisível, mas ocupa o Z-buffer
  m.name = 'oclusor';
  return m;
}

export class RoomMesh extends Group {
  constructor() {
    super();
    this.name = 'malha-do-comodo';
    this.matrixAutoUpdate = false;

    this.occluderMaterial = makeOccluderMaterial();
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
