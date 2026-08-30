import {
  Group, Mesh, InstancedMesh, Points, BufferGeometry, BufferAttribute,
  SphereGeometry, TorusGeometry, Matrix4, Vector3, Quaternion, Euler,
} from '../vendor/three/three.module.min.js';
import {
  planetMaterial, atmosferaMaterial, solMaterial, trailMaterial, cloneMaterial,
} from './shaders/materials.js';
import { rng } from './forest.js';
import { CENAS } from './cenas.js';

/**
 * A cena do espaço, para onde a borboleta leva.
 *
 * Planetas ficam ao alcance do braço de propósito: a graça é poder pegá-los.
 * Escala de brinquedo, distância de mesa — se estivessem em escala real seriam
 * pontos no céu e não haveria nada para fazer.
 *
 * E ficam PARADOS no mundo. A cúpula do céu acompanha a cabeça, porque céu não
 * se aproxima; planeta ao alcance da mão é o oposto — se ele te seguisse, você
 * nunca conseguiria dar a volta nele, e a cena inteira pareceria colada ao
 * rosto. Andar tem que aproximar.
 */

const PLANETS = 7;
/** Escala a partir da qual o planeta se abre e você atravessa para o mundo dele. */
export const ENTER_SCALE = 3.4;
const MIN_SCALE = 0.5;
const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _s2 = new Vector3();
const _acc = new Vector3();
const _d = new Vector3();
const _p2 = new Vector3();
/** Direção do planeta para o sol. Guardado à parte porque `_d` é reciclado
 * dentro do laço de pares, e amortecer na direção errada derrubava todo
 * mundo dentro da estrela. */
const _rad = new Vector3();

/** Espessura da atmosfera: 26% do raio do corpo. */
const ATM = 1.26;

/**
 * A DISTÂNCIA MÍNIMA entre dois planetas, em raios somados.
 *
 * Não basta as superfícies não se tocarem. O que se vê não é a esfera, é a
 * ATMOSFERA — e duas cascas de gás se atravessando lêem exatamente como dois
 * planetas encostados, por mais que a rocha ainda tenha folga. Então a folga
 * é medida entre as cascas, com um resto de céu preto entre elas.
 */
const FOLGA = ATM * 1.06;
/**
 * Uma esfera unitária para todas as cascas. Cada planeta a escala; o shader
 * lê o raio de mundo da própria matriz, então não há nada por planeta na
 * geometria — sete cascas, uma malha.
 */
const SFERA_AR = new SphereGeometry(1, 20, 14);

/** Altura do centro do sistema: peito de quem está de pé. */
const CENTRO_Y = 1.25;

/**
 * O SOL, E O QUE ELE MUDA.
 *
 * Antes o que segurava o enxame era uma mola linear para o centro — força
 * proporcional à distância, como um elástico. Funcionava, mas produzia
 * movimento harmônico: todo mundo com o mesmo período, indo e voltando pelo
 * meio da sala. Não era um sistema solar, era um punhado de pêndulos.
 *
 * Com uma estrela no centro a lei passa a ser a de verdade, GM/r², e o
 * sistema ganha o que só ela dá: quem está perto corre, quem está longe
 * arrasta-se, as órbitas fecham em elipse, e as passagens rasantes acontecem
 * porque duas elipses se cruzam — não porque dois elásticos coincidiram.
 *
 * `GM` está calibrado para o raio médio do enxame: a 1,5 m a volta completa
 * leva meio minuto, devagar o bastante para acompanhar com os olhos.
 */
/**
 * A ESTRELA MORA LÁ EM CIMA, e não no meio do enxame.
 *
 * Ela nasceu no centro do sistema, que é o certo — mas o centro do sistema
 * fica na altura do peito, dentro da sala, e ali uma estrela com coroa ocupa
 * o lugar por onde você anda e por onde os planetas passam. Era a coisa mais
 * volumosa da cena justamente onde há menos espaço.
 *
 * Subindo para acima do teto ela vira o que uma estrela deve ser: distante,
 * pequena no céu, e a FONTE DA LUZ. É de lá que vem o dia e a noite de cada
 * planeta, e é por isso que agora dá para ver a sombra atravessando cada um
 * deles — a linha do terminador some por baixo, onde o sol não alcança.
 *
 * O preço, dito na cara: o centro de gravidade continua onde estava, no meio
 * do enxame, e não coincide mais com a estrela. Os planetas orbitam o
 * baricentro do sistema; a estrela ilumina de cima. É uma licença, e é o que
 * cabe num cômodo — a alternativa honesta seria pôr os planetas a trinta
 * metros de altura, e aí não haveria nada para pegar com a mão.
 */
const SOL_ALTURA = 3.6;   // acima do teto lido, dentro do céu virtual
const SOL_LADO = 1.4;     // deslocado do eixo: sol a pino não faz sombra

/**
 * OS DOIS PÓLOS.
 *
 * Este mesmo sistema serve ao Olho e ao Núcleo, e não por economia: é o
 * argumento de Raízes Cósmicas escrito em código. Em cima uma estrela e
 * planetas; embaixo o magma e sementes. Um corpo quente no centro, coisas
 * girando em volta ao alcance do braço, e a mesma pinça de duas mãos para
 * ampliar e entrar. Se as duas pontas do eixo são a mesma coisa vista de
 * lados opostos, elas têm de ser o mesmo código com o sinal trocado — e são.
 *
 * Descendo, a fonte fica ABAIXO do piso. A luz passa a vir de baixo, e é isso
 * que muda tudo na leitura: sombra subindo em vez de descendo é a assinatura
 * de estar por cima de uma coisa acesa.
 */
