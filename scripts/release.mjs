#!/usr/bin/env node
/**
 * Publica uma versão: sobe o número, marca a tag, empurra e prepara o backup.
 *
 *   npm run release -- minor "Título da versão"
 *   npm run release -- patch "Correção do que for"
 *
 * A tag é o backup de verdade — o git guarda a árvore inteira de cada versão,
 * e `git checkout v0.8.0` devolve o projeto exatamente como estava. O zip que
 * sai daqui é para levar para fora do git (Drive, e-mail, pendrive).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();

const [tipo = 'minor', ...resto] = process.argv.slice(2);
const titulo = resto.join(' ');

if (!['major', 'minor', 'patch'].includes(tipo)) {
  console.error('uso: npm run release -- <major|minor|patch> "Título"');
  process.exit(1);
}
if (!titulo) {
  console.error('falta o título da versão');
  process.exit(1);
}

// Recusa publicar com coisa não commitada: a tag apontaria para um estado
// que não é o que está no disco, e o backup sairia errado.
if (git('status', '--porcelain')) {
  console.error('há alterações não commitadas. Commite antes de publicar a versão.');
  process.exit(1);
}

const pkgPath = join(RAIZ, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const nova = tipo === 'major' ? `${ma + 1}.0.0`
  : tipo === 'minor' ? `${ma}.${mi + 1}.0`
    : `${ma}.${mi}.${pa + 1}`;

console.log(`${pkg.version} -> ${nova}`);

pkg.version = nova;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Entrada nova no topo do changelog, logo abaixo do separador.
const chPath = join(RAIZ, 'CHANGELOG.md');
const ch = readFileSync(chPath, 'utf8');
const marca = '\n---\n\n';
const corte = ch.indexOf(marca) + marca.length;
writeFileSync(chPath, ch.slice(0, corte) + `## v${nova} — ${titulo}\n\n` + ch.slice(corte));

// A versão aparece no app: sem isso não dá para saber o que está sendo
// testado quando o navegador serve uma cópia em cache.
const idxPath = join(RAIZ, 'index.html');
writeFileSync(idxPath, readFileSync(idxPath, 'utf8')
  .replace(/(<span id="versao">)[^<]*(<\/span>)/, `$1v${nova}$2`));

git('add', '-A');
git('commit', '-m', `v${nova} — ${titulo}`);
git('tag', '-a', `v${nova}`, '-m', titulo);
git('push', 'origin', 'main');
git('push', 'origin', `v${nova}`);

// Zip da versão, para backup fora do git.
const saida = join(RAIZ, 'releases');
mkdirSync(saida, { recursive: true });
const zip = join(saida, `floresta-v${nova}.zip`);
git('archive', '--format=zip', `--output=${zip}`, `v${nova}`);

console.log(`\ntag v${nova} publicada`);
console.log(`backup: ${zip}`);
console.log('\nescreva o que mudou em CHANGELOG.md, sob o título já criado.');
