import {
  Group, InstancedMesh, InstancedBufferAttribute, BufferGeometry,
  BufferAttribute, Matrix4, Vector3, Quaternion, Points, Euler,
} from '../vendor/three/three.module.min.js';
import {
  butterflyMaterial, fishMaterial, fireflyFieldMaterial,
  butterflyCloudMaterial, starPointMaterial,
} from './shaders/materials.js';
import { NuvemDePontos } from './nuvem.js';
import { nuvem as nuvemBorboleta } from './nuvens/borboleta.js';
import { rng } from './forest.js';

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _v = new Vector3();
const _qRoll = new Quaternion();
const _upY = new Vector3(0, 1, 0);
const _e = new Euler();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Borboletas
// ---------------------------------------------------------------------------

/**
 * Uma borboleta.
 *
 * A versão anterior tinha duas lascas finas e pontudas por lado, e por isso
 * parecia libélula: libélula tem asa estreita e corpo comprido, borboleta tem
 * asa LARGA e arredondada e corpo curto e grosso.
 *
 * Cada lado é um leque de triângulos saindo da dobradiça até um contorno
 * arredondado, e as duas asas do lado se encostam, formando uma silhueta
 * contínua como a de uma monarca.
 *
 * Os pontos do contorno ganham um pouco de Z proporcional à distância da
 * dobradiça: a asa fica ligeiramente abaulada em vez de ser uma placa plana,
 * e é isso que impede a leitura de recorte de papel.
 */

/** Contorno da asa dianteira, do lado direito. Espelhado para o esquerdo. */
const FOREWING = [
  [0.014, 0.030], [0.038, 0.038], [0.062, 0.032],
  [0.076, 0.014], [0.070, -0.006], [0.044, -0.014], [0.014, -0.012],
];
/** Contorno da asa traseira, menor e mais redonda, encostando na dianteira. */
const HINDWING = [
  [0.014, -0.012], [0.042, -0.018], [0.058, -0.036],
  [0.048, -0.056], [0.024, -0.058], [0.006, -0.040],
];

const FORE_HINGE = [0.002, 0.010];
const HIND_HINGE = [0.002, -0.020];
const CAMBER = 0.16;      // quanto a asa abauda ao longo da envergadura

