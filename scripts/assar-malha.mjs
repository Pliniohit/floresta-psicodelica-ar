#!/usr/bin/env node
/**
 * ASSA UM .glb NUMA MALHA QUE CABE NO HEADSET.
 *
 *   node scripts/assar-malha.mjs <arquivo.glb> <nome> [triângulos-alvo]
 *
 * Diferente de `assar-nuvem.mjs`, que joga fora a superfície e guarda pontos,
 * este mantém a MALHA — com normais, coordenadas de textura e a textura de cor
 * base — e só reduz a contagem de triângulos.
 *
 * POR QUE OS DOIS EXISTEM.
 *
 * A nuvem de pontos é a estética do projeto e é o certo para a vegetação
 * gerada por código: são milhares de plantas pequenas, e ponto é a forma mais
 * barata de sugerir volume. Mas ela não serve para UM objeto grande e perto do
 * olho: a dois metros, uma árvore de quarenta e seis mil pontos vira um monte
 * de bolinhas, porque a distância entre pontos vizinhos passa a ser maior que
 * o detalhe que eles deveriam descrever. Aí o que se quer é o objeto como ele
 * é — malha, textura, silhueta contínua.
 *
 * COMO A REDUÇÃO FUNCIONA: agrupamento por célula.
 *
 * O espaço do modelo é dividido numa grade. Todo vértice que cai na mesma
 * célula vira UM vértice só, na média das posições, normais e coordenadas de
 * textura do grupo. Os triângulos são reescritos com os novos índices, e os
 * que ficaram com dois ou três cantos no mesmo vértice — que colapsaram — são
 * descartados.
 *
 * É a redução mais simples que existe e não é a de melhor qualidade: um
 * algoritmo de colapso de arestas por erro quadrático preserva melhor as
 * silhuetas. Mas ela tem duas propriedades que importam mais aqui: é
 * previsível (o tamanho da célula controla o resultado diretamente) e é
 * robusta em malha de fotogrametria, que costuma vir com buracos, faces soltas
 * e vértices duplicados — exatamente o tipo de entrada em que os algoritmos
 * bons travam ou produzem lixo.
 *
 * A grade é escolhida por BUSCA: o script tenta resoluções até a contagem de
 * triângulos cair na faixa pedida. Chutar a resolução é chutar o resultado.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [, , caminho, nome, alvoArg] = process.argv;
if (!caminho || !nome) {
  console.error('uso: node scripts/assar-malha.mjs <arquivo.glb> <nome> [triângulos-alvo]');
  process.exit(1);
}
const ALVO = Number(alvoArg ?? 60000);

// --- 1. abrir o contêiner GLB -------------------------------------------
const buf = readFileSync(resolve(caminho));
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB');

let off = 12, json = null, bin = null;
while (off < buf.length) {
  const tam = buf.readUInt32LE(off);
  const tipo = buf.readUInt32LE(off + 4);
  const dados = buf.subarray(off + 8, off + 8 + tam);
  if (tipo === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(dados));
  if (tipo === 0x004e4942) bin = dados;
  off += 8 + tam + ((4 - (tam % 4)) % 4);
}
if (!json) throw new Error('GLB sem pedaço JSON');

const TAMANHO = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function lerAcessor(i) {
  const a = json.accessors[i];
  const n = COMPONENTES[a.type];
  const out = new Float64Array(a.count * n);
  if (a.bufferView === undefined) return out;
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const passo = bv.byteStride || TAMANHO[a.componentType] * n;
  for (let e = 0; e < a.count; e++) {
    for (let c = 0; c < n; c++) {
      const p = base + e * passo + c * TAMANHO[a.componentType];
      let v;
      switch (a.componentType) {
        case 5126: v = bin.readFloatLE(p); break;
        case 5125: v = bin.readUInt32LE(p); break;
        case 5123: v = bin.readUInt16LE(p); break;
        case 5121: v = bin.readUInt8(p); break;
        case 5122: v = bin.readInt16LE(p); break;
        default: v = bin.readInt8(p);
      }
      out[e * n + c] = v;
    }
  }
  return out;
}

// --- 2. transformações dos nós ------------------------------------------
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mult(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let l = 0; l < 4; l++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + l] * b[c * 4 + k];
      o[c * 4 + l] = s;
    }
  }
  return o;
}

function matrizDoNo(no) {
  if (no.matrix) return no.matrix.slice();
  const [tx, ty, tz] = no.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = no.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = no.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const pontoPor = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const direcaoPor = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z,
  m[1] * x + m[5] * y + m[9] * z,
  m[2] * x + m[6] * y + m[10] * z,
];

// --- 3. juntar tudo num só conjunto de vértices e triângulos ------------
const vx = [], vn = [], vu = [], tri = [];
let malhas = 0;

function visitar(indice, pai) {
  const no = json.nodes[indice];
  const m = mult(pai, matrizDoNo(no));
  if (no.mesh !== undefined) {
    for (const prim of json.meshes[no.mesh].primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      if (prim.attributes.POSITION === undefined) continue;
      malhas++;
      const pos = lerAcessor(prim.attributes.POSITION);
      const nrm = prim.attributes.NORMAL !== undefined
        ? lerAcessor(prim.attributes.NORMAL) : null;
      const uv = prim.attributes.TEXCOORD_0 !== undefined
        ? lerAcessor(prim.attributes.TEXCOORD_0) : null;
      const base = vx.length / 3;
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        vx.push(...pontoPor(m, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
        if (nrm) vn.push(...direcaoPor(m, nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]));
        else vn.push(0, 1, 0);
        vu.push(uv ? uv[i * 2] : 0, uv ? uv[i * 2 + 1] : 0);
      }
      const idx = prim.indices !== undefined
        ? lerAcessor(prim.indices)
        : Float64Array.from({ length: n }, (_, i) => i);
      for (let t = 0; t + 2 < idx.length; t += 3) {
        tri.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
      }
    }
  }
  for (const filho of no.children ?? []) visitar(filho, m);
}

const cena = json.scenes[json.scene ?? 0];
for (const raiz of cena.nodes) visitar(raiz, ident());
if (!tri.length) throw new Error('nenhum triângulo encontrado');

const nVertOrig = vx.length / 3;
const nTriOrig = tri.length / 3;

// --- 4. caixa e normalização --------------------------------------------
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < nVertOrig; i++) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], vx[i * 3 + k]);
    max[k] = Math.max(max[k], vx[i * 3 + k]);
  }
}
// Centrada na base, e o maior lado valendo 1: a mesma convenção da nuvem, para
// quem usa só precisar multiplicar pelo tamanho em metros.
const centro = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
const alcance = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
for (let i = 0; i < nVertOrig; i++) {
  for (let k = 0; k < 3; k++) vx[i * 3 + k] = (vx[i * 3 + k] - centro[k]) / alcance;
}

// --- 5. redução por agrupamento em grade --------------------------------
/** Agrupa numa grade de `res` células por lado e devolve a malha reduzida. */
function reduzir(res) {
  // A caixa normalizada vai de -0,5 a 0,5 em X e Z, e de 0 a ~1 em Y.
  const cel = 1 / res;
  const chave = new Map();
  const mapa = new Int32Array(nVertOrig).fill(-1);
  const acc = [];   // [x, y, z, nx, ny, nz, peso]
  // A COORDENADA DE TEXTURA NÃO É MEDIADA — é ESCOLHIDA.
  //
  // Posição e normal podem ser mediadas porque o espaço é contínuo: a média
  // entre dois pontos vizinhos é um ponto vizinho dos dois. O atlas de textura
  // NÃO é contínuo: ele é um mosaico de ilhas, e a média entre duas ilhas cai
  // no vão entre elas — uma região que não pertence a superfície nenhuma.
  //
  // Na cena isso aparecia como lâminas pálidas e chapadas atravessando a copa,
  // pintadas com o pedaço errado da fotografia.
  //
  // Separar as ilhas na chave de agrupamento resolveria, mas a um custo
  // absurdo: numa malha de fotogrametria as coordenadas variam depressa, quase
  // nada se funde, e o modelo saltou de 35 mil para 256 mil vértices. Escolher
  // um representante custa nada e é sempre uma coordenada VERDADEIRA, de um
  // vértice que existia. Fica a de quem está mais perto do centro da célula,
  // que é o vértice mais representativo do grupo.
  const uvEscolhida = [];   // [u, v, distância² até o centro da célula]

  for (let i = 0; i < nVertOrig; i++) {
    const cx = Math.floor((vx[i * 3] + 0.5) / cel);
    const cy = Math.floor(vx[i * 3 + 1] / cel);
    const cz = Math.floor((vx[i * 3 + 2] + 0.5) / cel);
    const k = `${cx},${cy},${cz}`;
    let j = chave.get(k);
    if (j === undefined) {
      j = acc.length / 7;
      chave.set(k, j);
      acc.push(0, 0, 0, 0, 0, 0, 0);
      uvEscolhida.push(0, 0, Infinity);
    }
    const o = j * 7;
    acc[o] += vx[i * 3]; acc[o + 1] += vx[i * 3 + 1]; acc[o + 2] += vx[i * 3 + 2];
    acc[o + 3] += vn[i * 3]; acc[o + 4] += vn[i * 3 + 1]; acc[o + 5] += vn[i * 3 + 2];
    acc[o + 6] += 1;

    // Quem está mais perto do centro da célula fica com o direito de dizer a
    // coordenada de textura do grupo.
    const dx = (vx[i * 3] + 0.5) / cel - (cx + 0.5);
    const dy = vx[i * 3 + 1] / cel - (cy + 0.5);
    const dz = (vx[i * 3 + 2] + 0.5) / cel - (cz + 0.5);
    const d2 = dx * dx + dy * dy + dz * dz;
    const q = j * 3;
    if (d2 < uvEscolhida[q + 2]) {
      uvEscolhida[q] = vu[i * 2];
      uvEscolhida[q + 1] = vu[i * 2 + 1];
      uvEscolhida[q + 2] = d2;
    }
    mapa[i] = j;
  }

  const nv = acc.length / 7;
  const P = new Float64Array(nv * 3);
  const N = new Float64Array(nv * 3);
  const U = new Float64Array(nv * 2);
  for (let j = 0; j < nv; j++) {
    const o = j * 7, w = acc[o + 6] || 1;
    P[j * 3] = acc[o] / w; P[j * 3 + 1] = acc[o + 1] / w; P[j * 3 + 2] = acc[o + 2] / w;
    const c = Math.hypot(acc[o + 3], acc[o + 4], acc[o + 5]) || 1;
    N[j * 3] = acc[o + 3] / c; N[j * 3 + 1] = acc[o + 4] / c; N[j * 3 + 2] = acc[o + 5] / c;
    U[j * 2] = uvEscolhida[j * 3]; U[j * 2 + 1] = uvEscolhida[j * 3 + 1];
  }

  const I = [];
  // O TETO DE ARESTA — o que separa uma redução usável de uma cheia de lonas.
  //
  // Agrupar por célula funde vértices vizinhos, e isso é o que se quer. Mas
  // numa malha de fotogrametria há superfícies finas que passam perto umas das
  // outras sem se tocar — folha na frente de folha, vinha rente ao tronco. Se
  // as duas caem na mesma célula, elas viram um vértice só, e o triângulo que
  // sobra ESTICA de um lado ao outro do vão: aparece na cena como uma lona
  // achatada atravessando a copa, que é o artefato mais feio possível numa
  // árvore.
  //
  // Duas células é a folga: um triângulo legítimo, depois da fusão, tem lado
  // da ordem de uma célula. Muito mais que isso é costura entre superfícies
  // que não eram vizinhas — e num objeto de sete metros a três de distância,
  // uma dessas costuras ocupa graus inteiros do campo de visão.
  const limite = cel * 2.0;
  // E o mesmo teto NO ATLAS. Um triângulo cujos três cantos herdaram
  // coordenadas de ilhas diferentes fica esticado sobre a fotografia inteira:
  // ele existe no espaço, mas é pintado com um borrão de tudo o que estiver no
  // caminho entre as ilhas. Um quinto do atlas é folga larga — triângulo
  // legítimo ocupa uma fração muito menor.
  const limiteUV = 0.5;
  let cortados = 0;
  const dist = (a, b) => Math.hypot(
    P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  const distUV = (a, b) => Math.hypot(
    U[a * 2] - U[b * 2], U[a * 2 + 1] - U[b * 2 + 1]);
  for (let t = 0; t < tri.length; t += 3) {
    const a = mapa[tri[t]], b = mapa[tri[t + 1]], c = mapa[tri[t + 2]];
    // Colapsado: dois ou três cantos na mesma célula. O triângulo virou linha
    // ou ponto, e desenhar isso só custa vértice.
    if (a === b || b === c || a === c) continue;
    if (dist(a, b) > limite || dist(b, c) > limite || dist(a, c) > limite) {
      cortados++;
      continue;
    }
    if (distUV(a, b) > limiteUV || distUV(b, c) > limiteUV || distUV(a, c) > limiteUV) {
      cortados++;
      continue;
    }
    I.push(a, b, c);
  }
  return { P, N, U, I, nv, nt: I.length / 3, cortados };
}

// A BUSCA pela resolução. Duplicar a resolução multiplica os triângulos por
// cerca de quatro, então uma busca binária em poucas rodadas chega perto.
let lo = 8, hi = 512, melhor = null;
for (let passo = 0; passo < 12; passo++) {
  const res = Math.round((lo + hi) / 2);
  const r = reduzir(res);
  if (!melhor || Math.abs(r.nt - ALVO) < Math.abs(melhor.nt - ALVO)) {
    melhor = r; melhor.res = res;
  }
  if (r.nt > ALVO) hi = res - 1; else lo = res + 1;
  if (lo > hi) break;
}
const { P, N, U, I, nv, nt, res, cortados } = melhor;
if (nv > 65535) {
  console.warn(`${nv} vértices: os índices vão em 32 bits, e o arquivo dobra`);
}

// --- 6. a textura de cor base -------------------------------------------
const mat = json.materials?.[0];
const iTex = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
const iImg = iTex !== undefined ? json.textures[iTex].source : undefined;
let textura = null;
if (iImg !== undefined) {
  const bv = json.bufferViews[json.images[iImg].bufferView];
  const jpg = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const tmpJ = resolve(tmpdir(), `malha-${process.pid}.jpg`);
  writeFileSync(tmpJ, jpg);
  const destino = resolve(`assets/${nome}.jpg`);
  mkdirSync(dirname(destino), { recursive: true });
  // 2048 é o teto útil: a árvore ocupa metros de tela num headset, e acima
  // disso o ganho some contra o custo de memória de vídeo.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmpJ,
    '-vf', 'scale=2048:2048', '-q:v', '4', destino]);
  textura = destino;
}

