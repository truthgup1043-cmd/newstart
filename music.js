/* 하영시 앱 — 집중 음악 (110 BPM 경쾌한 생성 음악, Web Audio) */

const FocusMusic = {
  playing: false,
  ctx: null,
  master: null,
  timerId: null,
  step: 0,          // 16분음표 스텝
  nextTime: 0,
  bpm: 110,

  // C-G-Am-F (밝은 팝 진행)
  chords: [
    [130.81, 164.81, 196.00],  // C3 E3 G3
    [ 98.00, 123.47, 146.83],  // G2 B2 D3
    [110.00, 130.81, 164.81],  // A2 C3 E3
    [ 87.31, 110.00, 130.81],  // F2 A2 C3
  ],
  bassRoots: [65.41, 49.00, 55.00, 43.65], // C2 G1 A1 F1
  // C 메이저 펜타토닉 멜로디 패턴 (2마디)
  melody: [
    523.25, 0, 587.33, 659.25, 0, 587.33, 523.25, 0,
    587.33, 659.25, 783.99, 0, 659.25, 587.33, 523.25, 0,
    523.25, 0, 587.33, 659.25, 783.99, 0, 659.25, 587.33,
    523.25, 587.33, 523.25, 0, 440.00, 0, 523.25, 0,
  ],

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      // 부드럽게 다듬기
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  tone(freq, t, dur, type, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(t, dur, vol, hpFreq) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hpFreq || 6000;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  // 16분음표 한 스텝 스케줄
  scheduleStep(step, t) {
    const bar = Math.floor(step / 16) % 4;      // 4마디 순환
    const s16 = step % 16;
    const beat = Math.floor(s16 / 4);            // 0~3 박
    const sub = s16 % 4;                         // 박 안 16분음표

    // 킥: 1, 3박
    if (sub === 0 && (beat === 0 || beat === 2)) {
      this.tone(120, t, 0.18, "sine", 0.35);
      this.tone(55, t, 0.22, "sine", 0.4);
    }
    // 스네어 느낌: 2, 4박
    if (sub === 0 && (beat === 1 || beat === 3)) {
      this.noise(t, 0.12, 0.12, 1800);
      this.tone(190, t, 0.1, "triangle", 0.12);
    }
    // 하이햇: 8분음표
    if (sub % 2 === 0) {
      this.noise(t, 0.04, sub === 0 ? 0.06 : 0.035, 7500);
    }
    // 베이스: 매 박 루트음
    if (sub === 0) {
      this.tone(this.bassRoots[bar], t, 0.42, "triangle", 0.22);
    }
    // 코드 스탭: 1박과 2박 뒤 (경쾌한 오프비트)
    if ((beat === 0 && sub === 0) || (beat === 1 && sub === 2)) {
      this.chords[bar].forEach(fq => {
        this.tone(fq, t, 0.28, "triangle", 0.07);
      });
    }
    // 멜로디
    const m = this.melody[step % 32];
    if (m) {
      this.tone(m, t, 0.22, "sine", 0.11);
      this.tone(m * 2, t, 0.18, "sine", 0.03);
    }
  },

  scheduler() {
    const stepDur = 60 / this.bpm / 4; // 16분음표 길이
    while (this.nextTime < this.ctx.currentTime + 0.25) {
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
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timerId = setInterval(() => this.scheduler(), 80);
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
