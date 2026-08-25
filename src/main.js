import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector2, Vector3,
  Raycaster, Plane, Clock, MathUtils, Matrix4,
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
import { Butterflies, Fireflies, Cardume, Pirilampos } from './creatures.js';
import { Body, BodyGrowth } from './body.js';
import { Constellation } from './constellation.js';
import { Seeds } from './seeds.js';
import { Space, Emergence, ENTER_SCALE } from './space.js';
import { BlackHoles } from './blackholes.js';
import { Shell, Tide, wallsFromFootprint } from './shell.js';
import { CENAS, cenaPor, proxima, N_CENAS } from './cenas.js';
import { butterflyMaterial, cocoonMaterial, skyMaterial as _sky } from './shaders/materials.js';
import { Ambience } from './audio.js';
import { shared, disposeMaterials } from './shaders/materials.js';
import { palettes } from './palettes.js';

// "Encanto" no lugar do antigo psicodélico: a saturação extra agora é um
// tempero, não o prato. O modo intenso vai a 0,7 em vez de 1,0.
const TRIP_CALM = 0.24;
const TRIP_FULL = 0.70;

/**
 * Passos de bioluminescência.
 *
 * Não é um interruptor porque o efeito muda a leitura da mata inteira: quanto
 * mais luz sai de dentro, mais escuro fica o corpo que a emite, e há quem
 * queira a mata só levemente acesa. Começa em "acesa" — é o estado que a
 * floresta pede.
 */
const GLOW = [
  { v: 0.00, nome: 'Mata apagada' },
  { v: 0.45, nome: 'Brilho discreto' },
  { v: 0.80, nome: 'Mata acesa' },
  { v: 1.00, nome: 'Bioluminescência profusa' },
];

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

// Poucas e grandes lê melhor que muitas e pequenas: com enxame a asa vira
// ruído no canto do olho, e a batida — que é o que custou a acertar — se
// perde. Doze basta para o ar não parecer vazio.
const butterflies = new Butterflies(12);

// Debaixo d'água não voa borboleta. O cardume ocupa o mesmo lugar na cena e
// nunca aparece junto com elas — é um ou outro, conforme o cenário.
const cardume = new Cardume(18);

// O campo de vaga-lumes: setecentos pontos, uma chamada de desenho. Ocupou o
// lugar dos orbes, que eram poliedros sólidos flutuando sem explicação.
const pirilampos = new Pirilampos(700);
scene.add(pirilampos);
butterflies.visible = false;
scene.add(butterflies);
scene.add(cardume);

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

const seeds = new Seeds();
scene.add(seeds);

const space = new Space();
scene.add(space);
space.onTravessia = () => { audio.chime(-12, 0.22); ping(0.45); };

const buracos = new BlackHoles();
scene.add(buracos);

// A casca do cômodo: as paredes reais vestidas pelo mundo em que você está.
// Fica FORA da floresta de propósito — a floresta encolhe e dissolve na
// travessia, e as paredes não podem ir junto: elas são a sua sala.
const shell = new Shell();
scene.add(shell);
const tide = new Tide();
scene.add(tide);

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
  cena: 0,            // índice em cenas.js — onde da jornada você está
  subindo: false,     // a borboleta está levando este mundo embora
  calm: 0.45,         // amortecedor de cintilação, 0..1
  glowStep: 2,        // índice em GLOW
  paint: 0,           // 0 facetado .. 1 aquarela
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

/**
 * OS ALVOS DA CENA.
 *
 * Nada aqui é escrito direto no uniform: o laço persegue estes valores. Uma
 * cena que troca de estalo é um salto de brilho de tela cheia, que é
 * exatamente o que este projeto evita por causa de fotossensibilidade — e
 * também é feio. A perseguição é o que faz a travessia parecer metamorfose,
 * que é a regra da animação de referência: lá nada corta, tudo vira.
 */
const trio = () => [new Vector3(), new Vector3(), new Vector3()];
const alvo = {
  folha: trio(), casca: trio(), chapeu: trio(), petala: trio(), fruta: trio(), bio: trio(),
  paredeCor: new Vector3(1, 1, 1), paredeForca: 1,
  laminaCor: new Vector3(), laminaForca: 0,
  ceuBaixo: new Vector3(), ceuAlto: new Vector3(),
  estrelas: 1, nebulosa: 0.5,
};

/** Travessia de padrão de parede: de qual desenho, para qual, e onde está. */
const padTrans = { de: 0, para: 0, k: 1 };

const FAMILIAS = ['folha', 'casca', 'chapeu', 'petala', 'fruta', 'bio'];
const UNIFORME = { folha: 'uFolha', casca: 'uCasca', chapeu: 'uChapeu',
  petala: 'uPetala', fruta: 'uFruta', bio: 'uBio' };

/**
 * Aponta os alvos para uma cena. `imediato` salta — só serve para a primeira,
 * quando ainda não há nada na tela para saltar.
 */
