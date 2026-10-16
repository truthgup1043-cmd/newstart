/* 하영시 앱 — 오늘의 영어 탭 */

// 365 단어 / 365 표현 (EN_WORDS, EN_EXPR은 별도 생성 후 병합)
const EN_WORDS = [];
const EN_EXPR = [];

function englishDayNum() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / 86400000) + 1; // 1~365
}

/* ---------- 오늘의 영어 성경 구절 (VOTD + 한글 대조) ---------- */
async function fetchEnglishVerse() {
  const dayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = "eng-votd:" + dayKey;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached) return cached;
  } catch {}
  const res = await fetch("https://labs.bible.org/api/?passage=votd&type=json");
  if (!res.ok) throw new Error("votd " + res.status);
  const verses = await res.json();
  // 한글 대조 (새번역)
  for (const v of verses) {
    const bookNum = (BIBLE_BOOKS[v.bookname] || [])[0];
    v.ko = "";
    if (bookNum) {
      try {
        const kr = await fetch(`https://bolls.life/get-verse/RNKSV/${bookNum}/${v.chapter}/${v.verse}/`, { headers: {} });
        if (kr.ok) {
          const kd = await kr.json();
          const d = document.createElement("div");
          d.innerHTML = kd.text || "";
          v.ko = (d.textContent || "").trim();
        }
      } catch {}
    }
    v.ref = `${v.bookname} ${v.chapter}:${v.verse}`;
  }
  try { localStorage.setItem(cacheKey, JSON.stringify(verses)); } catch {}
  return verses;
}

/* ---------- TTS (폰에서 영어로 읽어주기) ---------- */
function speakEnglish(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS 실패:", e.message);
  }
}

/* ---------- 학습 완료 체크 (루틴 연동) ---------- */
function isEnglishDone() {
  return !!(store[today] && store[today]["english"]);
}
function markEnglishDone() {
  completeEnglishRoutine();
}
function renderEnglishDone() {
  const btn = document.getElementById("engDoneBtn");
  if (!btn) return;
  const done = isEnglishDone();
  btn.textContent = done ? "오늘 공부 완료 ✓" : "오늘 공부 완료하기";
  btn.classList.toggle("done", done);
}

/* ---------- 렌더 ---------- */
function renderEnglish() {
  const day = englishDayNum();
  document.getElementById("engDayNum").textContent = day;

  // 단어
  const w = EN_WORDS[(day - 1) % Math.max(EN_WORDS.length, 1)];
  const wEl = document.getElementById("engWord");
  if (w) {
    wEl.innerHTML = `
      <div class="eng-word-row">
        <div>
          <div class="eng-word">${w.w}</div>
          <div class="eng-pron">[${w.p}] · ${w.pos}</div>
        </div>
        <button class="btn eng-speak" data-say="${w.w}">🔊</button>
      </div>
      <div class="eng-meaning">${w.m}</div>
      <div class="eng-ex">${w.ex}</div>
      <div class="eng-exk">${w.exk}</div>`;
  } else {
    wEl.innerHTML = `<p class="bible-loading">단어 목록을 준비 중이에요.</p>`;
  }

  // 표현
  const e = EN_EXPR[(day - 1) % Math.max(EN_EXPR.length, 1)];
  const eEl = document.getElementById("engExpr");
  if (e) {
    eEl.innerHTML = `
      <div class="eng-word-row">
        <div class="eng-word">${e.e}</div>
        <button class="btn eng-speak" data-say="${e.e}">🔊</button>
      </div>
      <div class="eng-meaning">${e.m}</div>
      <div class="eng-ex">${e.ex}</div>
      <div class="eng-exk">${e.exk}</div>`;
  } else {
    eEl.innerHTML = `<p class="bible-loading">표현 목록을 준비 중이에요.</p>`;
  }

  // 성경 구절
  const vEl = document.getElementById("engVerse");
  vEl.innerHTML = `<p class="bible-loading">오늘의 구절을 불러오는 중…</p>`;
  fetchEnglishVerse().then(verses => {
    const fullText = verses.map(v => v.text).join(" ");
    vEl.innerHTML = `
      <div class="eng-verse-ref">${verses.map(v => v.ref).join(" · ")} <span class="eng-verse-net">(NET)</span></div>
      ${verses.map(v => `<p class="eng-verse-en"><sup>${v.verse}</sup> ${v.text}</p>`).join("")}
      ${verses[0].ko ? `<div class="eng-verse-ko">${verses.map(v => v.ko).join(" ")}</div>` : ""}
      <p class="qt-note" style="margin-top:12px">💡 이 구절을 암송해보세요. 소리 내어 3번 읽고, 눈을 감고 말해보기. 오늘 하루 이 말씀을 마음에 새겨요.</p>
      <button class="btn eng-speak-wide" id="engVerseSpeak">🔊 영어로 듣기</button>`;
    document.getElementById("engVerseSpeak").onclick = () => speakEnglish(fullText);
  }).catch(() => {
    vEl.innerHTML = `<p class="bible-error">구절을 불러오지 못했어요. 네트워크를 확인해주세요.</p>`;
  });

  // 발음 버튼 (단어/표현)
  wEl.querySelectorAll(".eng-speak").forEach(b => {
    b.onclick = (ev) => { ev.stopPropagation(); speakEnglish(b.dataset.say); };
  });
  eEl.querySelectorAll(".eng-speak").forEach(b => {
    b.onclick = (ev) => { ev.stopPropagation(); speakEnglish(b.dataset.say); };
  });

  renderEnglishDone();
}