const NUCLEO_FUNDO = -1.9;   // abaixo do piso do cômodo
const R_SOL = 0.30;       // maior, porque agora está longe
const COROA = 2.8;        // a coroa vai até quase três raios solares
const GM = 0.145;         // parâmetro gravitacional: v² = GM/r na órbita circular
const R_MIN = 0.62;       // ninguém chega mais perto que isto do sol
const R_MAX = 2.15;       // nem se afasta além do alcance do braço
const CERCA = 2.2;        // dureza das duas barreiras acima
const G = 0.10;           // gravidade entre planetas
const CONTATO = 11.0;     // dureza do contato; sempre vence a gravidade
/**
 * ATRITO RADIAL — e SÓ radial.
 *
 * O atrito antigo era isotrópico: frenava tudo por igual. Contra uma mola
 * linear isso apenas acomodava o enxame, mas contra a gravidade de uma
 * estrela é fatal — frear é perder momento angular, e perder momento angular
 * é cair. Em noventa segundos de teste os sete planetas espiralavam para
 * dentro do sol.
 *
 * Amortecer apenas a componente RADIAL preserva o momento angular por
 * construção: a órbita não decai, ela só arredonda. O que este atrito come é
 * a energia que os encontrões entre planetas injetam — que é exatamente a
 * que precisa ser comida para o sistema não se desmontar sozinho.
 */
const AMORTECE = 0.14;
const V_MAX = 1.3;        // m/s

/**
 * A MÃO NÃO TELEPORTA O PLANETA.
 *
 * Antes `carry` escrevia a posição direto, e por isso pegar um planeta não
 * era pegar coisa nenhuma: ele grudava no ponto da pinça, não tinha peso, não
 * empurrava ninguém e ao ser solto caía do repouso. Agora a mão puxa por uma
 * MOLA e quem move o planeta continua sendo a física.
 *
 * O ganho é tudo o que vem de graça junto: ele chega um instante depois da
 * mão (é a inércia que se sente na palma), o pequeno chega mais rápido que o
 * grande, ele afasta os outros enquanto passa, e a velocidade com que a mão
 * o largou já está na mão dele — soltar em movimento é arremessar.
 *
 * `OMEGA` é a frequência da mola. Amortecimento crítico (2·ω) para ela chegar
 * e parar, sem oscilar em volta da mão — mola subamortecida num objeto preso
 * à palma vira tremor, e tremor a trinta centímetros do olho embrulha.
 *
 * O amortecimento é medido contra a velocidade DA MÃO, não contra zero. Sem
 * isso a mola cobra um pedágio constante enquanto a mão se move — quinze
 * centímetros de atraso permanente na medição, que a mão sente como elástico,
 * não como peso. Descontando a velocidade da mão, o atraso passa a aparecer
 * só quando ela ACELERA, que é exatamente onde inércia se sente de verdade.
 */
const OMEGA = 22.0;       // rad/s na massa mais leve
const V_ARREMESSO = 1.7;  // m/s: teto do arremesso, para não cruzar a sala
const _v2 = new Vector3();
const _up = new Vector3(0, 1, 0);
const _e2 = new Euler();

