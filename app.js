// 루틴앱 — Supabase 연동 버전 (기도 시간·성경 장수 기록 + 통계 그래프)
const SUPABASE_URL = "https://ztehhjsrffmawwtshddb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0ZWhoanNyZmZtYXd3dHNoZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjg0NzYsImV4cCI6MjEwNzcwNDQ3Nn0.n_uIm2kqjgxaA4BpsQ_FFE_4EIMXzqLd41wqXtX4P-s";

const ROUTINES = [
  { id: "prayer", name: "새벽기도", emoji: "🙏", sub: "하루를 기도로 시작", color: "#4a7c59",
    value: { key: "prayer_minutes", dbCol: "minutes", unit: "분", presets: [10, 20, 30, 60], def: 30, doneText: v => `오늘 ${v}분 기도` } },
  { id: "bible", name: "성경 읽기", emoji: "📖", sub: "말씀 한 장이라도", color: "#4a6fa5",
    value: { key: "bible_chapters", dbCol: "chapters", unit: "장", presets: [1, 2, 3, 5, 10], def: 3, doneText: v => `오늘 ${v}장 읽음` } },
  { id: "meditation", name: "성경묵상", emoji: "💭", sub: "말씀을 마음에 새기기", color: "#8a6fbf" },
  { id: "run", name: "달리기", emoji: "🏃", sub: "몸도 함께 단련", color: "#d98e4a" },
];

const CACHE_KEY = "routine-app-v1";
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
try { store = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch {}
const today = dayKey();
if (!store[today]) store[today] = {};

let pickerFor = null;   // 수량 선택기 펼친 루틴 id
let pickedValue = null;

function cache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch {}
}

async function syncFromCloud() {
  const { data, error } = await sb.from("completions").select("day, routine, done, minutes, chapters");
  if (error) { console.warn("클라우드 동기화 실패, 로컬 캐시 사용:", error.message); renderAll(); return; }
  store = {};
  data.forEach(r => {
    if (!store[r.day]) store[r.day] = {};
    store[r.day][r.routine] = r.done;
    if (r.routine === "prayer" && r.minutes != null) store[r.day].prayer_minutes = r.minutes;
    if (r.routine === "bible" && r.chapters != null) store[r.day].bible_chapters = r.chapters;
  });
  if (!store[today]) store[today] = {};
  cache();
  renderAll();
}

async function saveRow(routineId, done, extra = {}) {
  const { error } = await sb.from("completions").upsert(
    { day: today, routine: routineId, done, minutes: null, chapters: null, ...extra },
    { onConflict: "day,routine" }
  );
  if (error) console.warn("클라우드 저장 실패:", error.message);
}

async function toggle(id) {
  const r = ROUTINES.find(x => x.id === id);
  if (r.value) {
    if (store[today][id]) {
      store[today][id] = false;
      delete store[today][r.value.key];
      pickerFor = null;
      cache(); renderAll();
      await saveRow(id, false);
    } else {
      pickerFor = (pickerFor === id) ? null : id;
      pickedValue = r.value.def;
      renderRoutines();
    }
    return;
  }
  store[today][id] = !store[today][id];
  cache(); renderAll();
  await saveRow(id, !!store[today][id]);
}

async function confirmPicker() {
  const r = ROUTINES.find(x => x.id === pickerFor);
  if (!r || !r.value) return;
  const input = document.getElementById("customValue");
  let v = pickedValue;
  if (input && input.value) v = Math.max(1, parseInt(input.value, 10) || pickedValue);
  store[today][r.id] = true;
  store[today][r.value.key] = v;
  pickerFor = null;
  cache(); renderAll();
  await saveRow(r.id, true, { [r.value.dbCol]: v });
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
    el.className = "routine" + (isDone ? " done" : "");

    let sub = r.sub;
    if (r.value && isDone && store[today][r.value.key] != null) {
      sub = r.value.doneText(store[today][r.value.key]);
    }

    let picker = "";
    if (r.value && pickerFor === r.id && !isDone) {
      const v = r.value;
      picker = `
        <div class="picker" onclick="event.stopPropagation()">
          <div class="picker-label">${r.id === "prayer" ? "기도한 시간" : "읽은 장수"}</div>
          <div class="chips">
            ${v.presets.map(p =>
              `<button class="chip${p === pickedValue ? " sel" : ""}" data-v="${p}">${p}${v.unit}</button>`).join("")}
            <input id="customValue" class="custom" type="number" min="1" placeholder="직접 입력(${v.unit})">
          </div>
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
          pickedValue = Number(c.dataset.v);
          document.getElementById("customValue").value = "";
          el.querySelectorAll(".chip").forEach(x => x.classList.remove("sel"));
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

let trendChart = null, prayerChart = null, bibleChart = null;

function last30() {
  const keys = [];
  for (let i = 29; i >= 0; i--) keys.push(addDays(today, -i));
  return keys;
}

function avgOf(keys, key) {
  const vals = keys.map(k => (store[k] && store[k][key]) || 0).filter(v => v > 0);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
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
    if (r.id === "prayer") extra = ` · 평균 ${avgOf(keys, "prayer_minutes")}분`;
    if (r.id === "bible") extra = ` · 평균 ${avgOf(keys, "bible_chapters")}장`;
    const el = document.createElement("div");
    el.className = "streak";
    el.innerHTML = `<span>${r.emoji} ${r.name}</span><b>${pct}% (${n}/30일)${extra}</b>`;
    sv.appendChild(el);
  });

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
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true, max: 4, ticks: { stepSize: 1, font: { size: 10 } } },
      },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });

  if (prayerChart) prayerChart.destroy();
  prayerChart = new Chart(document.getElementById("prayerChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "기도 시간(분)",
        data: keys.map(k => (store[k] && store[k].prayer_minutes) || 0),
        backgroundColor: "#4a7c59", borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    },
  });

  if (bibleChart) bibleChart.destroy();
  bibleChart = new Chart(document.getElementById("bibleChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "읽은 장수",
        data: keys.map(k => (store[k] && store[k].bible_chapters) || 0),
        backgroundColor: "#4a6fa5", borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderAll() {
  renderRoutines();
  renderWeek();
  renderStreaks();
  if (window.Chart) renderStats();
}

document.getElementById("todayLabel").textContent =
  new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

renderAll();
syncFromCloud();
