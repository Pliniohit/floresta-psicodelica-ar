import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector2, Vector3,
  Raycaster, Plane, Clock, MathUtils,
} from '../vendor/three/three.module.min.js';
import { Forest } from './forest.js';
import { XRStage, detect } from './xr.js';
import { RoomScan, fallbackRoom, polygonArea } from './room.js';
import { Interaction } from './interaction.js';
import { Hands } from './hands.js';
import { WristMenu } from './menu.js';
import { MagicWindow } from './magicwindow.js';
import { Ambience } from './audio.js';
import { shared, disposeMaterials } from './shaders/materials.js';
import { palettes } from './palettes.js';

const TRIP_CALM = 0.30;
const TRIP_FULL = 1.00;

// ---------------------------------------------------------------------------
// Renderizador
// ---------------------------------------------------------------------------
const renderer = new WebGLRenderer({
  antialias: true,
  alpha: true,                       // obrigatório: é o alfa que revela o passthrough
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(0, 1.6, 6.0);

const forest = new Forest();
forest.visible = false;
scene.add(forest);

const room = new RoomScan();
scene.add(room.view);

const xr = new XRStage(renderer);
const audio = new Ambience();

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  phase: 'idle',        // idle -> mapping -> growing
  mode: 'none',         // none | xr | camera | preview
  paletteIndex: 0,
  tripTarget: TRIP_CALM,
  scale: 1.0,
  spin: 0,
  intro: 0,
  seed: 1,
};

const target = {
  uPalA: palettes[0].a.clone(),
  uPalB: palettes[0].b.clone(),
  uPalC: palettes[0].c.clone(),
  uPalD: palettes[0].d.clone(),
};
for (const k of Object.keys(target)) shared[k].value.copy(target[k]);

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const gate = el('gate'), overlay = el('overlay');
const toastEl = el('toast'), toastText = el('toast-text');
const scanEl = el('scan'), scanTitle = el('scan-title'), scanInfo = el('scan-info');
let toastTimer = 0;

function toast(msg, swatch = '#c07bff') {
  if (!toastEl) return;
  toastText.textContent = msg;
  const dot = toastEl.querySelector('.sw');
  dot.style.color = swatch; dot.style.background = swatch;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2800);
}

function status(msg) { el('status').innerHTML = msg; }

