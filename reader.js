/* 하영시 앱 — 책 리더 (페이지 넘김 + 폰트 조절) */

const Reader = {
  book: null,       // { title, genre, chapters: [{title, text}] }
  bookIdx: -1,
  chapterIdx: 0,
  pageIdx: 0,
  pages: [],        // 현재 챕터의 페이지 배열
  fontSize: 17,
  fontFamily: "serif",
  theme: "light",

  // 설정 로드/저장
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("reader-settings") || "{}");
      this.fontSize = s.fontSize || 17;
      this.fontFamily = s.fontFamily || "serif";
      this.theme = s.theme || "light";
    } catch {}
  },
  saveSettings() {
    try {
      localStorage.setItem("reader-settings", JSON.stringify({
        fontSize: this.fontSize, fontFamily: this.fontFamily, theme: this.theme
      }));
    } catch {}
  },

  // 책 열기
  async open(idx) {
    this.loadSettings();
    this.bookIdx = idx;
    const meta = BOOKS[idx];
    // 로딩 표시
    document.getElementById("readerModal").classList.remove("hidden");
    document.getElementById("readerContent").innerHTML = '<p class="reader-loading">책을 여는 중…</p>';
    document.getElementById("readerBookTitle").textContent = meta.t;
    try {
      const res = await fetch(`books/book_${idx}.json`);
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
    this.paginate();
    this.render();
    this.applyTheme();
  },

  close() {
    this.savePosition();
    document.getElementById("readerModal").classList.add("hidden");
    document.getElementById("readerSettings").classList.add("hidden");
  },

  savePosition() {
    if (this.bookIdx < 0) return;
    try {
      const pos = JSON.parse(localStorage.getItem("reader-pos") || "{}");
      pos[this.bookIdx] = { c: this.chapterIdx, d: this.pageIdx };
      localStorage.setItem("reader-pos", JSON.stringify(pos));
    } catch {}
  },

  // 페이지 나누기 (문단 단위)
  charsPerPage() {
    // 폰트 크기에 따라 조절 (17px 기준 약 1100자)
    return Math.round(1100 * (17 / this.fontSize));
  },

  paginate() {
    const ch = this.book.chapters[this.chapterIdx];
    if (!ch) { this.pages = []; return; }
    const paras = ch.text.split(/\n\n+/);
    const limit = this.charsPerPage();
    const pages = [];
    let cur = "", curLen = 0;
    for (const p of paras) {
      const plen = p.length;
      if (curLen + plen > limit && cur) {
        pages.push(cur);
        cur = p; curLen = plen;
      } else {
        cur = cur ? cur + "\n\n" + p : p;
        curLen += plen;
      }
    }
    if (cur) pages.push(cur);
    this.pages = pages.length ? pages : [""];
    if (this.pageIdx >= this.pages.length) this.pageIdx = this.pages.length - 1;
    if (this.pageIdx < 0) this.pageIdx = 0;
  },

  render() {
    const ch = this.book.chapters[this.chapterIdx];
    const content = document.getElementById("readerContent");
    const pageText = this.pages[this.pageIdx] || "";
    content.innerHTML = pageText
      .split(/\n\n+/)
      .map(p => `<p>${escapeHtml(p.trim())}</p>`)
      .join("");
    content.style.fontSize = this.fontSize + "px";
    content.className = "reader-content font-" + this.fontFamily;

    // 헤더/푸터
    document.getElementById("readerChapter").textContent =
      ch ? ch.title || `챕터 ${this.chapterIdx + 1}` : "";
    const totalPages = this.pages.length;
    document.getElementById("readerPageInfo").textContent =
      `${this.pageIdx + 1} / ${totalPages}`;
    const totalCh = this.book.chapters.length;
    // 전체 진행률 (챕터 + 페이지)
    let done = 0, all = 0;
    this.book.chapters.forEach((c, ci) => {
      // 근사치: 챕터별 페이지 수 추정
      const est = Math.max(1, Math.ceil(c.text.length / this.charsPerPage()));
      if (ci < this.chapterIdx) done += est;
      else if (ci === this.chapterIdx) done += this.pageIdx;
      all += est;
    });
    const pct = all ? Math.round((done / all) * 100) : 0;
    document.getElementById("readerProgress").style.width = pct + "%";
    document.getElementById("readerProgressText").textContent = pct + "%";

    this.savePosition();
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

  goChapter(ci) {
    if (ci < 0 || ci >= this.book.chapters.length) return;
    this.chapterIdx = ci;
    this.pageIdx = 0;
    this.paginate();
    this.render();
    this.scrollTop();
    document.getElementById("readerToc").classList.add("hidden");
  },

  toggleToc() {
    const toc = document.getElementById("readerToc");
    if (toc.classList.contains("hidden")) {
      // 목차 렌더
      toc.innerHTML = this.book.chapters.map((c, i) =>
        `<div class="reader-toc-item${i === this.chapterIdx ? " active" : ""}" onclick="Reader.goChapter(${i})">${escapeHtml(c.title || `챕터 ${i + 1}`)}</div>`
      ).join("");
      toc.classList.remove("hidden");
    } else {
      toc.classList.add("hidden");
    }
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

  setTheme(t) {
    this.theme = t;
    document.querySelectorAll(".reader-theme-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.theme === t));
    this.applyTheme();
    this.saveSettings();
  },

  applyTheme() {
    const modal = document.getElementById("readerModal");
    modal.className = "modal reader-modal theme-" + this.theme;
    document.querySelectorAll(".reader-theme-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.theme === this.theme));
    document.querySelectorAll(".reader-font-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.font === this.fontFamily));
    const fsEl = document.getElementById("readerFontSize");
    if (fsEl) fsEl.textContent = this.fontSize + "pt";
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
