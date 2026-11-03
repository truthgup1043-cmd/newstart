// 루틴앱 — Supabase 연동 버전 (기도 시간·성경 장수·러닝 기록 + 통계 그래프)
const SUPABASE_URL = "https://ztehhjsrffmawwtshddb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0ZWhoanNyZmZtYXd3dHNoZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjg0NzYsImV4cCI6MjEwNzcwNDQ3Nn0.n_uIm2kqjgxaA4BpsQ_FFE_4EIMXzqLd41wqXtX4P-s";

const ROUTINES = [
  { id: "sleep", name: "수면", emoji: "😴", sub: "푹 쉬기", color: "#5568b0",
    value: {
      fields: [
        { key: "sleep_hours", dbCol: "sleep_hours", label: "수면 시간", unit: "시간", presets: [4, 5, 6, 7, 8], def: 7 },
      ],
      doneText: s => s.sleep_hours != null ? `오늘 ${s.sleep_hours}시간 수면` : "완료",
    } },
  { id: "run", name: "달리기", emoji: "🏃", sub: "몸도 함께 단련", color: "#d98e4a",
    value: {
      optional: true,
      fields: [
        { key: "run_km", dbCol: "km", label: "키로수", unit: "km", input: true },
        { key: "run_minutes", dbCol: "run_minutes", label: "달린 시간", unit: "분", input: true },
      ],
      doneText: s => {
        const parts = [];
        if (s.run_km != null) parts.push(`${s.run_km}km`);
        if (s.run_minutes != null) parts.push(`${s.run_minutes}분`);
        return parts.length ? parts.join(" · ") : "완료";
      },
    } },
  { id: "meditation", name: "QT", emoji: "💭", sub: "말씀 묵상", color: "#8a6fbf" },
  { id: "prayer", name: "기도", emoji: "🙏", sub: "하루를 기도로 시작", color: "#4a7c59",
    value: {
      fields: [
        { key: "prayer_minutes", dbCol: "minutes", label: "기도한 시간 수동입력", unit: "분", presets: [5, 10, 20, 30, 60], def: 30 },
      ],
      doneText: s => s.prayer_minutes != null ? `오늘 ${s.prayer_minutes}분 기도` : "완료",
    } },
  { id: "bible", name: "성경 읽기", emoji: "📖", sub: "말씀 한 장이라도", color: "#4a6fa5" },
  { id: "gospel", name: "복음 읽기", emoji: "✝️", sub: "오늘의 복음 연구", color: "#b7791f" },
  { id: "catechism", name: "문답 공부", emoji: "❓", sub: "오늘의 문답", color: "#a05a2c" },
  { id: "english", name: "영어 공부", emoji: "🔤", sub: "오늘의 영어", color: "#2a9d8f" },
  { id: "praise", name: "찬양", emoji: "🎵", sub: "마음으로 찬양", color: "#c05a7a" },
  { id: "reading", name: "독서", emoji: "📚", sub: "책 읽는 시간", color: "#6a5acd",
    value: {
      fields: [
        { key: "reading_minutes", dbCol: "minutes", label: "읽은 시간", unit: "분", presets: [10, 20, 30, 60], def: 30 },
      ],
      doneText: s => s.reading_minutes != null ? `오늘 ${s.reading_minutes}분 독서` : "완료",
    } },
];

let CACHE_KEY = "routine-app-v1";
let user = null;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

let store = {};
const today = dayKey();

function loadLocal() {
  CACHE_KEY = user ? "routine-app-v1:" + user.id : "routine-app-v1";
  try { store = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { store = {}; }
  if (!store[today]) store[today] = {};
}

let pickerFor = null;
let picked = {};

function cache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch {}
}

const VALUE_COLS = ["minutes", "chapters", "km", "run_minutes", "sleep_hours"];

async function syncFromCloud() {
  if (!user) return;
  const { data, error } = await sb.from("completions").select("day, routine, done, " + VALUE_COLS.join(",")).eq("user_id", user.id);
  if (error) { console.warn("클라우드 동기화 실패, 로컬 캐시 사용:", error.message); renderAll(); return; }
  const colToKey = { minutes: "prayer_minutes", chapters: "bible_chapters", km: "run_km", run_minutes: "run_minutes", sleep_hours: "sleep_hours" };
  store = {};
  data.forEach(r => {
    if (!store[r.day]) store[r.day] = {};
    store[r.day][r.routine] = r.done;
    Object.entries(colToKey).forEach(([col, key]) => {
      if (r[col] != null) store[r.day][key] = r[col];
    });
  });
  if (!store[today]) store[today] = {};
  cache();
  renderAll();
}

async function saveRow(routineId, done, extra = {}) {
  if (!user) return;
  const base = { day: today, routine: routineId, done, user_id: user.id };
  VALUE_COLS.forEach(c => base[c] = null);
  const { error } = await sb.from("completions").upsert(
    { ...base, ...extra },
    { onConflict: "day,routine" }
  );
  if (error) console.warn("클라우드 저장 실패:", error.message);
}

async function toggle(id) {
  const r = ROUTINES.find(x => x.id === id);
  if (r.value) {
    if (store[today][id]) {
      store[today][id] = false;
      r.value.fields.forEach(f => delete store[today][f.key]);
      pickerFor = null;
      cache(); renderAll();
      await saveRow(id, false);
    } else {
      pickerFor = (pickerFor === id) ? null : id;
      picked = {};
      r.value.fields.forEach(f => { if (f.def != null) picked[f.key] = f.def; });
      renderRoutines();
    }
    return;
  }
  store[today][id] = !store[today][id];
  cache(); renderAll();
  await saveRow(id, !!store[today][id]);
}

function sleepHours(bed, wake) {
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60; // 다음날 기상
  return Math.round(mins / 6) / 10; // 소수 1자리 (시간)
}

