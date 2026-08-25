// Verifica os blocos GLSL antes que eles cheguem ao navegador.
//
// O GLSL mora em template literals do JS, e uma crase dentro de um comentário
// GLSL encerra o literal — o arquivo inteiro deixa de fazer sentido, com um
// erro de sintaxe apontando para um lugar que parece não ter nada de errado.
// Já aconteceu duas vezes; por isso virou teste.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/shaders';
let falhas = 0;

for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  const caminho = join(DIR, arquivo);
  const linhas = readFileSync(caminho, 'utf8').split('\n');

  let dentro = false;
  const crases = [];
  linhas.forEach((ln, i) => {
    if (/\/\* glsl \*\/ `/.test(ln)) { dentro = true; return; }
    if (dentro && /^\s*`[;,)]/.test(ln)) { dentro = false; return; }
    if (dentro && ln.includes('`')) crases.push({ n: i + 1, ln: ln.trim() });
  });

  if (crases.length) {
    falhas += crases.length;
    console.log(` FALHA ${caminho}: crase dentro de bloco GLSL`);
    for (const c of crases) console.log(`        linha ${c.n}: ${c.ln.slice(0, 70)}`);
  } else {
    console.log(`  ok   ${caminho}: sem crase dentro de GLSL`);
  }
}

// Os módulos precisam simplesmente carregar.
try {
  const m = await import('./src/shaders/materials.js');
  console.log(`  ok   ${m.allMaterials.length} materiais construídos`);

  // Todo material compartilha os uniforms globais — se um ficar de fora,
  // ele para de responder a paleta, bioma ou amortecimento.
  const globais = ['uTime', 'uTrip', 'uMagic', 'uBiome', 'uCalm', 'uPulse'];
  const faltando = m.allMaterials.filter((mat) => globais.some((g) => !(g in mat.uniforms)));
  if (faltando.length) {
    falhas++;
    console.log(` FALHA materiais sem uniforms globais: ${faltando.map((x) => x.name).join(', ')}`);
  } else {
    console.log('  ok   todos os materiais têm os uniforms globais');
  }
} catch (e) {
  falhas++;
  console.log(` FALHA os shaders não carregam: ${e.message}`);
}

console.log(falhas === 0 ? '\nShaders íntegros.' : `\n${falhas} problema(s) nos shaders.`);
process.exit(falhas ? 1 : 0);