export class Space extends Group {
  constructor() {
    super();
    this.name = 'espaco';
    this.frustumCulled = false;
    this.visible = false;
    this.progress = 0;      // 0 floresta .. 1 espaço

    const r = rng(90210);
    this.planets = [];

    // Um único InstancedMesh não serve aqui: cada planeta precisa de matriz
    // própria mexida pela mão, e são só sete — sete draw calls é barato.
    for (let i = 0; i < PLANETS; i++) {
      // Menores que bola de praia: sete planetas de meio metro num quarto
      // ficam ombro a ombro, e enxame apertado lê como aglomerado sólido por
      // mais que a física garanta que ninguém se toca.
      const raio = 0.13 + r() * 0.25;
      // Material por planeta: cada um carrega a cor do bioma que guarda. O
      // programa de shader continua sendo um só, então o custo é de uniforms.
      // cloneMaterial e não clone(): o clone cru duplica também os uniforms
      // globais, e aí o planeta congela no tempo e não acompanha mais a cena.
      const cena = CENAS[i % CENAS.length];
      const mat = cloneMaterial(planetMaterial, {
        uTint: cena.folha[1].clone(),
        uElement: i % 3,
      });
      // Identidade fixa: é ela que decide se o planeta é gasoso, rochoso ou
      // gelado, e ela não pode mudar enquanto ele orbita.
      mat.uniforms.uSeed.value = r();

      const corpo = new Mesh(new SphereGeometry(raio, 20, 14), mat);
      corpo.frustumCulled = false;

      const grupo = new Group();
      grupo.add(corpo);

      // A ATMOSFERA. Uma casca 26% maior que o corpo, dentro da qual o shader
      // integra o gás ao longo do raio de visão. A malha é só o volume onde
      // isso acontece — ela não é a coisa que se vê.
      //
      // A cor vem do elemento, e é o que mais distingue um planeta do outro
      // de longe: o mundo de água tem céu azul e o de fogo, um ar sulfuroso.
      const arCor = [
        new Vector3(0.42, 0.66, 1.00),   // terra — o azul do espalhamento
        new Vector3(1.00, 0.52, 0.22),   // fogo — poeira alta e enxofre
        new Vector3(0.36, 0.86, 0.88),   // água — turquesa úmido
      ][i % 3];
      const matAr = cloneMaterial(atmosferaMaterial, {
        uTint: arCor,
        uElement: i % 3,
        uRazao: 1 / ATM,
        // Gasoso denso, rochoso rarefeito: sem essa variação as sete cascas
        // ficam iguais e a atmosfera vira um verniz aplicado em série.
        uDens: 0.7 + r() * 0.8,
      });
      matAr.uniforms.uSeed.value = mat.uniforms.uSeed.value;
      const ar = new Mesh(SFERA_AR, matAr);
      ar.scale.setScalar(raio * ATM);
      ar.frustumCulled = false;
      // Depois do corpo: ela é aditiva e não escreve profundidade, então
      // precisa encontrar o planeta já desenhado para pousar por cima.
      ar.renderOrder = 20;
      grupo.add(ar);

      // Anéis em alguns, inclinados.
      if (r() < 0.4) {
        // Anel com o mesmo material do corpo: aditivo fazia o anel brilhar
        // e sumir conforme o ângulo, que lia como piscada.
        const anel = new Mesh(
          new TorusGeometry(raio * 1.9, raio * 0.045, 5, 36), mat);
        anel.rotation.x = Math.PI / 2 + (r() - 0.5) * 0.7;
        anel.rotation.z = (r() - 0.5) * 0.5;
        anel.frustumCulled = false;
        grupo.add(anel);
      }

      // Posição e velocidade iniciais em vez de uma órbita escrita à mão: a
      // trajetória passou a ser resultado de força, não de fórmula, e é o que
      // permite eles se desviarem uns dos outros.
      // Nasce num lugar que não colide com ninguém. Sortear às cegas fazia
      // dois planetas começarem um dentro do outro, e a física nasce então
      // tendo que consertar em vez de manter.
      let ang = 0, dist = 1.2;
      for (let tentativa = 0; tentativa < 200; tentativa++) {
        dist = 0.75 + r() * 1.25;
        ang = r() * Math.PI * 2;
        // Nasce quase no plano da eclíptica, com uma inclinação pequena: um
        // sistema real é chato, e é a chatura que deixa ver que é um sistema.
        const incl = (r() - 0.5) * 0.5;
        grupo.position.set(
          Math.cos(ang) * dist,
          CENTRO_Y + Math.sin(incl) * dist * 0.5,
          Math.sin(ang) * dist,
        );
        const livre = this.planets.every((o) => grupo.position.distanceTo(o.position)
          > (raio + o.userData.raio) * FOLGA + 0.10);
        if (livre) break;
      }

      // A VELOCIDADE CIRCULAR daquele raio: sqrt(GM/r). Sorteá-la, como
      // antes, dava órbitas que ora escapavam ora despencavam, e a física
      // passava o tempo todo consertando. Nascendo na velocidade certa, a
      // órbita já é estável no primeiro quadro, e o que a perturba dali em
      // diante são só os outros planetas — que é a graça.
      const rad = Math.hypot(grupo.position.x, grupo.position.z) || dist;
      const vc = Math.sqrt(GM / Math.max(rad, R_MIN));
      // Todos no mesmo sentido, como num sistema que nasceu de um só disco.
      const vel = new Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(vc);
      vel.y = (r() - 0.5) * 0.05;

      grupo.userData = {
        // O elemento e a cor de nascença, guardados: no Núcleo os dois são
        // trocados por magma, e ao voltar para o Olho eles precisam existir
        // para serem devolvidos. Sem isto o enxame ia para o fogo e não
        // voltava mais.
        elemento: i % 3, tintaOlho: arCor.clone(), tintaCorpo: cena.folha[1].clone(),
        corpo, ar, raio, mat, mats: [mat, matAr], vel, preso: false,
        alvo: null, bioma: cena.id,
        massa: raio * raio * raio,     // massa vai com o volume, como convém
        giro: 0.06 + r() * 0.16,
      };
      this.planets.push(grupo);
      this.add(grupo);
    }

    // --- A ESTRELA ---------------------------------------------------------
    // Ela é o centro de tudo: da gravidade, da luz e da composição. Sem um
    // corpo visível ali, os planetas orbitavam um ponto vazio — e o olho lia
    // isso como sete coisas girando à toa.
    this.sol = new Group();
    this.polo = 1;
    this.#porSol();
    const corpoSol = new Mesh(new SphereGeometry(R_SOL, 24, 16), solMaterial);
    corpoSol.frustumCulled = false;
    this.sol.add(corpoSol);

    // A coroa é a mesma atmosfera dos planetas, com o gás muito mais alto e
    // quente. Reaproveitar aqui não é economia: é o mesmo fenômeno: gás fino
    // integrado ao longo do raio de visão, que acende no limbo.
    this.matCoroa = cloneMaterial(atmosferaMaterial, {
      uWarp: 0,
      uTint: new Vector3(1.00, 0.74, 0.38),
      uSeed: 0.31,
      uRazao: 1 / COROA,
      // Densa e MUITO alta: é a coroa que faz a estrela ler como fonte de
      // luz. Sem ela o corpo sozinho vira uma bolinha amarela no meio da
      // sala, por mais branco que se pinte o disco.
      uDens: 1.6,
      uSolPonto: 0,
      uAuto: 1,
    });
    const coroa = new Mesh(SFERA_AR, this.matCoroa);
    coroa.scale.setScalar(R_SOL * COROA);
    coroa.frustumCulled = false;
    coroa.renderOrder = 20;
    this.sol.add(coroa);
    this.add(this.sol);

    // Sem campo de estrelas em Points aqui: pontos de um pixel numa casca
    // distante serrilham a cada movimento de cabeça, e era isso que fazia o
    // espaço piscar. As estrelas do espaço vêm do shader do céu, onde nascem
    // no centro de uma célula e somem suavemente na borda.
  }