async function confirmPicker() {
  const r = ROUTINES.find(x => x.id === pickerFor);
  if (!r || !r.value) return;
  const extra = {};
  r.value.fields.forEach(f => {
    let v = null;
    if (f.presets) {
      const inp = document.getElementById(`custom-${f.key}`);
      v = (inp && inp.value) ? Math.max(1, parseFloat(inp.value) || picked[f.key]) : picked[f.key];
    } else if (f.timeRange) {
      const bed = document.getElementById(`input-${f.key}_bed`).value;
      const wake = document.getElementById(`input-${f.key}_wake`).value;
      if (bed && wake) v = sleepHours(bed, wake);
    } else if (f.input) {
      const inp = document.getElementById(`input-${f.key}`);
      v = (inp && inp.value !== "") ? parseFloat(inp.value) : null;
      if (v != null && !(v > 0)) v = null;
    }
    if (v != null) {
      store[today][f.key] = v;
      extra[f.dbCol] = v;
    }
  });
  store[today][r.id] = true;
  pickerFor = null;
  cache(); renderAll();
  await saveRow(r.id, true, extra);
}

function doneCount(key) {
  return visibleRoutines().filter(r => store[key] && store[key][r.id]).length;
}
function streak(id) {
  let n = 0, k = today;
  if (!(store[k] && store[k][id])) k = addDays(k, -1);
  while (store[k] && store[k][id]) { n++; k = addDays(k, -1); }
  return n;
}

// ---------- 렌더 ----------
function renderRoutines() {
  const vis = visibleRoutines();
  const done = doneCount(today);
  document.getElementById("doneCount").textContent = done;
  document.getElementById("totalCount").textContent = vis.length;
  document.getElementById("progressFill").style.width = (vis.length ? done / vis.length * 100 : 0) + "%";

  const list = document.getElementById("routineList");
  list.innerHTML = "";
  vis.forEach(r => {
    const isDone = !!(store[today] && store[today][r.id]);
    const el = document.createElement("div");
    const showPicker = r.value && pickerFor === r.id && !isDone;
    el.className = "routine" + (isDone ? " done" : "") + (showPicker ? " has-picker" : "");

    let sub = r.sub;
    if (r.value && isDone) sub = r.value.doneText(store[today]);
    else if (r.id === "bible" && store[today]["bible_chapters"] != null) sub = `오늘 ${store[today]["bible_chapters"]}장 읽음`;

    let picker = "";
    if (showPicker) {
      const fieldsHtml = r.value.fields.map(f => {
        if (f.presets) {
          return `
            <div class="picker-label">${f.label}</div>
            <div class="chips">
              ${f.presets.map(p =>
                `<button class="chip${p === picked[f.key] ? " sel" : ""}" data-f="${f.key}" data-v="${p}">${p}${f.unit}</button>`).join("")}
              <input id="custom-${f.key}" class="custom" type="number" min="1" placeholder="직접 입력(${f.unit})">
            </div>`;
        }
        if (f.timeRange) {
          return `
            <div class="picker-label">${f.label} <span class="opt">(선택)</span></div>
            <div class="time-row">
              <label class="time-field">취침<input id="input-${f.key}_bed" type="time" value="23:00"></label>
              <label class="time-field">기상<input id="input-${f.key}_wake" type="time" value="07:00"></label>
            </div>`;
        }
        return `
          <div class="picker-label">${f.label} <span class="opt">(선택)</span></div>
          <div class="chips">
            <input id="input-${f.key}" class="custom wide" type="number" min="0" step="any" placeholder="${f.unit} 입력">
          </div>`;
      }).join("");
      picker = `
        <div class="picker" onclick="event.stopPropagation()">
          ${fieldsHtml}
          ${r.id === "prayer" && typeof prayerTimerHtml === "function" ? prayerTimerHtml() : ""}
          <div class="picker-actions">
            <button class="btn primary" id="pickerSave">저장</button>
            <button class="btn" id="pickerCancel">취소</button>
          </div>
        </div>`;
    }

    el.innerHTML = `
      <div class="emoji">${r.emoji}</div>
      <div class="info"><div class="name">${r.name}</div><div class="sub">${sub}</div></div>
      <div class="check">✓</div>${picker}`;
    el.onclick = () => toggle(r.id);
    list.appendChild(el);

    if (picker) {
      el.querySelectorAll(".chip").forEach(c => {
        if (c.closest("#prayerDurChips")) return; // 기도 타이머 칩은 prayer.js에서 별도 처리
        c.onclick = e => {
          e.stopPropagation();
          const fk = c.dataset.f;
          picked[fk] = Number(c.dataset.v);
          const inp = document.getElementById(`custom-${fk}`);
          if (inp) inp.value = "";
          el.querySelectorAll(`.chip[data-f="${fk}"]`).forEach(x => x.classList.remove("sel"));
          c.classList.add("sel");
        };
      });
      el.querySelector("#pickerSave").onclick = e => { e.stopPropagation(); confirmPicker(); };
      el.querySelector("#pickerCancel").onclick = e => { e.stopPropagation(); pickerFor = null; renderRoutines(); };
    }
  });
}

function renderWeek() {
  const week = document.getElementById("weekView");
  week.innerHTML = "";
  const now = new Date();
  const monday = addDays(today, -((now.getDay() + 6) % 7));
  const dows = ["월", "화", "수", "목", "금", "토", "일"];
  for (let i = 0; i < 7; i++) {
    const k = addDays(monday, i);
    const el = document.createElement("div");
    el.className = "day" + (k === today ? " today" : "");
    el.innerHTML = `<div class="dow">${dows[i]}</div>
      <div>${Number(k.slice(8))}</div>
      <div class="dots">${visibleRoutines().map(r =>
        `<span class="dot${store[k] && store[k][r.id] ? " on" : ""}" style="${store[k] && store[k][r.id] ? "background:" + r.color : ""}"></span>`).join("")}</div>`;
    week.appendChild(el);
  }
}

function renderStreaks() {
  const sv = document.getElementById("streakView");
  sv.innerHTML = "";
  visibleRoutines().forEach(r => {
    const el = document.createElement("div");
    el.className = "streak";
    el.innerHTML = `<span>${r.emoji} ${r.name}</span><b>${streak(r.id)}일 연속</b>`;
    sv.appendChild(el);
  });
}

