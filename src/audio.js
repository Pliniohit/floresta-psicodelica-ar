/**
 * Trilha gerada em tempo real: um drone de três osciladores desafinados
 * passando por um filtro que respira, mais um delay longo. Sem nenhum
 * arquivo de áudio — combina com a floresta, que também não tem texturas.
 */
export class Ambience {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.muted = false;
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
    setTimeout(() => { this.ctx?.close(); this.ctx = null; }, 900);
  }
}
