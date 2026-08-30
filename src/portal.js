import {
  Group, Mesh, Points, PlaneGeometry, BufferGeometry, BufferAttribute,
  VideoTexture, LinearFilter, SRGBColorSpace,
  Vector3, Quaternion, Matrix4, Plane, Ray,
} from '../vendor/three/three.module.min.js';
import {
  portalMaterial, portalBordaMaterial, cloneMaterial,
} from './shaders/materials.js';

/**
 * O PORTAL — a animação passando dentro do cômodo.
 *
 * Ela fica pousada numa parede, do tamanho de um quadro, rodando em silêncio:
 * uma janela para o lugar de onde tudo isto veio. Apontar e pinçar LIGA O SOM
 * — a trilha recua para debaixo dele. Pinçar de novo devolve o silêncio.
 *
 * ELA NÃO CRESCE. Já cresceu: virava tela de cinema, e antes disso chegou a
 * ser plantada dois metros e meio à frente da cabeça, o que num cômodo comum
 * é do lado de fora. Mas o tamanho não era o que faltava. Uma janela do
 * tamanho de um quadro, com som, já é uma janela; inchada até ocupar a parede
 * ela vira televisão, e televisão é o oposto de portal — passa a competir com
 * o cômodo em vez de abrir um buraco nele.
 *
 * O que sobrou do gesto é o que ele sempre foi de fato: prestar atenção. O
 * som entra, a orla acende, e a animação deixa de ser papel de parede.
 *
 * E a borda não é uma borda: é um rasgo. Um retângulo nítido lê como quadro
 * pendurado. As margens se desmancham em ruído e num anel de partículas, que
 * é o mesmo vocabulário do resto da cena.
 */

const _p = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _n = new Vector3();
const _lado = new Vector3();
const _up = new Vector3(0, 1, 0);
const _plano = new Plane();
const _raio = new Ray();
const _hit = new Vector3();
const FRENTE = new Vector3(0, 0, 1);

/** Proporção do arquivo: 1280 x 714. */
const PROPORCAO = 1280 / 714;

/** Meia largura na parede. Um quadro, e é sempre este tamanho. */
const L_PAREDE = 0.46;
/** Segundos da transição de atenção — som entrando, orla acendendo. */
const DURACAO = 0.9;

/** Partículas do anel que contorna o rasgo. */
const BORDA = 900;

export class Portal extends Group {
  /** @param {string} url caminho do arquivo de vídeo */
  constructor(url = 'assets/animacao.mp4') {
    super();
    this.name = 'portal';
    this.frustumCulled = false;
    this.visible = false;

    // O elemento de vídeo nunca entra no documento visível: ele existe só
    // para alimentar a textura. `playsInline` é o que impede o iOS de
    // sequestrar a reprodução para tela cheia.
    const v = document.createElement('video');
    v.src = url;
    v.loop = true;
    v.muted = true;            // começa mudo: é o único jeito de tocar sozinho
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.setAttribute('playsinline', '');
    v.style.display = 'none';
    this.video = v;
    this.pronto = false;
    v.addEventListener('canplay', () => { this.pronto = true; }, { once: true });

    const tex = new VideoTexture(v);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = SRGBColorSpace;
    this.texture = tex;

    // Plano de 2x2: vLocal vai de -1 a 1 e o shader raciocina em coordenada
    // normalizada, do centro à borda, sem saber o tamanho em metros.
    // cloneMaterial e não clone(): o clone cru duplica também os uniforms
    // globais, e aí o portal congela no tempo e para de acompanhar a cena.
    this.mat = cloneMaterial(portalMaterial, { uVideo: tex });
    this.tela = new Mesh(new PlaneGeometry(2, 2, 1, 1), this.mat);
    this.tela.frustumCulled = false;
    this.tela.renderOrder = 7;
    this.add(this.tela);

    // O anel de partículas, em coordenada normalizada também: o mesmo
    // gabarito serve para a janela e para a tela grande.
    const pos = new Float32Array(BORDA * 3);
    const sem = new Float32Array(BORDA);
    for (let i = 0; i < BORDA; i++) {
      const t = i / BORDA;
      // Percorre o perímetro do retângulo e espalha um pouco para fora, com
      // viés para perto da borda: o rasgo é denso na margem e rarefeito longe.
      const s = t * 4;
      let x, y;
      if (s < 1) { x = -1 + s * 2; y = -1; }
      else if (s < 2) { x = 1; y = -1 + (s - 1) * 2; }
      else if (s < 3) { x = 1 - (s - 2) * 2; y = 1; }
      else { x = -1; y = 1 - (s - 3) * 2; }
      const fora = Math.pow((i * 0.6180339887) % 1, 2.2) * 0.22;
      const ang = i * 2.39996;
      pos[i * 3] = x * (1 + fora) + Math.cos(ang) * fora * 0.5;
      pos[i * 3 + 1] = y * (1 + fora) + Math.sin(ang) * fora * 0.5;
      pos[i * 3 + 2] = (((i * 0.7548776662) % 1) - 0.5) * 0.06;
      sem[i] = (i * 0.3819660113) % 1;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(sem, 1));
    this.borda = new Points(geo, portalBordaMaterial);
    this.borda.frustumCulled = false;
    this.borda.renderOrder = 8;
    this.add(this.borda);

    // A pose é uma só: a da parede. `abertura` deixou de mexer no tamanho e
    // passou a ser só atenção — 0 é papel de parede em silêncio, 1 é a
    // animação com som e a orla acesa.
    this.pousado = { pos: new Vector3(), quat: new Quaternion(), meia: L_PAREDE };
    this.abertura = 0;
    this.destino = 0;
    this.temParede = false;
  }