// --- 7. escrever ---------------------------------------------------------
const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');

const qP = new Int16Array(nv * 3);
for (let i = 0; i < nv * 3; i++) qP[i] = Math.max(-32767, Math.min(32767, Math.round(P[i] * 32767)));
const qN = new Int8Array(nv * 3);
for (let i = 0; i < nv * 3; i++) qN[i] = Math.max(-127, Math.min(127, Math.round(N[i] * 127)));
// AS COORDENADAS DE TEXTURA VÃO INTEIRAS, e não pela fração.
//
// A primeira versão guardava só `u - floor(u)`, no raciocínio de que a textura
// repete e portanto a parte inteira não importa. Ela importa MUITO: um
// triângulo que cruza a borda do ladrilho tem cantos em, digamos, 0,98, 1,02 e
// 1,05 — e reduzidos à fração viram 0,98, 0,02 e 0,05. O triângulo passa a
// varrer a textura inteira ao contrário, e na cena isso aparece como lâminas
// grandes, chapadas e pálidas atravessando a copa. Foi exatamente o defeito
// que a árvore mostrava.
//
// Guardadas dentro da caixa real das coordenadas, com o mesmo 16 bits, elas
// atravessam a borda do ladrilho como sempre atravessaram, e quem repete é o
// modo de repetição da textura — que é de quem é esse trabalho.
let uMin = Infinity, vMin = Infinity, uMax = -Infinity, vMax = -Infinity;
for (let i = 0; i < nv; i++) {
  uMin = Math.min(uMin, U[i * 2]); uMax = Math.max(uMax, U[i * 2]);
  vMin = Math.min(vMin, U[i * 2 + 1]); vMax = Math.max(vMax, U[i * 2 + 1]);
}
const uAmp = (uMax - uMin) || 1, vAmp = (vMax - vMin) || 1;
const qU = new Uint16Array(nv * 2);
for (let i = 0; i < nv; i++) {
  qU[i * 2] = Math.round(((U[i * 2] - uMin) / uAmp) * 65535);
  qU[i * 2 + 1] = Math.round(((U[i * 2 + 1] - vMin) / vAmp) * 65535);
}
const idx32 = nv > 65535;
const qI = idx32 ? new Uint32Array(I) : new Uint16Array(I);

