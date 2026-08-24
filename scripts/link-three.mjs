/**
 * O navegador resolve o especificador "three" pelo importmap do index.html.
 * O Node não lê importmap, então os testes precisam de um ponto de resolução
 * equivalente. Este script cria um `node_modules/three` mínimo que reexporta
 * o mesmo arquivo embutido em vendor/ — nenhuma dependência é baixada.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..', 'node_modules', 'three');
await mkdir(dir, { recursive: true });

await writeFile(join(dir, 'package.json'), JSON.stringify({
  name: 'three',
  version: '0.180.0',
  type: 'module',
  main: 'index.js',
  exports: { '.': './index.js' },
}, null, 2) + '\n');

await writeFile(join(dir, 'index.js'),
  "// Gerado por scripts/link-three.mjs — aponta para o Three.js embutido.\n" +
  "export * from '../../vendor/three/three.module.min.js';\n");

console.log('node_modules/three -> vendor/three/three.module.min.js');
