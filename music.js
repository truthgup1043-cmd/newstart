/* 하영시 앱 — 집중 음악 (피아노, 잔잔한 감성 팝) */

const FocusMusic = {
  playing: false,
  ctx: null,
  master: null,
  verb: null,
  timerId: null,
  step: 0,
  nextTime: 0,
  bpm: 76,

  // Am - F - C - G
  chords: [
    [110.00, 130.81, 164.81, 220.00],
    [ 87.31, 110.00, 130.81, 174.61],
    [130.81, 164.81, 196.00, 261.63],
    [ 98.00, 123.47, 146.83, 196.00],
  ],
  arpPattern: [0, 1, 2, 3, 2, 1],
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
      this.master.gain.value = 0.5;
      // 피아노 룸 잔향 (짧은 딜레이)
      this.verb = this.ctx.createGain();
      this.verb.gain.value = 0.22;
      const delay = this.ctx.createDelay(1.0);
      delay.delayTime.value = 0.31;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      const dampen = this.ctx.createBiquadFilter();
      dampen.type = "lowpass";
      dampen.frequency.value = 2200;
      this.verb.connect(delay);
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

  // 피아노 음색: 배음 + 빠른 어택 + 자연 감쇠
  piano(freq, t, dur, vol) {
    const partials = [
      [1, 1.0, "sine"],
      [2, 0.35, "sine"],
      [3, 0.15, "sine"],
      [4, 0.07, "triangle"],
    ];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // 해머 타격감을 위한 살짝 밝은 필터
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + dur * 0.7);
    f.connect(g);
    g.connect(this.master);
    g.connect(this.verb);
    partials.forEach(([mult, amp, type]) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      o.detune.value = (Math.random() * 4) - 2;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og); og.connect(f);
      o.start(t); o.stop(t + dur + 0.1);
    });
  },

  scheduleStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    const stepDur = 60 / this.bpm / 4;
    const barDur = stepDur * 16;

    // 왼손: 마디 시작에 부드러운 코드 (블록 코드, 길게)
    if (s16 === 0) {
      this.chords[bar].slice(0, 3).forEach(fq => {
        this.piano(fq / 2, t, barDur * 0.9, 0.10);
      });
    }
    // 오른손 아르페지오: 8분음표
    if (s16 % 2 === 0) {
      const arpIdx = this.arpPattern[(s16 / 2) % 6];
      const fq = this.chords[bar][arpIdx];
      this.piano(fq, t, stepDur * 4, 0.08);
    }
    // 멜로디
    const m = this.melody[step % 32];
    if (m) {
      this.piano(m, t, stepDur * 8, 0.11);
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
      btn.textContent = this.playing ? "🎵 음악 끄기" : "🎹 피아노 음악 켜기";
      btn.classList.toggle("on", this.playing);
    }
  }
};