function butterflyGeometry() {
  const pos = [], wing = [], span = [];

  const empurra = (p, w, sp) => { pos.push(...p); wing.push(w); span.push(sp); };

  /** Leque de triângulos da dobradiça até o contorno. */
  const leque = (hinge, contorno, lado, extensaoMax) => {
    const hx = hinge[0] * lado, hy = hinge[1];
    for (let i = 0; i < contorno.length - 1; i++) {
      const a = contorno[i], b = contorno[i + 1];
      const spanA = Math.hypot(a[0] - hinge[0], a[1] - hinge[1]) / extensaoMax;
      const spanB = Math.hypot(b[0] - hinge[0], b[1] - hinge[1]) / extensaoMax;
      empurra([hx, hy, 0], lado, 0);
      empurra([a[0] * lado, a[1], spanA * CAMBER * 0.09], lado, Math.min(1, spanA));
      empurra([b[0] * lado, b[1], spanB * CAMBER * 0.09], lado, Math.min(1, spanB));
    }
  };

  const alcance = (hinge, contorno) => Math.max(
    ...contorno.map((p) => Math.hypot(p[0] - hinge[0], p[1] - hinge[1])));
  const foreMax = alcance(FORE_HINGE, FOREWING);
  const hindMax = alcance(HIND_HINGE, HINDWING);

  for (const lado of [-1, 1]) {
    leque(FORE_HINGE, FOREWING, lado, foreMax);
    leque(HIND_HINGE, HINDWING, lado, hindMax);
  }

  // Corpo curto e grosso, com tórax mais largo que o abdômen.
  const corpo = [
    [[0, 0.034, 0], [0.007, 0.010, 0.004], [-0.007, 0.010, 0.004]],   // cabeça
    [[0.007, 0.010, 0.004], [0.006, -0.014, 0.003], [-0.007, 0.010, 0.004]],
    [[-0.007, 0.010, 0.004], [0.006, -0.014, 0.003], [-0.006, -0.014, 0.003]],
    [[0.006, -0.014, 0.003], [0, -0.050, 0], [-0.006, -0.014, 0.003]],  // abdômen
  ];
  for (const t of corpo) for (const v of t) empurra(v, 0, 0);

  // Antenas: dois filetes para a frente. Libélula não tem; a silhueta muda.
  for (const lado of [-1, 1]) {
    empurra([lado * 0.002, 0.032, 0], 0, 0);
    empurra([lado * 0.016, 0.056, 0.002], 0, 0);
    empurra([lado * 0.007, 0.032, 0], 0, 0);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aWing', new BufferAttribute(new Float32Array(wing), 1));
  g.setAttribute('aSpan', new BufferAttribute(new Float32Array(span), 1));
  g.computeVertexNormals();
  return g;
}

/**
 * Semente fixa por instância.
 *
 * Objeto que se move não pode tirar a semente da própria posição: ela mudaria
 * a cada frame, e com ela a espécie, a cor e a fase. O resultado é cintilação.
 */
function seedAttribute(count, seed) {
  const r = rng(seed);
  const arr = new Float32Array(count);
  for (let i = 0; i < count; i++) arr[i] = r();
  return new InstancedBufferAttribute(arr, 1);
}

/**
 * Enxame de borboletas vagando pela clareira.
 *
 * O caminho de cada uma é a soma de duas senóides de frequências que não são
 * múltiplas — o padrão leva minutos para se repetir, então o voo não fica
 * obviamente cíclico como uma órbita simples ficaria.
 */
export class Butterflies extends Group {
  constructor(count = 12) {
    super();
    this.name = 'borboletas';
    this.frustumCulled = false;

    this.mesh = criarNuvemDeBorboletas(count, 8123);
    this.mesh.renderOrder = 6;
    this.add(this.mesh);

    this.count = count;
    this.paths = [];
    this.radius = 3.0;
    this._prev = [];

    const r = rng(20260824);
    for (let i = 0; i < count; i++) {
      this.paths.push({
        cx: 0, cz: 0,
        rx: 0.5 + r() * 0.9, rz: 0.5 + r() * 0.9,
        wx: 0.065 + r() * 0.10, wz: 0.055 + r() * 0.11,
        px: r() * 6.28, pz: r() * 6.28,
        // Estado de VOO, e não de caminho: o rumo de onde ela vinha, para a
        // virada saber de onde está virando, e a inclinação lateral corrente.
        rumo: new Vector3(0, 0, 1), rumoAnt: 0, banco: 0,
        alt: 0.7 + r() * 1.5, bob: 0.18 + r() * 0.30, wb: 0.22 + r() * 0.36,
        escala: 0.75 + r() * 0.7,
      });
      this._prev.push(new Vector3());
    }
  }

  /** Redistribui os centros de voo dentro do cômodo recém-lido. */
  fitTo(radius) {
    this.radius = Math.max(1.0, radius);
    const r = rng(97 + Math.round(radius * 100));
    for (const p of this.paths) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * this.radius * 0.7;
      p.cx = Math.cos(a) * d;
      p.cz = Math.sin(a) * d;
    }
    this.mesh.count = this.count;
  }

  update(t) {
    if (!this.mesh.count) return;
    for (let i = 0; i < this.count; i++) {
      const p = this.paths[i];
      // A harmônica secundária caiu de 0,35 para 0,18: era ela que punha
      // tremida por cima do arco largo, e tremida não é gracioso.
      const x = p.cx + Math.cos(t * p.wx + p.px) * p.rx + Math.sin(t * p.wx * 2.3 + p.pz) * p.rx * 0.18;
      const z = p.cz + Math.sin(t * p.wz + p.pz) * p.rz + Math.cos(t * p.wz * 1.9 + p.px) * p.rz * 0.18;
      const y = p.alt + Math.sin(t * p.wb + p.px) * p.bob;
      _p.set(x, y, z);

      // ORIENTAÇÃO COM CIMA.
      //
      // Antes isto era `setFromUnitVectors(cima, direção)`, e havia dois
      // erros num só lugar. O primeiro é o eixo: no modelo assado o corpo
      // corre em Z, e alinhar o Y punha a borboleta voando de pé.
      //
      // O segundo é mais fundo. Aquela função dá o arco MAIS CURTO entre dois
      // vetores, e um arco curto não tem nenhuma referência de cima — o
      // rolamento sobra livre. Conforme a direção varria o círculo do voo, a
      // borboleta rodopiava sobre o próprio eixo. Era literalmente uma
      // rotação sem gravidade.
      //
      // Agora a pose é montada com o mundo como referência: o rumo vem do
      // deslocamento horizontal, a subida vira INCLINAÇÃO do nariz, e o giro
      // vira INCLINAÇÃO LATERAL. Bicho que voa não rola de barriga para cima.
      _dir.copy(_p).sub(this._prev[i]);
      this._prev[i].copy(_p);

      const subida = _dir.y;
      _dir.y = 0;
      const passo = _dir.length();
      if (passo > 1e-6) { _dir.divideScalar(passo); p.rumo.copy(_dir); }
      else _dir.copy(p.rumo);

      const rumo = Math.atan2(_dir.x, _dir.z);
      // Diferença angular no menor caminho, senão a virada de -π para +π
      // produz um tombo de meia volta num quadro só.
      let giro = rumo - p.rumoAnt;
      while (giro > Math.PI) giro -= Math.PI * 2;
      while (giro < -Math.PI) giro += Math.PI * 2;
      p.rumoAnt = rumo;

      // O banco persegue o giro em vez de segui-lo de imediato: virar tem que
      // custar um instante, senão a inclinação vibra junto com o ruído do
      // deslocamento.
      const alvoBanco = Math.max(-0.45, Math.min(0.45, -giro * 7.0));
      p.banco += (alvoBanco - p.banco) * 0.10;

      const nariz = Math.max(-0.40, Math.min(0.40, Math.atan2(subida, Math.max(passo, 1e-4)) * 0.5));

      // YXZ: o rumo primeiro, depois o nariz, e o banco por último em torno
      // do eixo do corpo — que é a ordem em que as três coisas acontecem.
      _e.set(nariz, rumo, p.banco, 'YXZ');
      _q.setFromEuler(_e);

      _s.setScalar(p.escala);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.clear(); }
}

// ---------------------------------------------------------------------------
// Vaga-lumes
// ---------------------------------------------------------------------------

/**
 * Enxame que orbita um alvo. Usado de duas formas: preso ao corpo inferido do
 * próprio usuário, e solto num ponto onde ele "abençoou" alguém.
 *
 * O alvo é seguido com atraso, então o enxame se estica ao acompanhar um
 * movimento rápido e volta a se juntar quando ele para — que é como um bando
 * de verdade se comporta.
 */
export class Fireflies extends Group {
  constructor(count = 26, seed = 7) {
    super();
    this.name = 'vagalumes';
    this.frustumCulled = false;

    // UM PONTO por vaga-lume, e não um icosaedro.
    //
    // Eram sólidos de vinte faces com um centímetro e meio, e a essa escala
    // um poliedro não lê como luz: lê como cascalho colorido flutuando em
    // volta da pessoa. É a mesma queixa que já tinha tirado os orbes e as
    // estrelas da constelação de cena — este bando tinha escapado.
    this.pos = new Float32Array(count * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    const sem = new Float32Array(count);
    const rs = rng(seed * 31 + 7);
    for (let i = 0; i < count; i++) sem[i] = rs();
    geo.setAttribute('aSeed', new BufferAttribute(sem, 1));

    this.mesh = new Points(geo, starPointMaterial);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.add(this.mesh);

    this.count = count;
    this.target = new Vector3();
    this.follow = new Vector3();
    this.height = 1.0;
    this.spread = 0.55;

    const r = rng(seed);
    this.orbits = Array.from({ length: count }, () => ({
      raio: 0.28 + r() * 0.55,
      alt: r() * 1.35,
      fase: r() * Math.PI * 2,
      vel: 0.16 + r() * 0.34,
      bob: 0.06 + r() * 0.16,
      wb: 0.30 + r() * 0.70,
      inc: (r() - 0.5) * 0.5,
    }));
  }

  setTarget(v) { this.target.copy(v); return this; }
  snapTo(v) { this.target.copy(v); this.follow.copy(v); return this; }

  update(t, dt) {
    // Atraso: o bando se estica ao seguir e se junta ao parar.
    // Atraso maior: o bando demora mais a te alcançar, e essa preguiça é o
    // que faz parecer bando e não enfeite preso ao corpo.
    this.follow.lerp(this.target, 1 - Math.exp(-dt * 1.3));

    for (let i = 0; i < this.count; i++) {
      const o = this.orbits[i];
      const a = o.fase + t * o.vel;
      _p.set(
        this.follow.x + Math.cos(a) * o.raio * this.spread / 0.55,
        this.follow.y + o.alt * this.height + Math.sin(t * o.wb + o.fase) * o.bob,
        this.follow.z + Math.sin(a) * o.raio * (1 + o.inc) * this.spread / 0.55,
      );
      // Ponto não tem matriz: a posição vai direto no atributo.
      this.pos[i * 3] = _p.x;
      this.pos[i * 3 + 1] = _p.y;
      this.pos[i * 3 + 2] = _p.z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.clear(); }
}


/**
 * Estações do corpo: (y ao longo do comprimento, meia-altura).
 *
 * A cabeça é o +Y e a cauda o -Y, e a onda do shader desloca em X — que é o
 * lado. Peixe ondula de lado; ondular para cima e para baixo é golfinho, e a
 * silhueta denunciaria na hora.
 */
const CORPO_PEIXE = [
  [0.058, 0.000], [0.046, 0.012], [0.026, 0.021], [0.000, 0.023],
  [-0.026, 0.016], [-0.048, 0.008], [-0.058, 0.004],
];
/** Ponta da cauda: forquilha aberta. */
const CAUDA_PEIXE = [[-0.088, 0.030], [-0.074, 0.006], [-0.088, -0.030]];

function fishGeometry() {
  const pos = [], span = [];
  const total = CORPO_PEIXE[0][0] - CAUDA_PEIXE[0][0];
  const s = (y) => Math.min(1, Math.max(0, (CORPO_PEIXE[0][0] - y) / total));
  const push = (y, z) => { pos.push(0, y, z); span.push(s(y)); };

  // Corpo: um quadrilátero entre cada par de estações.
  for (let i = 0; i < CORPO_PEIXE.length - 1; i++) {
    const [y0, h0] = CORPO_PEIXE[i];
    const [y1, h1] = CORPO_PEIXE[i + 1];
    push(y0, h0); push(y0, -h0); push(y1, -h1);
    push(y0, h0); push(y1, -h1); push(y1, h1);
  }

  // Cauda em forquilha, saindo do pedúnculo.
  const [yp, hp] = CORPO_PEIXE[CORPO_PEIXE.length - 1];
  push(yp, hp); push(...CAUDA_PEIXE[0]); push(...CAUDA_PEIXE[1]);
  push(yp, -hp); push(...CAUDA_PEIXE[1]); push(...CAUDA_PEIXE[2]);

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aSpan', new BufferAttribute(new Float32Array(span), 1));
  g.computeVertexNormals();
  return g;
}

/**
 * CARDUME — os seres do mundo aquático, no lugar das borboletas.
 *
 * O caminho é o mesmo princípio do enxame de borboletas: duas senóides de
 * frequências não múltiplas, que levam minutos para se repetir. O que muda é
 * a atitude — eles vão mais devagar, mais fundo, e se inclinam na curva em
 * vez de flutuar sempre nivelados.
 */
export class Cardume extends Group {
  constructor(count = 18) {
    super();
    this.name = 'cardume';
    this.frustumCulled = false;

    const geo = fishGeometry();
    geo.setAttribute('aSeed', seedAttribute(count, 5501));
    this.mesh = new InstancedMesh(geo, fishMaterial, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.count = 0;
    this.add(this.mesh);

    this.count = count;
    this.radius = 3.0;
    this.paths = [];
    this._prev = [];
    const r = rng(6203);
    for (let i = 0; i < count; i++) {
      this.paths.push({
        cx: 0, cz: 0,
        rx: 0.5 + r() * 1.5, rz: 0.5 + r() * 1.5,
        wx: 0.10 + r() * 0.14, wz: 0.09 + r() * 0.13,
        px: r() * 6.28318, pz: r() * 6.28318,
        alt: 0.5 + r() * 1.1, sobe: 0.10 + r() * 0.22,
        escala: 0.8 + r() * 1.1,
      });
      this._prev.push(new Vector3());
    }
  }

  fitTo(radius) {
    this.radius = Math.max(1.0, radius);
    const r = rng(311 + Math.round(radius * 100));
    for (const p of this.paths) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * this.radius * 0.75;
      p.cx = Math.cos(a) * d;
      p.cz = Math.sin(a) * d;
    }
    this.mesh.count = this.count;
  }

  update(t) {
    if (!this.mesh.count) return;
    for (let i = 0; i < this.count; i++) {
      const p = this.paths[i];
      const x = p.cx + Math.cos(t * p.wx + p.px) * p.rx;
      const z = p.cz + Math.sin(t * p.wz + p.pz) * p.rz;
      const y = p.alt + Math.sin(t * p.sobe + p.px) * 0.28;
      _p.set(x, y, z);

      // Olha para onde está indo. Sem isto o peixe anda de lado, que é o
      // erro mais fácil de cometer e o mais fácil de ver.
      _v.copy(_p).sub(this._prev[i]);
      if (_v.lengthSq() < 1e-8) _v.set(0, 0, 1);
      _v.normalize();
      // A geometria aponta para +Y; girar de Y para a direção do nado.
      _q.setFromUnitVectors(_upY, _v);
      // Inclina na curva, como quem faz a volta apoiado na barbatana.
      _q.multiply(_qRoll.setFromAxisAngle(_upY, Math.sin(t * p.wx * 1.7 + p.px) * 0.5));

      this._prev[i].copy(_p);
      _s.setScalar(p.escala);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.clear(); }
}


/**
 * CAMPO DE VAGA-LUMES.
 *
 * Substitui os orbes, que eram icosaedros sólidos pairando acima da cabeça —
 * poliedro flutuando não lê como bicho, lê como geometria esquecida no ar.
 *
 * Aqui cada vaga-lume é um ponto, e toda a vida dele (deriva, tamanho, fase do
 * pisca) acontece no shader a partir da semente. O JavaScript escreve as
 * posições de origem uma vez, quando o cômodo é lido, e nunca mais toca: o
 * campo inteiro custa UMA chamada de desenho, e por isso pode ser grande.
 */
export class Pirilampos extends Group {
  constructor(count = 700) {
    super();
    this.name = 'campo-de-vagalumes';
    this.frustumCulled = false;
    this.count = count;

    this.pos = new Float32Array(count * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    const sementes = new Float32Array(count);
    const r = rng(4409);
    for (let i = 0; i < count; i++) sementes[i] = r();
    geo.setAttribute('aSeed', new BufferAttribute(sementes, 1));

    this.points = new Points(geo, fireflyFieldMaterial);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.add(this.points);
  }

  /**
   * Espalha o campo pelo volume do cômodo lido.
   *
   * A altura tem viés para BAIXO (raiz quadrada do sorteio): vaga-lume de
   * verdade se concentra rente ao mato, e distribuir uniforme até o teto dava
   * um chuvisco parado no alto, sem relação com a mata embaixo.
   */
  fitTo(footprint, alturaTeto = 2.6) {
    if (!footprint?.length) return this;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of footprint) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    // Uma folga para fora da pegada: eles não param na linha da parede.
    const folga = 0.5;
    const r = rng(77 + Math.round((maxX - minX) * 100));
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = minX - folga + r() * (maxX - minX + folga * 2);
      // Potência > 1 empurra o sorteio para BAIXO. A raiz quadrada faz o
      // contrário — foi o que eu tinha escrito, contra o próprio comentário.
      this.pos[i * 3 + 1] = 0.12 + Math.pow(r(), 1.8) * Math.max(0.8, alturaTeto - 0.35);
      this.pos[i * 3 + 2] = minZ - folga + r() * (maxZ - minZ + folga * 2);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    return this;
  }

  /** Quantos estão vivos nesta cena. */
  setDensidade(k) {
    this.points.geometry.setDrawRange(0, Math.max(0, Math.round(this.count * k)));
    return this;
  }

  dispose() { this.points.geometry.dispose(); this.clear(); }
}


/**
 * A nuvem de borboletas, a partir do modelo assado.
 *
 * A batida de asa sobreviveu à troca de malha por pontos porque tudo o que
 * ela precisa saber cabe em dois números por ponto: de que LADO do corpo ele
 * está e a que DISTÂNCIA da dobradiça. Os dois se leem direto da coordenada,
 * sem depender de como a malha foi construída.
 *
 * No modelo assado o corpo corre em Z e a envergadura em X — foi o que a
 * caixa da nuvem disse —, então o lado é o sinal de x e a envergadura é |x|
 * normalizado.
 */
/**
 * Envergadura da borboleta, em metros, antes da variação de tamanho.
 *
 * A nuvem assada sai NORMALIZADA — o maior lado dela vale 1 —, enquanto a
 * geometria procedural que ela substituiu já vinha em metros, com uns doze
 * centímetros de ponta a ponta. Trocar uma pela outra sem reescalar deu
 * borboletas de UM METRO de envergadura.
 *
 * Doze centímetros é uma monarca; com a variação de tamanho do enxame, o
 * conjunto vai de dez a dezenove centímetros, que é a faixa real.
 */
const ENVERGADURA = 0.125;

export function criarNuvemDeBorboletas(quantas, semente) {
  const pts = nuvemBorboleta();
  for (let i = 0; i < pts.length; i++) pts[i] *= ENVERGADURA;
  const n = pts.length / 3;
  const aWing = new Float32Array(n);
  const aSpan = new Float32Array(n);

  // Meia envergadura da nuvem normalizada, para o span chegar a 1 na ponta.
  let meia = 0;
  for (let i = 0; i < n; i++) meia = Math.max(meia, Math.abs(pts[i * 3]));
  meia = meia || 1;

  for (let i = 0; i < n; i++) {
    const x = pts[i * 3];
    // Perto da linha do meio é CORPO: não bate, e é isso que impede o tórax
    // de se partir em dois quando a asa sobe.
    aWing[i] = Math.abs(x) < meia * 0.06 ? 0 : Math.sign(x);
    aSpan[i] = Math.min(1, Math.abs(x) / meia);
  }

  const nuvem = new NuvemDePontos(
    pts, butterflyCloudMaterial, quantas, 0, semente, { aWing, aSpan });
  nuvem.count = 0;
  return nuvem;
}
