const STORAGE_KEY = "jooyoon-mission-check-v1";
const EMOJIS = ["📚", "🪥", "🧸", "✏️", "🥛", "🎒", "🌱", "💪", "🧹", "🎹"];
const CATEGORY_LABELS = {
  "korean-reading": "한글책읽기",
  worksheet: "재능 학습지",
  video: "영어영상",
  academy: "요일 미션",
  book: "영어책",
  talk: "마주·놀이",
  life: "생활"
};
const REPORT_CATEGORY_MAP = {
  book: ["korean-reading"],
  video: ["video"],
  talk: ["worksheet"]
};
const DETAIL_PLACEHOLDERS = {};
const ACADEMY_SCHEDULE = {
  1: ["터전"],
  2: ["터전", "놀이방"],
  3: ["터전"],
  4: ["터전", "나래울", "하키"],
  5: ["터전", "재능"],
  6: ["하키", "오프아이스"]
};
const academyScheduleForDate = (date = new Date()) => date.getFullYear() === 2026 && date.getMonth() === 7 && date.getDate() === 3
  ? ["터전", "나래울"]
  : (ACADEMY_SCHEDULE[date.getDay()] || []);
const missionsForDate = (date = new Date()) => [
  { id: crypto.randomUUID(), text: "한글책읽기", done: false, detail: "", emoji: "📖", category: "korean-reading" },
  { id: crypto.randomUUID(), text: "재능 학습지", done: false, detail: "", emoji: "✏️", category: "worksheet" },
  { id: crypto.randomUUID(), text: "영어영상", done: false, detail: "", emoji: "🎬", category: "video" },
  ...academyScheduleForDate(date).map((text) => ({ id: crypto.randomUUID(), text, done: false, detail: "", emoji: "🎒", category: "academy" }))
];
const DEFAULT_MISSIONS = missionsForDate();
const OLD_DEFAULT_NAMES = new Set(["일어나서 이불 정리하기", "학교 준비물 챙기기", "책 20분 읽기", "내 방 한 번 정리하기"]);

const $ = (selector) => document.querySelector(selector);
const els = {
  todayLabel: $("#todayLabel"), crownCount: $("#crownCount"), progressText: $("#progressText"),
  progressBar: $("#progressBar"), progressTrack: $(".progress-track"), progressDetail: $("#progressDetail"),
  cheerMessage: $("#cheerMessage"), missionList: $("#missionList"), emptyState: $("#emptyState"),
  template: $("#missionTemplate"), addForm: $("#addForm"), missionInput: $("#missionInput"),
  celebration: $("#celebration")
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
  return { date: dateKey(), missions: DEFAULT_MISSIONS, history: {}, dailyLogs: {}, reportNotes: {}, crowns: [], loveLetters: [], rewardMilestones: [], celebratedOn: null };
}

function ensureCrowns(target) {
  target.history ||= {};
  if (!Array.isArray(target.crowns)) {
    target.crowns = Object.entries(target.history).filter(([, complete]) => complete).map(([date]) => date);
    if (target.celebratedOn && !target.crowns.includes(target.celebratedOn)) target.crowns.push(target.celebratedOn);
  }
}

let state = loadState();
ensureCrowns(state);
state.dailyLogs ||= {};
state.reportNotes ||= {};
state.reportOverrides ||= {};
state.loveLetters ||= [];
state.rewardMilestones ||= [];
state.missions = state.missions.map((mission) => ({ ...mission, category: mission.category || "life", detail: mission.detail || "" }));

function rollToToday() {
  const today = dateKey();
  if (state.date === today) return;
  const wasComplete = state.missions.length > 0 && state.missions.every((mission) => mission.done);
  state.history[state.date] = wasComplete;
  snapshotToday();
  state.date = today;
  const customMissions = state.missions.filter((mission) => !["korean-reading", "worksheet", "video", "academy"].includes(mission.category));
  state.missions = [...missionsForDate(new Date()), ...customMissions.map((mission) => ({ ...mission, done: false, detail: "" }))];
  save();
}

function save(options = {}) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.skipCloud) window.jooyoonCloud?.scheduleSave(state);
}

window.getJooyoonLocalState = () => JSON.parse(JSON.stringify(state));
window.applyJooyoonCloudState = (remoteState) => {
  if (!remoteState?.missions || !Array.isArray(remoteState.missions)) return;
  state = remoteState;
  ensureCrowns(state);
  state.dailyLogs ||= {}; state.reportNotes ||= {}; state.reportOverrides ||= {}; state.history ||= {};
  state.loveLetters ||= []; state.rewardMilestones ||= [];
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
  renderLoveLetters();
}

