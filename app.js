const STORAGE_KEY = "siyeon-mission-check-v1";
const EMOJIS = ["📚", "🪥", "🧸", "✏️", "🥛", "🎒", "🌱", "💪", "🧹", "🎹"];
const CATEGORY_LABELS = {
  "korean-reading": "한글독서",
  "book-listening": "영어책 청독",
  "read-aloud": "낭독스쿨",
  video: "영어영상",
  math: "수학",
  book: "영어책",
  talk: "마주·놀이",
  life: "생활"
};
const REPORT_CATEGORY_MAP = {
  book: ["book-listening", "book"],
  video: ["video"],
  talk: ["korean-reading", "talk"]
};
const DETAIL_PLACEHOLDERS = {
  "korean-reading": "읽은 한글책 제목을 적어 주세요",
  "book-listening": "청독한 영어책 제목을 적어 주세요",
  video: "시청한 영어영상 제목을 적어 주세요"
};
const ACADEMY_SCHEDULE = {
  1: ["미술", "영어", "하키"],
  2: ["피아노", "하키"],
  3: ["영어", "피아노", "헬레나즈"],
  4: ["합창", "하키"],
  5: ["한자", "피아노"],
  6: ["하키", "오프아이스"]
};
const mathMissionName = (date = new Date()) => [0, 3, 6].includes(date.getDay()) ? "쎈수학" : "쎈연산";
const DEFAULT_MISSIONS = [
  { id: crypto.randomUUID(), text: "한글독서", done: false, detail: "", emoji: "📖", category: "korean-reading" },
  { id: crypto.randomUUID(), text: "영어책 청독", done: false, detail: "", emoji: "🎧", category: "book-listening" },
  { id: crypto.randomUUID(), text: "낭독스쿨", done: false, emoji: "🎙️", category: "read-aloud" },
  { id: crypto.randomUUID(), text: "영어영상", done: false, detail: "", emoji: "🎬", category: "video" },
  { id: crypto.randomUUID(), text: mathMissionName(), done: false, emoji: "✏️", category: "math" }
];
const OLD_DEFAULT_NAMES = new Set(["일어나서 이불 정리하기", "학교 준비물 챙기기", "책 20분 읽기", "내 방 한 번 정리하기"]);

const $ = (selector) => document.querySelector(selector);
const els = {
  todayLabel: $("#todayLabel"), starCount: $("#starCount"), progressText: $("#progressText"),
  progressBar: $("#progressBar"), progressTrack: $(".progress-track"), progressDetail: $("#progressDetail"),
  cheerMessage: $("#cheerMessage"), missionList: $("#missionList"), emptyState: $("#emptyState"),
  template: $("#missionTemplate"), addForm: $("#addForm"), missionInput: $("#missionInput"),
  weekGrid: $("#weekGrid"), streakCount: $("#streakCount"), celebration: $("#celebration")
};

const dateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.missions && Array.isArray(saved.missions)) return saved;
  } catch (_) {}
  return { date: dateKey(), missions: DEFAULT_MISSIONS, history: {}, dailyLogs: {}, reportNotes: {}, bonusStars: 0, celebratedOn: null };
}

let state = loadState();
state.dailyLogs ||= {};
state.reportNotes ||= {};
state.reportOverrides ||= {};
state.missions = state.missions
  .filter((mission) => !OLD_DEFAULT_NAMES.has(mission.text))
  .map((mission) => ({ ...mission, category: mission.category || "life", detail: mission.detail || "" }));
const currentMathMission = state.missions.find((mission) => mission.category === "math" || ["수학", "쎈수학", "쎈연산"].includes(mission.text));
if (currentMathMission) {
  currentMathMission.text = mathMissionName();
  currentMathMission.category = "math";
  currentMathMission.emoji = "✏️";
}
state.missions = state.missions.filter((mission, index, missions) => mission.category !== "math" || index === missions.findIndex((item) => item.category === "math"));
for (const core of DEFAULT_MISSIONS) {
  if (!state.missions.some((mission) => mission.text === core.text)) state.missions.push(core);
}

function rollToToday() {
  const today = dateKey();
  if (state.date === today) return;
  const wasComplete = state.missions.length > 0 && state.missions.every((mission) => mission.done);
  state.history[state.date] = wasComplete;
  snapshotToday();
  state.date = today;
  state.missions = state.missions.map((mission) => ({
    ...mission,
    text: mission.category === "math" ? mathMissionName() : mission.text,
    done: false,
    detail: ""
  }));
  save();
}

function save(options = {}) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.skipCloud) window.siyeonCloud?.scheduleSave(state);
}

