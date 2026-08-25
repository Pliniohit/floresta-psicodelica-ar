import { Vector3 } from '../vendor/three/three.module.min.js';

/**
 * Paletas de cosseno: cor(t) = a + b * cos(2pi * (c*t + d)).
 * `swatch` é só a cor mostrada no HUD ao trocar de paleta.
 */
/**
 * Paletas de cosseno: cor(t) = a + b * cos(2pi * (c*t + d)).
 *
 * As primeiras são encantadas em vez de psicodélicas: `b` menor (menos
 * amplitude de croma, então a cor não varre o arco-íris inteiro) e `c` menor
 * (menos ciclos ao longo de t, então superfícies vizinhas ficam parentes em
 * vez de brigarem). As psicodélicas de antes continuam no fim da lista.
 */
/**
 * Paletas de cosseno: cor(t) = a + b * cos(2pi * (c*t + d)).
 *
 * O que separa encantado de psicodélico aqui são DOIS parâmetros, e vale
 * anotar porque errar um deles estraga de formas opostas:
 *
 * `c` (ciclos ao longo de t) baixo mantém superfícies vizinhas parentes em vez
 * de brigando — é o que tira o arco-íris.
 *
 * `d` (fase por canal) precisa de espaçamento MÉDIO, ~0,15 entre canais. O
 * arco-íris usa 0,33; abaixo de ~0,08 os canais entram em fase e a cena vira
 * cinza, que foi o erro da primeira tentativa. O meio-termo dá matiz definido
 * sem varrer o espectro.
 */
const raw = [
  {
    name: 'Clareira Enluarada',
    swatch: '#7fc9e8',
    a: [0.26, 0.40, 0.52], b: [0.22, 0.26, 0.30],
    c: [0.55, 0.50, 0.45], d: [0.62, 0.76, 0.90],
  },
  {
    name: 'Ouro de Fada',
    swatch: '#ffcf6b',
    a: [0.58, 0.44, 0.26], b: [0.30, 0.28, 0.20],
    c: [0.45, 0.50, 0.42], d: [0.02, 0.16, 0.32],
  },
  {
    name: 'Bosque Esmeralda',
    swatch: '#5fd894',
    a: [0.22, 0.48, 0.34], b: [0.22, 0.28, 0.24],
    c: [0.52, 0.46, 0.58], d: [0.20, 0.36, 0.52],
  },
  {
    name: 'Alvorada',
    swatch: '#ff9e86',
    a: [0.60, 0.40, 0.38], b: [0.30, 0.26, 0.26],
    c: [0.42, 0.50, 0.56], d: [0.00, 0.14, 0.30],
  },
  {
    name: 'Bruma Violeta',
    swatch: '#b48bf5',
    a: [0.44, 0.34, 0.58], b: [0.26, 0.24, 0.28],
    c: [0.50, 0.54, 0.46], d: [0.72, 0.86, 0.58],
  },
  {
    name: 'Odara',
    swatch: '#ffc861',
    a: [0.54, 0.44, 0.28], b: [0.34, 0.32, 0.26],
    c: [0.70, 0.64, 0.52], d: [0.10, 0.28, 0.48],
  },
  // --- as psicodélicas originais, para quem quiser o extremo ---
  {
    name: 'Aurora Micelial',
    swatch: '#7dffd4',
    a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50],
    c: [1.00, 1.00, 1.00], d: [0.00, 0.33, 0.67],
  },
  {
    name: 'Néon Tóxico',
    swatch: '#c8ff2e',
    a: [0.45, 0.55, 0.42], b: [0.50, 0.45, 0.35],
    c: [1.00, 1.00, 0.55], d: [0.80, 0.90, 0.30],
  },
];

export const palettes = raw.map((p) => ({
  name: p.name,
  swatch: p.swatch,
  a: new Vector3(...p.a),
  b: new Vector3(...p.b),
  c: new Vector3(...p.c),
  d: new Vector3(...p.d),
}));
