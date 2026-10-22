import * as S from './store.js';
import * as FX from './fx.js';
import { generate, DRILLS, CMLL_CASES, identifyCmll, solvesCase } from './drills.js';
import { CMLL_SETS } from './cmll.js';
import { CubeView, ORIENTATIONS, COLOR_JA, COLOR_HEX, schemeFor } from './view3d.js';
import { applyAlg, solved } from './cube.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
let tab = 'home';
let quiz = null;
let historyTab = 'calendar';
let selectedDay = S.dayKey();
let chartKey = null;

// 出題モード → 記録のキー(AUF なし / AUF ランダムで記録を分ける)
const drillOf = (cfg) => (cfg.auf === 'random' ? 'cmllAuf' : 'cmll');
const AUF_LABEL = { none: 'AUFなし', random: 'AUFランダム' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmtTime = (ms) => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(2)}秒` : `${Math.floor(s / 60)}分${(s % 60).toFixed(1).padStart(4, '0')}秒`;
};
const accColor = (p) => (p >= 90 ? 'var(--ok)' : p >= 70 ? 'var(--accent)' : 'var(--ng)');

// 練習設定(前回の設定を引き継ぐ)
function practiceCfg() {
  return { auf: 'none', ...(S.get().lastPractice || { drill: 'cmll', sets: [...CMLL_SETS], weak: true, testN: 10 }) };
}

// ---------------- 共通 ----------------
document.getElementById('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  FX.unlockAudio();
  switchTab(b.dataset.tab);
});
document.addEventListener('pointerdown', () => FX.unlockAudio(), { once: true });

function switchTab(t) {
  tab = t;
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  render();
}

function render() {
  document.body.classList.toggle('quiz-mode', !!quiz);
  if (quiz) return;
  window.scrollTo(0, 0);
  if (tab === 'home') renderHome();
  if (tab === 'history') renderHistory();
  if (tab === 'settings') renderSettings();
  if (tab === 'algs') renderAlgs();
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const modalQueue = [];
function showModal(html, onClose) {
  modalQueue.push({ html, onClose });
  if (modalQueue.length === 1) openNextModal();
}
function openNextModal() {
  const m = modalQueue[0];
  if (!m) return;
  modalRoot.innerHTML = `<div class="modal-bg"><div class="modal">${m.html}<button class="btn primary" data-close>OK</button></div></div>`;
  modalRoot.querySelector('[data-close]').onclick = () => {
    modalRoot.innerHTML = '';
    modalQueue.shift();
    if (m.onClose) m.onClose();
    openNextModal();
  };
}

function stampCard(streakDay, todayDone) {
  // 今日が何日目のマスか
  const cur = todayDone ? streakDay : streakDay + 1;
  const cycleStart = Math.floor((cur - 1) / 7) * 7;
  let html = '<div class="stamps">';
  for (let i = 1; i <= 7; i++) {
    const day = cycleStart + i;
    const done = day < cur || (day === cur && todayDone);
    const cls = ['stamp', done ? 'done' : '', day === cur ? 'today' : '', i === 7 ? 'jackpot' : ''].join(' ');
    html += `<div class="${cls}"><b>${day}日</b><span>+${S.stampReward(day)}</span></div>`;
  }
  return html + '</div>';
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'goal') {
      FX.sfxFanfare();
      FX.confetti();
      showModal(`<div class="huge">🔥</div><h3>${ev.streak}日連続 達成!</h3>
        <div class="sub">今日のノルマをクリアしました</div>${stampCard(ev.streak, true)}
        <div class="reward">+${ev.bonus} XP</div>`);
    }
    if (ev.type === 'levelup') {
      FX.sfxFanfare();
      FX.confetti(80);
      showModal(`<div class="huge">⭐</div><h3>レベルアップ!</h3><div class="reward">Lv.${ev.level}</div>`);
    }
    if (ev.type === 'badge') toast(`🏅 バッジ獲得「${ev.badge.name}」`);
  }
}

// ---------------- ホーム ----------------
function renderHome() {
  const d = S.get();
  const lv = S.levelInfo();
  const streak = S.streakNow();
  const t = S.today();
  const todayN = Object.values(t.practice).reduce((a, x) => a + x.n + x.testN, 0);
  const goal = d.settings.dailyGoal;
  const cfg = practiceCfg();
  const setsLabel = cfg.sets.length === CMLL_SETS.length ? '全セット' : cfg.sets.join(' / ');
  const reviewN = d.mistakes.length;
  app.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <div class="row"><div class="lvl"><span>Lv</span><b>${lv.level}</b></div>
        <div style="width:160px"><div class="sub">次のレベルまで ${lv.need - lv.into} XP</div><div class="bar"><i style="width:${pct(lv.into, lv.need)}%"></i></div></div></div>
      <div class="sub" style="text-align:right">累計<br><b style="color:var(--text)">${d.xp} XP</b></div>
    </div>
    <div class="card">
      <div class="streak">
        <div class="flame ${t.goalDone ? '' : 'off'}">🔥</div>
        <div style="flex:1">
          <div class="big">${streak}<span style="font-size:15px"> 日連続</span></div>
          <div class="sub">${t.goalDone ? '今日のノルマ達成済み!' : streak ? 'ノルマ達成で連続記録が伸びます' : 'ノルマ達成で1日目スタート'}(最高 ${d.streak.best} 日)</div>
        </div>
      </div>
      ${stampCard(streak, t.goalDone)}
      <div class="goal-ring">
        <div style="flex:1"><div class="row between sub"><span>今日のノルマ</span><span><b style="color:var(--text)">${Math.min(todayN, goal)}</b> / ${goal} 問</span></div>
        <div class="bar" style="margin-top:4px"><i style="width:${Math.min(100, pct(todayN, goal))}%"></i></div></div>
      </div>
    </div>
    <h2>CMLL のセット</h2>
    <div class="card">
      <div class="row between" style="margin-bottom:12px"><span>出題モード</span>
        <div class="chips" id="aufmode">${Object.entries(AUF_LABEL).map(([k, v]) => `<button class="chip ${cfg.auf === k ? 'on' : ''}" data-auf="${k}">${v}</button>`).join('')}</div></div>
      <div class="sub" style="margin:-4px 0 12px">${cfg.auf === 'random' ? '向きがランダムに変わります。手順の前のAUFも選んで答えます。' : '手順表の手順をそのままかけられる向きで出題します。'}</div>
      <div class="chips" id="sets">${CMLL_SETS.map((s) => `<button class="chip ${cfg.sets.includes(s) ? 'on' : ''}" data-set="${s}">${s}</button>`).join('')}</div>
      <label class="set" style="border:0;padding-bottom:0"><span>苦手なケースを多めに出す<br><span class="sub">正答率が低いケースほど出やすくなります</span></span><input type="checkbox" id="weak" ${cfg.weak ? 'checked' : ''}></label>
    </div>
    <button class="btn primary" id="go-practice">練習スタート<small>CMLL ・ ${AUF_LABEL[cfg.auf]} ・ ${esc(setsLabel)} ・ ${SLOT_NAMES[d.settings.algSlot]}手順</small></button>
    <div class="row" style="gap:10px">
      <button class="btn blue" id="go-test" style="flex:1">⏱ テスト<small>${cfg.testN}問タイムアタック</small></button>
      <button class="btn" id="go-review" style="flex:1" ${reviewN ? '' : 'disabled'}>🔁 復習<small>間違えた問題 ${reviewN}</small></button>
    </div>
    <div class="row" style="justify-content:center;gap:8px" id="testn">
      <span class="sub">テスト問題数</span>${[10, 20, 42].map((n) => `<button class="chip ${cfg.testN === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}
    </div>
  `;
  const update = (patch) => { S.setLastPractice({ ...practiceCfg(), ...patch }); renderHome(); };
  app.querySelector('#sets').onclick = (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const sets = new Set(practiceCfg().sets);
    sets.has(b.dataset.set) ? sets.delete(b.dataset.set) : sets.add(b.dataset.set);
    if (!sets.size) { toast('1つ以上選んでください'); return; }
    update({ sets: CMLL_SETS.filter((s) => sets.has(s)) });
  };
  app.querySelector('#aufmode').onclick = (e) => { const b = e.target.closest('[data-auf]'); if (b) update({ auf: b.dataset.auf }); };
  app.querySelector('#weak').onchange = (e) => update({ weak: e.target.checked });
  app.querySelector('#testn').onclick = (e) => { const b = e.target.closest('[data-n]'); if (b) update({ testN: Number(b.dataset.n) }); };
  app.querySelector('#go-practice').onclick = () => startQuiz('practice');
  app.querySelector('#go-test').onclick = () => startQuiz('test');
  app.querySelector('#go-review').onclick = () => startQuiz('review');
}

// ---------------- クイズ ----------------
// 出題に使う手順(設定で選んだ枠。自分の手順がなければ初期手順)
const SLOT_NAMES = { two: '両手', oh: '片手' };
const algOf = (c) => S.customAlg(c.name, S.get().settings.algSlot) || c.alg;

function genOpts(cfg) {
  return { sets: cfg.sets, stats: cfg.weak ? (S.get().caseStats[drillOf(cfg)] || {}) : null, algOf };
}

function startQuiz(mode) {
  const cfg = practiceCfg();
  quiz = { mode, cfg, drill: drillOf(cfg), idx: 0, correct: 0, combo: 0, maxCombo: 0, xp: 0, answered: false, problems: null, mistakesIds: [] };
  if (mode === 'test') {
    const pool = CMLL_CASES.filter((c) => cfg.sets.includes(c.set));
    const seq = [];
    while (seq.length < cfg.testN) seq.push(...[...pool].sort(() => Math.random() - 0.5));
    quiz.problems = seq.slice(0, cfg.testN).map((c) => generate(quiz.drill, { sets: cfg.sets, forceCase: c.name, algOf }));
    quiz.total = cfg.testN;
    quiz.cfgKey = cfg.sets.length === CMLL_SETS.length ? 'all' : cfg.sets.join(',');
  }
  if (mode === 'review') {
    const ms = S.get().mistakes.slice(0, 20);
    quiz.problems = ms.map((m) => ({ ...m.problem, colors: m.problem.colors.split('').map(Number) }));
    quiz.mistakesIds = ms.map((m) => m.id);
    quiz.total = ms.length;
  }
  render();
  buildQuizView();
  if (mode === 'test') countdown(() => { quiz.startT = performance.now(); tickTimer(); nextProblem(); });
  else nextProblem();
}

function buildQuizView() {
  const title = { practice: '練習', test: 'テスト', review: '復習' }[quiz.mode];
  app.innerHTML = `
    <div class="quiz-top">
      <button class="x" id="quit">✕</button>
      <div style="text-align:center;flex:1"><div style="font-weight:800">${title} ・ ${quiz.mode === 'review' ? 'CMLL' : DRILLS[quiz.drill].full}</div><div class="sub" id="qcount"></div></div>
      ${quiz.mode === 'test' ? '<div class="timer" id="timer">0.00</div>' : '<div class="combo" id="combo"></div>'}
    </div>
    ${quiz.total ? '<div class="progress"><i id="qprog" style="width:0"></i></div>' : ''}
    <div id="scene" class="scene"></div>
    <div class="prompt" id="prompt"></div>
    <div class="aufrow" id="aufrow" hidden>${['', 'U', 'U2', "U'"].map((a) => `<button class="aufbtn" data-auf="${a}">${a || 'なし'}</button>`).join('')}</div>
    <div class="choices" id="choices"></div>
    <div class="feedback" id="feedback"></div>
  `;
  const sceneEl = app.querySelector('#scene');
  quiz.view = new CubeView(sceneEl);
  const s = S.get().settings;
  quiz.view.setScheme(s.up, s.front);
  const tools = document.createElement('div');
  tools.className = 'view-tools';
  tools.innerHTML = '<button data-v="top">上から</button><button data-v="reset">視点リセット</button>';
  tools.addEventListener('pointerdown', (e) => e.stopPropagation());
  tools.onclick = (e) => {
    const v = e.target.dataset.v;
    if (v === 'top') quiz.view.setView(-88, 0, true);
    if (v === 'reset') quiz.view.setView(...DRILLS.cmll.view, true);
  };
  sceneEl.appendChild(tools);
  app.querySelector('#quit').onclick = () => {
    if (quiz.mode === 'test') askConfirm('テストを中断しますか?', 'このテストは記録されません。', '中断する', endQuiz);
    else endQuiz();
  };
  // AUF ランダムでは AUF と手順の両方を選んだ時点で判定する(順番は自由)
  app.querySelector('#choices').onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b || !quiz || quiz.answered) return;
    if (!quiz.current.aufAnswers) { answer(Number(b.dataset.i), b, null); return; }
    quiz.selAlg = Number(b.dataset.i);
    app.querySelectorAll('.choice').forEach((x) => x.classList.toggle('picked', x === b));
    if (quiz.selAuf !== null) answer(quiz.selAlg, b, quiz.selAuf);
  };
  app.querySelector('#aufrow').onclick = (e) => {
    const b = e.target.closest('.aufbtn');
    if (!b || !quiz || quiz.answered) return;
    quiz.selAuf = b.dataset.auf;
    app.querySelectorAll('.aufbtn').forEach((x) => x.classList.toggle('picked', x === b));
    if (quiz.selAlg !== null) answer(quiz.selAlg, app.querySelector(`.choice[data-i="${quiz.selAlg}"]`), quiz.selAuf);
  };
}

function countdown(done) {
  const el = document.createElement('div');
  el.className = 'countdown';
  document.body.appendChild(el);
  let n = 3;
  const step = () => {
    if (n === 0) { el.remove(); done(); return; }
    el.innerHTML = `<span>${n}</span>`;
    FX.sfxTick();
    n--;
    setTimeout(step, 700);
  };
  step();
}

function tickTimer() {
  if (!quiz || quiz.mode !== 'test' || quiz.finished) return;
  const el = document.getElementById('timer');
  if (el && quiz.startT) el.textContent = ((performance.now() - quiz.startT) / 1000).toFixed(2);
  requestAnimationFrame(tickTimer);
}

function nextProblem() {
  if (!quiz) return;
  if (quiz.total && quiz.idx >= quiz.total) { finishQuiz(); return; }
  const p = quiz.problems ? quiz.problems[quiz.idx] : generate(quiz.drill, genOpts(quiz.cfg));
  quiz.current = p;
  quiz.answered = false;
  quiz.selAlg = null;
  quiz.selAuf = null;
  const aufRow = app.querySelector('#aufrow');
  aufRow.hidden = !p.aufAnswers;
  aufRow.querySelectorAll('.aufbtn').forEach((x) => { x.className = 'aufbtn'; });
  quiz.view.setColors(p.colors);
  quiz.view.setView(...DRILLS.cmll.view, quiz.idx > 0);
  app.querySelector('#prompt').textContent = p.prompt;
  app.querySelector('#choices').innerHTML = p.choices.map((c, i) =>
    `<button class="choice" data-i="${i}"><span>${esc(c.label)}</span><small>${esc(c.sub || '')}</small></button>`).join('');
  app.querySelector('#feedback').innerHTML = '';
  const qc = app.querySelector('#qcount');
  qc.textContent = quiz.total ? `${quiz.idx + 1} / ${quiz.total}` : `${quiz.idx + 1}問目 ・ 正解 ${quiz.correct}`;
  const prog = app.querySelector('#qprog');
  if (prog) prog.style.width = `${pct(quiz.idx, quiz.total)}%`;
  updateCombo(false);
}

function updateCombo(pop) {
  const el = app.querySelector('#combo');
  if (!el) return;
  el.textContent = quiz.combo >= 2 ? `${quiz.combo} COMBO` : '';
  if (pop) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}

function answer(i, btn, auf) {
  if (!quiz || quiz.answered) return;
  quiz.answered = true;
  const p = quiz.current;
  app.querySelectorAll('.picked').forEach((x) => x.classList.remove('picked'));
  const aufOk = !p.aufAnswers || p.aufAnswers.includes(auf);
  const ok = i === p.answer && aufOk;
  if (p.aufAnswers) {
    app.querySelectorAll('.aufbtn').forEach((x) => {
      const a = x.dataset.auf;
      if (p.aufAnswers.includes(a)) x.classList.add('correct');
      else if (a === auf) x.classList.add('wrong');
      else x.classList.add('dim');
    });
  }
  const btns = [...app.querySelectorAll('.choice')];
  btns.forEach((b, k) => {
    if (k === p.answer) b.classList.add('correct');
    else if (k === i) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  const flash = document.createElement('div');
  flash.className = `flash ${ok ? 'ok' : 'ng'}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);

  if (ok) { quiz.correct++; quiz.combo++; quiz.maxCombo = Math.max(quiz.maxCombo, quiz.combo); FX.sfxCorrect(quiz.combo); } else { quiz.combo = 0; FX.sfxWrong(); }

  const stored = { ...p, colors: p.colors.join('') };
  const { gained, events } = S.recordAnswer({
    drill: p.drill || quiz.drill, caseKey: p.caseKey, ok, mode: quiz.mode === 'test' ? 'test' : 'practice', combo: quiz.combo,
    problem: ok || quiz.mode === 'review' ? null : stored,
  });
  quiz.xp += gained;
  if (quiz.mode === 'review' && ok) S.removeMistake(quiz.mistakesIds[quiz.idx]);
  const r = btn.getBoundingClientRect();
  if (ok) FX.floatText(`+${gained} XP`, r.left + r.width / 2, r.top - 8);
  updateCombo(ok);
  // テスト中はタイムに影響しないよう、演出は完走後にまとめて出す
  if (quiz.mode === 'test') quiz.pending = [...(quiz.pending || []), ...events];
  else handleEvents(events);
  quiz.idx++;

  if (quiz.mode === 'test') {
    setTimeout(nextProblem, ok ? 220 : 650);
    return;
  }
  const fb = app.querySelector('#feedback');
  fb.innerHTML = `<div class="row between"><div><div class="res ${ok ? 'ok' : 'ng'}">${ok ? (quiz.combo >= 3 ? `正解!🔥×${quiz.combo}` : '正解!') : i === p.answer ? '手順は正解、AUFが違います' : '不正解…'}</div>
    <div class="sub mono">${esc(p.explain)}</div></div>
    ${ok && S.get().settings.autoNext ? '' : '<button class="btn primary" id="next" style="width:auto;padding:12px 22px;margin:0">次へ</button>'}</div>
    <details class="scr"><summary>この盤面の作り方(スクランブル)</summary><div class="mono">${esc(p.scramble)}</div></details>`;
  if (ok && S.get().settings.autoNext) {
    setTimeout(() => { if (quiz && !modalQueue.length) nextProblem(); else if (quiz) afterModals(nextProblem); }, 800);
  } else {
    fb.querySelector('#next').onclick = nextProblem;
  }
}