function updateScanPanel() {
  if (!scanEl) return;
  if (room.ready) {
    scanTitle.textContent = 'Espaço reconhecido';
    scanInfo.innerHTML =
      `${room.area.toFixed(1)} m² · ${room.source}` +
      (room.obstacles.length ? ` · ${room.obstacles.length} móvel(is)` : '') +
      '<br><b>Aperte o gatilho para plantar a floresta</b>';
  } else if (room.aiming) {
    scanTitle.textContent = 'Chão encontrado';
    scanInfo.innerHTML = interaction.touchMode
      ? '<b>Toque na tela</b> para plantar a floresta aqui'
      : '<b>Aperte o gatilho</b> para plantar a floresta aqui';
  } else if (room.hasHitTest) {
    scanTitle.textContent = 'Procurando o chão…';
    scanInfo.innerHTML = 'Aponte a câmera para o piso e mova o aparelho devagar'
      + '<br>até o anel aparecer.';
  } else {
    scanTitle.textContent = 'Mapeando seu espaço…';
    scanInfo.innerHTML = room.planeCount
      ? `${room.planeCount} superfície(s) lida(s) — olhe ao redor`
      : 'Nenhum espaço encontrado. Rode o <b>Space Setup</b> do Quest para um encaixe perfeito,'
        + '<br>ou confirme para usar uma área padrão de 4 × 4 m.';
  }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
function ping(strength = 1) {
  shared.uPulse.value = Math.min(1, shared.uPulse.value + strength);
}

/** Fecha o mapeamento e faz a floresta brotar dentro do cômodo lido. */
function commitRoom() {
  forest.applyRoom(room);
  shared.uOrigin.value.copy(forest.position);
  forest.visible = true;
  room.view.visible = false;
  state.phase = 'growing';
  state.intro = 0;
  interaction.enabled = true;
  scanEl?.classList.remove('on');
  ping(1);
  audio.chime(12, 0.28);
  toast(`${forest.treeCount} árvores em ${room.area.toFixed(1)} m² — caminhe entre elas`,
    palettes[state.paletteIndex].swatch);
}

function cyclePalette() {
  state.paletteIndex = (state.paletteIndex + 1) % palettes.length;
  const p = palettes[state.paletteIndex];
  target.uPalA.copy(p.a); target.uPalB.copy(p.b);
  target.uPalC.copy(p.c); target.uPalD.copy(p.d);
  ping(0.7);
  audio.chime([0, 3, 7, 10, 5, -2][state.paletteIndex] ?? 0, 0.2);
  toast(p.name, p.swatch);
}

function toggleTrip() {
  const full = state.tripTarget < 0.6;
  state.tripTarget = full ? TRIP_FULL : TRIP_CALM;
  shared.uSway.value = full ? 0.019 : 0.010;
  audio.setTrip(state.tripTarget);
  ping(0.9);
  toast(full ? 'Viagem completa' : 'Modo calmo', palettes[state.paletteIndex].swatch);
}

function reseed() {
  if (state.phase !== 'growing') return;
  state.seed = (state.seed * 1103515245 + 12345) >>> 0;
  forest.seed(state.seed);
  state.intro = 0;
  ping(1);
  audio.chime(-5, 0.26);
  toast(`Nova floresta — ${forest.treeCount} árvores`, palettes[state.paletteIndex].swatch);
}

const PLANT_MESSAGE = {
  fora: 'Fora do espaço mapeado',
  apertado: 'Perto demais de outra árvore — deixe passagem',
  cheio: 'A floresta está cheia — B/Y semeia outra',
};

function plantAt(worldPoint) {
  const result = forest.plant(forest.worldToLocal(worldPoint.clone()));
  if (result === 'ok') {
    ping(0.55);
    audio.chime([0, 4, 7, 11, 14][Math.floor(Math.random() * 5)], 0.14);
  } else {
    toast(PLANT_MESSAGE[result]);
  }
  return result;
}

/** Ponto no chão a 2 m à frente de quem está olhando. */
function aheadOfCamera(distance = 2.0) {
  const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize().multiplyScalar(distance);
  const p = camera.position.clone().add(fwd);
  return new Vector2(p.x, p.z);
}

// ---------------------------------------------------------------------------
// Controles XR
// ---------------------------------------------------------------------------
const interaction = new Interaction(renderer, scene, camera, {
  onSelect: (aimPoint, controller) => {
    // Com mão rastreada o three.js dispara select na pinça também. Quem manda
    // nesse caso é a lógica de mãos, senão a pinça planta e pega ao mesmo tempo.
    if (controller?.userData?.source?.hand) return;
    if (state.phase === 'mapping') {
      if (room.ready || room.commitFromReticle()) {
        commitRoom();
      } else if (!room.hasHitTest) {
        room.useFallback(aheadOfCamera());
        commitRoom();
      } else {
        // Há hit-test, mas o chão ainda não foi achado: insistir é melhor do
        // que largar a floresta num lugar arbitrário.
        toast('Aponte para o chão até o anel aparecer');
        return;
      }
      interaction.pulse(controller, 0.8, 60);
    } else if (state.phase === 'growing' && aimPoint) {
      if (plantAt(aimPoint) === 'ok') interaction.pulse(controller, 0.6, 40);
    }
  },
  onPalette: cyclePalette,
  onTrip: toggleTrip,
  onReseed: reseed,
  onScale: (d) => { state.scale = MathUtils.clamp(state.scale + d, 0.35, 2.4); },
  onRotate: (d) => { state.spin += d; },
});
interaction.enabled = false;

// ---------------------------------------------------------------------------
// Prévia no desktop: órbita com o mouse, clique planta
// ---------------------------------------------------------------------------
const orbit = { theta: 0.5, phi: 1.34, radius: 8.0, target: new Vector3(0, 1.35, 0), active: false, moved: false };
let previewMode = false;

function applyOrbit() {
  const r = orbit.radius, p = MathUtils.clamp(orbit.phi, 0.15, 1.55);
  camera.position.set(
    orbit.target.x + r * Math.sin(p) * Math.sin(orbit.theta),
    orbit.target.y + r * Math.cos(p),
    orbit.target.z + r * Math.sin(p) * Math.cos(orbit.theta),
  );
  camera.lookAt(orbit.target);
}

const raycaster = new Raycaster();
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const ndc = new Vector2();

function bindPreview() {
  const dom = renderer.domElement;
  let px = 0, py = 0;
  dom.addEventListener('pointerdown', (e) => {
    // No modo câmera com giroscópio quem manda na rotação é o aparelho;
    // arrastar só é liberado se a orientação não estiver disponível.
    if (state.mode === 'camera' && magic.hasOrientation) { orbit.moved = false; return; }
    orbit.active = true; orbit.moved = false; px = e.clientX; py = e.clientY;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e) => {
    if (!orbit.active) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    if (Math.abs(dx) + Math.abs(dy) > 4) orbit.moved = true;
    orbit.theta -= dx * 0.006;
    orbit.phi = MathUtils.clamp(orbit.phi - dy * 0.006, 0.15, 1.55);
    px = e.clientX; py = e.clientY;
    applyOrbit();
  });
  dom.addEventListener('pointerup', (e) => {
    const arrastou = orbit.moved;
    orbit.active = false;
    if (arrastou || !previewMode) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = new Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) plantAt(hit);
  });
  dom.addEventListener('wheel', (e) => {
    if (state.mode === 'camera') return;
    e.preventDefault();
    orbit.radius = MathUtils.clamp(orbit.radius * (1 + Math.sign(e.deltaY) * 0.09), 2.0, 24);
    applyOrbit();
  }, { passive: false });

  // Pinça de dois dedos para aproximar. No modo câmera ela escala a floresta
  // em vez da distância: a câmera ali é o aparelho, não uma órbita.
  let pinchDist = 0;
  const spread = (t) => Math.hypot(
    t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  dom.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    orbit.active = false;
    orbit.moved = true;          // impede que o toque duplo plante ao soltar
    pinchDist = spread(e.touches);
  }, { passive: false });

  dom.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || pinchDist <= 0) return;
    e.preventDefault();
    const d = spread(e.touches);
    const k = d / pinchDist;
    if (state.mode === 'camera') {
      state.scale = MathUtils.clamp(state.scale * k, 0.35, 2.4);
    } else {
      orbit.radius = MathUtils.clamp(orbit.radius / k, 2.0, 24);
      applyOrbit();
    }
    pinchDist = d;
  }, { passive: false });

  dom.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchDist = 0;
  });

  window.addEventListener('keydown', (e) => {
    if (!previewMode) return;
    const k = e.key.toLowerCase();
    if (k === 'p') cyclePalette();
    if (k === 't') toggleTrip();
    if (k === 'r') reseed();
    if (k === 'm') toast(audio.toggleMute() ? 'Som mudo' : 'Som ligado');
  });
}

