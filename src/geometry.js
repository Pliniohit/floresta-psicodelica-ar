import {
  BufferGeometry, BufferAttribute, CylinderGeometry, IcosahedronGeometry,
  ConeGeometry, SphereGeometry, OctahedronGeometry,
  Matrix4, Euler, Quaternion, Vector3,
} from '../vendor/three/three.module.min.js';

/**
 * Concatena geometrias já transformadas numa só, sem índice, e recalcula
 * as normais por face. Sem índice + computeVertexNormals = sombreamento
 * facetado, que é justamente o visual low poly que queremos.
 */
export function weld(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);

  let offset = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, offset);
    offset += g.attributes.position.count * 3;
  }

  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.computeVertexNormals();

  for (const g of geos) g.dispose();
  for (const g of parts) if (!geos.includes(g)) g.dispose();
  return out;
}

const _m = new Matrix4();
const _e = new Euler();
const _q = new Quaternion();
const _pos = new Vector3();
const _scl = new Vector3();

/**
 * Aplica posição / rotação (radianos) / escala a uma geometria, in place.
 * Matrix4.compose exige um Quaternion — passar o Euler direto produz uma
 * matriz cheia de NaN, e a geometria some sem nenhum erro no console.
 */
export function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 }) {
  _m.compose(
    _pos.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz)),
    _scl.set(sx, sy, sz),
  );
  geo.applyMatrix4(_m);
  return geo;
}

/** Tronco cônico com base em y = 0. Passa pelo weld para ficar facetado. */
export function trunk(topR, botR, height, radial = 5, rings = 4) {
  const g = new CylinderGeometry(topR, botR, height, radial, rings, true);
  return weld([place(g, { y: height / 2 })]);
}

// ---------------------------------------------------------------------------
// Três espécies de árvore. Cada uma devolve { trunk, canopy } — duas malhas
// separadas (materiais diferentes) que o shader de vento mantém coladas,
// porque as duas derivam o deslocamento da mesma altura y local.
// ---------------------------------------------------------------------------

/**
 * As três espécies. Regra que vale para todas: a base da copa fica acima de
 * ~2,4 m para você caminhar por baixo. Na escala mínima de instância (0,85)
 * isso ainda deixa ~2,05 m de vão livre — passa gente em pé.
 */
const CANOPY_FLOOR = 2.4;

/** Torre: alta e magra, copa em três bolhas empilhadas fora de eixo. */
export function speciesTower() {
  return {
    trunk: trunk(0.055, 0.125, 2.75, 5, 4),
    canopy: weld([
      place(new IcosahedronGeometry(0.58, 0), { y: 2.98, sy: 0.85, rz: 0.3 }),
      place(new IcosahedronGeometry(0.42, 0), { x: 0.18, y: 3.54, z: -0.12, sy: 0.9, rx: 0.5 }),
      place(new IcosahedronGeometry(0.30, 0), { x: -0.12, y: 3.96, z: 0.14, ry: 0.8 }),
    ]),
    height: 4.0,
  };
}

/** Guarda-chuva: dossel largo e baixo — é a que você atravessa por baixo. */
export function speciesUmbrella() {
  return {
    trunk: trunk(0.08, 0.15, 2.5, 6, 4),
    canopy: weld([
      place(new ConeGeometry(1.25, 0.6, 7, 1), { y: 2.72 }),
      place(new ConeGeometry(0.76, 0.5, 7, 1), { y: 3.12, ry: 0.45 }),
      place(new IcosahedronGeometry(0.26, 0), { y: 3.42 }),
    ]),
    height: 3.6,
  };
}

/** Pagode: cones empilhados, silhueta em degraus. */
export function speciesPagoda() {
  const layers = [];
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    layers.push(place(new ConeGeometry(0.82 - t * 0.48, 0.52, 6, 1), {
      y: CANOPY_FLOOR + 0.36 + i * 0.48,
      ry: i * 0.52,
    }));
  }
  return { trunk: trunk(0.055, 0.115, 2.6, 5, 4), canopy: weld(layers), height: 4.2 };
}

