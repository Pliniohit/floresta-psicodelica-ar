// Verificação de sanidade das geometrias procedurais.
// O motivo de existir: uma matriz com NaN faz a malha sumir silenciosamente,
// sem erro de shader e sem aviso no console. Contar triângulos não pega isso.
import * as G from './src/geometry.js';
import { Forest } from './src/forest.js';
import { fallbackRoom } from './src/room.js';
import { Vector2 } from './vendor/three/three.module.min.js';

let failures = 0;
const check = (name, geo) => {
  const a = geo.attributes.position.array;
  const bad = [...a].filter((v) => !Number.isFinite(v)).length;
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  // O retículo é plano de propósito, então exigimos apenas duas dimensões
  // com extensão real — o que basta para flagrar uma malha degenerada.
  const ok = bad === 0 && tris > 0
    && size.every(Number.isFinite)
    && size.filter((s) => s > 1e-4).length >= 2;
  if (!ok) failures++;
  console.log(
    `${ok ? '  ok  ' : ' FALHA'} ${name.padEnd(22)} ${String(tris).padStart(4)} tris` +
    `  bbox ${size.map((s) => s.toFixed(2)).join(' x ')}` +
    (bad ? `  <-- ${bad} valores NaN/Inf` : ''),
  );
};

for (const [n, f] of [['torre', G.speciesTower], ['guarda-chuva', G.speciesUmbrella], ['pagode', G.speciesPagoda]]) {
  const sp = f();
  check(`${n} / tronco`, sp.trunk);
  check(`${n} / copa`, sp.canopy);
}
const mu = G.mushroom();
check('cogumelo / caule', mu.stem);
check('cogumelo / chapeu', mu.cap);
check('cristal', G.crystal());
check('capim', G.blade());
check('retículo', G.reticleRing());

// As matrizes de instância também precisam ser finitas.
const forest = new Forest();
forest.applyRoom({ footprint: fallbackRoom(new Vector2(0, 0), 5, 4), obstacles: [], floorY: 0 });
for (const obj of forest.children) {
  if (!obj.isInstancedMesh) continue;
  const arr = obj.instanceMatrix.array.subarray(0, obj.count * 16);
  const bad = [...arr].filter((v) => !Number.isFinite(v)).length;
  if (bad) failures++;
  console.log(`${bad ? ' FALHA' : '  ok  '} instâncias ${obj.material.name.padEnd(12)} ${String(obj.count).padStart(4)}` + (bad ? `  <-- ${bad} NaN` : ''));
}

console.log(`\n${failures === 0 ? 'Tudo certo.' : failures + ' verificação(ões) falharam.'} Triângulos na cena: ${forest.triangleCount.toLocaleString('pt-BR')}`);
process.exit(failures ? 1 : 0);