let trendChart = null, prayerChart = null, bibleChart = null, runChart = null, sleepChart = null;

function last30() {
  const keys = [];
  for (let i = 29; i >= 0; i--) keys.push(addDays(today, -i));
  return keys;
}

function avgOf(keys, key, decimals = 0) {
  const vals = keys.map(k => (store[k] && store[k][key]) || 0).filter(v => v > 0);
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return decimals ? Number(avg.toFixed(decimals)) : Math.round(avg);
}

function renderStats() {
  const keys = last30();
  const labels = keys.map(k => k.slice(5).replace("-", "/"));

  const sv = document.getElementById("summaryView");
  sv.innerHTML = "";
  visibleRoutines().forEach(r => {
    const n = keys.filter(k => store[k] && store[k][r.id]).length;
    const pct = Math.round(n / 30 * 100);
    let extra = "";
    if (r.id === "prayer") {
      const a = avgOf(keys, "prayer_minutes");
      if (a != null) extra = ` · 평균 ${a}분`;
    }
    if (r.id === "bible") {
      const a = avgOf(keys, "bible_chapters");
      if (a != null) extra = ` · 평균 ${a}장`;
    }
    if (r.id === "run") {
      const parts = [];
      const km = avgOf(keys, "run_km", 1);
      const mins = avgOf(keys, "run_minutes");
      if (km != null) parts.push(`평균 ${km}km`);
      if (mins != null) parts.push(`평균 ${mins}분`);
      if (parts.length) extra = " · " + parts.join(" ");
    }
    if (r.id === "sleep") {
      const h = avgOf(keys, "sleep_hours", 1);
      if (h != null) extra = ` · 평균 ${h}시간`;
    }
    const el = document.createElement("div");
    el.className = "streak";
    el.innerHTML = `<span>${r.emoji} ${r.name}</span><b>${pct}% (${n}/30일)${extra}</b>`;
    sv.appendChild(el);
  });

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { font: { size: 10 } } },
    },
  };

  // 데이터에 맞춰 y축 최대값을 동적으로 계산 (nice number로 올림)
  const niceMax = (values, minMax = 5) => {
    const m = Math.max(minMax, ...values);
    const mag = Math.pow(10, Math.floor(Math.log10(m)));
    const n = m / mag;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return Math.ceil(nice * mag * 1.15);
  };

  const routines = visibleRoutines();
  const stackedTotals = keys.map(k => routines.filter(r => store[k] && store[k][r.id]).length);
  const trendMax = Math.max(routines.length, ...stackedTotals);

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart"), {
    type: "bar",
    data: {
      labels,
      datasets: routines.map(r => ({
        label: r.name,
        data: keys.map(k => (store[k] && store[k][r.id]) ? 1 : 0),
        backgroundColor: r.color,
      })),
    },
    options: {
      ...baseOpts,
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true, max: trendMax, ticks: { stepSize: 1, font: { size: 10 } } },
      },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });

  const singleBar = (id, label, color, key, stepSize, minMax) => {
    const ch = { trendChart, prayerChart, bibleChart, runChart, sleepChart }[id];
    if (ch) ch.destroy();
    const data = keys.map(k => (store[k] && store[k][key]) || 0);
    return new Chart(document.getElementById(id), {
      type: "bar",
      data: {
        labels,
        datasets: [{ label, data, backgroundColor: color, borderRadius: 3 }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: baseOpts.scales.x,
          y: { beginAtZero: true, max: niceMax(data, minMax), ticks: { stepSize, font: { size: 10 } } },
        },
        plugins: { legend: { display: false } },
      },
    });
  };

  prayerChart = singleBar("prayerChart", "기도 시간(분)", "#4a7c59", "prayer_minutes", undefined, 30);
  bibleChart = singleBar("bibleChart", "읽은 장수", "#4a6fa5", "bible_chapters", 1, 5);
  runChart = singleBar("runChart", "러닝 거리(km)", "#d98e4a", "run_km", undefined, 5);
  sleepChart = singleBar("sleepChart", "수면 시간(시간)", "#5568b0", "sleep_hours", undefined, 10);
}

function renderAll() {
  renderRoutines();
  renderWeek();
  renderStreaks();
  if (window.Chart) renderStats();
}

document.getElementById("todayLabel").textContent =
  new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

// ---------- 탭 ----------
const TAB_ORDER = ["routine", "qt", "bible", "gospel", "reading", "catechism", "english", "praise", "homeschool", "livingbooks", "relation"];
function goToTab(tabId) {
  const btn = document.querySelector('.tab[data-tab="' + tabId + '"]');
  if (btn) btn.click();
}
function goToNextTab(fromTab) {
  const vis = getTabVisibility();
  const idx = TAB_ORDER.indexOf(fromTab);
  for (let i = idx + 1; i < TAB_ORDER.length; i++) {
    if (vis[TAB_ORDER[i]] !== false) {
      goToTab(TAB_ORDER[i]);
      return;
    }
  }
}
document.querySelectorAll(".tab").forEach(t => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("panel-" + t.dataset.tab).classList.remove("hidden");
    if (t.dataset.tab === "bible") renderBible();
    if (t.dataset.tab === "english") renderEnglish();
    if (t.dataset.tab === "catechism") renderCatechism();
    if (t.dataset.tab === "qt") renderQtArchive();
    if (t.dataset.tab === "reading" && typeof renderReading === "function") renderReading();
    if (t.dataset.tab === "relation") renderRelation();
  };
});

// ---------- QT 본문 (앱 내장 31일 순환) ----------
let qtOffset = 0;

function renderQT() {
  const day = new Date().getDate(); // 1-31
  const idx = (((day - 1 + qtOffset) % QT_VERSES.length) + QT_VERSES.length) % QT_VERSES.length;
  const v = QT_VERSES[idx];
  document.getElementById("qtRef").textContent = v.ref;
  document.getElementById("qtText").textContent = v.text;
}

document.getElementById("qtPrev").onclick = () => { qtOffset--; renderQT(); };
document.getElementById("qtNext").onclick = () => { qtOffset++; renderQT(); };
renderQT();

