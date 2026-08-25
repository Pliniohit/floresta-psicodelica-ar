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
  // `uBiome` saiu daqui quando a cena deixou de ser um float de bioma e virou
  // um conjunto de cores por uniform: são elas que agora precisam chegar
  // inteiras em todo material, senão a cena troca pela metade.
  const globais = ['uTime', 'uTrip', 'uMagic', 'uCalm', 'uPulse', 'uGlow',
    'uFolha', 'uCasca', 'uChapeu', 'uPetala', 'uFruta', 'uBio'];
  const faltando = m.allMaterials.filter((mat) => globais.some((g) => !(g in mat.uniforms)));
  if (faltando.length) {
    falhas++;
    console.log(` FALHA materiais sem uniforms globais: ${faltando.map((x) => x.name).join(', ')}`);
  } else {
    console.log('  ok   todos os materiais têm os uniforms globais');
  }

  // O uniform tem de existir DOS DOIS LADOS.
  //
  // Estar no objeto `shared` não basta: se o GLSL não o declara, ele é um
  // identificador desconhecido e o shader não compila. E se ele for declarado
  // DUAS vezes — uma no prelúdio comum, outra dentro do material — é erro de
  // redefinição. Os dois casos derrubam o material calado no `npm test`, e só
  // aparecem no console do navegador, um por um.
  const decl = (src, nome) => {
    const re = new RegExp(`uniform\\s+(?:lowp|mediump|highp)?\\s*\\w+\\s+${nome}\\s*(\\[|;|,)`, 'g');
    return (src.match(re) || []).length;
  };
  const problemas = [];
  for (const mat of m.allMaterials) {
    const fonte = `${mat.vertexShader}\n${mat.fragmentShader}`;
    for (const nome of Object.keys(mat.uniforms)) {
      const n = decl(fonte, nome);
      // Um uniform declarado só no vertex e usado só lá conta 1; declarado no
      // prelúdio comum conta 2 (um por estágio). Acima disso é repetição.
      if (n > 2) problemas.push(`${mat.name}: ${nome} declarado ${n}x`);
    }
    // E o contrário: usado no corpo do material sem existir em lugar nenhum.
    const usados = fonte.match(/\bu[A-Z]\w*/g) || [];
    for (const nome of new Set(usados)) {
      if (nome in mat.uniforms) continue;
      if (decl(fonte, nome)) continue;
      problemas.push(`${mat.name}: ${nome} usado e nunca declarado`);
    }
  }
  if (problemas.length) {
    falhas++;
    console.log(' FALHA uniforms fora de sincronia entre JS e GLSL:');
    for (const p of problemas.slice(0, 12)) console.log(`        ${p}`);
  } else {
    console.log('  ok   uniforms declarados uma vez só, e todos existem');
  }
} catch (e) {
  falhas++;
  console.log(` FALHA os shaders não carregam: ${e.message}`);
}

console.log(falhas === 0 ? '\nShaders íntegros.' : `\n${falhas} problema(s) nos shaders.`);
process.exit(falhas ? 1 : 0);
