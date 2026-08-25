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
 * CORES NATURAIS.
 *
 * Antes tudo saía da mesma paleta de cosseno, e por isso nada nunca parecia
 * mata de verdade — casca, folha e cogumelo dividiam o mesmo arco-íris. Aqui
 * cada material tem sua própria faixa realista, escolhida por semente, e a
 * paleta passa a ser só o BRILHO mágico por cima.
 *
 * "uMagic" controla a mistura: 0 é floresta realista, 1 é a encantada.
 */
vec3 pick3(vec3 a, vec3 b, vec3 c, float s){
  return s < 0.5 ? mix(a, b, s * 2.0) : mix(b, c, (s - 0.5) * 2.0);
}

/**
 * Bioma corrente, interpolado: 0 clareira, 1 fogo, 2 água. Trocar de mundo é
 * animar este float — um único conjunto de materiais serve para todos, sem
 * recompilar shader nem refazer a cena.
 */
uniform float uBiome;

/** Mistura três variantes de cor conforme o bioma, com transição contínua. */
vec3 biomeMix(vec3 clareira, vec3 fogo, vec3 agua){
  float b = clamp(uBiome, 0.0, 2.0);
  return b < 1.0 ? mix(clareira, fogo, b) : mix(fogo, agua, b - 1.0);
}

/** Folhagem. Na clareira é verde; no fogo, brasa; na água, coral e alga. */
vec3 leafColor(float s){
  float k = fract(s);
  vec3 mata = pick3(
    vec3(0.075, 0.175, 0.085), vec3(0.185, 0.360, 0.140), vec3(0.360, 0.500, 0.185), k);
  vec3 brasa = pick3(
    vec3(0.180, 0.045, 0.020), vec3(0.520, 0.150, 0.030), vec3(0.880, 0.420, 0.080), k);
  vec3 fundo = pick3(
    vec3(0.050, 0.180, 0.220), vec3(0.100, 0.400, 0.420), vec3(0.420, 0.680, 0.560), k);
  return biomeMix(mata, brasa, fundo);
}

/** Casca. Castanho na clareira, basalto rachado no fogo, nácar na água. */
vec3 barkColor(float s){
  float k = fract(s);
  vec3 mata = pick3(
    vec3(0.145, 0.105, 0.080), vec3(0.290, 0.225, 0.170), vec3(0.430, 0.360, 0.280), k);
  vec3 basalto = pick3(
    vec3(0.070, 0.055, 0.055), vec3(0.180, 0.130, 0.115), vec3(0.320, 0.180, 0.120), k);
  vec3 nacar = pick3(
    vec3(0.140, 0.200, 0.240), vec3(0.320, 0.400, 0.440), vec3(0.560, 0.620, 0.640), k);
  return biomeMix(mata, basalto, nacar);
}

/** Chapéus: amanita e creme na clareira; enxofre no fogo; anêmona na água. */
vec3 capColor(float s){
  float k = fract(s);
  vec3 mata = pick3(
    vec3(0.520, 0.105, 0.075), vec3(0.420, 0.280, 0.155), vec3(0.720, 0.640, 0.480), k);
  vec3 enxofre = pick3(
    vec3(0.620, 0.320, 0.040), vec3(0.780, 0.560, 0.100), vec3(0.300, 0.120, 0.080), k);
  vec3 anemona = pick3(
    vec3(0.700, 0.300, 0.480), vec3(0.320, 0.560, 0.620), vec3(0.860, 0.780, 0.700), k);
  return biomeMix(mata, enxofre, anemona);
}

/** Pétalas: lilás, rosa, amarelo-claro. */
vec3 petalColor(float s){
  return pick3(
    vec3(0.520, 0.400, 0.680),
    vec3(0.820, 0.480, 0.560),
    vec3(0.900, 0.780, 0.420),
    fract(s));
}

uniform float uMagic;

/**
 * Amortecedor global de cintilação, de 1 (normal) a 0 (sem oscilação nenhuma).
 *
 * Existe por segurança: brilho que varia é gatilho de crise em epilepsia
 * fotossensível. As frequências daqui já ficam abaixo de 1 Hz, longe da faixa
 * perigosa de 3 a 30 Hz, mas AMPLITUDE também conta — e num headset a cabeça
 * nunca para, então qualquer variação vira cintilação percebida.
 *
 * Toda modulação periódica de brilho passa por "damp".
 */
uniform float uCalm;

/** Em uCalm 0 devolve o valor médio: a oscilação some, o brilho fica. */
float damp(float osc, float media){
  return mix(media, osc, uCalm);
}

