// 루틴앱 — 매일 루틴 기록
const ROUTINES = [
  { id: "prayer", name: "새벽기도", emoji: "🙏", sub: "하루를 기도로 시작" },
  { id: "bible",  name: "성경 읽기", emoji: "📖", sub: "말씀 한 장이라도" },
  { id: "run",    name: "달리기",   emoji: "🏃", sub: "몸도 함께 단련" },
];

const KEY = "routine-app-v1";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

// YYYY-MM-DD (로컬 기준)
function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dayKey(dt);
}

let store = load();
const today = dayKey();
if (!store[today]) store[today] = {};

function toggle(id) {
  store[today][id] = !store[today][id];
  save(store);
  render();
}

function doneCount(key) {
  return ROUTINES.filter(r => store[key] && store[key][r.id]).length;
}

function streak(id) {
  let n = 0, k = today;
  // 오늘 안 했으면 어제부터 계산
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

  // 이번 주 (월~일)
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

  // 연속 기록
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
