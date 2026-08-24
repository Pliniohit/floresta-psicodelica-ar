import { Euler, Quaternion, Vector3 } from '../vendor/three/three.module.min.js';

/**
 * AR de câmera para aparelhos sem WebXR — na prática, iPhone.
 *
 * O Safari do iOS não implementa WebXR em nenhuma versão: todo navegador no
 * iPhone roda sobre WebKit, então `immersive-ar` simplesmente não existe lá.
 * O que dá para fazer é isto: feed da câmera traseira ao fundo e a orientação
 * do aparelho girando a câmera da cena.
 *
 * A diferença honesta para AR de verdade: não há rastreamento de POSIÇÃO.
 * Girar o telefone funciona; andar com ele não move você dentro da cena.
 * Por isso a floresta nasce em volta do usuário, e não à frente — girar em
 * torno de si é exatamente o grau de liberdade que este modo oferece.
 */

const ZEE = new Vector3(0, 0, 1);
const _euler = new Euler();
const _q0 = new Quaternion();
// -90° em X: leva do referencial do aparelho (Z saindo da tela) para o do
// three.js (câmera olhando para -Z).
const _q1 = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

const rad = (deg) => (deg ?? 0) * (Math.PI / 180);

export class MagicWindow {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this.stream = null;
    this.video = null;
    this.active = false;
    this.hasOrientation = false;

    this.alpha = 0; this.beta = 0; this.gamma = 0;
    this.alphaOffset = null;   // define o "para frente" no primeiro evento
    this.screenAngle = 0;

    this._onOrientation = (e) => {
      if (e.alpha === null && e.beta === null && e.gamma === null) return;
      this.hasOrientation = true;
      this.alpha = rad(e.alpha);
      this.beta = rad(e.beta);
      this.gamma = rad(e.gamma);
      if (this.alphaOffset === null) this.alphaOffset = this.alpha;
    };
    this._onScreen = () => {
      this.screenAngle = rad(screen.orientation?.angle ?? window.orientation ?? 0);
    };
  }

  /** Este aparelho tem alguma chance de rodar o modo câmera? */
  static get supported() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Liga câmera e giroscópio. PRECISA ser chamado de dentro de um gesto do
   * usuário: no iOS 13+ tanto getUserMedia quanto a permissão de orientação
   * exigem isso, e fora do gesto elas falham sem diálogo nenhum.
   */
  async start(videoEl) {
    this.video = videoEl;

    // Câmera traseira. É esta chamada que faz o iOS pedir permissão.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    videoEl.srcObject = this.stream;
    videoEl.setAttribute('playsinline', '');   // sem isto o iOS abre em tela cheia
    videoEl.muted = true;
    await videoEl.play();

    // Orientação: no iOS 13+ tem diálogo próprio; nos demais, é só ouvir.
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const r = await DOE.requestPermission();
        if (r !== 'granted') this.orientationDenied = true;
      } catch {
        this.orientationDenied = true;
      }
    }
    if (!this.orientationDenied) {
      window.addEventListener('deviceorientation', this._onOrientation);
      window.addEventListener('orientationchange', this._onScreen);
      screen.orientation?.addEventListener?.('change', this._onScreen);
      this._onScreen();
    }

    this.active = true;
    return { orientation: !this.orientationDenied };
  }

  /** Aplica a orientação do aparelho à câmera. Chamado a cada frame. */
  update() {
    if (!this.active || !this.hasOrientation) return;
    const alpha = this.alpha - (this.alphaOffset ?? 0);
    _euler.set(this.beta, alpha, -this.gamma, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);
    this.camera.quaternion.multiply(_q1);
    this.camera.quaternion.multiply(_q0.setFromAxisAngle(ZEE, -this.screenAngle));
  }

  /** Recentra o "para frente" na direção atual do aparelho. */
  recenter() { this.alphaOffset = this.alpha; }

  stop() {
    this.active = false;
    window.removeEventListener('deviceorientation', this._onOrientation);
    window.removeEventListener('orientationchange', this._onScreen);
    screen.orientation?.removeEventListener?.('change', this._onScreen);
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
  }
}
