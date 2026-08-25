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
      float up = fract(h * 0.26 - uTime * 0.13 + vSeed);
      float sap = pow(1.0 - abs(up * 2.0 - 1.0), 6.0);

      float t = h * 0.10 + twist * 0.34 + uTime * 0.035 + vSeed;
      vec3 col = palette(t);
      col = mix(col * 0.38, col, fiber);
      col += palette(t + 0.35) * sap * (0.55 + uTrip * 1.1 + uPulse * 0.9);
      col *= 0.5 + 0.7 * wrapLight(vNormalW);
      gl_FragColor = vec4(filmic(trippy(col)), 1.0);
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
      float breathe = 1.0 + sin(uTime * 0.8 + root.x + root.z) * 0.035 * (0.4 + uTrip);
      emit(sway(position * breathe, root, 1.0), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      vec3 q = vLocal * 1.7 + vec3(0.0, uTime * 0.11, 0.0);
      float warp = vnoise(q * 0.7 + uTime * 0.08);
      float n = fbm2(q + warp * 1.5);
      float cells = smoothstep(0.30, 0.66, n);

      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.5);

      float t = n * 0.85 + vSeed * 0.4 + uTime * 0.045;
      vec3 col = palette(t);
      col = mix(col * 0.30, col * 1.18, cells);
      col += palette(t + 0.5) * rim * (0.34 + uTrip * 0.7 + uPulse * 0.5);
      col *= 0.55 + 0.6 * wrapLight(vNormalW);
      gl_FragColor = vec4(filmic(trippy(col)), 1.0);
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
      float rings = sin(h * 22.0 - uTime * 1.1 + vSeed * 6.28) * 0.5 + 0.5;
      float t = h * 0.35 + vSeed + uTime * 0.03;
      vec3 col = palette(t) * (0.55 + 0.45 * rings);
      col *= 0.5 + 0.7 * wrapLight(vNormalW);
      col += palette(t + 0.4) * uPulse * 0.6;
      gl_FragColor = vec4(filmic(trippy(col)), 1.0);
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

      float rings  = sin(r * 24.0 - uTime * 1.25 + vSeed * 6.28) * 0.5 + 0.5;
      float spokes = sin(a * 9.0 + uTime * 0.38 + vSeed * 10.0) * 0.5 + 0.5;
      float spots  = smoothstep(0.60, 0.78, vnoise(vLocal * 9.0 + vSeed * 30.0));

      float t = r * 1.3 + rings * 0.25 + uTime * 0.05 + vSeed;
      vec3 col = palette(t);
      col = mix(col * 0.45, col, rings * 0.6 + spokes * 0.4);
      col += palette(t + 0.5) * spots * (0.75 + uTrip * 1.3 + uPulse * 1.2);
      col *= 0.6 + 0.6 * wrapLight(vNormalW);
      gl_FragColor = vec4(filmic(trippy(col)), 1.0);
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
      float bob = sin(uTime * 1.2 + vSeed * 6.28) * 0.02;
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

      float n = fbm2(vec3(d * 0.55, uTime * 0.09));
      float veins = 1.0 - smoothstep(0.0, 0.085, abs(n - 0.5));  // isolinha do ruído
      float wave  = ripple(1.5, 2.4);
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
      float scan = sin(h * 9.0 - uTime * 1.6 + vSeed * 6.28) * 0.5 + 0.5;
      float t = h * 0.5 + vSeed + uTime * 0.06;
      vec3 col = palette(t);
      col *= 0.30 + 0.95 * h;                       // base escura, ponta acesa
      col += palette(t + 0.5) * scan * h * (0.22 + uTrip * 0.55 + uPulse * 0.7);
      gl_FragColor = vec4(filmic(trippy(col)), 1.0);
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
      float life = fract(position.y * 0.09 + uTime * aSpeed * 0.05);
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
      float t = uTime * (0.25 + vSeed * 0.35);
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
      float faixa = sin(dir.x * 3.1 + neb * 5.0 + uTime * 0.22)
                  * sin(dir.z * 2.3 - neb * 4.0 - uTime * 0.17);
      faixa = pow(max(faixa, 0.0), 2.2);

      // Estrelas: pontos duros num reticulado de direção.
      vec3 cel = floor(dir * 190.0);
      float estrela = step(0.9992, hash13(cel));
      estrela *= smoothstep(0.25, 0.7, up);

      float t = neb * 0.9 + up * 0.35 + uTime * 0.03;
      vec3 col = palette(t) * (0.16 + neb * 0.5);
      col += palette(t + 0.42) * faixa * (0.55 + uTrip * 1.0);
      col += vec3(estrela) * (0.7 + uTrip * 0.8);
      col += palette(t + 0.5) * uPulse * 0.35 * neb;

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
      float franja = 0.5 + 0.5 * sin(atan(N.z, N.x) * 11.0 + uTime * 1.3);
      float cauda = (1.0 - baixo) * franja * 0.5;

      vec3 col = palette(vSeed * 0.5 + uTime * 0.07);
      float brilho = (rim * 1.35 + core * 0.10) * (0.35 + baixo * 0.65) + cauda * 0.35;
      gl_FragColor = vec4(trippy(col) * brilho, 1.0);
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

      float bater = sin(uTime * (9.0 + vSeed * 5.0) + vSeed * 20.0);
      float ang = bater * 1.05 * aSpan * abs(aWing);
      float c = cos(ang), sn = sin(ang);

      vec3 p = position;
      // gira em torno de Z: a asa sobe e desce, o corpo fica parado
      float x = p.x, y = p.y;
      p.x = x * c - y * sn * sign(aWing);
      p.y = x * sn * sign(aWing) + y * c;

      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    varying float vSpan;
    varying float vWing;
    void main(){
      float t = vSeed + vSpan * 0.35 + uTime * 0.05;
      vec3 col = palette(t);

      // Nervuras e borda mais clara: leem como asa mesmo com 4 triângulos.
      float nervura = smoothstep(0.42, 0.5, abs(fract(vSpan * 3.0) - 0.5));
      col = mix(col * 0.55, col * 1.25, nervura);
      col += palette(t + 0.4) * pow(vSpan, 3.0) * 0.7;

      float alpha = 0.55 + 0.45 * vSpan;
      gl_FragColor = vec4(filmic(trippy(col)), alpha * vFade);
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

      // Piscar irregular: duas senóides incomensuráveis, então o padrão
      // demora muito a se repetir e a luz não parece metrônomo.
      float pisca = 0.45
        + 0.35 * sin(uTime * 2.3 + vSeed * 31.0)
        + 0.20 * sin(uTime * 3.7 + vSeed * 17.0);
      pisca = max(pisca, 0.08);

      vec3 col = palette(0.12 + vSeed * 0.1 + uTime * 0.02);
      gl_FragColor = vec4(trippy(col) * core * pisca * 2.2 * vFade, 1.0);
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
      vec3 p = position + normal * (0.035 + sin(uTime * 6.0) * 0.012);
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
      float dashes = step(0.35, fract(a * 3.8 + uTime * 0.35));
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
