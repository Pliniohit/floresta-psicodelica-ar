// Blocos GLSL compartilhados por todos os materiais da floresta.
// Tudo é procedural: nenhuma imagem é carregada, as "texturas" nascem
// de ruído + paletas de cosseno avaliadas a cada frame.

/** Hash e ruído de valor 3D. Barato o bastante para rodar por fragmento no Quest. */
export const NOISE = /* glsl */ `
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

// Duas oitavas: o suficiente para quebrar a regularidade sem pesar no fill rate.
float fbm2(vec3 p){
  return 0.62 * vnoise(p) + 0.31 * vnoise(p * 2.03 + 17.1);
}

// Três oitavas, reservado para superfícies pequenas na tela.
float fbm3(vec3 p){
  return 0.53 * vnoise(p) + 0.27 * vnoise(p * 2.03 + 17.1) + 0.13 * vnoise(p * 4.11 + 5.7);
}
`;

/**
 * Paleta de cosseno (Inigo Quilez): cor(t) = A + B * cos(2pi * (C*t + D)).
 * Os quatro vetores são uniforms, então trocar de paleta é interpolar 12 floats.
 */
export const PALETTE = /* glsl */ `
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform vec3 uPalD;
uniform float uTrip;   // 0 = calmo, 1 = viagem completa
uniform float uTime;

vec3 palette(float t){
  return uPalA + uPalB * cos(6.28318530718 * (uPalC * t + uPalD));
}

// Empurra a saturação e o contraste conforme o modo "viagem".
vec3 trippy(vec3 c){
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, mix(vec3(lum), c, 1.9), uTrip * 0.85);
}

/**
 * Roll-off exponencial nas altas. Sem isto, somar brilho de borda a uma paleta
 * que já chega perto de 1.0 satura os três canais no mesmo ponto e a superfície
 * vira branco chapado — exatamente o que a gente NÃO quer numa cena psicodélica.
 * Aqui o canal mais alto desacelera antes de encostar no teto e a cor sobrevive.
 */
vec3 filmic(vec3 c){
  return 1.0 - exp(-max(c, 0.0) * 1.35);
}
`;

/**
 * Balanço no vento aplicado em espaço de objeto, ANTES de instanceMatrix,
 * para que árvore e copa (malhas separadas) permaneçam soldadas: as duas
 * derivam o deslocamento da mesma altura y e da mesma raiz em mundo.
 */
export const SWAY = /* glsl */ `
uniform float uSway;

vec3 sway(vec3 pos, vec3 root, float rigidity){
  float phase = root.x * 0.73 + root.z * 0.91;
  float t = uTime * (0.85 + uTrip * 0.5);
  float h = max(pos.y, 0.0);
  float amp = h * h * uSway * rigidity;
  pos.x += (sin(t * 1.10 + phase) * 0.62 + sin(t * 1.93 + phase * 1.7) * 0.38) * amp;
  pos.z += (cos(t * 0.94 + phase * 1.3) * 0.62 + cos(t * 1.71 + phase) * 0.38) * amp * 0.8;
  return pos;
}
`;

/**
 * Cabeçalho comum do vertex shader. Resolve instancing na mão porque
 * usamos ShaderMaterial cru — o three.js declara `instanceMatrix` e o
 * define USE_INSTANCING sozinho quando o objeto é um InstancedMesh.
 */
export const VERT_HEAD = /* glsl */ `
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormalW;
varying float vFade;
varying float vSeed;

mat4 instMatrix(){
  #ifdef USE_INSTANCING
    return instanceMatrix;
  #else
    return mat4(1.0);
  #endif
}
`;

/** Emite gl_Position e todos os varyings. `local` já veio deslocado pelo vento. */
export const VERT_EMIT = /* glsl */ `
void emit(vec3 local, vec3 nrm){
  mat4 im = instMatrix();
  vec4 world = modelMatrix * im * vec4(local, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormalW = normalize(mat3(modelMatrix) * mat3(im) * nrm);
  vec4 mv = viewMatrix * world;
  vFade = clamp(1.0 - (-mv.z - 6.0) / 10.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

/** Cabeçalho comum do fragment shader. */
export const FRAG_HEAD = /* glsl */ `
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormalW;
varying float vFade;
varying float vSeed;

uniform vec3 uOrigin;   // base da floresta em coordenadas de mundo
uniform float uPulse;   // 0..1, decai depois de cada interação

// Luz "envolvente" barata: dá volume às faces low poly sem custo de PBR.
float wrapLight(vec3 n){
  float d = dot(normalize(n), normalize(vec3(0.35, 0.85, 0.4)));
  return d * 0.5 + 0.5;
}

// Onda circular que sai do ponto onde a floresta foi plantada.
float ripple(float speed, float density){
  float r = length(vWorld.xz - uOrigin.xz);
  return sin(r * density - uTime * speed) * 0.5 + 0.5;
}
`;

/** Recorta o fragmento se ele estiver longe demais — evita cauda infinita em AR. */
export const FRAG_FADE = /* glsl */ `
  if (vFade <= 0.001) discard;
`;
