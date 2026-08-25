import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

/**
 * TODO IMPORT TEM DE APONTAR PARA UM EXPORT QUE EXISTE.
 *
 * Este teste nasceu de um erro que passou por todos os outros: um material
 * foi removido de `materials.js` e o `import` dele continuou em `main.js`. O
 * projeto não tem empacotador nem verificação de tipos, então nada reclamou —
 * a página simplesmente ficou preta, e a mensagem só apareceu no console do
 * navegador, que é o único lugar onde ninguém olha antes de publicar.
 *
 * A verificação é ESTÁTICA de propósito. Importar os módulos de verdade em
 * Node não serve: `main.js` mexe no DOM já na avaliação, e é justamente ele o
 * que mais precisa ser conferido.
 */

let falhas = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALHA'}   ${msg}${extra ? `  ${extra}` : ''}`);
  if (!cond) falhas++;
};

/** Todo .js dentro de src/, em qualquer profundidade. */
function arquivos(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...arquivos(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Os nomes que um módulo oferece. */
function exportados(src) {
  const nomes = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    nomes.add(m[1]);
  }
  // export { a, b as c }
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const parte of m[1].split(',')) {
      const t = parte.trim();
      if (!t) continue;
      const como = t.split(/\s+as\s+/);
      nomes.add((como[1] ?? como[0]).trim());
    }
  }
  return nomes;
}

const raiz = resolve(import.meta.dirname, 'src');
const fontes = new Map();
for (const f of arquivos(raiz)) fontes.set(f, readFileSync(f, 'utf8'));

const cache = new Map();
const exportsDe = (f) => {
  if (!cache.has(f)) cache.set(f, exportados(fontes.get(f) ?? ''));
  return cache.get(f);
};

let conferidos = 0, quebrados = [];
for (const [arquivo, src] of fontes) {
  // import { a, b as c } from './x.js'   — só os relativos: o vendor não é nosso
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const alvo = resolve(dirname(arquivo), m[2]);
    if (!fontes.has(alvo)) continue;              // vendor, ou fora de src/
    const oferece = exportsDe(alvo);
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/\s+as\s+/)[0].trim();
      if (!nome) continue;
      conferidos++;
      if (!oferece.has(nome)) {
        quebrados.push(`${relative(raiz, arquivo)} pede "${nome}" de ${relative(raiz, alvo)}`);
      }
    }
  }
}

ok(fontes.size > 10, `${fontes.size} módulos lidos`);
ok(conferidos > 50, `${conferidos} imports nomeados conferidos`);
ok(quebrados.length === 0, 'nenhum import aponta para um export que não existe',
  quebrados.length ? `\n           ${quebrados.join('\n           ')}` : '');

console.log(falhas
  ? `\n${falhas} falha(s) nos módulos.`
  : '\nOs módulos se encaixam.');
process.exit(falhas ? 1 : 0);
