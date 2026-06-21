const $ = (q, el = document) => el.querySelector(q);
const app = $("#app");
const STORAGE = "aegukga-explorer-v1";
const STUDENT_ID = "demo-student";
const CLASS_ID = "class-neulbom-5-2";
const defaults = {
  user: { name: "김하늘", className: "늘봄초 5학년 2반", code: "대한-815" },
  route: "home", lessonStep: { 1: 0, 2: 0, 3: 0 },
  scores: { history: 0, escape: 0, meaning: 0, blanks: 0, singing: 0, video: 0 },
  complete: { 1: false, 2: false, 3: false },
  quizAnswer: null,
  escapeGame: { started:false, roomIndex:0, roomSolved:false, score:0, historicalTrust:100, hintsUsed:0, mistakeCount:0, artifacts:[], flags:{ acceptedUncertaintyChanmiga:false, acceptedUnresolvedLyricist:false }, feedback:null, hintLevel:0, startedAt:null },
  transcript: "", singingScore: 0,
  group: { name: "무궁화 탐험대", members: ["김하늘", "이도윤", "박서아", "최지우"] }
};
let state = load();
let drawings = [];
let slideTimer = null;
let syncTimer = null;
let dashboardData = null;
let videoJob = null;
let serviceConfig = { transcriptionConfigured:false, audioConfigured:false };
let activeRecorder = null;
let escapeTimer = null;