function afterModals(fn) {
  const wait = () => (modalQueue.length ? setTimeout(wait, 200) : fn());
  wait();
}

function finishQuiz() {
  if (quiz.mode === 'test') {
    quiz.finished = true;
    const timeMs = performance.now() - quiz.startT;
    const { pb, prev, events } = S.recordTest({ drill: quiz.drill, cfg: quiz.cfgKey, n: quiz.total, correct: quiz.correct, timeMs });
    renderResult({ timeMs, pb, prev });
    afterModals(() => {
      if (pb) { FX.sfxFanfare(); FX.confetti(); }
      handleEvents([...(quiz && quiz.pending ? quiz.pending : []), ...events]);
    });
    return;
  }
  if (quiz.mode === 'review') {
    renderResult({});
  }
}

function renderResult({ timeMs, pb, prev }) {
  const q = quiz;
  const acc = pct(q.correct, q.total);
  app.innerHTML = `
    <h1>${q.mode === 'test' ? 'テスト結果' : '復習おわり'}</h1>
    <div class="card" style="text-align:center">
      ${timeMs ? `<div class="sub">完走タイム</div><div class="big" style="font-size:44px">${fmtTime(timeMs)}</div>
      ${pb ? '<div class="reward" style="color:var(--accent);font-weight:900;font-size:22px">🏆 自己ベスト更新!</div>' : ''}
      <div class="sub">${prev ? `これまでのベスト ${fmtTime(prev.timeMs)}` : ''}${!pb && acc < 90 ? '(自己ベストは正答率90%以上が対象)' : ''}</div>` : ''}
      <div class="row" style="justify-content:space-around;margin-top:14px">
        <div><div class="sub">正答率</div><div class="big" style="color:${accColor(acc)}">${acc}%</div></div>
        <div><div class="sub">正解</div><div class="big">${q.correct}/${q.total}</div></div>
        <div><div class="sub">獲得</div><div class="big" style="color:var(--accent)">+${q.xp}</div></div>
      </div>
    </div>
    ${q.mode === 'test' ? '<button class="btn primary" id="again">もう一度挑戦</button>' : ''}
    <button class="btn" id="home">ホームへ</button>
  `;
  const again = app.querySelector('#again');
  if (again) again.onclick = () => startQuiz('test');
  app.querySelector('#home').onclick = endQuiz;
}

