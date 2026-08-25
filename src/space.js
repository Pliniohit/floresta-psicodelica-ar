import {
  Group, Mesh, InstancedMesh, Points, BufferGeometry, BufferAttribute,
  SphereGeometry, TorusGeometry, Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { planetMaterial, trailMaterial, cloneMaterial } from './shaders/materials.js';
import { rng } from './forest.js';
import { CENAS } from './cenas.js';

/**
 * A cena do espaço, para onde a borboleta leva.
 *
 * Planetas ficam ao alcance do braço de propósito: a graça é poder pegá-los.
 * Escala de brinquedo, distância de mesa — se estivessem em escala real seriam
 * pontos no céu e não haveria nada para fazer.
 *
 * E ficam PARADOS no mundo. A cúpula do céu acompanha a cabeça, porque céu não
 * se aproxima; planeta ao alcance da mão é o oposto — se ele te seguisse, você
 * nunca conseguiria dar a volta nele, e a cena inteira pareceria colada ao
 * rosto. Andar tem que aproximar.
 */

const PLANETS = 7;
/** Escala a partir da qual o planeta se abre e você atravessa para o mundo dele. */
export const ENTER_SCALE = 3.4;
const MIN_SCALE = 0.5;
const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _s2 = new Vector3();
const _acc = new Vector3();
const _d = new Vector3();
const _p2 = new Vector3();

/** Altura em torno da qual o enxame se equilibra: peito de quem está de pé. */
const CENTRO_Y = 1.25;
const MOLA = 0.55;        // mola fraca que segura o enxame perto de você
const G = 0.10;           // gravidade entre planetas
const CONTATO = 11.0;     // dureza do contato; sempre vence a gravidade
const AMORTECE = 0.30;    // atrito, para o sistema não ganhar energia
const V_MAX = 1.3;        // m/s
const _up = new Vector3(0, 1, 0);

export class Space extends Group {
  constructor() {
    super();
    this.name = 'espaco';
    this.frustumCulled = false;
    this.visible = false;
    this.progress = 0;      // 0 floresta .. 1 espaço

    const r = rng(90210);
    this.planets = [];

    // Um único InstancedMesh não serve aqui: cada planeta precisa de matriz
    // própria mexida pela mão, e são só sete — sete draw calls é barato.
    for (let i = 0; i < PLANETS; i++) {
      const raio = 0.20 + r() * 0.40;   // tamanho de bola de praia: dá vontade de pegar
      // Material por planeta: cada um carrega a cor do bioma que guarda. O
      // programa de shader continua sendo um só, então o custo é de uniforms.
      // cloneMaterial e não clone(): o clone cru duplica também os uniforms
      // globais, e aí o planeta congela no tempo e não acompanha mais a cena.
      const cena = CENAS[i % CENAS.length];
      const mat = cloneMaterial(planetMaterial, {
        uTint: cena.folha[1].clone(),
        uElement: i % 3,
      });
      // Identidade fixa: é ela que decide se o planeta é gasoso, rochoso ou
      // gelado, e ela não pode mudar enquanto ele orbita.
      mat.uniforms.uSeed.value = r();

      const corpo = new Mesh(new SphereGeometry(raio, 20, 14), mat);
      corpo.frustumCulled = false;

      const grupo = new Group();
      grupo.add(corpo);

      // Anéis em alguns, inclinados.
      if (r() < 0.4) {
        // Anel com o mesmo material do corpo: aditivo fazia o anel brilhar
        // e sumir conforme o ângulo, que lia como piscada.
        const anel = new Mesh(
          new TorusGeometry(raio * 1.9, raio * 0.045, 5, 36), mat);
        anel.rotation.x = Math.PI / 2 + (r() - 0.5) * 0.7;
        anel.rotation.z = (r() - 0.5) * 0.5;
        anel.frustumCulled = false;
        grupo.add(anel);
      }

      // Posição e velocidade iniciais em vez de uma órbita escrita à mão: a
      // trajetória passou a ser resultado de força, não de fórmula, e é o que
      // permite eles se desviarem uns dos outros.
      // Nasce num lugar que não colide com ninguém. Sortear às cegas fazia
      // dois planetas começarem um dentro do outro, e a física nasce então
      // tendo que consertar em vez de manter.
      let ang = 0;
      for (let tentativa = 0; tentativa < 120; tentativa++) {
        const dist = 1.0 + r() * 1.5;
        ang = r() * Math.PI * 2;
        grupo.position.set(Math.cos(ang) * dist, 0.75 + r() * 1.25, Math.sin(ang) * dist);
        const livre = this.planets.every((o) => grupo.position.distanceTo(o.position)
          > raio + o.userData.raio + 0.12);
        if (livre) break;
      }

      // Velocidade tangente: é ela que faz orbitar em vez de cair no centro.
      const vel = new Vector3(-Math.sin(ang), 0, Math.cos(ang))
        .multiplyScalar((0.28 + r() * 0.22) * (r() < 0.5 ? -1 : 1));
      vel.y = (r() - 0.5) * 0.12;

      grupo.userData = {
        corpo, raio, mat, vel, preso: false, bioma: cena.id,
        massa: raio * raio * raio,     // massa vai com o volume, como convém
        giro: 0.06 + r() * 0.16,
      };
      this.planets.push(grupo);
      this.add(grupo);
    }

    // Sem campo de estrelas em Points aqui: pontos de um pixel numa casca
    // distante serrilham a cada movimento de cabeça, e era isso que fazia o
    // espaço piscar. As estrelas do espaço vêm do shader do céu, onde nascem
    // no centro de uma célula e somem suavemente na borda.
  }

  /** 0 esconde tudo, 1 mostra por inteiro. */
  setProgress(v) {
    this.progress = v;
    this.visible = v > 0.01;
    for (const g of this.planets) g.userData.mat.uniforms.uWarp.value = v;
    return v;
  }

  /**
   * Redimensiona o planeta na mão. Devolve true quando ele passa do limiar —
   * é o momento de atravessar para o mundo dele.
   */
  scaleHeld(planeta, fator) {
    const s = Math.min(ENTER_SCALE + 0.4, Math.max(MIN_SCALE, fator));
    planeta.scale.setScalar(s);
    // Acende conforme se aproxima do limiar.
    planeta.userData.mat.uniforms.uGrow.value =
      Math.max(0, (s - 1.6) / (ENTER_SCALE - 1.6));
    return s >= ENTER_SCALE;
  }

  /** Devolve todos os planetas ao tamanho normal. */
  resetScales() {
    for (const g of this.planets) {
      g.scale.setScalar(1);
      g.userData.mat.uniforms.uGrow.value = 0;
    }
  }

  /**
   * Os portais por onde se atravessa, em coordenadas de mundo. Vêm dos
   * buracos abertos nas paredes; sem pelo menos dois, ninguém atravessa nada.
   */
  setPortais(lista = []) {
    this.portais = lista;
    return this;
  }

  /**
   * A FÍSICA DO ENXAME.
   *
   * Deixou de ser uma órbita escrita à mão e virou força. São três:
   *
   * Uma mola fraca para o centro, que é o que segura o enxame ao seu redor
   * em vez de deixá-lo escapar pela sala. Ela é linear, então o movimento que
   * ela produz é harmônico e estável — nada de planeta despencando no centro.
   *
   * A gravidade entre eles, que é o que dá o desvio mútuo e as passagens
   * rasantes.
   *
   * E o CONTATO, que é o que os impede de se tocar. Ele é sempre mais forte
   * que a gravidade na distância em que as superfícies se encostam, senão
   * dois planetas pesados se atravessariam.
   */
  update(t, dt) {
    if (!this.visible) return;

    // Um passo grande faz o contato explodir: a repulsão é dura, e integrar
    // com dt de um quadro perdido lançaria o planeta para fora da sala.
    const passo = Math.min(dt, 1 / 45);

    for (let i = 0; i < this.planets.length; i++) {
      const a = this.planets[i];
      a.userData.corpo.rotation.y = t * a.userData.giro;
      if (a.userData.preso) { a.userData.vel.set(0, 0, 0); continue; }

      const pa = a.position;
      const ra = a.userData.raio * a.scale.x;
      _acc.set(0, CENTRO_Y - pa.y, 0).multiplyScalar(MOLA * 0.6);
      _acc.x += -pa.x * MOLA;
      _acc.z += -pa.z * MOLA;

      for (let j = 0; j < this.planets.length; j++) {
        if (i === j) continue;
        const b = this.planets[j];
        _d.copy(b.position).sub(pa);
        const dist = Math.max(_d.length(), 1e-3);
        _d.divideScalar(dist);

        _acc.addScaledVector(_d, G * b.userData.massa / (dist * dist + 0.30));

        // A folga é medida entre as SUPERFÍCIES, não entre os centros, e com
        // 6% de margem: eles chegam perto e param antes de encostar.
        const soma = (ra + b.userData.raio * b.scale.x) * 1.06;
        if (dist < soma) _acc.addScaledVector(_d, (dist - soma) * CONTATO);
      }

      const v = a.userData.vel;
      v.addScaledVector(_acc, passo);
      v.multiplyScalar(1 - Math.min(1, AMORTECE * passo));
      if (v.lengthSq() > V_MAX * V_MAX) v.setLength(V_MAX);
      pa.addScaledVector(v, passo);

      // Nunca abaixo do joelho nem acima do alcance: o enxame é para ser
      // pego com a mão, e um planeta no chão ou no teto sai do jogo.
      if (pa.y < 0.42) { pa.y = 0.42; v.y = Math.abs(v.y) * 0.5; }
      if (pa.y > 2.30) { pa.y = 2.30; v.y = -Math.abs(v.y) * 0.5; }

      this.#atravessar(a, ra);
    }

    this.#separar();
  }

  /**
   * SEPARA de verdade quem ficou sobreposto.
   *
   * A força de contato empurra, mas não garante nada: com passo grande, ou
   * com dois planetas se aproximando rápido, eles já entraram um no outro
   * antes de ela ter tempo de agir — o teste mediu 33 cm de interpenetração
   * com a força sozinha. Aqui eles são simplesmente afastados, o que torna a
   * invariante exata em vez de provável.
   *
   * Poucas passagens bastam: separar um par pode encostar noutro, e três
   * rodadas resolvem qualquer arranjo que caiba nesta sala.
   */
  #separar() {
    for (let rodada = 0; rodada < 3; rodada++) {
      let mexeu = false;
      for (let i = 0; i < this.planets.length; i++) {
        for (let j = i + 1; j < this.planets.length; j++) {
          const a = this.planets[i], b = this.planets[j];
          _d.copy(b.position).sub(a.position);
          let dist = _d.length();
          // Concêntricos: qualquer direção serve para desempatar.
          if (dist < 1e-4) { _d.set(1, 0, 0); dist = 1e-4; }
          const soma = (a.userData.raio * a.scale.x + b.userData.raio * b.scale.x) * 1.02;
          if (dist >= soma) continue;

          _d.divideScalar(dist);
          const sobra = soma - dist;
          // Quem está na mão não cede: a mão é que manda na posição dele.
          const pa = a.userData.preso, pb = b.userData.preso;
          if (pa && pb) continue;
          const fa = pa ? 0 : (pb ? 1 : 0.5);
          const fb = pb ? 0 : (pa ? 1 : 0.5);
          a.position.addScaledVector(_d, -sobra * fa);
          b.position.addScaledVector(_d, sobra * fb);

          // Mata a aproximação, senão eles voltam a entrar no quadro seguinte.
          const va = a.userData.vel, vb = b.userData.vel;
          const rel = _d.dot(_p2.copy(vb).sub(va));
          if (rel < 0) {
            if (!pa) va.addScaledVector(_d, rel * 0.5);
            if (!pb) vb.addScaledVector(_d, -rel * 0.5);
          }
          mexeu = true;
        }
      }
      if (!mexeu) break;
    }
  }

  /**
   * Entrou num buraco, sai pelo outro.
   *
   * O teste é contra o PLANO da parede: perto dele e dentro do disco. Testar
   * só a distância ao centro do buraco deixaria passar o planeta que raspa a
   * borda, e ele atravessaria a parede sem portal nenhum.
   */
  #atravessar(planeta, raio) {
    const portais = this.portais;
    if (!portais || portais.length < 2) return;

    for (let k = 0; k < portais.length; k++) {
      const entrada = portais[k];
      _d.copy(planeta.position).sub(entrada.pos);
      const normal = _d.dot(entrada.normal);
      if (Math.abs(normal) > 0.30) continue;
      _p2.copy(_d).addScaledVector(entrada.normal, -normal);
      if (_p2.length() > entrada.raio * 0.85) continue;

      const saida = portais[(k + 1) % portais.length];
      // Sai já do lado de dentro do cômodo, com folga do próprio raio, senão
      // reentraria no mesmo quadro e ficaria preso indo e voltando.
      planeta.position.copy(saida.pos).addScaledVector(saida.normal, raio + 0.28);

      // A velocidade também vira: o que ia contra a parede passa a vir dela.
      const v = planeta.userData.vel;
      const vn = v.dot(saida.normal);
      v.addScaledVector(saida.normal, Math.abs(vn) - vn + 0.22);
      this.onTravessia?.(planeta, entrada, saida);
      return;
    }
  }

  /** Planeta ao alcance de `world`, ou null. */
  pick(world) {
    let melhor = null, dist = Infinity;
    for (const g of this.planets) {
      const d = g.getWorldPosition(_p).distanceTo(world);
      const limite = g.userData.raio * 1.9 + 0.12;
      if (d < limite && d < dist) { dist = d; melhor = g; }
    }
    return melhor;
  }

  /**
   * Planeta sob a mira. Sentado ou deitado não dá para alcançar uma órbita de
   * um metro e meio com o braço, então o alcance é a mira, não o alcance.
   */
  pickAlongRay(origem, direcao, alcance = 9) {
    let melhor = null, melhorT = Infinity;
    for (const g of this.planets) {
      g.getWorldPosition(_p);
      _p.sub(origem);
      const t = _p.dot(direcao);
      if (t < 0.05 || t > alcance) continue;
      _p.copy(origem).addScaledVector(direcao, t);
      // Corredor proporcional ao próprio planeta, com um piso generoso: os
      // pequenos ficariam impossíveis de acertar de longe.
      const raio = Math.max(g.userData.raio * g.scale.x * 1.8, 0.22);
      if (_p.distanceTo(g.getWorldPosition(_s2)) > raio) continue;
      if (t < melhorT) { melhorT = t; melhor = g; }
    }
    return melhor;
  }

  lift(planeta) {
    planeta.userData.preso = true;
    return planeta;
  }

  carry(planeta, world) {
    this.worldToLocal(_p.copy(world));
    planeta.position.copy(_p);
  }

  /** Solta o planeta: ele volta à órbita a partir de onde foi deixado. */
  /**
   * Solta o planeta. Ele parte do repouso e a mola do centro faz o resto —
   * herdar a velocidade da mão daria arremesso, e um planeta arremessado
   * atravessa a sala antes de a física conseguir segurá-lo.
   */
  drop(planeta) {
    planeta.userData.preso = false;
    planeta.userData.vel.set(0, 0, 0);
  }

  dispose() {
    for (const g of this.planets) {
      g.traverse((o) => o.isMesh && o.geometry.dispose());
      g.userData.mat.dispose();
    }
    this.clear();
  }
}