function aplicarCena(indice, { imediato = false } = {}) {
  const c = cenaPor(indice);
  state.cena = c.id;

  for (const f of FAMILIAS) for (let i = 0; i < 3; i++) alvo[f][i].copy(c[f][i]);
  alvo.paredeCor.copy(c.parede.cor);
  alvo.paredeForca = c.parede.forca;
  alvo.laminaCor.copy(c.lamina.cor);
  alvo.laminaForca = c.lamina.forca;
  alvo.ceuBaixo.copy(c.ceu.baixo);
  alvo.ceuAlto.copy(c.ceu.alto);
  alvo.estrelas = c.ceu.estrelas;
  alvo.nebulosa = c.ceu.nebulosa;

  // A parede não interpola desenho: ela mostra os dois ao mesmo tempo e passa
  // o peso de um para o outro. Interpolar índice de padrão daria um desenho
  // intermediário que não existe.
  padTrans.de = shared.uPadB.value;
  padTrans.para = c.parede.padrao;
  padTrans.k = imediato ? 1 : 0;
  shared.uPadA.value = padTrans.de;
  shared.uPadB.value = padTrans.para;
  shared.uPadMix.value = padTrans.k;

  state.paletteIndex = c.palette;
  const pal = palettes[c.palette];
  target.uPalA.copy(pal.a); target.uPalB.copy(pal.b);
  target.uPalC.copy(pal.c); target.uPalD.copy(pal.d);

  if (imediato) {
    for (const f of FAMILIAS) {
      for (let i = 0; i < 3; i++) shared[UNIFORME[f]].value[i].copy(alvo[f][i]);
    }
    shared.uParedeCor.value.copy(alvo.paredeCor);
    shared.uParedeForca.value = alvo.paredeForca;
    shared.uLaminaCor.value.copy(alvo.laminaCor);
    shared.uCeuBaixo.value.copy(alvo.ceuBaixo);
    shared.uCeuAlto.value.copy(alvo.ceuAlto);
    shared.uEstrelas.value = alvo.estrelas;
    shared.uNebulosa.value = alvo.nebulosa;
    for (const k of Object.keys(target)) shared[k].value.copy(target[k]);
  }

  audio.setCena(c.ambience);
  return c;
}

/**
 * Estamos no cenário do cosmos? É o único com planetas ao alcance da mão e
 * buracos abertos nas paredes — vários trechos precisam saber disso, e
 * perguntar à cena é mais honesto do que guardar um segundo estado paralelo.
 */
function noCosmos() { return !!cenaPor(state.cena).cosmos; }

/** Persegue os alvos. Chamado a cada quadro. */
function seguirCena(dt) {
  const k = 1 - Math.exp(-dt * 1.1);
  for (const f of FAMILIAS) {
    const dest = shared[UNIFORME[f]].value;
    for (let i = 0; i < 3; i++) dest[i].lerp(alvo[f][i], k);
  }
  shared.uParedeCor.value.lerp(alvo.paredeCor, k);
  shared.uLaminaCor.value.lerp(alvo.laminaCor, k);
  shared.uCeuBaixo.value.lerp(alvo.ceuBaixo, k);
  shared.uCeuAlto.value.lerp(alvo.ceuAlto, k);
  shared.uParedeForca.value += (alvo.paredeForca - shared.uParedeForca.value) * k;
  shared.uEstrelas.value += (alvo.estrelas - shared.uEstrelas.value) * k;
  shared.uNebulosa.value += (alvo.nebulosa - shared.uNebulosa.value) * k;

  if (padTrans.k < 1) {
    padTrans.k = Math.min(1, padTrans.k + dt * 0.45);
    shared.uPadMix.value = padTrans.k;
    // Chegou: o novo padrão passa a ser o único, e o slot A fica livre para
    // a próxima travessia.
    if (padTrans.k >= 1) shared.uPadA.value = padTrans.para;
  }
}

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
  // Descampado: a floresta é obra de quem planta, não da geração.
  forest.seedBare(state.seed);
  shared.uOrigin.value.copy(forest.position);
  forest.visible = true;
  room.view.visible = false;

  // A malha deixa de ser desenhada e passa a só escrever profundidade: daqui
  // em diante ela existe para esconder a floresta atrás dos móveis reais.
  // Menos o teto: ele vira abertura, para a copa passar por ele.
  roomMesh.setCeiling(room.ceilingY);
  roomMesh.setMode('occlude');

  sky.visible = state.skyOn;
  constelacao.visible = state.skyOn;
  skyMaterial.uniforms.uSky.value = state.skyOn ? 1 : 0;

  // Buracos ancorados nas paredes lidas. Ficam preparados aqui, mas só
  // aparecem quando você atravessa para o espaço.
  // Onde o chão acaba, a parede começa. A leitura de planos verticais só vem
  // quando o Space Setup tem paredes marcadas, e sem essa saída metade das
  // salas ficaria sem casca e sem buraco nenhum.
  const paredes = forest.wallBases.length
    ? forest.wallBases : wallsFromFootprint(forest.footprint);

  buracos.applyWalls(paredes, state.seed);
  buracos.position.copy(forest.position);
  buracos.setProgress(0);

  // Paredes e lâmina compartilham a origem do cômodo, mas não a escala nem o
  // afundamento da floresta: a sala fica onde está.
  const alturaTeto = room.ceilingY != null ? room.ceilingY - room.floorY : 2.6;
  shell.applyWalls(paredes, alturaTeto);
  // Os dois buracos viram o par de portais dos planetas: quem entra num sai
  // pelo outro. Sem dois, ninguém atravessa nada.
  space.setPortais(buracos.portais());
  shell.position.copy(forest.position);
  tide.applyFootprint(forest.footprint);
  tide.position.copy(forest.position);

  const raioSala = Math.sqrt(room.area / Math.PI);
  butterflies.fitTo(raioSala);
  cardume.fitTo(raioSala);
  pirilampos.fitTo(forest.footprint, alturaTeto);
  auraFireflies.visible = true;
  bodyGrowth.visible = true;
  bodyGrowth.setBlooming(state.bloomOn);
  state.phase = 'growing';
  state.intro = 0;
  interaction.enabled = true;
  scanEl?.classList.remove('on');
  ping(1);
  audio.chime(12, 0.28);

  // A jornada começa sempre no primeiro elo, e sem transição: não há nada na
  // tela ainda para atravessar.
  aplicarCena(0, { imediato: true });
  const c = montarCena(0);
  toast(`${c.nome} — ${c.saudacao}`, c.swatch);
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
  virouLuz = false;
  state.subindo = true;
  // Os planetas nascem em volta de onde você está AGORA e ficam parados ali:
  // é o que permite dar a volta neles caminhando quando o Olho chegar.
  space.position.set(_head.x, forest.position.y, _head.z);
  ping(1);
  audio.chime(24, 0.3);
  setTimeout(() => audio.chime(31, 0.2), 400);
  toast('Ela nasceu — siga com o olhar', cenaPor(state.cena).swatch);
}