function endQuiz() {
  const q = quiz;
  quiz = null;
  if (q && q.mode === 'practice' && q.idx > 0) toast(`おつかれさま!${q.idx}問 ・ 正答率${pct(q.correct, q.idx)}% ・ +${q.xp} XP`);
  render();
}

// ---------------- 記録 ----------------
function renderHistory() {
  const tabs = { calendar: '日別', tests: 'テスト', cases: 'ケース別', review: '復習', badges: 'バッジ' };
  app.innerHTML = `<h1>記録</h1><div class="seg">${Object.entries(tabs).map(([k, v]) => `<button data-h="${k}" class="${historyTab === k ? 'on' : ''}">${v}</button>`).join('')}</div><div id="hbody"></div>`;
  app.querySelector('.seg').onclick = (e) => { const b = e.target.closest('[data-h]'); if (b) { historyTab = b.dataset.h; renderHistory(); } };
  const body = app.querySelector('#hbody');
  ({ calendar: histCalendar, tests: histTests, cases: histCases, review: histReview, badges: histBadges })[historyTab](body);
}

function dayTotal(d) {
  if (!d) return { n: 0, c: 0 };
  return Object.values(d.practice).reduce((a, x) => ({ n: a.n + x.n + x.testN, c: a.c + x.correct + x.testCorrect }), { n: 0, c: 0 });
}

