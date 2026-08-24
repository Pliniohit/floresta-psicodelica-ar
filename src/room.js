import {
  Group, Mesh, BufferGeometry, BufferAttribute, Matrix4, Vector2, Vector3,
} from 'three';
import { reticleMaterial } from './shaders/materials.js';

// ---------------------------------------------------------------------------
// Geometria de polígono (tudo no plano XZ, em metros)
// ---------------------------------------------------------------------------

/** Ray casting padrão. `poly` é um array de Vector2 com (x, z). */
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > z) !== (b.y > z)
      && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Área com sinal — o valor absoluto é a área, o sinal dá a orientação. */
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(s) / 2;
}

export function polygonBounds(poly) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of poly) {
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
    b.minZ = Math.min(b.minZ, p.y); b.maxZ = Math.max(b.maxZ, p.y);
  }
  return b;
}

export function polygonCentroid(poly) {
  const c = new Vector2();
  for (const p of poly) c.add(p);
  return c.divideScalar(poly.length || 1);
}

/** Menor distância de (x, z) até qualquer aresta do polígono. */
export function distanceToEdges(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].x, az = poly[j].y, bx = poly[i].x, bz = poly[i].y;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    const px = ax + t * dx, pz = az + t * dz;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

/** Retângulo usado quando o headset não oferece nenhuma geometria de sala. */
export function fallbackRoom(center = new Vector2(0, 0), w = 4.0, d = 4.0) {
  const hw = w / 2, hd = d / 2;
  return [
    new Vector2(center.x - hw, center.y - hd),
    new Vector2(center.x + hw, center.y - hd),
    new Vector2(center.x + hw, center.y + hd),
    new Vector2(center.x - hw, center.y + hd),
  ];
}

// ---------------------------------------------------------------------------
// Visualização do espaço durante o mapeamento
// ---------------------------------------------------------------------------

/**
 * Fita plana seguindo uma polilinha no plano XZ. Usada em vez de LineSegments
 * porque a espessura de linha é travada em 1 px na maioria das plataformas,
 * e 1 px praticamente some num headset.
 */
