import { Mesh, CylinderGeometry, Vector3, Quaternion, Matrix4 } from 'three';
import * as G from './geometry.js';
import { reticleMaterial, crystalMaterial } from './shaders/materials.js';

const _origin = new Vector3();
const _dir = new Vector3();
const _quat = new Quaternion();
const FORWARD = new Vector3(0, 0, -1);

/** Índices do mapeamento xr-standard usado pelos Touch Plus do Quest 3. */
const BTN = { trigger: 0, squeeze: 1, stick: 3, primary: 4, secondary: 5 };
const AXIS = { x: 2, y: 3 };
const DEAD = 0.35;

/**
 * Controles, mãos e mira. Emite eventos de alto nível para o main.js:
 *   onPlant(pontoNoChão)  onPalette()  onTrip()  onReseed()
 *   onScale(delta)        onRotate(delta)
 */
export class Interaction {
  constructor(renderer, scene, camera, handlers = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.on = handlers;
    this.groundY = 0;
    this.enabled = false;
    this.touchMode = false;  // celular: entrada por toque na tela, sem controle
    this.prev = new Map();   // handedness -> estado anterior dos botões

    this.controllers = [0, 1].map((i) => {
      const c = renderer.xr.getController(i);
      c.userData.index = i;
      const beam = this.#beam();
      c.add(beam);
      c.userData.beam = beam;
      c.addEventListener('selectstart', () => this.#select(c));
      c.addEventListener('squeezestart', () => this.enabled && this.on.onPalette?.());
      c.addEventListener('connected', (e) => {
        c.userData.source = e.data;
        c.visible = true;
        // Numa entrada de tela o raio nasce na câmera: desenhar um feixe saindo
        // do olho do usuário fica estranho e atrapalha a leitura da cena.
        const screen = e.data?.targetRayMode === 'screen';
        beam.visible = !screen;
        if (screen) this.touchMode = true;
      });
      c.addEventListener('disconnected', () => { c.userData.source = null; c.visible = false; });
      scene.add(c);
      return c;
    });

    // Marcador no chão indicando onde a árvore vai brotar.
    this.marker = new Mesh(G.reticleRing(0.16), reticleMaterial);
    this.marker.visible = false;
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 11;
    scene.add(this.marker);
  }

  /** Feixe fino apontando para -Z, aditivo para brilhar sobre o passthrough. */
  #beam() {
    const g = new CylinderGeometry(0.0035, 0.0012, 4.0, 5, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -2.0);
    const m = new Mesh(g, crystalMaterial);
    m.frustumCulled = false;
    m.renderOrder = 9;
    return m;
  }

  /** Interseção de um raio qualquer com o plano do chão. */
  #castToGround(origin, dir) {
    if (dir.y > -0.02) return null;                  // apontando para cima
    const t = (this.groundY - origin.y) / dir.y;
    if (t < 0 || t > 12) return null;                // atrás do usuário ou longe demais
    return origin.clone().addScaledVector(dir, t);
  }

  /**
   * Onde o usuário está mirando, no chão. Devolve null se a mira não cruza
   * o piso à frente.
   */
  aim(controller) {
    controller.getWorldPosition(_origin);
    controller.getWorldQuaternion(_quat);
    _dir.copy(FORWARD).applyQuaternion(_quat);
    return this.#castToGround(_origin, _dir);
  }

  /**
   * Reserva para entrada por toque. Fontes de entrada de tela são transitórias
   * — nascem e morrem no mesmo toque — e a pose pode ainda não ter sido
   * atualizada quando o selectstart chega. Aí vale mirar pela câmera, que no
   * celular é literalmente para onde a pessoa apontou o aparelho.
   */
  aimFromCamera() {
    if (!this.camera) return null;
    this.camera.getWorldPosition(_origin);
    this.camera.getWorldQuaternion(_quat);
    _dir.copy(FORWARD).applyQuaternion(_quat);
    return this.#castToGround(_origin, _dir);
  }

  // Sempre emite: durante o mapeamento o select confirma o cômodo, depois
  // passa a plantar árvores. Por isso não olha para `enabled`.
  #select(controller) {
    this.on.onSelect?.(this.aim(controller) ?? this.aimFromCamera(), controller);
  }

  /** Retorno háptico, quando o runtime expõe atuadores. */
  pulse(controller, intensity = 0.5, ms = 30) {
    const gp = controller?.userData?.source?.gamepad;
    const act = gp?.hapticActuators?.[0];
    try { act?.pulse?.(intensity, ms); } catch { /* opcional */ }
  }

  /** Lê botões e analógicos a cada frame; os eventos select/squeeze cobrem o resto. */
  update(dt) {
    if (!this.enabled) return;

    // Marcador segue o controle que estiver mirando o chão. No celular ele
    // segue o centro da tela, que é a mira efetiva do aparelho.
    let aimed = null;
    for (const c of this.controllers) {
      if (!c.visible) continue;
      const p = this.aim(c);
      if (p) { aimed = p; break; }
    }
    if (!aimed && this.touchMode) aimed = this.aimFromCamera();
    if (aimed) { this.marker.position.copy(aimed); this.marker.visible = true; }
    else { this.marker.visible = false; }

    const session = this.renderer.xr.getSession();
    if (!session) return;

    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const hand = src.handedness || 'none';
      const was = this.prev.get(hand) || {};
      const now = {};

      const down = (i) => { now[i] = !!gp.buttons[i]?.pressed; return now[i] && !was[i]; };

      if (down(BTN.primary)) this.on.onTrip?.();      // A / X
      if (down(BTN.secondary)) this.on.onReseed?.();  // B / Y
      down(BTN.stick);
      down(BTN.trigger);
      down(BTN.squeeze);

      const ax = gp.axes[AXIS.x] ?? 0;
      const ay = gp.axes[AXIS.y] ?? 0;
      if (Math.abs(ay) > DEAD) this.on.onScale?.(-ay * dt * 0.55);
      if (Math.abs(ax) > DEAD) this.on.onRotate?.(ax * dt * 0.9);

      this.prev.set(hand, now);
    }
  }

  dispose() {
    this.marker.geometry.dispose();
    this.marker.removeFromParent();
    for (const c of this.controllers) {
      c.traverse((o) => o.isMesh && o.geometry.dispose());
      c.removeFromParent();
    }
  }
}