/**
 * Estrela com borda suave. A versão com "step" decidia por célula de direção,
 * e como a célula muda a cada movimento de cabeça a estrela piscava em vez de
 * brilhar. Aqui ela nasce no centro da célula e some suavemente na borda.
 */
float softStar(vec3 dir, float densidade, float limiar){
  vec3 cel = dir * densidade;
  vec3 id = floor(cel);
  float h = hash13(id);
  if (h < limiar) return 0.0;
  vec3 f = fract(cel) - 0.5;
  float forca = (h - limiar) / max(1.0 - limiar, 1e-4);
  return smoothstep(0.45, 0.06, length(f)) * forca;
}

/**
 * Encanta uma cor natural. Em "uMagic" 0 devolve a cor como está; subindo,
 * a paleta invade. "amount" deixa cada material escolher o quanto cede — a
 * casca cede pouco, o cogumelo bioluminescente cede muito.
 */
vec3 enchant(vec3 natural, float t, float amount){
  float k = clamp(uMagic * amount, 0.0, 1.0);
  return mix(natural, natural * 0.35 + palette(t) * 0.85, k);
}

/**
 * BIOLUMINESCÊNCIA.
 *
 * Uniforme global, 0 mata apagada e 1 tudo aceso por dentro.
 *
 * A regra que vale para os dois lados: bioluminescência é luz DESENHADA, não
 * brilho geral. Uma folha inteira acesa lê como plástico retroiluminado; o que
 * lê como vivo é a nervura acesa e o resto da folha escuro. Por isso "bio"
 * recebe sempre uma máscara — nervura, mancha, ponta, miolo — e nunca 1.0.
 */
uniform float uGlow;

/**
 * Luz emitida de dentro, na região que a máscara marca.
 *
 * O pulso é lentíssimo, 0,09 Hz, e ainda passa por "damp": brilho que varia é
 * gatilho em epilepsia fotossensível, e num headset a cabeça nunca para, então
 * a amplitude conta tanto quanto a frequência.
 */
/**
 * A cor da luz viva.
 *
 * NÃO vem da paleta da cena, e é por isso que existe. A paleta produz pastéis
 * com os três canais altos; multiplicada pela força da luz e passada pelo
 * "filmic", ela satura e vira branco chapado — foi o que deixou os cogumelos
 * parecendo guarda-chuvas de plástico em vez de acesos.
 *
 * A bioluminescência de verdade vive numa faixa estreita, o ciano-verde de
 * 490 nm, com desvios para o azul e, mais raro, para o verde-limão. Com o
 * canal vermelho baixo, a cor SOBREVIVE à saturação: por mais que se aumente,
 * ela clareia sem perder o tom. E dar uma cor comum a tudo que brilha é o que
 * faz a mata inteira parecer um organismo só.
 *
 * Cada mundo tem a sua: brasa no fogo, azul-abissal na água.
 */
vec3 bioHue(float t){
  float k = fract(t);
  vec3 mata  = pick3(vec3(0.16, 0.95, 0.72), vec3(0.28, 0.62, 1.00), vec3(0.72, 0.95, 0.35), k);
  vec3 brasa = pick3(vec3(1.00, 0.52, 0.14), vec3(1.00, 0.28, 0.08), vec3(1.00, 0.78, 0.28), k);
  vec3 fundo = pick3(vec3(0.22, 0.86, 1.00), vec3(0.42, 0.44, 1.00), vec3(0.12, 1.00, 0.88), k);
  return biomeMix(mata, brasa, fundo);
}

vec3 bio(float mascara, float t, float forca){
  if (uGlow < 0.004) return vec3(0.0);
  float pulso = damp(0.74 + 0.26 * sin(uTime * 0.55 + t * 6.28318), 0.80);
  return bioHue(t) * max(mascara, 0.0) * pulso * forca * uGlow;
}

/**
 * Escurece o corpo conforme a luz interna sobe.
 *
 * Bioluminescência precisa de escuro em volta para existir — é contraste, não
 * intensidade. Sem isto, subir o "uGlow" só lavaria a cena de branco: o que
 * brilha ficaria mais claro, mas o que NÃO brilha também.
 */