function renderAcademySchedule() {
  const todayDow = new Date().getDay();
  const names = ["", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const todaySchedule = academyScheduleForDate(new Date());
  $("#academyToday").textContent = todaySchedule.length
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
  els.crownCount.textContent = state.crowns.length;
  const earned = Math.floor(state.crowns.length / 100);
  const remainder = state.crowns.length % 100;
  $("#rewardCount").textContent = earned;
  $("#rewardProgress").textContent = `데이트권 ${earned}장 · 다음까지 ${remainder ? 100 - remainder : 100}개`;

  if (!total) els.cheerMessage.textContent = "새로운 미션을 만들어 볼까요?";
  else if (percent === 100) els.cheerMessage.textContent = "와! 오늘도 모두 해냈어요!";
  else if (percent >= 60) els.cheerMessage.textContent = "조금만 더! 멋지게 하고 있어요.";
  else if (percent > 0) els.cheerMessage.textContent = "좋은 시작이에요. 하나씩 차근차근!";
  else els.cheerMessage.textContent = "첫 미션을 시작해 볼까요?";
}

function toggleMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (!mission) return;
  mission.done = !mission.done;
  const allDone = state.missions.length > 0 && state.missions.every((item) => item.done);
  if (allDone) {
    state.history[state.date] = true;
    const gotNewCrown = !state.crowns.includes(state.date);
    if (gotNewCrown) state.crowns.push(state.date);
    if (state.celebratedOn !== state.date) {
      state.celebratedOn = state.date;
      const milestone = gotNewCrown && state.crowns.length % 100 === 0 ? state.crowns.length : 0;
      if (milestone && !state.rewardMilestones.includes(milestone)) state.rewardMilestones.push(milestone);
      $("#celebrationKicker").textContent = milestone ? "100 CROWNS! SPECIAL REWARD!" : "MISSION COMPLETE!";
      $("#celebrationTitle").textContent = milestone ? `왕관 ${milestone}개 달성!` : "오늘의 미션 완료!";
      $("#celebrationMessage").innerHTML = milestone
        ? "주윤아, 정말정말 축하해! 🎉<br><strong>엄마아빠와 데이트권 1장</strong>을 받았어요!<br>함께 가고 싶은 곳을 골라 보자!"
        : "주윤아, 오늘도 정말 멋지게 해냈어.<br>새로운 왕관을 하나 받았어요!";
      els.celebration.classList.toggle("milestone", Boolean(milestone));
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

function monthKey(value = new Date()) { return dateKey(value).slice(0, 7); }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function authorEmoji(author) { return { 엄마: "👩🏻", 아빠: "👨🏻", 주윤: "👧🏻" }[author] || "💛"; }

function renderLoveLetters() {
  const letters = state.loveLetters.filter((letter) => letter.month === monthKey());
  $("#loveLetterList").innerHTML = letters.length ? letters.map((letter) => `
    <article class="love-letter" data-letter-id="${letter.id}">
      <div><strong title="${escapeHtml(letter.author)}" aria-label="${escapeHtml(letter.author)}">${authorEmoji(letter.author)}</strong><small>${letter.date}</small></div>
      <p>${escapeHtml(letter.message)}</p>
      <div class="letter-actions"><button type="button" data-letter-edit>수정</button><button type="button" data-letter-delete>삭제</button></div>
    </article>`).join("") : '<p class="letter-empty">이번 달 첫 사랑편지를 남겨 보세요.</p>';
}

$("#loveLetterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = $("#loveLetterMessage").value.trim(); if (!message) return;
  state.loveLetters.push({ id: crypto.randomUUID(), author: $("#loveLetterAuthor").value, message, date: dateKey(), month: monthKey(), createdAt: new Date().toISOString() });
  $("#loveLetterMessage").value = ""; save(); renderLoveLetters();
});

$("#loveLetterList").addEventListener("click", (event) => {
  const article = event.target.closest("[data-letter-id]"); if (!article) return;
  const letter = state.loveLetters.find((item) => item.id === article.dataset.letterId); if (!letter) return;
  if (event.target.closest("[data-letter-edit]")) {
    const message = prompt("사랑편지를 수정해 주세요.", letter.message);
    if (message?.trim()) { letter.message = message.trim(); save(); renderLoveLetters(); }
  }
  if (event.target.closest("[data-letter-delete]") && confirm("이 사랑편지를 삭제할까요?")) {
    state.loveLetters = state.loveLetters.filter((item) => item.id !== letter.id); save(); renderLoveLetters();
  }
});

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
    ["한글책", counts.book, "#6fcfff"], ["영어영상", counts.video, "#91ddff"],
    ["재능 학습지", counts.talk, "#50bfea"], ["전체 미션", totalDone, "#a8e7ff", totalMissions]
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
  const letters = state.loveLetters.filter((letter) => letter.month === noteKey);
  $("#reportLoveLetterList").innerHTML = letters.length
    ? letters.map((letter) => `<p><strong title="${escapeHtml(letter.author)}">${authorEmoji(letter.author)}</strong> ${escapeHtml(letter.message)}</p>`).join("")
    : "<p>이번 달에 작성한 사랑편지가 아직 없어요.</p>";
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
