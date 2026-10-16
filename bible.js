/* 하영시 앱 — 성경 읽기 탭 (맥체인 읽기표) */

/* 본문 참조 파싱: "Genesis 1", "Genesis 9-10", "Luke 1:1-38", "Isaiah 8, 9:1-7" */
function parseRef(ref) {
  const segs = [];
  let curBook = null;
  for (const part of ref.split(/\s*,\s*/)) {
    const m = part.match(/^(?:(.+?)\s+)?(\d+)(?:-(\d+))?(?::(\d+)(?:-(\d+))?)?$/);
    if (!m) return null;
    if (m[1]) curBook = m[1].trim();
    if (!curBook) return null;
    segs.push({ book: curBook, c1: +m[2], c2: m[3] ? +m[3] : null, v1: m[4] ? +m[4] : null, v2: m[5] ? +m[5] : null });
  }
  return segs;
}

/* 한글 표기: "창세기 1", "창세기 9-10", "누가복음 1:1-38", "이사야 8, 9:1-7" */
function korRef(ref) {
  const segs = parseRef(ref);
  if (!segs) return ref;
  return segs.map((s, idx) => {
    const ko = (BIBLE_BOOKS[s.book] || [])[1] || s.book;
    const prevKo = idx > 0 ? (((BIBLE_BOOKS[segs[idx - 1].book] || [])[1]) || segs[idx - 1].book) : null;
    let t = (ko === prevKo ? "" : ko + " ") + s.c1;
    if (s.c2) t += `-${s.c2}`;
    if (s.v1) t += `:${s.v1}${s.v2 ? `-${s.v2}` : ""}`;
    return t;
  }).join(", ");
}

/* 참조가 포함하는 장 수 (루틴 장수 기록용) */
function refChapters(ref) {
  const segs = parseRef(ref);
  if (!segs) return 1;
  let n = 0;
  for (const s of segs) n += (s.c2 ? s.c2 - s.c1 + 1 : 1);
  return n;
}

/* ---------- 번역본 ---------- */
const BIBLE_TRANSLATIONS = [
  { id: "KRV", name: "개역한글", api: "bolls" },
  { id: "RNKSV", name: "새번역", api: "bolls" },
  { id: "NET", name: "NET (영어)", api: "net" },
];
const getBibleTrans = () => localStorage.getItem("bibleTrans") || "KRV";
const setBibleTrans = (id) => localStorage.setItem("bibleTrans", id);

function stripHtml(s) {
  const d = document.createElement("div");
  d.innerHTML = s;
  return (d.textContent || "").trim();
}

const _textCache = {};
async function fetchBolls(tr, bookNum, chapter) {
  const res = await fetch(`https://bolls.life/get-text/${tr}/${bookNum}/${chapter}/`);
  if (!res.ok) throw new Error("bolls " + res.status);
  const data = await res.json();
  return data.map(v => ({ verse: v.verse, text: stripHtml(v.text) }));
}
async function fetchNet(passage) {
  const res = await fetch(`https://labs.bible.org/api/?passage=${encodeURIComponent(passage)}&type=json`);
  if (!res.ok) throw new Error("net " + res.status);
  const data = await res.json();
  return data.map(v => ({ verse: +v.verse, text: (v.text || "").trim() }));
}

/* 본문 하나(ref) 조회 -> verses [{verse, text}] */
async function fetchPassage(ref, transId) {
  const key = transId + ":" + ref;
  if (_textCache[key]) return _textCache[key];
  const tr = BIBLE_TRANSLATIONS.find(t => t.id === transId) || BIBLE_TRANSLATIONS[0];
  const segs = parseRef(ref);
  let verses = [];
  for (const s of segs) {
    if (tr.api === "bolls") {
      const bookNum = BIBLE_BOOKS[s.book][0];
      const chapters = [];
      for (let c = s.c1; c <= (s.c2 || s.c1); c++) chapters.push(c);
      for (const c of chapters) {
        let vs = await fetchBolls(tr.id, bookNum, c);
        if (s.v1) vs = vs.filter(v => v.verse >= s.v1 && (!s.v2 || v.verse <= s.v2));
        if (chapters.length > 1 || segs.length > 1) {
          // 여러 장/구간이면 장 표기 포함
          vs = vs.map(v => ({ ...v, chap: c }));
        }
        verses = verses.concat(vs);
      }
    } else {
      let p = `${s.book} ${s.c1}`;
      if (s.c2) p += `-${s.c2}`;
      else if (s.v1) p += `:${s.v1}${s.v2 ? `-${s.v2}` : ""}`;
      verses = verses.concat(await fetchNet(p));
    }
  }
  _textCache[key] = verses;
  return verses;
}

/* ---------- 읽기 진도 ---------- */
let bibleProg = { plan_day: 1, passage_idx: 0 };
let bibleViewDay = 1;