vec3 nightBody(vec3 c){
  return c * mix(1.0, 0.44, uGlow);
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
  // Brisa, não vendaval: quase metade do ritmo original. Vegetação lenta
  // é o que dá peso à massa das copas.
  float t = uTime * (0.42 + uTrip * 0.22);
  float h = max(pos.y, 0.0);
  float amp = h * h * uSway * rigidity;
  // A segunda harmônica pesa menos: era ela que dava a tremida de alta
  // frequência por cima do balanço largo.
  pos.x += (sin(t * 1.10 + phase) * 0.78 + sin(t * 1.93 + phase * 1.7) * 0.22) * amp;
  pos.z += (cos(t * 0.94 + phase * 1.3) * 0.78 + cos(t * 1.71 + phase) * 0.22) * amp * 0.8;
  return pos;
}
`;

/**
 * PISADAS.
 *
 * Guarda os últimos passos do usuário em coordenadas de mundo. `xy` é a
 * posição no chão e `z` é a força, que decai com o tempo — pisada velha some
 * e a vegetação levanta de novo.
 *
 * Um buffer curto de posições, e não uma textura de trilha, porque assim não
 * há alocação nem escrita de GPU: são doze vec3 num uniform, lidos por vértice.
 */
export const TRAMPLE = /* glsl */ `
#define PASSOS 12
uniform vec3 uSteps[PASSOS];
uniform float uTrample;   // 0 desliga o efeito inteiro

/**
 * Amassa e afasta a planta perto de onde o usuário pisou. Recebe a raiz da
 * instância em mundo, e devolve a posição local deslocada.
 */
vec3 trample(vec3 pos, vec3 root){
  if (uTrample < 0.01) return pos;

  float forca = 0.0;
  vec2 fuga = vec2(0.0);

  for (int i = 0; i < PASSOS; i++){
    vec2 d = root.xz - uSteps[i].xy;
    float dist = length(d);
    // Raio de meio metro: largura de quem passa, não de quem pisa num ponto.
    float f = uSteps[i].z * smoothstep(0.52, 0.05, dist);
    if (f > forca){
      forca = f;
      fuga = dist > 1e-4 ? d / dist : vec2(1.0, 0.0);
    }
  }

  forca *= uTrample;
  if (forca < 0.01) return pos;

  // Abaixa e inclina para fora: a planta deita no sentido oposto ao passo.
  float altura = max(pos.y, 0.0);
  pos.y *= 1.0 - forca * 0.72;
  pos.xz += fuga * forca * altura * 0.85;
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
uniform float uVanish;  // 0 mundo inteiro, 1 mundo dissolvido (ver FRAG_FADE)

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

/**
 * RASTRO ACESO.
 *
 * As mesmas pisadas que amassam a vegetação no vertex shader, lidas aqui para
 * ACENDER o chão por onde você passou. É o efeito do plâncton na areia: o
 * lugar reage ao corpo com luz, e a luz apaga sozinha conforme a pisada
 * envelhece — quem faz isso é o "z" de cada passo, que já decai com o tempo.
 *
 * O array é declarado de novo porque a versão do vertex shader ("TRAMPLE")
 * não é compartilhada com o fragment. São doze vec3; não há custo em manter
 * as duas.
 */
#define PASSOS_FS 12
uniform vec3 uSteps[PASSOS_FS];
uniform float uTrample;

float stepGlow(vec3 pos, float raio){
  if (uTrample < 0.01 || uGlow < 0.004) return 0.0;
  float k = 0.0;
  for (int i = 0; i < PASSOS_FS; i++){
    float d = distance(pos.xz, uSteps[i].xy);
    // Halo largo com centro cheio: o pé não deixa um ponto, deixa uma mancha.
    k = max(k, uSteps[i].z * smoothstep(raio, raio * 0.15, d));
  }
  return k * uTrample * uGlow;
}
`;

/** Recorta o fragmento se ele estiver longe demais — evita cauda infinita em AR. */
export const FRAG_CLIP = /* glsl */ `
  if (vFade <= 0.001) discard;
`;

/**
 * DISSOLUÇÃO.
 *
 * Quando a borboleta sai do casulo e sobe, o mundo não encolhe: ele evapora.
 * O corte é por fragmento, com limiar que sobe com a altura e com um ruído
 * ancorado em mundo — então a rasteira some primeiro e as copas por último,
 * em manchas irregulares em vez de uma linha reta subindo.
 *
 * Fica no mesmo bloco do recorte por distância porque as duas coisas são a
 * mesma decisão: este fragmento ainda existe?
 */
export const FRAG_FADE = /* glsl */ `
  if (vFade <= 0.001) discard;
  if (uVanish > 0.001) {
    float altRel = clamp((vWorld.y - uOrigin.y) / 3.0, 0.0, 1.0);
    // Manchas grandes e macias por baixo, granulado fino por cima. Só o
    // granulado dava um xadrez de cubos de nove centímetros, que lê como
    // falha de renderização e não como coisa se desfazendo.
    float grao = vnoise(vWorld * 3.2) * 0.78 + hash13(floor(vWorld * 41.0)) * 0.22;
    if (uVanish > altRel * 0.52 + grao * 0.46 + 0.02) discard;
  }
`;
