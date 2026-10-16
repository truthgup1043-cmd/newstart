// 루틴앱 — Supabase 연동 버전
const SUPABASE_URL = "https://ztehhjsrffmawwtshddb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0ZWhoanNyZmZtYXd3dHNoZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjg0NzYsImV4cCI6MjEwNzcwNDQ3Nn0.n_uIm2kqjgxaA4BpsQ_FFE_4EIMXzqLd41wqXtX4P-s";

const ROUTINES = [
  { id: "prayer", name: "새벽기도", emoji: "🙏", sub: "하루를 기도로 시작" },
  { id: "bible",  name: "성경 읽기", emoji: "📖", sub: "말씀 한 장이라도" },
  { id: "run",    name: "달리기",   emoji: "🏃", sub: "몸도 함께 단련" },
];

const CACHE_KEY = "routine-app-v1";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// YYYY-MM-DD (로컬 기준)
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

function cache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch {}
}

// 클라우드에서 전체 기록 불러오기
async function syncFromCloud() {
  const { data, error } = await sb.from("completions").select("day, routine, done");
  if (error) { console.warn("클라우드 동기화 실패, 로컬 캐시 사용:", error.message); return; }
  store = {};
  data.forEach(r => {
    if (!store[r.day]) store[r.day] = {};
    store[r.day][r.routine] = r.done;
  });
  if (!store[today]) store[today] = {};
  cache();
  render();
}

async function toggle(id) {
  const next = !(store[today] && store[today][id]);
  store[today][id] = next;
  cache();
  render();
  // 클라우드에 저장 (upsert)
  const { error } = await sb.from("completions").upsert(
    { day: today, routine: id, done: next },
    { onConflict: "day,routine" }
  );
  if (error) console.warn("클라우드 저장 실패:", error.message);
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

function render() {
  const done = doneCount(today);
  document.getElementById("doneCount").textContent = done;
  document.getElementById("progressFill").style.width = (done / ROUTINES.length * 100) + "%";

  const list = document.getElementById("routineList");
  list.innerHTML = "";
  ROUTINES.forEach(r => {
    const isDone = !!(store[today] && store[today][r.id]);
    const el = document.createElement("div");
    el.className = "routine" + (isDone ? " done" : "");
    el.innerHTML = `
      <div class="emoji">${r.emoji}</div>
      <div class="info"><div class="name">${r.name}</div><div class="sub">${r.sub}</div></div>
      <div class="check">✓</div>`;
    el.onclick = () => toggle(r.id);
    list.appendChild(el);
  });

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
        `<span class="dot${store[k] && store[k][r.id] ? " on" : ""}"></span>`).join("")}</div>`;
    week.appendChild(el);
  }

  const sv = document.getElementById("streakView");
  sv.innerHTML = "";
  ROUTINES.forEach(r => {
    const el = document.createElement("div");
    el.className = "streak";
    el.innerHTML = `<span>${r.emoji} ${r.name}</span><b>${streak(r.id)}일 연속</b>`;
    sv.appendChild(el);
  });
}

document.getElementById("todayLabel").textContent =
  new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

render();
syncFromCloud();