// ---------- 복음 연구 탭 ----------
function renderGospel() {
  const d = GOSPEL_DATA;
  const sumHtml = `
    <div class="card gospel-card" id="gospelSummaryCard">
      <div class="gospel-toggle" onclick="document.getElementById('gospelSummaryCard').classList.toggle('open')">
        <div>
          <div class="gospel-kicker">주제별 종합 정리</div>
          <div class="gospel-title">${d.summary.title}</div>
          <div class="gospel-meta">${d.summary.period}</div>
        </div>
        <div class="go">›</div>
      </div>
      <div class="gospel-body">
        ${d.summary.sections.map(sec => `
          <h4>${sec.h}</h4>
          <ul>${sec.items.map(i => `<li>${i}</li>`).join("")}</ul>
        `).join("")}
        <h4>인물별 한 줄 요약</h4>
        <ul>${d.summary.people.map(p => `<li><b>${p.name}</b> — ${p.line}</li>`).join("")}</ul>
      </div>
    </div>`;

  const listHtml = d.entries.map((e, i) => `
    <div class="card gospel-card${i === 0 ? " open" : ""}" id="ge-${i}">
      <div class="gospel-toggle" onclick="document.getElementById('ge-${i}').classList.toggle('open')">
        <div>
          <div class="gospel-kicker">${e.date}</div>
          <div class="gospel-title">${e.person}</div>
          <div class="gospel-meta">${e.oneliner}</div>
        </div>
        <div class="go">›</div>
      </div>
      <div class="gospel-body">
        <ul>${e.points.map(p => `<li>${p}</li>`).join("")}</ul>
      </div>
    </div>${i === 0 ? `<button class="btn primary eng-done-btn" onclick="completeGospelRoutine()">오늘 복음 읽기 완료하기</button>` : ""}`).join("");

  document.getElementById("gospelSummary").innerHTML = sumHtml;
  document.getElementById("gospelList").innerHTML = listHtml;
}
renderGospel();

// ---------- 홈스쿨 탭 ----------
function renderHomeschool() {
  const listHtml = HOMESCHOOL_DATA.entries.map((e, i) => `
    <div class="card gospel-card${i === 0 ? " open" : ""}" id="hs-${i}">
      <div class="gospel-toggle" onclick="document.getElementById('hs-${i}').classList.toggle('open')">
        <div>
          <div class="gospel-kicker">${e.date}</div>
          <div class="gospel-title">${e.title}</div>
          <div class="gospel-meta">${e.subtitle}</div>
        </div>
        <div class="go">›</div>
      </div>
      <div class="gospel-body">
        ${(e.sections || []).map(sec => `
          <h4>${sec.h}</h4>
          <ul>${(sec.items || []).map(item => `<li>${item}</li>`).join("")}</ul>
        `).join("")}
        <h4>강의에서 풀어야 할 열린 질문</h4>
        <ul>${(e.questions || []).map(q => `<li>${q}</li>`).join("")}</ul>
        <h4>참고 문헌</h4>
        <ul>${(e.refs || []).map(r => `<li>${r}</li>`).join("")}</ul>
      </div>
    </div>`).join("");

  document.getElementById("homeschoolList").innerHTML = listHtml;
}
renderHomeschool();

// ---------- 살아있는 책 탭 ----------
function renderLivingBooks() {
  const d = (typeof LIVINGBOOKS_DATA !== "undefined" && LIVINGBOOKS_DATA) || {};
  const sumByTitle = {};
  (d.summaries || []).forEach(s => { sumByTitle[s.title] = s; });
  const sums = d.summaries || [];
  const latest = sums[sums.length - 1];
  let idx = 0;
  let html = "";
  (d.subjects || []).forEach(sub => {
    html += `<h4>${sub.name}</h4>`;
    sub.books.forEach(b => {
      const id = "lb-" + (idx++);
      const s = sumByTitle[b.title];
      const isOpen = !!(s && latest && s.title === latest.title);
      const meta = [b.author, b.korean ? "한국어판 있음" : "", b.later ? "나중에" : "", b.note].filter(x => x).join(" · ");
      html += `
    <div class="card gospel-card${isOpen ? " open" : ""}" id="${id}">
      <div class="gospel-toggle" onclick="document.getElementById('${id}').classList.toggle('open')">
        <div>
          <div class="gospel-kicker">${sub.name}</div>
          <div class="gospel-title">${b.title}</div>
          <div class="gospel-meta">${meta}</div>
        </div>
        <div class="go">›</div>
      </div>
      <div class="gospel-body">
        ${s ? (s.paragraphs || []).map(p => `<p>${p}</p>`).join("") : `<p>${b.note}</p><p>요약 준비 중입니다. 매주 금요일 한 권씩 추가됩니다.</p>`}
      </div>
    </div>`;
    });
  });
  document.getElementById("livingbooksList").innerHTML = html;
}
renderLivingBooks();