/**
 * Monta o cenário de índice `i` do zero.
 *
 * Chamado no alto da subida, quando o mundo anterior já evaporou. Semear com
 * a tela cheia seria ver a floresta aparecer de um quadro para o outro; aqui
 * ela nasce dentro do clarão e se condensa conforme a dissolução volta.
 */
function montarCena(i) {
  const c = aplicarCena(i);
  state.seed = (state.seed * 1103515245 + 12345) >>> 0;
  forest.setDensidade(c.populacao);
  forest.seed(state.seed);
  // A saída daqui não pode depender de sorteio.
  forest.garantirCasulo();
  forest.visible = true;
  state.intro = 0;

  tide.setNivel(c.lamina.altura);
  // A densidade que era dos orbes agora rege o campo de vaga-lumes.
  pirilampos.setDensidade(c.populacao.orbe ?? 1);
  for (const p of passos) p.z = 0;   // cenário novo, chão intacto
  _ultimoPasso.set(1e9, 0, 1e9);
  ping(1);
  audio.chime(12, 0.3);
  toast(`${c.nome} — ${c.saudacao}`, c.swatch);
  return c;
}

/** Avança um elo da cadeia. O último devolve ao primeiro. */
function trocarCena() { return montarCena(proxima(state.cena)); }

/**
 * Atravessa para o mundo de um planeta. Tudo o que muda é o bioma, a paleta e
 * o chão — a mecânica é a mesma em todos: terra nua, sementes, e um casulo que
 * devolve ao espaço.
 */
function enterWorld(indice) {
  space.resetScales();
  state.subindo = false;
  return montarCena(indice);
}

function backToForest() {
  if (!state.subindo) return;
  state.subindo = false;
  ping(0.8);
  audio.chime(5, 0.24);
  toast('De volta à clareira', palettes[state.paletteIndex].swatch);
}

/**
 * Troca entre a mata facetada e a pintada.
 *
 * O uniform é perseguido no laço, não trocado de estalo: a passagem entre os
 * dois é a melhor forma de ver o que cada um faz, e um corte seco esconde
 * justamente isso.
 */
function togglePaint() {
  state.paint = state.paint > 0.5 ? 0 : 1;
  ping(0.5);
  audio.chime(state.paint ? 7 : -5, 0.2);
  toast(state.paint ? 'Aquarela sobre papel' : 'Low poly facetado',
    cenaPor(state.cena).swatch);
  return state.paint;
}

/**
 * Sobe um degrau de bioluminescência.
 *
 * O uniform não pula: ele é perseguido no laço, porque uma mata que acende de
 * estalo é justamente o tipo de mudança brusca de brilho que a gente evita.
 */
function cycleGlow() {
  state.glowStep = (state.glowStep + 1) % GLOW.length;
  const g = GLOW[state.glowStep];
  ping(0.5);
  audio.chime([0, 5, 9, 12][state.glowStep], 0.2);
  toast(g.nome, palettes[state.paletteIndex].swatch);
  return g.v;
}

/**
 * Modo calmo de verdade: zera a oscilação de brilho da cena inteira.
 *
 * Brilho variável é gatilho de crise em epilepsia fotossensível. As
 * frequências daqui já ficam abaixo de 1 Hz, longe da faixa perigosa de 3 a
 * 30 Hz, mas amplitude também conta — e num headset a cabeça nunca para, então
 * qualquer variação vira cintilação percebida.
 */