async function loadBibleProgress() {
  try {
    const local = JSON.parse(localStorage.getItem("bibleProg" + (user ? ":" + user.id : "")));
    if (local && local.plan_day) bibleProg = local;
  } catch {}
  bibleViewDay = bibleProg.plan_day;
  if (!user) return;
  try {
    const { data } = await sb.from("bible_progress").select("*").eq("id", user.id).maybeSingle();
    if (data) {
      bibleProg = { plan_day: data.plan_day, passage_idx: data.passage_idx };
      bibleViewDay = bibleProg.plan_day;
      try { localStorage.setItem("bibleProg:" + user.id, JSON.stringify(bibleProg)); } catch {}
    }
  } catch (e) { console.warn("진도 불러오기 실패:", e.message); }
}
async function saveBibleProgress() {
  try { localStorage.setItem("bibleProg" + (user ? ":" + user.id : ""), JSON.stringify(bibleProg)); } catch {}
  if (!user) return;
  try {
    await sb.from("bible_progress").upsert(
      { id: user.id, plan_day: bibleProg.plan_day, passage_idx: bibleProg.passage_idx, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  } catch (e) { console.warn("진도 저장 실패:", e.message); }
}

/* day-of-year -> M월 d일 */
function mcheyneDate(dayNum) {
  const d = new Date(new Date().getFullYear(), 0, dayNum);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function renderBibleText(el, ref) {
  const transId = getBibleTrans();
  el.innerHTML = `<p class="bible-loading">본문을 불러오는 중…</p>`;
  fetchPassage(ref, transId).then(vs => {
    el.innerHTML = vs.map(v =>
      `<span class="bible-verse"><sup>${v.chap ? v.chap + ":" : ""}${v.verse}</sup> ${v.text}</span>`
    ).join(" ");
  }).catch(() => {
    el.innerHTML = `<p class="bible-error">본문을 불러오지 못했어요. 네트워크를 확인해주세요.</p>`;
  });
}

function renderBible() {
  const day = bibleViewDay;
  const refs = MCHEYNE[day - 1];
  document.getElementById("bibleDayNum").textContent = day;
  document.getElementById("bibleDateRef").textContent = mcheyneDate(day);
  document.getElementById("bibleTrans").value = getBibleTrans();

  const isCurrent = day === bibleProg.plan_day;
  const wrap = document.getElementById("biblePassages");
  wrap.innerHTML = "";

  refs.forEach((ref, i) => {
    const done = isCurrent && i < bibleProg.passage_idx;
    const current = isCurrent && i === bibleProg.passage_idx;
    const card = document.createElement("div");
    card.className = "card bible-passage" + (done ? " done" : "") + (current ? " current open" : "");
    card.innerHTML = `
      <div class="bible-passage-head">
        <div><span class="bible-check">${done ? "✓ " : ""}</span><span class="bible-ref">${korRef(ref)}</span></div>
        <div class="go">${current ? "" : "›"}</div>
      </div>
      <div class="bible-body">
        <div class="bible-text" id="bible-text-${i}"></div>
        ${current ? `<button class="btn primary bible-done-btn" id="bible-done-${i}">읽었어요 ✓</button>` : ""}
      </div>`;
    wrap.appendChild(card);

    const textEl = card.querySelector(`#bible-text-${i}`);
    if (current) {
      renderBibleText(textEl, ref);
      card.querySelector(`#bible-done-${i}`).onclick = () => markPassageRead(i);
    } else {
      let loaded = false;
      const head = card.querySelector(".bible-passage-head");
      head.style.cursor = "pointer";
      head.onclick = () => {
        card.classList.toggle("open");
        if (card.classList.contains("open") && !loaded) {
          loaded = true;
          renderBibleText(textEl, ref);
        }
      };
    }
  });

  document.getElementById("bibleTodayBtn").style.display = isCurrent ? "none" : "";
}

async function markPassageRead(i) {
  if (bibleViewDay !== bibleProg.plan_day || i !== bibleProg.passage_idx) return;
  const ref = MCHEYNE[bibleProg.plan_day - 1][i];
  const ch = refChapters(ref);
  bibleProg.passage_idx++;
  // 읽은 장수를 루틴에 바로 누적
  store[today]["bible_chapters"] = (store[today]["bible_chapters"] || 0) + ch;
  let done = !!store[today]["bible"];
  if (bibleProg.passage_idx >= 4) {
    done = true;
    store[today]["bible"] = true;
    bibleProg.plan_day = bibleProg.plan_day >= 365 ? 1 : bibleProg.plan_day + 1;
    bibleProg.passage_idx = 0;
  }
  cache(); renderAll();
  await saveRow("bible", done, { chapters: store[today]["bible_chapters"] });
  bibleViewDay = bibleProg.plan_day;
  await saveBibleProgress();
  renderBible();
}