// ---------- 관계 탭 ----------
const RELATION_GROUPS = ["가족", "친구", "교회 식구", "기타"];
function getRelationPeople() {
  try { return JSON.parse(localStorage.getItem("relation-people") || "[]"); }
  catch { return []; }
}
function saveRelationPeople(p) {
  localStorage.setItem("relation-people", JSON.stringify(p));
}
function getRelationScope() {
  return localStorage.getItem("relation-scope") || "전체";
}
function getRelationDoneMap() {
  try { return JSON.parse(localStorage.getItem("relation-done") || "{}"); }
  catch { return {}; }
}
function relationTodayKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function relationDayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}
let relationShuffle = null;
function relationCopy(text, btn) {
  const done = () => {
    const old = btn.textContent;
    btn.textContent = "복사됨 ✓";
    setTimeout(() => { btn.textContent = old; }, 1200);
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else fallback();
}
function renderRelation() {
  const now = new Date();
  const doy = relationDayOfYear(now);
  const tkey = relationTodayKey(now);
  const people = getRelationPeople();
  const scope = getRelationScope();
  const inScope = scope === "전체" ? people : people.filter(p => p.group === scope);
  const doneName = getRelationDoneMap()[tkey];

  let pick = null, pickIdx = -1;
  if (inScope.length) {
    pickIdx = (relationShuffle !== null ? relationShuffle : doy) % inScope.length;
    pick = inScope[pickIdx];
  }

  let missionHtml = "";
  if (doneName) {
    missionHtml = `<div class="card rel-mission done">
      <div class="rel-kicker">오늘의 연락 미션</div>
      <div class="rel-done-msg">🎉 완료! 오늘 ${doneName}님에게 연락했어요.<br>작은 안부가 큰 힘이 됩니다.</div>
    </div>`;
  } else if (pick) {
    missionHtml = `<div class="card rel-mission">
      <div class="rel-kicker">오늘의 연락 미션</div>
      <div class="rel-person">${pick.name} <span class="rel-group-tag">${pick.group}</span></div>
      <p class="rel-guide">막막하시죠? 아래 추천 내용 중 마음에 드는 걸 골라 그대로 보내보세요.<br>짧은 안부 한 줄이면 충분해요.</p>
      <div class="rel-btn-row">
        <button class="btn primary" id="relDoneBtn">연락 완료 ✅</button>
        <button class="btn" id="relShuffleBtn">다른 사람으로</button>
      </div>
    </div>`;
  } else {
    missionHtml = `<div class="card rel-mission">
      <div class="rel-kicker">오늘의 연락 미션</div>
      <p class="rel-guide">아래에서 연락하고 싶은 사람을 먼저 등록해보세요.<br>등록해두면 매일 범위 안에서 한 분씩 추천해드려요.</p>
    </div>`;
  }
  document.getElementById("relationMission").innerHTML = missionHtml;

  const verse = RELATION_VERSES[doy % RELATION_VERSES.length];
  const quote = RELATION_QUOTES[doy % RELATION_QUOTES.length];
  const greet = RELATION_GREETINGS[doy % RELATION_GREETINGS.length].replace("{이름}", pick ? pick.name : "○○○");
  const verseText = `📖 "${verse.text}" (${verse.ref})`;
  const quoteText = `✍️ "${quote.text}" — ${quote.by}`;
  document.getElementById("relationSuggest").innerHTML = `
    <div class="card rel-sug">
      <div class="rel-sug-head"><span>📖 오늘의 말씀</span><button class="link-btn" data-copy="${encodeURIComponent(verseText)}">복사</button></div>
      <p class="rel-sug-text">"${verse.text}"</p>
      <p class="rel-sug-ref">${verse.ref}</p>
    </div>
    <div class="card rel-sug">
      <div class="rel-sug-head"><span>✍️ 좋은 글귀</span><button class="link-btn" data-copy="${encodeURIComponent(quoteText)}">복사</button></div>
      <p class="rel-sug-text">"${quote.text}"</p>
      <p class="rel-sug-ref">— ${quote.by}</p>
    </div>
    <div class="card rel-sug">
      <div class="rel-sug-head"><span>💬 안부 인사</span><button class="link-btn" data-copy="${encodeURIComponent("💬 " + greet)}">복사</button></div>
      <p class="rel-sug-text">${greet}</p>
    </div>`;
  document.querySelectorAll("#relationSuggest [data-copy]").forEach(b => {
    b.onclick = () => relationCopy(decodeURIComponent(b.dataset.copy), b);
  });

  const scopes = ["전체", ...RELATION_GROUPS];
  document.getElementById("relationScope").innerHTML = scopes.map(s =>
    `<button class="chip${scope === s ? " sel" : ""}" data-scope="${s}">${s}</button>`
  ).join("");
  document.querySelectorAll("#relationScope .chip").forEach(c => {
    c.onclick = () => {
      localStorage.setItem("relation-scope", c.dataset.scope);
      relationShuffle = null;
      renderRelation();
    };
  });

  document.getElementById("relationList").innerHTML = people.length ? people.map((p, i) => `
    <div class="rel-row">
      <div><strong>${p.name}</strong> <span class="rel-group-tag">${p.group}</span></div>
      <button class="link-btn" data-del="${i}">삭제</button>
    </div>`).join("")
    : `<p class="qt-note">아직 등록된 사람이 없어요. 위에서 추가해보세요.</p>`;
  document.querySelectorAll("#relationList [data-del]").forEach(b => {
    b.onclick = () => {
      const arr = getRelationPeople();
      arr.splice(Number(b.dataset.del), 1);
      saveRelationPeople(arr);
      relationShuffle = null;
      renderRelation();
    };
  });

  const doneBtn = document.getElementById("relDoneBtn");
  if (doneBtn) doneBtn.onclick = () => {
    const m = getRelationDoneMap();
    m[tkey] = pick.name;
    localStorage.setItem("relation-done", JSON.stringify(m));
    relationShuffle = null;
    renderRelation();
  };
  const shBtn = document.getElementById("relShuffleBtn");
  if (shBtn) shBtn.onclick = () => {
    if (inScope.length > 1) {
      let n;
      do { n = Math.floor(Math.random() * inScope.length); } while (n === pickIdx);
      relationShuffle = n;
    }
    renderRelation();
  };
  document.getElementById("relAddBtn").onclick = () => {
    const nameEl = document.getElementById("relName");
    const name = nameEl.value.trim();
    const group = document.getElementById("relGroup").value;
    if (!name) { nameEl.focus(); return; }
    const arr = getRelationPeople();
    arr.push({ name, group });
    saveRelationPeople(arr);
    nameEl.value = "";
    relationShuffle = null;
    renderRelation();
  };
}

// ---------- 추천 찬양 ----------
function renderPraise() {
  const updated = (typeof PRAISE_UPDATED !== "undefined" ? PRAISE_UPDATED : "");
  const picks = (typeof PRAISE_PICKS !== "undefined" && PRAISE_PICKS) || [];
  document.getElementById("praiseUpdated").textContent = `업데이트: ${updated} · 매일 갱신`;
  document.getElementById("praisePicks").innerHTML = picks.map((p, i) => `
    <a class="link-card" href="${p.url}" target="_blank" rel="noopener" data-praise-idx="${i}">
      <div class="emoji">🎵</div>
      <div class="info">
        <div class="name">${p.title}</div>
        <div class="sub">${p.artist}</div>
        ${p.desc ? `<div class="praise-desc">${p.desc}</div>` : ""}
      </div>
      <div class="go">›</div>
    </a>`).join("");
  document.querySelectorAll("[data-praise-idx]").forEach(a => {
    a.onclick = () => {
      if (!store[today]["praise"]) {
        store[today]["praise"] = true;
        cache(); renderAll();
        saveRow("praise", true);
      }
    };
  });
}
renderPraise();

// ---------- 성경 읽기 탭 초기화 ----------
document.getElementById("biblePrevDay").onclick = () => {
  if (bibleViewDay > 1) { bibleViewDay--; renderBible(); }
};
document.getElementById("bibleNextDay").onclick = () => {
  if (bibleViewDay < 365) { bibleViewDay++; renderBible(); }
};
document.getElementById("bibleTodayBtn").onclick = () => {
  bibleViewDay = bibleProg.plan_day; renderBible();
};
document.getElementById("bibleTrans").onchange = (e) => {
  setBibleTrans(e.target.value);
  renderBible();
};
loadBibleProgress();

// ---------- 회원 인증 (선택사항) ----------
function updateAuthUI() {
  const loggedIn = !!user;
  document.getElementById("loginBtn").style.display = loggedIn ? "none" : "";
  document.getElementById("userRow").style.display = loggedIn ? "" : "none";
  if (loggedIn) {
    const nm = user.user_metadata && user.user_metadata.name;
    document.getElementById("userEmail").textContent = nm ? `${nm} (${user.email})` : user.email;
  }
}
function authError(msg) {
  const el = document.getElementById("authErr");
  el.textContent = msg;
  el.style.color = "#c0392b";
}
function authSuccess(msg) {
  const el = document.getElementById("authErr");
  el.textContent = msg;
  el.style.color = "#4a7c59";
}
let signupJustCompleted = false;
// ---------- 탭 표시/숨김 설정 ----------
const TABS_CONFIG = [
  { id: "routine", name: "루틴", locked: true },
  { id: "qt", name: "QT" },
  { id: "bible", name: "성경" },
  { id: "gospel", name: "복음" },
  { id: "reading", name: "독서" },
  { id: "catechism", name: "문답" },
  { id: "english", name: "영어" },
  { id: "praise", name: "찬양" },
  { id: "homeschool", name: "홈스쿨" },
  { id: "livingbooks", name: "리빙북" },
  { id: "relation", name: "관계" },
];
function getTabVisibility() {
  try {
    const v = JSON.parse(localStorage.getItem("tab-visibility") || "{}");
    const out = {};
    TABS_CONFIG.forEach(t => { out[t.id] = v[t.id] !== false; });
    return out;
  } catch { 
    const out = {};
    TABS_CONFIG.forEach(t => { out[t.id] = true; });
    return out;
  }
}
function applyTabVisibility() {
  const vis = getTabVisibility();
  let activeHidden = false;
  document.querySelectorAll(".tab").forEach(btn => {
    const id = btn.dataset.tab;
    const show = vis[id] !== false;
    btn.style.display = show ? "" : "none";
    if (!show && btn.classList.contains("active")) activeHidden = true;
  });
  if (activeHidden) {
    document.querySelector('.tab[data-tab="routine"]').click();
  }
}
function renderTabToggles() {
  const vis = getTabVisibility();
  const wrap = document.getElementById("tabToggles");
  wrap.innerHTML = "";
  TABS_CONFIG.forEach(t => {
    const row = document.createElement("div");
    row.className = "tab-toggle-row";
    row.innerHTML = `<span>${t.name}${t.locked ? ' <small style="color:var(--muted)">(항상 표시)</small>' : ''}</span>
      <label class="toggle${t.locked ? ' disabled' : ''}">
        <input type="checkbox" data-tab="${t.id}" ${vis[t.id] ? "checked" : ""} ${t.locked ? "disabled" : ""}>
        <span class="slider"></span>
      </label>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.onchange = () => {
      const vis = getTabVisibility();
      vis[cb.dataset.tab] = cb.checked;
      try { localStorage.setItem("tab-visibility", JSON.stringify(vis)); } catch {}
      applyTabVisibility();
    };
  });
}
// ---------- 루틴 표시/숨김 ----------
function getRoutineVisibility() {
  try {
    const v = JSON.parse(localStorage.getItem("routine-visibility") || "{}");
    const out = {};
    ROUTINES.forEach(r => { out[r.id] = v[r.id] !== false; });
    return out;
  } catch {
    const out = {};
    ROUTINES.forEach(r => { out[r.id] = true; });
    return out;
  }
}
function visibleRoutines() {
  const vis = getRoutineVisibility();
  return ROUTINES.filter(r => vis[r.id] !== false);
}
function renderRoutineToggles() {
  const vis = getRoutineVisibility();
  const wrap = document.getElementById("routineToggles");
  wrap.innerHTML = "";
  ROUTINES.forEach(r => {
    const row = document.createElement("div");
    row.className = "tab-toggle-row";
    row.innerHTML = `<span>${r.emoji} ${r.name}</span>
      <label class="toggle">
        <input type="checkbox" data-routine="${r.id}" ${vis[r.id] ? "checked" : ""}>
        <span class="slider"></span>
      </label>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.onchange = () => {
      const vis = getRoutineVisibility();
      vis[cb.dataset.routine] = cb.checked;
      try { localStorage.setItem("routine-visibility", JSON.stringify(vis)); } catch {}
      renderAll();
    };
  });
}
function initSettings() {
  applyTabVisibility();
  document.getElementById("settingsBtn").onclick = () => {
    renderTabToggles();
    renderRoutineToggles();
    document.getElementById("settingsModal").classList.remove("hidden");
  };
  document.getElementById("settingsClose").onclick = () => {
    document.getElementById("settingsModal").classList.add("hidden");
  };
  // 바깥 영역 탭하면 닫기
  document.getElementById("settingsModal").addEventListener("click", e => {
    if (e.target.id === "settingsModal") {
      e.target.classList.add("hidden");
    }
  });
  document.getElementById("settingsModal").onclick = (e) => {
    if (e.target.id === "settingsModal") e.target.classList.add("hidden");
  };
}

// ---------- 오늘의 문답 (소요리+하이델베르크, 날짜별 랜덤) ----------
function seededPick(seedStr, len) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  h |= 0; h = (h + 0x6D2B79F5) | 0;
  let t = Math.imul(h ^ (h >>> 15), 1 | h);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return Math.floor(r * len);
}
function todayCatechism() {
  const hasShorter = typeof CATECHISM !== "undefined" && CATECHISM.length;
  const hasHeidel = typeof HEIDELBERG !== "undefined" && HEIDELBERG.length;
  if (!hasShorter && !hasHeidel) return null;
  // 소요리 vs 하이델베르크 선택 (날짜별 랜덤)
  let useHeidel = false;
  if (hasShorter && hasHeidel) {
    useHeidel = seededPick("which:" + today, 2) === 1;
  } else {
    useHeidel = !!hasHeidel;
  }
  if (useHeidel) {
    const c = HEIDELBERG[seededPick("heidel:" + today, HEIDELBERG.length)];
    return { ...c, cat: "heidelberg", catName: "하이델베르크 요리문답" };
  }
  const c = CATECHISM[seededPick("cat:" + today, CATECHISM.length)];
  return { ...c, cat: "shorter", catName: "웨스트민스터 소요리문답" };
}
function renderCatechism() {
  const el = document.getElementById("catCard");
  if (!el) return;
  const c = todayCatechism();
  if (!c) { el.style.display = "none"; return; }
  el.innerHTML = `
    <div class="flash-inner" id="flashInner" onclick="this.classList.toggle('flipped')">
      <div class="flash-face flash-front">
        <div class="flash-kicker">${c.catName} 제${c.n}문 · 눌러서 답 보기</div>
        <div class="flash-q">${c.q}</div>
      </div>
      <div class="flash-face flash-back">
        <div class="flash-kicker">${c.catName} 제${c.n}문 · 답</div>
        <div class="flash-a">${c.a}</div>
      </div>
    </div>`;
  renderCatDone();
  renderCatGuides(c);
}
const GUIDE_NAMES = {
  watson: "토마스 왓슨",
  flavel: "존 플라벨",
  williamson: "G. I. 윌리엄슨",
  ursinus: "자카리아스 우르시누스",
  deyoung: "케빈 드영",
  kim: "김헌수"
};
const GUIDE_KEYS = {
  shorter: ["watson", "flavel", "williamson"],
  heidelberg: ["ursinus", "deyoung", "kim"]
};
function renderCatGuides(c) {
  const wrap = document.getElementById("catGuides");
  if (!wrap) return;
  const guides = c.cat === "heidelberg"
    ? (typeof HEIDELBERG_GUIDES !== "undefined" ? HEIDELBERG_GUIDES[c.n] : null)
    : (typeof CATECHISM_GUIDES !== "undefined" ? CATECHISM_GUIDES[c.n] : null);
  if (!guides) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = GUIDE_KEYS[c.cat].map(k => `
    <div class="guide">
      <div class="guide-name">${GUIDE_NAMES[k]}의 해설</div>
      <div class="guide-text">${guides[k]}</div>
    </div>`).join("");
}
function isCatDone() {
  return !!(store[today] && store[today]["catechism"]);
}
function renderCatDone() {
  const btn = document.getElementById("catDoneBtn");
  if (!btn) return;
  const done = isCatDone();
  btn.textContent = done ? "오늘 문답 완료 ✓" : "오늘 문답 완료하기";
  btn.classList.toggle("done", done);
}
function completeCatRoutine() {
  completeRoutineFromTab("catechism");
  renderCatDone();
  goToNextTab("catechism");
}