window.getSiyeonLocalState = () => JSON.parse(JSON.stringify(state));
window.applySiyeonCloudState = (remoteState) => {
  if (!remoteState?.missions || !Array.isArray(remoteState.missions)) return;
  state = remoteState;
  state.dailyLogs ||= {}; state.reportNotes ||= {}; state.reportOverrides ||= {}; state.history ||= {};
  state.missions = state.missions.map((mission) => ({ ...mission, detail: mission.detail || "", category: mission.category || "life" }));
  rollToToday();
  snapshotToday();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  if (!document.querySelector("#reportView").hidden) renderMonthlyReport();
};

function snapshotToday() {
  state.dailyLogs[state.date] = state.missions.map(({ id, text, done, detail, emoji, category }) => ({ id, text, done, detail: detail || "", emoji, category: category || "life" }));
}

function render() {
  const now = new Date();
  els.todayLabel.textContent = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  els.missionList.innerHTML = "";

  state.missions.forEach((mission) => {
    const item = els.template.content.firstElementChild.cloneNode(true);
    item.dataset.id = mission.id;
    item.classList.toggle("done", mission.done);
    item.querySelector(".mission-emoji").textContent = mission.emoji;
    item.querySelector(".mission-text").textContent = mission.text;
    item.querySelector(".mission-category").textContent = CATEGORY_LABELS[mission.category] || "생활";
    const detailLabel = item.querySelector(".mission-detail");
    const detailInput = item.querySelector(".mission-detail-input");
    if (DETAIL_PLACEHOLDERS[mission.category]) {
      detailLabel.hidden = false;
      detailInput.placeholder = DETAIL_PLACEHOLDERS[mission.category];
      detailInput.value = mission.detail || "";
      detailInput.setAttribute("aria-label", `${mission.text} 제목`);
      detailInput.addEventListener("input", () => {
        mission.detail = detailInput.value;
        snapshotToday();
        save();
      });
    }
    const check = item.querySelector(".check-button");
    check.setAttribute("aria-label", mission.done ? `${mission.text} 완료 취소` : `${mission.text} 완료하기`);
    check.setAttribute("aria-pressed", String(mission.done));
    check.addEventListener("click", () => toggleMission(mission.id));
    item.querySelector(".delete-button").addEventListener("click", () => deleteMission(mission.id));
    els.missionList.append(item);
  });

  els.emptyState.hidden = state.missions.length !== 0;
  renderAcademySchedule();
  renderProgress();
  renderWeek();
}

function renderAcademySchedule() {
  const todayDow = new Date().getDay();
  const names = ["", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const todaySchedule = ACADEMY_SCHEDULE[todayDow];
  $("#academyToday").textContent = todaySchedule
    ? `오늘은 ${todaySchedule.join(" · ")}`
    : "오늘은 학원 없는 날 🌼";
  $("#academyWeek").innerHTML = [1, 2, 3, 4, 5, 6].map((day) => `
    <div class="academy-day${todayDow === day ? " today" : ""}" ${todayDow === day ? 'aria-current="date"' : ""}>
      <strong>${names[day]}</strong>
      <ul>${ACADEMY_SCHEDULE[day].map((name) => `<li>${name}</li>`).join("")}</ul>
    </div>
  `).join("");
}

function renderProgress() {
  const total = state.missions.length;
  const done = state.missions.filter((mission) => mission.done).length;
  const percent = total ? Math.round(done / total * 100) : 0;
  els.progressText.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;
  els.progressTrack.setAttribute("aria-valuenow", String(percent));
  els.progressDetail.textContent = total ? `${total}개 중 ${done}개의 미션을 완료했어요.` : "미션을 추가하면 진행률이 보여요.";
  els.starCount.textContent = done + (state.bonusStars || 0);

  if (!total) els.cheerMessage.textContent = "새로운 미션을 만들어 볼까요?";
  else if (percent === 100) els.cheerMessage.textContent = "와! 오늘도 모두 해냈어요!";
  else if (percent >= 60) els.cheerMessage.textContent = "조금만 더! 멋지게 하고 있어요.";
  else if (percent > 0) els.cheerMessage.textContent = "좋은 시작이에요. 하나씩 차근차근!";
  else els.cheerMessage.textContent = "첫 미션을 시작해 볼까요?";
}

function renderWeek() {
  els.weekGrid.innerHTML = "";
  const today = new Date();
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  for (let offset = -6; offset <= 0; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const key = dateKey(date);
    const todayComplete = key === state.date && state.missions.length > 0 && state.missions.every((mission) => mission.done);
    const complete = todayComplete || state.history[key] === true;
    const cell = document.createElement("div");
    cell.className = `day-cell${key === dateKey() ? " today" : ""}${complete ? " complete" : ""}`;
    cell.innerHTML = `<span class="day-name">${labels[date.getDay()]}</span><span class="stamp">${complete ? "♛" : date.getDate()}</span>`;
    els.weekGrid.append(cell);
  }

  let streak = 0;
  for (let offset = 0; offset > -365; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const key = dateKey(date);
    const complete = key === state.date
      ? state.missions.length > 0 && state.missions.every((mission) => mission.done)
      : state.history[key] === true;
    if (!complete) break;
    streak++;
  }
  els.streakCount.textContent = streak;
}

function toggleMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (!mission) return;
  mission.done = !mission.done;
  const allDone = state.missions.length > 0 && state.missions.every((item) => item.done);
  if (allDone) {
    state.history[state.date] = true;
    if (state.celebratedOn !== state.date) {
      state.bonusStars = (state.bonusStars || 0) + 3;
      state.celebratedOn = state.date;
      setTimeout(() => { els.celebration.hidden = false; $("#closeCelebration").focus(); }, 350);
    }
  } else {
    state.history[state.date] = false;
  }
  snapshotToday();
  save();
  render();
}

function deleteMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (!mission || !confirm(`“${mission.text}” 미션을 지울까요?`)) return;
  state.missions = state.missions.filter((item) => item.id !== id);
  snapshotToday();
  save();
  render();
}

$("#openAddButton").addEventListener("click", () => {
  els.addForm.hidden = false;
  els.missionInput.focus();
});

$("#cancelAddButton").addEventListener("click", () => {
  els.addForm.hidden = true;
  els.missionInput.value = "";
});

els.addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = els.missionInput.value.trim();
  if (!text) { els.missionInput.focus(); return; }
  state.missions.push({ id: crypto.randomUUID(), text, done: false, detail: "", emoji: EMOJIS[state.missions.length % EMOJIS.length], category: $("#missionCategory").value });
  els.missionInput.value = "";
  els.addForm.hidden = true;
  state.history[state.date] = false;
  snapshotToday();
  save();
  render();
});

$("#resetButton").addEventListener("click", () => {
  if (!confirm("오늘 완료한 체크만 모두 지울까요? 미션 목록은 그대로 남아요.")) return;
  state.missions = state.missions.map((mission) => ({ ...mission, done: false, detail: "" }));
  state.history[state.date] = false;
  state.celebratedOn = null;
  snapshotToday();
  save();
  render();
});

$("#closeCelebration").addEventListener("click", () => { els.celebration.hidden = true; });
els.celebration.addEventListener("click", (event) => { if (event.target === els.celebration) els.celebration.hidden = true; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") els.celebration.hidden = true; });

const reportEls = {
  view: $("#reportView"), year: $("#reportYear"), month: $("#reportMonth"), body: $("#reportCalendarBody"),
  summary: $("#reportSummary"), period: $("#reportPeriod"), praise: $("#monthlyPraise"), total: $("#monthlyTotal")
};

function initReportSelectors() {
  const now = new Date();
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) reportEls.year.add(new Option(`${y}년`, y));
  for (let m = 1; m <= 12; m++) reportEls.month.add(new Option(`${m}월`, m));
  reportEls.year.value = now.getFullYear(); reportEls.month.value = now.getMonth() + 1;
  reportEls.year.addEventListener("change", renderMonthlyReport);
  reportEls.month.addEventListener("change", renderMonthlyReport);
}

function dayHasCategory(key, category) {
  if (typeof state.reportOverrides?.[key]?.[category] === "boolean") return state.reportOverrides[key][category];
  const linkedCategories = REPORT_CATEGORY_MAP[category] || [category];
  return (state.dailyLogs[key] || []).some((mission) => linkedCategories.includes(mission.category) && mission.done);
}

function renderMonthlyReport() {
  snapshotToday(); save();
  const year = +reportEls.year.value, month = +reportEls.month.value;
  const days = new Date(year, month, 0).getDate();
  reportEls.period.textContent = `${year}년 ${month}월`;
  reportEls.body.innerHTML = "";
  const categories = ["book", "video", "talk"];
  const counts = Object.fromEntries(categories.map((cat) => [cat, 0]));
  const accumulatedTitles = { book: [], video: [], talk: [] };
  let totalDone = 0, totalMissions = 0, currentWeek = 0;
  const weekCounts = {};
  for (let day = 1; day <= days; day++) {
    const date = new Date(year, month - 1, day);
    if (day === 1 || date.getDay() === 0) currentWeek++;
    weekCounts[currentWeek] = (weekCounts[currentWeek] || 0) + 1;
  }
  currentWeek = 0;
  const dow = ["일","월","화","수","목","금","토"];
  for (let day = 1; day <= days; day++) {
    const date = new Date(year, month - 1, day), key = dateKey(date);
    if (day === 1 || date.getDay() === 0) currentWeek++;
    const log = state.dailyLogs[key] || [];
    log.forEach((mission) => {
      const title = (mission.detail || "").trim();
      if (!title) return;
      if (mission.category === "book-listening") accumulatedTitles.book.push(title);
      if (mission.category === "video") accumulatedTitles.video.push(title);
      if (mission.category === "korean-reading") accumulatedTitles.talk.push(title);
    });
    totalDone += log.filter((m) => m.done).length; totalMissions += log.length;
    const tr = document.createElement("tr");
    if (day === 1 || date.getDay() === 0) tr.innerHTML = `<td class="week" rowspan="${weekCounts[currentWeek]}">week${currentWeek}</td>`;
    const weekend = date.getDay() === 0 || date.getDay() === 6 ? "weekend" : "";
    tr.insertAdjacentHTML("beforeend", `<td class="${weekend}">${dow[date.getDay()]}</td><td>${month}/${day}</td>`);
    categories.forEach((cat) => {
      const on = dayHasCategory(key, cat); if (on) counts[cat]++;
      tr.insertAdjacentHTML("beforeend", `<td><button class="report-check ${on ? "on" : ""}" data-report-day="${key}" data-report-cat="${cat}" type="button" aria-label="${key} ${cat} 기록 수정">✓</button></td>`);
    });
    reportEls.body.append(tr);
  }
  const stats = [
    ["영어책", counts.book, "#ffd33f"], ["영어영상", counts.video, "#ffdf68"],
    ["마주이야기", counts.talk, "#ffc94a"], ["전체 미션", totalDone, "#ffe45f", totalMissions]
  ];
  reportEls.summary.innerHTML = stats.map(([label,count,color,denom]) => {
    const base = denom ?? days, pct = base ? Math.round(count / base * 100) : 0;
    return `<div class="report-stat" style="--stat-color:${color};--pct:${pct}%"><span>${label}</span><b>${count}</b><small>${denom == null ? `일 / ${days}일` : `개 / ${base}개`} · ${pct}%</small><i></i></div>`;
  }).join("");
  const rate = totalMissions ? Math.round(totalDone / totalMissions * 100) : 0;
  reportEls.praise.textContent = rate >= 90 ? "꾸준함이 반짝이는 멋진 한 달이었어요!" : rate >= 60 ? "차근차근 좋은 습관을 만들고 있어요!" : "작은 도전 하나하나가 소중한 성장이에요!";
  reportEls.total.textContent = `전체 미션 달성률 ${rate}%`;
  const noteKey = `${year}-${String(month).padStart(2,"0")}`;
  document.querySelectorAll("[data-report-note]").forEach((area) => { area.value = state.reportNotes[noteKey]?.[area.dataset.reportNote] || ""; });
  document.querySelectorAll("[data-report-titles]").forEach((box) => {
    const titles = accumulatedTitles[box.dataset.reportTitles] || [];
    box.textContent = titles.length ? titles.map((title) => `• ${title}`).join("\n") : "아직 입력된 제목이 없어요.";
    box.classList.toggle("empty", titles.length === 0);
  });
}

$("#openReportButton").addEventListener("click", () => { document.querySelector(".app-shell").hidden = true; reportEls.view.hidden = false; renderMonthlyReport(); window.scrollTo(0,0); });
$("#closeReportButton").addEventListener("click", () => { reportEls.view.hidden = true; document.querySelector(".app-shell").hidden = false; render(); window.scrollTo(0,0); });
$("#printReportButton").addEventListener("click", () => { snapshotToday(); save(); window.print(); });
document.querySelectorAll("[data-report-note]").forEach((area) => area.addEventListener("input", () => {
  const key = `${reportEls.year.value}-${String(reportEls.month.value).padStart(2,"0")}`;
  state.reportNotes[key] ||= {}; state.reportNotes[key][area.dataset.reportNote] = area.value; save();
}));
reportEls.body.addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-day]"); if (!button) return;
  const key = button.dataset.reportDay, category = button.dataset.reportCat;
  const currentlyOn = dayHasCategory(key, category);
  state.reportOverrides[key] ||= {};
  state.reportOverrides[key][category] = !currentlyOn;
  save(); renderMonthlyReport();
});

rollToToday();
snapshotToday();
initReportSelectors();
render();