const destino = resolve(`src/malhas/${nome}.js`);
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `// GERADO POR scripts/assar-malha.mjs — não editar à mão.
//
// "${caphtml(caminho.split('/').pop())}" reduzido de ${nTriOrig.toLocaleString('pt-BR')} para
// ${nt.toLocaleString('pt-BR')} triângulos por agrupamento em grade de ${res} células por lado.
// Ver o cabeçalho do script para o método e o porquê.
//
// Posições em 16 bits, normais em 8, coordenadas de textura em 16. A malha vem
// centrada na base e normalizada para o maior lado medir 1: multiplique pelo
// tamanho em metros que quiser.
export const TRIANGULOS = ${nt};
export const VERTICES = ${nv};
/** A caixa das coordenadas de textura, para desfazer a quantização. */
const UV_MIN = [${uMin}, ${vMin}];
const UV_AMP = [${uAmp}, ${vAmp}];
export const TEXTURA = ${textura ? `'assets/${nome}.jpg'` : 'null'};

const P = '${b64(qP)}';
const N = '${b64(qN)}';
const U = '${b64(qU)}';
const I = '${b64(qI)}';

const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function malha() {
  const p = new Int16Array(bytes(P).buffer);
  const n = new Int8Array(bytes(N).buffer);
  const u = new Uint16Array(bytes(U).buffer);
  const pos = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) pos[i] = p[i] / 32767;
  const nrm = new Float32Array(n.length);
  for (let i = 0; i < n.length; i++) nrm[i] = n[i] / 127;
  const uv = new Float32Array(u.length);
  for (let i = 0; i < u.length / 2; i++) {
    uv[i * 2] = UV_MIN[0] + (u[i * 2] / 65535) * UV_AMP[0];
    uv[i * 2 + 1] = UV_MIN[1] + (u[i * 2 + 1] / 65535) * UV_AMP[1];
  }
  return {
    posicao: pos,
    normal: nrm,
    uv,
    indice: new ${idx32 ? 'Uint32Array' : 'Uint16Array'}(bytes(I).buffer),
  };
}
`);

function caphtml(s) { return String(s).replace(/[<>]/g, ''); }

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`${malhas} malha(s) · ${nTriOrig.toLocaleString('pt-BR')} triângulos, ${nVertOrig.toLocaleString('pt-BR')} vértices`);
console.log(`grade de ${res} → ${nt.toLocaleString('pt-BR')} triângulos, ${nv.toLocaleString('pt-BR')} vértices`);
console.log(`${cortados.toLocaleString('pt-BR')} triângulos esticados descartados (costura entre superfícies)`);
console.log(`caixa: ${(max[0] - min[0]).toFixed(2)} x ${(max[1] - min[1]).toFixed(2)} x ${(max[2] - min[2]).toFixed(2)}`);
console.log(`-> src/malhas/${nome}.js  (${kb(b64(qP).length + b64(qN).length + b64(qU).length + b64(qI).length)})`);
if (textura) console.log(`-> ${textura}`);
