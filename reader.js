/* 하영시 앱 — 책 리더 (페이지 넘김 + 폰트 조절) */

const Reader = {
  book: null,       // { title, genre, chapters: [{title, text}] }
  bookIdx: -1,
  chapterIdx: 0,
  pageIdx: 0,
  pages: [],        // 현재 챕터의 페이지 배열
  fontSize: 19,
  fontFamily: "serif",
  // 읽기 타이머
  readStartTs: 0,
  readElapsed: 0,
  readTimerId: null,

  // 설정 로드/저장
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("reader-settings") || "{}");
      this.fontSize = s.fontSize || 19;
      this.fontFamily = s.fontFamily || "serif";
    } catch {}
  },
  saveSettings() {
    try {
      localStorage.setItem("reader-settings", JSON.stringify({
        fontSize: this.fontSize, fontFamily: this.fontFamily
      }));
    } catch {}
  },

  // 책 열기
  async open(idx) {
    this.loadSettings();
    this.bookIdx = idx;
    const meta = BOOKS[idx];
    if (!meta.ready) {
      alert("📚 이 책은 아직 준비 중이에요.");
      return;
    }
    // 로딩 표시
    document.getElementById("readerModal").classList.remove("hidden");
    document.getElementById("readerContent").innerHTML = '<p class="reader-loading">책을 여는 중…</p>';
    document.getElementById("readerBookTitle").textContent = meta.t;
    try {
      const res = await fetch(`books/${meta.file}.json`);
      if (!res.ok) throw new Error("load fail");
      this.book = await res.json();
    } catch (e) {
      document.getElementById("readerContent").innerHTML =
        '<p class="reader-loading">책을 불러오지 못했어요. 네트워크를 확인해주세요.</p>';
      return;
    }
    // 저장된 위치 복원
    try {
      const pos = JSON.parse(localStorage.getItem("reader-pos") || "{}");
      const p = pos[idx];
      if (p) { this.chapterIdx = p.c || 0; this.pageIdx = p.d || 0; }
      else { this.chapterIdx = 0; this.pageIdx = 0; }
    } catch { this.chapterIdx = 0; this.pageIdx = 0; }
    // 모달이 렌더링된 후 페이지 나누기 (높이 측정 필요)
    requestAnimationFrame(() => {
      this.paginate();
      this.render();
    });
    // 읽기 타이머 시작
    this.startReadTimer();
  },

  startReadTimer() {
    this.stopReadTimer();
    this.readStartTs = Date.now();
    this.readElapsed = 0;
    this.updateReadClock();
    this.readTimerId = setInterval(() => this.updateReadClock(), 1000);
  },

  stopReadTimer() {
    if (this.readTimerId) {
      clearInterval(this.readTimerId);
      this.readTimerId = null;
    }
  },

  updateReadClock() {
    if (!this.readStartTs) return;
    this.readElapsed = Date.now() - this.readStartTs;
    const s = Math.floor(this.readElapsed / 1000);
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    const el = document.getElementById("readerTimer");
    if (el) el.textContent = `${m}:${sec}`;
  },

  close() {
    this.savePosition();
    // 독서 기록 저장
    this.saveReadingLog();
    this.stopReadTimer();
    this.readStartTs = 0;
    document.getElementById("readerModal").classList.add("hidden");
    document.getElementById("readerSettings").classList.add("hidden");
  },

  saveReadingLog() {
    if (this.bookIdx < 0 || !this.readElapsed) return;
    const minutes = Math.max(1, Math.round(this.readElapsed / 60000));
    const book = BOOKS[this.bookIdx];
    if (!book) return;
    // 기록 저장
    addReadingLog({ date: today, title: book.t, minutes });
    // 독서 루틴에 누적
    if (!store[today]) store[today] = {};
    store[today]["reading"] = true;
    store[today]["reading_minutes"] = (store[today]["reading_minutes"] || 0) + minutes;
    cache(); renderAll();
    saveRow("reading", true, { minutes: store[today]["reading_minutes"] });
    renderReadingLog();
    updateReadingToday();
    // 도서 목록 진도 갱신
    if (typeof renderBookShelves !== "undefined") renderBookShelves();
  },

  savePosition() {
    if (this.bookIdx < 0 || !this.book) return;
    try {
      const pos = JSON.parse(localStorage.getItem("reader-pos") || "{}");
      pos[this.bookIdx] = {
        c: this.chapterIdx,
        d: this.pageIdx,
        total: this.book.chapters.length,
        updated: Date.now()
      };
      localStorage.setItem("reader-pos", JSON.stringify(pos));
    } catch {}
  },

  // 진도율 계산 (0-100)
  getProgress(bookIdx) {
    try {
      const pos = JSON.parse(localStorage.getItem("reader-pos") || "{}");
      const p = pos[bookIdx];
      if (!p || !p.total) return 0;
      // 챕터 기준으로 계산
      return Math.min(100, Math.round((p.c / p.total) * 100));
    } catch { return 0; }
  },

  // 페이지 나누기: 실제 렌더링 높이 기준
  paginate() {
    const ch = this.book.chapters[this.chapterIdx];
    if (!ch) { this.pages = []; return; }
    const paras = ch.text.split(/\n\n+/).filter(p => p.trim());

    const content = document.getElementById("readerContent");
    const availH = content.clientHeight || 500;
    const availW = content.clientWidth || 300;

    // 측정용 숨김 div
    let measurer = document.getElementById("readerMeasurer");
    if (!measurer) {
      measurer = document.createElement("div");
      measurer.id = "readerMeasurer";
      measurer.style.cssText = "position:absolute;visibility:hidden;top:0;left:0;pointer-events:none;";
      document.body.appendChild(measurer);
    }
    measurer.style.width = availW + "px";
    measurer.style.fontSize = this.fontSize + "px";
    measurer.style.lineHeight = "2";
    measurer.className = "font-" + this.fontFamily;
    measurer.style.fontFamily = this.fontFamily === "serif"
      ? '"Noto Serif KR", "Batang", serif'
      : '-apple-system, "Pretendard", sans-serif';

    const pages = [];
    let curPage = [];
    let curH = 0;

    // 문단 높이 측정 헬퍼
    const measureH = (text) => {
      measurer.innerHTML = `<p style="margin-bottom:1.2em;text-align:justify;">${escapeHtml(text.trim())}</p>`;
      return measurer.offsetHeight;
    };

    for (const p of paras) {
      const ph = measureH(p);
      // 문단 하나가 한 페이지를 초과하면 강제로 자르기 (문장 단위)
      if (ph > availH) {
        // 현재 페이지 마무리
        if (curPage.length) { pages.push(curPage); curPage = []; curH = 0; }
        // 긴 문단을 문장 단위로 쪼개기
        const sentences = p.split(/(?<=[.!?。])/);
        let chunk = "", chunkH = 0;
        for (const s of sentences) {
          const sh = measureH(chunk + s);
          if (sh > availH && chunk) {
            pages.push([chunk]); chunk = s; chunkH = measureH(s);
          } else {
            chunk += s; chunkH = sh;
          }
        }
        if (chunk.trim()) pages.push([chunk]);
        continue;
      }
      if (curH + ph > availH && curPage.length) {
        pages.push(curPage);
        curPage = [p];
        curH = ph;
      } else {
        curPage.push(p);
        curH += ph;
      }
    }
    if (curPage.length) pages.push(curPage);

    // 페이지를 HTML 문자열로 변환
    this.pages = pages.length ? pages.map(pageParas =>
      pageParas.map(p => `<p>${escapeHtml(p.trim())}</p>`).join("")
    ) : [""];
    if (this.pageIdx >= this.pages.length) this.pageIdx = this.pages.length - 1;
    if (this.pageIdx < 0) this.pageIdx = 0;
  },

  render() {
    const ch = this.book.chapters[this.chapterIdx];
    const content = document.getElementById("readerContent");
    // pages는 이미 HTML 문자열
    content.innerHTML = this.pages[this.pageIdx] || "";
    content.style.fontSize = this.fontSize + "px";
    content.className = "reader-content font-" + this.fontFamily;

    // 헤더/푸터
    document.getElementById("readerChapter").textContent =
      ch ? ch.title || `챕터 ${this.chapterIdx + 1}` : "";
    const totalPages = this.pages.length;
    document.getElementById("readerPageInfo").textContent =
      `${this.pageIdx + 1} / ${totalPages}`;
    // 전체 진행률 (현재까지 읽은 페이지 / 전체 추정 페이지)
    const pct = this.calcTotalProgress();
    document.getElementById("readerProgress").style.width = pct + "%";
    document.getElementById("readerProgressText").textContent = pct + "%";

    this.savePosition();
  },

  calcTotalProgress() {
    // 각 챕터의 페이지 수를 추정 (현재 폰트 기준)
    if (!this.pageHeights) this.pageHeights = {};
    const key = this.fontSize + "_" + this.fontFamily;
    if (!this.pageHeights[key]) {
      // 간단 추정: 챕터 글자수 / 페이지당 평균 글자수
      const avgChars = this.pages.length
        ? Math.max(1, Math.round(this.book.chapters[this.chapterIdx].text.length / this.pages.length))
        : 800;
      let all = 0, done = 0;
      this.book.chapters.forEach((c, ci) => {
        const est = Math.max(1, Math.ceil(c.text.length / avgChars));
        if (ci < this.chapterIdx) done += est;
        else if (ci === this.chapterIdx) done += this.pageIdx;
        all += est;
      });
      this.pageHeights[key] = { all, done };
    }
    const { all, done } = this.pageHeights[key];
    // 현재 페이지는 실시간으로 반영
    return all ? Math.min(100, Math.round((done / all) * 100)) : 0;
  },

  nextPage() {
    if (this.pageIdx < this.pages.length - 1) {
      this.pageIdx++;
      this.render();
      this.scrollTop();
    } else if (this.chapterIdx < this.book.chapters.length - 1) {
      this.chapterIdx++;
      this.pageIdx = 0;
      this.paginate();
      this.render();
      this.scrollTop();
    }
  },

  prevPage() {
    if (this.pageIdx > 0) {
      this.pageIdx--;
      this.render();
      this.scrollTop();
    } else if (this.chapterIdx > 0) {
      this.chapterIdx--;
      this.paginate();
      this.pageIdx = this.pages.length - 1;
      this.render();
      this.scrollTop();
    }
  },

  scrollTop() {
    const c = document.getElementById("readerContent");
    c.scrollTop = 0;
  },

  toggleSettings() {
    document.getElementById("readerSettings").classList.toggle("hidden");
  },

  changeFontSize(delta) {
    this.fontSize = Math.max(13, Math.min(26, this.fontSize + delta));
    document.getElementById("readerFontSize").textContent = this.fontSize + "pt";
    this.paginate();
    this.render();
    this.saveSettings();
  },

  setFontFamily(f) {
    this.fontFamily = f;
    document.querySelectorAll(".reader-font-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.font === f));
    this.render();
    this.saveSettings();
  },
};

// 스와이프로 페이지 넘김
document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("readerContent");
  if (!content) return;
  let sx = 0, sy = 0;
  content.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  content.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) Reader.nextPage();
      else Reader.prevPage();
    }
  }, { passive: true });
  // 탭 영역 클릭
  document.getElementById("readerPrevZone").onclick = () => Reader.prevPage();
  document.getElementById("readerNextZone").onclick = () => Reader.nextPage();
});
