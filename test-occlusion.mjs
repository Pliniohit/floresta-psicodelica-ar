import { RoomMesh } from './src/occlusion.js';

/**
 * O TETO PRECISA VIRAR ABERTURA.
 *
 * Se o teto escreve profundidade, a copa da árvore que passa dele fica atrás
 * do gesso e olhar para cima não mostra nem céu nem árvore. Já falhou duas
 * vezes calado, e sempre pelo mesmo motivo: a primeira tentativa filtrava
 * pelo rótulo `ceiling`, e o Quest costuma entregar o cômodo inteiro como UMA
 * malha rotulada `global mesh`. Não havia o que excluir da lista.
 *
 * Por isso o caso do cômodo-numa-malha-só é o primeiro teste daqui.
 */

let falhas = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALHA'}   ${msg}${extra ? `  ${extra}` : ''}`);
  if (!cond) falhas++;
};
const perto = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

/** Caixa de `larg` x `alt` x `prof` com o piso em y = 0, sem índice. */
function caixa(larg, alt, prof) {
  const x = larg / 2, z = prof / 2;
  const v = [
    [-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z],
    [-x, alt, -z], [x, alt, -z], [x, alt, z], [-x, alt, z],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3],   // piso
    [4, 6, 5], [4, 7, 6],   // teto
    [0, 4, 5], [0, 5, 1],   // paredes
    [1, 5, 6], [1, 6, 2],
    [2, 6, 7], [2, 7, 3],
    [3, 7, 4], [3, 4, 0],
  ];
  return {
    vertices: new Float32Array(v.flat()),
    indices: new Uint32Array(faces.flat()),
  };
}

/** XRFrame de mentira, com a malha já no referencial do chão. */
function quadro(malhas) {
  return {
    detectedMeshes: new Set(malhas),
    getPose: () => ({ transform: { matrix: [
      1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1,
    ] } }),
  };
}

const ALTURA = 2.60;
const MARGEM_MALHA = 0.32;
const MARGEM_PLANO = 0.10;

// --- 1. cômodo inteiro numa malha só, como o Quest costuma entregar --------
{
  const rm = new RoomMesh();
  const g = caixa(5, ALTURA, 4);
  rm.update(quadro([{ ...g, meshSpace: {}, semanticLabel: 'global mesh', lastChangedTime: 1 }]), {});
  rm.setMode('occlude');

  ok(rm.entries.length === 1, 'o cômodo veio numa malha só', `rótulo "${rm.entries[0].label}"`);
  ok(perto(rm.topY, ALTURA), 'o ponto mais alto da malha é o teto', `${rm.topY.toFixed(2)} m`);
  ok(perto(rm.cutY, ALTURA - MARGEM_MALHA),
    'o corte fica abaixo do teto mesmo sem rótulo nenhum', `${rm.cutY.toFixed(2)} m`);
  ok(rm.cutY < ALTURA && rm.cutY > 1.9,
    'e sobra parede ocluindo abaixo dele');
  ok(rm.entries[0].mesh.material.name === 'oclusor'
    && rm.entries[0].mesh.material.colorWrite === false,
    'a malha oclui sem pintar nada');
}

// --- 2. altura do teto vinda da detecção de planos ------------------------
{
  const rm = new RoomMesh();
  const g = caixa(5, 9.0, 4);   // topo absurdo: uma leitura ruim
  rm.update(quadro([{ ...g, meshSpace: {}, semanticLabel: 'global mesh', lastChangedTime: 1 }]), {});
  rm.setCeiling(2.45);
  ok(perto(rm.cutY, 2.45 - MARGEM_PLANO),
    'o teto informado ganha do topo da malha, e corta mais rente', `${rm.cutY.toFixed(2)} m`);
  rm.setCeiling(null);
  ok(perto(rm.cutY, 9.0 - MARGEM_MALHA), 'e sem ele o topo da malha volta a valer');
}

// --- 3. malhas separadas e rotuladas, que também acontece -----------------
{
  const rm = new RoomMesh();
  const chao = caixa(5, 0.02, 4);
  const teto = caixa(5, 0.02, 4);
  // Sobe o teto para a altura certa.
  for (let i = 1; i < teto.vertices.length; i += 3) teto.vertices[i] += ALTURA;
  rm.update(quadro([
    { ...chao, meshSpace: {}, semanticLabel: 'floor', lastChangedTime: 1 },
    { ...teto, meshSpace: {}, semanticLabel: 'ceiling', lastChangedTime: 1 },
  ]), {});
  rm.setMode('occlude');
  ok(rm.entries.length === 2, 'duas malhas rotuladas');
  ok(perto(rm.cutY, ALTURA + 0.02 - MARGEM_MALHA),
    'o mesmo corte por altura serve para o caso rotulado', `${rm.cutY.toFixed(2)} m`);
}

// --- 4. sem malha nenhuma, ninguém oclui e nada é cortado -----------------
{
  const rm = new RoomMesh();
  ok(rm.entries.length === 0 && !Number.isFinite(rm.cutY),
    'sem malha lida não há corte a fazer');
}

console.log(falhas
  ? `\n${falhas} falha(s) — o teto voltaria a cortar a copa.`
  : '\nTudo certo — o teto é abertura, a parede continua parede.');
process.exit(falhas ? 1 : 0);