function ribbon(poly, width = 0.035, y = 0.02, closed = true) {
  const verts = [];
  const n = poly.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b.x - a.x, dz = b.y - a.y;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * width, nz = (dx / len) * width;
    verts.push(
      a.x - nx, y, a.y - nz, b.x - nx, y, b.y - nz, b.x + nx, y, b.y + nz,
      a.x - nx, y, a.y - nz, b.x + nx, y, b.y + nz, a.x + nx, y, a.y + nz,
    );
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Captura do espaço
// ---------------------------------------------------------------------------

const HORIZONTAL = 'horizontal';
const FLOOR_LABELS = new Set(['floor']);
const OBSTACLE_LABELS = new Set(['table', 'couch', 'bed', 'desk', 'shelf', 'screen', 'other']);

/**
 * Lê as superfícies que o usuário já mapeou no Space Setup do Quest e monta:
 *   - `footprint`  polígono caminhável do chão, em Vector2(x, z)
 *   - `obstacles`  polígonos de móveis, para não plantar dentro do sofá
 *   - `floorY`     altura do piso no espaço de referência
 *   - `ceilingY`   altura do teto, quando detectada
 *
 * Se o Space Setup nunca foi feito, cai para `bounded-floor` (o limite do
 * guardian) e, em último caso, para um retângulo à frente do usuário.
 */
export class RoomScan {
  constructor() {
    this.footprint = null;
    this.obstacles = [];
    this.floorY = 0;
    this.ceilingY = null;
    this.source = 'nenhuma';
    this.planeCount = 0;
    this.revision = 0;

    this.view = new Group();
    this.view.name = 'mapeamento';
    this.view.visible = false;
    this.view.frustumCulled = false;

    this._signature = '';
    this._boundedSpace = null;
  }

  /** Pede o espaço bounded-floor uma vez; usado só se não houver planos. */
  async prepare(session) {
    try {
      this._boundedSpace = await session.requestReferenceSpace('bounded-floor');
    } catch {
      this._boundedSpace = null;
    }
  }

  /** Chamado a cada frame durante a fase de mapeamento. */
  update(frame, refSpace) {
    if (!frame || !refSpace) return false;
    return this.#fromPlanes(frame, refSpace) || this.#fromBounds(frame, refSpace);
  }

  #fromPlanes(frame, refSpace) {
    const planes = frame.detectedPlanes;
    if (!planes || planes.size === 0) return false;

    // Assinatura barata: só reconstruímos quando algo realmente mudou.
    let sig = `${planes.size}`;
    for (const p of planes) sig += `|${p.lastChangedTime}`;
    if (sig === this._signature) return !!this.footprint;
    this._signature = sig;
    this.planeCount = planes.size;

    const horizontals = [];
    const verticals = [];

    for (const plane of planes) {
      const pose = frame.getPose(plane.planeSpace, refSpace);
      if (!pose || !plane.polygon?.length) continue;
      const m = new Matrix4().fromArray(pose.transform.matrix);
      const pts3 = plane.polygon.map((p) => new Vector3(p.x, p.y, p.z).applyMatrix4(m));
      const poly = pts3.map((p) => new Vector2(p.x, p.z));
      const y = pts3.reduce((a, p) => a + p.y, 0) / pts3.length;
      const entry = { plane, poly, y, area: polygonArea(poly), label: plane.semanticLabel };
      (plane.orientation === HORIZONTAL ? horizontals : verticals).push(entry);
    }

    if (!horizontals.length) return !!this.footprint;

    // Chão: rótulo explícito quando existe; senão, o maior plano horizontal baixo.
    const labelled = horizontals.filter((h) => FLOOR_LABELS.has(h.label));
    const low = horizontals.filter((h) => h.y < 0.35);
    const pool = labelled.length ? labelled : (low.length ? low : horizontals);
    const floor = pool.reduce((a, b) => (b.area > a.area ? b : a));

    this.floorY = floor.y;
    this.footprint = floor.poly;
    this.source = labelled.length ? 'Space Setup' : 'planos detectados';

    const ceil = horizontals.filter((h) => h.y > this.floorY + 1.7)
      .sort((a, b) => a.y - b.y)[0];
    this.ceilingY = ceil ? ceil.y : null;

    // Móveis: horizontais acima do chão e abaixo da altura do peito.
    this.obstacles = horizontals
      .filter((h) => h !== floor && h.y > this.floorY + 0.12 && h.y < this.floorY + 1.5)
      .filter((h) => !h.label || OBSTACLE_LABELS.has(h.label))
      .map((h) => h.poly);

    this.#rebuildView(verticals);
    this.revision++;
    return true;
  }

  /** Sem Space Setup: usa o polígono do guardian. */
  #fromBounds(frame, refSpace) {
    if (this.footprint) return true;
    const space = this._boundedSpace;
    const bounds = space?.boundsGeometry;
    if (!bounds?.length) return false;

    const pose = frame.getPose(space, refSpace);
    if (!pose) return false;
    const m = new Matrix4().fromArray(pose.transform.matrix);
    const poly = bounds.map((p) => {
      const v = new Vector3(p.x, p.y, p.z).applyMatrix4(m);
      return new Vector2(v.x, v.z);
    });
    if (polygonArea(poly) < 1.0) return false;

    this.footprint = poly;
    this.floorY = 0;
    this.obstacles = [];
    this.source = 'limite do guardian';
    this.#rebuildView([]);
    this.revision++;
    return true;
  }

  /** Último recurso, quando nada foi detectado e o usuário quis começar mesmo assim. */
  useFallback(center) {
    this.footprint = fallbackRoom(center, 4.0, 4.0);
    this.floorY = 0;
    this.obstacles = [];
    this.source = 'área padrão';
    this.#rebuildView([]);
    this.revision++;
  }

  #rebuildView(verticals) {
    for (const child of [...this.view.children]) {
      child.geometry.dispose();
      this.view.remove(child);
    }
    if (!this.footprint) return;

    const outline = new Mesh(ribbon(this.footprint, 0.04, this.floorY + 0.015), reticleMaterial);
    outline.frustumCulled = false;
    this.view.add(outline);

    for (const ob of this.obstacles) {
      const m = new Mesh(ribbon(ob, 0.025, this.floorY + 0.02), reticleMaterial);
      m.frustumCulled = false;
      this.view.add(m);
    }

    // Rodapé das paredes: dá a sensação de que a sala foi realmente lida.
    for (const w of verticals.slice(0, 12)) {
      const m = new Mesh(ribbon(w.poly, 0.02, this.floorY + 0.01, false), reticleMaterial);
      m.frustumCulled = false;
      this.view.add(m);
    }
  }

  get area() { return this.footprint ? polygonArea(this.footprint) : 0; }
  get ready() { return !!this.footprint && this.area > 0.8; }

  dispose() {
    for (const c of [...this.view.children]) c.geometry.dispose();
    this.view.clear();
  }
}
