/* 하영시 앱 — 포모도로 타이머 (25분 집중 / 5분 휴식 / 4세트마다 15분) */

const POMO_WORK = 25 * 60;
const POMO_BREAK = 5 * 60;
const POMO_LONG_BREAK = 15 * 60;

let pomo = {
  mode: "work",       // work | break | longbreak
  remaining: POMO_WORK,
  cycle: 0,           // 완료한 집중 세트 수
  running: false,
  timerId: null,
  endTs: 0,
};

function pomoModeLabel() {
  return pomo.mode === "work" ? "집중 시간" : pomo.mode === "break" ? "짧은 휴식" : "긴 휴식";
}
function pomoModeTotal() {
  return pomo.mode === "work" ? POMO_WORK : pomo.mode === "break" ? POMO_BREAK : POMO_LONG_BREAK;
}
function openPomodoro() {
  document.getElementById("pomodoroModal").classList.remove("hidden");
  renderPomodoro();
}
function closePomodoro() {
  document.getElementById("pomodoroModal").classList.add("hidden");
}
function renderPomodoro() {
  const m = Math.floor(pomo.remaining / 60);
  const s = pomo.remaining % 60;
  document.getElementById("pomoClock").textContent =
    `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  document.getElementById("pomoMode").textContent = pomoModeLabel();
  document.getElementById("pomoStartBtn").textContent = pomo.running ? "⏸ 일시정지" : "▶ 시작";
  // 진행 링
  const ring = document.getElementById("pomoRingFg");
  const total = pomoModeTotal();
  const frac = total ? pomo.remaining / total : 0;
  const C = 2 * Math.PI * 88;
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - frac);
  ring.style.stroke = pomo.mode === "work" ? "#e05a3a" : "#4a9d5e";
  // 세트 표시
  const dots = document.getElementById("pomoDots");
  const doneInCycle = pomo.cycle % 4;
  dots.innerHTML = [0, 1, 2, 3].map(i =>
    `<span class="pomo-dot${i < doneInCycle ? " done" : ""}"></span>`).join("")
    + `<span class="pomo-cycle">${pomo.cycle}세트</span>`;
}
function pomoTick() {
  pomo.remaining = Math.max(0, Math.round((pomo.endTs - Date.now()) / 1000));
  if (pomo.remaining <= 0) {
    pomoComplete();
    return;
  }
  renderPomodoro();
}
function togglePomodoro() {
  if (pomo.running) {
    clearInterval(pomo.timerId);
    pomo.running = false;
  } else {
    pomo.endTs = Date.now() + pomo.remaining * 1000;
    pomo.timerId = setInterval(pomoTick, 500);
    pomo.running = true;
  }
  renderPomodoro();
}
function pomoComplete() {
  clearInterval(pomo.timerId);
  pomo.running = false;
  try {
    // 완료 알림음 (간단한 비프)
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch {}
  if (pomo.mode === "work") {
    pomo.cycle++;
    pomo.mode = (pomo.cycle % 4 === 0) ? "longbreak" : "break";
    pomo.remaining = pomo.mode === "longbreak" ? POMO_LONG_BREAK : POMO_BREAK;
  } else {
    pomo.mode = "work";
    pomo.remaining = POMO_WORK;
  }
  renderPomodoro();
}
function skipPomodoro() {
  clearInterval(pomo.timerId);
  pomo.running = false;
  pomoComplete();
}
function resetPomodoro() {
  clearInterval(pomo.timerId);
  pomo = { mode: "work", remaining: POMO_WORK, cycle: 0, running: false, timerId: null, endTs: 0 };
  renderPomodoro();
}

// 설정 모달과 같은 방식으로 바깥 클릭 시 닫기
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("pomodoroModal");
  if (modal) {
    modal.addEventListener("click", e => {
      if (e.target === modal) closePomodoro();
    });
  }
  const btn = document.getElementById("pomodoroBtn");
  if (btn) btn.onclick = openPomodoro;
});