function toggleCalm() {
  state.calm = state.calm > 0.05 ? 0 : 0.45;
  shared.uCalm.value = state.calm;
  shared.uTrample.value = state.calm === 0 ? 0.45 : 1.0;
  toast(state.calm === 0
    ? 'Sem cintilação — brilho constante'
    : 'Cintilação suave restaurada', palettes[state.paletteIndex].swatch);
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

function plantAt(worldPoint, kind = 'normal') {
  const result = forest.plant(forest.worldToLocal(worldPoint.clone()), Math.random, kind);
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
/** Já houve o clarão do topo desta subida? */
let virouLuz = false;

/** O que cada controle está puxando de longe. */
const puxando = new Map();
const _origem = new Vector3();
const _direcao = new Vector3();
const _invForest = new Matrix4();

const interaction = new Interaction(renderer, scene, camera, {
  onSelectEnd: (controller) => {
    const alca = puxando.get(controller);
    if (!alca) return;
    puxando.delete(controller);
    if (alca.espaco) { space.drop(alca.planeta); audio.chime(9, 0.12); return; }
    const r = forest.drop(alca, forest.worldToLocal(alca.ponto.clone()));
    if (r === 'devolvido') toast('Não coube ali — voltou para o lugar');
    audio.chime(r === 'plantado' ? 7 : -7, 0.14);
  },

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
    } else if (state.phase === 'growing' && noCosmos()) {
      const planeta = space.pick(aimPoint ?? camera.position);
      if (planeta) { space.lift(planeta); space.drop(planeta); }
      else backToForest();
    } else if (state.phase === 'growing' && !noCosmos() && controller) {
      // Primeiro tenta agarrar de longe pelo raio. Só se não houver nada sob
      // a mira é que o gesto vira plantar ou abençoar.
      interaction.ray(controller, _origem, _direcao);
      const distante = forest.pickAlongRay(
        forest.worldToLocal(_origem.clone()),
        _direcao.clone().transformDirection(forest.matrixWorld.clone().invert()).normalize());
      if (distante) {
        const alca = forest.lift(distante);
        alca.distancia = distante.dist * forest.scale.x;
        alca.ponto = new Vector3();
        puxando.set(controller, alca);
        interaction.pulse(controller, 0.5, 30);
        audio.chime(19, 0.1);
        return;
      }
      if (!aimPoint) return;
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
    if (k === 'c') toggleCalm();
    if (k === 'b') cycleGlow();
    if (k === 'a') togglePaint();
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
  toast('Prévia: arraste para orbitar · clique planta · P paleta · T viagem · R semear · B brilho · A aquarela', palettes[0].swatch);
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
  buracos.setProgress(0);
  constelacao.visible = false;
  butterflies.visible = false;
  auraFireflies.visible = false;
  blessedFireflies.visible = false;
  bodyGrowth.visible = false;
  state.blessed = false;
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
  seed: () => { if (state.subindo) backToForest(); else reseed(); },
  smaller: () => { state.scale = MathUtils.clamp(state.scale * 0.85, 0.35, 2.4); },
  bigger: () => { state.scale = MathUtils.clamp(state.scale * 1.18, 0.35, 2.4); },
  recenter: () => { magic.recenter(); toast('Frente recentrada'); },
  sky: toggleSky,
  bloom: toggleBloom,
  calm: toggleCalm,
};
el('pad').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) PAD[btn.dataset.act]?.();
});

// ---------------------------------------------------------------------------
// Mãos livres
// ---------------------------------------------------------------------------
const grabbed = new Map();   // HandState -> alça devolvida por forest.lift
let escalaRef = null;        // referência da pinça de duas mãos sobre um planeta

/** Ponto da mão em coordenadas locais da floresta. */
function toLocal(worldPoint) { return forest.worldToLocal(worldPoint.clone()); }

const _rOrig = new Vector3();
const _rDir = new Vector3();
const _rOrigL = new Vector3();
const _rDirL = new Vector3();
const _pMao = new Vector3();

/**
 * O raio de uma mão, do olho PARA a mão e adiante.
 *
 * Poderia sair do dedo, mas o dedo indicador se dobra para encostar no
 * polegar justamente quando você pinça — e aí a direção do dedo aponta para
 * qualquer lugar menos o alvo. Da cabeça através da mão é estável em qualquer
 * postura, e o gesto que ele pede é o natural: cobrir o alvo com a mão.
 *
 * Isto é o que faz a experiência inteira funcionar SENTADO ou DEITADO. Nada
 * aqui depende de você alcançar as coisas com o braço.
 */
function handRayFrom(ponto, origem = _rOrig, direcao = _rDir) {
  camera.getWorldPosition(_pMao);
  direcao.copy(ponto).sub(_pMao);
  if (direcao.lengthSq() < 1e-6) direcao.set(0, 0, -1);
  direcao.normalize();
  return origem.copy(ponto);
}

function handRay(st, origem = _rOrig, direcao = _rDir) {
  handRayFrom(st.pinch, origem, direcao);
  return direcao;
}

/** O mesmo raio, em coordenadas locais da floresta. */
function raioLocal(origem, direcao) {
  _rOrigL.copy(origem);
  forest.worldToLocal(_rOrigL);
  _rDirL.copy(direcao)
    .transformDirection(_invForest.copy(forest.matrixWorld).invert())
    .normalize();
  return _rDirL;
}

