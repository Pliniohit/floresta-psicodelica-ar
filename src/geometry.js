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
  out.setAttribute('aSmoothN', new BufferAttribute(smoothNormals(out), 3));

  for (const g of geos) g.dispose();
  for (const g of parts) if (!geos.includes(g)) g.dispose();
  return out;
}

/**
 * A NORMAL LISA, guardada ao lado da facetada.
 *
 * Sem índice, cada vértice carrega a normal da sua face — é isso que produz o
 * sombreamento facetado, e é de propósito. Mas para poder SAIR do low poly sem
 * refazer malha nenhuma em tempo de execução, a normal suave viaja junto, num
 * segundo atributo, e o shader mistura as duas conforme o pincel entra.
 *
 * Suavizar é somar as normais de todas as faces que tocam o mesmo ponto. Como
 * a malha é não indexada, "o mesmo ponto" precisa ser descoberto pela posição
 * — daí o arredondamento a um décimo de milímetro, que junta o que é o mesmo
 * vértice sem juntar o que só está perto.
 */
function smoothNormals(geo) {
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const n = pos.length / 3;

  const soma = new Map();
  const chave = (i) => `${Math.round(pos[i * 3] * 1e4)},`
    + `${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;

  for (let i = 0; i < n; i++) {
    const k = chave(i);
    const acc = soma.get(k) ?? [0, 0, 0];
    acc[0] += nrm[i * 3]; acc[1] += nrm[i * 3 + 1]; acc[2] += nrm[i * 3 + 2];
    soma.set(k, acc);
  }

  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = soma.get(chave(i));
    const m = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / m; out[i * 3 + 1] = y / m; out[i * 3 + 2] = z / m;
  }
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

/**
 * FRUTOS.
 *
 * Octaedros de seis centímetros pendurados sob as massas de folha. Oito
 * triângulos cada um: uma esfera de verdade custaria vinte vezes mais para
 * ler igual a esta distância.
 *
 * Vêm em malha separada porque a cor é outra — o material da copa é folha, e
 * fruta verde-folha não é fruta.
 */
function frutos(pontos, raio = 0.058) {
  return weld(pontos.map(([x, y, z], i) => place(new OctahedronGeometry(raio, 0), {
    x, y, z, sy: 1.35, ry: i * 0.7,   // levemente alongado, como uma baga
  })));
}

/** Torre: alta e magra, copa em três bolhas empilhadas fora de eixo. */
export function speciesTower() {
  return {
    trunk: trunk(0.055, 0.125, 2.75, 5, 4),
    canopy: weld([
      place(new IcosahedronGeometry(0.58, 0), { y: 2.98, sy: 0.85, rz: 0.3 }),
      place(new IcosahedronGeometry(0.42, 0), { x: 0.18, y: 3.54, z: -0.12, sy: 0.9, rx: 0.5 }),
      place(new IcosahedronGeometry(0.30, 0), { x: -0.12, y: 3.96, z: 0.14, ry: 0.8 }),
    ]),
    fruit: frutos([
      [0.22, 2.62, 0.10], [-0.26, 2.70, -0.16],
      [0.30, 3.24, -0.20], [-0.10, 3.32, 0.24], [0.06, 3.72, 0.02],
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
    fruit: frutos([
      [0.72, 2.40, 0.30], [-0.55, 2.38, 0.62], [0.10, 2.36, -0.80],
      [-0.82, 2.42, -0.22], [0.58, 2.44, 0.75],
    ]),
    height: 3.6,
  };
}

/**
 * Árvore de galhos: tronco que se abre em quatro braços, cada um terminando
 * numa massa de folha, com frutos pendurados.
 *
 * É a que o casulo escolhe. As outras duas são silhuetas — bolhas empilhadas
 * e dossel de guarda-chuva; esta é a única com galho de verdade, e é dela que
 * o casulo pende.
 */
export function speciesBranched() {
  const tronco = [place(new CylinderGeometry(0.075, 0.17, 2.35, 6, 3, true), { y: 1.175 })];

  // Alturas, azimutes e inclinações diferentes de propósito: quatro galhos
  // iguais girados em torno do eixo leem como antena, não como árvore.
  const galhos = [
    { y: 1.95, az: 0.40, incl: 0.85, comp: 1.20, folha: 0.52 },
    { y: 2.16, az: 2.05, incl: 0.70, comp: 1.05, folha: 0.46 },
    { y: 2.30, az: 3.70, incl: 0.95, comp: 1.30, folha: 0.56 },
    { y: 2.15, az: 5.10, incl: 0.62, comp: 0.95, folha: 0.44 },
  ];

  const copa = [];
  const bagas = [];

  for (const g of galhos) {
    const braco = new CylinderGeometry(0.020, 0.058, g.comp, 5, 2, true);
    place(braco, { y: g.comp / 2 });                    // base na origem
    place(braco, { rz: g.incl, ry: g.az, y: g.y });     // inclina, gira, sobe
    tronco.push(braco);

    // Ponta do galho: para onde (0,1,0) foi parar depois das duas rotações.
    const sx = -Math.sin(g.incl) * Math.cos(g.az);
    const sz = Math.sin(g.incl) * Math.sin(g.az);
    const sy = Math.cos(g.incl);
    const px = sx * g.comp, py = g.y + sy * g.comp, pz = sz * g.comp;

    copa.push(place(new IcosahedronGeometry(g.folha, 0), {
      x: px + sx * 0.12, y: py + 0.10, z: pz + sz * 0.12,
      sy: 0.82, ry: g.az,
    }));

    // Duas bagas por galho, penduradas por baixo da massa de folha.
    bagas.push([px + sx * 0.30, py - g.folha * 0.55, pz + sz * 0.10]);
    bagas.push([px - sz * 0.26, py - g.folha * 0.68, pz + sx * 0.22]);
  }

  // Coroa central, fechando a forquilha por cima.
  copa.push(place(new IcosahedronGeometry(0.50, 0), { y: 3.02, sy: 0.78, rz: 0.25 }));
  bagas.push([0.16, 2.62, -0.10]);
  bagas.push([-0.20, 2.58, 0.14]);

  return {
    trunk: weld(tronco),
    canopy: weld(copa),
    fruit: frutos(bagas),
    height: 3.7,
  };
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
 * O CASULO — uma crisálida, e não uma pedrinha pendurada.
 *
 * A versão anterior era um icosaedro de subdivisão 1 esticado: quarenta faces
 * de pedra rolada num fio. Como é o objeto que a pessoa procura, aponta e
 * toca — a única porta de saída do cenário — ele é o que menos podia ser um
 * placeholder.
 *
 * Agora a forma é REVOLUCIONADA a partir de um perfil, que é como uma
 * crisálida se descreve de verdade: o cremaster fino onde ela se prende ao
 * galho, o abdome que engorda logo abaixo, a maior largura no terço superior
 * (onde ficam as asas dobradas) e a ponta afilando embaixo. O perfil é uma
 * função da altura, então mudar a silhueta é mudar uma linha.
 *
 * Dois detalhes que fazem a leitura:
 *
 * As COSTELAS. Um leve ondular ao longo da altura, na frequência dos
 * segmentos do abdome. Sem elas a forma é lisa e lê como gota; com elas, lê
 * como bicho.
 *
 * A SEÇÃO NÃO É CIRCULAR. Uma crisálida é achatada de lado, com uma quina
 * suave na frente. Aqui isso entra como uma modulação da largura em torno do
 * eixo — barato, e é o que tira a aparência de pião torneado.
 *
 * As normais saem SUAVES, e é a única coisa da cena que não é facetada de
 * propósito: casulo é liso e encerado, e a faceta destruía justamente a
 * sensação de superfície tensa que o objeto precisa ter.
 */
export function cocoon(length = 0.20, comFio = true) {
  const ANEIS = 26;      // ao longo da altura
  const LADOS = 20;      // em volta do eixo

  const R = length * 0.30;   // maior raio, em fração do comprimento

  /** Raio do perfil na altura t (0 no topo, 1 na ponta de baixo). */
  const perfil = (t) => {
    // Ombro cheio no terço de cima, afilando até a ponta: as duas potências
    // diferentes é que dão a assimetria — crisálida não é um elipsoide.
    const corpo = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.78);
    // Costelas do abdome, só na metade de baixo e cada vez mais fundas.
    const costela = 1 + Math.sin(t * Math.PI * 9.0) * 0.045 * smooth(t, 0.42, 0.95);
    return corpo * costela;
  };

  const pos = [];
  const empurra = (t, i) => {
    const ang = (i / LADOS) * Math.PI * 2;
    // Achatamento lateral e uma quina suave na frente.
    const oval = 1 - 0.22 * Math.abs(Math.sin(ang));
    const quina = 1 + 0.05 * Math.cos(ang * 2);
    const r = perfil(t) * R * oval * quina;
    return [Math.cos(ang) * r, -t * length, Math.sin(ang) * r];
  };

  for (let a = 0; a < ANEIS; a++) {
    const t0 = a / ANEIS, t1 = (a + 1) / ANEIS;
    for (let i = 0; i < LADOS; i++) {
      const p00 = empurra(t0, i), p01 = empurra(t0, i + 1);
      const p10 = empurra(t1, i), p11 = empurra(t1, i + 1);
      pos.push(...p00, ...p10, ...p11);
      pos.push(...p00, ...p11, ...p01);
    }
  }

  const corpo = new BufferGeometry();
  corpo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  // Normais SUAVES: um casulo é liso e encerado. Aqui a faceta, que é o
  // visual de todo o resto, trabalharia contra a leitura do objeto.
  corpo.computeVertexNormals();
  suavizarNormais(corpo);

  if (!comFio) {
    const so = weld([corpo]);
    suavizarNormais(so);
    return so;
  }

  // O CREMASTER: o fio de seda curto que prende ao galho. Fino e cônico, e é
  // ele que diz que a coisa está PENDURADA em vez de flutuando.
  //
  // O HALO pede este mesmo casulo SEM o fio. Ele infla a malha empurrando cada
  // vértice cinco centímetros ao longo da normal, e num fio de dois
  // milímetros de raio isso não é um halo: é uma trombeta de cinco
  // centímetros saindo do topo, maior que o próprio casulo.
  const fio = place(new CylinderGeometry(0.0022, 0.006, 0.055, 6, 1, true),
    { y: 0.026 });

  const g = weld([fio, corpo]);
  suavizarNormais(g);
  return g;
}

/** Suavização em degrau, para as costelas nascerem no meio do corpo. */
function smooth(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Média as normais dos vértices que ocupam a mesma posição.
 *
 * `weld` deixa tudo facetado de propósito — é o visual da floresta inteira.
 * O casulo é a exceção, e como ele não tem índice, a única forma de suavizar
 * é achar os vértices coincidentes e somar as normais deles.
 */
function suavizarNormais(geo) {
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const mapa = new Map();
  const chave = (i) => `${Math.round(p[i] * 1e4)},${Math.round(p[i + 1] * 1e4)},${Math.round(p[i + 2] * 1e4)}`;
  for (let i = 0; i < p.length; i += 3) {
    const k = chave(i);
    let acc = mapa.get(k);
    if (!acc) { acc = [0, 0, 0, []]; mapa.set(k, acc); }
    acc[0] += n[i]; acc[1] += n[i + 1]; acc[2] += n[i + 2];
    acc[3].push(i);
  }
  for (const [, acc] of mapa) {
    const c = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    for (const i of acc[3]) {
      n[i] = acc[0] / c; n[i + 1] = acc[1] / c; n[i + 2] = acc[2] / c;
    }
  }
  geo.attributes.normal.needsUpdate = true;
  return geo;
}

/**
 * A RAIZ — a porta que leva para dentro, no pé da árvore.
 *
 * Ela é o espelho do casulo, e foi desenhada como tal: onde o casulo é um
 * corpo fechado pendurado que se abre para CIMA, esta é uma boca aberta no
 * chão que desce. O casulo afina para baixo; esta afina para cima e engorda
 * ao encontrar a terra.
 *
 * A forma tem duas partes:
 *
 * O BULBO, revolucionado a partir de um perfil, como o casulo — largo na base
 * e estrangulado no alto, o que faz o olho ler "isto entra no chão" em vez de
 * "isto é uma pedra apoiada".
 *
 * Os BRAÇOS: seis raízes saindo do bulbo, arqueando para fora e mergulhando.
 * Sem elas o bulbo é um caroço; com elas, o chão em volta passa a fazer parte
 * do objeto, e é isso que diz que há um sistema inteiro embaixo.
 *
 * O centro fica ABERTO — o topo do bulbo não é tampado. É por esse buraco que
 * a luz do magma sobe, e é ele que precisa ser reconhecido como passagem.
 */
export function raiz(raio = 0.26) {
  const ANEIS = 18;
  const LADOS = 18;
  const ALTURA = raio * 1.15;

  /** Raio do perfil na altura t (0 no chão, 1 no alto da boca). */
  const perfil = (t) => {
    // Larga embaixo, estrangulando no alto: um funil invertido, que é a forma
    // de qualquer coisa que some na terra.
    const base = Math.pow(1 - t, 0.55);
    // Uma cintura no meio, para não virar um cone liso.
    return base * (1 - 0.22 * Math.sin(t * Math.PI));
  };

  const pos = [];
  const ponto = (t, i) => {
    const ang = (i / LADOS) * Math.PI * 2;
    // Seção ondulada: raiz não tem seção circular, tem gomo.
    const gomo = 1 + 0.09 * Math.cos(ang * 5.0 + t * 2.0);
    const r = perfil(t) * raio * gomo;
    return [Math.cos(ang) * r, t * ALTURA, Math.sin(ang) * r];
  };

  for (let a = 0; a < ANEIS; a++) {
    const t0 = a / ANEIS, t1 = (a + 1) / ANEIS;
    for (let i = 0; i < LADOS; i++) {
      const p00 = ponto(t0, i), p01 = ponto(t0, i + 1);
      const p10 = ponto(t1, i), p11 = ponto(t1, i + 1);
      pos.push(...p00, ...p10, ...p11);
      pos.push(...p00, ...p11, ...p01);
    }
  }

  const bulbo = new BufferGeometry();
  bulbo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  bulbo.computeVertexNormals();

  // Os braços. Cada um é um cone deitado, inclinado para fora e para baixo,
  // com um giro próprio para nenhum ficar paralelo ao vizinho.
  const bracos = [];
  const N = 6;
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * Math.PI * 2 + 0.4;
    const comp = raio * (1.5 + (k % 3) * 0.35);
    const cone = new ConeGeometry(raio * 0.20, comp, 6, 1, true);
    // O cone nasce ao longo de +Y. Tombar em Z e depois girar em Y é a ordem
    // que a Euler 'XYZ' do three aplica de dentro para fora — tombar primeiro,
    // apontar depois. Fazer o contrário (tombar em X e girar em Y) empurra
    // todos os braços para o mesmo lado, e o objeto sai torto.
    bracos.push(place(cone, {
      rz: -(Math.PI * 0.5 + 0.55),
      ry: -ang,
      x: Math.cos(ang) * comp * 0.42,
      y: ALTURA * 0.16 - comp * 0.16,
      z: Math.sin(ang) * comp * 0.42,
    }));
  }

  return weld([bulbo, ...bracos]);
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

/**
 * AMOSTRA PONTOS NA SUPERFÍCIE de uma geometria, ponderando por ÁREA.
 *
 * É o coração do estudo de nuvem de pontos. A ponderação por área é a parte
 * que não dá para pular: sorteando triângulos por igual, a nuvem acumula
 * pontos onde a malha é mais detalhada — a copa de uma árvore fica densa nos
 * cantinhos e rala nas faces grandes, e a silhueta se perde. Ponderando pela
 * área, a densidade fica uniforme na SUPERFÍCIE, que é o que faz a nuvem ter
 * a forma do objeto.
 *
 * O sorteio dentro do triângulo usa a raiz do primeiro número aleatório. Sem
 * a raiz, as coordenadas baricêntricas se concentram num canto: é o erro
 * clássico, e produz nuvem com veios.
 *
 * @param {THREE.BufferGeometry} geo  malha de origem (não indexada ou não)
 * @param {number} quantos            quantos pontos gerar
 * @param {() => number} r            fonte de aleatoriedade, para ser repetível
 * @returns {Float32Array} posições, em espaço de objeto
 */
export function samplePoints(geo, quantos, r = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position.array;
  const nTri = pos.length / 9;
  if (nTri < 1 || quantos < 1) return new Float32Array(0);

  // Soma acumulada das áreas: sortear um número nela e procurar por busca
  // binária dá exatamente a probabilidade proporcional à área.
  const acum = new Float64Array(nTri);
  let total = 0;
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3] - ax, by = pos[o + 4] - ay, bz = pos[o + 5] - az;
    const cx = pos[o + 6] - ax, cy = pos[o + 7] - ay, cz = pos[o + 8] - az;
    // Metade da norma do produto vetorial é a área do triângulo.
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    total += Math.hypot(nx, ny, nz) * 0.5;
    acum[t] = total;
  }
  if (total <= 0) return new Float32Array(0);

  const out = new Float32Array(quantos * 3);
  for (let i = 0; i < quantos; i++) {
    const alvo = r() * total;
    let lo = 0, hi = nTri - 1;
    while (lo < hi) {
      const meio = (lo + hi) >> 1;
      if (acum[meio] < alvo) lo = meio + 1; else hi = meio;
    }
    const o = lo * 9;

    // Baricêntricas uniformes. A raiz é o que impede a concentração no canto.
    const s = Math.sqrt(r());
    const t2 = r();
    const u = 1 - s, v = s * (1 - t2), w = s * t2;

    out[i * 3] = pos[o] * u + pos[o + 3] * v + pos[o + 6] * w;
    out[i * 3 + 1] = pos[o + 1] * u + pos[o + 4] * v + pos[o + 7] * w;
    out[i * 3 + 2] = pos[o + 2] * u + pos[o + 5] * v + pos[o + 8] * w;
  }
  if (g !== geo) g.dispose();
  return out;
}
