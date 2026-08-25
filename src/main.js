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
import { RoomMesh } from './occlusion.js';
import { Sky } from './sky.js';
import { skyMaterial, scanMaterial, capMaterial } from './shaders/materials.js';
import { Butterflies, Fireflies } from './creatures.js';
import { Body, BodyGrowth } from './body.js';
import { Constellation } from './constellation.js';
import { Seeds } from './seeds.js';
import { Space, Emergence } from './space.js';
import { butterflyMaterial, cocoonMaterial, skyMaterial as _sky } from './shaders/materials.js';
import { Ambience } from './audio.js';
import { shared, disposeMaterials } from './shaders/materials.js';
import { palettes } from './palettes.js';

// "Encanto" no lugar do antigo psicodélico: a saturação extra agora é um
// tempero, não o prato. O modo intenso vai a 0,7 em vez de 1,0.
const TRIP_CALM = 0.24;
const TRIP_FULL = 0.70;

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

const roomMesh = new RoomMesh();
scene.add(roomMesh);

const sky = new Sky();
sky.visible = false;
scene.add(sky);

const constelacao = new Constellation();
constelacao.visible = false;
sky.add(constelacao);

const butterflies = new Butterflies(22);
butterflies.visible = false;
scene.add(butterflies);

// Um enxame preso a você, outro para deixar em cima de alguém.
const auraFireflies = new Fireflies(24, 11);
auraFireflies.visible = false;
scene.add(auraFireflies);

const blessedFireflies = new Fireflies(30, 23);
blessedFireflies.visible = false;
scene.add(blessedFireflies);

const body = new Body();
const bodyGrowth = new BodyGrowth(forest.geo.cap, capMaterial, 27);
bodyGrowth.visible = false;
scene.add(bodyGrowth);

const seeds = new Seeds('right');
scene.add(seeds);

const space = new Space();
scene.add(space);

const emergence = new Emergence(butterflies.mesh.geometry, butterflyMaterial);
scene.add(emergence);

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
  skyOn: true,
  occlusionOn: true,
  bloomOn: true,      // floração no próprio corpo
  blessed: false,     // há alguém abençoado com vaga-lumes?
  world: 'floresta',  // floresta | espaco
  warp: 0,            // 0 floresta .. 1 espaço
  scanSweep: 0,
  scanReveal: 0,
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
  if (scanning) {
    scanTitle.textContent = 'Escaneando o cômodo';
    scanInfo.innerHTML = 'Siga as instruções do Quest e varra as paredes,'
      + '<br>o chão e os móveis. Volto quando você terminar.';
    return;
  }
  if (room.ready) {
    const partes = [`${room.area.toFixed(1)} m²`];
    if (roomMesh.volumeCount) partes.push(`${roomMesh.triangleCount.toLocaleString('pt-BR')} triângulos de volume`);
    if (roomMesh.objectCount) partes.push(`${roomMesh.objectCount} objeto(s)`);
    else if (room.obstacles.length) partes.push(`${room.obstacles.length} móvel(is)`);

    const rotulos = roomMesh.labels.slice(0, 5).map(([n, c]) => c > 1 ? `${n}×${c}` : n);

    scanTitle.textContent = 'Espaço reconhecido';
    scanInfo.innerHTML = partes.join(' · ') + ` · ${room.source}`
      + (rotulos.length ? `<br><span style="opacity:.7">${rotulos.join(' · ')}</span>` : '')
      + '<br><b>Aperte o gatilho para plantar a floresta</b>'
      + (xr.canCapture ? '<br><span style="opacity:.6">Grip para escanear de novo</span>' : '');
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
    scanTitle.textContent = 'Escaneando seu espaço…';
    if (room.planeCount || roomMesh.volumeCount) {
      scanInfo.innerHTML = `${room.planeCount} superfície(s)`
        + (roomMesh.volumeCount ? ` · ${roomMesh.volumeCount} volume(s)` : '')
        + '<br>Olhe ao redor para completar a leitura.';
    } else if (xr.canCapture) {
      scanInfo.innerHTML = 'Nenhum espaço conhecido ainda.'
        + '<br><b>Aperte o gatilho para escanear o cômodo agora.</b>';
    } else {
      scanInfo.innerHTML = 'Nenhum espaço encontrado. Rode o <b>Space Setup</b> do Quest,'
        + '<br>ou confirme para usar uma área padrão de 4 × 4 m.';
    }
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

  // A malha deixa de ser desenhada e passa a só escrever profundidade: daqui
  // em diante ela existe para esconder a floresta atrás dos móveis reais.
  roomMesh.setMode('occlude');

  sky.visible = state.skyOn;
  constelacao.visible = state.skyOn;
  skyMaterial.uniforms.uSky.value = state.skyOn ? 1 : 0;

  butterflies.fitTo(Math.sqrt(room.area / Math.PI));
  butterflies.visible = true;
  auraFireflies.visible = true;
  bodyGrowth.visible = true;
  bodyGrowth.setBlooming(state.bloomOn);
  state.phase = 'growing';
  state.intro = 0;
  interaction.enabled = true;
  scanEl?.classList.remove('on');
  ping(1);
  audio.chime(12, 0.28);
  const extras = [];
  if (forest.surfaces.length) extras.push(`${forest.surfaces.length} móvel(is) tomado(s)`);
  if (roomMesh.volumeCount) extras.push('oclusão ativa');
  toast(`${forest.treeCount} árvores em ${room.area.toFixed(1)} m²`
    + (extras.length ? ` · ${extras.join(' · ')}` : ''),
    palettes[state.paletteIndex].swatch);
}

