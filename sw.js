/* eslint-env serviceworker */

/**
 * O APP INTEIRO GUARDADO NO HEADSET.
 *
 * Depois da primeira visita, tudo o que a experiência precisa mora no Quest:
 * o código, a biblioteca, a trilha e os quarenta megabytes da animação. Ela
 * abre sem rede — e, o que importa mais na prática, abre RÁPIDO e não trava no
 * meio porque o wi-fi da casa oscilou.
 *
 * ESTRATÉGIA: cache primeiro, rede como reserva.
 *
 * Não é a escolha automática para um site, mas é a certa para este. Aqui não
 * há conteúdo que envelhece — nenhuma notícia, nenhum dado de usuário. O que
 * existe é uma versão inteira, que muda quando eu publico uma nova. Servir do
 * cache é servir o que já foi verificado, e a atualização é um evento
 * discreto, não uma negociação a cada arquivo.
 *
 * A TROCA DE VERSÃO é o nome do cache. Publicar uma versão nova cria um cache
 * novo, baixa tudo dentro dele, e só então apaga o antigo. Nunca existe um
 * momento em que metade do app é de uma versão e metade de outra — que é o
 * defeito clássico de cachear arquivo a arquivo, e num app cujos módulos se
 * importam por nome ele aparece como tela preta.
 */

const VERSAO = 'raizes-cosmicas-v0.26.0';

/**
 * O que é BAIXADO NA INSTALAÇÃO, sem esperar ninguém pedir.
 *
 * A animação está aqui, e ela sozinha é quase todo o peso. É deliberado: o
 * portal é uma promessa que a experiência faz na parede do cômodo, e uma
 * promessa que gagueja ao ser aceita é pior do que não ter sido feita. Melhor
 * pagar os quarenta megabytes de uma vez, na primeira visita, com a pessoa
 * ainda na tela de entrada.
 */
const ESSENCIAL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/three/three.module.min.js',
  './assets/trilha.ogg',
  './assets/animacao.mp4',
  './assets/arvoremae.jpg',
];

/**
 * Os módulos. Eles são listados um a um, e não descobertos: um service worker
 * não enxerga a árvore de `import` de dentro do navegador, e deixar que cada
 * um chegue por demanda traria de volta exatamente o problema que a troca
 * atômica de versão resolve.
 */
const MODULOS = [
  'main', 'forest', 'geometry', 'nuvem', 'arvoremae', 'portal', 'space', 'sky',
  'creatures', 'body', 'seeds', 'shell', 'room', 'occlusion', 'blackholes',
  'constellation', 'interaction', 'hands', 'menu', 'audio', 'xr', 'cenas',
  'palettes', 'biomes', 'magicwindow',
].map((n) => `./src/${n}.js`)
  .concat(['./src/shaders/lib.js', './src/shaders/materials.js'])
  .concat(['./src/nuvens/borboleta.js', './src/malhas/arvoremae.js']);

const TUDO = [...ESSENCIAL, ...MODULOS];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // Um a um, e tolerando falha individual: `addAll` desiste de TUDO se um
    // único arquivo faltar, e aí a instalação inteira fracassa por causa de um
    // módulo renomeado. Aqui o que existe é guardado, e o que faltar volta a
    // ser buscado na rede quando for pedido.
    const faltaram = [];
    await Promise.all(TUDO.map(async (url) => {
      try {
        const r = await fetch(url, { cache: 'reload' });
        if (r.ok) await cache.put(url, r);
        else faltaram.push(url);
      } catch {
        faltaram.push(url);
      }
    }));
    if (faltaram.length) console.warn('sw: ficaram de fora', faltaram);
    // Assume o comando sem esperar as abas antigas fecharem: no headset só
    // existe uma aba, e esperar significaria a versão nova nunca entrar.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) {
      if (nome !== VERSAO) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Só o que é nosso. Passar a mão em requisição de outra origem seria mentir
  // sobre coisa que não controlamos.
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const guardado = await caches.match(req, { ignoreSearch: true });
    if (guardado) return guardado;

    try {
      const r = await fetch(req);
      // Guarda o que veio, para a próxima já sair do disco. Respostas
      // parciais (206) ficam de fora: é assim que o vídeo é pedido enquanto
      // toca, e guardar um pedaço faria o cache devolver um arquivo truncado.
      if (r.ok && r.status !== 206) {
        const cache = await caches.open(VERSAO);
        cache.put(req, r.clone());
      }
      return r;
    } catch (erro) {
      // Offline e sem cópia. Para uma navegação, devolve a página de entrada:
      // é melhor abrir a experiência do que mostrar o dinossauro.
      if (req.mode === 'navigate') {
        const raiz = await caches.match('./index.html');
        if (raiz) return raiz;
      }
      throw erro;
    }
  })());
});