function histCalendar(body) {
  const data = S.get();
  const todayK = S.dayKey();
  const now = new Date();
  const weeks = 17;
  const start = S.addDays(todayK, -(weeks - 1) * 7 - now.getDay());
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const k = S.addDays(start, i);
    if (k > todayK) { cells += '<i style="visibility:hidden"></i>'; continue; }
    const d = data.days[k];
    const { n } = dayTotal(d);
    const lvl = n === 0 ? '' : n < 10 ? 'l1' : n < 20 ? 'l2' : n < 40 ? 'l3' : 'l4';
    cells += `<i data-d="${k}" class="${lvl} ${d && d.goalDone ? 'goal' : ''} ${k === selectedDay ? 'sel' : ''}"></i>`;
  }
  // 直近 7 日の集計
  let wn = 0, wc = 0, wdays = 0;
  for (let i = 0; i < 7; i++) { const t = dayTotal(data.days[S.addDays(todayK, -i)]); wn += t.n; wc += t.c; if (t.n) wdays++; }
  const sel = data.days[selectedDay];
  const st = dayTotal(sel);
  let detail = '<div class="empty">この日の記録はありません</div>';
  if (sel && (st.n || sel.tests.length)) {
    detail = `<div class="row" style="justify-content:space-around;margin-bottom:8px">
      <div><div class="sub">解いた問題</div><div class="big">${st.n}</div></div>
      <div><div class="sub">正答率</div><div class="big" style="color:${accColor(pct(st.c, st.n))}">${pct(st.c, st.n)}%</div></div>
      <div><div class="sub">獲得XP</div><div class="big">${sel.xp || 0}</div></div></div>
      <table><tr><th>項目</th><th class="r">練習</th><th class="r">正答率</th><th class="r">テスト</th><th class="r">正答率</th></tr>
      ${Object.entries(sel.practice).map(([dr, p]) => `<tr><td>${DRILLS[dr].name}</td><td class="r">${p.n}問</td><td class="r">${p.n ? pct(p.correct, p.n) + '%' : '-'}</td><td class="r">${p.testN}問</td><td class="r">${p.testN ? pct(p.testCorrect, p.testN) + '%' : '-'}</td></tr>`).join('')}
      </table>
      ${sel.tests.length ? `<h2>この日のテスト</h2><table>${sel.tests.map((t) => `<tr><td>${DRILLS[t.drill].name} ${t.n}問 <span class="sub">${t.cfg === 'all' ? '全セット' : esc(t.cfg)}</span></td><td class="r mono">${fmtTime(t.timeMs)}</td><td class="r">${pct(t.correct, t.n)}%</td></tr>`).join('')}</table>` : ''}`;
  }
  body.innerHTML = `
    <div class="card"><div class="row between sub" style="margin-bottom:8px"><span>直近${weeks}週間</span><span>枠つき=ノルマ達成</span></div><div class="heat" id="heat">${cells}</div></div>
    <div class="card"><div class="sub">直近7日間</div><div class="row" style="justify-content:space-around;margin-top:6px">
      <div><div class="sub">練習した日</div><div class="big">${wdays}<span style="font-size:14px">/7</span></div></div>
      <div><div class="sub">問題数</div><div class="big">${wn}</div></div>
      <div><div class="sub">正答率</div><div class="big">${pct(wc, wn)}%</div></div></div></div>
    <h2>${selectedDay.replace(/-/g, '/')}${selectedDay === todayK ? '(今日)' : ''}</h2>
    <div class="card">${detail}</div>`;
  body.querySelector('#heat').onclick = (e) => { const c = e.target.closest('[data-d]'); if (c) { selectedDay = c.dataset.d; renderHistory(); } };
}

