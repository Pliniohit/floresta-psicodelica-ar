import {
  Group, InstancedMesh, IcosahedronGeometry, Matrix4, Vector3, Quaternion,
} from '../vendor/three/three.module.min.js';
import { handMaterial } from './shaders/materials.js';

/**
 * Rastreamento de mãos. O three.js já popula `hand.joints` a partir dos poses
 * do XRFrame e dispara `pinchstart` / `pinchend` com histerese própria, então
 * aqui a gente cuida do que ele não faz: desenhar as juntas, extrair o ponto
 * de pinça, a ponta do indicador e a orientação da palma.
 */

const TIPS = [
  'thumb-tip', 'index-finger-tip', 'middle-finger-tip',
  'ring-finger-tip', 'pinky-finger-tip',
];

/** Até 25 juntas por mão no perfil do WebXR. */
const MAX_JOINTS = 25;
const MAX_TIPS = TIPS.length;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Sinal do produto vetorial que faz a normal apontar para FORA da palma.
 * Depende da lateralidade.
 *
 * ATENÇÃO: nada de essencial pode depender disto. O sinal certo só se
 * confirma com um headset na mão, e enquanto não se confirma, qualquer gesto
 * amarrado a ele pode simplesmente nunca disparar. `palmUp` serve para
 * ORIENTAR coisas, nunca para liberá-las — para isso existe `openness`, que
 * não tem como estar invertido.
 */
const PALM_SIGN = { left: 1, right: -1 };

/** Dedos usados para medir se a mão está aberta. */
const FINGERS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];

class HandState {
  constructor(index) {
    this.index = index;
    this.handedness = index === 0 ? 'left' : 'right';
    this.tracked = false;
    this.pinching = false;
    this.pinch = new Vector3();      // meio entre polegar e indicador
    this.indexTip = new Vector3();
    this.wrist = new Vector3();
    this.palmUp = 0;                 // -1 (para baixo) .. 1 (para cima)
    this.palmNormal = new Vector3(0, 1, 0);   // aponta para fora da palma
    this.handForward = new Vector3(0, 0, -1); // do punho em direção aos dedos
    this.openness = 0;               // 0 punho fechado .. 1 mão aberta
  }
}

export class Hands extends Group {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} handlers  onPinchStart / onPinchEnd, recebem o HandState
   */
  constructor(renderer, handlers = {}) {
    super();
    this.name = 'maos';
    this.on = handlers;
    this.states = [new HandState(0), new HandState(1)];

    this.sources = [0, 1].map((i) => {
      const hand = renderer.xr.getHand(i);
      const st = this.states[i];
      hand.addEventListener('pinchstart', (e) => {
        st.handedness = e.handedness ?? st.handedness;
        st.pinching = true;
        this.on.onPinchStart?.(st);
      });
      hand.addEventListener('pinchend', (e) => {
        st.handedness = e.handedness ?? st.handedness;
        st.pinching = false;
        this.on.onPinchEnd?.(st);
      });
      hand.addEventListener('connected', (e) => { st.isHand = !!e.data?.hand; });
      hand.addEventListener('disconnected', () => {
        st.isHand = false; st.tracked = false;
        if (st.pinching) { st.pinching = false; this.on.onPinchEnd?.(st); }
      });
      this.add(hand);
      return hand;
    });

    // Juntas comuns e pontas de dedo em duas malhas: as pontas brilham mais,
    // e separá-las evita ter de carregar um atributo por instância só para isso.
    this.jointMesh = new InstancedMesh(
      new IcosahedronGeometry(1, 0), handMaterial, MAX_JOINTS * 2);
    this.tipMesh = new InstancedMesh(
      new IcosahedronGeometry(1, 1), handMaterial, MAX_TIPS * 2);
    for (const m of [this.jointMesh, this.tipMesh]) {
      m.frustumCulled = false;
      m.renderOrder = 8;
      m.count = 0;
      this.add(m);
    }
  }

  /** Alguma mão sendo rastreada agora? */
  get active() { return this.states.some((s) => s.tracked); }

  /** Mão pelo lado, ou undefined. */
  byHandedness(side) { return this.states.find((s) => s.tracked && s.handedness === side); }

  update() {
    let joints = 0, tips = 0;

    for (let i = 0; i < 2; i++) {
      const hand = this.sources[i];
      const st = this.states[i];
      const j = hand.joints;

      const wrist = j?.wrist;
      st.tracked = !!(hand.visible && wrist?.visible);
      if (!st.tracked) continue;

      st.wrist.copy(wrist.position);

      const thumb = j['thumb-tip'];
      const index = j['index-finger-tip'];
      if (thumb?.visible && index?.visible) {
        st.indexTip.copy(index.position);
        st.pinch.copy(thumb.position).add(index.position).multiplyScalar(0.5);
      }

      // Normal da palma pelo triângulo punho / metacarpo do indicador / do mínimo.
      const im = j['index-finger-metacarpal'], pm = j['pinky-finger-metacarpal'];
      const mm = j['middle-finger-metacarpal'];
      if (im?.visible && pm?.visible) {
        _a.copy(im.position).sub(wrist.position);
        _b.copy(pm.position).sub(wrist.position);
        _n.crossVectors(_a, _b).normalize().multiplyScalar(PALM_SIGN[st.handedness] ?? 1);
        st.palmNormal.copy(_n);
        st.palmUp = _n.dot(UP);
      }
      if (mm?.visible) {
        st.handForward.copy(mm.position).sub(wrist.position).normalize();
      }

      // Abertura da mão: média da distância punho->ponta dividida pelo
      // tamanho da própria palma. Sai adimensional, então serve para
      // qualquer mão, e não depende de orientação nenhuma — é por isso que
      // os gestos que PRECISAM funcionar se penduram aqui.
      const palma = mm?.visible ? mm.position.distanceTo(wrist.position) : 0;
      if (palma > 1e-4) {
        let soma = 0, n = 0;
        for (const nome of FINGERS) {
          const tip = j[nome];
          if (!tip?.visible) continue;
          soma += tip.position.distanceTo(wrist.position) / palma;
          n++;
        }
        if (n) {
          const razao = soma / n;
          // punho fechado fica perto de 1,35x a palma; mão aberta, de 2,05x
          st.openness = Math.min(1, Math.max(0, (razao - 1.45) / 0.55));
        }
      }

      // Escreve as juntas nas malhas instanciadas.
      for (const name of Object.keys(j)) {
        const joint = j[name];
        if (!joint?.visible) continue;
        const isTip = TIPS.includes(name);
        const r = (joint.jointRadius ?? 0.008) * (isTip ? 1.7 : 1.0);
        _p.copy(joint.position);
        _q.copy(joint.quaternion);
        _s.setScalar(r);
        _m.compose(_p, _q, _s);
        if (isTip) {
          if (tips < this.tipMesh.instanceMatrix.count) this.tipMesh.setMatrixAt(tips++, _m);
        } else if (joints < this.jointMesh.instanceMatrix.count) {
          this.jointMesh.setMatrixAt(joints++, _m);
        }
      }
    }

    this.jointMesh.count = joints;
    this.tipMesh.count = tips;
    this.jointMesh.instanceMatrix.needsUpdate = true;
    this.tipMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.jointMesh.geometry.dispose();
    this.tipMesh.geometry.dispose();
    this.clear();
  }
}