/** Sala sintética para a prévia: 5 × 4 m com uma mesa no canto. */
function startPreview() {
  previewMode = true;
  state.mode = 'preview';
  gate.classList.add('gone');
  audio.start();

  room.footprint = fallbackRoom(new Vector2(0, 0), 5.0, 4.0);
  room.obstacles = [[
    new Vector2(1.1, -1.5), new Vector2(2.3, -1.5),
    new Vector2(2.3, -0.3), new Vector2(1.1, -0.3),
  ]];
  room.floorY = 0;
  room.source = 'sala de demonstração';
  commitRoom();
  applyOrbit();
  overlay.classList.add('on', 'preview');
  syncTouchUI();
  toast('Prévia: arraste para orbitar · clique planta · P paleta · T viagem · R semear', palettes[0].swatch);
}

// ---------------------------------------------------------------------------
// Modo câmera (iPhone e qualquer aparelho sem WebXR)
// ---------------------------------------------------------------------------
const magic = new MagicWindow(camera);

/** Sala padrão centrada em quem está segurando o aparelho. */
function roomAroundUser(size = 5.0) {
  room.footprint = fallbackRoom(new Vector2(0, 0), size, size);
  room.obstacles = [];
  room.floorY = 0;
  room.source = 'em volta de você';
}

async function startCameraMode() {
  const btn = el('camera');
  btn.disabled = true;
  btn.textContent = 'Pedindo acesso à câmera…';
  try {
    audio.start();
    const feed = el('feed');
    const { orientation } = await magic.start(feed);
    feed.classList.add('on');

    state.mode = 'camera';
    previewMode = true;             // reaproveita plantar por toque e a barra
    gate.classList.add('gone');
    // Sem a classe 'preview' de propósito: ela esconde o #exit, e aqui o
    // usuário precisa conseguir desligar a câmera.
    overlay.classList.remove('preview');
    overlay.classList.add('on', 'touch');
    el('exit').textContent = 'Fechar câmera';
    touchUI = true;

    // Sem rastreamento de posição, o que existe é girar em torno de si —
    // então a floresta nasce em volta, não à frente.
    roomAroundUser();
    commitRoom();
    camera.position.set(0, 1.55, 0);

    toast(orientation
      ? 'Gire o aparelho para olhar em volta · toque para plantar'
      : 'Sem giroscópio: arraste para olhar em volta', palettes[0].swatch);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Abrir com a câmera';
    const negado = /NotAllowed|Permission/i.test(String(err?.name || err));
    status(negado
      ? '<b>Câmera negada.</b> Libere o acesso em Ajustes → Safari → Câmera e recarregue.'
      : `<b>Não deu para abrir a câmera:</b> ${err?.message ?? err}`);
  }
}

