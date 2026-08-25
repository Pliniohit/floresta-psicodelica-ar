import {
  ShaderMaterial, Vector3, DoubleSide, FrontSide, BackSide,
  AdditiveBlending, NormalBlending,
} from '../../vendor/three/three.module.min.js';
import {
  NOISE, PALETTE, SWAY, TRAMPLE, VERT_HEAD, VERT_EMIT, FRAG_HEAD, FRAG_FADE,
} from './lib.js';

/**
 * Um único conjunto de uniforms compartilhado por todos os materiais.
 * Cada material recebe as MESMAS referências de objeto, então mexer em
 * `shared.uTime.value` uma vez propaga para a floresta inteira.
 */
export const shared = {
  uTime:   { value: 0 },
  uTrip:   { value: 0.35 },
  uMagic:  { value: 0.35 },   // 0 = mata realista, 1 = encantada
  // --- A CENA CORRENTE ---------------------------------------------------
  // Toda cor de superfície viaja por aqui. Eram literais no shader, em três
  // conjuntos fixos misturados por um float de bioma, e isso travava a
  // experiência em três mundos para sempre. Acrescentar um cenário passou a
  // ser acrescentar dados em cenas.js; o laço de animação persegue estes
  // valores e a travessia vira interpolação, sem recompilar nada.
  uFolha:  { value: [new Vector3(), new Vector3(), new Vector3()] },
  uCasca:  { value: [new Vector3(), new Vector3(), new Vector3()] },
  uChapeu: { value: [new Vector3(), new Vector3(), new Vector3()] },
  uPetala: { value: [new Vector3(), new Vector3(), new Vector3()] },
  uFruta:  { value: [new Vector3(), new Vector3(), new Vector3()] },
  uBio:    { value: [new Vector3(), new Vector3(), new Vector3()] },

  // Padrão de parede: o de saída, o de entrada, e onde a travessia está.
  uPadA:   { value: 0 },
  uPadB:   { value: 0 },
  uPadMix: { value: 0 },
  uParedeCor:   { value: new Vector3(1, 1, 1) },
  uParedeForca: { value: 1 },
  uLaminaCor:   { value: new Vector3(0.1, 0.3, 0.5) },
  uLaminaForca: { value: 0 },
  uCeuBaixo: { value: new Vector3(0.03, 0.05, 0.11) },
  uCeuAlto:  { value: new Vector3(0.08, 0.13, 0.25) },
  uEstrelas: { value: 1.0 },
  uNebulosa: { value: 0.5 },
  uCalm:   { value: 0.45 },   // amortecedor de cintilação; 0 = sem oscilação
  uTrample: { value: 1.0 },   // vegetação cede à passagem do usuário
  uSteps:  { value: Array.from({ length: 12 }, () => new Vector3(0, 0, 0)) },
  uPresenca:  { value: new Vector3(0, -100, 0) },   // longe até alguém chegar
  uPresencaR: { value: 1.15 },
  uSway:   { value: 0.010 },
  uPulse:  { value: 0 },
  uGlow:   { value: 0.80 },   // bioluminescência: 0 mata apagada, 1 tudo aceso
  uPaint:  { value: 0.0 },    // 0 facetado, 1 aquarela sobre papel
  uVanish: { value: 0 },      // 0 mundo inteiro, 1 mundo dissolvido
  uOrigin: { value: new Vector3() },
  uPalA:   { value: new Vector3(0.5, 0.5, 0.5) },
  uPalB:   { value: new Vector3(0.5, 0.5, 0.5) },
  uPalC:   { value: new Vector3(1.0, 1.0, 1.0) },
  uPalD:   { value: new Vector3(0.0, 0.33, 0.67) },
};

const VS_PRELUDE = NOISE + PALETTE + SWAY + TRAMPLE + VERT_HEAD + VERT_EMIT;
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

/**
 * Raiz da instância em mundo, e semente derivada dela.
 *
 * SÓ SERVE PARA OBJETO PARADO. A semente sai da posição, então uma instância
 * que se move re-sorteia a semente a cada frame — e tudo que depende dela
 * (espécie, cor, fase) troca noventa vezes por segundo. É cintilação, e foi
 * exatamente o que aconteceu com planetas, borboletas, vaga-lumes e medusas.
 *
 * Para o que se move, use ROOT_AND_ATTR_SEED.
 */
const ROOT_AND_SEED = /* glsl */ `
  mat4 im = instMatrix();
  vec3 root = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = fract(sin(root.x * 12.9898 + root.z * 78.233) * 43758.5453);
`;

/** Semente vinda de atributo por instância: estável mesmo em movimento. */
const ROOT_AND_ATTR_SEED = /* glsl */ `
  mat4 im = instMatrix();
  vec3 root = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = aSeed;
`;

