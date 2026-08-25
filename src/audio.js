/**
 * Onde a trilha mora. Se o arquivo existir, ele é A trilha; se não existir,
 * o drone gerado continua sendo. O primeiro que carregar ganha.
 *
 * O OPUS VEM PRIMEIRO, e não por tamanho.
 *
 * A trilha toca em laço, e mp3 não fecha laço: o formato guarda um atraso de
 * codificação e um enchimento no fim que o decodificador entrega junto com o
 * áudio. São alguns milissegundos de silêncio grudados nas duas pontas, e em
 * quatro minutos de música ambiente isso vira um soluço audível a cada volta.
 * O Opus carrega no contêiner quantas amostras descartar, e o navegador
 * devolve o buffer exato — o laço fecha sem costura.
 *
 * O mp3 continua na lista como reserva para quem não decodifica Opus.
 */
const TRILHA = ['assets/trilha.ogg', 'assets/trilha.mp3'];

/**
 * Som da experiência.
 *
 * Nasceu inteiro gerado em tempo real — um drone de osciladores desafinados
 * por um filtro que respira, mais um delay longo, sem arquivo nenhum, que era
 * o par certo para uma floresta que também não tem textura.
 *
 * Agora ele cede o lugar para uma trilha de verdade quando existe uma. O
 * drone não some: recua para um leito quase inaudível, e os sinos das
 * interações continuam por cima, porque eles são resposta ao gesto e não
 * música. Sem o arquivo, nada disso acontece e o drone segue sozinho.
 */
export class Ambience {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.muted = false;
    this.track = null;        // AudioBufferSourceNode em loop
    this.trackGain = null;
    this.trackFilter = null;
    this.hasTrack = false;
  }

  /** Precisa ser chamado de dentro de um gesto do usuário (clique / select). */
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Delay em pingue-pongue suave: dá profundidade sem reverb caro.
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.62;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    delay.connect(fb); fb.connect(delay); delay.connect(master);

    const filter = this.filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3.5;
    filter.connect(master);
    filter.connect(delay);

    // Ré menor esparso: fundamental, quinta, terça menor uma oitava acima.
    const voices = [
      { hz: 73.42, type: 'sawtooth', gain: 0.16, detune: -6 },
      { hz: 110.0, type: 'triangle', gain: 0.13, detune: +5 },
      { hz: 174.6, type: 'sine',     gain: 0.10, detune: -3 },
      { hz: 220.0, type: 'sine',     gain: 0.05, detune: +9 },
    ];
    this.voices = voices.map((v) => {
      const o = ctx.createOscillator();
      o.type = v.type; o.frequency.value = v.hz; o.detune.value = v.detune;
      const g = ctx.createGain(); g.gain.value = v.gain;
      o.connect(g); g.connect(filter); o.start();
      return { osc: o, gain: g, base: v.hz };
    });

    // LFO abrindo e fechando o filtro a cada ~23 s.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.043;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 300;
    lfo.connect(lfoAmt); lfoAmt.connect(filter.frequency);
    lfo.start();

    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4.0);

    // A trilha entra por um caminho próprio, sem passar pelo filtro do drone:
    // ela já vem mixada, e abafá-la com o passa-baixa da cena seria desfazer
    // o trabalho de quem a fez.
    this.trackFilter = ctx.createBiquadFilter();
    this.trackFilter.type = 'lowpass';
    this.trackFilter.frequency.value = 18000;
    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = 0;
    this.trackFilter.connect(this.trackGain);
    this.trackGain.connect(master);

    this.loadTrack();
  }

  /**
   * Procura a trilha e a coloca em loop. Não é erro não achar: o projeto
   * roda sem nenhum arquivo de áudio, e a ausência só significa que o drone
   * gerado continua sendo a trilha.
   *
   * @returns {Promise<boolean>} true se encontrou e começou a tocar
   */
  async loadTrack(caminhos = TRILHA) {
    const ctx = this.ctx;
    if (!ctx || this.hasTrack) return false;

    for (const url of caminhos) {
      let buf;
      try {
        // Cache normal, e não 'force-cache'.
        //
        // 'force-cache' devolve o que estiver guardado sem revalidar — e o
        // que estava guardado, para quem abriu o site antes de a trilha
        // existir, era um 404. A busca "falhava" contra um arquivo que já
        // estava no servidor, e a única saída era limpar o cache do
        // navegador. A trilha é grande, mas é um arquivo só e imutável: o
        // cache comum já a guarda, e ainda pergunta se mudou.
        const r = await fetch(url);
        if (!r.ok) continue;
        buf = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch {
        continue;   // não existe, ou o formato não decodifica neste navegador
      }
      if (!this.ctx) return false;    // parou enquanto carregava

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.trackFilter);
      src.start();
      this.track = src;
      this.hasTrack = true;

      const t = ctx.currentTime;
      // Entra em oito segundos. Uma trilha que começa de estalo denuncia o
      // carregamento; entrando devagar ela parece ter estado ali o tempo todo.
      this.trackGain.gain.setValueAtTime(0.0001, t);
      this.trackGain.gain.linearRampToValueAtTime(0.62, t + 8.0);
      // E o drone recua para leito. Não para zero: ele é o que sustenta a
      // cena quando a trilha respira.
      for (const v of this.voices) v.gain.gain.setTargetAtTime(v.gain.gain.value * 0.18, t, 3.0);
      return true;
    }
    return false;
  }

  /**
   * Cada cenário tem o seu timbre. O drone muda de fundamental e a trilha,
   * quando existe, passa por um passa-baixa próprio: no fundo do abismo as
   * altas somem, no fogo ela abre.
   *
   * Tudo com constante de tempo longa — a mudança acompanha a travessia da
   * borboleta em vez de saltar junto com a imagem.
   */
  setCena({ hz = 73.42, filtro = 420 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(filtro, t, 2.2);
    // As vozes acompanham a fundamental, mantendo os intervalos entre si.
    const base = this.voices[0]?.base ?? 73.42;
    for (const v of this.voices) {
      v.osc.frequency.setTargetAtTime(v.base * (hz / base), t, 2.6);
    }
    if (this.hasTrack) {
      this.trackFilter.frequency.setTargetAtTime(
        Math.max(1200, filtro * 26), t, 2.2);
    }
  }

  /** Sino curto disparado ao plantar ou trocar de paleta. */
  chime(semitone = 0, level = 0.22) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 293.66 * Math.pow(2, semitone / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); g.connect(this.filter ?? ctx.destination);
    o.start(t); o.stop(t + 2.3);
  }

  /** Modo "viagem" abre o filtro e sobe um pouco as vozes agudas. */
  setTrip(trip) {
    if (!this.ctx) return;
    if (this.hasTrack) this.trackGain.gain.setTargetAtTime(0.62 + trip * 0.18, this.ctx.currentTime, 1.5);
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(380 + trip * 900, t, 1.2);
    this.filter.Q.setTargetAtTime(3.5 + trip * 5.0, t, 1.2);
  }

  toggleMute() {
    if (!this.ctx) return false;
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.25);
    return this.muted;
  }

  stop() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => {
      try { this.track?.stop(); } catch { /* já parada */ }
      this.track = null;
      this.hasTrack = false;
      this.ctx?.close();
      this.ctx = null;
    }, 900);
  }
}
