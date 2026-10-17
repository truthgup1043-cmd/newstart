/* 하영시 앱 — 기도 타이머 (루틴 탭 기도 루틴용) */

let prayerDur = 30;      // 선택된 타이머 시간(분)
let prayerTimer = null;  // { running, paused, totalMs, totalMin, remainMs, endTs, timerId }

// ---------- 타이머 UI ----------
function prayerTimerHtml() {
  // 실행 중이면 카운트다운 화면
  if (prayerTimer && prayerTimer.running) {
    return `
      <div class="prayer-timer" onclick="event.stopPropagation()">
        <div class="prayer-clock" id="prayerClock">--:--</div>
        <div class="prayer-elapsed" id="prayerElapsed">준비 중…</div>
        <div class="picker-actions" style="justify-content:center">
          <button class="btn" onclick="event.stopPropagation();togglePrayerTimer()">${prayerTimer.paused ? "▶ 계속하기" : "⏸ 일시정지"}</button>
          <button class="btn primary" onclick="event.stopPropagation();stopPrayerTimer(true)">⏹ 중단하고 저장</button>
        </div>
      </div>`;
  }
  // 설정 화면
  return `
    <div class="prayer-timer-setup" onclick="event.stopPropagation()">
      <div class="picker-label">⏱ 기도 타이머</div>
      <div class="chips" id="prayerDurChips">
        ${[5, 10, 20, 30, 60].map(m =>
          `<button class="chip${m === prayerDur ? " sel" : ""}" data-v="${m}" onclick="event.stopPropagation();setPrayerDur(${m})">${m}분</button>`).join("")}
        <input id="prayerCustomMin" class="custom" type="number" min="1" placeholder="직접 입력(분)">
      </div>
      <div class="picker-actions" style="justify-content:center">
        <button class="btn primary" onclick="event.stopPropagation();startPrayerTimer()">▶ 타이머 시작</button>
      </div>
    </div>`;
}

function setPrayerDur(m) {
  prayerDur = m;
  const inp = document.getElementById("prayerCustomMin");
  if (inp) inp.value = "";
  document.querySelectorAll("#prayerDurChips .chip").forEach(c =>
    c.classList.toggle("sel", Number(c.dataset.v) === m));
}

// ---------- 타이머 동작 ----------
function startPrayerTimer() {
  if (prayerTimer && prayerTimer.running) return;
  const inp = document.getElementById("prayerCustomMin");
  let mins = prayerDur;
  if (inp && inp.value) mins = Math.max(1, Math.round(parseFloat(inp.value) || prayerDur));
  const totalMs = mins * 60000;
  prayerTimer = {
    running: true, paused: false,
    totalMs, totalMin: mins,
    remainMs: totalMs,
    endTs: Date.now() + totalMs,
    timerId: null,
  };
  prayerTimer.timerId = setInterval(prayerTick, 500);
  renderRoutines();
  prayerTick();
}

function prayerTick() {
  if (!prayerTimer || prayerTimer.paused) return;
  prayerTimer.remainMs = Math.max(0, prayerTimer.endTs - Date.now());
  const remain = prayerTimer.remainMs;
  const elapsed = prayerTimer.totalMs - remain;
  const clock = document.getElementById("prayerClock");
  if (clock) {
    const mm = String(Math.floor(remain / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, "0");
    clock.textContent = `${mm}:${ss}`;
  }
  const el = document.getElementById("prayerElapsed");
  if (el) {
    const em = Math.floor(elapsed / 60000);
    const es = Math.floor((elapsed % 60000) / 1000);
    el.textContent = `지금까지 ${em}분 ${es}초 기도 중`;
  }
  if (remain <= 0) finishPrayerTimer();
}

function togglePrayerTimer() {
  if (!prayerTimer || !prayerTimer.running) return;
  if (prayerTimer.paused) {
    prayerTimer.endTs = Date.now() + prayerTimer.remainMs;
    prayerTimer.paused = false;
  } else {
    prayerTimer.remainMs = Math.max(0, prayerTimer.endTs - Date.now());
    prayerTimer.paused = true;
  }
  renderRoutines();
  prayerTick();
}

// 중간에 멈추면: 지금까지 기도한 시간을 저장
function stopPrayerTimer(save) {
  if (!prayerTimer) return;
  clearInterval(prayerTimer.timerId);
  if (!prayerTimer.paused) {
    prayerTimer.remainMs = Math.max(0, prayerTimer.endTs - Date.now());
  }
  const elapsedMs = prayerTimer.totalMs - prayerTimer.remainMs;
  const mins = Math.max(1, Math.round(elapsedMs / 60000));
  prayerTimer = null;
  if (save) {
    recordPrayerMinutes(mins, false);
  } else {
    renderRoutines();
  }
}

function finishPrayerTimer() {
  if (!prayerTimer) return;
  clearInterval(prayerTimer.timerId);
  const mins = prayerTimer.totalMin;
  prayerTimer = null;
  recordPrayerMinutes(mins, true);
}

async function recordPrayerMinutes(mins, completed) {
  if (!store[today]) store[today] = {};
  store[today]["prayer"] = true;
  store[today]["prayer_minutes"] = (store[today]["prayer_minutes"] || 0) + mins;
  pickerFor = null;
  cache(); renderAll();
  await saveRow("prayer", true, { minutes: store[today]["prayer_minutes"] });
  if (completed) {
    prayerChime();
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch {}
    showPrayerDoneModal(mins, store[today]["prayer_minutes"]);
  }
}

// ---------- 완료 알림 ----------
function prayerChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.9);
    });
  } catch {}
}

function showPrayerDoneModal(mins, total) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <div class="modal-card" style="text-align:center">
      <h3>🙏 기도 시간 완료</h3>
      <p class="qt-note" style="margin:12px 0 18px">${mins}분 기도했어요.<br>오늘 총 ${total}분 기도했습니다.</p>
      <button class="btn primary" style="width:100%">확인</button>
    </div>`;
  m.querySelector("button").onclick = () => m.remove();
  m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
}