function stopCameraMode() {
  magic.stop();
  el('feed').classList.remove('on');
  el('exit').textContent = 'Sair do AR';
  state.mode = 'none';
  previewMode = false;
  overlay.classList.remove('on', 'preview', 'touch');
  touchUI = null;
  gate.classList.remove('gone');
  forest.visible = false;
  state.phase = 'idle';
  el('camera').disabled = false;
  el('camera').textContent = 'Abrir com a câmera';
}

// ---------------------------------------------------------------------------
// Entrada em AR
// ---------------------------------------------------------------------------
async function enterXR(mode) {
  const btn = el('enter');
  btn.disabled = true;
  btn.textContent = 'Abrindo sessão…';
  try {
    audio.start();
    await xr.start(mode, overlay);
    await room.prepare(xr.session);

    state.mode = 'xr';
    gate.classList.add('gone');
    overlay.classList.remove('preview');
    overlay.classList.add('on');
    scanEl?.classList.add('on');
    room.view.visible = true;
    state.phase = 'mapping';
    updateScanPanel();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Entrar em AR';
    status(`<b>Falha ao iniciar:</b> ${err?.message ?? err}`);
  }
}

xr.onEnd = () => {
  overlay.classList.remove('on', 'touch');
  touchUI = null;
  scanEl?.classList.remove('on');
  gate.classList.remove('gone');
  interaction.enabled = false;
  state.phase = 'idle';
  forest.visible = false;
  room.view.visible = false;
  el('enter').disabled = false;
  el('enter').textContent = 'Entrar em AR';
};

el('exit').addEventListener('click', () => {
  if (state.mode === 'camera') stopCameraMode();
  else xr.end();
});
el('camera').addEventListener('click', startCameraMode);
el('preview').addEventListener('click', startPreview);

// Barra de ações na tela: é o único caminho para paleta / viagem / semear
// em aparelho sem controle físico.
const PAD = {
  palette: cyclePalette,
  trip: toggleTrip,
  seed: reseed,
  smaller: () => { state.scale = MathUtils.clamp(state.scale * 0.85, 0.35, 2.4); },
  bigger: () => { state.scale = MathUtils.clamp(state.scale * 1.18, 0.35, 2.4); },
};
el('pad').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) PAD[btn.dataset.act]?.();
});

// ---------------------------------------------------------------------------
// Mãos livres
// ---------------------------------------------------------------------------
const grabbed = new Map();   // HandState -> alça devolvida por forest.lift

/** Ponto da mão em coordenadas locais da floresta. */
function toLocal(worldPoint) { return forest.worldToLocal(worldPoint.clone()); }

const hands = new Hands(renderer, {
  onPinchStart: (hand) => {
    if (state.phase === 'mapping') {
      if (room.ready || room.commitFromReticle()) commitRoom();
      else if (!room.hasHitTest) { room.useFallback(aheadOfCamera()); commitRoom(); }
      else toast('Aponte para o chão até o anel aparecer');
      return;
    }
    if (state.phase !== 'growing') return;

    const local = toLocal(hand.pinch);
    const target = forest.pick(local);
    if (target) {
      grabbed.set(hand, forest.lift(target));
      audio.chime(19, 0.1);
      return;
    }
    // Pinça no vazio, perto do chão: brota uma árvore ali.
    if (hand.pinch.y - forest.position.y < 1.3) {
      const ground = new Vector3(hand.pinch.x, forest.position.y, hand.pinch.z);
      plantAt(ground);
    }
  },

  onPinchEnd: (hand) => {
    const handle = grabbed.get(hand);
    if (!handle) return;
    grabbed.delete(hand);
    const result = forest.drop(handle, toLocal(hand.pinch));
    ping(0.5);
    audio.chime(result === 'plantado' ? 7 : -7, 0.14);
    if (result === 'devolvido') toast('Não coube ali — voltou para o lugar');
  },
});
scene.add(hands);