/** Onde o raio encontra o chão da floresta, em mundo. Null se não encontra. */
function chaoDoRaio(origem, direcao, alcance = 9) {
  if (direcao.y > -0.02) return null;
  const t = (forest.position.y - origem.y) / direcao.y;
  if (t < 0 || t > alcance) return null;
  return origem.clone().addScaledVector(direcao, t);
}

const hands = new Hands(renderer, {
  onPinchStart: (hand) => {
    if (state.phase === 'mapping') {
      if (room.ready || room.commitFromReticle()) commitRoom();
      else if (!room.hasHitTest) { room.useFallback(aheadOfCamera()); commitRoom(); }
      else toast('Aponte para o chão até o anel aparecer');
      return;
    }
    if (state.phase !== 'growing') return;

    handRay(hand, _rOrig, _rDir);

    // No espaço a pinça só serve para pegar planeta — encostado nele, ou sob
    // a mira, que é o que vale quando você está sentado e a órbita passa
    // longe do braço.
    if (noCosmos()) {
      const planeta = space.pick(hand.pinch) ?? space.pickAlongRay(_rOrig, _rDir);
      if (planeta) {
        const d = planeta.getWorldPosition(_pMao).distanceTo(_rOrig);
        const alca = { espaco: true, planeta: space.lift(planeta) };
        // Longe da mão, ele fica preso ao raio e acompanha o pulso. Perto,
        // segue a mão direto — mexer o pulso ali seria movimento demais.
        if (d > 0.40) { alca.raio = true; alca.distancia = d; alca.ponto = new Vector3(); }
        grabbed.set(hand, alca);
        audio.chime(19, 0.12);
      }
      return;
    }

    // Planta ao alcance vem PRIMEIRO. Com a semente em primeiro lugar,
    // qualquer pinça a pegava e nunca dava para agarrar um cogumelo — e
    // quando você pinça a semente sua mão está no ar, longe de qualquer
    // planta, então esta ordem não atrapalha o plantio.
    const local = toLocal(hand.pinch);
    const target = forest.pick(local);
    if (target) {
      grabbed.set(hand, forest.lift(target));
      audio.chime(19, 0.1);
      return;
    }

    if (seeds.hand === hand.handedness && seeds.take()) {
      audio.chime(seeds.kind === 'cocoon' ? 28 : 24, 0.12);
      toast(seeds.kind === 'cocoon'
        ? 'Semente de casulo — dela nasce a árvore que leva ao espaço'
        : 'Semente na mão — aponte para o chão e solte',
        palettes[state.paletteIndex].swatch);
      return;
    }

    // --- daqui para baixo, tudo é à DISTÂNCIA -----------------------------
    // Sentado ou deitado nada disso está ao alcance do braço, e é justamente
    // por isso que existe. Pinçar mirando é o gesto único da experiência.
    raioLocal(_rOrig, _rDir);

    // Casulo sob a mira: é a porta para o espaço, então vem antes de tudo.
    const ci = forest.pickCocoonAlongRay(_rOrigL, _rDirL);
    if (ci >= 0) { hatch(ci); return; }

    const distante = forest.pickAlongRay(_rOrigL, _rDirL);
    if (distante) {
      const alca = forest.lift(distante);
      alca.raio = true;
      alca.distancia = distante.dist * forest.scale.x;
      alca.ponto = new Vector3();
      grabbed.set(hand, alca);
      audio.chime(19, 0.1);
      return;
    }

    // Nada sob a mira: planta onde o raio encosta no chão. Com a mão já perto
    // do piso vale a própria mão — quem está de pé e agachado não deveria ter
    // de mirar para plantar aos próprios pés.
    if (hand.pinch.y - forest.position.y < 0.9) {
      plantAt(new Vector3(hand.pinch.x, forest.position.y, hand.pinch.z));
      return;
    }
    const chao = chaoDoRaio(_rOrig, _rDir);
    if (chao) plantAt(chao);
  },

  onPinchEnd: (hand) => {
    // Semente solta: planta onde caiu, se couber.
    if (seeds.hand === hand.handedness) {
      const kind = seeds.kind;
      const onde = seeds.release();
      if (onde) {
        // Com a mão no alto, quem escolhe o lugar é a mira: soltar a semente
        // sentado plantaria sempre debaixo da própria cadeira.
        const mirado = onde.y - forest.position.y > 0.9
          ? chaoDoRaio(handRayFrom(onde), _rDir) : null;
        const chao = mirado ?? new Vector3(onde.x, forest.position.y, onde.z);
        if (plantAt(chao, kind) === 'ok') {
          ping(0.7);
          audio.chime(12, 0.2);
          toast(kind === 'cocoon'
            ? 'Árvore de casulo plantada — dez segundos'
            : 'Plantada — dez segundos para crescer', palettes[state.paletteIndex].swatch);
        }
        return;
      }
    }

    const handle = grabbed.get(hand);
    if (!handle) return;
    grabbed.delete(hand);

    if (handle.espaco) { space.drop(handle.planeta); audio.chime(9, 0.12); return; }

    // O que veio pelo raio é solto onde o raio o deixou, não onde a mão está.
    const ondeCai = handle.raio ? handle.ponto : hand.pinch;
    const result = forest.drop(handle, toLocal(ondeCai));
    ping(0.5);
    audio.chime(result === 'plantado' ? 7 : -7, 0.14);
    if (result === 'devolvido') toast('Não coube ali — voltou para o lugar');
  },
});
scene.add(hands);

