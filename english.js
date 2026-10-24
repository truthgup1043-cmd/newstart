/* 하영시 앱 — 오늘의 영어 탭 (로직) */
// EN_WORDS, EN_EXPR은 english_data.js에서 로드
function englishDayNum() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / 86400000) + 1; // 1~365
}

/* ---------- 오늘의 영어 성경 구절 (VOTD + 내장 60구절 폴백) ---------- */
// 오프라인/API 실패 시에도 매일 바뀌는 내장 구절
function getLocalDailyVerse() {
  const day = englishDayNum();
  const v = EN_VERSES[(day - 1) % EN_VERSES.length];
  return [{ bookname: v.ref.split(" ")[0], chapter: "", verse: "", text: v.en, ko: v.ko, ref: v.ref, local: true }];
}
async function fetchEnglishVerse() {
  const dayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = "eng-votd:" + dayKey;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached) return cached;
  } catch {}
  try {
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
  } catch {
    // API 실패 시 내장 구절로 대체 (매일 순환)
    return getLocalDailyVerse();
  }
}

/* ---------- TTS 엔진 (개선: 무음 문제 대응) ---------- */
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
// 음성 목록이 실제로 로드될 때까지 대기 (iOS 무음 문제 핵심 대응)
function waitForVoices(timeoutMs = 4000) {
  return new Promise(resolve => {
    try {
      const vs = speechSynthesis.getVoices();
      if (vs && vs.length) return resolve(vs);
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(speechSynthesis.getVoices() || []); } };
      const t = setTimeout(finish, timeoutMs);
      speechSynthesis.onvoiceschanged = () => { clearTimeout(t); finish(); };
    } catch { resolve([]); }
  });
}
// 긴 텍스트를 문장 단위로 분할 (iOS 긴 발화 무음/끊김 대응)
function splitSentences(text) {
  const parts = (text || "").match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g);
  return (parts || [text]).map(s => s.trim()).filter(Boolean);
}
let engSpeaking = false;
let engResumeTimer = null;
function stopEngResumeTimer() {
  if (engResumeTimer) { clearInterval(engResumeTimer); engResumeTimer = null; }
}
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
function showTtsError(msg) {
  const vEl = document.getElementById("engVerse");
  if (!vEl) return;
  let tip = document.getElementById("engTtsTip");
  if (!tip) {
    tip = document.createElement("p");
    tip.id = "engTtsTip";
    tip.className = "qt-note";
    tip.style.cssText = "margin-top:8px;color:#a05a2c";
    vEl.appendChild(tip);
  }
  tip.textContent = msg;
}
// 개선된 speak: 음성 로딩 대기 → 문장 분할 → 순차 재생
// iOS 패치 (2026-10-25): 클릭 제스처 안에서 resume()으로 오디오 세션 깨우기,
// cancel() 직후 짧은 지연으로 iOS의 speak 삼킴 현상 방지
async function speakEnglish(text, opts = {}) {
  const onend = opts.onend || (() => { engSpeaking = false; updateVerseSpeakBtn(); });
  try {
    if (typeof speechSynthesis === "undefined") {
      showTtsError("⚠️ 이 기기/브라우저에서는 음성 읽기를 지원하지 않아요.");
      onend();
      return;
    }
    try { speechSynthesis.resume(); } catch {}
    speechSynthesis.cancel();
    await new Promise(r => setTimeout(r, 200));
    stopEngResumeTimer();
    const voices = await waitForVoices();
    const v = pickEnglishVoice();
    if (!v && !(voices && voices.length)) {
      showTtsError("⚠️ 영어 음성을 찾지 못했어요. 기기의 언어 설정에서 영어 음성을 추가해주세요.");
      onend();
      return;
    }
    const chunks = splitSentences(text);
    let idx = 0, failed = false;
    engSpeaking = true;
    updateVerseSpeakBtn();
    // Chrome 데스크톱 장시간 발화 중단 버그 대응
    engResumeTimer = setInterval(() => { try { speechSynthesis.resume(); } catch {} }, 5000);
    const speakNext = () => {
      if (idx >= chunks.length || failed) {
        stopEngResumeTimer();
        onend();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[idx]);
      u.lang = "en-US";
      u.rate = opts.rate || 0.92;
      u.pitch = 1.0;
      const vv = pickEnglishVoice();
      if (vv) u.voice = vv;
      u.onend = () => { idx++; speakNext(); };
      u.onerror = (e) => {
        // interrupted(사용자 멈춤) / canceled(iOS에서 cancel() 시 발생)는 정상 종료로 처리
        if (e && (e.error === "interrupted" || e.error === "canceled")) { stopEngResumeTimer(); onend(); return; }
        failed = true;
        stopEngResumeTimer();
        showTtsError("⚠️ 음성 재생에 실패했어요. (기기 음소거/무음 모드인지 확인해주세요)");
        onend();
      };
      speechSynthesis.speak(u);
    };
    speakNext();
  } catch (e) {
    stopEngResumeTimer();
    showTtsError("⚠️ 음성 재생 중 오류가 발생했어요.");
    onend();
  }
}
function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch {}
  stopEngResumeTimer();
  engSpeaking = false;
  updateVerseSpeakBtn();
}
function toggleVerseSpeak(text) {
  if (engSpeaking) {
    stopSpeaking();
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
  // 듀오링고 공부 완료 처리
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

/* ---------- 쓰기·말하기 연습 ---------- */
let engPracticeVerse = "";
// 단어 정규화 (비교용)
function normWord(w) {
  return (w || "").toLowerCase().replace(/[^a-z']/g, "");
}

/* --- 🎧 받아쓰기 --- */
function renderDictation(verseText) {
  const el = document.getElementById("engDictation");
  if (!el) return;
  const key = "eng-dict:" + today;
  let saved = "";
  try { saved = localStorage.getItem(key) || ""; } catch {}
  el.innerHTML = `
    <p class="qt-note">🔊 버튼을 눌러 구절을 듣고, 들리는 대로 영어로 입력해보세요.</p>
    <div class="eng-practice-row">
      <button class="btn eng-speak" id="engDictPlay">🔊 듣기</button>
      <button class="btn" id="engDictCheck">정답 확인</button>
    </div>
    <textarea id="engDictInput" class="eng-write-box" rows="3" placeholder="들리는 대로 입력...">${saved.replace(/</g, "&lt;")}</textarea>
    <div id="engDictResult"></div>`;
  document.getElementById("engDictPlay").onclick = () => speakEnglish(verseText, { rate: 0.85 });
  const input = document.getElementById("engDictInput");
  input.oninput = () => { try { localStorage.setItem(key, input.value); } catch {} };
  document.getElementById("engDictCheck").onclick = () => {
    const userWords = input.value.split(/\s+/).map(normWord).filter(Boolean);
    const ansWords = verseText.split(/\s+/).map(normWord).filter(Boolean);
    const resEl = document.getElementById("engDictResult");
    if (!userWords.length) { resEl.innerHTML = `<p class="qt-note">먼저 입력해보세요.</p>`; return; }
    let correct = 0;
    const html = ansWords.map((aw, i) => {
      const ok = userWords[i] === aw;
      if (ok) correct++;
      const uw = (input.value.split(/\s+/)[i] || "___");
      return `<span class="eng-wd ${ok ? "ok" : "ng"}" title="정답: ${aw}">${uw.replace(/</g, "&lt;")}</span>`;
    }).join(" ");
    const pct = Math.round(correct / ansWords.length * 100);
    resEl.innerHTML = `
      <p class="eng-score">정확도: <b>${pct}%</b> (${correct}/${ansWords.length} 단어)</p>
      <p class="eng-diff">${html}</p>
      <p class="qt-note">🟢 맞음 · 🔴 틀림 (마우스를 올리면 정답 표시)</p>`;
  };
}

/* --- 🗣️ 따라 말하기 --- */
function renderSpeaking(verseText) {
  const el = document.getElementById("engSpeaking");
  if (!el) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  el.innerHTML = `
    <p class="qt-note">구절을 소리 내어 읽어보세요. 음성 인식이 되면 발음을 체크해드려요.</p>
    <div class="eng-verse-en" style="margin:8px 0">"${verseText.replace(/</g, "&lt;")}"</div>
    <div class="eng-practice-row">
      <button class="btn eng-speak" id="engSpkListen">🔊 원어민 듣기</button>
      ${SR ? `<button class="btn" id="engSpkRec">🎤 말하기 시작</button>` : ``}
    </div>
    <div id="engSpkResult"></div>
    ${SR ? "" : `<p class="qt-note">⚠️ 이 브라우저는 음성 인식을 지원하지 않아요. (Chrome/Edge에서 가능) 소리 내어 3번 읽고 스스로 체크해보세요 💪</p>`}`;
  document.getElementById("engSpkListen").onclick = () => speakEnglish(verseText, { rate: 0.85 });
  if (!SR) return;
  const recBtn = document.getElementById("engSpkRec");
  const resEl = document.getElementById("engSpkResult");
  let rec = null, recording = false;
  recBtn.onclick = () => {
    if (recording) { try { rec.stop(); } catch {} return; }
    rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { recording = true; recBtn.textContent = "⏹ 멈추기"; resEl.innerHTML = `<p class="qt-note">듣고 있어요... 말씀하세요 🎤</p>`; };
    rec.onend = () => { recording = false; recBtn.textContent = "🎤 말하기 시작"; };
    rec.onerror = (e) => {
      recording = false; recBtn.textContent = "🎤 말하기 시작";
      resEl.innerHTML = `<p class="qt-note">⚠️ 음성 인식 오류 (${e.error}). 마이크 권한을 확인해주세요.</p>`;
    };
    rec.onresult = (e) => {
      const heard = e.results[0][0].transcript;
      const conf = Math.round(e.results[0][0].confidence * 100);
      const userWords = heard.split(/\s+/).map(normWord).filter(Boolean);
      const ansWords = verseText.split(/\s+/).map(normWord).filter(Boolean);
      let match = 0;
      ansWords.forEach((aw, i) => { if (userWords[i] === aw) match++; });
      const pct = ansWords.length ? Math.round(match / ansWords.length * 100) : 0;
      const emoji = pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪";
      resEl.innerHTML = `
        <p class="eng-score">${emoji} 인식률 <b>${pct}%</b> (신뢰도 ${conf}%)</p>
        <p class="qt-note">들은 내용: "${heard.replace(/</g, "&lt;")}"</p>
        ${pct < 80 ? `<p class="qt-note">틀린 부분을 다시 들어보며 연습해보세요.</p>` : `<p class="qt-note">훌륭해요! 다음 구절에 도전해보세요.</p>`}`;
    };
    try { rec.start(); } catch (e) {
      resEl.innerHTML = `<p class="qt-note">⚠️ 음성 인식을 시작할 수 없어요.</p>`;
    }
  };
}

/* --- ✏️ 빈칸 채우기 --- */
function renderBlanks(verseText) {
  const el = document.getElementById("engBlanks");
  if (!el) return;
  const words = verseText.split(/(\s+)/);
  // 4단어 이상, 불용어 아닌 단어 중 매 3번째를 빈칸으로
  let contentIdx = 0;
  const blanks = [];
  const html = words.map((w, i) => {
    if (!/[a-zA-Z]/.test(w) || /^\s+$/.test(w)) return w.replace(/</g, "&lt;");
    const nw = normWord(w);
    if (nw.length >= 4 && !ENG_STOPWORDS.has(nw)) {
      contentIdx++;
      if (contentIdx % 3 === 0) {
        const bi = blanks.length;
        blanks.push(nw);
        return `<input class="eng-blank" data-bi="${bi}" data-ans="${nw}" size="${Math.max(nw.length, 4)}" autocapitalize="off" spellcheck="false">`;
      }
    }
    return w.replace(/</g, "&lt;");
  }).join("");
  el.innerHTML = `
    <p class="qt-note">빈칸에 알맞은 단어를 입력해보세요.</p>
    <p class="eng-blank-text">${html}</p>
    <div class="eng-practice-row">
      <button class="btn" id="engBlankCheck">정답 확인</button>
      <button class="btn eng-speak" id="engBlankHint">🔊 힌트 듣기</button>
    </div>
    <div id="engBlankResult"></div>`;
  document.getElementById("engBlankHint").onclick = () => speakEnglish(verseText, { rate: 0.85 });
  document.getElementById("engBlankCheck").onclick = () => {
    let correct = 0;
    el.querySelectorAll(".eng-blank").forEach(inp => {
      const ok = normWord(inp.value) === inp.dataset.ans;
      inp.classList.toggle("ok", ok);
      inp.classList.toggle("ng", !ok);
      if (ok) correct++;
      else inp.title = "정답: " + inp.dataset.ans;
    });
    const pct = blanks.length ? Math.round(correct / blanks.length * 100) : 100;
    document.getElementById("engBlankResult").innerHTML =
      `<p class="eng-score">${pct === 100 ? "🎉" : "📝"} <b>${correct}/${blanks.length}</b> 정답 (${pct}%)</p>`;
  };
}

/* ---------- 렌더 ---------- */
function dailyPick(arr, n, day) {
  const len = Math.max((arr || []).length, 1);
  const base = ((day - 1) * n) % len;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[(base + i) % len]);
  return out;
}
function wordBlockHtml(w, fromVerse) {
  return `<div class="eng-item">
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
    <div class="eng-exk">${w.exk}</div>
  </div>`;
}
function renderEnglishWords(list) {
  const wEl = document.getElementById("engWord");
  if (!list || !list.length) { wEl.innerHTML = `<p class="bible-loading">단어 목록을 준비 중이에요.</p>`; return; }
  wEl.innerHTML = list.map(it => wordBlockHtml(it.w, it.fromVerse)).join("");
  wEl.querySelectorAll(".eng-speak").forEach(b => {
    b.onclick = (ev) => { ev.stopPropagation(); speakEnglish(b.dataset.say); };
  });
}
function exprBlockHtml(e, fromVerse) {
  if (fromVerse) {
    return `<div class="eng-item">
      <p class="qt-note" style="margin-bottom:8px">📖 오늘 구절 속 표현이에요 (${e.ref})</p>
      <div class="eng-word-row">
        <div class="eng-word" style="font-size:17px">"${e.e}"</div>
        <button class="btn eng-speak" data-say="${e.e.replace(/"/g, "")}">🔊</button>
      </div>
      <p class="qt-note" style="margin-top:8px">이 표현을 소리 내어 따라 읽어보세요.</p>
    </div>`;
  }
  return `<div class="eng-item">
    <div class="eng-word-row">
      <div class="eng-word">${e.e}</div>
      <button class="btn eng-speak" data-say="${e.e}">🔊</button>
    </div>
    <div class="eng-meaning">${e.m}</div>
    <div class="eng-ex">${e.ex}</div>
    <div class="eng-exk">${e.exk}</div>
  </div>`;
}
function renderEnglishExprs(list) {
  const eEl = document.getElementById("engExpr");
  if (!list || !list.length) { eEl.innerHTML = `<p class="bible-loading">표현 목록을 준비 중이에요.</p>`; return; }
  eEl.innerHTML = list.map(it => exprBlockHtml(it.e, it.fromVerse)).join("");
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

    // 단어: 구절에서 뽑은 단어 1개 + 일일 단어, 하루 3개
    const wv = findWordInVerse(verseText);
    let wordList = dailyPick(EN_WORDS, 3, day).map(w => ({ w, fromVerse: false }));
    if (wv) {
      wordList = wordList.filter(it => it.w.w.toLowerCase() !== wv.w.toLowerCase());
      wordList = [{ w: wv, fromVerse: true }, ...wordList].slice(0, 3);
    }
    renderEnglishWords(wordList);

    // 표현: 구절에서 뽑은 표현 1개 + 일일 표현, 하루 2개
    const ev = findExprInVerse(verses);
    let exprList = dailyPick(EN_EXPR, 2, day).map(e => ({ e, fromVerse: false }));
    if (ev) exprList = [{ e: ev, fromVerse: true }, exprList[0]];
    renderEnglishExprs(exprList);

    // 성경 구절
    const fullText = verses.map(v => v.text).join(" ");
    const verLabel = verses[0].local ? "(KJV)" : "(NET)";
    vEl.innerHTML = `
      <div class="eng-verse-ref">${verses.map(v => v.ref).join(" · ")} <span class="eng-verse-net">${verLabel}</span></div>
      ${verses.map(v => `<p class="eng-verse-en">${v.verse ? `<sup>${v.verse}</sup> ` : ""}${v.text}</p>`).join("")}
      ${verses[0].ko ? `<div class="eng-verse-ko">${verses.map(v => v.ko).join(" ")}</div>` : ""}
      <p class="qt-note" style="margin-top:12px">💡 위에서 익힌 단어와 표현을 확인하며 구절을 암송해보세요. 소리 내어 3번 읽고, 눈을 감고 말해보기.</p>
      <button class="btn eng-speak-wide" id="engVerseSpeak">🔊 영어로 듣기</button>`;
    updateVerseSpeakBtn();
    document.getElementById("engVerseSpeak").onclick = () => toggleVerseSpeak(fullText);

    // 쓰기·말하기 연습 (첫 번째 구절 기준)
    engPracticeVerse = verses[0].text;
    renderDictation(engPracticeVerse);
    renderSpeaking(engPracticeVerse);
    renderBlanks(engPracticeVerse);
  }).catch(() => {
    // 구절 실패 시 내장 구절로 대체
    const verses = getLocalDailyVerse();
    const fullText = verses[0].text;
    vEl.innerHTML = `
      <div class="eng-verse-ref">${verses[0].ref} <span class="eng-verse-net">(KJV)</span></div>
      <p class="eng-verse-en">${verses[0].text}</p>
      <div class="eng-verse-ko">${verses[0].ko}</div>
      <p class="qt-note" style="margin-top:12px">💡 위에서 익힌 단어와 표현을 확인하며 구절을 암송해보세요. 소리 내어 3번 읽고, 눈을 감고 말해보기.</p>
      <button class="btn eng-speak-wide" id="engVerseSpeak">🔊 영어로 듣기</button>`;
    updateVerseSpeakBtn();
    document.getElementById("engVerseSpeak").onclick = () => toggleVerseSpeak(fullText);
    renderEnglishWords(dailyPick(EN_WORDS, 3, day).map(w => ({ w, fromVerse: false })));
    renderEnglishExprs(dailyPick(EN_EXPR, 2, day).map(e => ({ e, fromVerse: false })));
    engPracticeVerse = fullText;
    renderDictation(engPracticeVerse);
    renderSpeaking(engPracticeVerse);
    renderBlanks(engPracticeVerse);
  });

  renderEnglishDone();
}
