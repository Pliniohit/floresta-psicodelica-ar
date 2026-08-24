const REQUIRED = ['local-floor'];
const OPTIONAL = [
  'plane-detection',   // Space Setup do Quest: é daqui que vem o cômodo mapeado
  'hit-test',          // celular Android: mirar no chão e tocar
  'bounded-floor',     // reserva: o limite do guardian
  'hand-tracking',
  'anchors',
  'mesh-detection',
  'dom-overlay',
  'layers',
];

/** Nem todo navegador expõe navigator.xr; nem todo xr suporta immersive-ar. */
export async function detect() {
  if (!navigator.xr) {
    return { ok: false, reason: 'Este navegador não expõe WebXR. Abra no navegador do Meta Quest.' };
  }
  let ar = false, vr = false;
  try { ar = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* ignorado */ }
  try { vr = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* ignorado */ }
  if (ar) return { ok: true, mode: 'immersive-ar' };
  if (vr) return { ok: true, mode: 'immersive-vr', degraded: true };
  return { ok: false, reason: 'Nenhuma sessão imersiva disponível neste dispositivo.' };
}

/** Ciclo de vida da sessão XR. O posicionamento em si mora em room.js. */
export class XRStage {
  constructor(renderer) {
    this.renderer = renderer;
    this.session = null;
    this.mode = 'immersive-ar';
    this.granted = new Set();
    this.onEnd = null;
    this._capturing = false;
    this._captured = false;
  }

  async start(mode, overlayRoot) {
    this.mode = mode;
    const init = { requiredFeatures: REQUIRED, optionalFeatures: [...OPTIONAL] };
    if (overlayRoot) init.domOverlay = { root: overlayRoot };

    let session;
    try {
      session = await navigator.xr.requestSession(mode, init);
    } catch {
      // Alguns runtimes recusam a lista inteira se UM opcional for desconhecido.
      session = await navigator.xr.requestSession(mode, { requiredFeatures: REQUIRED });
    }

    this.session = session;
    for (const f of session.enabledFeatures ?? []) this.granted.add(f);

    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);

    // A foveação alivia o fill rate na periferia — os shaders daqui são pesados
    // por fragmento, então é onde ganhamos mais tempo de frame.
    this.renderer.xr.setFoveation?.(0.5);

    session.addEventListener('end', () => {
      this.session = null;
      this.granted.clear();
      this._captured = false;
      this.onEnd?.();
    });

    return session;
  }

  has(feature) { return this.granted.has(feature); }

  /** O runtime deixa o app pedir uma nova captura do cômodo? */
  get canCapture() { return typeof this.session?.initiateRoomCapture === 'function'; }

  /**
   * Dispara o fluxo de captura do próprio sistema, de dentro da sessão.
   *
   * É o que permite começar SEMPRE por um escaneamento em vez de depender de
   * o usuário ter rodado o Space Setup algum dia. O Quest assume a tela, o
   * usuário varre o cômodo, e ao voltar `detectedPlanes` e `detectedMeshes`
   * trazem geometria nova.
   *
   * Só existe no navegador do Quest, e o runtime costuma aceitar uma única
   * chamada por sessão — daí o guarda.
   */
  async captureRoom() {
    if (!this.canCapture || this._capturing || this._captured) return false;
    this._capturing = true;
    try {
      await this.session.initiateRoomCapture();
      this._captured = true;
      return true;
    } catch (err) {
      // Recusa mais comum: já houve captura nesta sessão.
      console.warn('captura do cômodo recusada:', err?.message ?? err);
      return false;
    } finally {
      this._capturing = false;
    }
  }
  get refSpace() { return this.renderer.xr.getReferenceSpace(); }
  end() { this.session?.end(); }
}