function histTests(body) {
  const tests = S.get().tests;
  if (!tests.length) { body.innerHTML = '<div class="empty">まだテストの記録がありません。<br>ホームの「テスト」から挑戦できます。</div>'; return; }
  const keys = [...new Set(tests.map((t) => t.key))];
  if (!chartKey || !keys.includes(chartKey)) chartKey = tests[tests.length - 1].key;
  const label = (k) => { const [dr, cfg, n] = k.split('|'); return `${DRILLS[dr].name} ${n}問 ${cfg === 'all' ? '全セット' : cfg}`; };
  const list = tests.filter((t) => t.key === chartKey);
  const best = S.bestTest(chartKey);
  body.innerHTML = `
    <select id="tkey" style="width:100%;margin-bottom:12px">${keys.map((k) => `<option value="${esc(k)}" ${k === chartKey ? 'selected' : ''}>${esc(label(k))}</option>`).join('')}</select>
    <div class="card"><div class="row between"><div><div class="sub">自己ベスト(正答率90%以上)</div><div class="big">${best ? fmtTime(best.timeMs) : '-'}</div></div>
      <div style="text-align:right"><div class="sub">挑戦回数</div><div class="big">${list.length}</div></div></div>
      ${chartSvg(list)}<div class="sub">線=タイム、点の色=正答率(緑90%以上/黄70%以上/赤)</div></div>
    <div class="card"><table><tr><th>日時</th><th class="r">タイム</th><th class="r">正答率</th></tr>
      ${list.slice().reverse().slice(0, 50).map((t) => `<tr><td>${new Date(t.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${best && t.at === best.at ? ' 🏆' : ''}</td><td class="r mono">${fmtTime(t.timeMs)}</td><td class="r" style="color:${accColor(pct(t.correct, t.n))}">${pct(t.correct, t.n)}%</td></tr>`).join('')}</table></div>`;
  body.querySelector('#tkey').onchange = (e) => { chartKey = e.target.value; renderHistory(); };
}

function chartSvg(list) {
  if (list.length < 2) return '<div class="sub" style="padding:12px 0">2回以上挑戦するとグラフが表示されます</div>';
  const W = 320, H = 150, P = 24;
  const pts = list.slice(-30);
  const times = pts.map((t) => t.timeMs / 1000);
  const max = Math.max(...times), min = Math.min(...times);
  const span = max - min || 1;
  const x = (i) => P + (i * (W - P * 2)) / (pts.length - 1);
  const y = (v) => H - P - ((v - min) / span) * (H - P * 2);
  const path = times.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <text x="2" y="${y(max) + 4}" fill="#9aa3b5" font-size="10">${max.toFixed(1)}s</text>
    <text x="2" y="${y(min) + 4}" fill="#9aa3b5" font-size="10">${min.toFixed(1)}s</text>
    <path d="${path}" fill="none" stroke="#4c8dff" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((t, i) => `<circle cx="${x(i)}" cy="${y(times[i])}" r="4" fill="${accColor(pct(t.correct, t.n))}"/>`).join('')}
  </svg>`;
}

let caseMode = 'cmll';
function histCases(body) {
  const stats = S.get().caseStats[caseMode] || {};
  const rows = CMLL_CASES.map((c) => ({ c, s: stats[c.name] || { n: 0, correct: 0 } }));
  const seen = rows.filter((r) => r.s.n).sort((a, b) => a.s.correct / a.s.n - b.s.correct / b.s.n || b.s.n - a.s.n);
  const unseen = rows.filter((r) => !r.s.n);
  const mastered = rows.filter((r) => r.s.correct > 0).length;
  body.innerHTML = `
    <div class="chips" id="cmode" style="margin-bottom:12px">${[['cmll', 'AUFなし'], ['cmllAuf', 'AUFランダム']].map(([k, v]) => `<button class="chip ${caseMode === k ? 'on' : ''}" data-m="${k}">${v}</button>`).join('')}</div>
    <div class="card row between"><div><div class="sub">正解したことのあるケース</div><div class="big">${mastered}<span style="font-size:14px"> / 42</span></div></div>
      <div class="bar" style="width:120px"><i style="width:${pct(mastered, 42)}%"></i></div></div>
    <div class="card"><div class="sub" style="margin-bottom:6px">正答率の低い順(苦手ケースが上)</div>
    <table><tr><th>セット</th><th>手順</th><th class="r">回数</th><th class="r">正答率</th></tr>
    ${seen.map(({ c, s }) => { const p = pct(s.correct, s.n); return `<tr><td>${c.set}</td><td class="mono" style="font-size:11px">${esc(algOf(c))}</td><td class="r">${s.n}</td><td class="r"><span class="acc-bar"><i style="width:${p}%;background:${accColor(p)}"></i></span> ${p}%</td></tr>`; }).join('')}
    ${unseen.map(({ c }) => `<tr style="opacity:.45"><td>${c.set}</td><td class="mono" style="font-size:11px">${esc(algOf(c))}</td><td class="r">0</td><td class="r">未出題</td></tr>`).join('')}
    </table></div>`;
  body.querySelector('#cmode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { caseMode = b.dataset.m; renderHistory(); } };
}

function histReview(body) {
  const ms = S.get().mistakes;
  if (!ms.length) { body.innerHTML = '<div class="empty">間違えた問題はありません 🎉</div>'; return; }
  body.innerHTML = `
    <button class="btn primary" id="rev">まとめて復習(最大20問)<small>正解すると一覧から消えます</small></button>
    <div class="card">${ms.slice(0, 100).map((m) => `<div class="mistake"><div><b>${DRILLS[m.drill].name}</b> <span class="mono" style="font-size:12px">${esc(m.problem.explain)}</span></div>
      <span class="sub">${new Date(m.at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</span></div>`).join('')}</div>`;
  body.querySelector('#rev').onclick = () => startQuiz('review');
}

function histBadges(body) {
  const got = S.get().badges;
  body.innerHTML = `<div class="badges">${S.BADGES.map((b) => `<div class="badge ${got[b.id] ? '' : 'locked'}">${got[b.id] ? '🏅' : '🔒'} <b>${b.name}</b>${b.desc}</div>`).join('')}</div>`;
}

// ---------------- 手順表 ----------------
let algView = 'two';
let algSetFilter = 'all';

// ケースの上面図(上面+側面の上段。エッジは灰色)
function caseDiagram(c) {
  const st = applyAlg(solved(), c.inv);
  const s = S.get().settings;
  const scheme = schemeFor(s.up, s.front);
  const col = (i) => COLOR_HEX[scheme[st[i]]];
  const gray = '#3a3f4b';
  const U = 18, T = 7, G = 2;
  const o = T + G;
  let out = '';
  const rect = (x, y, w, h, fill) => { out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}"/>`; };
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
    const i = r * 3 + k;
    const corner = r !== 1 && k !== 1;
    rect(o + k * (U + G), o + r * (U + G), U, U, corner || i === 4 ? col(i) : gray);
  }
  const far = o + 3 * (U + G);
  for (let j = 0; j < 3; j++) {
    const corner = j !== 1;
    rect(o + j * (U + G), far, U, T, corner ? col(18 + j) : gray); // F
    rect(o + (2 - j) * (U + G), 0, U, T, corner ? col(45 + j) : gray); // B
    rect(0, o + j * (U + G), T, U, corner ? col(36 + j) : gray); // L
    rect(far, o + (2 - j) * (U + G), T, U, corner ? col(9 + j) : gray); // R
  }
  const size = far + T;
  return `<svg width="62" height="62" viewBox="0 0 ${size} ${size}">${out}</svg>`;
}