// ---------- 오늘의 결심 (에드워즈 70가지 결심문, 날짜별 랜덤) ----------
function todayResolution() {
  if (typeof RESOLUTIONS === "undefined" || !RESOLUTIONS.length) return null;
  const seedStr = today; // "2026-10-16"
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  h |= 0; h = (h + 0x6D2B79F5) | 0;
  let t = Math.imul(h ^ (h >>> 15), 1 | h);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return RESOLUTIONS[Math.floor(r * RESOLUTIONS.length)];
}
function renderResolution() {
  const el = document.getElementById("todayResolution");
  if (!el) return;
  const res = todayResolution();
  if (!res) { el.style.display = "none"; return; }
  el.innerHTML = `
    <div class="res-kicker">오늘의 결심 : 조나단 에드워즈의 결심 ${res.n}문</div>
    <div class="res-text">"${res.t}"</div>`;
}

// ---------- QT 메시지 아카이브 ----------
function getQtMessages() {
  try {
    return JSON.parse(localStorage.getItem("qt-messages") || "{}");
  } catch { return {}; }
}
function saveQtMessage() {
  const ta = document.getElementById("qtMessage");
  const text = ta.value.trim();
  if (!text) return;
  const msgs = getQtMessages();
  msgs[today] = text;
  try { localStorage.setItem("qt-messages", JSON.stringify(msgs)); } catch {}
  ta.value = "";
  renderQtArchive();
}
function renderQtArchive() {
  const wrap = document.getElementById("qtArchive");
  if (!wrap) return;
  const msgs = getQtMessages();
  // 오늘 작성 중인 내용은 유지
  const ta = document.getElementById("qtMessage");
  if (ta && msgs[today] && !ta.value) ta.value = msgs[today];
  const keys = Object.keys(msgs).sort().reverse();
  if (!keys.length) {
    wrap.innerHTML = '<p class="qt-note">아직 저장된 메시지가 없어요.</p>';
    return;
  }
  wrap.innerHTML = keys.slice(0, 30).map(k => `
    <div class="archive-item">
      <div class="archive-date">${k}</div>
      <div class="archive-text">${msgs[k].replace(/</g, "&lt;")}</div>
    </div>`).join("");
}

