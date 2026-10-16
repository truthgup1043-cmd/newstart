// 루틴앱 — Supabase 연동 버전 (기도 시간 기록 + 통계 그래프)
const SUPABASE_URL = "https://ztehhjsrffmawwtshddb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0ZWhoanNyZmZtYXd3dHNoZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjg0NzYsImV4cCI6MjEwNzcwNDQ3Nn0.n_uIm2kqjgxaA4BpsQ_FFE_4EIMXzqLd41wqXtX4P-s";

const ROUTINES = [
  { id: "prayer",     name: "새벽기도", emoji: "🙏", sub: "하루를 기도로 시작", color: "#4a7c59", hasMinutes: true },
  { id: "bible",      name: "성경 읽기", emoji: "📖", sub: "말씀 한 장이라도",   color: "#4a6fa5" },
  { id: "meditation", name: "성경묵상", emoji: "💭", sub: "말씀을 마음에 새기기", color: "#8a6fbf" },
  { id: "run",        name: "달리기",   emoji: "🏃", sub: "몸도 함께 단련",       color: "#d98e4a" },
];
const PRAYER_PRESETS = [10, 20, 30, 60];

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

let prayerOpen = false;   // 기도 시간 선택기 펼침 여부
let pickedMinutes = 30;

function cache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch {}
}

async function syncFromCloud() {
  const { data, error } = await sb.from("completions").select("day, routine, done, minutes");
  if (error) { console.warn("클라우드 동기화 실패, 로컬 캐시 사용:", error.message); renderAll(); return; }
  store = {};
  data.forEach(r => {
    if (!store[r.day]) store[r.day] = {};
    store[r.day][r.routine] = r.done;
    if (r.routine === "prayer" && r.minutes != null) store[r.day].prayer_minutes = r.minutes;
  });
  if (!store[today]) store[today] = {};
  cache();
  renderAll();
}

async function saveRow(routineId, done, minutes = null) {
  const { error } = await sb.from("completions").upsert(
    { day: today, routine: routineId, done, minutes },
    { onConflict: "day,routine" }
  );
  if (error) console.warn("클라우드 저장 실패:", error.message);
}

async function toggle(id) {
  const r = ROUTINES.find(x => x.id === id);
  if (r.hasMinutes) {
    if (store[today][id]) {
      // 완료 취소
      store[today][id] = false;
      delete store[today].prayer_minutes;
      prayerOpen = false;
      cache(); renderAll();
      await saveRow(id, false, null);
    } else {
      // 시간 선택기 펼치기
      prayerOpen = !prayerOpen;
      renderRoutines();
    }
    return;
  }
  store[today][id] = !store[today][id];
  cache(); renderAll();
  await saveRow(id, !!store[today][id]);
}

async function confirmPrayer() {
  const input = document.getElementById("customMinutes");
  let m = pickedMinutes;
  if (input && input.value) m = Math.max(1, parseInt(input.value, 10) || pickedMinutes);
  store[today].prayer = true;
  store[today].prayer_minutes = m;
  prayerOpen = false;
  cache(); renderAll();
  await saveRow("prayer", true, m);
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
    if (r.id === "prayer" && isDone && store[today].prayer_minutes) {
      sub = `오늘 ${store[today].prayer_minutes}분 기도`;
    }

    let picker = "";
    if (r.hasMinutes && prayerOpen && !isDone) {
      picker = `
        <div class="picker" onclick="event.stopPropagation()">
          <div class="picker-label">기도한 시간</div>
          <div class="chips">
            ${PRAYER_PRESETS.map(m =>
              `<button class="chip${m === pickedMinutes ? " sel" : ""}" data-m="${m}">${m}분</button>`).join("")}
            <input id="customMinutes" class="custom" type="number" min="1" placeholder="직접 입력(분)">
          </div>
          <div class="picker-actions">
            <button class="btn primary" id="prayerSave">저장</button>
            <button class="btn" id="prayerCancel">취소</button>
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
          pickedMinutes = Number(c.dataset.m);
          document.getElementById("customMinutes").value = "";
          el.querySelectorAll(".chip").forEach(x => x.classList.remove("sel"));
          c.classList.add("sel");
        };
      });
      el.querySelector("#prayerSave").onclick = e => { e.stopPropagation(); confirmPrayer(); };
      el.querySelector("#prayerCancel").onclick = e => { e.stopPropagation(); prayerOpen = false; renderRoutines(); };
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

let trendChart = null, prayerChart = null;

function last30() {
  const keys = [];
  for (let i = 29; i >= 0; i--) keys.push(addDays(today, -i));
  return keys;
}

function renderStats() {
  const keys = last30();
  const labels = keys.map(k => k.slice(5).replace("-", "/"));

  // 요약
  const sv = document.getElementById("summaryView");
  sv.innerHTML = "";
  ROUTINES.forEach(r => {
    const n = keys.filter(k => store[k] && store[k][r.id]).length;
    const pct = Math.round(n / 30 * 100);
    let extra = "";
    if (r.id === "prayer") {
      const mins = keys.map(k => (store[k] && store[k].prayer_minutes) || 0).filter(v => v > 0);
      const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0;
      extra = ` · 평균 ${avg}분`;
    }
    const el = document.createElement("div");
    el.className = "streak";
    el.innerHTML = `<span>${r.emoji} ${r.name}</span><b>${pct}% (${n}/30일)${extra}</b>`;
    sv.appendChild(el);
  });

  // 달성 추이 (스택 바)
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

  // 기도 시간 추이
  if (prayerChart) prayerChart.destroy();
  prayerChart = new Chart(document.getElementById("prayerChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "기도 시간(분)",
        data: keys.map(k => (store[k] && store[k].prayer_minutes) || 0),
        backgroundColor: "#4a7c59",
        borderRadius: 3,
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