const wristMenu = new WristMenu({
  onPalette: () => { cyclePalette(); },
  onTrip: () => { toggleTrip(); },
  onReseed: () => { reseed(); },
});
scene.add(wristMenu);

/** Roda a cada frame: carregar o que está na mão e realçar o que está ao alcance. */
function updateHands(dt) {
  hands.update();

  if (state.phase !== 'growing') { forest.highlight(null); return; }

  let spin = 0;
  let hover = null;
  for (const st of hands.states) {
    if (!st.tracked) continue;
    const handle = grabbed.get(st);
    if (handle) {
      spin = clock.elapsedTime * 1.6;
      forest.carry(handle, toLocal(st.pinch), spin);
    } else if (!hover) {
      hover = forest.pick(toLocal(st.pinch));
    }
  }
  forest.highlight(hover);

  wristMenu.update(dt, hands.byHandedness('left'), hands.byHandedness('right'));
}

const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
let touchUI = null;
function syncTouchUI() {
  const on = interaction.touchMode || (previewMode && coarsePointer);
  if (on === touchUI) return;
  touchUI = on;
  overlay.classList.toggle('touch', on);
}

// ---------------------------------------------------------------------------
// Laço de renderização
// ---------------------------------------------------------------------------
const clock = new Clock();
let scanTick = 0;

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.05, clock.getDelta());

  shared.uTime.value = clock.elapsedTime;
  shared.uPulse.value *= Math.exp(-dt * 2.4);

  const k = 1 - Math.exp(-dt * 5.0);
  shared.uPalA.value.lerp(target.uPalA, k);
  shared.uPalB.value.lerp(target.uPalB, k);
  shared.uPalC.value.lerp(target.uPalC, k);
  shared.uPalD.value.lerp(target.uPalD, k);
  shared.uTrip.value += (state.tripTarget - shared.uTrip.value) * k;

  if (state.phase === 'mapping' && renderer.xr.isPresenting) {
    room.update(frame, xr.refSpace);
    scanTick += dt;
    if (scanTick > 0.3) { scanTick = 0; syncTouchUI(); updateScanPanel(); }
  }

  if (magic.active) magic.update();

  interaction.groundY = forest.position.y;
  interaction.update(dt);
  updateHands(dt);
  forest.update(dt);

  if (state.phase === 'growing') {
    if (state.intro < 1) {
      state.intro = Math.min(1, state.intro + dt / 1.5);
      const e = 1 - Math.pow(1 - state.intro, 4);
      forest.scale.setScalar(Math.max(0.001, state.scale * e));
    } else {
      forest.scale.setScalar(state.scale);
    }
    forest.rotation.y = state.spin;
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Detecção inicial
// ---------------------------------------------------------------------------
bindPreview();

const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

detect().then((res) => {
  const btn = el('enter');
  const cam = el('camera');
  const camOk = MagicWindow.supported;

  if (res.ok) {
    btn.disabled = false;
    btn.textContent = res.degraded ? 'Entrar em VR (sem passthrough)' : 'Entrar em AR';
    btn.addEventListener('click', () => enterXR(res.mode));
    if (res.degraded) status('Este aparelho não oferece <b>immersive-ar</b>; a cena roda em VR.');
    else status('Coloque o headset e toque em Entrar em AR.');
    return;
  }

  // Sem WebXR. Num aparelho com câmera ainda dá para fazer AR de giroscópio,
  // que é o melhor possível no iOS — lá o WebXR não existe em navegador nenhum,
  // porque todos rodam sobre o WebKit.
  btn.hidden = true;
  if (camOk) {
    cam.hidden = false;
    status(iOS
      ? 'O Safari do iPhone não implementa WebXR, então AR com rastreamento '
        + 'completo não é possível aqui. O modo câmera usa o giroscópio: '
        + 'a floresta fica em volta e você gira o aparelho para olhar.'
      : 'Sem WebXR neste navegador. O modo câmera usa o giroscópio.');
  } else {
    status(res.reason + ' Você ainda pode ver a prévia abaixo.');
  }
});

// Atalho de inspeção: no console dá para mexer ao vivo, por exemplo
// `floresta.state.tripTarget = 1` ou `floresta.forest.seed(99)`.
window.floresta = { forest, room, hands, wristMenu, magic, state, shared, renderer, camera, orbit, cyclePalette, toggleTrip, reseed };

window.addEventListener('beforeunload', () => {
  hands.dispose();
  wristMenu.dispose();
  forest.dispose();
  room.dispose();
  interaction.dispose();
  disposeMaterials();
  audio.stop();
});