  /**
   * Troca o pólo: +1 é o Olho (estrela em cima, planetas), -1 é o Núcleo
   * (magma embaixo, sementes).
   *
   * Só a FONTE muda de lugar e de cor. As órbitas, o contato, a separação, os
   * buracos e o pegar com a mão continuam exatamente os mesmos — e é essa
   * indiferença que faz o sistema dizer o que a experiência quer dizer.
   */
  setPolo(p) {
    const novo = p < 0 ? -1 : 1;
    if (novo === this.polo) return this.polo;
    this.polo = novo;
    this.#porSol();
    solMaterial.uniforms.uNucleo.value = novo < 0 ? 1 : 0;
    this.matCoroa.uniforms.uTint.value.set(
      ...(novo < 0 ? [1.00, 0.36, 0.10] : [1.00, 0.74, 0.38]));

    // OS CORPOS TAMBÉM VIRAM. Lá em cima são planetas — terra, fogo, água. Cá
    // embaixo são sementes incandescentes, e todas do mesmo elemento, porque
    // no magma não há três: há uma temperatura só. O que distingue uma da
    // outra continua sendo a semente de cada uma, que não muda nunca — e é
    // ela que garante que a semente que guarda A Gota seja sempre a mesma.
    for (const g of this.planets) {
      const u = g.userData;
      u.mat.uniforms.uElement.value = novo < 0 ? 1 : u.elemento;
      if (novo < 0) {
        u.mat.uniforms.uTint.value.set(1.00, 0.40, 0.12);
        u.mats[1].uniforms.uTint.value.set(1.00, 0.46, 0.16);
      } else {
        u.mat.uniforms.uTint.value.copy(u.tintaCorpo);
        u.mats[1].uniforms.uTint.value.copy(u.tintaOlho);
      }
    }
    return this.polo;
  }