function renderAlgs() {
  const slot = S.get().settings.algSlot;
  const cases = CMLL_CASES.filter((c) => algSetFilter === 'all' || c.set === algSetFilter);
  const customN = CMLL_CASES.filter((c) => S.customAlg(c.name, algView)).length;
  app.innerHTML = `<h1>CMLL 手順表</h1>
    <div class="card">
      <div class="row between"><span>出題に使う手順</span>
        <div class="chips" id="slot">${Object.entries(SLOT_NAMES).map(([k, v]) => `<button class="chip ${slot === k ? 'on' : ''}" data-slot="${k}">${v}</button>`).join('')}</div></div>
      <div class="sub" style="margin-top:8px">手順は自由に貼り替えられます。貼り付けた手順は、そのケースが本当に解けるかを自動で確かめます。</div>
    </div>
    <div class="seg" id="aview">${Object.entries(SLOT_NAMES).map(([k, v]) => `<button data-v="${k}" class="${algView === k ? 'on' : ''}">${v}用の手順</button>`).join('')}</div>
    <div class="row between" style="margin-bottom:10px">
      <select id="afilter">${['all', ...CMLL_SETS].map((x) => `<option value="${x}" ${algSetFilter === x ? 'selected' : ''}>${x === 'all' ? '全セット' : x}</option>`).join('')}</select>
      <button class="chip" id="bulk">まとめて貼り付け</button>
    </div>
    <div class="sub" style="margin-bottom:8px">自分の手順: ${customN} / 42 ケース(残りは初期手順)</div>
    <div class="card" style="padding:4px 12px">${cases.map((c) => {
      const mine = S.customAlg(c.name, algView);
      return `<button class="algrow" data-case="${esc(c.name)}">${caseDiagram(c)}
        <div style="flex:1;min-width:0"><div class="sub"><b style="color:var(--text)">${c.set}</b>${mine ? ' ・ <span style="color:var(--accent)">自分の手順</span>' : ' ・ 初期手順'}</div>
        <div class="mono algtext">${esc(mine || c.alg)}</div></div><span class="sub">✎</span></button>`;
    }).join('')}</div>`;
  app.querySelector('#slot').onclick = (e) => { const b = e.target.closest('[data-slot]'); if (b) { S.updateSettings({ algSlot: b.dataset.slot }); renderAlgs(); } };
  app.querySelector('#aview').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { algView = b.dataset.v; renderAlgs(); } };
  app.querySelector('#afilter').onchange = (e) => { algSetFilter = e.target.value; renderAlgs(); };
  app.querySelector('#bulk').onclick = openBulkPaste;
  app.querySelectorAll('.algrow').forEach((b) => { b.onclick = () => openAlgEditor(CMLL_CASES.find((c) => c.name === b.dataset.case)); });
}

