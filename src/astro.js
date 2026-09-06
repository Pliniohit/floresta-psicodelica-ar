import {
  Group, Mesh, IcosahedronGeometry, RingGeometry, Vector3,
} from '../vendor/three/three.module.min.js';
import { cloneMaterial, orbMaterial } from './shaders/materials.js';

/**
 * O ASTRO DA LUMINÁRIA.
 *
 * A sala tem uma luz de verdade, e o Space Setup diz onde ela está. Em vez de
 * ignorar esse ponto — ou pior, plantar uma árvore em cima dele —, a obra
 * pousa ali um corpo luminoso. O que já brilha no cômodo real passa a brilhar
 * também dentro da obra, e as duas luzes viram a mesma.
 *
 * É o mesmo raciocínio que rege o resto do projeto: o móvel não é obstáculo, é
 * substrato. A lâmpada não é um estorvo no meio da cena, é um astro.
 *
 * Três camadas, todas geradas por código:
 *   - núcleo, uma icosaédrica pequena e opaca;
 *   - coroa, uma casca maior e translúcida, que dá volume ao brilho;
 *   - halo, um anel sempre de frente, que é o que faz ler como luz e não
 *     como bola. Sem ele o corpo parece uma fruta acesa.
 *
 * A pulsação fica abaixo de 1 Hz e varia pouco de brilho, pela mesma regra de
 * fotossensibilidade que vale para o resto da cena.
 */

const RAIO = 0.085;          // o núcleo, em metros
const CORO = 1.9;            // quantas vezes o núcleo a coroa mede
const HALO = 3.4;            // e o halo
const PULSO_HZ = 0.21;       // bem abaixo da faixa de risco (3–30 Hz)
const PULSO = 0.12;          // amplitude: respira, não pisca

export class Astro extends Group {
  constructor() {
    super();
    this.name = 'astro';
    this.visible = false;
    this.frustumCulled = false;

    // Núcleo e coroa saem do material dos orbes, que já é aditivo e já
    // acompanha a paleta da cena — o astro muda de cor junto com o mundo.
    this.nucleoMat = cloneMaterial(orbMaterial, {});
    this.coroaMat = cloneMaterial(orbMaterial, {});
    this.haloMat = cloneMaterial(orbMaterial, {});

    this.nucleo = new Mesh(new IcosahedronGeometry(RAIO, 2), this.nucleoMat);
    this.coroa = new Mesh(new IcosahedronGeometry(RAIO * CORO, 1), this.coroaMat);
    this.halo = new Mesh(new RingGeometry(RAIO * HALO * 0.62, RAIO * HALO, 40), this.haloMat);

    for (const m of [this.nucleo, this.coroa, this.halo]) {
      m.frustumCulled = false;
      m.renderOrder = 9;
      this.add(m);
    }

    this.tempo = 0;
    this.brilhoBase = 1;
  }

  /**
   * Pousa o astro onde a luminária foi lida.
   *
   * `lamp` vem de `room.lamp`: o centro e a altura do que o Space Setup marcou
   * como lâmpada. O `origem` é a posição da floresta, porque o astro vive no
   * mesmo referencial dela.
   */
  colocar(lamp, origem) {
    if (!lamp) { this.visible = false; return false; }
    this.position.set(lamp.x - origem.x, lamp.y - origem.y, lamp.z - origem.z);
    this.visible = true;
    return true;
  }

  /** O halo é um anel: só lê como luz se estiver sempre de frente. */
  update(dt, camera) {
    if (!this.visible) return;
    this.tempo += dt;

    const respiro = 1 + Math.sin(this.tempo * PULSO_HZ * Math.PI * 2) * PULSO;
    this.nucleo.scale.setScalar(respiro);
    this.coroa.scale.setScalar(1 + (respiro - 1) * 1.7);
    this.halo.scale.setScalar(1 + (respiro - 1) * 2.4);

    // Giro lento do núcleo: dá vida sem chamar atenção.
    this.nucleo.rotation.y += dt * 0.16;
    this.coroa.rotation.y -= dt * 0.09;

    if (camera) {
      camera.getWorldPosition(_alvo);
      this.halo.lookAt(_alvo);
    }
  }

  dispose() {
    for (const m of [this.nucleo, this.coroa, this.halo]) {
      m.geometry.dispose();
      m.removeFromParent();
    }
  }
}

const _alvo = new Vector3();