/**
 * Escaneia o cômodo de verdade, do zero.
 *
 * Descartar o que já está lido ANTES de chamar a captura é o ponto: o Quest
 * guarda o Space Setup de sessões anteriores, e sem o reset o app aproveitaria
 * a leitura antiga e nunca abriria o escaneamento — que era exatamente o
 * sintoma de "ele não escaneou, lembrou de um escaneamento antigo da minha
 * sala".
 */
async function freshScan({ automatico = false } = {}) {
  if (!xr.canCapture) {
    if (!automatico) toast('Este aparelho não permite escanear pelo app');
    return false;
  }
  if (scanning) return false;
  scanning = true;

  room.reset();
  roomMesh.reset();
  roomMesh.setMode('scan');
  state.scanReveal = 0;
  updateScanPanel();

  const ok = await xr.captureRoom();
  scanning = false;

  if (ok) {
    // A leitura nova chega assíncrona; o painel acompanha sozinho.
    toast('Espaço escaneado — olhe ao redor');
  } else if (!automatico) {
    toast('O sistema recusou escanear agora');
  }
  updateScanPanel();
  return ok;
}

/** Reescaneio manual, pelo grip. */
function rescan() { freshScan(); }

/**
 * Deixa um enxame de vaga-lumes num ponto — a ideia é apontar para alguém.
 *
 * Reconhecer a pessoa automaticamente não é possível: o WebXR não expõe os
 * pixels do passthrough e não existe detecção de pessoas. Então quem aponta
 * é você, e o enxame fica onde foi deixado.
 */
function bless(worldPoint) {
  const alvo = worldPoint.clone();
  alvo.y = forest.position.y + 1.0;   // altura do peito de quem está ali
  blessedFireflies.snapTo(alvo);
  blessedFireflies.visible = true;
  state.blessed = true;
  ping(0.6);
  audio.chime(16, 0.18);
  toast('Vaga-lumes deixados ali', palettes[state.paletteIndex].swatch);
}

/**
 * Tocar no casulo. A borboleta sai, sobe deixando rastro, e o mundo vira
 * espaço enquanto ela sobe — a viagem dela É a transição, e é por isso que a
 * duração da subida e a do warp são a mesma.
 */
