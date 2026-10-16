/* 하영시 앱 — 독서 탭 (장르별 책장 + 읽기 타이머) */

// ---------- 독서 기록 (localStorage) ----------
function getReadingLog() {
  try { return JSON.parse(localStorage.getItem("reading-log") || "[]"); }
  catch { return []; }
}
function addReadingLog(entry) {
  try {
    const log = getReadingLog();
    log.unshift(entry);
    localStorage.setItem("reading-log", JSON.stringify(log.slice(0, 100)));
  } catch {}
}

// ---------- 책장 렌더 ----------
function renderBookShelves() {
  const wrap = document.getElementById("bookShelves");
  if (!wrap || typeof BOOKS === "undefined") return;
  const genres = (typeof BOOK_GENRES !== "undefined" && BOOK_GENRES.length)
    ? BOOK_GENRES
    : [...new Set(BOOKS.map(b => b.g))];
  wrap.innerHTML = genres.map(g => {
    const books = BOOKS.filter(b => b.g === g);
    if (!books.length) return "";
    return `
      <section class="card book-shelf">
        <h3>${g} <span class="shelf-count">${books.length}권</span></h3>
        <div class="book-list">
          ${books.map((b) => {
            const idx = BOOKS.indexOf(b);
            return `
              <div class="book-item">
                <div class="book-info">
                  <div class="book-title">${escapeHtml(b.t)}</div>
                </div>
                <div class="book-btns">
                  <button class="btn book-read-btn" onclick="Reader.open(${idx})">📖 읽기</button>
                </div>
              </div>`;
          }).join("")}
        </div>
      </section>`;
  }).join("");
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- 오늘 읽은 시간 / 기록 ----------
function updateReadingToday() {
  const el = document.getElementById("readingToday");
  if (!el) return;
  const mins = (store[today] && store[today]["reading_minutes"]) || 0;
  el.textContent = `오늘 읽은 시간: ${mins}분`;
}
function renderReadingLog() {
  const wrap = document.getElementById("readingLog");
  if (!wrap) return;
  const log = getReadingLog();
  if (!log.length) {
    wrap.innerHTML = '<p class="qt-note">아직 독서 기록이 없어요.</p>';
    return;
  }
  wrap.innerHTML = log.slice(0, 20).map(e => `
    <div class="archive-item">
      <div class="archive-date">${e.date} · ${e.minutes}분</div>
      <div class="archive-text">${escapeHtml(e.title)}</div>
    </div>`).join("");
}

// ---------- 원문 보기 (Drive 미리보기) ----------
function openBookPreview(idx) {
  const book = BOOKS[idx];
  if (!book || !book.id) return;
  const modal = document.getElementById("bookPreviewModal");
  const frame = document.getElementById("bookPreviewFrame");
  const title = document.getElementById("bookPreviewTitle");
  const link = document.getElementById("bookPreviewLink");
  title.textContent = book.t;
  frame.src = `https://drive.google.com/file/d/${book.id}/preview`;
  link.href = `https://drive.google.com/file/d/${book.id}/view`;
  modal.classList.remove("hidden");
}
function closeBookPreview() {
  const modal = document.getElementById("bookPreviewModal");
  document.getElementById("bookPreviewFrame").src = "";
  modal.classList.add("hidden");
}

// ---------- 탭 진입 시 ----------
function renderReading() {
  renderBookShelves();
  renderReadingLog();
  updateReadingToday();
}