  #porSol() {
    if (this.polo > 0) {
      this.sol.position.set(SOL_LADO, SOL_ALTURA, -SOL_LADO * 0.7);
    } else {
      // Quase no eixo: o magma é o fundo do poço, e um fundo de poço
      // deslocado não lê como fundo.
      this.sol.position.set(SOL_LADO * 0.25, NUCLEO_FUNDO, -SOL_LADO * 0.2);
    }
  }

  /** 0 esconde tudo, 1 mostra por inteiro. */
  setProgress(v) {
    this.progress = v;
    this.visible = v > 0.01;
    for (const g of this.planets) {
      for (const m of g.userData.mats) m.uniforms.uWarp.value = v;
    }
    solMaterial.uniforms.uWarp.value = v;
    this.matCoroa.uniforms.uWarp.value = v;
    return v;
  }

  /**
   * Redimensiona o planeta na mão. Devolve true quando ele passa do limiar —
   * é o momento de atravessar para o mundo dele.
   */
  scaleHeld(planeta, fator) {
    const s = Math.min(ENTER_SCALE + 0.4, Math.max(MIN_SCALE, fator));
    planeta.scale.setScalar(s);
    // Acende conforme se aproxima do limiar.
    const brilho = Math.max(0, (s - 1.6) / (ENTER_SCALE - 1.6));
    for (const m of planeta.userData.mats) m.uniforms.uGrow.value = brilho;
    return s >= ENTER_SCALE;
  }

  /** Devolve todos os planetas ao tamanho normal. */
  resetScales() {
    for (const g of this.planets) {
      g.scale.setScalar(1);
      for (const m of g.userData.mats) m.uniforms.uGrow.value = 0;
    }
  }

  /**
   * Os portais por onde se atravessa, em coordenadas de mundo. Vêm dos
   * buracos abertos nas paredes; sem pelo menos dois, ninguém atravessa nada.
   */
  setPortais(lista = []) {
    this.portais = lista;
    return this;
  }

  /**
   * A FÍSICA DO ENXAME.
   *
   * Deixou de ser uma órbita escrita à mão e virou força. São três:
   *
   * Uma mola fraca para o centro, que é o que segura o enxame ao seu redor
   * em vez de deixá-lo escapar pela sala. Ela é linear, então o movimento que
   * ela produz é harmônico e estável — nada de planeta despencando no centro.
   *
   * A gravidade entre eles, que é o que dá o desvio mútuo e as passagens
   * rasantes.
   *
   * E o CONTATO, que é o que os impede de se tocar. Ele é sempre mais forte
   * que a gravidade na distância em que as superfícies se encostam, senão
   * dois planetas pesados se atravessariam.
   */
  update(t, dt) {
    if (!this.visible) return;

    // Onde a estrela está EM MUNDO. Os shaders iluminam a partir daqui, e o
    // grupo inteiro nasce onde o usuário estava — então isto muda de sessão
    // para sessão e precisa ser publicado, não fixado.
    this.sol.getWorldPosition(_p2);
    for (const g of this.planets) {
      for (const m of g.userData.mats) {
        m.uniforms.uSol.value.copy(_p2);
        m.uniforms.uSolPonto.value = 1;
      }
    }

    // Um passo grande faz o contato explodir: a repulsão é dura, e integrar
    // com dt de um quadro perdido lançaria o planeta para fora da sala.
    const passo = Math.min(dt, 1 / 45);

    for (let i = 0; i < this.planets.length; i++) {
      const a = this.planets[i];
      a.userData.corpo.rotation.y = t * a.userData.giro;
      const pa = a.position;
      const ra = a.userData.raio * a.scale.x;

      // NA MÃO: a mola substitui as forças do enxame, mas a integração é a
      // mesma — ele continua sendo um corpo com velocidade, e é por isso que
      // ainda empurra os outros e sai arremessado quando solto.
      if (a.userData.preso) {
        const alvo = a.userData.alvo;
        if (alvo) {
          // Velocidade da mão, do quadro anterior para este.
          const ant = a.userData.alvoAnt;
          _v2.copy(alvo).sub(ant).divideScalar(passo);
          if (_v2.lengthSq() > 36) _v2.setLength(6);   // salto de rastreamento
          ant.copy(alvo);

          // Mais pesado, mola mais mole: o planeta grande chega atrasado e
          // ultrapassa menos. É toda a diferença de peso que se sente.
          const w = OMEGA / (1 + a.userData.massa * 4.0);
          const v = a.userData.vel;
          _d.copy(alvo).sub(pa);
          v.addScaledVector(_d, w * w * passo);
          v.addScaledVector(_v2.sub(v), Math.min(1, 2.0 * w * passo));
          if (v.lengthSq() > 36) v.setLength(6);   // teto de sanidade
          pa.addScaledVector(v, passo);

          // A mão pode levar o planeta para dentro da estrela, e a força
          // solar não a impede — ela só age sobre quem está livre. Aqui a
          // superfície do sol é uma parede: chega-se até ela e para.
          _v2.set(pa.x, pa.y - CENTRO_Y, pa.z);
          const rs = _v2.length();
          const minimo = R_SOL + a.userData.raio * a.scale.x + 0.05;
          if (rs > 1e-4 && rs < minimo) {
            _v2.multiplyScalar(minimo / rs);
            pa.set(_v2.x, CENTRO_Y + _v2.y, _v2.z);
          }
        }
        continue;
      }
      // A ESTRELA. Amaciada em R_MIN para a aceleração não disparar se
      // alguém for jogado direto contra ela pela mão.
      _d.set(-pa.x, CENTRO_Y - pa.y, -pa.z);
      const rSol = Math.max(_d.length(), 1e-3);
      _rad.copy(_d).divideScalar(rSol);
      _acc.copy(_d).multiplyScalar(GM / (rSol * Math.max(rSol * rSol, R_MIN * R_MIN)));

      // As duas cercas: não cair no sol, não sumir sala afora. Só agem fora
      // da faixa, então dentro dela a órbita é kepleriana pura.
      if (rSol < R_MIN) _acc.addScaledVector(_d, -(R_MIN - rSol) * CERCA / rSol);
      if (rSol > R_MAX) _acc.addScaledVector(_d, (rSol - R_MAX) * CERCA / rSol);

      for (let j = 0; j < this.planets.length; j++) {
        if (i === j) continue;
        const b = this.planets[j];
        _d.copy(b.position).sub(pa);
        const dist = Math.max(_d.length(), 1e-3);
        _d.divideScalar(dist);

        _acc.addScaledVector(_d, G * b.userData.massa / (dist * dist + 0.30));

        // A folga é medida entre as SUPERFÍCIES, não entre os centros, e com
        // 6% de margem: eles chegam perto e param antes de encostar.
        const soma = (ra + b.userData.raio * b.scale.x) * FOLGA;
        if (dist < soma) _acc.addScaledVector(_d, (dist - soma) * CONTATO);
      }

      this.#sucao(pa, a.userData.raio);

      const v = a.userData.vel;
      v.addScaledVector(_acc, passo);
      v.addScaledVector(_rad, _rad.dot(v) * -Math.min(1, AMORTECE * passo));
      if (v.lengthSq() > V_MAX * V_MAX) v.setLength(V_MAX);
      pa.addScaledVector(v, passo);

      // Nunca abaixo do joelho nem acima do alcance: o enxame é para ser
      // pego com a mão, e um planeta no chão ou no teto sai do jogo.
      if (pa.y < 0.42) { pa.y = 0.42; v.y = Math.abs(v.y) * 0.5; }
      if (pa.y > 2.30) { pa.y = 2.30; v.y = -Math.abs(v.y) * 0.5; }

      this.#atravessar(a, ra);
    }

    this.#separar();
  }

  /**
   * SEPARA de verdade quem ficou sobreposto.
   *
   * A força de contato empurra, mas não garante nada: com passo grande, ou
   * com dois planetas se aproximando rápido, eles já entraram um no outro
   * antes de ela ter tempo de agir — o teste mediu 33 cm de interpenetração
   * com a força sozinha. Aqui eles são simplesmente afastados, o que torna a
   * invariante exata em vez de provável.
   *
   * Poucas passagens bastam: separar um par pode encostar noutro, e três
   * rodadas resolvem qualquer arranjo que caiba nesta sala.
   */
  #separar() {
    for (let rodada = 0; rodada < 3; rodada++) {
      let mexeu = false;
      for (let i = 0; i < this.planets.length; i++) {
        for (let j = i + 1; j < this.planets.length; j++) {
          const a = this.planets[i], b = this.planets[j];
          _d.copy(b.position).sub(a.position);
          let dist = _d.length();
          // Concêntricos: qualquer direção serve para desempatar.
          if (dist < 1e-4) { _d.set(1, 0, 0); dist = 1e-4; }
          const soma = (a.userData.raio * a.scale.x + b.userData.raio * b.scale.x)
            * (FOLGA - 0.06);
          if (dist >= soma) continue;

          _d.divideScalar(dist);
          const sobra = soma - dist;
          // Quem está na mão não cede: a mão é que manda na posição dele.
          // Quem está na mão quase não cede — mas CEDE. Zerado, ele virava
          // uma parede: dois planetas presos um em cada mão travavam de vez,
          // e um livre prensado entre a mão e outro não tinha para onde ir.
          // Com uma fresta, o empurrão sempre encontra saída.
          const pa = a.userData.preso, pb = b.userData.preso;
          const fa = pa ? (pb ? 0.5 : 0.12) : (pb ? 0.88 : 0.5);
          const fb = pb ? (pa ? 0.5 : 0.12) : (pa ? 0.88 : 0.5);
          a.position.addScaledVector(_d, -sobra * fa);
          b.position.addScaledVector(_d, sobra * fb);

          // Mata a aproximação, senão eles voltam a entrar no quadro seguinte.
          const va = a.userData.vel, vb = b.userData.vel;
          const rel = _d.dot(_p2.copy(vb).sub(va));
          if (rel < 0) {
            if (!pa) va.addScaledVector(_d, rel * 0.5);
            if (!pb) vb.addScaledVector(_d, -rel * 0.5);
          }
          mexeu = true;
        }
      }
      if (!mexeu) break;
    }
  }

  /**
   * A SUCÇÃO DO BURACO NEGRO.
   *
   * Antes o planeta só era teleportado quando por acaso passava rente ao
   * disco — e como nada o puxava para lá, a travessia era um acidente raro
   * que ninguém via acontecer. Agora o buraco PUXA: dentro do alcance de
   * captura ele vence a mola do centro, e o planeta é visivelmente arrastado,
   * acelerando conforme se aproxima, até sumir.
   *
   * A atração cresce com 1/d — não com 1/d², que na boca do buraco dispara
   * para o infinito e faz o planeta atravessar a parede antes de o teste de
   * travessia rodar. Aqui ela cresce forte o bastante para ser inescapável e
   * mansa o bastante para o passo de integração dar conta.
   *
   * O alcance é curto de propósito: fora dele o enxame continua orbitando
   * você, que é o que a cena pede. O buraco é um destino, não um sumidouro
   * que engole tudo em dez segundos.
   */
  #sucao(pa, raio) {
    const portais = this.portais;
    if (!portais || portais.length < 2) return;

    for (const b of portais) {
      _d.copy(b.pos).sub(pa);
      const dist = _d.length();
      const alcance = b.raio + 0.85 + raio;
      if (dist > alcance || dist < 1e-3) continue;
      _d.divideScalar(dist);
      // Cresce de zero na borda do alcance até a boca: assim o planeta não
      // ganha um tranco ao cruzar uma fronteira invisível.
      const perto = 1 - dist / alcance;
      _acc.addScaledVector(_d, (0.9 + 5.5 * perto * perto) * (1 / Math.max(dist, 0.25)));
    }
  }

  /**
   * Entrou num buraco, sai pelo outro.
   *
   * O teste é contra o PLANO da parede: perto dele e dentro do disco. Testar
   * só a distância ao centro do buraco deixaria passar o planeta que raspa a
   * borda, e ele atravessaria a parede sem portal nenhum.
   */
  #atravessar(planeta, raio) {
    const portais = this.portais;
    if (!portais || portais.length < 2) return;

    for (let k = 0; k < portais.length; k++) {
      const entrada = portais[k];
      _d.copy(planeta.position).sub(entrada.pos);
      const normal = _d.dot(entrada.normal);
      if (Math.abs(normal) > 0.30) continue;
      _p2.copy(_d).addScaledVector(entrada.normal, -normal);
      if (_p2.length() > entrada.raio * 0.85) continue;

      const saida = portais[(k + 1) % portais.length];
      // Sai já do lado de dentro do cômodo, com folga do próprio raio, senão
      // reentraria no mesmo quadro e ficaria preso indo e voltando.
      planeta.position.copy(saida.pos).addScaledVector(saida.normal, raio + 0.28);

      // E é CUSPIDO. Não basta virar a velocidade: quem entrou sugado tem de
      // sair com força, senão ele reaparece boiando na frente do outro
      // buraco e é imediatamente sugado de volta — um vaivém sem fim entre
      // os dois. A saída leva a energia da queda, com um piso generoso.
      const v = planeta.userData.vel;
      v.copy(saida.normal).multiplyScalar(Math.max(v.length(), 0.6) * 1.5);
      // Um pouco de desvio lateral, para ele não sair sempre na mesma reta.
      v.x += (entrada.normal.z - entrada.normal.x) * 0.15;
      v.y += 0.20;
      this.onTravessia?.(planeta, entrada, saida);
      return;
    }
  }

  /** Planeta ao alcance de `world`, ou null. */
  pick(world) {
    let melhor = null, dist = Infinity;
    for (const g of this.planets) {
      const d = g.getWorldPosition(_p).distanceTo(world);
      const limite = g.userData.raio * 1.9 + 0.12;
      if (d < limite && d < dist) { dist = d; melhor = g; }
    }
    return melhor;
  }

  /**
   * Planeta sob a mira. Sentado ou deitado não dá para alcançar uma órbita de
   * um metro e meio com o braço, então o alcance é a mira, não o alcance.
   */
  pickAlongRay(origem, direcao, alcance = 9) {
    let melhor = null, melhorT = Infinity;
    for (const g of this.planets) {
      g.getWorldPosition(_p);
      _p.sub(origem);
      const t = _p.dot(direcao);
      if (t < 0.05 || t > alcance) continue;
      _p.copy(origem).addScaledVector(direcao, t);
      // Corredor proporcional ao próprio planeta, com um piso generoso: os
      // pequenos ficariam impossíveis de acertar de longe.
      const raio = Math.max(g.userData.raio * g.scale.x * 1.8, 0.22);
      if (_p.distanceTo(g.getWorldPosition(_s2)) > raio) continue;
      if (t < melhorT) { melhorT = t; melhor = g; }
    }
    return melhor;
  }

  lift(planeta) {
    planeta.userData.preso = true;
    planeta.userData.alvo = (planeta.userData.alvo ?? new Vector3())
      .copy(planeta.position);
    planeta.userData.alvoAnt = (planeta.userData.alvoAnt ?? new Vector3())
      .copy(planeta.position);
    return planeta;
  }

  /**
   * A mão diz ONDE ela está; o planeta decide como chegar lá.
   *
   * Escrever a posição direto seria mais simples e é o que havia antes — e
   * era exatamente o que fazia o planeta não ter peso nenhum na mão.
   */
  carry(planeta, world) {
    this.worldToLocal(_p.copy(world));
    (planeta.userData.alvo ??= new Vector3()).copy(_p);
  }

  /** Solta o planeta: ele volta à órbita a partir de onde foi deixado. */
  /**
   * Solta o planeta. Ele parte do repouso e a mola do centro faz o resto —
   * herdar a velocidade da mão daria arremesso, e um planeta arremessado
   * atravessa a sala antes de a física conseguir segurá-lo.
   */
  drop(planeta) {
    planeta.userData.preso = false;
    planeta.userData.alvo = null;
    // A velocidade da mola JÁ É a velocidade da mão no instante em que ela
    // abriu — soltar parado devolve à órbita, soltar em movimento arremessa.
    // O teto existe porque a mola pode estar corrigindo um salto de
    // rastreamento, e um planeta a cinco metros por segundo cruza a sala
    // antes de a mola do centro conseguir segurá-lo.
    const v = planeta.userData.vel;
    if (v.lengthSq() > V_ARREMESSO * V_ARREMESSO) v.setLength(V_ARREMESSO);
  }

  /**
   * A MÃO COMO CORPO. Um planeta que não está sendo segurado ainda é
   * atingido por ela: dá para varrer o enxame com a palma, desviar um que
   * vem chegando, empurrar um de leve para o outro.
   *
   * A mão nunca cede — ela é o mundo, não um objeto da simulação. O que se
   * transfere é a velocidade dela, medida entre um quadro e o seguinte, e o
   * que não se transfere é a componente que já estava afastando os dois:
   * sem isso a mão parada continuaria bombeando energia no planeta que sai.
   *
   * @param {string} id    identifica a mão entre quadros
   * @returns {boolean}    houve toque (para o retorno háptico)
   */
  empurrar(id, world, raioMao, dt) {
    if (!this.visible || dt <= 0) return false;
    this.worldToLocal(_p.copy(world));

    const antes = (this.maos ??= new Map()).get(id);
    if (!antes) { this.maos.set(id, { pos: _p.clone(), vel: new Vector3() }); return false; }
    // Velocidade filtrada: a pose da mão treme, e derivar tremor cru daria
    // empurrões aleatórios num planeta parado ao lado da palma.
    _v2.copy(_p).sub(antes.pos).divideScalar(dt);
    antes.vel.lerp(_v2, 0.35);
    antes.pos.copy(_p);

    let tocou = false;
    for (const g of this.planets) {
      if (g.userData.preso) continue;
      _d.copy(g.position).sub(_p);
      let dist = _d.length();
      if (dist < 1e-4) { _d.set(0, 1, 0); dist = 1e-4; }
      const soma = g.userData.raio * g.scale.x + raioMao;
      if (dist >= soma) continue;

      _d.divideScalar(dist);
      g.position.addScaledVector(_d, soma - dist);

      const v = g.userData.vel;
      const rel = _d.dot(_p2.copy(v).sub(antes.vel));
      if (rel < 0) v.addScaledVector(_d, -rel * 1.5);   // devolve com um pouco de sobra
      if (v.lengthSq() > V_ARREMESSO * V_ARREMESSO) v.setLength(V_ARREMESSO);
      tocou = true;
    }
    return tocou;
  }

  /** A mão sumiu do rastreamento: esquecer a posição dela. */
  soltarMao(id) { this.maos?.delete(id); }

  dispose() {
    for (const g of this.planets) {
      g.traverse((o) => o.isMesh && o.geometry.dispose());
      for (const m of g.userData.mats) m.dispose();
    }
    this.sol.traverse((o) => o.isMesh && o.geometry.dispose());
    this.matCoroa.dispose();
    SFERA_AR.dispose();
    this.clear();
  }
}

