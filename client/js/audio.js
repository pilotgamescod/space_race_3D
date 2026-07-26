// ════════════════════════════════════════════════════════════════════
//  AUDIO — sintesi procedurale con Web Audio, nessun file esterno
//  Tutto è generato: motore, colpi, esplosioni, allarmi.
//  Va inizializzato da un gesto dell'utente (il click su AVVIA), altrimenti
//  i browser tengono il contesto sospeso.
// ════════════════════════════════════════════════════════════════════

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // Compressore: senza questo, esplosioni e colpi sovrapposti saturano
    // e diventano un fruscio indistinto.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24;
    comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.22;
    this.bus = comp;
    comp.connect(this.master);

    this._noiseBuf = this._makeNoise(2.0);
    this._startEngine();
    this.ready = true;
  }

  _makeNoise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _noise(dur, type, freq, q, gain, curve = 'exp') {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(this.bus);
    src.start(t); src.stop(t + dur + 0.02);
    return { f, g, t };
  }

  // ─── motore: due oscillatori continui modulati dalla potenza ─────
  _startEngine() {
    const t = this.ctx.currentTime;
    this.eng = { osc: [], gain: this.ctx.createGain(), filt: this.ctx.createBiquadFilter() };
    this.eng.gain.gain.value = 0;
    this.eng.filt.type = 'lowpass';
    this.eng.filt.frequency.value = 420;
    this.eng.filt.Q.value = 3;

    for (const [type, mul, lvl] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.28], ['sine', 2.01, 0.16]]) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = 46 * mul;
      const g = this.ctx.createGain(); g.gain.value = lvl;
      o.connect(g); g.connect(this.eng.filt);
      o.start(t);
      this.eng.osc.push({ o, base: 46 * mul });
    }
    // soffio d'aria del propulsore
    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noiseBuf; ns.loop = true;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7;
    const ng = this.ctx.createGain(); ng.gain.value = 0.22;
    ns.connect(nf); nf.connect(ng); ng.connect(this.eng.filt);
    ns.start(t);
    this.eng.hiss = nf;

    this.eng.filt.connect(this.eng.gain);
    this.eng.gain.connect(this.bus);
  }

  engine(throttle, boosting) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime, T = 0.09;
    const lvl = throttle * (boosting ? 1 : 0.66);
    this.eng.gain.gain.setTargetAtTime(0.028 + lvl * 0.26, t, T);
    this.eng.filt.frequency.setTargetAtTime(300 + lvl * (boosting ? 2100 : 900), t, T);
    for (const e of this.eng.osc) {
      e.o.frequency.setTargetAtTime(e.base * (1 + lvl * (boosting ? 1.5 : 0.72)), t, T);
    }
    this.eng.hiss.frequency.setTargetAtTime(700 + lvl * 1700, t, T);
  }

  // ─── effetti ─────────────────────────────────────────────────────
  shoot() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1250, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 0.14);
    this._noise(0.07, 'highpass', 1800, 0.6, 0.10);
  }

  explosion(size = 1) {
    if (!this.ready || this.muted) return;
    const dur = 0.34 + size * 0.5;
    const { f, t } = this._noise(dur, 'lowpass', 900 / size, 1.1, Math.min(0.5, 0.2 * size));
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    // colpo grave che dà il peso
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120 / size, t);
    o.frequency.exponentialRampToValueAtTime(28, t + dur * 0.75);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3 * Math.min(1.6, size), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + dur);
  }

  hit(heavy) {
    if (!this.ready || this.muted) return;
    const { f, t } = this._noise(heavy ? 0.4 : 0.2, 'bandpass', heavy ? 220 : 520, 1.5, heavy ? 0.42 : 0.22);
    f.frequency.exponentialRampToValueAtTime(70, t + 0.3);
  }

  enemyShoot() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.075, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 0.12);
  }

  alarm() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 760;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.18);
      g.gain.linearRampToValueAtTime(0.10, t + i * 0.18 + 0.02);
      g.gain.linearRampToValueAtTime(0, t + i * 0.18 + 0.13);
      o.connect(g); g.connect(this.bus);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.15);
    }
  }

  death() {
    if (!this.ready || this.muted) return;
    this.explosion(2.4);
    const t = this.ctx.currentTime;
    // discesa lunga: il "tutto si spegne"
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 1.9);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 1.9);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    o.connect(f); f.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 2.1);
    this.engine(0, false);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }
}
