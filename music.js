/* 하영시 앱 — 집중 음악 (잔잔한 감성 팝, Web Audio) */
/* 레퍼런스: 가사 없는 부드러운 팝 / 카페 음악 느낌 */

const FocusMusic = {
  playing: false,
  ctx: null,
  master: null,
  delaySend: null,
  timerId: null,
  step: 0,
  nextTime: 0,
  bpm: 76,

  // Am - F - C - G (감성적인 진행)
  chords: [
    [110.00, 130.81, 164.81, 220.00],  // Am
    [ 87.31, 110.00, 130.81, 174.61],  // F
    [130.81, 164.81, 196.00, 261.63],  // C
    [ 98.00, 123.47, 146.83, 196.00],  // G
  ],
  // 부드러운 아르페지오 패턴
  arpPattern: [0, 1, 2, 3, 2, 1],
  // sparse 감성 멜로디 (2마디, 여백 있게)
  melody: [
    440.00, 0, 0, 523.25, 0, 0, 392.00, 0,
    0, 0, 440.00, 0, 523.25, 0, 0, 0,
    392.00, 0, 0, 440.00, 0, 0, 0, 0,
    523.25, 0, 440.00, 0, 392.00, 0, 0, 0,
  ],

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      // 공간감을 위한 딜레이 (잔향 느낌)
      this.delaySend = this.ctx.createGain();
      this.delaySend.gain.value = 0.35;
      const delay = this.ctx.createDelay(1.0);
      delay.delayTime.value = 0.42;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.35;
      const dampen = this.ctx.createBiquadFilter();
      dampen.type = "lowpass";
      dampen.frequency.value = 1800;
      this.delaySend.connect(delay);
      delay.connect(dampen);
      dampen.connect(fb);
      fb.connect(delay);
      delay.connect(this.master);
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  // 부드러운 피아노 톤
  piano(freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.value = freq;
    o2.frequency.value = freq * 2;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.25;
    // 어택을 부드럽게
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(this.master);
    g.connect(this.delaySend);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  },

  // 패드 (긴 어택의 따뜻한 코드)
  pad(freqs, t, dur) {
    freqs.forEach(fq => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = fq;
      o.detune.value = (Math.random() * 8) - 4;
      f.type = "lowpass";
      f.frequency.value = 900;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f); f.connect(g);
      g.connect(this.master);
      g.connect(this.delaySend);
      o.start(t); o.stop(t + dur + 0.1);
    });
  },

  // 아주 부드러운 셰이커 (8분음표, 거의 느껴지지 않게)
  softTick(t, vol) {
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 8000;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  scheduleStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    const stepDur = 60 / this.bpm / 4;
    const barDur = stepDur * 16;

    // 패드: 매 마디 시작
    if (s16 === 0) {
      this.pad(this.chords[bar], t, barDur);
    }
    // 아르페지오: 8분음표마다 부드럽게
    if (s16 % 2 === 0) {
      const arpIdx = this.arpPattern[(s16 / 2) % 6];
      const fq = this.chords[bar][arpIdx];
      this.piano(fq, t, stepDur * 3, 0.06);
    }
    // 멜로디 (여백 있게)
    const m = this.melody[step % 32];
    if (m) {
      this.piano(m, t, stepDur * 6, 0.09);
    }
    // 셰이커: 4분음표마다 아주 작게
    if (s16 % 4 === 2) {
      this.softTick(t, 0.015);
    }
    // 낮은 베이스: 마디 시작과 중간
    if (s16 === 0 || s16 === 8) {
      this.piano(this.chords[bar][0] / 2, t, stepDur * 8, 0.08);
    }
  },

  scheduler() {
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  },

  start() {
    this.ensureCtx();
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timerId = setInterval(() => this.scheduler(), 100);
    this.updateBtn();
  },

  stop() {
    this.playing = false;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.updateBtn();
  },

  toggle() {
    if (this.playing) this.stop();
    else this.start();
  },

  updateBtn() {
    const btn = document.getElementById("musicToggleBtn");
    if (btn) {
      btn.textContent = this.playing ? "🎵 음악 끄기" : "🎵 집중 음악 켜기";
      btn.classList.toggle("on", this.playing);
    }
  }
};