// ---------- 탭에서 루틴 완료 처리 ----------
function completeRoutineFromTab(routineId) {
  if (!store[today]) store[today] = {};
  if (store[today][routineId]) return;
  store[today][routineId] = true;
  cache(); renderAll();
  saveRow(routineId, true);
}
function completeQtRoutine() { completeRoutineFromTab("meditation"); goToNextTab("qt"); }
function completeGospelRoutine() { completeRoutineFromTab("gospel"); goToNextTab("gospel"); }
function completeEnglishRoutine() { completeRoutineFromTab("english"); renderEnglishDone(); goToNextTab("english"); }

// ---------- URL 파라미터로 달리기 기록 자동 입력 (iOS 단축어용) ----------
// 예: ?run_km=5.2&run_min=32
function handleRunParams() {
  let q;
  try { q = new URLSearchParams(location.search); } catch { return; }
  const km = parseFloat(q.get("run_km"));
  const min = parseFloat(q.get("run_min"));
  if (!(km > 0) && !(min > 0)) return;
  history.replaceState(null, "", location.pathname); // 새로고침 중복 저장 방지
  if (store[today]["run"]) return; // 이미 기록됨
  store[today]["run"] = true;
  const extra = {};
  if (km > 0) {
    store[today]["run_km"] = Math.round(km * 100) / 100;
    extra.km = store[today]["run_km"];
  }
  if (min > 0) {
    store[today]["run_minutes"] = Math.round(min);
    extra.run_minutes = store[today]["run_minutes"];
  }
  cache(); renderAll();
  saveRow("run", true, extra);
}

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user || null;
  loadLocal();
  updateAuthUI();
  renderAll();
  if (user) {
    await syncFromCloud();
    loadBibleProgress();
  }
  handleRunParams();
  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user || null;
    const changed = (!u !== !user) || (u && user && u.id !== user.id);
    user = u;
    if (changed) {
      if (!signupJustCompleted) document.getElementById("authModal").classList.add("hidden");
      authError("");
      loadLocal();
      updateAuthUI();
      renderAll();
      if (user) { syncFromCloud(); loadBibleProgress(); }
      else { bibleProg = { plan_day: 1, passage_idx: 0 }; bibleViewDay = 1; }
    }
  });
}
function showSignupView() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("signupView").classList.remove("hidden");
  authError("");
}
function showLoginView() {
  document.getElementById("signupView").classList.add("hidden");
  document.getElementById("loginView").classList.remove("hidden");
  const se = document.getElementById("suErr");
  if (se) se.textContent = "";
}
function suError(msg) {
  const el = document.getElementById("suErr");
  el.textContent = msg;
  el.style.color = "#c0392b";
}
function suSuccess(msg) {
  const el = document.getElementById("suErr");
  el.textContent = msg;
  el.style.color = "#4a7c59";
}
document.getElementById("loginBtn").onclick = () => {
  authError("");
  showLoginView();
  document.getElementById("authModal").classList.remove("hidden");
};
document.getElementById("authClose").onclick = () => {
  document.getElementById("authModal").classList.add("hidden");
};
document.getElementById("authModal").onclick = (e) => {
  if (e.target.id === "authModal") e.target.classList.add("hidden");
};
document.getElementById("authLogin").onclick = async () => {
  authError("");
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPw").value;
  if (!email || !password) { authError("이메일과 비밀번호를 입력해주세요."); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) authError("로그인 실패: " + error.message);
};
document.getElementById("authSignupGo").onclick = showSignupView;
document.getElementById("signupBack").onclick = showLoginView;
document.getElementById("authSignupDo").onclick = async () => {
  suError("");
  const email = document.getElementById("suId").value.trim();
  const password = document.getElementById("suPw").value;
  const password2 = document.getElementById("suPw2").value;
  const name = document.getElementById("suName").value.trim();
  const phone = document.getElementById("suPhone").value.trim().replace(/ /g, "");
  if (!email) { suError("아이디(메일 주소)를 입력해주세요."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { suError("아이디는 메일 주소 형식으로 적어주세요. (예: xxx@naver.com)"); return; }
  if (!password) { suError("비밀번호를 입력해주세요."); return; }
  if (password.length < 6) { suError("비밀번호는 6자 이상이어야 해요."); return; }
  if (password !== password2) { suError("비밀번호가 일치하지 않아요. 다시 확인해주세요."); return; }
  if (!name) { suError("이름을 입력해주세요."); return; }
  if (!phone) { suError("연락처를 입력해주세요."); return; }
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phone)) { suError("연락처 형식을 확인해주세요. (예: 010-1234-5678)"); return; }
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name, phone } }
  });
  if (error) { suError("가입 실패: " + error.message); return; }
  if (data.session) {
    // 이메일 확인이 꺼져 있으면 바로 로그인됨
    signupJustCompleted = true;
    suSuccess("회원 가입이 완료 되었습니다.");
    setTimeout(() => {
      document.getElementById("authModal").classList.add("hidden");
      showLoginView();
      signupJustCompleted = false;
    }, 1800);
  } else {
    suSuccess("회원 가입이 완료 되었습니다. 이메일로 온 확인 링크를 눌러주세요.");
  }
};
document.getElementById("logoutBtn").onclick = async () => {
  await sb.auth.signOut();
};
initAuth();
initSettings();
renderResolution();

// ---------- PWA: 서비스 워커 등록 + 자동 업데이트 ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "activated" && navigator.serviceWorker.controller) {
            window.location.reload(); // 새 버전으로 자동 새로고침
          }
        });
      });
    }).catch((e) => console.warn("SW 등록 실패:", e));
  });
}

// ---------- 홈 화면에 추가 버튼 ----------
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove("hidden");
});

if (!isStandalone) installBtn.classList.remove("hidden");

installBtn.onclick = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  } else {
    // iOS 등: 직접 설치 안내
    document.getElementById("installGuide").classList.remove("hidden");
  }
};
document.getElementById("guideClose").onclick = () => {
  document.getElementById("installGuide").classList.add("hidden");
};
document.getElementById("installGuide").onclick = (e) => {
  if (e.target.id === "installGuide") e.target.classList.add("hidden");
};
