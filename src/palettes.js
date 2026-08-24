import { Vector3 } from '../vendor/three/three.module.min.js';

/**
 * Paletas de cosseno: cor(t) = a + b * cos(2pi * (c*t + d)).
 * `swatch` é só a cor mostrada no HUD ao trocar de paleta.
 */
const raw = [
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
  {
    name: 'Ultravioleta',
    swatch: '#b06bff',
    a: [0.58, 0.38, 0.72], b: [0.42, 0.32, 0.48],
    c: [1.00, 1.00, 1.00], d: [0.00, 0.15, 0.30],
  },
  {
    name: 'Magma Onírico',
    swatch: '#ff6a3d',
    a: [0.78, 0.48, 0.38], b: [0.24, 0.42, 0.22],
    c: [2.00, 1.00, 1.00], d: [0.00, 0.25, 0.25],
  },
  {
    name: 'Abismo Ciano',
    swatch: '#2ee6ff',
    a: [0.20, 0.50, 0.62], b: [0.48, 0.48, 0.42],
    c: [1.00, 1.00, 0.80], d: [0.20, 0.40, 0.60],
  },
  {
    name: 'Odara',
    swatch: '#ffc861',
    a: [0.52, 0.46, 0.30], b: [0.48, 0.44, 0.36],
    c: [1.00, 0.92, 0.68], d: [0.15, 0.35, 0.55],
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
