import { Vector3 } from '../vendor/three/three.module.min.js';

/**
 * Os mundos.
 *
 * Cada bioma é um índice que vai para o uniform `uBiome`, e os shaders
 * interpolam entre as faixas de cor de cada um. Isso mantém UM conjunto de
 * materiais para todos os mundos — trocar de bioma é animar um float, não
 * recompilar shader nem recriar cena.
 *
 * Todo mundo tem o mesmo contrato: chão para plantar, sementes, e um casulo
 * que devolve ao espaço. É o que fecha o ciclo.
 */

export const BIOME = { CLAREIRA: 0, FOGO: 1, AGUA: 2 };

export const biomes = [
  {
    id: BIOME.CLAREIRA,
    name: 'Clareira',
    swatch: '#7fe0a8',
    palette: 2,                       // Bosque Esmeralda
    planetColor: new Vector3(0.22, 0.52, 0.28),
    ambience: { hz: 73.42, filtro: 420 },
    saudacao: 'Terra nua. Plante.',
  },
  {
    id: BIOME.FOGO,
    name: 'Mundo de Fogo',
    swatch: '#ff6a3d',
    palette: 3,                       // Alvorada
    planetColor: new Vector3(0.62, 0.16, 0.08),
    ambience: { hz: 55.0, filtro: 280 },
    saudacao: 'Chão de brasa. Plante mesmo assim.',
  },
  {
    id: BIOME.AGUA,
    name: 'Mundo de Água',
    swatch: '#2ee6ff',
    palette: 0,                       // Clareira Enluarada
    planetColor: new Vector3(0.12, 0.34, 0.68),
    ambience: { hz: 98.0, filtro: 620 },
    saudacao: 'Fundo de água. Plante.',
  },
];

export const byId = (id) => biomes[id] ?? biomes[0];
