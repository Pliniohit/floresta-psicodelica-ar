import {
  Group, Mesh, PlaneGeometry, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { wallMaterial, tideMaterial } from './shaders/materials.js';

/**
 * A CASCA DO CÔMODO.
 *
 * Cada mundo veste a sua sala em vez de substituí-la. As paredes de verdade
 * continuam ali — o material é aditivo e não escreve profundidade, então o
 * que se pinta é uma camada POR CIMA do passthrough. Trepadeiras no mundo de
 * terra, fendas de brasa no de fogo, ondas atravessando a alvenaria no de
 * água, e em todos você continua vendo o seu quarto por baixo.
 *
 * Esta é a peça que mantém a experiência em realidade MISTA. Sem ela, mudar
 * de mundo significaria fugir do cômodo; com ela, o cômodo é que muda.
 *
 * A `Tide` é o par horizontal disso: a lâmina que atravessa a sala na altura
 * da cintura no mundo de água (você fica submerso até ali, e as suas pernas
 * de verdade aparecem por baixo) e rente ao chão no de fogo.
 */

/**
 * Paredes derivadas da PEGADA do chão.
 *
 * A leitura de planos verticais nem sempre vem: depende do Space Setup ter
 * paredes marcadas, e em muita sala só o piso aparece. Mas o polígono do chão
 * existe sempre que o cômodo foi aceito — e onde o chão acaba, a parede
 * começa. Vale para a casca e vale para os buracos negros.
 *
 * @param {Array<Vector2>} footprint  polígono do piso, em local (x, z em .y)
 * @returns {Array<{a:Vector2,b:Vector2,y:number}>}
 */
export function wallsFromFootprint(footprint, y = 0) {
  if (!footprint || footprint.length < 3) return [];
  const out = [];
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue;
    out.push({ a, b, y });
  }
  return out;
}

const _q = new Quaternion();
const _n = new Vector3();
const _lado = new Vector3();
const _up = new Vector3(0, 1, 0);
const FRENTE = new Vector3(0, 0, 1);

/** Altura assumida quando o teto não foi detectado. */
const TETO_PADRAO = 2.6;
/** Sobra lateral e no topo, para os quadriláteros se emendarem sem fresta. */
const SOBRA = 0.30;

export class Shell extends Group {
  constructor() {
    super();
    this.name = 'casca-do-comodo';
    this.frustumCulled = false;
    this.visible = false;
    this.walls = [];
    this.amount = 0;
  }

  /**
   * Levanta um quadrilátero por parede lida.
   *
   * @param {Array<{a:Vector2,b:Vector2,y:number}>} wallBases  pé das paredes,
   *   em coordenadas locais do cômodo (as mesmas que a floresta usa)
   * @param {number} alturaTeto  altura livre, em metros
   */
  applyWalls(wallBases, alturaTeto = TETO_PADRAO) {
    this.#clear();
    if (!wallBases?.length) return this;

    const altura = Math.max(1.6, alturaTeto) + SOBRA;

    for (const w of wallBases) {
      const dx = w.b.x - w.a.x, dz = w.b.y - w.a.y;
      const comprimento = Math.hypot(dx, dz);
      if (comprimento < 0.5) continue;

      _lado.set(dx / comprimento, 0, dz / comprimento);
      _n.crossVectors(_up, _lado).normalize();

      // Vira para DENTRO do cômodo. A normal do produto vetorial depende de
      // como o segmento foi orientado na leitura dos planos, e metade das
      // paredes acabaria pintada pelo lado de fora.
      const meioX = w.a.x + dx * 0.5;
      const meioZ = w.a.y + dz * 0.5;
      if (_n.x * meioX + _n.z * meioZ > 0) _n.negate();

      // Plano unitário esticado pela escala: assim vLocal continua indo de
      // -0,5 a 0,5 e o shader pode apagar a borda em fração, sem saber o
      // tamanho da parede. Os desenhos vêm todos de vWorld, então a escala
      // do quadrilátero não estica o padrão.
      const malha = new Mesh(new PlaneGeometry(1, 1, 1, 1), wallMaterial);
      malha.scale.set(comprimento + SOBRA, altura, 1);
      malha.position.set(meioX, w.y + altura * 0.5 - SOBRA * 0.5, meioZ);
      _q.setFromUnitVectors(FRENTE, _n);
      malha.quaternion.copy(_q);
      // Um dedo para dentro: encostada na parede ela brigaria com o oclusor.
      malha.position.addScaledVector(_n, 0.03);
      malha.frustumCulled = false;
      malha.renderOrder = 3;

      this.add(malha);
      this.walls.push(malha);
    }
    return this;
  }

  /** 0 esconde a casca, 1 mostra por inteiro. */
  setAmount(v) {
    this.amount = v;
    this.visible = v > 0.01 && this.walls.length > 0;
    wallMaterial.uniforms.uShell.value = v;
    return v;
  }

  #clear() {
    for (const m of this.walls) { m.geometry.dispose(); this.remove(m); }
    this.walls.length = 0;
  }

  dispose() { this.#clear(); this.clear(); }
}

/** Altura da lâmina acima do piso, por bioma: terra, fogo, água. */
const NIVEL = [0.0, 0.09, 0.95];

export class Tide extends Group {
  constructor() {
    super();
    this.name = 'lamina';
    this.frustumCulled = false;
    this.visible = false;
    this.mesh = null;
    this.amount = 0;
    this.nivel = 0;
  }

  /** Estende a lâmina sobre a pegada do cômodo. `footprint` em local. */
  applyFootprint(footprint) {
    this.#clear();
    if (!footprint?.length) return this;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of footprint) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    const largura = (maxX - minX) + 0.6;
    const fundo = (maxZ - minZ) + 0.6;
    if (!(largura > 0.5 && fundo > 0.5)) return this;

    // Subdividido porque a onda é deslocamento de VÉRTICE: num quadrilátero
    // de dois triângulos não haveria onde ondular.
    const geo = new PlaneGeometry(1, 1, 48, 48);
    const m = new Mesh(geo, tideMaterial);
    m.rotation.x = -Math.PI / 2;      // deita: o +Z do objeto vira o +Y do mundo
    m.scale.set(largura, fundo, 1);
    m.position.set((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    m.frustumCulled = false;
    m.renderOrder = 7;
    this.mesh = m;
    this.add(m);
    return this;
  }

  /**
   * A lâmina sobe e desce conforme o mundo: sem ela na terra, rente ao chão
   * no fogo, na cintura na água. `biome` é o mesmo float contínuo do shader,
   * então a subida acompanha a travessia em vez de saltar.
   */
  setBiome(biome, amount) {
    this.amount = amount;
    tideMaterial.uniforms.uShell.value = amount;
    const b = Math.max(0, Math.min(2, biome));
    // No mundo de terra não há lâmina nenhuma: em vez de desenhar um plano
    // que o shader descarta inteiro, ele sai da fila.
    const peso = Math.max(b >= 1 ? (b - 1) : 0, 1 - Math.abs(b - 1)) ;
    this.visible = amount > 0.01 && peso > 0.02 && !!this.mesh;
    if (!this.mesh) return;
    const i = Math.floor(b), f = b - i;
    this.nivel = NIVEL[i] * (1 - f) + NIVEL[Math.min(2, i + 1)] * f;
    this.mesh.position.y = this.nivel;
  }

  #clear() {
    if (this.mesh) { this.mesh.geometry.dispose(); this.remove(this.mesh); }
    this.mesh = null;
  }

  dispose() { this.#clear(); this.clear(); }
}