/**
 * A borboleta que sai do casulo e sobe, deixando rastro de luz.
 *
 * O rastro é um anel de posições reaproveitado: o índice mais velho é
 * sobrescrito a cada emissão, então o buffer nunca cresce e não há alocação
 * durante a animação.
 */
export class Emergence extends Group {
  constructor(butterflyGeometry, butterflyMaterial, trailLength = 90) {
    super();
    this.name = 'eclosao';
    this.frustumCulled = false;
    this.visible = false;

    this.mesh = new Mesh(butterflyGeometry, butterflyMaterial);
    this.mesh.scale.setScalar(2.2);       // maior que as comuns: é a protagonista
    this.mesh.frustumCulled = false;
    this.add(this.mesh);

    this.n = trailLength;
    this.pos = new Float32Array(trailLength * 3);
    this.age = new Float32Array(trailLength).fill(1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aAge', new BufferAttribute(this.age, 1));
    this.trail = new Points(g, trailMaterial);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 12;
    this.add(this.trail);

    this.cursor = 0;
    this.t = 0;
    this.duration = 8.0;   // a subida da borboleta É a transição; sem pressa
    this.from = new Vector3();
    this.active = false;
  }

  /** Dispara a subida a partir de `origem` (mundo). */
  launch(origem) {
    this.from.copy(origem);
    this.t = 0;
    this.active = true;
    this.visible = true;
    this.age.fill(1);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = origem.x; this.pos[i * 3 + 1] = origem.y; this.pos[i * 3 + 2] = origem.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAge.needsUpdate = true;
  }

  /** @returns {number} 0..1 de quanto da subida já passou */
  update(dt, t) {
    if (!this.active) return 0;
    this.t = Math.min(1, this.t + dt / this.duration);

    // Sobe acelerando devagar, em espiral que abre com a altura. O expoente
    // 2,4 no lugar de 2 deixa o início mais demorado — ela hesita ao sair.
    const k = Math.pow(this.t, 2.4);
    const altura = k * 16;
    const giro = this.t * 5.5;
    const abre = 0.18 + this.t * 0.9;
    _p.set(
      this.from.x + Math.cos(giro) * abre,
      this.from.y + altura,
      this.from.z + Math.sin(giro) * abre,
    );
    this.mesh.position.copy(_p);
    this.mesh.rotation.y = giro + Math.PI / 2;
    this.mesh.rotation.z = Math.sin(t * 2.2) * 0.22;

    // Emite no anel, envelhecendo o resto.
    const i = this.cursor;
    this.pos[i * 3] = _p.x; this.pos[i * 3 + 1] = _p.y; this.pos[i * 3 + 2] = _p.z;
    this.age[i] = 0;
    this.cursor = (this.cursor + 1) % this.n;
    for (let j = 0; j < this.n; j++) this.age[j] = Math.min(1, this.age[j] + dt * 0.30);

    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAge.needsUpdate = true;

    if (this.t >= 1) { this.active = false; this.visible = false; }
    return this.t;
  }

  dispose() { this.trail.geometry.dispose(); this.clear(); }
}