function load() {
  try { return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem(STORAGE)), route: "home" }; }
  catch { return structuredClone(defaults); }
}
function save() {
  const safe = { ...state, route: undefined };
  localStorage.setItem(STORAGE, JSON.stringify(safe));
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncToServer(safe), 180);
}
async function syncToServer(safe = { ...state, route: undefined }) {
  setSync("저장 중…", "saving");
  try {
    const response = await fetch(`/api/students/${STUDENT_ID}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({state:safe}) });
    if (!response.ok) throw new Error("sync failed");
    setSync("서버 저장됨", "saved");
    await loadDashboard(false);
  } catch { setSync("오프라인 저장", "offline"); }
}
async function hydrateServer() {
  try {
    const response = await fetch(`/api/students/${STUDENT_ID}`); if (!response.ok) throw new Error("load failed");
    const remote = await response.json();
    if (remote.state) {
      const r = remote.state;
      state = { ...state, ...r, route:"home", user:{...defaults.user,...r.user}, scores:{...defaults.scores,...r.scores}, complete:{...defaults.complete,...r.complete}, lessonStep:{...defaults.lessonStep,...r.lessonStep} };
      localStorage.setItem(STORAGE, JSON.stringify({ ...state, route:undefined }));
    } else await syncToServer();
    await Promise.all([loadDashboard(false),loadConfig()]); setSync("서버 연결됨", "saved"); render();
  } catch { setSync("오프라인 저장", "offline"); }
}
async function loadDashboard(shouldRender = true) {
  try { const response = await fetch(`/api/classes/${CLASS_ID}/dashboard`); if (!response.ok) return; dashboardData = await response.json(); if (shouldRender && state.route === "teacher") render(); }
  catch { /* 현재 화면의 마지막 데이터 유지 */ }
}
async function loadConfig(){try{const response=await fetch("/api/config");if(response.ok)serviceConfig=await response.json()}catch{/* 기본 설정 유지 */}}
function setSync(label, mode) { const el = $("#sync-state"); if (el) { el.textContent = label; el.dataset.mode = mode; } }
function total() { return Object.values(state.scores).reduce((a, b) => a + b, 0); }
function grade(score = total()) { return score >= 85 ? ["전문가", "expert", "🏅"] : score >= 60 ? ["숙련가", "skilled", "🎵"] : ["개척가", "pioneer", "🗝️"]; }
function lessonProgress(n) {
  if (state.complete[n]) return 100;
  const max = n === 1 ? 3 : n === 2 ? 2 : 2;
  return Math.round((state.lessonStep[n] / max) * 75);
}
function toast(message) {
  const t = $("#toast"); t.textContent = message; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function shell(content, active = "home") {
  return `<div class="shell">
    <header class="topbar">
      <button class="brand nav-link" data-route="home" aria-label="홈으로"><span class="brand-mark"></span>애국가 탐험대</button>
      <nav class="nav" aria-label="주 메뉴">
        <button class="nav-link ${active === "home" ? "active" : ""}" data-route="home">탐험 지도</button>
        <button class="nav-link ${active === "teacher" ? "active" : ""}" data-route="teacher">선생님 교실</button>
        <button class="nav-link ${active === "certificate" ? "active" : ""}" data-route="certificate">나의 인증서</button>
      </nav>
      <div class="profile"><span class="sync" id="sync-state" data-mode="saved">서버 연결됨</span><div class="avatar">🌱</div><div><b>${state.user.name}</b><small>${state.user.className}</small></div></div>
    </header>
    <main class="main">${content}</main>
  </div>`;
}

function render() {
  clearInterval(slideTimer);
  clearInterval(escapeTimer);
  const routes = { home: renderHome, lesson1: () => renderLesson(1), lesson2: () => renderLesson(2), lesson3: () => renderLesson(3), teacher: renderTeacher, certificate: renderCertificate };
  app.innerHTML = (routes[state.route] || renderHome)();
  bindPage();
}

function renderHome() {
  const score = total();
  return shell(`
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">✦ 창의적체험활동 · 총 3차시</span>
        <h1>노래 속에 숨은<br><span>우리 이야기</span>를 찾아요</h1>
        <p>역사 속 비밀을 풀고, 가사를 정확히 부르고, 우리 그림으로 뮤직비디오를 완성해 보세요.</p>
        <div class="button-row"><button class="btn primary" data-route="lesson${nextLesson()}">탐험 이어하기 <span>→</span></button><button class="btn secondary" data-route="certificate">내 점수 보기</button></div>
      </div><div class="hero-art" role="img" aria-label="태블릿으로 애국가를 탐구하는 세 학생의 만화풍 삽화"></div>
    </section>
    <div class="section-head"><div><h2>나의 탐험 지도</h2><p>한 차시씩 완료하면 인증서에 가까워져요.</p></div><b>${score} / 100점</b></div>
    <section class="lesson-grid">${lessonCard(1,"애국가의 비밀","흩어진 기록을 복원하며 여덟 개의 방을 탈출해요.","🗝️")}${lessonCard(2,"가사를 제대로","가사의 뜻을 익히고 무반주 노래에 도전해요.","🎙️")}${lessonCard(3,"우리의 뮤직비디오","모둠 그림을 모아 한 편의 영상을 만들어요.","🎬")}</section>
    <div class="section-head"><div><h2>오늘의 기록</h2><p>순위보다 어제의 나보다 한 걸음 더!</p></div></div>
    <section class="stats"><div class="stat"><b>${Object.values(state.complete).filter(Boolean).length}/3</b><span>완료한 차시</span></div><div class="stat"><b>${state.scores.escape}/20</b><span>방탈출 점수</span></div><div class="stat"><b>${state.scores.singing}/25</b><span>가사 정확도</span></div><div class="stat"><b>${grade()[0]}</b><span>현재 등급</span></div></section>
  `);
}
function nextLesson() { return state.complete[1] ? (state.complete[2] ? 3 : 2) : 1; }
function lessonCard(n, title, desc, icon) {
  const p = lessonProgress(n), done = state.complete[n];
  return `<article class="lesson-card"><div class="lesson-top"><span class="lesson-no">${n}</span><span class="status ${done ? "done" : ""}">${done ? "완료" : p ? "진행 중" : "시작 전"}</span></div><h3>${icon} ${title}</h3><p>${desc}</p><div class="progress"><i style="width:${p}%"></i></div><div class="card-foot"><span>${p}%</span><button class="btn small secondary" data-route="lesson${n}">${done ? "다시 보기" : p ? "이어하기" : "시작하기"}</button></div></article>`;
}

const stepNames = {
  1:["역사 탐험","오늘의 퀴즈","비밀 방탈출","탐험 정리"],
  2:["가사 뜻 배우기","빈칸 채우기","무반주 도전"],
  3:["모둠 작업방","그림 모으기","영상 만들기"]
};
function renderLesson(n) {
  const titles = ["","애국가의 비밀을 찾아서","애국가를 제대로 배워요","우리 반 뮤직비디오"];
  const step = state.lessonStep[n];
  return shell(`<div class="page-title"><div><div class="crumb">탐험 지도 / ${n}차시</div><h1>${titles[n]}</h1><p>${n === 1 ? "역사 속 단서를 따라 애국가의 탄생 과정을 살펴봐요." : n === 2 ? "가사의 뜻을 이해하고 내 목소리로 도전해요." : "직접 그린 그림을 모아 우리만의 영상을 완성해요."}</p></div><button class="btn secondary" data-route="home">← 지도로</button></div>
    <div class="activity-layout"><aside class="panel steps">${stepNames[n].map((s,i)=>`<button class="step ${i===step?"active":""} ${i<step||state.complete[n]?"done":""}" data-step="${i}">${i+1}. ${s}</button>`).join("")}</aside><section class="panel activity">${activity(n,step)}</section></div>`, `lesson${n}`);
}
function activity(n, step) {
  if (n === 1) return [historyView, quizView, escapeView, lessonOneEnd][step]();
  if (n === 2) return [meaningView, blankView, singingView][step]();
  return [roomView, drawingView, videoView][step]();
}
function nextButton(n, label="다음 활동") { return `<div class="button-row" style="margin-top:24px"><button class="btn primary" data-next="${n}">${label} →</button></div>`; }
function historyView() { return `<h2>🎼 한 노래에 담긴 긴 시간</h2><p class="lead">애국가는 나라를 사랑하는 마음을 담아 함께 부르는 노래예요. 오늘은 확인된 사실과 아직 여러 견해가 있는 이야기를 구분하며 살펴봅니다.</p><div class="story-box"><h3>먼저 기억할 세 가지</h3><div class="timeline"><div class="fact"><b>① 가사의 시작</b><p>애국가 가사는 19세기 말부터 불렸으며 정확한 작사자는 확정되지 않았어요.</p></div><div class="fact"><b>② 새로운 선율</b><p>안익태가 작곡한 선율이 1930년대 후반부터 널리 불리기 시작했어요.</p></div><div class="fact"><b>③ 함께 부르는 노래</b><p>광복 이후 국가 행사와 학교에서 지금의 애국가를 함께 불러 왔어요.</p></div></div></div><p class="feedback ok">💡 역사에서는 ‘모르는 것을 모른다고 말하는 태도’도 중요해요.</p>${nextButton(1,"퀴즈 풀기")}`; }
function quizView() {
  const answered = state.quizAnswer !== null, correct = state.quizAnswer === 1;
  return `<h2>🧭 오늘의 역사 퀴즈</h2><p class="lead">애국가에 관한 설명으로 알맞은 것을 골라 보세요.</p>${["애국가의 작사자는 역사 자료로 완전히 확정되었다.","현재 널리 부르는 선율은 안익태가 작곡했다.","애국가는 2000년대에 처음 만들어졌다."].map((x,i)=>`<button class="quiz-option ${state.quizAnswer===i?"selected":""}" data-quiz="${i}" ${answered?"disabled":""}>${i+1}. ${x}</button>`).join("")}${answered?`<div class="feedback ${correct?"ok":"no"}">${correct?"정답이에요! 안익태가 작곡한 선율은 1930년대 후반부터 널리 불렸어요.":"조금 아쉬워요. 작사자는 확정되지 않았고 현재의 선율은 안익태가 작곡했어요."}</div>${nextButton(1,"방탈출 입장")}`:""}`;
}
const ESCAPE_ROOMS = [
  { icon:"📰",year:"1896",title:"신문방",certainty:"resolved",fact:"『독립신문』에는 서로 다른 여러 애국가 가사가 실렸어요.",prompt:"흩어진 기사 조각을 살펴봤어요. 가장 바른 기록은 무엇일까요?",choices:["처음부터 완성된 애국가 하나만 있었다","여러 종류의 애국가 가사가 있었다","당시에는 애국가라는 말이 없었다"],answer:1,artifact:"1896 신문 조각",hints:["날짜와 기사 제목을 함께 보세요.","기사 조각들의 가사가 서로 달라요.","정답에는 ‘여러’라는 말이 들어가요."]},
  { icon:"🎼",year:"1902",title:"황실악보실",certainty:"resolved",fact:"대한제국은 지금의 애국가와 다른 ‘대한제국 애국가’를 사용했어요.",prompt:"악보 표지에 붙일 올바른 작곡가 이름표를 골라 주세요.",choices:["안익태","프란츠 에케르트","작곡자 미상"],answer:1,artifact:"대한제국 악보",hints:["독일인 음악가가 만든 곡이에요.","이름은 ‘에’로 시작해요.","프란츠 에케르트를 선택하세요."]},
  { icon:"📚",year:"1905/1908",title:"찬미가서가",certainty:"contested",fact:"『찬미가』의 발행 연도는 자료에 따라 1905년 또는 1908년으로 적혀 있어요.",prompt:"서로 다른 두 기록을 발견했어요. 기록수호자는 어떻게 해야 할까요?",choices:["1905년만 무조건 맞다고 한다","1908년만 무조건 맞다고 한다","두 기록이 있음을 함께 표시한다"],answer:2,artifact:"두 갈래 연도표",flag:"acceptedUncertaintyChanmiga",penalty:8,hints:["한 기록을 지워 버리면 될까요?","역사 자료는 서로 다를 수도 있어요.","‘두 기록이 있음’을 인정하세요."]},
  { icon:"🎻",year:"독립운동기",title:"곡조복도",certainty:"resolved",fact:"현재 가사는 한동안 스코틀랜드 민요 곡조에 맞춰 불렸어요.",prompt:"옛 애국가 가사 카드와 연결할 곡조는 무엇일까요?",choices:["아리랑","Auld Lang Syne(올드 랭 사인)","도라지타령"],answer:1,artifact:"옛 곡조 음표",hints:["스코틀랜드에서 온 곡조예요.","영어 이름의 곡을 찾아보세요.","Auld Lang Syne을 선택하세요."]},
  { icon:"🎹",year:"1935",title:"새 선율 연구실",certainty:"resolved",fact:"안익태는 우리 가사에 맞는 새로운 애국가 곡을 작곡했어요.",prompt:"새 선율 기록 카드의 빈칸을 완성해 주세요.",choices:["1935년 · 안익태 · 새 곡","1902년 · 에케르트 · 현행곡","1948년 · 작곡자 미상 · 새 곡"],answer:0,artifact:"1935 새 선율",hints:["현재 선율의 작곡자를 떠올려 보세요.","연도는 1930년대예요.","1935년 · 안익태 · 새 곡이에요."]},
  { icon:"📜",year:"1941",title:"임시정부 승인실",certainty:"resolved",fact:"대한민국 임시정부는 1941년 공보로 새 곡보의 사용 허가를 알렸어요. 이후 1942년 음반과 1945년 충칭판 악보로도 이어졌어요.",prompt:"1941년 공보 문서에 찍어야 할 도장은 무엇일까요?",choices:["사용 금지","사용 허가","기록 폐기"],answer:1,artifact:"임시정부 허가 도장",hints:["새 곡을 쓸 수 있게 하는 도장이에요.","금지의 반대말을 찾아보세요.","‘사용 허가’ 도장이 정답이에요."]},
  { icon:"🏫",year:"1948",title:"교과서 배포실",certainty:"resolved",fact:"정부 수립 이후 애국가는 학교와 공식 행사를 통해 전국에 널리 퍼졌어요.",prompt:"애국가 기록 상자를 어디로 보내야 전국에 널리 전해질까요?",choices:["학교와 공식 행사장","한 사람의 집","외국의 박물관만"],answer:0,artifact:"전국 보급 지도",hints:["많은 어린이와 시민이 모이는 곳이에요.","배움과 국가 행사가 열리는 두 곳이에요.","학교와 공식 행사장을 선택하세요."]},
  { icon:"🔎",year:"1955",title:"조사위원회실",certainty:"unresolved",fact:"1955년 작사자 조사가 있었지만 결정적인 자료가 부족해 결론을 내리지 못했어요.",prompt:"작사자 기록 카드에는 무엇이라고 써야 할까요?",choices:["윤치호로 확정","안창호로 확정","아직 확정되지 않음"],answer:2,artifact:"열린 의문 노트",flag:"acceptedUnresolvedLyricist",penalty:8,hints:["조사는 했지만 결론은 나오지 않았어요.","사람 이름보다 자료가 충분한지 생각하세요.","정답은 한 사람의 이름이 아니에요."]}
];
function currentEscapeGame(){
  const base=structuredClone(defaults.escapeGame);state.escapeGame={...base,...state.escapeGame,flags:{...base.flags,...state.escapeGame?.flags}};return state.escapeGame;
}
function escapeScore(game){return Math.max(10,Math.min(20,20-game.hintsUsed))}
function escapeEnding(game){if(game.flags.acceptedUncertaintyChanmiga&&game.flags.acceptedUnresolvedLyricist)return["열린 역사 탐정","정답뿐 아니라 기록의 차이와 모르는 사실까지 존중했어요.","🔎"];if(escapeScore(game)>=18&&game.historicalTrust>=80)return["기록수호자","흩어진 기록을 정확하게 이어 시간보관소를 지켰어요.","🏛️"];return["배운 탐험가","도움을 받아 기록을 복원하며 중요한 역사를 배웠어요.","🧭"]}
function escapeView() {
  const game=currentEscapeGame();
  if(!game.started)return `<div class="escape-intro"><div class="archive-door">⌛</div><span class="eyebrow">15분 기록 복원 작전</span><h2>시간보관소와 사라진 애국가 기록</h2><p class="lead">큰일 났어요! 애국가 역사 기록이 여덟 개의 방으로 흩어졌어요. 기록도우미 한별과 함께 조각을 모아 연표문을 다시 열어 주세요.</p><div class="story-box"><b>기록수호자의 약속</b><p>기록이 서로 다르면 차이를 인정하고, 확실하지 않은 사실은 억지로 단정하지 않아요.</p></div><button class="btn primary" data-action="start-escape">기록 복원 시작 →</button></div>`;
  if(game.roomIndex>=ESCAPE_ROOMS.length){const ending=escapeEnding(game),score=escapeScore(game);return `<div class="escape-ending"><div style="font-size:76px">${ending[2]}</div><span class="eyebrow">${score}/20점 · 기록 신뢰도 ${game.historicalTrust}</span><h2>${ending[0]} 엔딩</h2><p class="lead">${ending[1]}</p><div class="artifact-shelf">${game.artifacts.map(x=>`<span class="artifact-chip">✓ ${x}</span>`).join("")}</div><div class="story-box"><h3>오늘 복원한 세 가지 기록</h3><p>① 애국가는 여러 기록을 거쳐 형성되었어요.<br>② 옛날에는 지금과 다른 곡조로도 불렀어요.<br>③ 작사자는 아직 확정되지 않았어요.</p></div>${nextButton(1,"탐험 정리")}</div>`}
  const room=ESCAPE_ROOMS[game.roomIndex];const certainty=room.certainty==="contested"?"자료마다 달라요":room.certainty==="unresolved"?"아직 확정되지 않았어요":"확인된 기록";
  return `<div class="escape-hud"><span>⏱ <b id="escape-time">15:00</b></span><span>기록 조각 <b>${game.artifacts.length}/8</b></span><span>신뢰도 <b>${game.historicalTrust}</b></span><button class="btn small secondary" data-action="reset-escape">처음부터</button></div><div class="escape-progress"><i style="width:${(game.roomIndex+1)/ESCAPE_ROOMS.length*100}%"></i></div><div class="room-scene"><div class="room-icon">${room.icon}</div><div><span class="badge ${room.certainty==="resolved"?"skilled":"expert"}">${room.year} · ${certainty}</span><h2>${game.roomIndex+1}번째 방 · ${room.title}</h2><p class="lead">${room.prompt}</p></div></div><div class="fact-note"><b>📎 복원할 기록</b><p>${room.fact}</p></div><div class="escape-choices">${room.choices.map((choice,i)=>`<button class="quiz-option" data-escape-choice="${i}" ${game.roomSolved?"disabled":""}>${i+1}. ${choice}</button>`).join("")}</div>${game.hintLevel?`<div class="feedback no">💡 힌트 ${game.hintLevel}: ${room.hints[game.hintLevel-1]}</div>`:""}${game.feedback?`<div class="feedback ${game.feedback.ok?"ok":"no"}">${game.feedback.text}</div>`:""}<div class="button-row"><button class="btn secondary" data-action="escape-hint" ${game.roomSolved||game.hintLevel>=3?"disabled":""}>힌트 보기 (${game.hintLevel}/3)</button>${game.roomSolved?`<button class="btn primary" data-action="next-escape-room">${game.roomIndex===ESCAPE_ROOMS.length-1?"연표문 열기":"다음 기록방"} →</button>`:""}</div><div class="artifact-shelf">${game.artifacts.map(x=>`<span class="artifact-chip">${x}</span>`).join("")}</div>`;
}
function lessonOneEnd(){return `<div class="empty"><div style="font-size:70px">🏛️</div><h2>1차시 탐험 완료!</h2><p class="lead">애국가는 여러 시대를 지나며 우리와 함께한 노래라는 것을 발견했어요.</p><button class="btn primary" data-complete="1">완료하고 지도 보기</button></div>`}
function meaningView(){return `<h2>🌲 가사 속 낱말 돋보기</h2><p class="lead">지금은 자주 쓰지 않는 낱말에도 아름다운 뜻이 숨어 있어요.</p><div class="meaning-grid"><div class="meaning"><strong>동해물</strong><p>우리나라 동쪽에 있는 바다의 물을 뜻해요.</p></div><div class="meaning"><strong>백두산</strong><p>한반도 북쪽에 있는 높고 상징적인 산이에요.</p></div><div class="meaning"><strong>보우하사</strong><p>보살펴 도와주시기를 바란다는 뜻이에요.</p></div><div class="meaning"><strong>무궁화</strong><p>오랫동안 피고 또 피어 끈기를 떠올리게 하는 꽃이에요.</p></div></div>${nextButton(2,"빈칸 도전")}`}
function blankView(){return `<h2>✏️ 가사를 완성해요</h2><p class="lead">알맞은 낱말을 입력하고 ‘채점하기’를 눌러 보세요.</p><div class="lyrics">동해물과 <input class="blank" id="blank1" aria-label="첫 번째 빈칸">이 마르고 닳도록<br>하느님이 보우하사 우리나라 만세<br><input class="blank" id="blank2" aria-label="두 번째 빈칸"> 삼천리 화려 강산<br>대한 사람 대한으로 길이 보전하세</div><div class="button-row" style="margin-top:20px"><button class="btn primary" data-action="check-blanks">채점하기</button></div><div id="blank-feedback"></div>`}
function singingView(){
  const score = state.singingScore;
  const mode=serviceConfig.transcriptionConfigured?`서버 AI 전사 · ${serviceConfig.transcriptionModel}`:"브라우저 음성 인식 체험";
  return `<h2>🎙️ 무반주 가사 도전</h2><p class="lead">화면의 구간을 반주 없이 불러 보세요. 음성은 가사 확인 직후 저장하지 않고 바로 사라져요.</p><span class="badge ${serviceConfig.transcriptionConfigured?"expert":"pioneer"}">${mode}</span><div class="story-box"><b>도전 구간 · 1절 후렴</b><p style="font-size:21px;margin-bottom:0">무궁화 삼천리 화려 강산<br>대한 사람 대한으로 길이 보전하세</p></div><div class="record"><button class="mic" data-action="record" aria-label="녹음 시작">🎙</button><p id="record-status">버튼을 누르고 노래해 주세요.</p><div class="transcript" id="transcript">${state.transcript || "인식된 가사가 여기에 표시됩니다."}</div>${score?`<div class="score-ring" style="--score:${Math.round(score/25*100)}"><b>${score}/25</b></div><div class="feedback ok">가사 정확도를 확인했어요. 다시 도전하면 높은 점수가 저장돼요.</div><button class="btn primary" data-complete="2">2차시 완료하기</button>`:`<p style="color:#7a8791">마이크를 사용할 수 없는 환경에서는 아래 체험 버튼을 사용할 수 있어요.</p><button class="btn secondary" data-action="demo-speech">음성 인식 체험 결과 보기</button>`}</div>`;
}
function roomView(){return `<h2>👥 ${state.group.name}</h2><div class="room-head"><div><b>모둠 코드 · MGH-03</b><div style="color:#698075;margin-top:4px">${state.group.members.join(" · ")}</div></div><span class="badge pioneer">4명 참여</span></div><div class="story-box"><h3>오늘의 미션</h3><p>애국가 가사에서 떠오르는 장면을 각자 한 장 이상 그려 보세요. 산, 바다, 무궁화, 우리 동네처럼 자유롭게 표현해도 좋아요.</p></div>${nextButton(3,"그림 모으기")}`}
function drawingView(){return `<h2>🖼️ 우리가 그린 애국가</h2><p class="lead">종이에 그린 그림을 촬영하거나 디지털 그림 파일을 올려 주세요.</p><label class="upload"><div style="font-size:42px">☁️</div><b>그림 파일을 선택해요</b><p>JPG, PNG, HEIC · 여러 장 선택 가능</p><input id="drawing-input" type="file" accept="image/jpeg,image/png,image/heic" multiple hidden><span class="btn secondary">파일 선택</span></label><div class="gallery">${drawings.length?drawings.map((x,i)=>`<div class="drawing"><img src="${x.url}" alt="업로드한 그림 ${i+1}"><button data-remove-drawing="${i}" aria-label="그림 삭제">×</button></div>`).join(""):`<div class="empty" style="grid-column:1/-1">아직 모인 그림이 없어요.</div>`}</div>${drawings.length?nextButton(3,"영상 만들기"):""}`}
function videoView(){
  const processing=videoJob&&["queued","processing"].includes(videoJob.status), completed=videoJob?.status==="completed";
  return `<h2>🎬 뮤직비디오 만들기</h2><p class="lead">미리보기를 확인한 뒤 서버에서 실제 MP4 영상을 생성해요.</p><span class="badge ${serviceConfig.audioConfigured?"expert":"pioneer"}">${serviceConfig.audioConfigured?"애국가 음원 연결됨":"무음 렌더링 모드"}</span><div class="video-preview" id="video-preview">${drawings.length?`<img id="slide-image" src="${drawings[0].url}" alt="뮤직비디오 그림"><div class="video-caption" id="slide-caption">동해물과 백두산이 마르고 닳도록</div>`:`<div>그림을 먼저 업로드해 주세요.</div>`}</div>${processing?`<div class="story-box"><b>영상 생성 중 · ${videoJob.progress}%</b><div class="progress"><i style="width:${videoJob.progress}%"></i></div><p>그림 원본은 렌더링이 끝나면 서버에서 자동으로 제거됩니다.</p></div>`:""}${videoJob?.status==="failed"?`<div class="feedback no">${videoJob.error} 다시 시도해 주세요.</div>`:""}${completed?`<div class="feedback ok">MP4 영상이 완성되었어요! · ${videoJob.soundtrack==="aegukga"?"애국가 음원 포함":"무음 버전"}</div><div class="story-box"><b>Padlet 게시 제목</b><p>${videoJob.padletTitle}</p><b>소개 문구</b><p>${videoJob.padletDescription}</p></div>`:""}<div class="button-row" style="margin-top:20px"><button class="btn secondary" data-action="restart-video">미리보기 다시 보기</button>${completed?`<a class="btn primary" href="${videoJob.downloadUrl}" download>MP4 다운로드</a><button class="btn coral" data-complete="3">3차시 완료하기</button>`:`<button class="btn primary" data-action="render-video" ${!drawings.length||processing?"disabled":""}>${processing?"영상 만드는 중…":"MP4 영상 생성"}</button>`}</div><p style="color:#7b8790;font-size:14px">사용 권리가 확인된 음원을 설정하면 같은 렌더러가 자동으로 영상에 포함합니다.</p>`
}

function renderTeacher(){
  const data = dashboardData || { students:[], average:0, completionRate:0, class:{name:state.user.className} };
  const rows = data.students.map(s => { const g=grade(s.score); return `<tr><td><b>${s.name}</b></td><td>${s.completed}/3</td><td>${s.score}</td><td><span class="badge ${g[1]}">${s.grade}</span></td></tr>` }).join("");
  const needsHelp = data.students.filter(s => s.completed < 2).length;
  return shell(`<div class="page-title"><div><div class="crumb">교사용 · 서버 데이터</div><h1>${data.class.name} 수업 현황</h1><p>학생 활동 진행률과 AI 평가 결과를 한눈에 확인합니다.</p></div><button class="btn primary" data-action="export-csv">성적 CSV 받기</button></div><div class="stats" style="margin-bottom:20px"><div class="stat"><b>${data.students.length}명</b><span>참여 학생</span></div><div class="stat"><b>${data.completionRate}%</b><span>평균 진행률</span></div><div class="stat"><b>${data.average}점</b><span>학급 평균</span></div><div class="stat"><b>${needsHelp}명</b><span>도움이 필요해요</span></div></div><div class="dashboard"><section class="panel"><h2>학생별 진행 현황</h2><table class="score-table"><thead><tr><th>이름</th><th>진행</th><th>점수</th><th>등급</th></tr></thead><tbody>${rows || `<tr><td colspan="4">서버 데이터를 불러오는 중입니다.</td></tr>`}</tbody></table></section><aside class="panel"><h2>오늘의 수업</h2><p class="lead">2차시 · 애국가를 제대로 배워요</p><div class="story-box"><b>음성 평가 원칙</b><p>음성 파일은 저장하지 않으며 전사 결과와 점수만 남습니다.</p></div><button class="btn secondary" style="width:100%" data-action="refresh-dashboard">서버 데이터 새로고침</button><button class="btn secondary" style="width:100%;margin-top:8px" data-action="reset-demo">내 데모 기록 초기화</button></aside></div>`,"teacher");
}
function renderCertificate(){
  const score=total(), g=grade(score), ready=Object.values(state.complete).every(Boolean);
  return shell(`<div class="page-title"><div><div class="crumb">나의 성취</div><h1>애국가 탐험 기록</h1><p>${ready?"세 차시를 모두 마치고 멋진 인증서를 받았어요!":"세 차시를 모두 완료하면 인증서가 열려요."}</p></div><button class="btn secondary" data-route="home">탐험 지도로</button></div><section class="panel"><div class="stats"><div class="stat"><b>${score}</b><span>총점 / 100</span></div><div class="stat"><b>${state.scores.history+state.scores.escape}</b><span>역사 탐험 / 35</span></div><div class="stat"><b>${state.scores.meaning+state.scores.blanks+state.scores.singing}</b><span>가사 탐구 / 55</span></div><div class="stat"><b>${g[0]}</b><span>현재 등급</span></div></div>${ready?`<div class="certificate" id="certificate"><div class="cert-seal">${g[2]}</div><div><small>AEGUKGA EXPLORER</small><h2>애국가 ${g[0]} 인증서</h2><p><b>${state.user.name}</b> 학생은 애국가 탐험 3차시를 멋지게 완주했습니다.</p><small>${new Date().toLocaleDateString("ko-KR")} · ${state.user.className}</small></div></div><div class="button-row" style="justify-content:center"><button class="btn primary" data-action="download-cert">인증서 이미지 저장</button></div>`:`<div class="empty"><div style="font-size:65px">🔒</div><h2>${Object.values(state.complete).filter(Boolean).length}/3차시 완료</h2><button class="btn primary" data-route="lesson${nextLesson()}">탐험 이어하기</button></div>`}</section>`,"certificate");
}

function bindPage(){
  document.querySelectorAll("[data-route]").forEach(b=>b.onclick=()=>{state.route=b.dataset.route;render()});
  document.querySelectorAll("[data-step]").forEach(b=>b.onclick=()=>{const n=Number(state.route.at(-1));state.lessonStep[n]=Number(b.dataset.step);save();render()});
  document.querySelectorAll("[data-next]").forEach(b=>b.onclick=()=>{const n=Number(b.dataset.next);state.lessonStep[n]++;if(n===1&&state.lessonStep[n]===2){state.scores.history=Math.max(state.scores.history,state.quizAnswer===1?15:10)}if(n===2&&state.lessonStep[n]===1)state.scores.meaning=15;save();render()});
  document.querySelectorAll("[data-complete]").forEach(b=>b.onclick=()=>{const n=Number(b.dataset.complete);state.complete[n]=true;if(n===3)state.scores.video=10;save();toast(`${n}차시를 완료했어요!`);state.route=n===3?"certificate":"home";render()});
  document.querySelectorAll("[data-quiz]").forEach(b=>b.onclick=()=>{state.quizAnswer=Number(b.dataset.quiz);save();render()});
  const startEscape=$("[data-action='start-escape']");if(startEscape)startEscape.onclick=()=>{state.escapeGame={...structuredClone(defaults.escapeGame),started:true,startedAt:Date.now()};state.scores.escape=0;save();render()};
  const resetEscape=$("[data-action='reset-escape']");if(resetEscape)resetEscape.onclick=()=>{state.escapeGame=structuredClone(defaults.escapeGame);state.scores.escape=0;save();render()};
  document.querySelectorAll("[data-escape-choice]").forEach(b=>b.onclick=()=>answerEscape(Number(b.dataset.escapeChoice)));
  const escapeHint=$("[data-action='escape-hint']");if(escapeHint)escapeHint.onclick=()=>{const game=currentEscapeGame();game.hintLevel=Math.min(3,game.hintLevel+1);game.hintsUsed++;save();render()};
  const nextEscape=$("[data-action='next-escape-room']");if(nextEscape)nextEscape.onclick=()=>{const game=currentEscapeGame();game.roomIndex++;game.roomSolved=false;game.feedback=null;game.hintLevel=0;if(game.roomIndex>=ESCAPE_ROOMS.length)state.scores.escape=escapeScore(game);save();render()};
  const blanks=$("[data-action='check-blanks']");if(blanks)blanks.onclick=checkBlanks;
  const record=$("[data-action='record']");if(record)record.onclick=startRecording;
  const demo=$("[data-action='demo-speech']");if(demo)demo.onclick=()=>finishSpeech("무궁화 삼천리 화려 강산 대한 사람 대한으로 길이 보전하세");
  const input=$("#drawing-input");if(input)input.onchange=handleDrawings;
  document.querySelectorAll("[data-remove-drawing]").forEach(b=>b.onclick=()=>{drawings.splice(Number(b.dataset.removeDrawing),1);render()});
  if(state.route==="lesson3"&&state.lessonStep[3]===2)startSlideshow();
  const restart=$("[data-action='restart-video']");if(restart)restart.onclick=startSlideshow;
  const renderVideo=$("[data-action='render-video']");if(renderVideo)renderVideo.onclick=createVideo;
  const csv=$("[data-action='export-csv']");if(csv)csv.onclick=exportCsv;
  const refresh=$("[data-action='refresh-dashboard']");if(refresh)refresh.onclick=()=>loadDashboard(true);
  const reset=$("[data-action='reset-demo']");if(reset)reset.onclick=()=>{localStorage.removeItem(STORAGE);state=structuredClone(defaults);drawings=[];save();toast("데모 기록을 초기화했어요.");render()};
  const cert=$("[data-action='download-cert']");if(cert)cert.onclick=downloadCertificate;
  if(state.route==="lesson1"&&state.lessonStep[1]===2&&state.escapeGame?.started&&state.escapeGame.roomIndex<ESCAPE_ROOMS.length)startEscapeClock();
}
function answerEscape(choice){
  const game=currentEscapeGame(),room=ESCAPE_ROOMS[game.roomIndex];if(game.roomSolved)return;
  if(choice===room.answer){game.roomSolved=true;game.score+=2;game.artifacts.push(room.artifact);if(room.flag)game.flags[room.flag]=true;game.feedback={ok:true,text:`기록 복원 성공! ‘${room.artifact}’ 조각을 찾았어요.`}}
  else{game.mistakeCount++;game.historicalTrust=Math.max(0,game.historicalTrust-(room.penalty||5));game.feedback={ok:false,text:room.certainty==="contested"||room.certainty==="unresolved"?"한 가지 답을 억지로 정하지 말고 기록의 차이와 빈틈을 다시 살펴보세요.":"시간자물쇠가 열리지 않았어요. 기록 단서를 다시 살펴보세요."}}
  save();render();
}
function startEscapeClock(){
  const update=()=>{const el=$("#escape-time");if(!el)return;const game=currentEscapeGame();const left=Math.max(0,900-Math.floor((Date.now()-game.startedAt)/1000));el.textContent=`${String(Math.floor(left/60)).padStart(2,"0")}:${String(left%60).padStart(2,"0")}`};update();escapeTimer=setInterval(update,1000);
}
function checkBlanks(){
  const a=$("#blank1").value.trim().replaceAll(" ",""), b=$("#blank2").value.trim().replaceAll(" ","");
  const hits=(a==="백두산"?1:0)+(b==="무궁화"?1:0);state.scores.blanks=Math.max(state.scores.blanks,hits===2?15:hits?8:0);save();
  $("#blank-feedback").innerHTML=`<div class="feedback ${hits===2?"ok":"no"}">${hits===2?"모두 정답이에요! 15점을 획득했어요.":`${hits}개를 맞혔어요. 정답은 ‘백두산’, ‘무궁화’예요.`}</div>${hits===2?nextButton(2,"노래 도전"):""}`;bindPage();
}
async function startRecording(){
  if(!serviceConfig.transcriptionConfigured)return startRecognition();
  if(activeRecorder?.state==="recording"){activeRecorder.stop();return}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});activeRecorder=recorder;
    const mic=$(".mic"),status=$("#record-status");mic.classList.add("listening");status.textContent="AI가 들을 음성을 녹음 중이에요. 다시 누르면 끝나요.";
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onstop=async()=>{mic.classList.remove("listening");stream.getTracks().forEach(t=>t.stop());status.textContent="AI가 가사를 확인하고 있어요…";activeRecorder=null;await sendAudio(new Blob(chunks,{type:recorder.mimeType}))};
    recorder.start();setTimeout(()=>{if(recorder.state==="recording")recorder.stop()},15000);
  }catch{toast("마이크를 시작하지 못했어요. 브라우저 권한을 확인해 주세요.")}
}
async function sendAudio(blob){
  const target="무궁화 삼천리 화려 강산 대한 사람 대한으로 길이 보전하세";const form=new FormData();form.append("audio",blob,"singing.webm");form.append("promptSegment",target);
  try{const response=await fetch("/api/transcriptions",{method:"POST",body:form});if(!response.ok)throw new Error("transcription failed");const result=await response.json();state.transcript=result.transcript;state.singingScore=result.score;state.scores.singing=Math.max(state.scores.singing,result.score);save();render()}
  catch{toast("서버 AI 평가에 실패해 브라우저 인식으로 전환합니다.");startRecognition()}
}
function startRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast("이 브라우저는 음성 인식을 지원하지 않아요.");return}
  const r=new SR();r.lang="ko-KR";r.interimResults=true;r.continuous=false;
  const mic=$(".mic"), status=$("#record-status");mic.classList.add("listening");status.textContent="듣고 있어요…";
  r.onresult=e=>{$("#transcript").textContent=Array.from(e.results).map(x=>x[0].transcript).join("")};
  r.onend=()=>{mic.classList.remove("listening");finishSpeech($("#transcript").textContent)};
  r.onerror=()=>{mic.classList.remove("listening");toast("음성을 인식하지 못했어요. 다시 시도해 주세요.")};r.start();
}
function finishSpeech(text){
  const target="무궁화 삼천리 화려 강산 대한 사람 대한으로 길이 보전하세".split(" ");
  const words=text.replace(/[^가-힣 ]/g,"").split(/\s+/);const hit=target.filter(w=>words.some(x=>x.includes(w)||w.includes(x))).length;
  const score=Math.max(5,Math.round(hit/target.length*25));state.transcript=text;state.singingScore=score;state.scores.singing=Math.max(state.scores.singing,score);save();render();
}
function handleDrawings(e){
  [...e.target.files].slice(0,20-drawings.length).forEach(file=>{const reader=new FileReader();reader.onload=()=>{drawings.push({name:file.name,url:reader.result,file});videoJob=null;render()};reader.readAsDataURL(file)});
}
async function createVideo(){
  if(!drawings.length)return; videoJob={status:"queued",progress:5};render();
  const form=new FormData();form.append("groupName",state.group.name);drawings.forEach(x=>form.append("drawings",x.file,x.name));
  try { const response=await fetch("/api/videos",{method:"POST",body:form});if(!response.ok)throw new Error("upload failed");videoJob=await response.json();render();pollVideo(videoJob.id); }
  catch { videoJob={status:"failed",error:"그림 업로드에 실패했습니다."};render(); }
}
async function pollVideo(id){
  try { const response=await fetch(`/api/videos/${id}`);if(!response.ok)throw new Error("poll failed");videoJob=await response.json();render();if(["queued","processing"].includes(videoJob.status))setTimeout(()=>pollVideo(id),800); }
  catch { videoJob={status:"failed",error:"영상 작업 상태를 확인하지 못했습니다."};render(); }
}
function startSlideshow(){
  clearInterval(slideTimer);if(!drawings.length)return;let i=0;const captions=["동해물과 백두산이 마르고 닳도록","하느님이 보우하사 우리나라 만세","무궁화 삼천리 화려 강산","대한 사람 대한으로 길이 보전하세"];
  const show=()=>{const img=$("#slide-image"),cap=$("#slide-caption");if(img){img.src=drawings[i%drawings.length].url;cap.textContent=captions[i%captions.length];i++}};show();slideTimer=setInterval(show,2600);
}
function exportCsv(){
  const students = dashboardData?.students || [];
  const rows=[["이름","완료 차시","총점","등급"],...students.map(s=>[s.name,s.completed,s.score,s.grade])];
  download(new Blob(["\ufeff"+rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"}),"애국가탐험대-성적.csv");
}
function downloadCertificate(){
  const canvas=document.createElement("canvas");canvas.width=1063;canvas.height=591;const c=canvas.getContext("2d"),g=grade();
  c.fillStyle="#fffaf0";c.fillRect(0,0,canvas.width,canvas.height);c.strokeStyle="#b88731";c.lineWidth=18;c.strokeRect(18,18,1027,555);c.lineWidth=3;c.strokeRect(36,36,991,519);
  c.fillStyle="#15375f";c.font="bold 30px sans-serif";c.fillText("AEGUKGA EXPLORER",390,105);c.font="bold 64px sans-serif";c.fillText(`애국가 ${g[0]} 인증서`,360,205);
  c.fillStyle="#6b5e43";c.font="bold 34px sans-serif";c.fillText(state.user.name,360,280);c.font="25px sans-serif";c.fillText("애국가 탐험 3차시를 멋지게 완주했습니다.",360,335);c.fillText(`${new Date().toLocaleDateString("ko-KR")} · ${state.user.className}`,360,405);
  c.beginPath();c.arc(190,290,100,0,Math.PI*2);c.fillStyle=g[1]==="expert"?"#f4c45c":g[1]==="skilled"?"#5798c8":"#4f9a76";c.fill();c.font="90px serif";c.fillText(g[2],142,324);
  canvas.toBlob(blob=>download(blob,`애국가-${g[0]}-${state.user.name}.png`),"image/png");
}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
render();
hydrateServer();