function openSheet(html, bind) {
  modalRoot.innerHTML = `<div class="modal-bg"><div class="modal" style="text-align:left">${html}</div></div>`;
  const close = () => { modalRoot.innerHTML = ''; };
  bind(modalRoot.querySelector('.modal'), close);
}

// confirm() はホーム画面アプリや埋め込み表示で使えないことがあるため、画面内で確認する
function askConfirm(title, body, yesLabel, onYes) {
  openSheet(`<h3>${esc(title)}</h3><div class="sub" style="margin-bottom:14px">${esc(body)}</div>
    <button class="btn" id="yes" style="color:var(--ng)">${esc(yesLabel)}</button><button class="btn" id="no">やめる</button>`,
  (el, close) => {
    el.querySelector('#yes').onclick = () => { close(); onYes(); };
    el.querySelector('#no').onclick = close;
  });
}

function openAlgEditor(c) {
  const mine = S.customAlg(c.name, algView);
  openSheet(`<div class="row">${caseDiagram(c)}<div><h3 style="margin:0">${c.set}</h3><div class="sub">${SLOT_NAMES[algView]}用の手順</div></div></div>
    <textarea id="alg" class="algin" rows="3" placeholder="例: R U R' U R U2 R'">${esc(mine || c.alg)}</textarea>
    <div class="sub" id="msg" style="min-height:20px;margin:6px 0 10px">初期手順: <span class="mono">${esc(c.alg)}</span></div>
    <button class="btn primary" id="save">保存</button>
    <div class="row"><button class="btn" id="def" style="flex:1">初期手順に戻す</button><button class="btn" id="cancel" style="flex:1">閉じる</button></div>`,
  (el, close) => {
    const msg = el.querySelector('#msg');
    el.querySelector('#save').onclick = () => {
      const text = el.querySelector('#alg').value.trim();
      const r = identifyCmll(text);
      if (r.error || !solvesCase(c, r.moves)) {
        msg.innerHTML = `<span style="color:var(--ng)">⚠ ${esc(r.error || `このケースではなく ${r.case.set} の別ケースを解く手順です`)}</span>`;
        return;
      }
      S.setCustomAlg(c.name, algView, text === c.alg ? null : text);
      close();
      toast('保存しました');
      renderAlgs();
    };
    el.querySelector('#def').onclick = () => { S.setCustomAlg(c.name, algView, null); close(); renderAlgs(); };
    el.querySelector('#cancel').onclick = close;
  });
}

