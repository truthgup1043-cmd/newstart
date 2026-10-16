/* 하영시 앱 — 오늘의 영어 탭 (로직) */
// EN_WORDS, EN_EXPR은 english_data.js에서 로드
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
  let verses = await res.json();
  verses = verses.slice(0, 2); // 두 구절 (분량 조절)
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
function pickEnglishVoice() {
  try {
    const voices = speechSynthesis.getVoices() || [];
    const prefs = ["Samantha", "Google US English", "Google UK English Female", "Zira", "Aria", "Jenny"];
    for (const p of prefs) {
      const v = voices.find(v => v.name.indexOf(p) !== -1 && v.lang.toLowerCase().indexOf("en") === 0);
      if (v) return v;
    }
    return voices.find(v => v.lang === "en-US") || voices.find(v => v.lang.toLowerCase().indexOf("en") === 0) || null;
  } catch { return null; }
}
let engSpeaking = false;
// 하루 3회 듣기 카운터
function getListenCount() {
  try {
    const d = JSON.parse(localStorage.getItem("eng-listen") || "{}");
    return d[today] || 0;
  } catch { return 0; }
}
function setListenCount(n) {
  try {
    const d = JSON.parse(localStorage.getItem("eng-listen") || "{}");
    d[today] = n;
    localStorage.setItem("eng-listen", JSON.stringify(d));
  } catch {}
}
function updateVerseSpeakBtn() {
  const btn = document.getElementById("engVerseSpeak");
  if (!btn) return;
  const c = getListenCount();
  if (engSpeaking) {
    btn.textContent = "⏹ 멈추기";
    btn.disabled = false;
  } else if (c >= 3) {
    btn.textContent = "🔊 3번 다 들었어요 ✓";
    btn.disabled = true;
  } else {
    btn.textContent = `🔊 영어로 듣기 (${c}/3)`;
    btn.disabled = false;
  }
}
function speakEnglish(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    u.pitch = 1.0;
    const v = pickEnglishVoice();
    if (v) u.voice = v;
    u.onend = () => { engSpeaking = false; updateVerseSpeakBtn(); };
    u.onerror = () => { engSpeaking = false; updateVerseSpeakBtn(); };
    engSpeaking = true;
    updateVerseSpeakBtn();
    speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS 실패:", e.message);
  }
}
function toggleVerseSpeak(text) {
  if (engSpeaking) {
    try { speechSynthesis.cancel(); } catch {}
    engSpeaking = false;
    updateVerseSpeakBtn();
  } else {
    if (getListenCount() >= 3) return;
    setListenCount(getListenCount() + 1);
    speakEnglish(text);
  }
}
// iOS는 음성 목록을 비동기로 불러오므로 미리 워밍업
try {
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
} catch {}

/* ---------- 학습 완료 체크 (루틴 연동) ---------- */
function isEnglishDone() {
  return !!(store[today] && store[today]["english"]);
}
function markEnglishDone() {
  completeEnglishRoutine();
}
function completeDuolingo() {
  // 듀로링고 열기 (앱이 설치되어 있으면 앱으로 연결됨)
  try { window.open("https://www.duolingo.com", "_blank", "noopener"); } catch {}
  // 영어 루틴 완료 처리
  completeEnglishRoutine();
}
function renderEnglishDone() {
  const btn = document.getElementById("engDoneBtn");
  if (!btn) return;
  const done = isEnglishDone();
  btn.textContent = done ? "오늘 공부 완료 ✓" : "오늘 공부 완료하기";
  btn.classList.toggle("done", done);
}

