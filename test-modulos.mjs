import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

/** Nomes em maiúsculas que vêm do ambiente, e não do módulo. */
const GLOBAIS = new Set(['NaN', 'JSON', 'Math', 'Object', 'Array', 'Map', 'Set',
  'Infinity', 'URL', 'DOM', 'XR', 'AR', 'VR', 'GLSL', 'CSS', 'HTML', 'API']);

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

// --- CONSTANTE USADA E NUNCA DECLARADA ----------------------------------
//
// Nasceu de um `L_ABERTA` que sobreviveu a uma refatoração: a constante foi
// removida do topo de portal.js e uma referência a ela ficou lá dentro do
// construtor. `node --check` não vê — é sintaxe válida — e o import está
// certo, então a verificação acima também não via. A página quebrava só ao
// construir o objeto, em tempo de execução.
//
// A busca é limitada às CONSTANTES EM MAIÚSCULAS de módulo, que é a forma que
// erra assim: elas são declaradas no topo, longe de onde são usadas, e é
// justamente essa distância que faz a referência sobreviver à remoção.
{
  const orfas = [];
  for (const [arquivo, src] of fontes) {
    // Os módulos de src/nuvens/ e src/malhas/ são GERADOS, e o que parece
    // constante neles é pedaço de base64.
    if (arquivo.includes('nuvens') || arquivo.includes('malhas')) continue;
    // O que o arquivo declara ou importa.
    const conhecidas = new Set();
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=/g)) {
      conhecidas.add(m[1]);
    }
    for (const m of src.matchAll(/import\s*\{([^}]*)\}/g)) {
      for (const parte of m[1].split(',')) {
        const nome = parte.trim().split(/\s+as\s+/).pop().trim();
        if (nome) conhecidas.add(nome);
      }
    }
    // E o que ele usa. Fora de comentários, de blocos GLSL e de textos:
    // 'YXZ' é uma string, não uma constante.
    const codigo = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/`[\s\S]*?`/g, ' ')
      .replace(/'[^'\n]*'/g, " '' ")
      .replace(/"[^"\n]*"/g, ' "" ');
    // O que vem depois de um ponto é propriedade de outro objeto
    // (Math.SQRT1_2), e o que vem antes de dois-pontos é chave de literal
    // ({ FAIXAS: 0 }). Nenhum dos dois é uma referência a constante de módulo.
    for (const m of codigo.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]{2,})\b\s*(:?)/gm)) {
      const nome = m[2];
      if (m[3] === ':') continue;
      if (conhecidas.has(nome) || GLOBAIS.has(nome)) continue;
      orfas.push(`${relative(raiz, arquivo)}: ${nome}`);
    }
  }
  const unicas = [...new Set(orfas)];
  ok(unicas.length === 0, 'nenhuma constante de módulo usada sem ser declarada',
    unicas.length ? `\n           ${unicas.join('\n           ')}` : '');
}

// --- O SERVICE WORKER CONHECE TODOS OS MÓDULOS --------------------------
//
// Ele não enxerga a árvore de `import` de dentro do navegador, então a lista
// de arquivos a guardar é escrita à mão. Uma lista escrita à mão apodrece: um
// módulo novo entra no projeto, ninguém acrescenta lá, e o app funciona
// perfeitamente na bancada e quebra offline — que é o único lugar onde
// ninguém testa.
{
  const sw = readFileSync(resolve(import.meta.dirname, 'sw.js'), 'utf8');
  // Os nomes soltos de src/*.js, mais os caminhos completos.
  const listados = new Set();
  for (const m of sw.matchAll(/'([\w-]+)'/g)) listados.add(`src/${m[1]}.js`);
  for (const m of sw.matchAll(/'\.\/(src\/[\w/-]+\.js)'/g)) listados.add(m[1]);

  const faltando = [...fontes.keys()]
    .map((f) => relative(resolve(import.meta.dirname), f))
    .filter((f) => !listados.has(f));

  ok(faltando.length === 0, 'o service worker guarda todos os módulos de src/',
    faltando.length ? `\n           faltam: ${faltando.join(', ')}` : '');

  // E o contrário: tudo o que ele manda buscar precisa existir.
  //
  // Um caminho errado aqui não quebra nada visível — a instalação tolera
  // falha individual de propósito, senão um arquivo renomeado derrubaria o
  // cache inteiro. O preço é que o erro fica MUDO: o app segue funcionando
  // com rede e só falha offline, que é onde ninguém testa. Por isso a
  // conferência é aqui.
  const pedidos = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1])
    .filter((u) => u && !u.endsWith('/'));
  const inexistentes = pedidos.filter(
    (u) => !existsSync(resolve(import.meta.dirname, u)));
  ok(inexistentes.length === 0, 'e tudo o que ele pede existe no repositório',
    inexistentes.length ? `\n           não existe: ${inexistentes.join(', ')}` : '');
}

console.log(falhas
  ? `\n${falhas} falha(s) nos módulos.`
  : '\nOs módulos se encaixam.');
process.exit(falhas ? 1 : 0);