const wristMenu = new WristMenu({
  onPalette: () => { cyclePalette(); },
  onTrip: () => { toggleTrip(); },
  onReseed: () => { if (state.subindo) backToForest(); else reseed(); },
  onSky: () => { toggleSky(); },
  onBloom: () => { toggleBloom(); },
  onGlow: () => { cycleGlow(); },
});
scene.add(wristMenu);

/** Roda a cada frame: carregar o que está na mão e realçar o que está ao alcance. */
function updateHands(dt) {
  hands.update();

  if (state.phase !== 'growing') { forest.highlight(null); return; }

  // Duas mãos no mesmo planeta = escala. Afastar as mãos aumenta; passando do
  // limiar, o planeta se abre e você atravessa para o mundo dele.
  const seguro = [...grabbed.entries()].find(([, h]) => h.espaco);
  if (seguro && noCosmos()) {
    const [maoQueSegura, alca] = seguro;
    const outra = hands.states.find((st) => st !== maoQueSegura && st.tracked && st.pinching);
    if (outra) {
      const d = maoQueSegura.pinch.distanceTo(outra.pinch);
      if (!escalaRef) escalaRef = { d: Math.max(d, 0.04), s: alca.planeta.scale.x };
      const atravessa = space.scaleHeld(alca.planeta, escalaRef.s * (d / escalaRef.d));
      if (atravessa) {
        grabbed.delete(maoQueSegura);
        escalaRef = null;
        enterWorld(alca.planeta.userData.bioma);
      }
    } else {
      escalaRef = null;
    }
  } else {
    escalaRef = null;
  }

  let spin = 0;
  let hover = null;
  for (const st of hands.states) {
    if (!st.tracked) continue;
    const handle = grabbed.get(st);
    if (handle?.raio) {
      // Preso ao raio: mexer o pulso arrasta o objeto lá longe. A distância
      // fica congelada, então ele orbita você em vez de vir vindo.
      handRay(st, _rOrig, _rDir);
      handle.ponto.copy(_rOrig).addScaledVector(_rDir, handle.distancia);
      if (handle.espaco) space.carry(handle.planeta, handle.ponto);
      else forest.carry(handle, toLocal(handle.ponto), clock.elapsedTime * 1.2);
    } else if (handle?.espaco) {
      space.carry(handle.planeta, st.pinch);
    } else if (handle) {
      spin = clock.elapsedTime * 1.6;
      forest.carry(handle, toLocal(st.pinch), spin);
    } else if (!hover) {
      // Realça o que está ao alcance; se não há nada, o que está sob a mira.
      // O realce é a única confirmação de que o raio achou alguma coisa.
      hover = forest.pick(toLocal(st.pinch));
      if (!hover && !noCosmos()) {
        handRay(st, _rOrig, _rDir);
        raioLocal(_rOrig, _rDir);
        hover = forest.pickAlongRay(_rOrigL, _rDirL);
      }
    }
  }
  forest.highlight(hover);

  // Tocar no casulo com a ponta do indicador — sem precisar pinçar, porque
  // encostar é o gesto que a cena pede.
  if (!noCosmos()) {
    for (const st of hands.states) {
      if (!st.tracked) continue;
      const i = forest.pickCocoon(toLocal(st.indexTip));
      if (i >= 0) { hatch(i); break; }
    }
  }

  wristMenu.update(dt, hands.byHandedness('left'), hands.byHandedness('right'));
}