/* ---------- 구절에서 어휘/표현 추출 ---------- */
const ENG_STOPWORDS = new Set(("a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,i,you,he,she,it,we,they,them,his,her,its,our,their,this,that,these,those,am,as,my,me,him,us,what,which,who,whom,my,thy,thou,thee,ye,your,yours,himself,herself,itself,ourselves").split(","));
let _wordIndex = null;
function wordIndex() {
  if (!_wordIndex) {
    _wordIndex = {};
    (EN_WORDS || []).forEach(w => { _wordIndex[w.w.toLowerCase()] = w; });
  }
  return _wordIndex;
}
// 구절 텍스트에서 사전에 있는 단어를 찾아 반환 (없으면 null)
function findWordInVerse(text) {
  const idx = wordIndex();
  const tokens = (text.toLowerCase().match(/[a-z]+/g) || []);
  const seen = new Set();
  for (const t of tokens) {
    if (t.length < 4 || ENG_STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    if (idx[t]) return idx[t];
    // 복수형/과거형 간단 대응
    for (const suf of ["s", "es", "ed", "ing"]) {
      if (t.endsWith(suf) && t.length - suf.length >= 4) {
        const base = t.slice(0, -suf.length);
        if (idx[base]) return idx[base];
      }
    }
  }
  return null;
}
// 구절에서 의미 있는 구(3~8단어)를 표현으로 추출
function findExprInVerse(verses) {
  for (const v of verses) {
    const clauses = v.text.split(/[,;:.—–]/).map(s => s.trim()).filter(s => s);
    for (const c of clauses) {
      const wc = c.split(/\s+/).length;
      if (wc >= 3 && wc <= 8 && /[a-zA-Z]{3,}/.test(c)) {
        return { e: c, fromVerse: true, ref: v.ref };
      }
    }
  }
  return null;
}

/* ---------- 렌더 ---------- */
function renderEnglishWord(w, fromVerse) {
  const wEl = document.getElementById("engWord");
  if (!w) { wEl.innerHTML = `<p class="bible-loading">단어 목록을 준비 중이에요.</p>`; return; }
  wEl.innerHTML = `
    ${fromVerse ? `<p class="qt-note" style="margin-bottom:8px">📖 오늘 구절에서 뽑은 단어예요</p>` : ""}
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
  wEl.querySelectorAll(".eng-speak").forEach(b => {
    b.onclick = (ev) => { ev.stopPropagation(); speakEnglish(b.dataset.say); };
  });
}
function renderEnglishExpr(e, fromVerse) {
  const eEl = document.getElementById("engExpr");
  if (!e) { eEl.innerHTML = `<p class="bible-loading">표현 목록을 준비 중이에요.</p>`; return; }
  if (fromVerse) {
    eEl.innerHTML = `
      <p class="qt-note" style="margin-bottom:8px">📖 오늘 구절 속 표현이에요 (${e.ref})</p>
      <div class="eng-word-row">
        <div class="eng-word" style="font-size:17px">"${e.e}"</div>
        <button class="btn eng-speak" data-say="${e.e.replace(/"/g, "")}">🔊</button>
      </div>
      <p class="qt-note" style="margin-top:8px">이 표현을 소리 내어 따라 읽어보세요.</p>`;
  } else {
    eEl.innerHTML = `
      <div class="eng-word-row">
        <div class="eng-word">${e.e}</div>
        <button class="btn eng-speak" data-say="${e.e}">🔊</button>
      </div>
      <div class="eng-meaning">${e.m}</div>
      <div class="eng-ex">${e.ex}</div>
      <div class="eng-exk">${e.exk}</div>`;
  }
  eEl.querySelectorAll(".eng-speak").forEach(b => {
    b.onclick = (ev) => { ev.stopPropagation(); speakEnglish(b.dataset.say); };
  });
}
function renderEnglish() {
  const day = englishDayNum();
  document.getElementById("engDayNum").textContent = day;

  // 구절을 먼저 불러온 뒤, 구절 기반 어휘/표현을 시도
  const vEl = document.getElementById("engVerse");
  vEl.innerHTML = `<p class="bible-loading">오늘의 구절을 불러오는 중…</p>`;
  // 어휘/표현은 로딩 표시
  document.getElementById("engWord").innerHTML = `<p class="bible-loading">단어를 준비 중…</p>`;
  document.getElementById("engExpr").innerHTML = `<p class="bible-loading">표현을 준비 중…</p>`;

  fetchEnglishVerse().then(verses => {
    const verseText = verses.map(v => v.text).join(" ");

    // 단어: 구절에서 찾고, 없으면 일일 단어
    const wv = findWordInVerse(verseText);
    const w = wv || EN_WORDS[(day - 1) % Math.max(EN_WORDS.length, 1)];
    renderEnglishWord(w, !!wv);

    // 표현: 구절에서 찾고, 없으면 일일 표현
    const ev = findExprInVerse(verses);
    const e = ev || EN_EXPR[(day - 1) % Math.max(EN_EXPR.length, 1)];
    renderEnglishExpr(e, !!ev);

    // 성경 구절 (2절)
    const fullText = verses.map(v => v.text).join(" ");
    vEl.innerHTML = `
      <div class="eng-verse-ref">${verses.map(v => v.ref).join(" · ")} <span class="eng-verse-net">(NET)</span></div>
      ${verses.map(v => `<p class="eng-verse-en"><sup>${v.verse}</sup> ${v.text}</p>`).join("")}
      ${verses[0].ko ? `<div class="eng-verse-ko">${verses.map(v => v.ko).join(" ")}</div>` : ""}
      <p class="qt-note" style="margin-top:12px">💡 위에서 익힌 단어와 표현을 확인하며 구절을 암송해보세요. 소리 내어 3번 읽고, 눈을 감고 말해보기.</p>
      <button class="btn eng-speak-wide" id="engVerseSpeak">🔊 영어로 듣기</button>`;
    updateVerseSpeakBtn();
    document.getElementById("engVerseSpeak").onclick = () => toggleVerseSpeak(fullText);
  }).catch(() => {
    vEl.innerHTML = `<p class="bible-error">구절을 불러오지 못했어요. 네트워크를 확인해주세요.</p>`;
    // 구절 실패 시 일일 단어/표현으로 대체
    const w = EN_WORDS[(day - 1) % Math.max(EN_WORDS.length, 1)];
    const e = EN_EXPR[(day - 1) % Math.max(EN_EXPR.length, 1)];
    renderEnglishWord(w, false);
    renderEnglishExpr(e, false);
  });

  renderEnglishDone();
}
