import { Vector3 } from '../vendor/three/three.module.min.js';

/**
 * A JORNADA — os cenários da animação, em cadeia.
 *
 * A animação de referência não tem um único corte duro em três minutos: tudo
 * é metamorfose, uma coisa virando a próxima. A cadeia aqui é a tradução disso
 * para um lugar habitado — você não assiste à passagem, você atravessa.
 *
 * O contrato é sempre o mesmo, e é ele que faz a coisa andar: TODO cenário tem
 * um casulo. Tocar nele solta a borboleta, ela sobe levando o mundo embora, e
 * quando a luz baixa você está no próximo. O último devolve ao primeiro.
 *
 * As cores não foram inventadas: saíram da própria animação, amostrando os
 * quadros de cada ato e agrupando por matiz. Por isso os azuis são de tinta e
 * não de céu, e os verdes quase não existem — o verde daquela paleta é teal.
 *
 * ACRESCENTAR UM CENÁRIO é acrescentar um item desta lista. Nada nos shaders
 * precisa mudar: as cores viajam por uniform e os padrões de parede são
 * escolhidos por índice.
 */

/**
 * '#rrggbb' -> canais 0..255.
 *
 * Recusa qualquer coisa que não seja exatamente isso. `parseInt` aceita lixo
 * no fim da string sem reclamar — '#e8a xyz' vira 138 e a cena nasce com a
 * cor errada, sem erro nenhum no console. Como aqui são centenas de cores
 * digitadas à mão, o silêncio é o pior desfecho possível.
 */
function canais(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`cor inválida em cenas.js: ${JSON.stringify(hex)}`);
  }
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Superfície: aproxima a gama para tirar a cor da tela e levá-la para linear. */
function cor(hex, ganho = 1) {
  const s = (v) => Math.min(1, Math.pow(v / 255, 2.2) * ganho);
  return new Vector3(...canais(hex).map(s));
}

/** Cores literais, sem correção — para o que já é luz e não superfície. */
function luz(hex) {
  return new Vector3(...canais(hex).map((v) => v / 255));
}

/**
 * Padrões de parede. O índice viaja para o shader e escolhe o desenho que a
 * casca do cômodo veste. Ver `wallMaterial` em shaders/materials.js.
 */
export const PADRAO = {
  FAIXAS: 0,     // registros ornamentais horizontais, grafismo geométrico
  ONDAS: 1,      // ondas atravessando a alvenaria
  BRASA: 2,      // a parede racha e o magma aparece
  DENDRITO: 3,   // ramificação de coral e raio
  FILIGRANA: 4,  // arabesco vermelho e ouro
  MARMORE: 5,    // tinta sobre água
  ROCHA: 6,      // moldura de rocha pintada — o proscênio
};

