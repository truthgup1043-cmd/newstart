/* 하영시 앱 — 포모도로 타이머 (사용자 설정 가능) */

function getPomoSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("pomo-settings") || "{}");
    return {
      work: Math.max(1, Math.min(120, s.work || 25)),
      brk: Math.max(1, Math.min(60, s.brk || 5)),
      long: Math.max(1, Math.min(60, s.long || 15)),
    };
  } catch {
    return { work: 25, brk: 5, long: 15 };
  }
}
function pomoWorkSec() { return getPomoSettings().work * 60; }
function pomoBreakSec() { return getPomoSettings().brk * 60; }
function pomoLongSec() { return getPomoSettings().long * 60; }

function savePomoSettings() {
  const w = parseInt(document.getElementById("pomoWorkMin").value, 10);
  const b = parseInt(document.getElementById("pomoBreakMin").value, 10);
  const l = parseInt(document.getElementById("pomoLongMin").value, 10);
  try {
    localStorage.setItem("pomo-settings", JSON.stringify({
      work: Math.max(1, Math.min(120, w || 25)),
      brk: Math.max(1, Math.min(60, b || 5)),
      long: Math.max(1, Math.min(60, l || 15)),
    }));
  } catch {}
  // 현재 설정값을 입력란에 반영
  loadPomoSettings();
  // 타이머가 실행 중이 아니면 새 설정으로 리셋
  if (!pomo.running) {
    pomo.mode = "work";
    pomo.remaining = pomoWorkSec();
    renderPomodoro();
  }
  // 안내 문구 업데이트
  updatePomoDesc();
}
function loadPomoSettings() {
  const s = getPomoSettings();
  document.getElementById("pomoWorkMin").value = s.work;
  document.getElementById("pomoBreakMin").value = s.brk;
  document.getElementById("pomoLongMin").value = s.long;
}
function updatePomoDesc() {
  const s = getPomoSettings();
  const el = document.getElementById("pomoDesc");
  if (el) el.textContent = `${s.work}분 집중 → ${s.brk}분 휴식 · 4세트마다 ${s.long}분 휴식`;
}

let pomo = {
  mode: "work",       // work | break | longbreak
  remaining: pomoWorkSec(),
  cycle: 0,           // 완료한 집중 세트 수
  running: false,
  timerId: null,
  endTs: 0,
};

function pomoModeLabel() {
  return pomo.mode === "work" ? "집중 시간" : pomo.mode === "break" ? "짧은 휴식" : "긴 휴식";
}
function pomoModeTotal() {
  return pomo.mode === "work" ? pomoWorkSec() : pomo.mode === "break" ? pomoBreakSec() : pomoLongSec();
}
function openPomodoro() {
  document.getElementById("pomodoroModal").classList.remove("hidden");
  loadPomoSettings();
  updatePomoDesc();
  // 설정이 바뀌었을 수 있으니 실행 중이 아닐 때 현재 모드에 맞게 보정
  if (!pomo.running) {
    pomo.remaining = pomoModeTotal();
  }
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
  // 완료 알림음: 부드러운 종소리 (3음)
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((fq, i) => {
      const t = ctx.currentTime + i * 0.35;
      [1, 2, 3].forEach(mult => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = fq * mult;
        const vol = 0.18 / mult;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 2.6);
      });
    });
  } catch {}
  if (pomo.mode === "work") {
    pomo.cycle++;
    pomo.mode = (pomo.cycle % 4 === 0) ? "longbreak" : "break";
    pomo.remaining = pomo.mode === "longbreak" ? pomoLongSec() : pomoBreakSec();
  } else {
    pomo.mode = "work";
    pomo.remaining = pomoWorkSec();
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
  pomo = { mode: "work", remaining: pomoWorkSec(), cycle: 0, running: false, timerId: null, endTs: 0 };
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
  const bpModal = document.getElementById("bookPreviewModal");
  if (bpModal) {
    bpModal.addEventListener("click", e => {
      if (e.target === bpModal) closeBookPreview();
    });
  }
});
