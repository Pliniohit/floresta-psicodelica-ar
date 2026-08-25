import {
  Group, Mesh, PlaneGeometry, Vector3, Quaternion, Matrix4,
} from '../vendor/three/three.module.min.js';
import { blackHoleMaterial } from './shaders/materials.js';
import { rng } from './forest.js';

/**
 * Buracos negros abertos nas paredes do cômodo mapeado, visíveis SÓ no espaço.
 *
 * Ficam ancorados nas paredes de verdade porque é onde o cômodo termina — e
 * ver a própria parede se abrir ao atravessar é bem mais forte do que um disco
 * flutuando no vazio. Mas na floresta eles não existem: lá a parede é parede.
 *
 * Cada um é um quadrilátero alinhado à parede, com o disco desenhado no
 * shader — nenhuma geometria de disco, nenhuma partícula.
 */

const _p = new Vector3();
const _q = new Quaternion();
const _n = new Vector3();
const _up = new Vector3(0, 1, 0);
const _lado = new Vector3();
const FRENTE = new Vector3(0, 0, 1);

/** Quantos buracos existem, no máximo. Ver o comentário em applyWalls. */
const MAX_BURACOS = 2;

export class BlackHoles extends Group {
  constructor() {
    super();
    this.name = 'buracos-negros';
    this.frustumCulled = false;
    this.visible = false;
    this.holes = [];
  }

  /**
   * Abre buracos nas paredes lidas. `wallBases` traz o pé de cada parede em
   * coordenadas locais da floresta; a normal sai do segmento.
   */
  applyWalls(wallBases, seed = 5) {
    this.#clear();
    if (!wallBases?.length) return this;

    const r = rng(seed);

    // DOIS, e não um por parede.
    //
    // Um buraco em cada parede transformava a sala numa peneira, e o que se
    // quer é o contrário: poucos, grandes, e que dê para localizar cada um
    // pelo canto do olho. Dois é o mínimo para o par funcionar como PORTAL —
    // o que entra num precisa ter por onde sair.
    //
    // As duas paredes mais longas são as escolhidas: cabem discos maiores e
    // costumam ser as que se enxerga de mais lugares do cômodo.
    const candidatas = wallBases
      .map((w) => ({ w, comp: Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) }))
      .filter((c) => c.comp >= 1.1)
      .sort((a, b) => b.comp - a.comp)
      .slice(0, MAX_BURACOS);

    for (const { w } of candidatas) {
      const dx = w.b.x - w.a.x, dz = w.b.y - w.a.y;
      const comprimento = Math.hypot(dx, dz);

      // Um buraco por parede, num ponto aleatório do trecho central.
      const t = 0.34 + r() * 0.32;
      // Maiores do que antes: são só dois, e precisam ler como boca e não
      // como mancha na parede.
      const raio = 0.60 + r() * 0.28;

      _lado.set(dx / comprimento, 0, dz / comprimento);
      _n.crossVectors(_up, _lado).normalize();  // normal da parede

      // Vira para DENTRO do cômodo. O produto vetorial dá uma normal cujo
      // lado depende de como o segmento foi orientado na leitura dos planos,
      // e metade das paredes acabaria mostrando o verso do buraco.
      const meioX = w.a.x + dx * 0.5;
      const meioZ = w.a.y + dz * 0.5;
      if (_n.x * meioX + _n.z * meioZ > 0) _n.negate();

      // Plano de 2x2 escalado depois, e não criado no tamanho final: assim
      // vLocal vai de -1 a 1 e o shader pode raciocinar em raio normalizado.
      // Criado em metros, o corte "r > 1" nunca acontecia e o quadrado da
      // geometria aparecia inteiro em volta do disco.
      const geo = new PlaneGeometry(2, 2, 1, 1);
      const malha = new Mesh(geo, blackHoleMaterial);
      malha.scale.setScalar(raio);
      malha.frustumCulled = false;
      malha.renderOrder = 4;

      malha.position.set(
        w.a.x + dx * t,
        w.y + 1.25 + r() * 0.5,
        w.a.y + dz * t,
      );
      // Encosta na parede e olha para dentro do cômodo.
      _q.setFromUnitVectors(FRENTE, _n);
      malha.quaternion.copy(_q);
      malha.position.addScaledVector(_n, 0.02);

      this.add(malha);
      this.holes.push(malha);
    }
    return this;
  }

  /**
   * Os portais em coordenadas de MUNDO: onde estão, para onde olham, e que
   * raio têm. É por aqui que os planetas descobrem que existe um buraco.
   */
  portais() {
    this.updateWorldMatrix(true, false);
    return this.holes.map((h) => {
      const pos = new Vector3();
      const nrm = new Vector3(0, 0, 1);
      h.getWorldPosition(pos);
      nrm.applyQuaternion(h.getWorldQuaternion(_q));
      return { pos, normal: nrm.normalize(), raio: h.scale.x };
    });
  }

  /** Acompanha a travessia: 0 na floresta, 1 no espaço. */
  setProgress(v) {
    this.visible = v > 0.02 && this.holes.length > 0;
    blackHoleMaterial.uniforms.uOpen.value = v;
    return v;
  }

  #clear() {
    for (const h of this.holes) { h.geometry.dispose(); this.remove(h); }
    this.holes.length = 0;
  }

  dispose() { this.#clear(); this.clear(); }
}
