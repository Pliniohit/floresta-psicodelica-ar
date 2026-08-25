import {
  ShaderMaterial, Vector3, DoubleSide, FrontSide, BackSide,
  AdditiveBlending, NormalBlending,
} from '../../vendor/three/three.module.min.js';
import { NOISE, PALETTE, SWAY, VERT_HEAD, VERT_EMIT, FRAG_HEAD, FRAG_FADE } from './lib.js';

/**
 * Um único conjunto de uniforms compartilhado por todos os materiais.
 * Cada material recebe as MESMAS referências de objeto, então mexer em
 * `shared.uTime.value` uma vez propaga para a floresta inteira.
 */
export const shared = {
  uTime:   { value: 0 },
  uTrip:   { value: 0.35 },
  uMagic:  { value: 0.35 },   // 0 = mata realista, 1 = encantada
  uBiome:  { value: 0 },      // 0 clareira, 1 fogo, 2 água
  uCalm:   { value: 0.45 },   // amortecedor de cintilação; 0 = sem oscilação
  uSway:   { value: 0.010 },
  uPulse:  { value: 0 },
  uOrigin: { value: new Vector3() },
  uPalA:   { value: new Vector3(0.5, 0.5, 0.5) },
  uPalB:   { value: new Vector3(0.5, 0.5, 0.5) },
  uPalC:   { value: new Vector3(1.0, 1.0, 1.0) },
  uPalD:   { value: new Vector3(0.0, 0.33, 0.67) },
};

const VS_PRELUDE = NOISE + PALETTE + SWAY + VERT_HEAD + VERT_EMIT;
const FS_PRELUDE = NOISE + PALETTE + FRAG_HEAD;

const registry = [];

function make(name, { vert, frag, uniforms = {}, ...opts }) {
  const m = new ShaderMaterial({
    vertexShader: VS_PRELUDE + vert,
    fragmentShader: FS_PRELUDE + frag,
    uniforms: { ...shared, ...uniforms },
    side: FrontSide,
    ...opts,
  });
  m.name = name;
  registry.push(m);
  return m;
}

/** Raiz da instância em mundo + semente estável derivada dela. */
const ROOT_AND_SEED = /* glsl */ `
  mat4 im = instMatrix();
  vec3 root = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = fract(sin(root.x * 12.9898 + root.z * 78.233) * 43758.5453);
`;