function hatch(indice) {
  const saidaLocal = forest.openCocoon(indice);
  if (!saidaLocal) return;
  const mundo = forest.localToWorld(saidaLocal.clone());

  emergence.launch(mundo);
  state.world = 'espaco';
  ping(1);
  audio.chime(24, 0.3);
  setTimeout(() => audio.chime(31, 0.2), 400);
  toast('Ela nasceu — siga com o olhar', palettes[state.paletteIndex].swatch);
}

function backToForest() {
  if (state.world === 'floresta') return;
  state.world = 'floresta';
  ping(0.8);
  audio.chime(5, 0.24);
  toast('De volta à clareira', palettes[state.paletteIndex].swatch);
}

function toggleBloom() {
  state.bloomOn = !state.bloomOn;
  bodyGrowth.setBlooming(state.bloomOn);
  toast(state.bloomOn ? 'Floresça' : 'Floração encerrada',
    palettes[state.paletteIndex].swatch);
}

function toggleSky() {
  state.skyOn = !state.skyOn;
  sky.visible = state.skyOn;
  toast(state.skyOn ? 'Céu aberto — olhe para cima' : 'Céu fechado',
    palettes[state.paletteIndex].swatch);
}

function toggleOcclusion() {
  state.occlusionOn = roomMesh.setOcclusion(!state.occlusionOn);
  toast(state.occlusionOn
    ? 'Oclusão ativa — a floresta some atrás dos móveis'
    : 'Oclusão desligada');
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
  shared.uSway.value = full ? 0.016 : 0.009;
  audio.setTrip(state.tripTarget);
  ping(0.9);
  toast(full ? 'Encanto intenso' : 'Encanto suave', palettes[state.paletteIndex].swatch);
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
      } else if (xr.canCapture) {
        // Nada conhecido e o runtime deixa escanear: é a hora exata de pedir.
        rescan();
        return;
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
    } else if (state.phase === 'growing' && state.world === 'espaco') {
      const planeta = space.pick(aimPoint ?? camera.position);
      if (planeta) { space.lift(planeta); space.drop(planeta); }
      else backToForest();
    } else if (state.phase === 'growing' && aimPoint) {
      const local = forest.worldToLocal(aimPoint.clone());
      if (forest.accepts(local)) {
        if (plantAt(aimPoint) === 'ok') interaction.pulse(controller, 0.6, 40);
      } else {
        // Fora da clareira: o gesto vira uma bênção em vez de erro.
        bless(aimPoint);
        interaction.pulse(controller, 0.8, 60);
      }
    }
  },
  onPalette: () => { if (state.phase === 'mapping') rescan(); else cyclePalette(); },
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
    orbit.moved = false;
    // Com giroscópio quem manda na rotação é o aparelho.
    if (state.mode === 'camera' && magic.hasOrientation) return;
    orbit.active = true; px = e.clientX; py = e.clientY;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e) => {
    if (!orbit.active) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    if (Math.abs(dx) + Math.abs(dy) > 4) orbit.moved = true;
    px = e.clientX; py = e.clientY;

    if (state.mode === 'camera') {
      // A câmera é o aparelho na sua mão: ela olha em volta, não orbita.
      magic.look(dx * 0.005, dy * 0.005);
      return;
    }
    orbit.theta -= dx * 0.006;
    orbit.phi = MathUtils.clamp(orbit.phi - dy * 0.006, 0.15, 1.55);
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
  sky.visible = state.skyOn;
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

const SENSOR_AVISO = {
  negado: 'Sensor de movimento bloqueado. Ajustes → Safari → <b>Movimento e '
    + 'Orientação</b> e recarregue. Por ora, arraste para olhar em volta.',
  ausente: 'Este aparelho não expõe sensor de orientação. Arraste para olhar em volta.',
  silencioso: 'O sensor foi liberado mas não está respondendo — comum em navegador '
    + 'embutido de outro app. Abra no Safari, ou arraste para olhar em volta.',
};

async function startCameraMode() {
  const btn = el('camera');
  btn.disabled = true;

  // ORDEM IMPORTA. No iOS 13+ requestPermission exige ativação por gesto, e
  // ela morre no primeiro await. Pedir a câmera antes consome a ativação e o
  // sensor é recusado em silêncio — o sintoma é exatamente "a câmera abre,
  // o giroscópio não".
  btn.textContent = 'Pedindo acesso ao sensor…';
  let sensor = 'ausente';
  try { sensor = await magic.requestOrientation(); } catch { sensor = 'negado'; }

  btn.textContent = 'Pedindo acesso à câmera…';
  try {
    audio.start();
    const feed = el('feed');
    await magic.startCamera(feed);
    feed.classList.add('on');

    state.mode = 'camera';
    previewMode = true;             // reaproveita plantar por toque e a barra
    gate.classList.add('gone');
    // Sem a classe 'preview' de propósito: ela esconde o #exit, e aqui o
    // usuário precisa conseguir desligar a câmera.
    overlay.classList.remove('preview');
    overlay.classList.add('on', 'touch', 'camera');
    el('exit').textContent = 'Fechar câmera';
    touchUI = true;

    // Sem rastreamento de posição, o que existe é girar em torno de si —
    // então a floresta nasce em volta, não à frente.
    roomAroundUser();
    commitRoom();
    camera.position.set(0, 1.55, 0);

    // O desfecho do sensor pode chegar depois: permissão concedida não
    // garante evento, e o watchdog avisa se ficar mudo.
    magic.onSensorResult = (estado) => {
      if (estado === 'ok') toast('Giroscópio ativo — gire o aparelho', palettes[state.paletteIndex].swatch);
      else toast('Sem giroscópio — arraste para olhar em volta');
    };

    if (sensor === 'concedido') {
      toast('Gire o aparelho para olhar em volta · toque para plantar', palettes[0].swatch);
    } else {
      toast('Sem giroscópio — arraste para olhar em volta');
      status(SENSOR_AVISO[sensor] ?? SENSOR_AVISO.ausente);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Abrir com a câmera';
    const negado = /NotAllowed|Permission/i.test(String(err?.name || err));
    status(negado
      ? '<b>Câmera negada.</b> Libere em Ajustes → Safari → Câmera e recarregue.'
      : `<b>Não deu para abrir a câmera:</b> ${err?.message ?? err}`);
  }
}

function stopCameraMode() {
  magic.stop();
  el('feed').classList.remove('on');
  el('exit').textContent = 'Sair do AR';
  state.mode = 'none';
  previewMode = false;
  overlay.classList.remove('on', 'preview', 'touch', 'camera');
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
    roomMesh.setMode('scan');
    sky.visible = false;
    state.scanReveal = 0;
    state.phase = 'mapping';
    updateScanPanel();

    // A experiência começa escaneando. Sem isto o app usaria o Space Setup
    // antigo e o usuário nunca veria o escaneamento acontecer.
    if (xr.canCapture) {
      await freshScan({ automatico: true });
    } else {
      toast('Este navegador não abre o escaneamento — usando o espaço já mapeado');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Entrar em AR';
    status(`<b>Falha ao iniciar:</b> ${err?.message ?? err}`);
  }
}

xr.onEnd = () => {
  scanning = false;
  overlay.classList.remove('on', 'touch');
  touchUI = null;
  scanEl?.classList.remove('on');
  gate.classList.remove('gone');
  interaction.enabled = false;
  state.phase = 'idle';
  forest.visible = false;
  room.view.visible = false;
  roomMesh.setMode('off');
  sky.visible = false;
  constelacao.visible = false;
  butterflies.visible = false;
  auraFireflies.visible = false;
  blessedFireflies.visible = false;
  bodyGrowth.visible = false;
  state.blessed = false;
  state.world = 'floresta';
  state.warp = 0;
  space.setProgress(0);
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
  seed: () => { if (state.world === 'espaco') backToForest(); else reseed(); },
  smaller: () => { state.scale = MathUtils.clamp(state.scale * 0.85, 0.35, 2.4); },
  bigger: () => { state.scale = MathUtils.clamp(state.scale * 1.18, 0.35, 2.4); },
  recenter: () => { magic.recenter(); toast('Frente recentrada'); },
  sky: toggleSky,
  bloom: toggleBloom,
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

    // No espaço a pinça só serve para pegar planeta.
    if (state.world === 'espaco') {
      const planeta = space.pick(hand.pinch);
      if (planeta) {
        grabbed.set(hand, { espaco: true, planeta: space.lift(planeta) });
        audio.chime(19, 0.12);
      }
      return;
    }

    // A semente na palma tem prioridade: se ela está madura, a pinça a pega.
    if (hand.handedness === seeds.hand && seeds.take()) {
      audio.chime(24, 0.12);
      toast('Semente na mão — solte perto do chão para plantar');
      return;
    }

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
    // Semente solta: planta onde caiu, se couber.
    if (hand.handedness === seeds.hand) {
      const onde = seeds.release();
      if (onde) {
        const chao = new Vector3(onde.x, forest.position.y, onde.z);
        if (plantAt(chao) === 'ok') { ping(0.7); audio.chime(12, 0.2); }
        return;
      }
    }

    const handle = grabbed.get(hand);
    if (!handle) return;
    grabbed.delete(hand);

    if (handle.espaco) { space.drop(handle.planeta); audio.chime(9, 0.12); return; }

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
  onReseed: () => { if (state.world === 'espaco') backToForest(); else reseed(); },
  onSky: () => { toggleSky(); },
  onBloom: () => { toggleBloom(); },
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
    if (handle?.espaco) {
      space.carry(handle.planeta, st.pinch);
    } else if (handle) {
      spin = clock.elapsedTime * 1.6;
      forest.carry(handle, toLocal(st.pinch), spin);
    } else if (!hover) {
      hover = forest.pick(toLocal(st.pinch));
    }
  }
  forest.highlight(hover);

  // Tocar no casulo com a ponta do indicador — sem precisar pinçar, porque
  // encostar é o gesto que a cena pede.
  if (state.world === 'floresta') {
    for (const st of hands.states) {
      if (!st.tracked) continue;
      const i = forest.pickCocoon(toLocal(st.indexTip));
      if (i >= 0) { hatch(i); break; }
    }
  }

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
const _head = new Vector3();
let scanTick = 0;
let scanning = false;

/**
 * O WebGLAnimation do three.js reagenda o próximo frame DEPOIS de chamar o
 * callback. Uma única exceção aqui dentro, portanto, não pula um frame: mata
 * o laço para sempre, e a cena congela sem nenhum erro visível. Numa
 * experiência imersiva isso é o pior desfecho possível — o usuário fica preso
 * olhando um quadro parado. Então o frame é blindado, e o erro é reportado
 * uma vez em vez de derrubar tudo.
 */
let frameErro = null;
function frame(time, xrFrame) {
  const dt = Math.min(0.05, clock.getDelta());

  shared.uTime.value = clock.elapsedTime;
  shared.uPulse.value *= Math.exp(-dt * 2.4);

  const k = 1 - Math.exp(-dt * 5.0);
  shared.uPalA.value.lerp(target.uPalA, k);
  shared.uPalB.value.lerp(target.uPalB, k);
  shared.uPalC.value.lerp(target.uPalC, k);
  shared.uPalD.value.lerp(target.uPalD, k);
  shared.uTrip.value += (state.tripTarget - shared.uTrip.value) * k;

  if (state.phase === 'mapping' && renderer.xr.isPresenting && !scanning) {
    // Durante a captura a tela é do sistema, e ler os planos antigos aqui só
    // repovoaria o cômodo com a leitura que acabamos de descartar.
    room.update(xrFrame, xr.refSpace);
    roomMesh.update(xrFrame, xr.refSpace);

    // Plano de varredura subindo em ciclo, e revelação entrando de vez.
    state.scanSweep = (state.scanSweep + dt * 1.15) % 3.6;
    state.scanReveal = Math.min(1, state.scanReveal + dt * 0.9);
    scanMaterial.uniforms.uSweep.value = room.floorY + state.scanSweep;
    scanMaterial.uniforms.uReveal.value = state.scanReveal;

    scanTick += dt;
    if (scanTick > 0.3) { scanTick = 0; syncTouchUI(); updateScanPanel(); }
  }

  if (magic.active) magic.update();

  interaction.groundY = forest.position.y;
  interaction.update(dt);
  updateHands(dt);
  forest.update(dt);

  camera.getWorldPosition(_head);
  if (sky.visible) {
    sky.update(clock.elapsedTime, _head);
    constelacao.update(_head);
  }

  // --- travessia entre os dois mundos -------------------------------------
  if (state.phase === 'growing') {
    const alvoWarp = state.world === 'espaco' ? 1 : 0;
    // Ida lenta (acompanha a subida da borboleta), volta rápida.
    const vel = alvoWarp > state.warp ? 1 / 5.0 : 1 / 1.6;
    state.warp += Math.sign(alvoWarp - state.warp)
      * Math.min(Math.abs(alvoWarp - state.warp), dt * vel);

    const w = state.warp;
    space.setProgress(w);
    emergence.update(dt, clock.elapsedTime);

    // A floresta encolhe e afunda para longe, em vez de sumir de uma vez.
    forest.visible = w < 0.99;
    butterflies.visible = w < 0.6;
    bodyGrowth.visible = w < 0.8;

    // O céu abre até cobrir tudo: no espaço não há mais horizonte de sala.
    skyMaterial.uniforms.uHorizon.value = 0.10 - w * 1.3;
    skyMaterial.uniforms.uFull.value = 0.62 - w * 1.3;
    skyMaterial.uniforms.uSpace.value = w;
    // E o oclusor sai de cena: paredes não fazem sentido no espaço.
    if (roomMesh.entries.length) {
      const querOcluir = state.occlusionOn && w < 0.5;
      if (querOcluir !== roomMesh.occlusionEnabled) roomMesh.setOcclusion(querOcluir);
    }
  }

  if (state.phase === 'growing') {
    const t = clock.elapsedTime;

    // Corpo inferido de cabeça + punhos, e o que floresce nele.
    body.update(camera, hands);
    bodyGrowth.update(body, t, dt);

    // Vaga-lumes acompanhando o peito, com atraso.
    auraFireflies.setTarget(body.joints.chest).update(t, dt);
    if (state.blessed) blessedFireflies.update(t, dt);

    butterflies.update(t);
    seeds.update(dt, t, hands);
    space.update(t, dt, _head);
  }

  if (state.phase === 'growing') {
    if (state.intro < 1) {
      state.intro = Math.min(1, state.intro + dt / 1.5);
      const e = 1 - Math.pow(1 - state.intro, 4);
      forest.scale.setScalar(Math.max(0.001, state.scale * e));
    } else {
      // Encolhe conforme o warp: a clareira fica para trás.
      forest.scale.setScalar(state.scale * (1 - state.warp * 0.85));
    }
    forest.rotation.y = state.spin;
    forest.position.y = shared.uOrigin.value.y - state.warp * 2.4;
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop((time, xrFrame) => {
  try {
    frame(time, xrFrame);
  } catch (err) {
    if (!frameErro) {
      frameErro = err;
      console.error('erro no frame (o laço continua):', err);
      toast('Algo falhou no frame — veja o console');
    }
  }
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
window.floresta = { forest, room, roomMesh, sky, constelacao, space, emergence, hatch, backToForest, butterflies, auraFireflies, blessedFireflies, body, bodyGrowth, seeds, hands, wristMenu, magic, state, shared, renderer, camera, orbit, cyclePalette, toggleTrip, reseed };

window.addEventListener('beforeunload', () => {
  roomMesh.dispose();
  sky.dispose();
  constelacao.dispose();
  butterflies.dispose();
  auraFireflies.dispose();
  blessedFireflies.dispose();
  bodyGrowth.dispose();
  seeds.dispose();
  space.dispose();
  emergence.dispose();
  hands.dispose();
  wristMenu.dispose();
  forest.dispose();
  room.dispose();
  interaction.dispose();
  disposeMaterials();
  audio.stop();
});