// Quem pediu menos movimento no sistema recebe a cena sem oscilação nenhuma,
// sem precisar achar o botão.
const reduzirMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (reduzirMovimento) {
  state.calm = 0;
  shared.uCalm.value = 0;
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

/**
 * Trilha de pisadas.
 *
 * Guarda onde você passou e por quanto tempo aquilo ainda conta. Um passo novo
 * só entra depois de PASSO_MIN de distância — gravar por tempo encheria o
 * buffer inteiro com o mesmo ponto quando você para, e a trilha sumiria.
 *
 * A força decai ao longo de PASSO_VIDA, então o caminho se fecha sozinho: a
 * vegetação levanta de novo atrás de você.
 */
const PASSO_MIN = 0.30;      // metros entre pisadas registradas
const PASSO_VIDA = 14;       // segundos até a vegetação levantar de vez
const passos = shared.uSteps.value;
let passoCursor = 0;
const _ultimoPasso = new Vector3(1e9, 0, 1e9);

function registrarPasso(pos) {
  const dx = pos.x - _ultimoPasso.x, dz = pos.z - _ultimoPasso.z;
  if (dx * dx + dz * dz < PASSO_MIN * PASSO_MIN) return;
  _ultimoPasso.copy(pos);
  passos[passoCursor].set(pos.x, pos.z, 1);
  passoCursor = (passoCursor + 1) % passos.length;
}

function envelhecerPassos(dt) {
  const queda = dt / PASSO_VIDA;
  for (const p of passos) p.z = Math.max(0, p.z - queda);
}
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
  shared.uPulse.value *= Math.exp(-dt * 1.3);   // a onda demora mais a se apagar

  const k = 1 - Math.exp(-dt * 1.8);   // paleta atravessa devagar, sem estalo
  shared.uPalA.value.lerp(target.uPalA, k);
  shared.uPalB.value.lerp(target.uPalB, k);
  shared.uPalC.value.lerp(target.uPalC, k);
  shared.uPalD.value.lerp(target.uPalD, k);
  shared.uTrip.value += (state.tripTarget - shared.uTrip.value) * k;
  // A mata acende e apaga devagar, nunca de estalo.
  shared.uGlow.value += (GLOW[state.glowStep].v - shared.uGlow.value)
    * (1 - Math.exp(-dt * 0.9));
  shared.uPaint.value += (state.paint - shared.uPaint.value) * (1 - Math.exp(-dt * 1.4));
  // Trocar de mundo é animar este float: um só conjunto de materiais serve
  // para todos os biomas.
  // A cena inteira é perseguida aqui: cor de folha, de casca, de parede, de
  // céu. Trocar de cenário virou interpolação de uniforms, e não recompilação.
  seguirCena(dt);

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

  // Objetos presos ao raio acompanham a mira, mantendo a distância.
  for (const [controller, alca] of puxando) {
    interaction.rayPoint(controller, alca.distancia, alca.ponto);
    if (alca.espaco) space.carry(alca.planeta, alca.ponto);
    else forest.carry(alca, forest.worldToLocal(alca.ponto.clone()), clock.elapsedTime * 1.2);
  }
  updateHands(dt);
  forest.update(dt);

  camera.getWorldPosition(_head);

  // A vegetação cede por onde você passa. Só na floresta: no espaço não há
  // chão para pisar.
  if (state.phase === 'growing' && !state.subindo) {
    registrarPasso(_head);
    envelhecerPassos(dt);
  }

  if (sky.visible) {
    sky.update(clock.elapsedTime, _head);
    constelacao.update(_head);
  }

  // As paredes ficam vestidas o tempo todo, inclusive no espaço: o cômodo é
  // o palco em todos os mundos, e sumir com ele quebraria a mistura.
  if (state.phase === 'growing') {
    shell.setAmount(state.intro);
    // A lâmina, não: uma superfície de água na altura da cintura só faz
    // sentido enquanto há chão. No espaço ela recua.
    tide.update(dt, state.intro * (1 - state.warp) * cenaPor(state.cena).lamina.forca);
  }

  // --- travessia entre os dois mundos -------------------------------------
  if (state.phase === 'growing') {
    // A TRAVESSIA.
    //
    // Sobe em sete segundos, que é o tempo da borboleta levando o mundo
    // embora, e desce em quatro, que é o tempo do próximo se condensar. A ida
    // é mais lenta que a volta de propósito: perder um mundo tem que custar
    // mais do que ganhar o seguinte.
    if (state.subindo) state.warp = Math.min(1, state.warp + dt / 7.0);
    else state.warp = Math.max(0, state.warp - dt / 4.0);

    const w = state.warp;

    // Planetas e buracos só existem no cenário do cosmos, e recuam junto com
    // a travessia como todo o resto.
    const cosmos = noCosmos() ? 1 : 0;
    space.setProgress(cosmos * (1 - w));
    buracos.setProgress(cosmos * (1 - w));

    const subida = emergence.update(dt, clock.elapsedTime);

    // Chegou ao alto: o mundo anterior acabou de evaporar e o próximo entra.
    // É aqui, e não no toque do casulo, porque montar a cena com a tela cheia
    // faria a floresta seguinte aparecer de um quadro para o outro.
    if (state.subindo && w >= 1) {
      state.subindo = false;
      trocarCena();
    }
    // No alto da subida ela vira luz. O clarão é LENTO de propósito: uPulse
    // decai em cerca de dois segundos, muito abaixo da faixa de 3 a 30 Hz
    // que dispara crise em epilepsia fotossensível.
    if (subida > 0.88 && !virouLuz) {
      virouLuz = true;
      shared.uPulse.value = 1;
      audio.chime(36, 0.5);
      toast('Ela virou luz', palettes[state.paletteIndex].swatch);
    }

    // O MUNDO EVAPORA.
    //
    // Enquanto a borboleta sobe, tudo o que cresceu se dissolve — a rasteira
    // primeiro, as copas por último. Antes a floresta só encolhia, e encolher
    // lê como "a cena foi embora"; dissolver lê como "ela levou o mundo".
    // Termina em 75% da subida: o último trecho ela sobe sozinha.
    shared.uVanish.value = Math.min(1, Math.max(0, (w - 0.05) / 0.70));

    forest.visible = w < 0.99;

    bodyGrowth.visible = w < 0.8;

    // QUEM RECORTA O CÉU.
    //
    // Com o oclusor ativo, quem recorta é a própria sala: parede e chão
    // escondem o céu, e o buraco do teto o mostra. Aí ele pode ser opaco de
    // verdade — todo o teto vira virtual, e a copa da árvore aparece contra
    // ele em vez de contra o gesso.
    //
    // Sem oclusor não há o que recorte, e um céu opaco cobriria a sala
    // inteira. Nesse caso ele volta a abrir por ÂNGULO, como sempre abriu:
    // à frente você vê o cômodo, e o céu só toma conta quando você levanta
    // a cabeça. Pior, mas é o que dá para fazer sem saber onde estão as
    // paredes.
    const recortado = roomMesh.entries.length > 0
      && roomMesh.occlusionEnabled && state.occlusionOn;
    // O CÉU COMEÇA NO TETO, e não num ângulo.
    //
    // Com o oclusor ativo, quem recorta é a sala: parede e chão escrevem
    // profundidade e escondem o céu; o teto não escreve e o deixa passar.
    // Então o céu não precisa de desvanecimento angular nenhum — ele é opaco
    // em toda direção, e o buraco do teto é o único lugar por onde aparece.
    // Do teto para cima é 100% virtual; do teto para baixo é a sua sala.
    //
    // Sem oclusor não há o que recorte, e um céu opaco cobriria o cômodo
    // inteiro. Só nesse caso ele volta a abrir por ângulo.
    const h0 = recortado ? -2.0 : 0.10;
    const f0 = recortado ? -1.9 : 0.62;
    skyMaterial.uniforms.uHorizon.value = h0 - w * 0.30;
    skyMaterial.uniforms.uFull.value = f0 - w * 0.34;
    skyMaterial.uniforms.uMaxVeil.value = recortado ? 1.0 : 0.72;
    // O céu abre no cosmos e durante a passagem; nos outros cenários ele é
    // noite de sala, com o teto aberto e mais nada.
    const cena = cenaPor(state.cena);
    skyMaterial.uniforms.uSpace.value = Math.max((cena.cosmos ? 0.85 : 0) * (1 - w), w * 0.7);
    // E o oclusor sai de cena: paredes não fazem sentido no espaço.
    if (roomMesh.entries.length) {
      const querOcluir = state.occlusionOn && w < 0.5;
      if (querOcluir !== roomMesh.occlusionEnabled) roomMesh.setOcclusion(querOcluir);
    }
  }

  if (state.phase === 'growing') {
    const t = clock.elapsedTime;

    // ONDE VOCÊ ESTÁ, agora. O peito e não a cabeça: é o centro do volume
    // que a vegetação tem de sentir, e quem se agacha continua sendo notado.
    shared.uPresenca.value.copy(body.joints.chest ?? _head);

    // Corpo inferido de cabeça + punhos, e o que floresce nele.
    body.update(camera, hands);
    bodyGrowth.update(body, t, dt);

    // Vaga-lumes acompanhando o peito, com atraso.
    auraFireflies.setTarget(body.joints.chest).update(t, dt);
    if (state.blessed) blessedFireflies.update(t, dt);

    // Um ou outro, nunca os dois.
    const aquatico = !!cenaPor(state.cena).aquatico;
    butterflies.visible = !aquatico && state.warp < 0.6;
    cardume.visible = aquatico && state.warp < 0.6;
    if (aquatico) cardume.update(t);
    else butterflies.update(t);
    seeds.update(dt, t, hands);
    space.update(t, dt);
  }

  if (state.phase === 'growing') {
    if (state.intro < 1) {
      state.intro = Math.min(1, state.intro + dt / 3.2);
      // Suavização nos dois extremos: começa e termina devagar, em vez de
      // arrancar de uma vez como fazia a curva puramente desacelerada.
      const e = state.intro * state.intro * (3 - 2 * state.intro);
      forest.scale.setScalar(Math.max(0.001, state.scale * e));
    } else {
      // Quem faz a clareira sumir agora é a dissolução; o encolhimento é só
      // um empurrãozinho de perspectiva. Os dois juntos, como era antes,
      // davam a impressão de que a cena tinha sido sugada para um ralo.
      forest.scale.setScalar(state.scale * (1 - state.warp * 0.14));
    }
    forest.rotation.y = state.spin;
    forest.position.y = shared.uOrigin.value.y - state.warp * 0.35;
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
window.floresta = {
  // cena
  forest, room, roomMesh, sky, constelacao, space, emergence, buracos, shell, tide,
  pirilampos, cardume,
  butterflies, auraFireflies, blessedFireflies, body, bodyGrowth, seeds,
  hands, wristMenu, magic,
  // estado
  state, shared, passos, renderer, camera, orbit,
  // ações
  cyclePalette, toggleTrip, reseed, toggleSky, toggleOcclusion, toggleBloom,
  toggleCalm, cycleGlow, togglePaint, bless, rescan, hatch, backToForest, enterWorld, GLOW,
  CENAS, cenaPor, montarCena, trocarCena, aplicarCena,
};

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
  shell.dispose();
  tide.dispose();
  pirilampos.dispose();
  buracos.dispose();
  hands.dispose();
  wristMenu.dispose();
  forest.dispose();
  room.dispose();
  interaction.dispose();
  disposeMaterials();
  audio.stop();
});
