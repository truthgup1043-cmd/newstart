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
            const pct = (typeof Reader !== "undefined" && Reader.getProgress)
              ? Reader.getProgress(idx) : 0;
            return `
              <div class="book-item">
                <div class="book-info">
                  <div class="book-title">${escapeHtml(b.t)}</div>
                  ${pct > 0 ? `<div class="book-progress"><div class="book-progress-bar"><div style="width:${pct}%"></div></div><span>${pct}%</span></div>` : ""}
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

// ---------- 개인독서 ----------
let personalState = null; // { startTs, elapsed, paused, timerId }

function startPersonalReading() {
  if (personalState) return;
  personalState = { startTs: Date.now(), elapsed: 0, paused: false, timerId: null };
  document.getElementById("personalReadingIdle").classList.add("hidden");
  document.getElementById("personalReadingForm").classList.add("hidden");
  document.getElementById("personalReadingActive").classList.remove("hidden");
  document.getElementById("personalPauseBtn").textContent = "⏸ 일시정지";
  personalState.timerId = setInterval(updatePersonalClock, 1000);
  updatePersonalClock();
}
function updatePersonalClock() {
  if (!personalState || personalState.paused) return;
  personalState.elapsed = Date.now() - personalState.startTs;
  const s = Math.floor(personalState.elapsed / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  document.getElementById("personalClock").textContent = `${h}:${m}:${sec}`;
}
function togglePersonalPause() {
  if (!personalState) return;
  const btn = document.getElementById("personalPauseBtn");
  if (personalState.paused) {
    personalState.startTs = Date.now() - personalState.elapsed;
    personalState.paused = false;
    btn.textContent = "⏸ 일시정지";
  } else {
    personalState.elapsed = Date.now() - personalState.startTs;
    personalState.paused = true;
    btn.textContent = "▶ 계속 읽기";
  }
}
function finishPersonalReading() {
  if (!personalState) return;
  clearInterval(personalState.timerId);
  personalState.elapsed = personalState.paused
    ? personalState.elapsed
    : Date.now() - personalState.startTs;
  const minutes = Math.max(1, Math.round(personalState.elapsed / 60000));
  personalState.minutes = minutes;
  document.getElementById("personalReadingActive").classList.add("hidden");
  document.getElementById("personalReadingForm").classList.remove("hidden");
  document.getElementById("personalResult").textContent = `📚 ${minutes}분 읽었어요. 책 정보를 입력해주세요.`;
  document.getElementById("personalTitle").value = "";
  document.getElementById("personalAuthor").value = "";
  setTimeout(() => document.getElementById("personalTitle").focus(), 100);
}
function savePersonalReading() {
  if (!personalState) return;
  const title = document.getElementById("personalTitle").value.trim();
  const author = document.getElementById("personalAuthor").value.trim();
  if (!title) {
    alert("도서명을 입력해주세요.");
    document.getElementById("personalTitle").focus();
    return;
  }
  const minutes = personalState.minutes;
  const displayTitle = author ? `${title} - ${author}` : title;
  // 기록 저장
  addReadingLog({ date: today, title: displayTitle, minutes, personal: true });
  // 독서 루틴에 누적
  if (!store[today]) store[today] = {};
  store[today]["reading"] = true;
  store[today]["reading_minutes"] = (store[today]["reading_minutes"] || 0) + minutes;
  cache(); renderAll();
  saveRow("reading", true, { minutes: store[today]["reading_minutes"] });
  // UI 정리
  resetPersonalUI();
  renderReadingLog();
  updateReadingToday();
}
function cancelPersonalReading() {
  if (personalState && personalState.timerId) clearInterval(personalState.timerId);
  personalState = null;
  resetPersonalUI();
}
function resetPersonalUI() {
  personalState = null;
  document.getElementById("personalReadingActive").classList.add("hidden");
  document.getElementById("personalReadingForm").classList.add("hidden");
  document.getElementById("personalReadingIdle").classList.remove("hidden");
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
      <div class="archive-date">${e.personal ? "📝 " : ""}${e.date} · ${e.minutes}분</div>
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