// 1 行 1 手順で貼り付けると、どのケースの手順かを自動で判定して登録する
function openBulkPaste() {
  openSheet(`<h3>まとめて貼り付け(${SLOT_NAMES[algView]}用)</h3>
    <div class="sub">1行に1手順ずつ貼り付けてください。どのケースの手順かは自動で判定します。順番は自由です。「Pi1: 手順」のようにコロンの前の見出しや、スプレッドシートからのコピー(最後の列を手順として読みます)、括弧も大丈夫です。</div>
    <textarea id="bulkin" class="algin" rows="9" placeholder="R U R' U R U2 R'&#10;F R U R' U' F'&#10;..."></textarea>
    <div id="bulkres" class="sub" style="margin:8px 0;max-height:30vh;overflow:auto"></div>
    <button class="btn primary" id="check">判定して登録</button>
    <button class="btn" id="cancel">閉じる</button>`,
  (el, close) => {
    el.querySelector('#cancel').onclick = () => { close(); renderAlgs(); };
    el.querySelector('#check').onclick = () => {
      const lines = el.querySelector('#bulkin').value.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const done = [], bad = [], seen = new Set();
      for (const line of lines) {
        // 見出し(「Pi 1:」やスプレッドシートの列)を取り除く
        const text = line.split(/[:：\t]/).map((x) => x.trim()).filter(Boolean).pop();
        const r = identifyCmll(text);
        if (r.error) { bad.push(`${line} … ${r.error}`); continue; }
        S.setCustomAlg(r.case.name, algView, text === r.case.alg ? null : text);
        done.push(`${r.case.set}: ${text}${seen.has(r.case.name) ? '(同じケースの前の行を上書き)' : ''}`);
        seen.add(r.case.name);
      }
      el.querySelector('#bulkres').innerHTML = `<div style="color:var(--ok)">${done.length}件 登録しました</div>${done.map((d) => `<div class="mono">✓ ${esc(d)}</div>`).join('')}
        ${bad.length ? `<div style="color:var(--ng);margin-top:6px">${bad.length}件 登録できませんでした</div>${bad.map((d) => `<div class="mono">✗ ${esc(d)}</div>`).join('')}` : ''}`;
      el.querySelector('#bulkin').value = bad.map((b) => b.split(' … ')[0]).join('\n');
    };
  });
}

// ---------------- 設定 ----------------
const COLORS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
function renderSettings() {
  const s = S.get().settings;
  const fronts = COLORS.filter((c) => ORIENTATIONS.has(`${s.up}-${c}`));
  const scheme = ORIENTATIONS.get(`${s.up}-${s.front}`);
  app.innerHTML = `<h1>設定</h1>
    <div class="card">
      <label class="set"><span>上面の色</span><select id="up">${COLORS.map((c) => `<option value="${c}" ${c === s.up ? 'selected' : ''}>${COLOR_JA[c]}</option>`).join('')}</select></label>
      <label class="set"><span>前面の色</span><select id="front">${fronts.map((c) => `<option value="${c}" ${c === s.front ? 'selected' : ''}>${COLOR_JA[c]}</option>`).join('')}</select></label>
      <div class="sub" style="padding-top:8px">この持ち方だと 左=${COLOR_JA[scheme[4]]} / 右=${COLOR_JA[scheme[1]]} / 下=${COLOR_JA[scheme[3]]}</div>
    </div>
    <div class="card">
      <label class="set"><span>1日のノルマ(問)</span><input type="number" id="goal" min="5" max="200" step="5" value="${s.dailyGoal}" style="width:80px"></label>
      <label class="set"><span>効果音</span><input type="checkbox" id="sound" ${s.sound ? 'checked' : ''}></label>
      <label class="set" style="border:0"><span>正解したら自動で次へ(練習)</span><input type="checkbox" id="autonext" ${s.autoNext ? 'checked' : ''}></label>
    </div>
    <h2>データ</h2>
    <div class="card">
      <div class="sub" style="margin-bottom:10px">記録はこの端末のブラウザ内に保存されます。iPhoneでは長期間開かないと消えることがあるので、ときどきバックアップしてください。<span id="persist"></span></div>
      <button class="btn" id="export">バックアップを書き出す</button>
      <button class="btn" id="import">バックアップから復元</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <button class="btn" id="reset" style="color:var(--ng)">すべての記録を消去</button>
    </div>
    <div class="sub" style="text-align:center">Roux Trainer v0.1</div>`;
  const $ = (id) => app.querySelector(id);
  $('#up').onchange = (e) => {
    const up = e.target.value;
    const front = ORIENTATIONS.has(`${up}-${s.front}`) ? s.front : COLORS.find((c) => ORIENTATIONS.has(`${up}-${c}`));
    S.updateSettings({ up, front });
    renderSettings();
  };
  $('#front').onchange = (e) => { S.updateSettings({ front: e.target.value }); renderSettings(); };
  $('#goal').onchange = (e) => S.updateSettings({ dailyGoal: Math.max(5, Math.min(200, Number(e.target.value) || 20)) });
  $('#sound').onchange = (e) => { S.updateSettings({ sound: e.target.checked }); FX.setSound(e.target.checked); };
  $('#autonext').onchange = (e) => S.updateSettings({ autoNext: e.target.checked });
  $('#export').onclick = exportData;
  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      S.importJson(await f.text());
      toast('復元しました');
      render();
    } catch (err) { toast(`復元できませんでした: ${err.message}`); }
  };
  $('#reset').onclick = () => {
    askConfirm('すべての記録を消去しますか?', '記録・XP・連続日数・自分の手順がすべて消え、元に戻せません。', '消去する', () => { S.resetAll(); toast('消去しました'); render(); });
  };
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => { const el = $('#persist'); if (el) el.textContent = p ? '(保存は保護されています)' : ''; });
  }
}

async function exportData() {
  const name = `roux-trainer-backup-${S.dayKey()}.json`;
  const blob = new Blob([S.exportJson()], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- 起動 ----------------
FX.setSound(S.get().settings.sound);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
if (S.openToday()) {
  const streak = S.streakNow();
  const t = S.today();
  showModal(`<div class="huge">🎁</div><h3>ログインボーナス</h3><div class="sub">ログインで +10 XP!<br>今日のノルマ ${S.get().settings.dailyGoal}問 をクリアすると<br>スタンプと ${S.stampReward(streak + 1)} XP がもらえます</div>
    ${stampCard(streak, t.goalDone)}<div style="height:12px"></div>`, render);
}
