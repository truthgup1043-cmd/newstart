/* 하영시 앱 — 집중 음악 (피아노 찬양, 잔잔하게) */
/* Amazing Grace (퍼블릭 도메인) 멜로디 기반 */

const FocusMusic = {
  playing: false,
  ctx: null,
  master: null,
  verb: null,
  timerId: null,
  step: 0,
  nextTime: 0,
  bpm: 60,

  // Amazing Grace 멜로디 (G major, 3/4) — [주파수, 박자]
  // "나 같은 죄인 살리신 주 은혜 놀라워"
  melody: [
    [196.00, 1],   // G4 나
    [261.63, 2],   // C5 같
    [329.63, 1.5], // E5 은
    [392.00, 0.5], // G5 죄
    [329.63, 2],   // E5 인
    [261.63, 1.5], // C5 살
    [220.00, 0.5], // A4 리
    [196.00, 2],   // G4 신
    [164.81, 1.5], // E4 주
    [146.83, 0.5], // D4 은
    [130.81, 3],   // C4 혜
    [196.00, 1],   // G4 놀
    [261.63, 2],   // C5 라
    [329.63, 1.5], // E5 워
    [392.00, 0.5], // G5 라
    [329.63, 2],   // E5 잃
    [293.66, 1.5], // D5 었
    [261.63, 0.5], // C5 던
    [220.00, 2],   // A4 나
    [196.00, 1.5], // G4 를
    [164.81, 0.5], // E4 찾
    [146.83, 3],   // D4 아
    [196.00, 1],   // G4 오
    [261.63, 2],   // C5 며
    [329.63, 1.5], // E5 눈
    [392.00, 0.5], // G5 먼
    [329.63, 2],   // E5 나
    [261.63, 1.5], // C5 를
    [220.00, 0.5], // A4 뜨
    [196.00, 2],   // G4 게
    [164.81, 1.5], // E4 하
    [146.83, 0.5], // D4 셨
    [130.81, 3],   // C4 네
    [0, 3],        // 쉼
  ],

  // 부드러운 반주 코드 (마디별)
  chords: [
    [130.81, 164.81, 196.00], // C
    [ 98.00, 146.83, 196.00], // G
    [110.00, 164.81, 220.00], // Am
    [130.81, 164.81, 196.00], // C
  ],

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      // 교회 홀 같은 잔향
      this.verb = this.ctx.createGain();
      this.verb.gain.value = 0.3;
      const delay = this.ctx.createDelay(1.0);
      delay.delayTime.value = 0.45;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.4;
      const dampen = this.ctx.createBiquadFilter();
      dampen.type = "lowpass";
      dampen.frequency.value = 1800;
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

  // 피아노 음색
  piano(freq, t, dur, vol) {
    if (!freq) return;
    const partials = [
      [1, 1.0, "sine"],
      [2, 0.3, "sine"],
      [3, 0.12, "sine"],
    ];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3800, t);
    f.frequency.exponentialRampToValueAtTime(1000, t + dur * 0.6);
    f.connect(g);
    g.connect(this.master);
    g.connect(this.verb);
    partials.forEach(([mult, amp, type]) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og); og.connect(f);
      o.start(t); o.stop(t + dur + 0.1);
    });
  },

  buildSequence() {
    // 멜로디를 시간 순서대로 펼치기
    this.seq = [];
    let t = 0;
    const beatDur = 60 / this.bpm;
    this.melody.forEach(([fq, beats]) => {
      this.seq.push({ fq, t, dur: beats * beatDur * 0.95 });
      t += beats * beatDur;
    });
    this.totalDur = t;
    // 반주: 3박마다 코드 변경
    this.chordSeq = [];
    const barDur = beatDur * 3;
    for (let ct = 0, ci = 0; ct < t; ct += barDur, ci++) {
      this.chordSeq.push({ freqs: this.chords[ci % 4], t: ct, dur: barDur });
    }
  },

  scheduler() {
    if (!this.seq) this.buildSequence();
    const ahead = 0.5;
    while (this.nextTime < this.ctx.currentTime + ahead) {
      const loopT = this.nextTime % this.totalDur;
      // 멜로디 스케줄 (루프 내 위치에 맞는 음표 찾기)
      // 간단히: nextTime 기준으로 오프셋 계산
      this.scheduleAtLoop(loopT, this.nextTime);
      this.nextTime += 0.25; // 0.25초 단위로 체크
    }
  },

  scheduleAtLoop(loopT, absT) {
    // 이미 스케줄한 위치는 건너뛰기
    if (this.lastLoopT !== undefined) {
      // 루프를 돌았으면 리셋
      if (loopT < this.lastLoopT) this.scheduledNotes = new Set();
    }
    this.lastLoopT = loopT;
    if (!this.scheduledNotes) this.scheduledNotes = new Set();

    this.seq.forEach((n, i) => {
      const key = Math.floor(n.t * 4) + "_" + Math.floor(this.nextTime / this.totalDur);
      if (Math.abs(n.t - loopT) < 0.13 && !this.scheduledNotes.has(key)) {
        this.scheduledNotes.add(key);
        this.piano(n.fq, absT, Math.min(n.dur + 1.5, 4), 0.14);
      }
    });
    this.chordSeq.forEach((c) => {
      const key = "c" + Math.floor(c.t * 4) + "_" + Math.floor(this.nextTime / this.totalDur);
      if (Math.abs(c.t - loopT) < 0.13 && !this.scheduledNotes.has(key)) {
        this.scheduledNotes.add(key);
        c.freqs.forEach(fq => this.piano(fq / 2, absT, c.dur, 0.05));
      }
    });
  },

  start() {
    this.ensureCtx();
    if (this.playing) return;
    this.playing = true;
    this.buildSequence();
    this.scheduledNotes = new Set();
    this.lastLoopT = undefined;
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
      btn.textContent = this.playing ? "🎵 음악 끄기" : "🎹 찬양 피아노 켜기";
      btn.classList.toggle("on", this.playing);
    }
  }
};