  /**
   * Pendura o portal na parede mais longa que ainda não tem buraco negro.
   *
   * @param {Array} wallBases   pé de cada parede, em coordenadas locais
   * @param {Array} ocupadas    posições de mundo já usadas por outra coisa
   */
  applyWalls(wallBases, ocupadas = []) {
    this.temParede = false;
    if (!wallBases?.length) return this;

    // A mais longa de todas, mas dando preferência às que estão longe do que
    // já foi pendurado: dividir parede com um buraco negro faz os dois
    // brigarem pelo mesmo olhar.
    let melhor = null, melhorNota = -Infinity;
    for (const w of wallBases) {
      const dx = w.b.x - w.a.x, dz = w.b.y - w.a.y;
      const comp = Math.hypot(dx, dz);
      if (comp < 1.2) continue;
      const mx = w.a.x + dx * 0.5, mz = w.a.y + dz * 0.5;
      let perto = Infinity;
      for (const o of ocupadas) {
        perto = Math.min(perto, Math.hypot(o.x - mx - this.position.x,
          o.z - mz - this.position.z));
      }
      const nota = comp + Math.min(perto, 3) * 0.9;
      if (nota > melhorNota) { melhorNota = nota; melhor = { w, dx, dz, comp }; }
    }
    if (!melhor) return this;

    const { w, dx, dz, comp } = melhor;
    _lado.set(dx / comp, 0, dz / comp);
    _n.crossVectors(_up, _lado).normalize();
    // Vira para dentro do cômodo, como os buracos: a normal que sai do
    // produto vetorial depende de como o segmento foi lido, e metade das
    // paredes mostraria o verso.
    const meioX = w.a.x + dx * 0.5, meioZ = w.a.y + dz * 0.5;
    if (_n.x * meioX + _n.z * meioZ > 0) _n.negate();

    this.pousado.pos.set(meioX, w.y + 1.45, meioZ).addScaledVector(_n, 0.04);
    this.pousado.quat.setFromUnitVectors(FRENTE, _n);

    this.temParede = true;
    this.#aplicarPose();
    return this;
  }

  /** O portal existe nesta cena? */
  setEnabled(on) {
    this.visible = on && this.temParede;
    if (!this.visible) this.fechar();
    else this.#tocar();
    return this.visible;
  }

  /** Liga o som e acende a orla. A tela não muda de tamanho nem de lugar. */
  abrir() {
    if (!this.visible) return false;
    this.destino = 1;
    this.#tocar();
    return true;
  }

  fechar() { this.destino = 0; }

  alternar() {
    if (this.destino > 0.5) { this.fechar(); return false; }
    return this.abrir();
  }

  get abertoDeVez() { return this.abertura > 0.5; }

  /**
   * O portal está sob a mira? Devolve a distância até ele, ou null.
   *
   * O alvo é medido com folga na pose POUSADA — um quadro de noventa
   * centímetros a três metros é um alvo pequeno, e errar a mira num gesto que
   * precisa ser convidativo é pior do que acertar de raspão.
   */
  pickAlongRay(origem, direcao, alcance = 10) {
    if (!this.visible) return null;
    this.tela.updateWorldMatrix(true, false);
    _m.copy(this.tela.matrixWorld);
    _p.setFromMatrixPosition(_m);
    _n.set(0, 0, 1).applyQuaternion(_q.setFromRotationMatrix(_m)).normalize();

    _plano.setFromNormalAndCoplanarPoint(_n, _p);
    _raio.set(origem, direcao);
    if (!_raio.intersectPlane(_plano, _hit)) return null;

    const t = _hit.distanceTo(origem);
    if (t < 0.05 || t > alcance) return null;

    // Para coordenada local da tela: o plano tem 2x2, então |u| e |v| <= 1
    // caem dentro dela.
    _hit.applyMatrix4(_m.invert());
    const folga = 1.35;   // alvo generoso: mira de mão treme
    if (Math.abs(_hit.x) > folga || Math.abs(_hit.y) > folga) return null;
    return t;
  }

  /** @param {number} dt segundos  @param {number} t tempo decorrido */
  update(dt, t) {
    if (!this.visible) return this.abertura;

    if (this.abertura !== this.destino) {
      const passo = dt / DURACAO;
      this.abertura = this.destino > this.abertura
        ? Math.min(this.destino, this.abertura + passo)
        : Math.max(this.destino, this.abertura - passo);
    }

    this.mat.uniforms.uAberto.value = this.abertura;
    portalBordaMaterial.uniforms.uAberto.value = this.abertura;
    return this.abertura;
  }

  /** Põe a tela na parede. Chamado uma vez, quando a parede é escolhida. */
  #aplicarPose() {
    const meia = this.pousado.meia;
    this.tela.position.copy(this.pousado.pos);
    this.tela.quaternion.copy(this.pousado.quat);
    this.tela.scale.set(meia, meia / PROPORCAO, 1);

    this.borda.position.copy(this.tela.position);
    this.borda.quaternion.copy(this.tela.quaternion);
    this.borda.scale.copy(this.tela.scale);
  }

  /**
   * Toca. Um `play()` recusado não é erro: em alguns navegadores ele só passa
   * depois de um gesto, e o gesto virá — quando vier, este método é chamado
   * de novo e a reprodução começa.
   */
  #tocar() {
    const p = this.video.play?.();
    if (p?.catch) p.catch(() => { /* espera o gesto */ });
  }

  dispose() {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.texture.dispose();
    this.tela.geometry.dispose();
    this.borda.geometry.dispose();
    this.mat.dispose();
    this.clear();
  }
}