export const cenas = [
  {
    id: 0,
    nome: 'A Crisálida',
    palette: 0,
    swatch: '#587f87',
    saudacao: 'Só um casulo pendurado num fio. Toque nele.',
    // O primeiro é quase vazio de propósito: é o quadro de abertura da
    // animação, e ali não há nada além do casulo e dos anéis que saem dele.
    folha: ['#2e4860', '#587f87', '#1a2941'],
    casca: ['#1a2941', '#2e4860', '#6a312d'],
    chapeu: ['#587f87', '#6a312d', '#aaa694'],
    petala: ['#aaa694', '#587f87', '#6a312d'],
    fruta: ['#6a312d', '#aaa694', '#2e4860'],
    bio: ['#58d7c0', '#3ba7d8', '#9fe8d0'],
    parede: { padrao: PADRAO.FAIXAS, cor: '#c8a76a', forca: 0.85 },
    lamina: { altura: 0.015, cor: '#122645', forca: 0.55 },
    ceu: { baixo: '#0a1022', alto: '#16233f', estrelas: 0.9, nebulosa: 0.35 },
    populacao: { arvore: 0.0, cogumelo: 0.0, cristal: 0.15, capim: 0.25,
                 samambaia: 0.0, arbusto: 0.0, flor: 0.0, junco: 0.2, orbe: 0.4 },
    ambience: { hz: 73.42, filtro: 380 },
  },
  {
    id: 1,
    nome: 'A Gota',
    aquatico: true,   // aqui não há borboleta: há cardume
    palette: 0,
    swatch: '#3fc8ff',
    saudacao: 'A gota caiu. Da onda sobe uma árvore de água.',
    folha: ['#22405c', '#44677c', '#122645'],
    casca: ['#122645', '#22405c', '#b0836e'],
    chapeu: ['#44677c', '#b0836e', '#6d3d3d'],
    petala: ['#b0836e', '#44677c', '#c8dce8'],
    fruta: ['#6d3d3d', '#b0836e', '#22405c'],
    bio: ['#3fc8ff', '#2ee0d0', '#8fd8ff'],
    parede: { padrao: PADRAO.ONDAS, cor: '#4fb8e8', forca: 1.0 },
    lamina: { altura: 0.95, cor: '#123a5c', forca: 1.0 },
    ceu: { baixo: '#070e21', alto: '#122645', estrelas: 1.0, nebulosa: 0.25 },
    populacao: { arvore: 0.3, cogumelo: 0.3, cristal: 0.6, capim: 1.0,
                 samambaia: 0.6, arbusto: 0.4, flor: 0.5, junco: 1.6, orbe: 1.2 },
    ambience: { hz: 98.0, filtro: 620 },
  },
  {
    id: 2,
    nome: 'A Montanha',
    palette: 3,
    swatch: '#8d523b',
    saudacao: 'Terracota e mar de ouro. A semente da vida coroa o cume.',
    folha: ['#8d523b', '#be9478', '#4d6b79'],
    casca: ['#782413', '#8d523b', '#2a4656'],
    chapeu: ['#be9478', '#8d523b', '#e0c49a'],
    petala: ['#e0c49a', '#be9478', '#8d523b'],
    fruta: ['#a23731', '#be9478', '#782413'],
    bio: ['#ff9a3c', '#ffcf6b', '#e8663c'],
    parede: { padrao: PADRAO.BRASA, cor: '#e08a3c', forca: 0.95 },
    lamina: { altura: 0.10, cor: '#8d523b', forca: 0.65 },
    ceu: { baixo: '#0e1b2a', alto: '#2a4656', estrelas: 0.95, nebulosa: 0.45 },
    populacao: { arvore: 0.55, cogumelo: 0.4, cristal: 1.2, capim: 0.7,
                 samambaia: 0.3, arbusto: 0.8, flor: 0.4, junco: 0.2, orbe: 0.8 },
    ambience: { hz: 55.0, filtro: 280 },
  },
  {
    id: 3,
    nome: 'O Abismo',
    aquatico: true,   // aqui não há borboleta: há cardume
    palette: 0,
    swatch: '#98bad7',
    saudacao: 'O fundo. Aqui toda luz vem de dentro dos bichos.',
    // O ato mais claro da animação: o breu cai para 42% do quadro e os azuis
    // sobem. É o cenário onde a bioluminescência manda.
    folha: ['#546c91', '#738db3', '#404e70'],
    casca: ['#262c4b', '#404e70', '#546c91'],
    chapeu: ['#98bad7', '#738db3', '#c8e0f0'],
    petala: ['#c8e0f0', '#98bad7', '#546c91'],
    fruta: ['#738db3', '#98bad7', '#404e70'],
    bio: ['#7fe8ff', '#4fb0ff', '#a8f0e0'],
    parede: { padrao: PADRAO.DENDRITO, cor: '#7fc8f0', forca: 1.1 },
    lamina: { altura: 1.78, cor: '#2a4a72', forca: 0.85 },
    ceu: { baixo: '#120a18', alto: '#404e70', estrelas: 0.7, nebulosa: 1.0 },
    populacao: { arvore: 0.25, cogumelo: 1.6, cristal: 1.0, capim: 0.5,
                 samambaia: 1.2, arbusto: 0.5, flor: 0.6, junco: 0.8, orbe: 2.0 },
    ambience: { hz: 61.74, filtro: 460 },
  },
  {
    id: 4,
    nome: 'A Dançarina',
    palette: 5,
    swatch: '#a23731',
    saudacao: 'Tinta vermelha e fio de ouro. O chão é de vitórias-régias.',
    folha: ['#a23731', '#724d3c', '#53251e'],
    casca: ['#53251e', '#8c091c', '#724d3c'],
    chapeu: ['#ac9373', '#a23731', '#e0b880'],
    petala: ['#8c091c', '#a23731', '#ac9373'],
    fruta: ['#8c091c', '#e0b880', '#a23731'],
    bio: ['#ff6a2a', '#ffb648', '#ff2d3c'],
    parede: { padrao: PADRAO.FILIGRANA, cor: '#e8a03c', forca: 1.0 },
    lamina: { altura: 0.035, cor: '#53251e', forca: 0.7 },
    ceu: { baixo: '#1b1311', alto: '#53251e', estrelas: 0.85, nebulosa: 0.6 },
    populacao: { arvore: 0.35, cogumelo: 0.3, cristal: 0.5, capim: 0.6,
                 samambaia: 0.4, arbusto: 0.6, flor: 2.2, junco: 0.3, orbe: 1.0 },
    ambience: { hz: 82.41, filtro: 520 },
  },
  {
    id: 5,
    nome: 'O Olho',
    palette: 4,
    swatch: '#897ca0',
    saudacao: 'O olho se abriu. Os planetas estão ao alcance da mão.',
    // O cenário do cosmos: é aqui que os planetas vivem, e é o único com
    // buracos abertos nas paredes.
    folha: ['#545e96', '#897ca0', '#31365b'],
    casca: ['#31365b', '#545e96', '#63393a'],
    chapeu: ['#bca7ac', '#897ca0', '#e0d0d8'],
    petala: ['#bca7ac', '#7c1d2c', '#897ca0'],
    fruta: ['#7c1d2c', '#bca7ac', '#545e96'],
    bio: ['#b98cff', '#7fa8ff', '#e0a0ff'],
    parede: { padrao: PADRAO.MARMORE, cor: '#9a8cd0', forca: 0.9 },
    lamina: { altura: 0.0, cor: '#31365b', forca: 0.0 },
    ceu: { baixo: '#1e1c22', alto: '#31365b', estrelas: 1.2, nebulosa: 0.8 },
    populacao: { arvore: 0.2, cogumelo: 0.2, cristal: 0.8, capim: 0.3,
                 samambaia: 0.2, arbusto: 0.2, flor: 0.3, junco: 0.1, orbe: 1.6 },
    ambience: { hz: 110.0, filtro: 700 },
    cosmos: true,
  },
  {
    id: 6,
    nome: 'O Palco',
    palette: 5,
    swatch: '#cfa6a9',
    saudacao: 'A sala era o palco desde o começo. Puxe a lanterna.',
    // O último plano da animação: tudo aquilo estava dentro de um proscênio.
    // Em realidade mista isso não precisa ser encenado — o cômodo JÁ é o palco.
    folha: ['#3c5a90', '#7a7691', '#2b3359'],
    casca: ['#2b3359', '#8c4e38', '#3c5a90'],
    chapeu: ['#cfa6a9', '#7a7691', '#e8d0d0'],
    petala: ['#cfa6a9', '#a53c12', '#3c5a90'],
    fruta: ['#a53c12', '#cfa6a9', '#9f5e10'],
    bio: ['#ffd27a', '#7fb8ff', '#ff9a6a'],
    parede: { padrao: PADRAO.ROCHA, cor: '#d0b088', forca: 1.15 },
    lamina: { altura: 0.012, cor: '#2b3359', forca: 0.8 },
    ceu: { baixo: '#131418', alto: '#2b3359', estrelas: 1.3, nebulosa: 0.7 },
    populacao: { arvore: 0.4, cogumelo: 0.4, cristal: 0.7, capim: 0.5,
                 samambaia: 0.4, arbusto: 0.5, flor: 0.8, junco: 0.4, orbe: 1.4 },
    ambience: { hz: 65.41, filtro: 440 },
    palco: true,
  },
];

/** Converte os campos de cor de uma cena para Vector3, uma vez só. */
function compilar(c) {
  const trio = (arr) => arr.map((h) => cor(h));
  return {
    ...c,
    folha: trio(c.folha),
    casca: trio(c.casca),
    chapeu: trio(c.chapeu),
    petala: trio(c.petala),
    fruta: trio(c.fruta),
    bio: c.bio.map((h) => luz(h)),          // é luz emitida, não superfície
    parede: { ...c.parede, cor: luz(c.parede.cor) },
    lamina: { ...c.lamina, cor: cor(c.lamina.cor) },
    ceu: { ...c.ceu, baixo: cor(c.ceu.baixo, 1.4), alto: cor(c.ceu.alto, 1.4) },
  };
}

export const CENAS = cenas.map(compilar);
export const N_CENAS = CENAS.length;

/** A próxima da cadeia. A última volta para a primeira: a jornada é um anel. */
export const proxima = (i) => (i + 1) % N_CENAS;

export const cenaPor = (i) => CENAS[((i % N_CENAS) + N_CENAS) % N_CENAS];