// ---------------------------------------------------------------------------
// TRONCO — fibras helicoidais torcidas por ruído, com pulsos de luz subindo.
// ---------------------------------------------------------------------------
export const barkMaterial = make('casca', {
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(sway(position, root, 1.0), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float h = vLocal.y;
      float twist = fbm2(vec3(vLocal.xz * 5.5, h * 1.1 + uTime * 0.06));
      float fiber = sin(atan(vLocal.z, vLocal.x) * 6.0 + twist * 7.0 + h * 3.2);
      fiber = smoothstep(-0.25, 0.85, fiber);

      // seiva luminosa viajando da raiz para a copa
      float up = fract(h * 0.20 - uTime * 0.07 + vSeed);
      float sap = pow(1.0 - abs(up * 2.0 - 1.0), 6.0);

      vec3 casca = barkColor(vSeed * 3.1 + twist * 0.25);
      casca = mix(casca * 0.55, casca * 1.15, fiber);   // fibra escurece o sulco

      float t = h * 0.10 + twist * 0.34 + uTime * 0.035 + vSeed;
      vec3 col = enchant(casca, t, 0.45);
      // A seiva continua vindo da paleta: é o elemento mágico do tronco.
      col += palette(t + 0.35) * damp(sap, 0.35) * (0.34 + uTrip * 0.7 + uPulse * 0.5);
      col *= 0.45 + 0.75 * wrapLight(vNormalW);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// COPA — massas de cor deformadas por domain warping, com brilho de borda.
// ---------------------------------------------------------------------------
export const canopyMaterial = make('copa', {
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      // a copa respira além de balançar
      float breathe = 1.0 + sin(uTime * 0.35 + root.x + root.z) * 0.030 * (0.4 + uTrip);
      emit(sway(position * breathe, root, 1.0), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      vec3 q = vLocal * 1.7 + vec3(0.0, uTime * 0.045, 0.0);
      float warp = vnoise(q * 0.7 + uTime * 0.035);
      float n = fbm2(q + warp * 1.5);
      float cells = smoothstep(0.30, 0.66, n);

      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.5);

      // Duas folhagens por árvore, misturadas pelas manchas: dá profundidade
      // sem precisar de mais geometria.
      vec3 folha = mix(
        leafColor(vSeed * 2.7),
        leafColor(vSeed * 2.7 + 0.22),
        cells);
      folha *= 0.72 + 0.5 * n;

      float t = n * 0.85 + vSeed * 0.4 + uTime * 0.045;
      vec3 col = enchant(folha, t, 0.55);
      col += palette(t + 0.5) * rim * (0.22 + uTrip * 0.55 + uPulse * 0.4);
      col *= 0.5 + 0.65 * wrapLight(vNormalW);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// COGUMELO: caule liso com anéis lentos.
// ---------------------------------------------------------------------------
export const stemMaterial = make('caule', {
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(sway(position, root, 1.6), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float h = vLocal.y;
      float rings = sin(h * 9.0 - uTime * 0.30 + vSeed * 6.28) * 0.5 + 0.5;
      vec3 caule = mix(vec3(0.78, 0.74, 0.64), vec3(0.55, 0.50, 0.42), vSeed);
      caule *= 0.78 + 0.28 * rings;

      float t = h * 0.35 + vSeed + uTime * 0.03;
      vec3 col = enchant(caule, t, 0.35);
      col *= 0.5 + 0.7 * wrapLight(vNormalW);
      col += palette(t + 0.4) * uPulse * 0.4;
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// COGUMELO: chapéu com anéis concêntricos girando + manchas bioluminescentes.
// ---------------------------------------------------------------------------
export const capMaterial = make('chapeu', {
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(sway(position, root, 1.6), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float r = length(vLocal.xz);
      float a = atan(vLocal.z, vLocal.x);

      float rings  = sin(r * 10.0 - uTime * 0.30 + vSeed * 6.28) * 0.5 + 0.5;
      float spokes = sin(a * 6.0 + uTime * 0.12 + vSeed * 10.0) * 0.5 + 0.5;
      float spots  = smoothstep(0.60, 0.78, vnoise(vLocal * 9.0 + vSeed * 30.0));

      vec3 chapeu = capColor(vSeed * 4.3);
      chapeu *= 0.80 + 0.30 * (rings * 0.5 + spokes * 0.5);
      // Manchas claras, como amanita — e é nelas que mora a luz.
      chapeu = mix(chapeu, vec3(0.93, 0.90, 0.82), spots * 0.85);

      float t = r * 1.3 + rings * 0.25 + uTime * 0.05 + vSeed;
      vec3 col = enchant(chapeu, t, 0.40);
      col += palette(t + 0.5) * spots * (0.26 + uTrip * 0.7 + uPulse * 0.6);
      col *= 0.55 + 0.65 * wrapLight(vNormalW);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// FLORES — pétalas com cor natural e um miolo mais claro.
// ---------------------------------------------------------------------------
export const flowerMaterial = make('flores', {
  side: DoubleSide,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(sway(position, root, 3.0), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float h = clamp(vLocal.y / 0.34, 0.0, 1.0);
      // Abaixo da corola é haste; acima, pétala.
      vec3 haste = leafColor(vSeed * 5.1) * 0.7;
      vec3 petala = petalColor(vSeed * 7.3);
      float r = length(vLocal.xz);
      petala = mix(vec3(0.95, 0.90, 0.66), petala, smoothstep(0.012, 0.03, r));

      vec3 base = mix(haste, petala, smoothstep(0.82, 0.95, h));
      float t = vSeed + uTime * 0.04;
      vec3 col = enchant(base, t, 0.45);
      col *= 0.55 + 0.6 * wrapLight(vNormalW);
      col += palette(t + 0.5) * uPulse * 0.4 * h;
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// CASULO — seda translúcida com anéis. Pulsa: tem algo vivo lá dentro, e é
// esse pulso que convida a tocar.
// ---------------------------------------------------------------------------
export const cocoonMaterial = make('casulo', {
  uniforms: { uReady: { value: 0 } },   // sobe quando está prestes a abrir
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      // Pende e balança: o fio é fino, qualquer brisa mexe.
      float t = uTime * 0.45 + vSeed * 6.28;
      vec3 p = position;
      float pendura = clamp(-position.y / 0.22, 0.0, 1.0);
      p.x += sin(t) * 0.012 * pendura;
      p.z += cos(t * 0.8) * 0.010 * pendura;
      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uReady;
    void main(){
      ${FRAG_FADE}
      float aneis = sin(vLocal.y * 22.0) * 0.5 + 0.5;
      vec3 seda = mix(vec3(0.62, 0.55, 0.38), vec3(0.80, 0.74, 0.56), aneis);

      // Batimento interno: duas senóides, acelerando conforme uReady sobe.
      float bat = 0.62 + 0.26 * sin(uTime * (0.8 + uReady * 1.2) + vSeed * 12.0);
      bat *= 0.75 + 0.25 * sin(uTime * 0.45 + vSeed * 5.0);
      float vida = damp(bat, 0.55);

      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float aro = pow(1.0 - abs(dot(N, V)), 2.0);

      float t = vSeed + uTime * 0.03;
      vec3 col = enchant(seda, t, 0.3) * (0.5 + 0.5 * wrapLight(vNormalW));
      // Aceso por dentro: é o único objeto da cena que PRECISA ser achado,
      // então ele é o mais luminoso, com folga.
      col += palette(t + 0.3) * (0.9 + vida * 0.7 + uReady * 1.4);
      col += vec3(1.0, 0.92, 0.72) * aro * (0.7 + vida * 0.5);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// HALO DO CASULO — casca luminosa em volta, visível do outro lado do cômodo.
// Sem ela o casulo se perde entre as folhas, e ele é o objeto que abre o
// próximo mundo: não pode depender de sorte para ser encontrado.
// ---------------------------------------------------------------------------
export const cocoonGlowMaterial = make('halo-do-casulo', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      float t = uTime * 0.45 + vSeed * 6.28;
      vec3 p = position;
      float pendura = clamp(-position.y / 0.22, 0.0, 1.0);
      p.x += sin(t) * 0.012 * pendura;
      p.z += cos(t * 0.8) * 0.010 * pendura;
      // Respira devagar, sem piscar.
      p += normal * (0.055 + 0.012 * sin(uTime * 0.35 + vSeed * 5.0));
      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float aro = pow(1.0 - abs(dot(N, V)), 1.6);
      float respira = damp(0.72 + 0.28 * sin(uTime * 0.35 + vSeed * 5.0), 0.72);
      vec3 col = mix(palette(uTime * 0.04 + vSeed), vec3(1.0, 0.93, 0.74), 0.45);
      gl_FragColor = vec4(col * aro * respira * 1.5, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// CRISTAL — iridescência por face, aditivo para brilhar sobre o passthrough.
// ---------------------------------------------------------------------------
export const crystalMaterial = make('cristal', {
  blending: AdditiveBlending,
  depthWrite: false,
  transparent: true,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      float bob = sin(uTime * 0.55 + vSeed * 6.28) * 0.025;
      vec3 p = position + vec3(0.0, bob, 0.0);
      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - abs(dot(N, V)), 2.0);
      float t = N.y * 0.6 + N.x * 0.3 + uTime * 0.16 + vSeed;
      vec3 col = palette(t) * (0.35 + fres * 1.5);
      col += palette(t + 0.5) * uPulse * 0.8;
      gl_FragColor = vec4(trippy(col) * vFade, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// SOLO — tapete de micélio translúcido, recortado no formato do piso mapeado.
// Deixa o chão real aparecer entre os veios, que é o que faz a floresta parecer
// plantada na sua sala. Não há atenuação radial: a borda é o próprio polígono
// do cômodo, e o padrão de veios já dissolve a superfície organicamente.
// ---------------------------------------------------------------------------
export const groundMaterial = make('micelio', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      vec2 d = vWorld.xz - uOrigin.xz;
      float r = length(d);

      float n = fbm2(vec3(d * 0.55, uTime * 0.04));
      float veins = 1.0 - smoothstep(0.0, 0.085, abs(n - 0.5));  // isolinha do ruído
      float wave  = ripple(0.45, 1.3);
      float shock = smoothstep(0.10, 0.0, abs(r - uPulse * 6.0)) * uPulse;

      float a = (veins * (0.30 + 0.45 * wave) + shock * 0.8) * vFade;
      if (a <= 0.004) discard;

      vec3 col = palette(r * 0.15 + n * 0.5 + uTime * 0.05);
      col += palette(r * 0.15 + 0.5) * shock;
      gl_FragColor = vec4(trippy(col) * (1.0 + uTrip), a);
    }
  `,
});

// ---------------------------------------------------------------------------
// SAMAMBAIAS / CAPIM — lâminas finas, balanço bem mais solto que as árvores.
// ---------------------------------------------------------------------------
export const grassMaterial = make('capim', {
  side: DoubleSide,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(sway(position, root, 5.0), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float h = clamp(vLocal.y / 0.42, 0.0, 1.0);
      // Amplitude baixa de propósito: são mais de mil lâminas finas na tela,
      // e contraste alto nelas vira cintilação com qualquer movimento.
      float scan = damp(sin(h * 4.0 - uTime * 0.45 + vSeed * 6.28) * 0.5 + 0.5, 0.5);
      vec3 verde = leafColor(vSeed * 5.7);
      verde = mix(verde * 0.45, verde * 1.25, h);   // base na sombra, ponta ao sol

      float t = h * 0.5 + vSeed + uTime * 0.06;
      vec3 col = enchant(verde, t, 0.5);
      col += palette(t + 0.5) * scan * h * (0.08 + uTrip * 0.22 + uPulse * 0.3);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// ESPOROS — partículas aditivas subindo em espiral.
// ---------------------------------------------------------------------------
export const sporeMaterial = make('esporos', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: { uSize: { value: 9.0 } },
  vert: /* glsl */ `
    uniform float uSize;
    attribute float aSeed;
    attribute float aSpeed;
    void main(){
      vSeed = aSeed;
      float life = fract(position.y * 0.09 + uTime * aSpeed * 0.026);
      float ang  = aSeed * 6.28318 + life * 3.4;
      float rad  = 0.25 + aSeed * 0.5;
      vec3 p = position;
      p.y = mix(0.05, 3.6, life);
      p.x += cos(ang) * rad;
      p.z += sin(ang) * rad;

      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      vLocal = p;
      vNormalW = vec3(0.0, 1.0, 0.0);
      vec4 mv = viewMatrix * world;
      // some no nascimento e na morte para não "piscar" ao reciclar
      vFade = sin(life * 3.14159) * clamp(1.0 - (-mv.z - 6.0) / 10.0, 0.0, 1.0);
      gl_PointSize = uSize * (1.0 + uTrip) / max(-mv.z, 0.35);
      gl_Position = projectionMatrix * mv;
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec2 uv = gl_PointCoord - 0.5;
      float d = dot(uv, uv);
      if (d > 0.25) discard;
      float soft = pow(1.0 - d * 4.0, 2.0);
      vec3 col = palette(vSeed + uTime * 0.09);
      gl_FragColor = vec4(trippy(col) * soft * vFade * (0.8 + uPulse), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// ORBES — vaga-lumes que orbitam devagar acima do dossel.
// ---------------------------------------------------------------------------
export const orbMaterial = make('orbes', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      float t = uTime * (0.13 + vSeed * 0.18);
      vec3 p = position + vec3(sin(t * 1.7) * 0.22, sin(t * 1.1) * 0.16, cos(t * 1.3) * 0.22);
      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float core = pow(max(dot(N, V), 0.0), 1.5);
      vec3 col = palette(vSeed + uTime * 0.12);
      gl_FragColor = vec4(trippy(col) * (0.25 + core * 1.6) * vFade, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// CÉU — cúpula invertida em volta do usuário.
//
// Em passthrough um céu opaco cobriria a sala inteira e mataria a AR. Então a
// opacidade sobe com a altura do olhar: à frente você continua vendo o cômodo
// real, e o céu só toma conta quando você levanta a cabeça. O teto vira
// abertura em vez de superfície.
// ---------------------------------------------------------------------------
export const skyMaterial = make('ceu', {
  transparent: true,
  depthWrite: false,
  // Sem teste de profundidade, e desenhado ANTES do oclusor. Se o céu fosse
  // testado, o teto real — que agora escreve profundidade — o esconderia por
  // completo. Pintando antes, o teto deixa de ser superfície e vira abertura.
  depthTest: false,
  side: BackSide,
  uniforms: {
    uHorizon: { value: 0.10 },   // seno da elevação onde o céu começa a aparecer
    uFull: { value: 0.62 },      // onde já está cheio
    uSky: { value: 1.0 },        // liga/desliga com transição
    uSpace: { value: 0.0 },      // 0 céu sobre a sala, 1 espaço profundo
  },
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uHorizon;
    uniform float uFull;
    uniform float uSky;
    uniform float uSpace;

    void main(){
      vec3 dir = normalize(vWorld - cameraPosition);
      float up = dir.y;

      // Nada abaixo da linha: ali está a sala de verdade.
      float veu = smoothstep(uHorizon, uFull, up) * uSky;
      if (veu <= 0.004) discard;

      // Nebulosa: fbm com domain warping, girando devagar.
      vec3 q = dir * 2.6;
      float warp = vnoise(q * 0.8 + uTime * 0.02);
      float neb = fbm3(q + warp * 1.6 + vec3(uTime * 0.012, 0.0, uTime * 0.008));

      // Faixas de aurora atravessando o zênite.
      float faixa = sin(dir.x * 3.1 + neb * 5.0 + uTime * 0.11)
                  * sin(dir.z * 2.3 - neb * 4.0 - uTime * 0.085);
      faixa = pow(max(faixa, 0.0), 2.2);

      // Estrelas com borda suave: as de borda dura piscavam a cada movimento
      // de cabeça, porque a célula de direção mudava de golpe.
      float estrela = softStar(dir, 170.0, 0.9988);
      estrela *= smoothstep(0.25, 0.7, up);

      float t = neb * 0.9 + up * 0.35 + uTime * 0.03;

      // No espaço a nebulosa recua e as estrelas dominam: um fundo claro
      // demais engoliria os planetas, que são o que interessa lá.
      float nebK = mix(1.0, 0.28, uSpace);
      vec3 col = palette(t) * (0.16 + neb * 0.5) * nebK;
      col += palette(t + 0.42) * faixa * (0.55 + uTrip * 1.0) * nebK;
      col += vec3(estrela) * (0.7 + uTrip * 0.8) * (1.0 + uSpace * 2.2);
      col += palette(t + 0.5) * uPulse * 0.35 * neb;

      // Em espaço profundo as estrelas aparecem em todas as direções.
      float estrelaBaixa = softStar(dir, 195.0, 0.9990) * uSpace;
      col += vec3(estrelaBaixa) * 1.4;

      gl_FragColor = vec4(trippy(col) * (1.0 + uTrip * 0.6), veu);
    }
  `,
});

// ---------------------------------------------------------------------------
// VIDA NO CÉU — medusas à deriva. Mesmo visual dos orbes, mas sem teste de
// profundidade: elas moram além do teto e o oclusor as apagaria.
// ---------------------------------------------------------------------------
export const skyLifeMaterial = make('medusas', {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      // Dominada pela borda: o miolo quase não acende, o que faz a forma ler
      // como sino translúcido em vez de bola sólida.
      float rim = pow(1.0 - abs(dot(N, V)), 2.6);
      float core = pow(max(dot(N, V), 0.0), 2.5);

      // Tentáculos: o corpo apaga para baixo, e umas listras descem dele.
      float baixo = smoothstep(-0.9, 0.25, N.y);
      float franja = 0.5 + 0.5 * sin(atan(N.z, N.x) * 7.0 + uTime * 0.20);
      float cauda = (1.0 - baixo) * franja * 0.5;

      vec3 col = palette(vSeed * 0.5 + uTime * 0.07);
      float brilho = (rim * 1.35 + core * 0.10) * (0.35 + baixo * 0.65) + cauda * 0.35;
      gl_FragColor = vec4(trippy(col) * brilho, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// PLANETAS — faixas, crateras e gelo escolhidos pela semente da instância, e
// um terminador para o corpo ler como esfera iluminada em vez de bola pintada.
// ---------------------------------------------------------------------------
export const planetMaterial = make('planetas', {
  uniforms: {
    uWarp: { value: 0 },
    uTint: { value: new Vector3(1, 1, 1) },   // cor do bioma que este planeta abriga
    uGrow: { value: 0 },                      // 0..1 conforme cresce na sua mão
  },
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uWarp;
    uniform vec3 uTint;
    uniform float uGrow;

    void main(){
      vec3 N = normalize(vNormalW);
      vec3 P = normalize(vLocal);

      float tipo = fract(vSeed * 3.7);

      // Gasoso: faixas horizontais onduladas pelo ruído.
      float faixa = sin(P.y * 14.0 + fbm2(P * 3.0 + uTime * 0.03) * 5.0);
      vec3 gasoso = mix(vec3(0.62, 0.48, 0.32), vec3(0.86, 0.78, 0.62), faixa * 0.5 + 0.5);
      gasoso = mix(gasoso, vec3(0.72, 0.42, 0.30), smoothstep(0.55, 0.95, faixa));

      // Rochoso: manchas de ruído, continentes e mares.
      float terra = fbm3(P * 3.2 + vSeed * 10.0);
      vec3 rochoso = mix(vec3(0.16, 0.24, 0.38), vec3(0.34, 0.42, 0.24), smoothstep(0.45, 0.58, terra));
      rochoso = mix(rochoso, vec3(0.60, 0.56, 0.46), smoothstep(0.66, 0.78, terra));

      // Gelado: quase branco com fendas azuis.
      float fenda = smoothstep(0.46, 0.5, abs(fbm2(P * 5.0 + vSeed * 3.0) - 0.5));
      vec3 gelado = mix(vec3(0.52, 0.66, 0.78), vec3(0.88, 0.93, 0.97), fenda);

      vec3 base = tipo < 0.4 ? gasoso : (tipo < 0.78 ? rochoso : gelado);
      // O bioma que o planeta guarda tinge a superfície: é assim que se sabe,
      // olhando, para onde ele leva.
      base = mix(base, base * 0.35 + uTint * 0.95, 0.62);

      // Terminador: luz vinda de cima e do lado, com penumbra larga.
      float luz = dot(N, normalize(vec3(0.45, 0.7, 0.35)));
      float dia = smoothstep(-0.35, 0.55, luz);

      // Ambiente generoso de propósito: um planeta realista fica invisível no
      // lado escuro, e aqui ele precisa ser encontrado e pego.
      vec3 col = base * (0.30 + dia * 0.95);
      // Atmosfera na borda do lado iluminado.
      vec3 V = normalize(cameraPosition - vWorld);
      float aro = pow(1.0 - abs(dot(N, V)), 3.0);
      col += base * aro * (0.35 + dia * 0.8);
      col += palette(vSeed + uTime * 0.02) * aro * 0.35 * uMagic;

      // Perto de abrir, o planeta acende pelas bordas: o aviso de que
      // aumentar mais um pouco atravessa.
      col += uTint * aro * uGrow * 2.5;
      col += uTint * uGrow * uGrow * 0.6;

      gl_FragColor = vec4(filmic(col) * uWarp, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// RASTRO — pontos aditivos deixados pela borboleta que sobe.
// ---------------------------------------------------------------------------
export const trailMaterial = make('rastro', {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
  uniforms: { uSize: { value: 26.0 } },
  vert: /* glsl */ `
    uniform float uSize;
    attribute float aAge;    // 0 recém-nascido .. 1 prestes a sumir
    void main(){
      vSeed = aAge;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz; vLocal = position; vNormalW = vec3(0.0, 1.0, 0.0);
      vec4 mv = viewMatrix * world;
      vFade = 1.0 - aAge;
      gl_PointSize = uSize * (1.0 - aAge * 0.7) / max(-mv.z, 0.3);
      gl_Position = projectionMatrix * mv;
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec2 uv = gl_PointCoord - 0.5;
      float d = dot(uv, uv);
      if (d > 0.25) discard;
      float suave = pow(1.0 - d * 4.0, 2.0);
      vec3 col = palette(0.15 + vSeed * 0.4 + uTime * 0.05);
      gl_FragColor = vec4(col * suave * vFade * vFade * 2.4, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// VARREDURA — a malha do cômodo revelada durante o escaneamento. Silhueta por
// fresnel (sem coordenadas baricêntricas não há wireframe de verdade) mais um
// plano de varredura subindo, que é o que dá a leitura de "está lendo agora".
// ---------------------------------------------------------------------------
export const scanMaterial = make('varredura', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: AdditiveBlending,
  uniforms: { uSweep: { value: 0 }, uReveal: { value: 0 } },
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uSweep;    // altura do plano de varredura, em metros
    uniform float uReveal;   // 0..1, quanto da sala já apareceu
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - abs(dot(N, V)), 2.2);

      // linha de varredura
      float band = exp(-abs(vWorld.y - uSweep) * 7.0);

      // grade fina ancorada em mundo: dá escala à superfície
      vec3 g = abs(fract(vWorld * 4.0) - 0.5);
      float grid = smoothstep(0.46, 0.5, max(max(g.x, g.y), g.z));

      float a = (rim * 0.55 + band * 0.9 + grid * 0.22) * uReveal;
      if (a <= 0.004) discard;

      vec3 col = palette(vWorld.y * 0.2 + uTime * 0.12);
      gl_FragColor = vec4(trippy(col) * (0.8 + band * 2.2), a);
    }
  `,
});

// ---------------------------------------------------------------------------
// BORBOLETAS — as asas batem no vertex shader, girando em torno do eixo do
// corpo. `aSpan` (0 na dobradiça, 1 na ponta) faz a asa flexionar em vez de
// girar rígida, que é o que separa borboleta de placa articulada.
// ---------------------------------------------------------------------------
export const butterflyMaterial = make('borboletas', {
  transparent: true,
  side: DoubleSide,
  depthWrite: false,
  vert: /* glsl */ `
    attribute float aWing;   // -1 esquerda, +1 direita, 0 corpo
    attribute float aSpan;   // 0 dobradiça .. 1 ponta
    varying float vSpan;
    varying float vWing;

    void main(){
      ${ROOT_AND_SEED}
      vSpan = aSpan;
      vWing = aWing;

      // Frequência entre 3 e 4,5 Hz. Menos que a borboleta real, que passa de
      // 8, porque em VR uma asa a 8 Hz na periferia lê como tremulação.
      float freq = (1.7 + vSeed * 0.8) * mix(0.55, 1.0, uCalm);
      float fase = fract(uTime * freq + vSeed * 7.0);

      // Perfil ASSIMÉTRICO: sobe em 35% do ciclo e desce nos 65% restantes.
      // Senóide pura dá vaivém de metrônomo; borboleta bate e deixa cair.
      float sobe = smoothstep(0.0, 1.0, fase / 0.35);
      float desce = 1.0 - smoothstep(0.0, 1.0, (fase - 0.35) / 0.65);
      float perfil = fase < 0.35 ? sobe : desce;

      // Plana de vez em quando: sem as pausas o voo fica mecânico.
      float planando = smoothstep(0.25, 0.75, sin(uTime * 0.17 + vSeed * 9.0));
      perfil = mix(perfil, 0.42, planando * 0.92);

      // De 14 graus abaixo da horizontal a 77 acima — quase se tocando em cima.
      float ang = mix(-0.25, 1.35, perfil) * aSpan * abs(aWing);

      // Rotação em torno de Y, o eixo do CORPO: é isso que levanta a asa.
      // Em torno de Z ela apenas varria dentro do próprio plano, que foi por
      // que o voo não parecia batida de asa.
      float a = ang * sign(aWing);
      float c = cos(a), sn = sin(a);
      vec3 p = position;
      float x = p.x, z = p.z;
      p.x = x * c + z * sn;
      p.z = -x * sn + z * c;

      // A normal precisa acompanhar, senão a asa levantada continua sombreada
      // como se estivesse deitada.
      vec3 nrm = normal;
      float nx = nrm.x, nz = nrm.z;
      nrm.x = nx * c + nz * sn;
      nrm.z = -nx * sn + nz * c;

      emit(p, nrm);
    }
  `,
  frag: /* glsl */ `
    varying float vSpan;
    varying float vWing;
    void main(){
      // Três espécies reais em vez da paleta: monarca, morpho azul e branca.
      float esp = fract(vSeed * 5.9);
      vec3 monarca = mix(vec3(0.82, 0.34, 0.05), vec3(0.95, 0.58, 0.12), vSpan);
      vec3 morpho  = mix(vec3(0.10, 0.22, 0.62), vec3(0.32, 0.60, 0.92), vSpan);
      vec3 branca  = mix(vec3(0.86, 0.84, 0.78), vec3(0.98, 0.97, 0.92), vSpan);
      vec3 asa = esp < 0.4 ? monarca : (esp < 0.72 ? morpho : branca);

      // Nervuras escuras, como as veias da asa.
      float nervura = smoothstep(0.40, 0.5, abs(fract(vSpan * 3.2) - 0.5));
      asa = mix(asa * 0.42, asa, nervura);

      // Borda escura com pontos claros na ponta — o desenho que quase toda
      // borboleta tem, e o que faz a silhueta ler como asa e não como pétala.
      float borda = smoothstep(0.72, 0.98, vSpan);
      asa = mix(asa, vec3(0.08, 0.06, 0.05), borda * 0.75);
      float pinta = step(0.62, fract(vSpan * 9.0 + vSeed * 13.0)) * borda;
      asa = mix(asa, vec3(0.95, 0.94, 0.90), pinta * 0.8);

      // Corpo escuro.
      asa = mix(vec3(0.10, 0.08, 0.07), asa, step(0.02, abs(vWing)));

      float t = vSeed + uTime * 0.04;
      vec3 col = enchant(asa, t, 0.30);
      col *= 0.62 + 0.55 * wrapLight(vNormalW);

      gl_FragColor = vec4(filmic(col), (0.82 + 0.18 * vSpan) * vFade);
    }
  `,
});

// ---------------------------------------------------------------------------
// VAGA-LUMES — pontinhos que acendem e apagam fora de fase.
// ---------------------------------------------------------------------------
export const fireflyMaterial = make('vagalumes', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float core = pow(max(dot(N, V), 0.0), 1.1);

      // Respiração irregular, não pisca-pisca: duas senóides incomensuráveis
      // para não virar metrônomo, com piso alto para o contraste ficar baixo.
      // Ia de 0,08 a 1,0 — doze vezes de brilho, cintilação demais.
      float osc = 0.78
        + 0.14 * sin(uTime * 0.55 + vSeed * 31.0)
        + 0.08 * sin(uTime * 0.95 + vSeed * 17.0);
      float pisca = damp(osc, 0.78);

      vec3 col = palette(0.12 + vSeed * 0.1 + uTime * 0.02);
      gl_FragColor = vec4(trippy(col) * core * pisca * 1.7 * vFade, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// MÃOS — juntas rastreadas desenhadas como contas luminosas. Aditivo, porque
// sobre o passthrough a mão precisa ler como energia, não como plástico.
// ---------------------------------------------------------------------------
export const handMaterial = make('maos', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: { uGlow: { value: 1.0 } },
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uGlow;
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float core = pow(max(dot(N, V), 0.0), 1.2);
      float rim  = pow(1.0 - abs(dot(N, V)), 2.0);
      vec3 col = palette(vSeed * 0.4 + uTime * 0.15);
      gl_FragColor = vec4(trippy(col) * (0.35 + core * 1.3 + rim * 0.9) * uGlow, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// REALCE — contorno pulsante do objeto que a mão está prestes a pegar.
// ---------------------------------------------------------------------------
export const highlightMaterial = make('realce', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      // infla ao longo da normal para virar uma casca em volta do objeto
      vec3 p = position + normal * (0.035 + sin(uTime * 1.1) * 0.012);
      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - abs(dot(N, V)), 1.6);
      vec3 col = palette(uTime * 0.25 + 0.5);
      gl_FragColor = vec4(trippy(col) * rim * 1.8, 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// RETÍCULO — anel de posicionamento antes de plantar.
// ---------------------------------------------------------------------------
export const reticleMaterial = make('reticulo', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      mat4 im = instMatrix();
      vec4 world = modelMatrix * im * vec4(position, 1.0);
      vWorld = world.xyz; vLocal = position; vNormalW = vec3(0.0, 1.0, 0.0);
      vFade = 1.0;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  frag: /* glsl */ `
    void main(){
      float r = length(vLocal.xz);
      float a = atan(vLocal.z, vLocal.x);
      float dashes = smoothstep(0.30, 0.42, fract(a * 3.8 + uTime * 0.12));
      float ring = smoothstep(0.055, 0.0, abs(r - 0.13));
      float halo = smoothstep(0.16, 0.0, r) * 0.35;
      float alpha = ring * (0.35 + 0.65 * dashes) + halo;
      if (alpha <= 0.004) discard;
      gl_FragColor = vec4(palette(uTime * 0.2) * 1.6, alpha);
    }
  `,
});

/** Todos os materiais criados, para descarte no fim da sessão. */
export const allMaterials = registry;

export function disposeMaterials() {
  for (const m of registry) m.dispose();
}
