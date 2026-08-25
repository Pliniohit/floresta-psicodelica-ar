import {
  Group, InstancedMesh, Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { rng } from './forest.js';

/**
 * Tronco e braços INFERIDOS a partir de cabeça e punhos.
 *
 * Isto não é rastreamento corporal: o WebXR não expõe nada disso, e o
 * passthrough do Quest não entrega pixels para a página. O que existe são três
 * pontos — cabeça e as duas mãos — e é deles que o resto é estimado, que é a
 * mesma IK de três pontos usada em avatares de meio corpo.
 *
 * Consequência honesta: pernas não existem, e uma pose estranha (mão atrás das
 * costas) produz um cotovelo estranho. Para fazer coisas florescerem em cima
 * de você, é o suficiente.
 */

const UPPER_ARM = 0.28;
const FOREARM = 0.26;
const ARM = UPPER_ARM + FOREARM;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _axis = new Vector3();
const _pole = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * IK de dois ossos. Devolve a posição do cotovelo entre `origem` e `alvo`.
 * `pole` puxa a dobra para um lado — sem ele a solução é um círculo inteiro
 * de cotovelos igualmente válidos, e ele ficaria girando sem critério.
 */
function twoBone(origem, alvo, pole, out) {
  _a.copy(alvo).sub(origem);
  const d = _a.length();

  if (d < 1e-4) { return out.copy(origem); }
  if (d >= ARM * 0.999) {
    // Braço esticado: cotovelo na reta, sem dobra possível.
    return out.copy(origem).addScaledVector(_a, UPPER_ARM / d);
  }

  const cos = (d * d + UPPER_ARM * UPPER_ARM - FOREARM * FOREARM) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - cos * cos));

  _a.divideScalar(d);                       // direção ombro -> punho
  _pole.copy(pole).addScaledVector(_a, -pole.dot(_a));   // componente perpendicular
  if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0).addScaledVector(_a, -_a.y * -1);
  _pole.normalize();

  return out.copy(origem).addScaledVector(_a, cos).addScaledVector(_pole, h);
}

export class Body {
  constructor() {
    this.tracked = false;
    this.hasArms = { left: false, right: false };

    this.joints = {
      head: new Vector3(), neck: new Vector3(), chest: new Vector3(),
      hips: new Vector3(),
      shoulderL: new Vector3(), shoulderR: new Vector3(),
      elbowL: new Vector3(), elbowR: new Vector3(),
      handL: new Vector3(), handR: new Vector3(),
    };

    this.right = new Vector3(1, 0, 0);    // eixo lateral do corpo
    this.forward = new Vector3(0, 0, -1);
  }

  /**
   * @param {THREE.Camera} camera  a cabeça
   * @param {Hands} hands          para os punhos, quando rastreados
   */
  update(camera, hands) {
    const j = this.joints;
    camera.getWorldPosition(j.head);
    camera.getWorldQuaternion(_q);

    // Direção do corpo: para onde a cabeça olha, achatado no plano. A cabeça
    // gira muito mais que os ombros, então usar a inclinação dela também
    // deixaria o tronco cambaleando junto.
    this.forward.set(0, 0, -1).applyQuaternion(_q);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.right.crossVectors(this.forward, UP).normalize().negate();

    j.neck.copy(j.head).addScaledVector(UP, -0.14).addScaledVector(this.forward, -0.03);
    j.chest.copy(j.neck).addScaledVector(UP, -0.24);
    j.hips.copy(j.chest).addScaledVector(UP, -0.32);
    j.shoulderL.copy(j.neck).addScaledVector(this.right, -0.18);
    j.shoulderR.copy(j.neck).addScaledVector(this.right, 0.18);

    // O cotovelo cai e abre para fora: é o repouso natural do braço.
    const poleL = _b.copy(UP).multiplyScalar(-1).addScaledVector(this.right, -0.45).clone();
    const poleR = _b.copy(UP).multiplyScalar(-1).addScaledVector(this.right, 0.45).clone();

    for (const [lado, ombro, cotovelo, mao, pole] of [
      ['left', j.shoulderL, j.elbowL, j.handL, poleL],
      ['right', j.shoulderR, j.elbowR, j.handR, poleR],
    ]) {
      const h = hands?.byHandedness(lado);
      this.hasArms[lado] = !!h;
      if (h) {
        mao.copy(h.wrist);
        // Alvo fora do alcance: em vez de esticar o antebraço, o ombro avança
        // na direção da mão — é o que a cintura escapular faz de verdade, e
        // mantém os ossos com o comprimento certo.
        _a.copy(mao).sub(ombro);
        const excesso = _a.length() - ARM;
        if (excesso > 0) ombro.addScaledVector(_a.normalize(), Math.min(excesso, 0.13));
      } else {
        // Sem mão rastreada, o braço descansa ao lado do corpo.
        mao.copy(ombro).addScaledVector(UP, -0.5).addScaledVector(this.right, lado === 'left' ? -0.08 : 0.08);
      }
      twoBone(ombro, mao, pole, cotovelo);
    }

    this.tracked = true;
  }
}

