// Verifica que a floresta cabe no cômodo mapeado E que sobra passagem.
// É o requisito central da experiência: caminhar entre as árvores.
import { Matrix4, Vector2 } from 'three';
import { Forest } from './src/forest.js';
import { pointInPolygon, distanceToEdges, polygonArea, fallbackRoom } from './src/room.js';

const WALL_MARGIN = 0.40;
const MIN_GAP = 1.15;          // o menor espaçamento permitido (junto às paredes)
const SHOULDERS = 0.55;        // largura de ombros usada como referência de passagem
const TRUNK_R = 0.15;          // raio máximo do tronco na maior escala

const V = (x, z) => new Vector2(x, z);
const _m = new Matrix4();

function trunkPositions(forest) {
  const out = [];
  for (const sp of forest.species) {
    for (let i = 0; i < sp.set.count; i++) {
      sp.set.meshes[0].getMatrixAt(i, _m);
      out.push({ x: _m.elements[12], z: _m.elements[14] });
    }
  }
  return out;
}

function report(name, footprint, obstacles = []) {
  const forest = new Forest();
  forest.applyRoom({ footprint, obstacles, floorY: 0 });

  // applyRoom recentra tudo no centróide, então a validação tem de usar o
  // polígono local — o mesmo espaço em que as instâncias foram escritas.
  const local = forest.footprint;
  const area = polygonArea(local);
  const trunks = trunkPositions(forest);

  let outside = 0, tooCloseToWall = 0, inObstacle = 0;
  for (const t of trunks) {
    if (!pointInPolygon(t.x, t.z, local)) outside++;
    if (distanceToEdges(t.x, t.z, local) < WALL_MARGIN - 1e-6) tooCloseToWall++;
    for (const ob of forest.obstacles) if (pointInPolygon(t.x, t.z, ob)) inObstacle++;
  }

  // Distância até o vizinho mais próximo, por tronco.
  const nn = trunks.map((a, i) => {
    let best = Infinity;
    trunks.forEach((b, j) => {
      if (i === j) return;
      best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
    });
    return best;
  }).filter(Number.isFinite).sort((a, b) => a - b);

  const min = nn[0] ?? Infinity;
  const median = nn[Math.floor(nn.length / 2)] ?? Infinity;
  // Vão livre real entre duas cascas, descontando os dois troncos.
  const clearance = min - 2 * TRUNK_R;

  const fails = [];
  if (outside) fails.push(`${outside} tronco(s) fora do cômodo`);
  if (tooCloseToWall) fails.push(`${tooCloseToWall} tronco(s) colado(s) na parede`);
  if (inObstacle) fails.push(`${inObstacle} tronco(s) dentro de móvel`);
  if (min < MIN_GAP - 1e-6) fails.push(`espaçamento mínimo ${min.toFixed(2)}m < ${MIN_GAP}m`);
  if (clearance < SHOULDERS) fails.push(`vão de ${clearance.toFixed(2)}m não passa gente`);

  console.log(`\n${fails.length ? 'FALHA' : '  ok '}  ${name}`);
  console.log(`        ${area.toFixed(1)} m² · ${trunks.length} árvores · ${forest.mushrooms.count} cogumelos · ${forest.grass.count} capim`);
  console.log(`        vizinho mais próximo: mín ${min.toFixed(2)}m · mediana ${median.toFixed(2)}m`);
  console.log(`        vão livre no pior caso: ${clearance.toFixed(2)}m (ombros ≈ ${SHOULDERS}m)`);
  console.log(`        ${forest.triangleCount.toLocaleString('pt-BR')} triângulos`);
  for (const f of fails) console.log(`        -> ${f}`);
  return fails.length;
}

let failures = 0;

failures += report('sala 5 × 4 m com mesa',
  fallbackRoom(V(0, 0), 5, 4),
  [[V(1.1, -1.5), V(2.3, -1.5), V(2.3, -0.3), V(1.1, -0.3)]]);

failures += report('quarto pequeno 3 × 3 m', fallbackRoom(V(0, 0), 3, 3));

failures += report('salão 7 × 6 m', fallbackRoom(V(0, 0), 7, 6));

failures += report('sala em L',
  [V(-3, -2), V(2, -2), V(2, 0), V(0, 0), V(0, 3), V(-3, 3)]);

// Plantar manualmente não pode fechar a passagem.
{
  const forest = new Forest();
  forest.applyRoom({ footprint: fallbackRoom(V(0, 0), 5, 4), obstacles: [], floorY: 0 });
  const results = { ok: 0, apertado: 0, fora: 0, cheio: 0 };
  for (let i = 0; i < 200; i++) {
    const x = -3 + (i * 0.37) % 6, z = -2.5 + (i * 0.53) % 5;
    results[forest.plant({ x, z })]++;
  }
  const all = trunkPositions(forest);
  const nn = all.map((a, i) => {
    let best = Infinity;
    all.forEach((b, j) => {
      if (i === j) return;
      best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
    });
    return best;
  }).filter(Number.isFinite);
  const min = Math.min(...nn);
  const ok = min >= MIN_GAP * 0.8 - 1e-6;
  if (!ok) failures++;
  console.log(`\n${ok ? '  ok ' : 'FALHA'}  200 tentativas de plantio manual`);
  console.log(`        aceitas ${results.ok} · recusadas por aperto ${results.apertado} · fora ${results.fora} · cheio ${results.cheio}`);
  console.log(`        espaçamento mínimo depois de tudo: ${min.toFixed(2)}m`);
}

console.log(`\n${failures === 0 ? 'Tudo certo — dá para caminhar em todos os cômodos testados.' : failures + ' verificação(ões) falharam.'}`);
process.exit(failures ? 1 : 0);
