import {
  Group, Mesh, InstancedMesh, BufferGeometry, BufferAttribute,
  IcosahedronGeometry, Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { skyLifeMaterial } from './shaders/materials.js';

/**
 * Uma constelação desenhada no céu.
 *
 * A forma é dada em coordenadas 2D normalizadas (-1..1, y para cima) e
 * projetada na cúpula numa direção fixa do céu — então ela fica sempre no
 * mesmo pedaço do firmamento, e você a procura virando a cabeça, como se
 * procura uma constelação de verdade.
 *
 * TROCAR PELA LOGO: substitua `points` e `edges` abaixo. `points` são os
 * vértices; `edges` são pares de índices ligando um ao outro. Nada mais
 * precisa mudar.
 */

/** Placeholder: um cogumelo estilizado, à espera da logo. */
export const MUSHROOM_SHAPE = {
  name: 'Cogumelo',
  points: [
    [-0.75, 0.10], [-0.45, 0.52], [0.00, 0.68], [0.45, 0.52], [0.75, 0.10],  // chapéu
    [-0.75, 0.10], [0.75, 0.10],                                             // aba
    [-0.20, 0.05], [-0.24, -0.55], [0.24, -0.55], [0.20, 0.05],              // caule
    [-0.34, 0.34], [0.30, 0.30], [0.02, 0.46],                               // manchas
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
    [7, 8], [8, 9], [9, 10], [10, 7],
  ],
};

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

export class Constellation extends Group {
  /**
   * @param {{name:string, points:number[][], edges:number[][]}} shape
   * @param {object} opts  distância, tamanho angular e para onde no céu aponta
   */
  constructor(shape = MUSHROOM_SHAPE, {
    distance = 34,
    scale = 9,
    azimuth = -0.7,     // radianos; 0 = para onde você olhava ao começar
    elevation = 0.95,   // radianos acima do horizonte
  } = {}) {
    super();
    this.name = 'constelacao';
    this.frustumCulled = false;
    this.shape = shape;

    // Base do plano da constelação, montada na direção escolhida do céu.
    const dir = new Vector3(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth),
    ).normalize();
    const right = new Vector3().crossVectors(dir, new Vector3(0, 1, 0)).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new Vector3().crossVectors(right, dir).normalize();

    const center = dir.multiplyScalar(distance);
    this.stars3D = shape.points.map(([x, y]) => center.clone()
      .addScaledVector(right, x * scale)
      .addScaledVector(up, y * scale));

    // Estrelas
    this.stars = new InstancedMesh(
      new IcosahedronGeometry(1, 0), skyLifeMaterial, this.stars3D.length);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1998;   // com o resto do céu, antes do oclusor
    this.add(this.stars);

    this.sizes = this.stars3D.map((_, i) => (shape.edges.some((e) => e.includes(i)) ? 0.26 : 0.17));
    for (let i = 0; i < this.stars3D.length; i++) {
      _m.compose(this.stars3D[i], _q.identity(), _s.setScalar(this.sizes[i]));
      this.stars.setMatrixAt(i, _m);
    }
    this.stars.instanceMatrix.needsUpdate = true;

    // Linhas: fitas finas, porque espessura de linha é travada em 1 px na
    // maioria das plataformas e 1 px some a 34 m de distância.
    if (shape.edges.length) {
      this.lines = new Mesh(this.#ribbons(shape.edges, right, up, 0.055), skyLifeMaterial);
      this.lines.frustumCulled = false;
      this.lines.renderOrder = -1998;
      this.add(this.lines);
    }
  }

  #ribbons(edges, right, up, width) {
    const verts = [];
    for (const [i, j] of edges) {
      const a = this.stars3D[i], b = this.stars3D[j];
      if (!a || !b) continue;
      // Normal da fita: perpendicular ao segmento, dentro do plano da forma.
      const dx = b.clone().sub(a);
      const n = new Vector3().crossVectors(dx, right.clone().add(up)).normalize().multiplyScalar(width);
      if (!Number.isFinite(n.x)) continue;
      const a0 = a.clone().sub(n), a1 = a.clone().add(n);
      const b0 = b.clone().sub(n), b1 = b.clone().add(n);
      verts.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
      verts.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    g.computeVertexNormals();
    return g;
  }

  /** Acompanha a cabeça em posição, como a cúpula: o céu não se aproxima. */
  update(head) {
    this.position.set(head.x, 0, head.z);
  }

  dispose() {
    this.stars.geometry.dispose();
    this.lines?.geometry.dispose();
    this.clear();
  }
}
