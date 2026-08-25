#!/usr/bin/env node
/**
 * ASSA UM .glb NUMA NUVEM DE PONTOS.
 *
 *   node scripts/assar-nuvem.mjs <arquivo.glb> <nome> [quantos]
 *
 * Lê o modelo, amostra pontos na superfície ponderando por ÁREA e escreve um
 * módulo em src/nuvens/<nome>.js com as coordenadas — e só elas.
 *
 * POR QUE ASSAR EM VEZ DE CARREGAR.
 *
 * O projeto não tem loader de glTF: o three.js aqui é vendorizado sem os
 * loaders, não há CDN e não há dependência externa nenhuma. Carregar .glb em
 * tempo de execução significaria trazer o GLTFLoader, o arquivo inteiro e uma
 * etapa assíncrona no meio da entrada em AR.
 *
 * Assar resolve os três: o loader não existe, o arquivo não viaja, e a nuvem
 * já está pronta quando a cena monta. É a recomendação que o próprio estudo
 * de partículas deixou escrita — "amostrar os pontos uma vez e salvar só as
 * coordenadas resolveria, dispensando o modelo".
 *
 * As coordenadas saem QUANTIZADAS em 16 bits dentro da caixa do modelo. A
 * precisão que sobra é da ordem de centésimos de milímetro numa borboleta de
 * dez centímetros — muito além do que um ponto de luz de três pixels pede — e
 * o arquivo fica quatro vezes menor que em float de 32 bits.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , caminho, nome, quantosArg] = process.argv;
if (!caminho || !nome) {
  console.error('uso: node scripts/assar-nuvem.mjs <arquivo.glb> <nome> [quantos]');
  process.exit(1);
}
const QUANTOS = Number(quantosArg ?? 2600);

// --- 1. abrir o contêiner GLB -------------------------------------------
// Cabeçalho de 12 bytes, depois pedaços de (tamanho, tipo, dados).
const buf = readFileSync(resolve(caminho));
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB (falta a assinatura glTF)');

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

// --- 2. ler acessores ----------------------------------------------------
const TAMANHO = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function lerAcessor(i) {
  const a = json.accessors[i];
  const n = COMPONENTES[a.type];
  const out = new Float64Array(a.count * n);
  if (a.bufferView === undefined) return out;          // acessor esparso vazio
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

// --- 3. transformações dos nós ------------------------------------------
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

/** Compõe a matriz local de um nó, seja ela `matrix` ou TRS. */
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

function aplicar(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// --- 4. juntar todos os triângulos, já no espaço da cena ----------------
const tris = [];
let malhas = 0;

function visitar(indice, pai) {
  const no = json.nodes[indice];
  const m = mult(pai, matrizDoNo(no));
  if (no.mesh !== undefined) {
    for (const prim of json.meshes[no.mesh].primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;   // só triângulos
      if (prim.attributes.POSITION === undefined) continue;
      malhas++;
      const pos = lerAcessor(prim.attributes.POSITION);
      const idx = prim.indices !== undefined
        ? lerAcessor(prim.indices)
        : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
      for (let t = 0; t + 2 < idx.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const v = idx[t + k] * 3;
          tris.push(...aplicar(m, pos[v], pos[v + 1], pos[v + 2]));
        }
      }
    }
  }
  for (const filho of no.children ?? []) visitar(filho, m);
}

const cena = json.scenes[json.scene ?? 0];
for (const raiz of cena.nodes) visitar(raiz, ident());
if (!tris.length) throw new Error('nenhum triângulo encontrado no modelo');

// --- 5. amostrar ponderando por área ------------------------------------
// A ponderação por área é o que faz a nuvem ter a silhueta do bicho em vez de
// acumular pontos onde a malha é mais detalhada.
const nTri = tris.length / 9;
const acum = new Float64Array(nTri);
let total = 0;
for (let t = 0; t < nTri; t++) {
  const o = t * 9;
  const bx = tris[o + 3] - tris[o], by = tris[o + 4] - tris[o + 1], bz = tris[o + 5] - tris[o + 2];
  const cx = tris[o + 6] - tris[o], cy = tris[o + 7] - tris[o + 1], cz = tris[o + 8] - tris[o + 2];
  total += Math.hypot(by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx) * 0.5;
  acum[t] = total;
}

// Aleatoriedade repetível: assar duas vezes tem de dar o mesmo arquivo.
let semente = 20260825;
const r = () => {
  semente = (semente * 1664525 + 1013904223) >>> 0;
  return semente / 4294967296;
};

const pts = new Float64Array(QUANTOS * 3);
for (let i = 0; i < QUANTOS; i++) {
  const alvo = r() * total;
  let lo = 0, hi = nTri - 1;
  while (lo < hi) { const meio = (lo + hi) >> 1; if (acum[meio] < alvo) lo = meio + 1; else hi = meio; }
  const o = lo * 9;
  const s = Math.sqrt(r()), t2 = r();
  const u = 1 - s, v = s * (1 - t2), w = s * t2;
  for (let k = 0; k < 3; k++) {
    pts[i * 3 + k] = tris[o + k] * u + tris[o + 3 + k] * v + tris[o + 6 + k] * w;
  }
}

// --- 6. centrar, normalizar e quantizar ---------------------------------
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < QUANTOS; i++) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pts[i * 3 + k]);
    max[k] = Math.max(max[k], pts[i * 3 + k]);
  }
}
// Centro na base horizontal e no chão vertical, e escala para altura 1: assim
// quem usa a nuvem só precisa multiplicar pelo tamanho que quer.
const centro = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
const alcance = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;

const q = new Int16Array(QUANTOS * 3);
for (let i = 0; i < QUANTOS; i++) {
  for (let k = 0; k < 3; k++) {
    const v = (pts[i * 3 + k] - centro[k]) / alcance;      // ~ -0,5 .. 0,5
    q[i * 3 + k] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  }
}

const b64 = Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString('base64');
const destino = resolve(`src/nuvens/${nome}.js`);
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `// GERADO POR scripts/assar-nuvem.mjs — não editar à mão.
//
// Nuvem de ${QUANTOS} pontos amostrados na superfície de "${caminho.split('/').pop()}",
// ponderando por área. Coordenadas quantizadas em 16 bits, centradas na base
// e normalizadas para que o maior lado meça 1: multiplique pelo tamanho que
// quiser. Ver o cabeçalho do script para o porquê de assar em vez de carregar.
//
// Malhas lidas: ${malhas} · triângulos: ${nTri}
export const PONTOS = ${QUANTOS};
const Q = '${b64}';

export function nuvem() {
  const bytes = Uint8Array.from(atob(Q), (c) => c.charCodeAt(0));
  const q = new Int16Array(bytes.buffer);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 32767;
  return out;
}
`);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`${malhas} malha(s), ${nTri} triângulos`);
console.log(`caixa: ${(max[0] - min[0]).toFixed(3)} x ${(max[1] - min[1]).toFixed(3)} x ${(max[2] - min[2]).toFixed(3)}`);
console.log(`${QUANTOS} pontos -> src/nuvens/${nome}.js`);
console.log(`${kb(buf.length)} de modelo viraram ${kb(b64.length)} de coordenadas`);