/**
 * A TRAVESSIA — o que leva o mundo embora, nos dois sentidos.
 *
 * Para FORA: a borboleta sai do casulo e sobe, deixando rastro de luz.
 * Para DENTRO: a semente desce pela raiz, e o rastro é o que ela abre na
 * terra.
 *
 * Uma classe só para os dois porque a mecânica é literalmente a mesma — um
 * ponto viajando por uma curva, emitindo rastro, e um relógio de oito
 * segundos que o resto da cena consulta para dissolver o mundo. O que muda é
 * o sinal, a curva e se a borboleta vai junto.
 *
 * O rastro é um anel de posições reaproveitado: o índice mais velho é
 * sobrescrito a cada emissão, então o buffer nunca cresce e não há alocação
 * durante a animação.
 */
export class Emergence extends Group {
  constructor(criarNuvem, trailLength = 90) {
    super();
    this.name = 'eclosao';
    this.frustumCulled = false;
    this.visible = false;

    // Uma nuvem de capacidade 1: é a mesma borboleta das outras, só que
    // sozinha e maior — a protagonista da travessia.
    this.mesh = criarNuvem(1, 9001);
    this.mesh.count = 1;
    this.add(this.mesh);
    this._m = new Matrix4();
    this._q = new Quaternion();
    // A protagonista é maior que as do enxame, mas não é um planador: 2,2x
    // a envergadura base dá uns vinte e nove centímetros.
    this._e = new Vector3(2.2, 2.2, 2.2);

    this.n = trailLength;
    this.pos = new Float32Array(trailLength * 3);
    this.age = new Float32Array(trailLength).fill(1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aAge', new BufferAttribute(this.age, 1));
    this.trail = new Points(g, trailMaterial);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 12;
    this.add(this.trail);

    this.cursor = 0;
    this.t = 0;
    this.duration = 8.0;   // a travessia É a transição; sem pressa
    this.from = new Vector3();
    this.sentido = 1;      // +1 para fora, -1 para dentro
    this.active = false;
  }

  /**
   * Dispara a travessia a partir de `origem` (mundo).
   *
   * @param {THREE.Vector3} origem
   * @param {number} sentido  +1 sobe com a borboleta, -1 desce pela raiz
   */
  launch(origem, sentido = 1) {
    this.from.copy(origem);
    this.sentido = sentido < 0 ? -1 : 1;
    // Descendo, a borboleta não vai junto: quem desce é a semente, e ela é o
    // próprio rastro. Levar a borboleta para dentro da terra seria a imagem
    // errada — ela é o que sai, não o que entra.
    this.mesh.visible = this.sentido > 0;
    this.t = 0;
    this.active = true;
    this.visible = true;
    this.age.fill(1);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = origem.x; this.pos[i * 3 + 1] = origem.y; this.pos[i * 3 + 2] = origem.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAge.needsUpdate = true;
  }

  /** @returns {number} 0..1 de quanto da subida já passou */
  update(dt, t) {
    if (!this.active) return 0;
    this.t = Math.min(1, this.t + dt / this.duration);

    // A CURVA DOS DOIS SENTIDOS.
    //
    // Subindo, a borboleta acelera devagar e abre a espiral com a altura: o
    // expoente 2,4 deixa o começo demorado, e é isso que se lê como hesitação
    // ao sair do casulo.
    //
    // Descendo é o contrário em tudo, e de propósito. A semente CAI: começa
    // rápido, porque nada a segura, e a espiral FECHA conforme desce — como
    // uma raiz procurando o eixo em vez de abrir para o céu. O expoente menor
    // que 1 é o que produz essa pressa inicial.
    const desce = this.sentido < 0;
    const k = Math.pow(this.t, desce ? 0.75 : 2.4);
    const alcance = desce ? 9 : 16;
    const giro = this.t * (desce ? -6.5 : 5.5);
    const abre = desce ? 1.05 - this.t * 0.92 : 0.18 + this.t * 0.9;
    _p.set(
      this.from.x + Math.cos(giro) * abre,
      this.from.y + k * alcance * this.sentido,
      this.from.z + Math.sin(giro) * abre,
    );
    // A nuvem não tem position/rotation: ela tem uma lista de instâncias, e
    // esta tem uma só. A pose vai por matriz, como em qualquer instância.
    _e2.set(0, giro + Math.PI / 2, Math.sin(t * 2.2) * 0.22);
    this._q.setFromEuler(_e2);
    this._m.compose(_p, this._q, this._e);
    this.mesh.setMatrixAt(0, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;

    // Emite no anel, envelhecendo o resto.
    const i = this.cursor;
    this.pos[i * 3] = _p.x; this.pos[i * 3 + 1] = _p.y; this.pos[i * 3 + 2] = _p.z;
    this.age[i] = 0;
    this.cursor = (this.cursor + 1) % this.n;
    for (let j = 0; j < this.n; j++) this.age[j] = Math.min(1, this.age[j] + dt * 0.30);

    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAge.needsUpdate = true;

    if (this.t >= 1) { this.active = false; this.visible = false; }
    return this.t;
  }

  dispose() { this.trail.geometry.dispose(); this.clear(); }
}
