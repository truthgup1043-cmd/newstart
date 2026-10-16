// 루틴앱 — Supabase 연동 버전 (기도 시간·성경 장수·러닝 기록 + 통계 그래프)
const SUPABASE_URL = "https://ztehhjsrffmawwtshddb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0ZWhoanNyZmZtYXd3dHNoZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjg0NzYsImV4cCI6MjEwNzcwNDQ3Nn0.n_uIm2kqjgxaA4BpsQ_FFE_4EIMXzqLd41wqXtX4P-s";

const ROUTINES = [
  { id: "meditation", name: "QT", emoji: "💭", sub: "말씀 묵상", color: "#8a6fbf" },
  { id: "prayer", name: "기도", emoji: "🙏", sub: "하루를 기도로 시작", color: "#4a7c59",
    value: {
      fields: [
        { key: "prayer_minutes", dbCol: "minutes", label: "기도한 시간", unit: "분", presets: [10, 20, 30, 60], def: 30 },
      ],
      doneText: s => s.prayer_minutes != null ? `오늘 ${s.prayer_minutes}분 기도` : "완료",
    } },
  { id: "bible", name: "성경 읽기", emoji: "📖", sub: "말씀 한 장이라도", color: "#4a6fa5" },
  { id: "gospel", name: "복음 읽기", emoji: "✝️", sub: "오늘의 복음 연구", color: "#b7791f" },
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
  { id: "english", name: "영어 공부", emoji: "🔤", sub: "오늘의 영어", color: "#2a9d8f" },
  { id: "praise", name: "찬양", emoji: "🎵", sub: "마음으로 찬양", color: "#c05a7a" },
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
  return ROUTINES.filter(r => store[key] && store[key][r.id]).length;
}
function streak(id) {
  let n = 0, k = today;
  if (!(store[k] && store[k][id])) k = addDays(k, -1);
  while (store[k] && store[k][id]) { n++; k = addDays(k, -1); }
  return n;
}

// ---------- 렌더 ----------
function renderRoutines() {
  const done = doneCount(today);
  document.getElementById("doneCount").textContent = done;
  document.getElementById("progressFill").style.width = (done / ROUTINES.length * 100) + "%";

  const list = document.getElementById("routineList");
  list.innerHTML = "";
  ROUTINES.forEach(r => {
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
      <div class="dots">${ROUTINES.map(r =>
        `<span class="dot${store[k] && store[k][r.id] ? " on" : ""}" style="${store[k] && store[k][r.id] ? "background:" + r.color : ""}"></span>`).join("")}</div>`;
    week.appendChild(el);
  }
}

function renderStreaks() {
  const sv = document.getElementById("streakView");
  sv.innerHTML = "";
  ROUTINES.forEach(r => {
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
  ROUTINES.forEach(r => {
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

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart"), {
    type: "bar",
    data: {
      labels,
      datasets: ROUTINES.map(r => ({
        label: r.name,
        data: keys.map(k => (store[k] && store[k][r.id]) ? 1 : 0),
        backgroundColor: r.color,
      })),
    },
    options: {
      ...baseOpts,
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true, max: 6, ticks: { stepSize: 1, font: { size: 10 } } },
      },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });

  const singleBar = (id, label, color, key, stepSize) => {
    const ch = { trendChart, prayerChart, bibleChart, runChart, sleepChart }[id];
    if (ch) ch.destroy();
    return new Chart(document.getElementById(id), {
      type: "bar",
      data: {
        labels,
        datasets: [{ label, data: keys.map(k => (store[k] && store[k][key]) || 0), backgroundColor: color, borderRadius: 3 }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: baseOpts.scales.x,
          y: { beginAtZero: true, ticks: { stepSize, font: { size: 10 } } },
        },
        plugins: { legend: { display: false } },
      },
    });
  };

  prayerChart = singleBar("prayerChart", "기도 시간(분)", "#4a7c59", "prayer_minutes");
  bibleChart = singleBar("bibleChart", "읽은 장수", "#4a6fa5", "bible_chapters", 1);
  runChart = singleBar("runChart", "러닝 거리(km)", "#d98e4a", "run_km");
  sleepChart = singleBar("sleepChart", "수면 시간(시간)", "#5568b0", "sleep_hours");
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
document.querySelectorAll(".tab").forEach(t => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("panel-" + t.dataset.tab).classList.remove("hidden");
    if (t.dataset.tab === "bible") renderBible();
    if (t.dataset.tab === "english") renderEnglish();
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
    </div>`).join("");

  document.getElementById("gospelSummary").innerHTML = sumHtml;
  document.getElementById("gospelList").innerHTML = listHtml;
}
renderGospel();

// ---------- 추천 찬양 ----------
function renderPraise() {
  document.getElementById("praiseUpdated").textContent = `업데이트: ${PRAISE_UPDATED} · 매일 갱신`;
  document.getElementById("praisePicks").innerHTML = PRAISE_PICKS.map((p, i) => `
    <a class="link-card" href="${p.url}" target="_blank" rel="noopener" data-praise-idx="${i}">
      <div class="emoji">🎵</div>
      <div class="info">
        <div class="name">${p.title}</div>
        <div class="sub">${p.artist}</div>
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
  if (loggedIn) document.getElementById("userEmail").textContent = user.email;
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
  { id: "english", name: "영어" },
  { id: "praise", name: "찬양" },
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
function initSettings() {
  applyTabVisibility();
  document.getElementById("settingsBtn").onclick = () => {
    renderTabToggles();
    document.getElementById("settingsModal").classList.remove("hidden");
  };
  document.getElementById("settingsClose").onclick = () => {
    document.getElementById("settingsModal").classList.add("hidden");
  };
  document.getElementById("settingsModal").onclick = (e) => {
    if (e.target.id === "settingsModal") e.target.classList.add("hidden");
  };
}

// ---------- 탭에서 루틴 완료 처리 ----------
function completeRoutineFromTab(routineId) {
  if (!store[today]) store[today] = {};
  if (store[today][routineId]) return;
  store[today][routineId] = true;
  cache(); renderAll();
  saveRow(routineId, true);
}
function completeQtRoutine() { completeRoutineFromTab("meditation"); }
function completeGospelRoutine() { completeRoutineFromTab("gospel"); }
function completeEnglishRoutine() { completeRoutineFromTab("english"); renderEnglishDone(); }

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
document.getElementById("loginBtn").onclick = () => {
  authError("");
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
document.getElementById("authSignup").onclick = async () => {
  authError("");
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPw").value;
  if (!email || !password) { authError("이메일과 비밀번호를 입력해주세요."); return; }
  if (password.length < 6) { authError("비밀번호는 6자 이상이어야 해요."); return; }
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) { authError("가입 실패: " + error.message); return; }
  if (data.session) {
    // 이메일 확인이 꺼져 있으면 바로 로그인됨
    signupJustCompleted = true;
    authSuccess("회원 가입이 완료 되었습니다.");
    setTimeout(() => {
      document.getElementById("authModal").classList.add("hidden");
      signupJustCompleted = false;
    }, 1800);
  } else {
    authSuccess("회원 가입이 완료 되었습니다. 이메일로 온 확인 링크를 눌러주세요.");
  }
};
document.getElementById("logoutBtn").onclick = async () => {
  await sb.auth.signOut();
};
initAuth();
initSettings();

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
