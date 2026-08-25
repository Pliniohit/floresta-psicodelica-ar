import {
  Group, Mesh, IcosahedronGeometry, Vector3,
} from '../vendor/three/three.module.min.js';
import { crystalMaterial } from './shaders/materials.js';

/**
 * Sementes plantáveis.
 *
 * Vira a palma para cima e uma semente brota nela; pince para pegá-la e solte
 * perto do chão para plantar. A palma aberta é o gesto certo aqui porque é o
 * mesmo que se faz para receber algo — e porque já temos a normal da palma
 * calculada para o menu de pulso.
 *
 * A palma ESQUERDA é do menu; a semente nasce na DIREITA, para os dois gestos
 * não disputarem a mesma mão.
 */

const PALM_UP = 0.25;      // limiar mais exigente que o do menu: evita brotar sem querer
const GROW = 1.1;          // velocidade de crescimento e murcha
const SIZE = 0.032;

const _v = new Vector3();

export class Seeds extends Group {
  constructor(hand = 'right') {
    super();
    this.name = 'sementes';
    this.frustumCulled = false;
    this.hand = hand;

    this.mesh = new Mesh(new IcosahedronGeometry(SIZE, 0), crystalMaterial);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.add(this.mesh);

    this.growth = 0;       // 0..1
    this.offered = false;  // existe semente pronta na palma?
    this.held = false;     // está sendo carregada pela pinça?
    this.position0 = new Vector3();

    // A cada tantas sementes comuns nasce uma de casulo — a árvore de galhos
    // que leva ao espaço. Contada, não sorteada: sorteio deixaria o jogador
    // sem saída se a sorte não viesse.
    this.plantadas = 0;
    this.cadaCasulo = 3;   // cedo o bastante para a mecânica ser descoberta
    this.kind = 'normal';
  }

  /** Semente madura o bastante para ser pega. */
  get ready() { return this.offered && this.growth > 0.55; }

  update(dt, t, hands) {
    const h = hands?.byHandedness(this.hand);

    if (this.held) {
      // Na pinça: segue a mão e gira.
      if (!h) { this.held = false; this.offered = false; }
      else {
        this.mesh.position.copy(h.pinch);
        this.mesh.rotation.y = t * 1.0;
        this.mesh.rotation.x = t * 0.55;
        this.mesh.scale.setScalar(1);
        this.mesh.visible = true;
        return;
      }
    }

    // Brota com a palma virada para cima, murcha quando ela vira.
    const antes = this.offered;
    this.offered = !!h && h.palmUp > PALM_UP;
    if (this.offered && !antes) {
      this.kind = this.plantadas % this.cadaCasulo === this.cadaCasulo - 1 ? 'cocoon' : 'normal';
    }
    const alvo = this.offered ? 1 : 0;
    this.growth += (alvo - this.growth) * (1 - Math.exp(-dt * GROW));

    if (this.growth < 0.02) { this.mesh.visible = false; return; }

    if (h) {
      // Pairando um palmo acima da palma.
      _v.copy(h.wrist)
        .addScaledVector(h.handForward, 0.075)
        .addScaledVector(h.palmNormal, 0.055 + Math.sin(t * 0.8) * 0.010);
      this.position0.copy(_v);
    }
    this.mesh.position.copy(this.position0);
    this.mesh.rotation.y = t * 0.45;
    // A de casulo é maior: dá para ver na mão qual delas veio.
    this.mesh.scale.setScalar(this.growth * (this.kind === 'cocoon' ? 1.7 : 1));
    this.mesh.visible = true;
  }

  /** A pinça pegou a semente? Devolve false se não havia uma madura. */
  take() {
    if (!this.ready || this.held) return false;
    this.held = true;
    return true;
  }

  /** Soltou. Devolve o ponto onde a semente estava, ou null se não carregava. */
  release() {
    if (!this.held) return null;
    this.held = false;
    this.offered = false;
    this.growth = 0;
    this.plantadas++;
    this.mesh.visible = false;
    return this.mesh.position.clone();
  }

  dispose() { this.mesh.geometry.dispose(); this.clear(); }
}
