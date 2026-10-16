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
                  <button class="btn book-view-btn" onclick="Reader.open(${idx})">📄 원문</button>
                  <button class="btn book-read-btn" onclick="startReading(${idx})">📖 읽기</button>
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

// ---------- 읽기 타이머 ----------
let readingState = null; // { bookIdx, startTs, elapsed, paused, timerId }

function startReading(bookIdx) {
  if (readingState) {
    if (!confirm("이미 읽고 있는 책이 있어요. 바꾸시겠어요?")) return;
    clearInterval(readingState.timerId);
  }
  const book = BOOKS[bookIdx];
  readingState = { bookIdx, startTs: Date.now(), elapsed: 0, paused: false, timerId: null };
  document.getElementById("readingBookTitle").textContent = "📖 " + book.t;
  document.getElementById("readingTimerCard").classList.remove("hidden");
  document.getElementById("readingPauseBtn").textContent = "⏸ 일시정지";
  readingState.timerId = setInterval(updateReadingClock, 1000);
  updateReadingClock();
  document.getElementById("readingTimerCard").scrollIntoView({ behavior: "smooth", block: "center" });
}
function updateReadingClock() {
  if (!readingState || readingState.paused) return;
  readingState.elapsed = Date.now() - readingState.startTs;
  const s = Math.floor(readingState.elapsed / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  document.getElementById("readingClock").textContent = `${h}:${m}:${sec}`;
}
function toggleReadingPause() {
  if (!readingState) return;
  const btn = document.getElementById("readingPauseBtn");
  if (readingState.paused) {
    readingState.startTs = Date.now() - readingState.elapsed;
    readingState.paused = false;
    btn.textContent = "⏸ 일시정지";
  } else {
    readingState.elapsed = Date.now() - readingState.startTs;
    readingState.paused = true;
    btn.textContent = "▶ 계속 읽기";
  }
}
function stopReading() {
  if (!readingState) return;
  clearInterval(readingState.timerId);
  const minutes = Math.max(1, Math.round(readingState.elapsed / 60000));
  const book = BOOKS[readingState.bookIdx];
  // 기록 저장
  addReadingLog({ date: today, title: book.t, minutes });
  // 독서 루틴에 누적
  if (!store[today]) store[today] = {};
  store[today]["reading"] = true;
  store[today]["reading_minutes"] = (store[today]["reading_minutes"] || 0) + minutes;
  cache(); renderAll();
  saveRow("reading", true, { minutes: store[today]["reading_minutes"] });
  // UI 정리
  document.getElementById("readingTimerCard").classList.add("hidden");
  readingState = null;
  renderReadingLog();
  updateReadingToday();
  alert(`📚 ${minutes}분 독서 기록됐어요!`);
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