// ---------------------------------------------------------------------------
// TRONCO — fibras helicoidais torcidas por ruído, com pulsos de luz subindo.
// ---------------------------------------------------------------------------
export const barkMaterial = make('casca', {
  vert: /* glsl */ `
    attribute vec3 aSmoothN;   // a normal lisa, guardada ao lado da facetada
    void main(){
      ${ROOT_AND_SEED}
      // A normal derrete conforme o pincel entra: mesma malha, outro
      // sombreamento. É o que separa facetado de pintado, e não o triângulo.
      emit(sway(position, root, 1.0), mix(normal, aSmoothN, uPaint * 0.22));
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
      vec3 col = enchant(nightBody(casca), t, 0.45);
      // A seiva continua vindo da paleta: é o elemento mágico do tronco.
      col += palette(t + 0.35) * damp(sap, 0.35) * (0.34 + uTrip * 0.7 + uPulse * 0.5);
      col *= 0.45 + 0.75 * wrapLight(vNormalW);
      col = aquarela(col, vNormalW, vLocal);
      col = tinta(col, vNormalW, uCasca[0] * 0.10, 1.7);

      // Luz no fundo do sulco, não na crista: a fibra que sobressai fica
      // escura e a fenda entre elas acende. É o que dá relevo ao tronco em
      // vez de pintá-lo de neon.
      float fenda = 1.0 - smoothstep(0.0, 0.11, abs(twist - 0.5));
      col += bio(fenda * 0.62 + sap * 0.85, t + 0.35, 0.95);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// FRUTOS — bagas penduradas sob a copa. Malha separada da copa porque a cor
// é outra: fruta com a cor da folha não é fruta.
// ---------------------------------------------------------------------------
export const fruitMaterial = make('frutos', {
  vert: /* glsl */ `
    attribute vec3 aSmoothN;   // a normal lisa, guardada ao lado da facetada
    void main(){
      ${ROOT_AND_SEED}
      // Balança com a copa, e um pouco além: pendurada, ela atrasa em relação
      // ao galho que a segura.
      vec3 p = sway(position, root, 1.0);
      p.x += sin(uTime * 0.62 + root.z * 3.1 + position.y * 2.0) * 0.008 * uSway * 90.0;
      emit(p, mix(normal, aSmoothN, uPaint * 0.22));
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      // Três frutas por cenário, sorteadas pela árvore. As cores vêm da cena
      // corrente, como todo o resto das superfícies.
      vec3 fruta = fruitColor(vSeed * 4.3);

      // Ponto de luz especular fixo: é o que faz a baga parecer lisa e
      // molhada em vez de uma pedrinha fosca.
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float brilho = pow(max(dot(reflect(-V, N), normalize(vec3(0.4, 0.9, 0.3))), 0.0), 14.0);

      float t = vSeed * 2.0 + uTime * 0.03;
      vec3 col = enchant(nightBody(fruta), t, 0.28);
      col *= 0.50 + 0.72 * wrapLight(N);
      col += vec3(1.0, 0.95, 0.88) * brilho * 0.55;
      col = aquarela(col, N, vLocal);
      // A fruta acende MAIS no lado escuro: é o avesso da luz externa, e é o
      // que a faz parecer iluminada por dentro em vez de polida por fora.
      col += bio(0.45 + 0.55 * (1.0 - wrapLight(N)), t + 0.15, 1.05) * fruta * 2.2;
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// COPA — massas de cor deformadas por domain warping, com brilho de borda.
// ---------------------------------------------------------------------------
export const canopyMaterial = make('copa', {
  vert: /* glsl */ `
    attribute vec3 aSmoothN;   // a normal lisa, guardada ao lado da facetada
    void main(){
      ${ROOT_AND_SEED}
      // a copa respira além de balançar
      float breathe = 1.0 + sin(uTime * 0.35 + root.x + root.z) * 0.030 * (0.4 + uTrip);
      emit(sway(position * breathe, root, 1.0), mix(normal, aSmoothN, uPaint * 0.22));
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
      vec3 col = enchant(nightBody(folha), t, 0.55);
      col += palette(t + 0.5) * rim * (0.22 + uTrip * 0.55 + uPulse * 0.4);
      col *= 0.5 + 0.65 * wrapLight(vNormalW);
      col = aquarela(col, vNormalW, vLocal);
      col = tinta(col, vNormalW, uCasca[0] * 0.08, 1.8);

      // A NERVURA é a isolinha do mesmo ruído que já desenha as manchas: uma
      // linha fina onde o ruído cruza o meio. Acender a nervura e deixar o
      // resto da folha escuro é o que lê como folha viva; acender a folha
      // inteira leria como placa retroiluminada.
      float nervura = 1.0 - smoothstep(0.0, 0.055, abs(n - 0.52));
      col += bio(nervura, t + 0.12, 1.05);
      col += bio(nervura * presenca(vWorld), t + 0.30, 1.6);
      // E a borda da massa, onde a folhagem é fina e a luz atravessa.
      col += bio(rim * 0.7, t + 0.42, 0.60);
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
      emit(sway(mix(position, trample(position, root), 0.45), root, 1.6), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float h = vLocal.y;
      float rings = sin(h * 9.0 - uTime * 0.30 + vSeed * 6.28) * 0.5 + 0.5;
      vec3 caule = nightBody(mix(vec3(0.78, 0.74, 0.64), vec3(0.55, 0.50, 0.42), vSeed));
      caule *= 0.78 + 0.28 * rings;

      float t = h * 0.35 + vSeed + uTime * 0.03;
      vec3 col = enchant(caule, t, 0.35);
      col *= 0.5 + 0.7 * wrapLight(vNormalW);
      col += palette(t + 0.4) * uPulse * 0.4;
      col = aquarela(col, vNormalW, vLocal);
      // Anéis subindo pelo caule, estreitados pelo expoente: acesos só na
      // crista, e não numa oscilação larga que lavaria o caule inteiro.
      col += bio(pow(rings, 3.0), t + 0.3, 0.70);
      gl_FragColor = vec4(filmic(col), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// COGUMELO: chapéu com anéis concêntricos girando + manchas bioluminescentes.
// ---------------------------------------------------------------------------
export const capMaterial = make('chapeu', {
  vert: /* glsl */ `
    attribute vec3 aSmoothN;   // a normal lisa, guardada ao lado da facetada
    void main(){
      ${ROOT_AND_SEED}
      emit(sway(position, root, 1.6), mix(normal, aSmoothN, uPaint * 0.22));
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

      vec3 chapeu = nightBody(capColor(vSeed * 4.3));
      chapeu *= 0.80 + 0.30 * (rings * 0.5 + spokes * 0.5);
      // As manchas são o ÓRGÃO da luz, não uma tinta clara.
      //
      // Antes elas eram clareadas até quase o branco e só depois acesas por
      // cima. O resultado era um chapéu branco chapado: a mancha já estava
      // saturada antes de a luz chegar, e a luz não tinha cor nenhuma para
      // carregar. Agora a mancha fica ESCURA no corpo, e quem a acende é o
      // "bio" lá embaixo — que é como funciona no bicho.
      chapeu = mix(chapeu, chapeu * 0.45 + vec3(0.10, 0.15, 0.12), spots * 0.70);

      float t = r * 1.3 + rings * 0.25 + uTime * 0.05 + vSeed;
      vec3 col = enchant(chapeu, t, 0.40);
      col += palette(t + 0.5) * spots * (0.26 + uTrip * 0.7 + uPulse * 0.6);
      col *= 0.55 + 0.65 * wrapLight(vNormalW);
      col = aquarela(col, vNormalW, vLocal);
      col = tinta(col, vNormalW, uChapeu[0] * 0.10, 1.6);

      // O cogumelo é o mais aceso da mata — é o que a mata bioluminescente
      // promete. As manchas queimam, e a aba acende por baixo como se a luz
      // saísse das lamelas.
      float aba = smoothstep(0.28, 0.42, r);
      col += bio(spots * 1.15, t + 0.5, 1.9);
      col += bio(aba * 0.5, t + 0.18, 1.1);
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
      emit(sway(trample(position, root), root, 3.0), normal);
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

      vec3 base = nightBody(mix(haste, petala, smoothstep(0.82, 0.95, h)));
      float t = vSeed + uTime * 0.04;
      vec3 col = enchant(base, t, 0.45);
      col *= 0.55 + 0.6 * wrapLight(vNormalW);
      col += palette(t + 0.5) * uPulse * 0.4 * h;
      // Miolo aceso e pétala apagada: a flor vira uma lamparina pequena.
      float miolo = (1.0 - smoothstep(0.008, 0.030, r)) * smoothstep(0.78, 0.95, h);
      col += bio(miolo, t + 0.25, 2.4);
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

      // Segunda trama, quatro vezes mais fina e correndo em outro sentido.
      // Uma rede só lê como um desenho; duas em escalas diferentes leem como
      // micélio, que é uma malha dentro de outra.
      float f = fbm2(vec3(d * 2.3 + 17.0, -uTime * 0.055));
      float fina = 1.0 - smoothstep(0.0, 0.045, abs(f - 0.5));

      float wave  = ripple(0.45, 1.3);
      float shock = smoothstep(0.10, 0.0, abs(r - uPulse * 6.0)) * uPulse;

      // O CHÃO REAGE AO CORPO. Onde você pisou, a rede acende e vai apagando
      // sozinha conforme a pisada envelhece — é plâncton na areia. A mesma
      // pisada que amassa o capim no vertex shader acende o micélio aqui.
      float passo = stepGlow(vWorld, 0.62);
      // E o halo do corpo que está aqui agora, mais forte que a memória do pé.
      float aqui = presenca(vWorld) * uGlow;

      float trama = veins * (0.30 + 0.45 * wave) + fina * 0.22 * uGlow;
      float a = (trama + shock * 0.8 + passo * (0.55 + fina * 0.9)
              + aqui * (0.35 + fina * 0.7)) * vFade;
      if (a <= 0.004) discard;

      vec3 col = palette(r * 0.15 + n * 0.5 + uTime * 0.05);
      col += palette(r * 0.15 + 0.5) * shock;
      // A trama fina acende com cor deslocada: duas cores na mesma rede dão
      // a leitura de profundidade que uma só não dá.
      col += bio(fina, n * 0.4 + uTime * 0.03 + 0.35, 1.5);
      col += bio(passo, r * 0.1 + 0.62, 2.6);
      col += bio(aqui, r * 0.1 + 0.28, 2.0);
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
      emit(sway(trample(position, root), root, 5.0), normal);
    }
  `,
  frag: /* glsl */ `
    void main(){
      ${FRAG_FADE}
      float h = clamp(vLocal.y / 0.42, 0.0, 1.0);
      // Amplitude baixa de propósito: são mais de mil lâminas finas na tela,
      // e contraste alto nelas vira cintilação com qualquer movimento.
      float scan = damp(sin(h * 4.0 - uTime * 0.45 + vSeed * 6.28) * 0.5 + 0.5, 0.5);
      vec3 verde = nightBody(leafColor(vSeed * 5.7));
      verde = mix(verde * 0.45, verde * 1.25, h);   // base na sombra, ponta ao sol

      float t = h * 0.5 + vSeed + uTime * 0.06;
      vec3 col = enchant(verde, t, 0.5);
      col += palette(t + 0.5) * scan * h * (0.08 + uTrip * 0.22 + uPulse * 0.3);
      // SÓ A PONTA, e com expoente alto. São mais de mil lâminas finas na
      // tela: acender a lâmina inteira viraria um tapete cintilante a cada
      // mexida de cabeça, que é exatamente o que não se pode fazer.
      col += bio(pow(h, 3.0) * 0.9, t + 0.45, 0.85);
      // A lâmina acende inteira quando você chega perto dela.
      col += bio(presenca(vWorld) * h, t + 0.2, 1.1);
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
      gl_FragColor = vec4(trippy(col) * soft * vFade * (0.8 + uPulse + uGlow * 0.7), 1.0);
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
  // COM teste de profundidade.
  //
  // Ele já esteve desligado, porque o teto real escrevia profundidade e
  // apagava o céu inteiro. Agora o teto não oclui mais — ele é a abertura —,
  // e ligar o teste de volta resolve as duas coisas de uma vez: o céu passa
  // pelo buraco do teto, e a COPA DA ÁRVORE fica na frente dele em vez de
  // levar uma demão de céu por cima. Parede e chão continuam ganhando do
  // céu, porque ali a sala é sala.
  depthTest: true,
  side: BackSide,
  uniforms: {
    uHorizon: { value: 0.10 },   // seno da elevação onde o céu começa a aparecer
    uFull: { value: 0.62 },      // onde já está cheio
    uSky: { value: 1.0 },        // liga/desliga com transição
    uSpace: { value: 0.0 },      // 0 céu sobre a sala, 1 espaço profundo
    // Teto de opacidade PERTO DO HORIZONTE. Para os lados o céu nunca fecha
    // de todo — ali estão as suas paredes, e elas ficam. Para cima ele fecha
    // por inteiro: o teto é a parte que pode ser realidade virtual, e é por
    // ele que se vê o céu e a copa das árvores atravessando.
    uMaxVeil: { value: 0.72 },
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
    uniform float uMaxVeil;

    void main(){
      vec3 dir = normalize(vWorld - cameraPosition);
      float up = dir.y;

      // Nada abaixo da linha: ali está a sala de verdade. E o quanto o céu
      // pode fechar depende de para onde se olha — cede de lado, fecha em cima.
      float teto = mix(uMaxVeil, 1.0, smoothstep(0.20, 0.50, up));
      float veu = smoothstep(uHorizon, uFull, up) * uSky * teto;
      if (veu <= 0.004) discard;

      // É NOITE.
      //
      // O fundo é o gradiente escuro da cena e quem faz o trabalho são as
      // estrelas. Antes a nebulosa carregava a cor e o céu clareava até
      // deixar de ser noite; agora ela é um véu por cima, com peso próprio
      // por cenário.
      vec3 base = mix(uCeuBaixo, uCeuAlto, smoothstep(-0.10, 0.85, up));

      vec3 q = dir * 2.6;
      float warp = vnoise(q * 0.8 + uTime * 0.02);
      float neb = fbm3(q + warp * 1.6 + vec3(uTime * 0.012, 0.0, uTime * 0.008));

      // Faixas de aurora atravessando o zênite.
      float faixa = sin(dir.x * 3.1 + neb * 5.0 + uTime * 0.11)
                  * sin(dir.z * 2.3 - neb * 4.0 - uTime * 0.085);
      faixa = pow(max(faixa, 0.0), 2.2);

      float t = neb * 0.9 + up * 0.35 + uTime * 0.03;
      float nebK = uNebulosa * mix(1.0, 0.35, uSpace);

      vec3 col = base;
      col += bioHue(t) * neb * 0.32 * nebK;
      col += bioHue(t + 0.42) * faixa * (0.30 + uTrip * 0.65) * nebK;

      // TRÊS DENSIDADES DE ESTRELA. Uma só dá um chuvisco uniforme, que não
      // lê como céu — o que lê é a mistura de poucas grandes com muitas
      // pequenas e uma poeira quase invisível por baixo. Todas com borda
      // macia: as de borda dura piscam a cada movimento de cabeça.
      float e1 = softStar(dir, 118.0, 0.99730);
      float e2 = softStar(dir, 212.0, 0.99900);
      float e3 = softStar(dir, 335.0, 0.99955);
      float estrela = (e1 * 1.65 + e2 * 0.95 + e3 * 0.55) * uEstrelas;
      estrela *= smoothstep(-0.06, 0.34, up);
      col += vec3(estrela) * (0.95 + uTrip * 0.5);

      col += bioHue(t + 0.5) * uPulse * 0.30 * neb;

      // Em espaço profundo as estrelas aparecem também para baixo.
      col += vec3(softStar(dir, 240.0, 0.99920) * uSpace) * 1.5;

      gl_FragColor = vec4(trippy(col) * (1.0 + uTrip * 0.6), veu);
    }
  `,
});

// ---------------------------------------------------------------------------
// BRILHO DE CÉU — hoje só a constelação usa. As medusas que moravam aqui
// saíram: o céu virou noite de verdade, com planetas gigantes e cadentes, e
// bicho à deriva lá em cima competia com eles.
// ---------------------------------------------------------------------------
export const skyLifeMaterial = make('brilho-de-ceu', {
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  vert: /* glsl */ `
    #ifdef USE_INSTANCING
      attribute float aSeed;
    #endif
    void main(){
      #ifdef USE_INSTANCING
        ${ROOT_AND_ATTR_SEED}
      #else
        ${ROOT_AND_SEED}
      #endif
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
    uSeed: { value: 0 },                      // identidade fixa deste planeta
    uElement: { value: 0 },                   // 0 terra, 1 fogo, 2 água
  },
  vert: /* glsl */ `
    uniform float uSeed;
    void main(){
      // Semente de uniform, não da posição: o planeta orbita, e derivar da
      // posição fazia ele re-sortear se era gasoso, rochoso ou gelado a cada
      // frame — que era a piscada.
      mat4 im = instMatrix();
      vec3 root = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vSeed = uSeed;
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uWarp;
    uniform vec3 uTint;
    uniform float uGrow;
    uniform float uElement;

    void main(){
      vec3 N = normalize(vNormalW);
      vec3 P = normalize(vLocal);

      // A superfície é decidida pelo ELEMENTO que o planeta guarda, não por
      // sorteio: cada planeta é um elemento, e tem de dar para escolher para
      // onde ir olhando para ele. A semente só varia o desenho dentro do tipo.

      // TERRA — continentes e mares, verde sobre azul.
      float relevo = fbm3(P * 3.2 + vSeed * 10.0);
      vec3 pTerra = mix(vec3(0.07, 0.19, 0.34), vec3(0.22, 0.44, 0.20),
                        smoothstep(0.45, 0.57, relevo));
      pTerra = mix(pTerra, vec3(0.50, 0.46, 0.30), smoothstep(0.68, 0.80, relevo));

      // FOGO — basalto escuro rachado, magma nas fendas.
      float veia = fbm2(P * 4.4 + vSeed * 6.0);
      float fenda = pow(max(0.0, 1.0 - abs(veia - 0.5) * 2.2), 7.0);
      vec3 pFogo = mix(vec3(0.09, 0.05, 0.04), vec3(0.95, 0.38, 0.08), fenda);
      pFogo += vec3(1.0, 0.48, 0.12) * fenda
             * damp(0.6 + 0.4 * sin(uTime * 0.42 + vSeed * 9.0), 0.6) * 0.6;

      // ÁGUA — oceano com faixas de nuvem por cima.
      float onda = fbm3(P * 2.6 + vec3(uTime * 0.012, 0.0, 0.0) + vSeed * 4.0);
      vec3 pAgua = mix(vec3(0.04, 0.19, 0.46), vec3(0.16, 0.50, 0.74),
                       smoothstep(0.38, 0.62, onda));
      pAgua = mix(pAgua, vec3(0.90, 0.94, 0.98), smoothstep(0.68, 0.84, onda));

      float el = uElement;
      vec3 base = el < 0.5 ? pTerra : (el < 1.5 ? pFogo : pAgua);
      // A cor do bioma reforça, mas já não precisa carregar a leitura sozinha.
      base = mix(base, base * 0.55 + uTint * 0.70, 0.34);

      // Terminador: luz vinda de cima e do lado, com penumbra larga.
      float luz = dot(N, normalize(vec3(0.45, 0.7, 0.35)));
      float dia = smoothstep(-0.35, 0.55, luz);

      // Ambiente generoso de propósito: um planeta realista fica invisível no
      // lado escuro, e aqui ele precisa ser encontrado, lido como sólido e
      // pego. No espaço não há mais nada iluminando.
      vec3 col = base * (0.46 + dia * 0.90);
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
// BURACO NEGRO — disco na parede. O centro é preto absoluto, em volta gira o
// disco de acreção, e o anel de luz na borda sugere a luz sendo curvada.
// Fica na parede porque é lá que o cômodo real termina: é o buraco no mundo.
// ---------------------------------------------------------------------------
export const blackHoleMaterial = make('buraco-negro', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  uniforms: { uOpen: { value: 0 } },   // 0 parede intacta, 1 rompida
  vert: /* glsl */ `
    void main(){
      ${ROOT_AND_SEED}
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uOpen;
    void main(){
      if (uOpen < 0.02) discard;
      // Abre de dentro para fora: no começo só o miolo, e o disco cresce.
      float r = length(vLocal.xy) / max(uOpen, 0.05);
      if (r > 1.0) discard;

      float a = atan(vLocal.y, vLocal.x);

      // Rotação diferencial: perto do centro gira mais rápido, como um disco
      // de verdade. É o que faz a espiral se enrolar sozinha com o tempo.
      float giro = uTime * 0.16 / max(r, 0.18);
      float faixas = fbm2(vec3(cos(a + giro) * r * 2.4, sin(a + giro) * r * 2.4, uTime * 0.02));

      float horizonte = smoothstep(0.34, 0.30, r);         // preto absoluto
      float disco = smoothstep(0.30, 0.40, r) * smoothstep(1.0, 0.55, r);
      float anel = exp(-abs(r - 0.345) * 42.0);            // luz curvada na borda

      vec3 quente = mix(vec3(0.85, 0.35, 0.06), vec3(1.0, 0.86, 0.62), faixas);
      vec3 col = quente * disco * (0.45 + faixas * 0.9);
      col += vec3(1.0, 0.88, 0.70) * anel * 1.5;
      col = mix(col, vec3(0.0), horizonte);

      // Some suave na borda externa, sem recorte duro.
      float alpha = max(max(disco * 0.85, anel), horizonte);
      alpha *= smoothstep(1.0, 0.86, r) * min(1.0, uOpen * 1.6);
      if (alpha <= 0.004) discard;

      gl_FragColor = vec4(filmic(col), alpha);
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
    attribute float aSeed;   // por instância: a espécie não pode mudar em voo
    varying float vSpan;
    varying float vWing;

    void main(){
      ${ROOT_AND_ATTR_SEED}
      vSpan = aSpan;
      vWing = aWing;

      // RAJADA E PLANEIO.
      //
      // O que identifica uma borboleta não é a frequência: é o padrão. Ela
      // bate algumas vezes fundo, para, e plana. Bater sem parar dava o
      // "frenético" de antes; planar sempre — que foi a correção anterior —
      // tirou a batida junto, e aí não parecia mais borboleta.
      //
      // Então: rajadas curtas de batida funda, separadas por planeios longos.
      float freq = (2.05 + vSeed * 0.55) * mix(0.55, 1.0, uCalm);

      // Um ciclo de ~7 s: bate durante um terço dele, plana no resto.
      float ciclo = fract(uTime / (6.4 + vSeed * 2.6) + vSeed * 3.1);
      float rajada = smoothstep(0.30, 0.40, ciclo) * (1.0 - smoothstep(0.62, 0.76, ciclo));

      // Atraso ao longo da envergadura: a ponta chega depois da dobradiça, e
      // é esse atraso que faz a asa parecer membrana e não placa.
      float fase = fract(uTime * freq + vSeed * 7.0 - aSpan * 0.17);

      // Perfil ASSIMÉTRICO: sobe em 34% do ciclo e desce nos 66% restantes.
      // Senóide pura dá vaivém de metrônomo; borboleta bate e deixa cair.
      float sobe = smoothstep(0.0, 1.0, fase / 0.34);
      float desce = 1.0 - smoothstep(0.0, 1.0, (fase - 0.34) / 0.66);
      float batida = fase < 0.34 ? sobe : desce;

      // Planando, as asas ficam num diedro raso que respira devagar.
      float planeio = 0.30 + sin(uTime * 0.28 + vSeed * 5.0) * 0.055;

      float perfil = mix(planeio, batida, rajada);

      // Curso amplo: 20 graus abaixo da horizontal até quase se encostarem
      // por cima do dorso. É o curso que faz a silhueta ler como borboleta.
      float ang = mix(-0.35, 1.45, perfil) * aSpan * abs(aWing);

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

      // O corpo inteiro sobe quando as asas descem. Uma borboleta parada no
      // ar enquanto as asas remam parece de brinquedo; é este solavanco de um
      // centímetro que dá peso ao bicho.
      p.z -= (perfil - 0.45) * 0.011 * rajada;

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
    attribute float aSeed;
    void main(){
      ${ROOT_AND_ATTR_SEED}
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
  side: DoubleSide,
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

      // FRESNEL é o que faz isto ser vidro. No meio da forma, onde a
      // superfície aponta para você, ela quase some; de raspão, acende. Era
      // aditivo e chapado antes, e é por isso que cada junta lia como uma
      // bolinha acesa em vez de parte de uma coisa só.
      float fres = pow(1.0 - abs(dot(N, V)), 2.6);

      // Veios de líquido escorrendo para baixo pela superfície, ancorados em
      // mundo — assim eles atravessam a fronteira entre uma junta e o osso
      // seguinte sem costura, e as peças param de se ler separadas.
      float veio = fbm2(vec3(vWorld * 11.0 + vec3(0.0, -uTime * 0.30, 0.0)));
      float nervura = 1.0 - smoothstep(0.0, 0.085, abs(veio - 0.5));

      vec3 tom = bioHue(0.12 + veio * 0.25);
      vec3 col = tom * (0.22 + nervura * 0.85) + vec3(1.0) * fres * 0.85;

      // Quase transparente no corpo, sólida só na borda: é assim que se lê
      // uma casca de vidro com algo vivo dentro.
      float a = clamp(fres * 0.80 + nervura * 0.30 + 0.07, 0.0, 0.92);
      gl_FragColor = vec4(filmic(col * 1.5), a);
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
/**
 * Clona um material preservando os uniforms COMPARTILHADOS por referência.
 *
 * `ShaderMaterial.clone()` clona os uniforms em profundidade — e é isso que
 * se quer para os uniforms próprios do objeto (a semente do planeta, o
 * elemento que ele guarda). Mas ele clona `uTime`, `uGlow`, `uCalm` e as
 * cores da cena junto, e aí o clone congela: o laço de animação continua
 * escrevendo no objeto original, que o clone já não olha. O planeta para no
 * tempo e nunca mais troca de cena.
 *
 * Aqui os globais voltam a apontar para os de verdade depois do clone.
 */
export function cloneMaterial(base, proprios = {}) {
  const m = base.clone();
  for (const k of Object.keys(shared)) m.uniforms[k] = shared[k];
  for (const [k, v] of Object.entries(proprios)) {
    if (m.uniforms[k]) m.uniforms[k].value = v;
  }
  registry.push(m);
  return m;
}

export const allMaterials = registry;

export function disposeMaterials() {
  for (const m of registry) m.dispose();
}

// ---------------------------------------------------------------------------
// PAREDES DO CÔMODO — a casca temática.
//
// As paredes de verdade continuam ali: este material é ADITIVO e não escreve
// profundidade, então o que ele faz é pintar POR CIMA do passthrough, não
// substituí-lo. Trepadeiras no mundo de terra, fendas de brasa no de fogo,
// ondas atravessando a alvenaria no de água — e em todos os casos você
// continua vendo a sua sala por baixo.
//
// É o que responde a "as paredes têm que estar sempre ao nosso redor": em vez
// de fugir do cômodo, cada mundo veste o cômodo.
// ---------------------------------------------------------------------------
export const wallMaterial = make('paredes', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: AdditiveBlending,
  uniforms: { uShell: { value: 0 } },
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      emit(position, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uShell;

    // Cada padrão devolve vec2(corpo, realce): a massa do desenho e a linha
    // acesa por cima dela. A COR não mora aqui — vem da cena, por uniform.
    // Assim um padrão serve a qualquer paleta, e trocar de cenário não exige
    // reescrever desenho nenhum.

    /** FAIXAS — registros ornamentais horizontais, como a borda de um têxtil. */
    vec2 padFaixas(vec3 w, float h){
      float y = fract(h * 0.85);
      float dentro = smoothstep(0.04, 0.12, y) * smoothstep(0.46, 0.34, y);
      float u = w.x * 1.9 + w.z * 1.5;
      // Grega de degraus: quantizar u e y e alternar dá o zigue-zague sem
      // desenhar um único segmento.
      float degrau = step(0.5, fract(floor(u * 7.0) * 0.5 + floor(y * 6.0) * 0.5));
      float conta = smoothstep(0.40, 0.50, abs(fract(u * 11.0) - 0.5));
      float fio = smoothstep(0.030, 0.0, abs(y - 0.045))
                + smoothstep(0.030, 0.0, abs(y - 0.455));
      return vec2(dentro * mix(0.18, 1.0, degrau) * conta, fio);
    }

    /** ONDAS — cristas atravessando a alvenaria, subindo devagar. */
    vec2 padOndas(vec3 w, float h){
      float onda = sin((w.y - uTime * 0.20) * 5.0
                     + fbm2(vec3(w.xz * 1.5, uTime * 0.045)) * 3.6);
      float crista = pow(max(onda, 0.0), 3.0);
      return vec2(0.28 + crista * 1.05, crista * crista);
    }

    /** BRASA — a parede racha e o que está atrás dela brilha. */
    vec2 padBrasa(vec3 w, float h){
      float veia = fbm2(vec3(w.xz * 3.1, w.y * 1.2 - uTime * 0.035));
      float fenda = pow(max(0.0, 1.0 - abs(veia - 0.5) * 2.4), 6.0);
      float vivo = damp(0.78 + 0.22 * sin(uTime * 0.55 + w.y * 1.6), 0.86);
      return vec2(fenda * vivo * (0.55 + exp(-h * 0.34)), fenda * fenda * vivo);
    }

    /** DENDRITO — a ramificação que é coral, raiz e raio ao mesmo tempo. */
    vec2 padDendrito(vec3 w, float h){
      float n = fbm2(vec3(w.xz * 2.2, w.y * 1.4 + uTime * 0.02));
      float m = fbm2(vec3(w.xz * 4.7 + 31.0, w.y * 2.1 - uTime * 0.03));
      // O ramo é onde dois ruídos de escalas diferentes se cruzam. Traçar
      // galho por galho custaria caro e ficaria regular demais.
      float ramo = pow(max(0.0, 1.0 - abs(n - m) * 7.0), 4.0);
      return vec2(ramo * (0.5 + exp(-h * 0.22)), ramo * ramo * 1.6);
    }

    /** FILIGRANA — volutas encadeadas, o arabesco vermelho e ouro. */
    vec2 padFiligrana(vec3 w, float h){
      // Duas ondas moduladas uma pela outra: o encadeamento nasce do
      // cruzamento delas, sem desenhar voluta nenhuma.
      vec2 p = vec2(w.x * 2.3 + w.z * 1.1, w.y * 2.0);
      float a = sin(p.x * 3.1 + sin(p.y * 2.3) * 2.2);
      float b = sin(p.y * 3.7 - sin(p.x * 1.9) * 2.6);
      float laco = pow(max(0.0, 1.0 - abs(a - b) * 2.4), 5.0);
      float fino = smoothstep(0.46, 0.5, abs(fract(p.x * 2.0 + p.y) - 0.5));
      return vec2(laco * 1.2 + fino * 0.09, laco * laco * 1.8);
    }

    /** MÁRMORE — tinta sobre água, com domain warping. */
    vec2 padMarmore(vec3 w, float h){
      vec3 q = vec3(w.xz * 1.2, w.y * 0.7 + uTime * 0.012);
      float warp = vnoise(q * 0.9);
      float v = fbm3(q + warp * 2.0);
      float veio = 1.0 - smoothstep(0.0, 0.05, abs(fract(v * 3.0) - 0.5));
      return vec2(0.18 + v * 0.50, veio);
    }

    /** ROCHA — a moldura de rocha pintada do proscênio. */
    vec2 padRocha(vec3 w, float h){
      float estria = fbm2(vec3(w.xz * 5.5, w.y * 0.35));
      float sulco = smoothstep(0.40, 0.5, abs(fract(estria * 4.0 + w.y * 0.5) - 0.5));
      // A moldura vive no rodapé e perto do teto; o meio da parede é a boca
      // do palco e fica limpo para a cena aparecer nela.
      float moldura = exp(-h * 1.7) + smoothstep(1.75, 2.35, h);
      return vec2((0.22 + sulco * 0.70) * (0.35 + moldura), moldura * sulco);
    }

    vec2 padraoPor(float qual, vec3 w, float h){
      int i = int(qual + 0.5);
      if (i == 0) return padFaixas(w, h);
      if (i == 1) return padOndas(w, h);
      if (i == 2) return padBrasa(w, h);
      if (i == 3) return padDendrito(w, h);
      if (i == 4) return padFiligrana(w, h);
      if (i == 5) return padMarmore(w, h);
      return padRocha(w, h);
    }

    void main(){
      if (uShell < 0.004) discard;

      // O quadrilátero da parede não pode ter contorno visível: ele é uma
      // aproximação da parede real, e uma borda reta denunciaria o erro.
      vec2 q = abs(vLocal.xy);
      float borda = smoothstep(0.5, 0.34, q.x) * smoothstep(0.5, 0.26, q.y);
      if (borda <= 0.004) discard;

      float h = max(vWorld.y - uOrigin.y, 0.0);

      // Dois padrões vivos ao mesmo tempo durante a travessia: o que sai e o
      // que entra. Fora dela os dois são o mesmo e o mix não custa nada.
      vec2 pa = padraoPor(uPadA, vWorld, h);
      vec2 pb = padraoPor(uPadB, vWorld, h);
      vec2 pd = mix(pa, pb, uPadMix);

      vec3 col = uParedeCor * pd.x
               + mix(uParedeCor, vec3(1.0), 0.55) * pd.y;
      col *= uParedeForca;

      float a = borda * uShell;
      if (a <= 0.004) discard;
      gl_FragColor = vec4(filmic(col), a);
    }
  `,
});

// ---------------------------------------------------------------------------
// LÂMINA — a superfície horizontal que atravessa o cômodo na altura da
// cintura no mundo de água (você fica submerso até ali) e rente ao chão no de
// fogo (névoa de brasa). No mundo de terra ela some.
//
// Translúcida de propósito: as suas pernas de verdade continuam aparecendo
// por baixo, e é isso que faz a água parecer estar NA sala.
// ---------------------------------------------------------------------------
export const tideMaterial = make('lamina', {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  uniforms: { uShell: { value: 0 } },
  vert: /* glsl */ `
    void main(){
      vSeed = 0.0;
      vec3 p = position;
      // Onda de gravidade lenta em duas direções não múltiplas: o padrão
      // demora a se repetir, então a superfície não fica obviamente cíclica.
      //
      // A fase vem da posição em MUNDO, não da local: a malha é um plano
      // unitário esticado pela escala do objeto, e em espaço local ela mede
      // meio metro de lado — a onda sairia com um comprimento só, do tamanho
      // da sala inteira.
      vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
      p.z += sin(w.x * 1.9 + uTime * 0.50) * 0.028
           + sin(w.z * 2.3 - uTime * 0.37) * 0.021;
      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    uniform float uShell;

    void main(){
      if (uShell < 0.004) discard;

      vec2 q = abs(vLocal.xy);
      float borda = smoothstep(0.5, 0.28, q.x) * smoothstep(0.5, 0.28, q.y);
      if (borda <= 0.004) discard;

      if (uLaminaForca < 0.01) discard;

      // Cáustica: a interferência de dois ruídos que deslizam em sentidos
      // opostos. É mais barato que traçar refração e lê igual.
      float c1 = fbm2(vec3(vWorld.xz * 2.2 + vec2(uTime * 0.055, -uTime * 0.04), 0.0));
      float c2 = fbm2(vec3(vWorld.xz * 3.1 - vec2(uTime * 0.042, uTime * 0.065), 4.0));
      float caustica = pow(max(0.0, 1.0 - abs(c1 - c2) * 4.2), 3.0);

      // A lâmina é a cor da cena, aberta pela cáustica em direção à luz viva
      // dela. Uma cor só, sem "água" e "brasa" cravadas no shader: é a cena
      // que diz se aqui embaixo tem oceano, névoa de brasa ou nebulosa.
      vec3 col = mix(uLaminaCor, uLaminaCor * 2.2 + bioHue(0.15) * 0.55, caustica);
      col += bioHue(0.4) * caustica * 0.7;
      float a = borda * uShell * uLaminaForca * (0.26 + caustica * 0.44);
      if (a <= 0.004) discard;
      gl_FragColor = vec4(filmic(col), a);
    }
  `,
});

// ---------------------------------------------------------------------------
// ESTRELAS CADENTES.
//
// Cada meteoro carrega o próprio relógio: período longo e fase própria, tirados
// da semente da instância. Ninguém precisa sortear nada por quadro no
// JavaScript, e como os períodos não são múltiplos entre si, eles nunca caem
// juntos — o céu fica com aquela irregularidade que faz esperar o próximo.
//
// Fora da sua fatia de vida o meteoro colapsa num ponto: os triângulos
// degeneram e não custam pixel nenhum.
//
// Sobre fotossensibilidade: é um risco de segurança e vale ser explícito. Um
// meteoro atravessa em pouco mais de um segundo, ocupa uma fração mínima do
// campo e cresce e apaga por envelope suave. Não é um clarão de tela cheia,
// que é o que dispara crise; e a raridade dos períodos mantém a frequência
// média bem abaixo de 1 Hz mesmo com o enxame inteiro.
// ---------------------------------------------------------------------------
export const meteorMaterial = make('meteoros', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  side: DoubleSide,
  uniforms: { uRaio: { value: 40 } },
  vert: /* glsl */ `
    attribute float aSeed;
    uniform float uRaio;
    varying float vCauda;    // 0 na cabeça .. 1 na ponta do rastro
    varying float vLarg;     // -1 .. 1 através da largura
    varying float vVivo;

    void main(){
      vSeed = aSeed;

      // Períodos entre 9 e 31 s, sem razão simples entre eles.
      float periodo = 9.0 + fract(aSeed * 7.3) * 22.0;
      float fase = fract(uTime / periodo + fract(aSeed * 13.7));

      // Ele existe em 16% do próprio ciclo — cerca de dois segundos.
      float vivo = smoothstep(0.0, 0.035, fase) * (1.0 - smoothstep(0.10, 0.16, fase));
      vVivo = vivo;

      // Onde nasce, no alto da cúpula, e para onde vai.
      float az = fract(aSeed * 3.1) * 6.28318;
      float el = 0.35 + fract(aSeed * 5.7) * 0.95;
      vec3 origem = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
      vec3 lado = normalize(cross(origem, vec3(0.0, 1.0, 0.0)));
      vec3 tang = normalize(mix(lado, cross(origem, lado), fract(aSeed * 11.3)));

      // Avança ao longo de um arco. A trajetória é uma rotação do vetor de
      // origem na direção da tangente: assim ela acompanha a cúpula em vez
      // de sair reta e furá-la.
      float andar = smoothstep(0.0, 0.16, fase);
      float avanco = mix(-0.30, 0.42, andar);

      float u = position.x + 0.5;                       // 0 cabeça .. 1 cauda
      vCauda = u;
      vLarg = position.y * 2.0;

      float comp = 0.09 + fract(aSeed * 2.7) * 0.13;    // rastro, em radianos
      float ang = avanco - u * comp;
      vec3 p = normalize(origem * cos(ang) + tang * sin(ang));
      vec3 lateral = normalize(cross(p, tang));

      // Afina para a cauda. Em vivo = 0 tudo colapsa e nada é rasterizado.
      float larg = mix(0.0035, 0.0009, u) * vivo;
      vec3 mundo = (p + lateral * vLarg * larg) * uRaio * mix(0.0001, 1.0, step(0.001, vivo));

      vec4 w = modelMatrix * vec4(mundo, 1.0);
      vWorld = w.xyz; vLocal = mundo; vNormalW = normalize(p);
      vFade = 1.0;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  frag: /* glsl */ `
    varying float vCauda;
    varying float vLarg;
    varying float vVivo;

    void main(){
      if (vVivo < 0.004) discard;
      // Borda macia na largura e apagamento ao longo do rastro.
      float perfil = (1.0 - smoothstep(0.0, 1.0, abs(vLarg)));
      float rastro = pow(1.0 - vCauda, 2.2);
      float a = perfil * rastro * vVivo;
      if (a <= 0.004) discard;

      // A cabeça é quase branca; o rastro pega a cor viva do cenário.
      vec3 col = mix(bioHue(vSeed), vec3(1.0), pow(1.0 - vCauda, 3.0) * 0.85);
      gl_FragColor = vec4(col * a * 2.4, a);
    }
  `,
});

// ---------------------------------------------------------------------------
// SERES MARINHOS.
//
// O que separa um peixe de uma folha que anda é a ONDA: o corpo dele não se
// desloca rígido, ele ondula, e a onda corre da cabeça para a cauda. É a mesma
// lição da asa da borboleta — o que identifica o bicho não é a forma parada,
// é como a forma se deforma.
//
// `aSpan` vai de 0 na cabeça a 1 na ponta da cauda, e a amplitude cresce com
// ele: a cabeça quase não mexe, a cauda varre. O contrário — amplitude
// uniforme — dá uma tábua balançando.
// ---------------------------------------------------------------------------
export const fishMaterial = make('peixes', {
  side: DoubleSide,
  transparent: true,
  depthWrite: false,
  vert: /* glsl */ `
    attribute float aSpan;    // 0 cabeça .. 1 cauda
    attribute float aSeed;
    varying float vSpan;

    void main(){
      ${ROOT_AND_ATTR_SEED}
      vSpan = aSpan;

      // Batida lenta: peixe em cardume à deriva, não em fuga.
      float freq = (1.15 + vSeed * 0.5) * mix(0.6, 1.0, uCalm);
      float onda = sin(uTime * freq * 6.28318 - aSpan * 3.4 + vSeed * 7.0);

      vec3 p = position;
      // A onda corre no eixo do corpo e desloca de lado, crescendo para trás.
      p.x += onda * aSpan * aSpan * 0.055;
      // E a cauda gira um pouco em torno do próprio eixo, como leme.
      float torce = onda * aSpan * 0.35;
      float c = cos(torce), sn = sin(torce);
      float y = p.y, z = p.z;
      p.y = y * c - z * sn;
      p.z = y * sn + z * c;

      emit(p, normal);
    }
  `,
  frag: /* glsl */ `
    varying float vSpan;
    void main(){
      ${FRAG_FADE}
      // Dorso escuro, ventre claro: é a contra-sombra de quase todo peixe, e
      // é ela que dá volume a um corpo chapado.
      float ventre = smoothstep(-0.02, 0.03, vLocal.y);
      vec3 corpo = mix(leafColor(vSeed * 3.7) * 0.45,
                       chapeuClaro(vSeed), ventre);

      // Faixas transversais, apertando na cauda.
      float faixa = smoothstep(0.42, 0.5, abs(fract(vSpan * 7.0 + vSeed * 3.0) - 0.5));
      corpo = mix(corpo * 0.55, corpo, faixa);

      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      float iris = pow(1.0 - abs(dot(N, V)), 3.0);

      // Sem "nightBody" aqui, ao contrário da vegetação. Peixe é pequeno e
      // está sempre contra a água clara: escurecer o corpo o transforma numa
      // silhueta preta, e some a onda do nado, que é o que o identifica.
      vec3 col = enchant(corpo, vSeed + uTime * 0.03, 0.35);
      col *= 0.72 + 0.60 * wrapLight(N);
      col += bioHue(vSeed * 0.6) * iris * 1.2 * (0.4 + uGlow);
      // A linha lateral acesa, que é onde o peixe do fundo carrega a luz.
      float lateral = 1.0 - smoothstep(0.0, 0.009, abs(vLocal.y));
      col += bio(lateral * (0.5 + vSpan * 0.6), vSeed + 0.4, 2.2);

      gl_FragColor = vec4(filmic(col), (0.88 + 0.12 * vSpan) * vFade);
    }
  `,
});

// ---------------------------------------------------------------------------
// VAGA-LUMES — o campo de partículas que substituiu os orbes.
//
// Os orbes eram icosaedros sólidos de vinte faces pairando acima da cabeça:
// poliedro flutuando não lê como bicho, lê como geometria esquecida no ar.
// Um vaga-lume é um PONTO de luz, e um ponto custa a vigésima parte.
//
// Tudo acontece no vertex shader a partir da semente: a deriva, o tamanho, a
// fase do pisca. O JavaScript escreve as posições de origem uma vez e nunca
// mais toca — um campo de setecentos custa uma chamada de desenho.
// ---------------------------------------------------------------------------
export const fireflyFieldMaterial = make('campo-de-vagalumes', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: { uSize: { value: 42.0 } },
  vert: /* glsl */ `
    attribute float aSeed;
    uniform float uSize;

    void main(){
      vSeed = aSeed;
      float s = aSeed * 6.28318;

      // Deriva de três senóides sem razão simples entre as frequências: o
      // padrão leva minutos para se repetir, então nenhum deles anda em
      // círculo visível.
      vec3 p = position;
      p.x += sin(uTime * 0.110 + s) * 0.42 + sin(uTime * 0.047 + s * 2.3) * 0.24;
      p.z += cos(uTime * 0.093 + s * 1.7) * 0.40 + cos(uTime * 0.061 + s) * 0.21;
      p.y += sin(uTime * 0.071 + s * 3.1) * 0.28;

      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      vLocal = p;
      vNormalW = vec3(0.0, 1.0, 0.0);
      vec4 mv = viewMatrix * world;
      vFade = clamp(1.0 - (-mv.z - 7.0) / 11.0, 0.0, 1.0);
      gl_PointSize = uSize * (0.55 + aSeed * 0.85) / max(-mv.z, 0.30);
      gl_Position = projectionMatrix * mv;
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec2 uv = gl_PointCoord - 0.5;
      float d = dot(uv, uv);
      if (d > 0.25) discard;

      // Núcleo duro dentro de halo macio. Só o halo dá borrão de algodão; só
      // o núcleo dá pixel duro. É a soma dos dois que lê como luz pequena.
      float k = 1.0 - d * 4.0;
      float nucleo = pow(k, 6.0);
      float halo = pow(k, 1.6);

      // Pisca devagar, cada um no seu tempo. No mais rápido dá 0,21 Hz —
      // muito abaixo da faixa de 3 a 30 Hz que dispara crise em epilepsia
      // fotossensível — e ainda passa pelo amortecedor global.
      float fase = uTime * (0.10 + fract(vSeed * 3.3) * 0.11) + vSeed * 20.0;
      float acende = damp(pow(sin(fase) * 0.5 + 0.5, 3.0), 0.42);

      // E acendem quando você chega perto, como o resto da mata.
      float brilho = (0.22 + acende * 0.95 + presenca(vWorld) * 0.85) * vFade;
      if (brilho <= 0.004) discard;

      vec3 col = bioHue(vSeed * 0.7) * (halo * 0.50 + nucleo * 1.7);
      gl_FragColor = vec4(col * brilho * (0.55 + uGlow), 1.0);
    }
  `,
});

// ---------------------------------------------------------------------------
// CONSTELAÇÃO — pontos, não pedras.
//
// As estrelas eram icosaedros sólidos de raio 1 numa cúpula de escala 9: no
// céu isso não lê como estrela, lê como pedra flutuando. Estrela é ponto.
// ---------------------------------------------------------------------------
export const starPointMaterial = make('estrelas-da-constelacao', {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: { uSize: { value: 210.0 } },
  vert: /* glsl */ `
    attribute float aSeed;
    uniform float uSize;
    void main(){
      vSeed = aSeed;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz; vLocal = position; vNormalW = vec3(0.0, 1.0, 0.0);
      vec4 mv = viewMatrix * world;
      vFade = 1.0;
      gl_PointSize = uSize * (0.7 + aSeed * 0.6) / max(-mv.z, 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  frag: /* glsl */ `
    void main(){
      vec2 uv = gl_PointCoord - 0.5;
      float d = dot(uv, uv);
      if (d > 0.25) discard;
      float k = 1.0 - d * 4.0;
      // Núcleo pequeno e halo largo: é o que dá o "brilho" de estrela sem
      // precisar de nenhuma cruz de difração desenhada.
      float luz = pow(k, 7.0) * 1.8 + pow(k, 1.4) * 0.35;
      // Cintila devagar, cada uma no seu tempo, e amortecida.
      float cintila = damp(0.72 + 0.28 * sin(uTime * 0.22 + vSeed * 31.0), 0.80);
      gl_FragColor = vec4(bioHue(0.08 + vSeed * 0.2) * luz * cintila, 1.0);
    }
  `,
});