/** Cogumelo: caule + chapéu em cúpula, ambos com origem em y = 0. */
export function mushroom() {
  const cap = new SphereGeometry(0.42, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  return {
    stem: trunk(0.05, 0.085, 0.62, 6, 2),
    cap: weld([
      place(cap, { y: 0.58, sy: 0.62 }),
      place(new ConeGeometry(0.42, 0.14, 9, 1), { y: 0.53, rx: Math.PI }), // aba por baixo
    ]),
  };
}

/** Cristal: bipirâmide alongada, base em y = 0. */
export function crystal() {
  return place(new OctahedronGeometry(0.3, 0), { y: 0.3, sy: 2.2, sx: 0.55, sz: 0.55 });
}

/** Lâmina de capim: 3 triângulos afunilando até a ponta, base em y = 0. */
export function blade(height = 0.42, width = 0.028) {
  const h = height;
  const v = [
    [-width, 0, 0], [width, 0, 0], [-width * 0.62, h * 0.5, 0.01],
    [width, 0, 0], [width * 0.62, h * 0.5, 0.01], [-width * 0.62, h * 0.5, 0.01],
    [-width * 0.62, h * 0.5, 0.01], [width * 0.62, h * 0.5, 0.01], [0, h, 0.02],
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v.flat()), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Samambaia: fronde arqueada com folíolos alternados. A curvatura vem de um
 * arco simples — folha de samambaia lida pela silhueta, não pelo detalhe.
 */
export function fern(length = 0.55, leaflets = 7) {
  const partes = [];
  for (let i = 0; i < leaflets; i++) {
    const t = (i + 1) / (leaflets + 1);
    const curva = t * t * 0.42;                  // ponta pende
    const tam = Math.sin(t * Math.PI) * 0.13 + 0.03;
    for (const lado of [-1, 1]) {
      partes.push(place(blade(tam, tam * 0.28), {
        x: lado * 0.012,
        y: length * t - curva,
        z: 0,
        rz: lado * (0.9 + t * 0.4),
        ry: lado * 0.25,
      }));
    }
  }
  partes.push(place(blade(length * 0.95, 0.008), { rx: 0.28 }));   // ráquis
  return weld(partes);
}

/** Junco: lâmina alta e fina, para variar altura no sub-bosque. */
export function reed(height = 1.15) {
  return weld([place(blade(height, 0.016), { rz: 0.06 })]);
}

/** Arbusto: aglomerado baixo de icosaedros. Preenche o vazio entre troncos. */
export function shrub() {
  const partes = [];
  const pontos = [
    [0, 0.26, 0, 0.28], [0.19, 0.20, 0.10, 0.20],
    [-0.16, 0.22, -0.12, 0.22], [0.05, 0.38, -0.16, 0.17],
  ];
  for (const [x, y, z, r] of pontos) {
    partes.push(place(new IcosahedronGeometry(r, 0), { x, y, z, sy: 0.8, ry: x + z }));
  }
  return weld(partes);
}

/** Flor: haste fina e cinco pétalas abertas. */
export function flower(height = 0.30) {
  const partes = [place(blade(height, 0.006), {})];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    partes.push(place(new IcosahedronGeometry(0.035, 0), {
      x: Math.cos(a) * 0.036,
      y: height,
      z: Math.sin(a) * 0.036,
      sy: 0.32, sx: 1.5, sz: 1.5,
      ry: a,
    }));
  }
  partes.push(place(new IcosahedronGeometry(0.022, 0), { y: height + 0.008, sy: 0.6 }));
  return weld(partes);
}

/**
 * Casulo pendurado: gota alongada com anéis, presa por um fio.
 * A origem fica no PONTO DE SUSPENSÃO, no alto — assim a instância é colocada
 * no galho e o casulo pende para baixo sozinho.
 */
export function cocoon(length = 0.16) {
  const corpo = new IcosahedronGeometry(0.045, 1);
  const fio = new CylinderGeometry(0.0035, 0.0035, 0.05, 4, 1, true);
  return weld([
    place(fio, { y: -0.025 }),
    place(corpo, { y: -0.05 - length * 0.5, sy: length / 0.09, sx: 0.85, sz: 0.85 }),
  ]);
}

/** Anel plano usado como retículo de posicionamento. */
export function reticleRing(radius = 0.2) {
  const g = new BufferGeometry();
  const seg = 40, verts = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    verts.push(...p(a0, 0), ...p(a1, 0), ...p(a1, radius));
    verts.push(...p(a0, 0), ...p(a1, radius), ...p(a0, radius));
  }
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return g;
}
