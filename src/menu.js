import {
  Group, Mesh, IcosahedronGeometry, OctahedronGeometry, TetrahedronGeometry,
  DodecahedronGeometry, TorusGeometry, Vector3,
} from '../vendor/three/three.module.min.js';
import { handMaterial } from './shaders/materials.js';

/**
 * Menu preso ao pulso esquerdo, acionado cutucando com o indicador direito.
 *
 * Sem controle não há botão físico, e paleta / viagem / semear precisam morar
 * em algum lugar alcançável. Três sólidos diferentes em vez de rótulos: não há
 * fonte carregada no projeto, e a forma distingue melhor de relance do que
 * texto pequeno flutuando.
 */

// Alvos generosos de propósito: rastreamento de mão tem ruído de alguns
// milímetros, e errar um botão é bem pior do que ele ocupar um pouco mais.
const POKE_RADIUS = 0.042;   // ponta do dedo até o centro do orbe
const COOLDOWN = 0.7;        // segundos, evita disparo repetido no mesmo toque
const ORB_SIZE = 0.032;

/** Acima desta abertura de mão o menu fica acionável. */
const OPEN_THRESHOLD = 0.5;

const _v = new Vector3();
const _side = new Vector3();

export class WristMenu extends Group {
  /** @param {{onPalette,onTrip,onReseed,onSky,onBloom}} actions */
  constructor(actions = {}) {
    super();
    this.name = 'menu-de-pulso';
    this.visible = false;
    this.frustumCulled = false;
    this.renderOrder = 9;

    const shapes = [
      new IcosahedronGeometry(ORB_SIZE, 0),        // paleta
      new OctahedronGeometry(ORB_SIZE, 0),         // viagem
      new TetrahedronGeometry(ORB_SIZE * 1.2, 0),  // semear
      new DodecahedronGeometry(ORB_SIZE, 0),       // céu
      new TorusGeometry(ORB_SIZE * 0.75, ORB_SIZE * 0.3, 6, 10),  // florescer
    ];
    const fns = [actions.onPalette, actions.onTrip, actions.onReseed,
      actions.onSky, actions.onBloom];

    this.orbs = shapes.map((geo, i) => {
      const m = new Mesh(geo, handMaterial);
      m.frustumCulled = false;
      m.userData = { action: fns[i], cooldown: 0, pop: 0, slot: i - (shapes.length - 1) / 2 };
      this.add(m);
      return m;
    });
  }

  /**
   * @param {HandState} left  mão que carrega o menu
   * @param {HandState} right mão que cutuca
   */
  update(dt, left, right) {
    if (!left?.tracked) { this.visible = false; return; }

    // Base ortonormal a partir de POSIÇÕES de junta, não de orientações —
    // as convenções de eixo variam entre runtimes, as posições não.
    _side.crossVectors(left.handForward, left.palmNormal).normalize();

    // Mão aberta, não palma virada: o sinal da normal da palma depende da
    // lateralidade e não foi confirmado em hardware. Gesto essencial não pode
    // depender de um palpite.
    const facing = left.openness > OPEN_THRESHOLD;
    this.visible = true;

    for (const orb of this.orbs) {
      const d = orb.userData;
      _v.copy(left.wrist)
        .addScaledVector(left.handForward, 0.052)
        .addScaledVector(left.palmNormal, 0.048)
        .addScaledVector(_side, d.slot * 0.062);
      orb.position.copy(_v);

      d.cooldown = Math.max(0, d.cooldown - dt);
      d.pop = Math.max(0, d.pop - dt * 3.5);

      // Fora da posição de leitura o menu fica discreto, mas continua ali:
      // some de vez faria o usuário achar que não existe.
      const base = facing ? 1.0 : 0.42;
      orb.scale.setScalar(base + d.pop * 0.7);

      if (!facing || !right?.tracked || d.cooldown > 0) continue;
      if (right.indexTip.distanceTo(_v) <= POKE_RADIUS) {
        d.cooldown = COOLDOWN;
        d.pop = 1;
        d.action?.();
      }
    }
  }

  dispose() {
    for (const o of this.orbs) o.geometry.dispose();
    this.clear();
  }
}