/**
 * Floração sobre o corpo inferido: pequenos brotos presos aos segmentos.
 *
 * Cada broto guarda o segmento a que pertence e onde está ao longo dele, e a
 * posição é recalculada por frame — assim ele acompanha o braço em vez de
 * ficar preso onde o corpo estava quando nasceu.
 */
export class BodyGrowth extends Group {
  /**
   * @param {THREE.BufferGeometry} geometry geometria do broto
   * @param {THREE.Material} material
   */
  constructor(geometry, material, count = 30) {
    super();
    this.name = 'floracao-do-corpo';
    this.frustumCulled = false;

    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.count = 0;
    this.add(this.mesh);

    // Segmentos onde vale florescer, com peso: ombros e antebraços primeiro,
    // que é onde a pessoa consegue se ver.
    const segmentos = [
      ['shoulderL', 'elbowL', 4], ['elbowL', 'handL', 4],
      ['shoulderR', 'elbowR', 4], ['elbowR', 'handR', 4],
      ['neck', 'shoulderL', 2], ['neck', 'shoulderR', 2],
      ['chest', 'hips', 4], ['neck', 'chest', 3],
    ];

    const r = rng(31337);
    this.brotos = [];
    for (const [de, para, n] of segmentos) {
      for (let i = 0; i < n && this.brotos.length < count; i++) {
        this.brotos.push({
          de, para,
          t: 0.15 + r() * 0.7,
          ang: r() * Math.PI * 2,
          raio: 0.035 + r() * 0.045,
          escala: 0.06 + r() * 0.09,
          fase: r() * Math.PI * 2,
          crescido: 0,
        });
      }
    }
    this.blooming = false;
  }

  /** Faz a floração brotar (ou murchar) com transição. */
  setBlooming(on) { this.blooming = on; return on; }

  update(body, t, dt) {
    if (!body.tracked) { this.mesh.count = 0; return; }

    const alvo = this.blooming ? 1 : 0;
    let vivos = 0;

    for (let i = 0; i < this.brotos.length; i++) {
      const b = this.brotos[i];
      // Escalona a chegada pelo índice: a floração sobe pelo corpo em vez de
      // aparecer inteira de uma vez.
      const atraso = (i / this.brotos.length) * 0.5;
      const alvoI = alvo * Math.min(1, Math.max(0, (this.blooming ? 1 : 0) - atraso + 0.5));
      b.crescido += (alvoI - b.crescido) * (1 - Math.exp(-dt * 3.0));
      if (b.crescido < 0.01) continue;

      const de = body.joints[b.de], para = body.joints[b.para];
      _p.copy(de).lerp(para, b.t);

      // Desloca para a superfície do membro, num anel em volta do eixo.
      _axis.copy(para).sub(de);
      if (_axis.lengthSq() < 1e-8) continue;
      _axis.normalize();
      _a.crossVectors(_axis, UP);
      if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
      _a.normalize();
      _b.crossVectors(_axis, _a);

      const bal = Math.sin(t * 1.6 + b.fase) * 0.2;
      const ang = b.ang + bal;
      _p.addScaledVector(_a, Math.cos(ang) * b.raio)
        .addScaledVector(_b, Math.sin(ang) * b.raio);

      // Aponta para fora do membro.
      _axis.copy(_a).multiplyScalar(Math.cos(ang)).addScaledVector(_b, Math.sin(ang));
      _q.setFromUnitVectors(UP, _axis);

      _s.setScalar(b.escala * b.crescido);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(vivos++, _m);
    }

    this.mesh.count = vivos;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.clear(); }
}
