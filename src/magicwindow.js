import { Euler, Quaternion, Vector3, MathUtils } from '../vendor/three/three.module.min.js';

/**
 * AR de câmera para aparelhos sem WebXR — na prática, iPhone.
 *
 * O Safari do iOS não implementa WebXR em nenhuma versão: todo navegador no
 * iPhone roda sobre WebKit, então `immersive-ar` simplesmente não existe lá.
 * O que dá para fazer é isto: feed da câmera traseira ao fundo e a orientação
 * do aparelho girando a câmera da cena.
 *
 * A diferença honesta para AR de verdade: não há rastreamento de POSIÇÃO.
 * Girar o telefone funciona; andar com ele não move você dentro da cena. Por
 * isso a floresta nasce em volta do usuário, e não à frente — girar em torno
 * de si é exatamente o grau de liberdade que este modo oferece.
 */

const ZEE = new Vector3(0, 0, 1);
const _euler = new Euler();
const _q0 = new Quaternion();
// -90° em X: leva do referencial do aparelho (Z saindo da tela) para o do
// three.js (câmera olhando para -Z).
const _q1 = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

/** Se em tantos ms nenhum evento chegar, o sensor não vem — cai para arrasto. */
const SENSOR_TIMEOUT = 1800;

const rad = (deg) => (deg ?? 0) * (Math.PI / 180);

export class MagicWindow {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this.stream = null;
    this.video = null;
    this.active = false;

    this.hasOrientation = false;
    this.orientationState = 'pendente';  // pendente | ok | negado | ausente | silencioso

    this.alpha = 0; this.beta = 0; this.gamma = 0;
    this.alphaOffset = null;   // define o "para frente" no primeiro evento
    this.screenAngle = 0;
    this.manual = { yaw: 0, pitch: 0 };

    this.onSensorResult = null;   // avisa a UI quando o desfecho é conhecido

    this._onOrientation = (e) => {
      if (e.alpha === null && e.beta === null && e.gamma === null) return;
      this.alpha = rad(e.alpha);
      this.beta = rad(e.beta);
      this.gamma = rad(e.gamma);
      if (this.alphaOffset === null) this.alphaOffset = this.alpha;
      if (!this.hasOrientation) {
        this.hasOrientation = true;
        this.orientationState = 'ok';
        clearTimeout(this._watchdog);
        this.onSensorResult?.('ok');
      }
    };
    this._onScreen = () => {
      this.screenAngle = rad(screen.orientation?.angle ?? window.orientation ?? 0);
    };
  }

  static get supported() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * PRECISA ser a PRIMEIRA coisa chamada no manipulador do clique, antes de
   * qualquer await.
   *
   * No iOS 13+ `requestPermission` exige ativação transitória do usuário, e
   * essa ativação se perde no primeiro await. Pedir a câmera antes — que é o
   * que parece natural, já que a câmera é o principal — consome a ativação e
   * faz o pedido de orientação ser rejeitado sem diálogo nenhum.
   */
  async requestOrientation() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) {
      this.orientationState = 'ausente';
      return this.orientationState;
    }

    if (typeof DOE.requestPermission === 'function') {
      try {
        const r = await DOE.requestPermission();
        if (r !== 'granted') {
          this.orientationState = 'negado';
          return this.orientationState;
        }
      } catch {
        // Fora da ativação, ou acesso a movimento desligado nos Ajustes.
        this.orientationState = 'negado';
        return this.orientationState;
      }
    }

    window.addEventListener('deviceorientation', this._onOrientation);
    window.addEventListener('orientationchange', this._onScreen);
    screen.orientation?.addEventListener?.('change', this._onScreen);
    this._onScreen();

    // Permissão concedida não garante evento: alguns aparelhos e navegadores
    // embutidos aceitam e nunca emitem nada. Sem isto o usuário ficaria
    // girando o telefone à toa, sem saber que não vai funcionar.
    this._watchdog = setTimeout(() => {
      if (!this.hasOrientation) {
        this.orientationState = 'silencioso';
        this.onSensorResult?.('silencioso');
      }
    }, SENSOR_TIMEOUT);

    return 'concedido';
  }

  /** Liga a câmera traseira. Chamar DEPOIS de requestOrientation. */
  async startCamera(videoEl) {
    this.video = videoEl;
    videoEl.setAttribute('playsinline', '');   // sem isto o iOS abre em tela cheia
    videoEl.muted = true;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    videoEl.srcObject = this.stream;
    await videoEl.play();
    this.active = true;
  }

  /** Arrasto na tela, usado quando o sensor não está disponível. */
  look(dx, dy) {
    if (this.hasOrientation) return;
    this.manual.yaw -= dx;
    this.manual.pitch = MathUtils.clamp(this.manual.pitch - dy, -1.25, 1.25);
  }

  /** Aplica a orientação à câmera. Chamado a cada frame. */
  update() {
    if (!this.active) return;

    if (this.hasOrientation) {
      const alpha = this.alpha - (this.alphaOffset ?? 0);
      _euler.set(this.beta, alpha, -this.gamma, 'YXZ');
      this.camera.quaternion.setFromEuler(_euler);
      this.camera.quaternion.multiply(_q1);
      this.camera.quaternion.multiply(_q0.setFromAxisAngle(ZEE, -this.screenAngle));
      return;
    }

    // Sem sensor: girar no lugar. Nunca orbitar — no modo câmera a câmera é
    // o aparelho na sua mão, e ela não deveria sair do lugar.
    _euler.set(this.manual.pitch, this.manual.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);
  }

  /** Recentra o "para frente" na direção atual do aparelho. */
  recenter() {
    if (this.hasOrientation) this.alphaOffset = this.alpha;
    else { this.manual.yaw = 0; this.manual.pitch = 0; }
  }

  stop() {
    this.active = false;
    clearTimeout(this._watchdog);
    window.removeEventListener('deviceorientation', this._onOrientation);
    window.removeEventListener('orientationchange', this._onScreen);
    screen.orientation?.removeEventListener?.('change', this._onScreen);
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.hasOrientation = false;
    this.orientationState = 'pendente';
    this.alphaOffset = null;
    this.manual.yaw = 0; this.manual.pitch = 0;
  }
}
