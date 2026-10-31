import * as S from './store.js';
import * as FX from './fx.js';
import { generate, DRILLS, CMLL_CASES, identifyCmll, solvesCase, solvesSquare, mergeMoves, qtmLen, DR_POSITIONS, DR_ORIS, CORNER_POSITIONS, CO_ORIS, sbPieceCount, sbCatalog, sbCaseProblem } from './drills.js';
import { CMLL_SETS } from './cmll.js';
import { CubeView, ORIENTATIONS, COLOR_JA, COLOR_HEX, schemeFor } from './view3d.js';
import { applyAlg, solved } from './cube.js';
import { Player, u2p, invMove } from './player.js';
import { EDGE_POS, BAD_COUNTS, START_LENS, eoCount, solvesEo } from './lse.js';
import { LR_BAD_COUNTS, EOLR_LENS, eolrCount, solvesEolr } from './eolr.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
let tab = 'home';
let quiz = null;
let pendingReload = false; // 新しい版に入れ替わり、読み込み直しを待っている
let historyTab = 'calendar';
let selectedDay = S.dayKey();

// 出題モード → 記録のキー(AUF なし / AUF ランダムで記録を分ける)
// 片手の手順で練習した記録は末尾に Oh を付けたキーで別に保存する
const drillOf = (cfg) => {
  if (cfg.menu === 'sb') return 'sbSq';
  if (cfg.menu === 'lseEo') return 'lseEo';
  if (cfg.menu === 'eolr') return 'eolr';
  if (cfg.menu === 'sbSolve' || cfg.menu === 'sbLearn') return 'sbSolve';
  const base = cfg.kind === 'eo' ? (cfg.auf === 'random' ? 'cmllEoAuf' : 'cmllEo') : (cfg.auf === 'random' ? 'cmllAuf' : 'cmll');
  return S.get().settings.algSlot === 'oh' ? `${base}Oh` : base;
};
// 練習するケース: 選んだセットのうち、個別に外したケースを除いたもの
const selectedCases = (cfg) => CMLL_CASES.filter((c) => cfg.sets.includes(c.set) && !(cfg.excluded || []).includes(c.name));
const cfgLabel = (key) => (key === 'all' ? '全ケース' : key.startsWith('cases:') ? `${key.split(',').length}ケース選択` : key);
const baseDrill = (k) => k.replace(/Oh$/, '');
// 今はないモード(記録だけ残っているもの)は名前をそのまま出す
const drillName = (k) => (!DRILLS[baseDrill(k)] ? k : DRILLS[baseDrill(k)].noSlot ? DRILLS[k].name : `${DRILLS[baseDrill(k)].name}・${k.endsWith('Oh') ? '片手' : '両手'}`);
const MENU_LABEL = { cmll: 'CMLL', sb: 'SB 手数当て', sbSolve: 'SB 手順入力', sbLearn: 'SB 学習', lseEo: 'LSE EO', eolr: 'EOLR' };
const SQ_LABEL = { front: 'Front square', back: 'Back square' };
// 並び: U' | U | r / r' | R / R' (U' と U は縦 2 段分)
const PAD_MOVES = ["U'", 'U', "M'", 'r', 'R', 'M', "r'", "R'"];
const KIND_LABEL = { alg: '手順を当てる', eo: 'CMLL後のEO' };
const AUF_LABEL = { none: 'AUFなし', random: 'AUFランダム' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmtTime = (ms) => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(2)}秒` : `${Math.floor(s / 60)}分${(s % 60).toFixed(1).padStart(4, '0')}秒`;
};
const accColor = (p) => (p >= 90 ? 'var(--ok)' : p >= 70 ? 'var(--accent)' : 'var(--ng)');

// 復習する間違い(今あるモードのものだけ)
const liveMistakes = () => S.get().mistakes.filter((m) => DRILLS[baseDrill(m.drill)]);

// SB 学習では「短い方」を front として扱う(設定は残す)
const learnSideFix = (cfg) => (cfg.sbSide === 'both' ? { ...cfg, sbSide: 'front' } : cfg);

// 練習設定(前回の設定を引き継ぐ)
function practiceCfg() {
  const cfg = { auf: 'none', kind: 'alg', menu: 'cmll', sbMin: 2, sbMax: 9, sbMinQ: 2, sbMaxQ: 11, sbSqMetric: 'stm', sbLen: 5, sbLenQ: 8, sbLenMax: 5, sbLenQMax: 8, sbMetric: 'stm', sbSide: 'front', sbBy: 'len', sbDr: [...DR_POSITIONS], sbOri: 'any', sbE2: [...DR_POSITIONS], sbE2Ori: 'any', sbCo: [...CORNER_POSITIONS], sbCoOri: 'any', sbPick: ['dr'], eoBy: 'len', eoLen: 5, eoCounts: [...BAD_COUNTS], eoPos: {}, lrBy: 'len', lrLen: 7, lrCounts: [...LR_BAD_COUNTS], lrPos: {}, lrUL: [...EDGE_POS], lrUR: [...EDGE_POS], ...(S.get().lastPractice || { drill: 'cmll', sets: [...CMLL_SETS], weak: true, testN: 10 }) };
  // 以前の設定で上限と下限が近すぎる場合は広げる
  if (!['any', 'good', 'bad'].includes(cfg.sbOri)) cfg.sbOri = 'any';
  if (!['any', 'good', 'bad'].includes(cfg.sbE2Ori)) cfg.sbE2Ori = 'any';
  if (!['any', ...Object.keys(CO_ORIS)].includes(cfg.sbCoOri)) cfg.sbCoOri = 'any';
  if (!Array.isArray(cfg.sbE2) || !cfg.sbE2.length) cfg.sbE2 = [...DR_POSITIONS];
  if (!Array.isArray(cfg.sbCo) || !cfg.sbCo.length) cfg.sbCo = [...CORNER_POSITIONS];
  if (!Array.isArray(cfg.sbPick) || !cfg.sbPick.length) cfg.sbPick = ['dr'];
  if (!['stm', 'qstm'].includes(cfg.sbMetric)) cfg.sbMetric = 'stm';
  if (!(cfg.sbLenQ >= 2 && cfg.sbLenQ <= 11)) cfg.sbLenQ = 8;
  // SB 手順入力の手数は 最短〜最長 の範囲。最長が最短より小さければ最短に合わせる
  if (!(cfg.sbLenMax >= cfg.sbLen)) cfg.sbLenMax = cfg.sbLen;
  if (!(cfg.sbLenQMax >= cfg.sbLenQ && cfg.sbLenQMax <= 11)) cfg.sbLenQMax = cfg.sbLenQ;
  if (!MENU_LABEL[cfg.menu]) cfg.menu = 'cmll';
  if (!['len', 'pos'].includes(cfg.eoBy)) cfg.eoBy = 'len';
  if (!START_LENS.includes(cfg.eoLen)) cfg.eoLen = 5;
  if (!Array.isArray(cfg.eoCounts) || !cfg.eoCounts.length) cfg.eoCounts = [...BAD_COUNTS];
  if (!cfg.eoPos || typeof cfg.eoPos !== 'object') cfg.eoPos = {};
  if (!['len', 'pos'].includes(cfg.lrBy)) cfg.lrBy = 'len';
  if (!EOLR_LENS.includes(cfg.lrLen)) cfg.lrLen = 7;
  if (!Array.isArray(cfg.lrCounts) || !cfg.lrCounts.length) cfg.lrCounts = [...LR_BAD_COUNTS];
  if (!cfg.lrPos || typeof cfg.lrPos !== 'object') cfg.lrPos = {};
  for (const k of ['lrUL', 'lrUR']) if (!Array.isArray(cfg[k]) || !cfg[k].length) cfg[k] = [...EDGE_POS];
  if (cfg.sbMax - cfg.sbMin < 3) { cfg.sbMin = Math.min(cfg.sbMin, 6); cfg.sbMax = cfg.sbMin + 3; }
  if (!['stm', 'qstm'].includes(cfg.sbSqMetric)) cfg.sbSqMetric = 'stm';
  // 「短い方」(front/back の両方から最短)は手順入力の最短手数の条件だけ。学習では front として扱う(設定は残す)
  if (!['front', 'back', 'both'].includes(cfg.sbSide)) cfg.sbSide = 'front';
  if (cfg.sbSide === 'both' && cfg.menu !== 'sbLearn') cfg.sbBy = 'len';
  if (!(cfg.sbMinQ >= 2 && cfg.sbMaxQ <= 11 && cfg.sbMaxQ - cfg.sbMinQ >= 3)) { cfg.sbMinQ = 2; cfg.sbMaxQ = 11; }
  return cfg;
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
  closeLearnState();
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  render();
}

function render() {
  document.body.classList.toggle('quiz-mode', !!quiz);
  if (quiz) return;
  if (pendingReload && !learn) { location.reload(); return; }
  window.scrollTo(0, 0);
  if (learn) { learn.detail != null ? renderLearnDetail() : renderLearn(); return; }
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
  let cfg = practiceCfg();
  if (cfg.menu === 'sbLearn') cfg = learnSideFix(cfg);
  const nSel = selectedCases(cfg).length;
  const setsLabel = nSel === CMLL_CASES.length ? '全ケース' : (cfg.excluded || []).some((n) => cfg.sets.includes(n.split(' ')[0])) ? `${nSel}ケース` : cfg.sets.join(' / ');
  const reviewN = liveMistakes().length;
  const isSb = cfg.menu === 'sb';
  const isLearn = cfg.menu === 'sbLearn';
  const isSolve = cfg.menu === 'sbSolve' || isLearn;
  const isEo = cfg.menu === 'lseEo' || cfg.menu === 'eolr';
  const kit = EO_KIT[cfg.menu];
  // SB 手数当ての範囲は STM と QSTM で別々に覚える
  const sqQ = cfg.sbSqMetric === 'qstm';
  const sbMin = sqQ ? cfg.sbMinQ : cfg.sbMin, sbMax = sqQ ? cfg.sbMaxQ : cfg.sbMax;
  const sqLens = sqQ ? SB_LENS_Q : SB_LENS;
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
    <h2>練習の設定</h2>
    <div class="card">
      <div class="opt"><span class="sub">練習メニュー</span>
        <div class="chips" id="menu">${Object.entries(MENU_LABEL).map(([k, v]) => `<button class="chip ${cfg.menu === k ? 'on' : ''}" data-menu="${k}">${v}</button>`).join('')}</div></div>
      ${isEo ? lseEoOpts(cfg) : isSolve ? `<div class="opt"><span class="sub">square</span>
        <div class="chips" id="sbside">${Object.entries(isLearn ? SQ_LABEL : { ...SQ_LABEL, both: '短い方' }).map(([k, v]) => `<button class="chip ${cfg.sbSide === k ? 'on' : ''}" data-side="${k}">${v}</button>`).join('')}</div></div>
      <div class="opt"><span class="sub">出題条件</span>
        <div class="chips" id="sbby">${[['len', '最短手数'], ...(cfg.sbSide === 'both' ? [] : [['dr', 'ピースの位置と向き']])].map(([k, v]) => `<button class="chip ${cfg.sbBy === k ? 'on' : ''}" data-by="${k}">${v}</button>`).join('')}</div></div>
      ${cfg.sbBy === 'dr' ? pieceOpts(cfg) : `<div class="opt"><span class="sub">最短手数</span>
        <div class="row" style="gap:6px"><div class="chips" id="sbmetric">${[['stm', 'STM'], ['qstm', 'QSTM']].map(([k, v]) => `<button class="chip ${cfg.sbMetric === k ? 'on' : ''}" data-metric="${k}">${v}</button>`).join('')}</div>
        <select id="sblen">${(cfg.sbMetric === 'qstm' ? SB_LENS_Q : SB_LENS).map((n) => `<option value="${n}" ${n === sbLenOf(cfg) ? 'selected' : ''}>${n}手</option>`).join('')}</select>
        <span class="sub">〜</span><select id="sblenmax">${(cfg.sbMetric === 'qstm' ? SB_LENS_Q : SB_LENS).map((n) => `<option value="${n}" ${n === sbLenMaxOf(cfg) ? 'selected' : ''}>${n}手</option>`).join('')}</select></div></div>`}
      <div class="sub">FBだけ揃った状態から、${cfg.sbBy === 'dr' ? `squareの3つのピースが選んだ位置・向きにある${isLearn ? 'ケース' : '問題'}を出します。エッジのEOは、基準の色(DRはD色、FRはF色、BRはB色)がU/D面を向いていれば合っている、とします(FR・BRの位置にあるときはF/B面)。コーナーはD色がU/D面なら合っていて、そうでなければD色がU/D面から外側に見て時計回り・反時計回りどちらの隣にあるかで分けます。${isLearn ? '' : '最短手数は問題文に表示されます。'}` : `${cfg.sbSide === 'both' ? 'Front と Back の両方の最短手数' : '選んだsquareの最短手数'}が${cfg.sbMetric === 'qstm' ? 'QSTM' : 'STM'}で${sbLenLabel(cfg)}(両端を含む)の${isLearn ? 'ケース' : '問題'}を出します。`}${isLearn ? '条件に合うケースを一覧にして、最短手順で揃うアニメーションを流します。タップするとそのケースの詳細が見られます。' : "U' U M' M r r' R R' のボタンを順に押して手順を入力し(M' R は r、M R' は r' に自動変換)、squareがSTMかQSTMのどちらかで最短手数で揃えば正解です(揃っても手数が多いと不正解)。"}</div>` : isSb ? `<div class="opt"><span class="sub">最短手数の範囲</span>
        <div class="chips" id="sqmetric" style="margin-bottom:6px">${[['stm', 'STM'], ['qstm', 'QSTM']].map(([k, v]) => `<button class="chip ${cfg.sbSqMetric === k ? 'on' : ''}" data-metric="${k}">${v}</button>`).join('')}</div>
        <div class="row" style="gap:6px"><select id="sbmin">${sqLens.slice(0, -SB_GAP).map((n) => `<option value="${n}" ${n === sbMin ? 'selected' : ''}>${n}手</option>`).join('')}</select>
        <span class="sub">〜</span><select id="sbmax">${sqLens.slice(SB_GAP).map((n) => `<option value="${n}" ${n === sbMax ? 'selected' : ''}>${n}手</option>`).join('')}</select></div></div>
      <div class="sub">FBだけ揃った状態から、SBのsquare(DRエッジ+コーナー+エッジの2×2×1)を作る最短手数と、Front square / Back square のどちらが短いかを答えます。${sqQ ? '手数はQSTM(R r U M の90°を1手、180°は2手)で数えます。' : '手数はSTM(R r U M を1手、180°も1手)で数えます。'}同じ手数なら両方正解です。</div>` : `
      <div class="opt"><span class="sub">問題の種類</span>
        <div class="chips" id="kind">${Object.entries(KIND_LABEL).map(([k, v]) => `<button class="chip ${cfg.kind === k ? 'on' : ''}" data-kind="${k}">${v}</button>`).join('')}</div></div>
      <div class="opt"><span class="sub">手順</span>
        <div class="chips" id="slothome">${Object.entries(SLOT_NAMES).map(([k, v]) => `<button class="chip ${d.settings.algSlot === k ? 'on' : ''}" data-slot="${k}">${v}</button>`).join('')}</div></div>
      <div class="opt"><span class="sub">出題モード</span>
        <div class="chips" id="aufmode">${Object.entries(AUF_LABEL).map(([k, v]) => `<button class="chip ${cfg.auf === k ? 'on' : ''}" data-auf="${k}">${v}</button>`).join('')}</div></div>
      <div class="sub" style="margin:-4px 0 12px">${cfg.kind === 'eo'
        ? (cfg.auf === 'random' ? '向きがランダムに変わります。手順の前のAUFを選び、手順表の手順を回した後に向きが揃っていないLSEのエッジをすべて選びます。' : '手順表の手順を回した後、向きが揃っていないLSEのエッジをすべて選びます。')
        : (cfg.auf === 'random' ? '向きがランダムに変わります。手順の前のAUFも選んで答えます。' : '手順表の手順をそのままかけられる向きで出題します。')}</div>
      <div class="opt" style="margin-bottom:0"><span class="sub">CMLL のセット</span></div>
      <div class="chips" id="sets">${CMLL_SETS.map((s) => `<button class="chip ${cfg.sets.includes(s) ? 'on' : ''}" data-set="${s}">${s}</button>`).join('')}</div>
      <button class="btn" id="pickcases" style="margin:10px 0 0;padding:11px;font-size:15px">ケースを個別に選ぶ<small>選択中 ${nSel} / 42 ケース</small></button>
      <label class="set" style="border:0;padding-bottom:0"><span>苦手なケースを多めに出す<br><span class="sub">正答率が低いケースほど出やすくなります</span></span><input type="checkbox" id="weak" ${cfg.weak ? 'checked' : ''}></label>`}
    </div>
    ${isLearn ? `<button class="btn primary" id="go-learn">ケース一覧を見る<small>SB 学習 ・ ${SQ_LABEL[cfg.sbSide]} ・ ${cfg.sbBy === 'dr' ? pieceLabel(cfg) : `${cfg.sbMetric === 'qstm' ? 'QSTM ' : ''}${sbLenLabel(cfg)}`} ・ ${learnList(cfg).length}ケース</small></button>` : `    <button class="btn primary" id="go-practice">練習スタート<small>${isEo ? `${kit.name} ・ ${lseEoLabel(cfg)}` : isSolve ? `SB 手順入力 ・ ${cfg.sbSide === 'both' ? 'Front/Backの短い方' : SQ_LABEL[cfg.sbSide]} ・ ${cfg.sbBy === 'dr' ? pieceLabel(cfg) : `${cfg.sbMetric === 'qstm' ? 'QSTM ' : ''}${sbLenLabel(cfg)}`}` : isSb ? `SB 手数当て ・ ${sqQ ? 'QSTM ' : ''}${sbMin === sbMax ? `${sbMin}手` : `${sbMin}〜${sbMax}手`}` : `${cfg.kind === 'eo' ? 'CMLL後のEO' : 'CMLL'} ・ ${AUF_LABEL[cfg.auf]} ・ ${esc(setsLabel)} ・ ${SLOT_NAMES[d.settings.algSlot]}手順`}</small></button>
    <div class="row" style="gap:10px">
      <button class="btn blue" id="go-test" style="flex:1">⏱ テスト<small>${cfg.testN}問タイムアタック</small></button>
      <button class="btn" id="go-review" style="flex:1" ${reviewN ? '' : 'disabled'}>🔁 復習<small>間違えた問題 ${reviewN}</small></button>
    </div>
    <div class="row" style="justify-content:center;gap:8px" id="testn">
      <span class="sub">テスト問題数</span>${[10, 20, 42].map((n) => `<button class="chip ${cfg.testN === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}
    </div>`}
  `;
  const update = (patch) => { S.setLastPractice({ ...practiceCfg(), ...patch }); renderHome(); };
  app.querySelector('#menu').onclick = (e) => { const b = e.target.closest('[data-menu]'); if (b) update({ menu: b.dataset.menu }); };
  if (isLearn) {
    app.querySelector('#go-learn').onclick = () => openLearn(learnSideFix(practiceCfg()));
  } else {
    app.querySelector('#go-practice').onclick = () => startQuiz('practice');
    app.querySelector('#go-test').onclick = () => startQuiz('test');
    app.querySelector('#go-review').onclick = () => startQuiz('review');
    app.querySelector('#testn').onclick = (e) => { const b = e.target.closest('[data-n]'); if (b) update({ testN: Number(b.dataset.n) }); };
  }
  if (isEo) {
    app.querySelector('#eoby').onclick = (e) => { const b = e.target.closest('[data-by]'); if (b) update({ [kit.by]: b.dataset.by }); };
    const lenEl = app.querySelector('#eolen');
    if (lenEl) lenEl.onchange = (e) => update({ [kit.len]: Number(e.target.value) });
    const cntEl = app.querySelector('#eocnt');
    // 数は複数選択。問わない → 全部。問わない状態から押したらそれだけ。全部外れたら問わないに戻す
    const ALLC = kit.COUNTS;
    if (cntEl) cntEl.onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      if (b.dataset.v === '*') { update({ [kit.counts]: [...ALLC] }); return; }
      const v = Number(b.dataset.v);
      const cur = cfg[kit.counts];
      const set = cur.length === ALLC.length ? new Set() : new Set(cur);
      set.has(v) ? set.delete(v) : set.add(v);
      update({ [kit.counts]: set.size ? ALLC.filter((x) => set.has(x)) : [...ALLC] });
    };
    // 位置はタップするたびに 問わない → 悪い → 合っている → 問わない
    const posEl = app.querySelector('#eopos');
    if (posEl) posEl.onclick = (e) => {
      const b = e.target.closest('[data-pos]');
      if (!b) return;
      const cur = cfg[kit.pos][b.dataset.pos];
      const nextV = !cur ? 'bad' : cur === 'bad' ? 'good' : null;
      const pos = { ...cfg[kit.pos] };
      if (nextV) pos[b.dataset.pos] = nextV; else delete pos[b.dataset.pos];
      update({ [kit.pos]: pos });
    };
    const resetEl = app.querySelector('#eoposreset');
    if (resetEl) resetEl.onclick = () => update({ [kit.pos]: {} });
    // EOLR: UL・UR エッジの今の位置(複数選択、問わない = 全部)
    for (const [id, key] of [['#lrul', 'lrUL'], ['#lrur', 'lrUR']]) {
      const el = app.querySelector(id);
      if (el) el.onclick = (e) => {
        const b = e.target.closest('[data-pos]');
        if (!b) return;
        if (b.dataset.pos === '*') { update({ [key]: [...EDGE_POS] }); return; }
        const set = cfg[key].length === EDGE_POS.length ? new Set() : new Set(cfg[key]);
        set.has(b.dataset.pos) ? set.delete(b.dataset.pos) : set.add(b.dataset.pos);
        update({ [key]: set.size ? EDGE_POS.filter((x) => set.has(x)) : [...EDGE_POS] });
      };
    }
    if (!kit.count(lseEoCond(cfg))) app.querySelectorAll('#go-practice, #go-test').forEach((b) => { b.disabled = true; });
    return;
  }
  if (isSolve) {
    app.querySelector('#sbby').onclick = (e) => { const b = e.target.closest('[data-by]'); if (b) update({ sbBy: b.dataset.by }); };
    const lenEl = app.querySelector('#sblen');
    const [kLo, kHi] = cfg.sbMetric === 'qstm' ? ['sbLenQ', 'sbLenQMax'] : ['sbLen', 'sbLenMax'];
    if (lenEl) lenEl.onchange = (e) => { const v = Number(e.target.value); update({ [kLo]: v, [kHi]: Math.max(v, sbLenMaxOf(cfg)) }); };
    const lenMaxEl = app.querySelector('#sblenmax');
    if (lenMaxEl) lenMaxEl.onchange = (e) => { const v = Number(e.target.value); update({ [kHi]: v, [kLo]: Math.min(v, sbLenOf(cfg)) }); };
    const metricEl = app.querySelector('#sbmetric');
    if (metricEl) metricEl.onclick = (e) => { const b = e.target.closest('[data-metric]'); if (b) update({ sbMetric: b.dataset.metric }); };
    // 位置は複数選択(1つ以上)、向きは1つ選ぶ
    const multi = (id, key, all) => {
      const el = app.querySelector(id);
      if (el) el.onclick = (e) => {
        const b = e.target.closest('[data-pos]');
        if (!b) return;
        const p = b.dataset.pos;
        // 問わない → 全部。問わない状態から位置を押したらその位置だけ。全部外れたら問わないに戻す
        if (p === '*') { update({ [key]: [...all] }); return; }
        const set = cfg[key].length === all.length ? new Set() : new Set(cfg[key]);
        set.has(p) ? set.delete(p) : set.add(p);
        update({ [key]: set.size ? all.filter((x) => set.has(x)) : [...all] });
      };
    };
    const pickEl = app.querySelector('#sbpick');
    if (pickEl) pickEl.onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const set = new Set(cfg.sbPick);
      set.has(b.dataset.pick) ? set.delete(b.dataset.pick) : set.add(b.dataset.pick);
      if (!set.size) { toast('1つ以上選んでください'); return; }
      update({ sbPick: PIECE_KEYS.filter((k) => set.has(k)) });
    };
    const single = (id, key) => {
      const el = app.querySelector(id);
      if (el) el.onclick = (e) => { const b = e.target.closest('[data-ori]'); if (b) update({ [key]: b.dataset.ori }); };
    };
    multi('#sbdr', 'sbDr', DR_POSITIONS);
    multi('#sbe2', 'sbE2', DR_POSITIONS);
    multi('#sbco', 'sbCo', CORNER_POSITIONS);
    single('#sbori', 'sbOri');
    single('#sbe2ori', 'sbE2Ori');
    single('#sbcoori', 'sbCoOri');
    if (cfg.sbBy === 'dr' && !sbPieceCount(pieceCond(cfg))) app.querySelectorAll('#go-practice, #go-test, #go-learn').forEach((b) => { b.disabled = true; });
    app.querySelector('#sbside').onclick = (e) => { const b = e.target.closest('[data-side]'); if (b) update({ sbSide: b.dataset.side }); };
    return;
  }
  if (isSb) {
    // 上限と下限は 3 手以上離す(選択肢の 4 つが範囲に収まるように)。片方を動かしたらもう片方も合わせる
    const [kMin, kMax] = sqQ ? ['sbMinQ', 'sbMaxQ'] : ['sbMin', 'sbMax'];
    app.querySelector('#sbmin').onchange = (e) => { const v = Number(e.target.value); update({ [kMin]: v, [kMax]: Math.max(v + SB_GAP, sbMax) }); };
    app.querySelector('#sbmax').onchange = (e) => { const v = Number(e.target.value); update({ [kMax]: v, [kMin]: Math.min(v - SB_GAP, sbMin) }); };
    app.querySelector('#sqmetric').onclick = (e) => { const b = e.target.closest('[data-metric]'); if (b) update({ sbSqMetric: b.dataset.metric }); };
    return;
  }
  app.querySelector('#sets').onclick = (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const sets = new Set(practiceCfg().sets);
    sets.has(b.dataset.set) ? sets.delete(b.dataset.set) : sets.add(b.dataset.set);
    if (!sets.size) { toast('1つ以上選んでください'); return; }
    // セットを付け直したときは、そのセットのケースを全部選んだ状態に戻す
    const excluded = (practiceCfg().excluded || []).filter((n) => !(sets.has(b.dataset.set) && n.split(' ')[0] === b.dataset.set));
    update({ sets: CMLL_SETS.filter((x) => sets.has(x)), excluded });
  };
  app.querySelector('#pickcases').onclick = openCasePicker;
  const aufEl = app.querySelector('#aufmode');
  if (aufEl) aufEl.onclick = (e) => { const b = e.target.closest('[data-auf]'); if (b) update({ auf: b.dataset.auf }); };
  app.querySelector('#slothome').onclick = (e) => { const b = e.target.closest('[data-slot]'); if (b) { S.updateSettings({ algSlot: b.dataset.slot }); renderHome(); } };
  app.querySelector('#kind').onclick = (e) => { const b = e.target.closest('[data-kind]'); if (b) update({ kind: b.dataset.kind }); };
  app.querySelector('#weak').onchange = (e) => update({ weak: e.target.checked });
}

// ---------------- クイズ ----------------
// 出題に使う手順(設定で選んだ枠。自分の手順がなければ初期手順)
const SLOT_NAMES = { two: '両手', oh: '片手' };
const SB_LENS = [2, 3, 4, 5, 6, 7, 8, 9];
// SB手順入力の「ピースの位置と向き」: square の DR エッジ・もう一つのエッジ・コーナーそれぞれの位置(複数可)と向き
const SQ_E2 = { front: 'FR', back: 'BR' };
const SQ_CO = { front: 'DRF', back: 'DRB' };
// 指定するピース(sbPick: 'dr' 'e2' 'co')だけ条件に入れる。選ばなかったピースは問わない
const pieceCond = (cfg) => {
  const on = (k) => cfg.sbPick.includes(k);
  return {
    side: cfg.sbSide,
    drPos: on('dr') ? cfg.sbDr : DR_POSITIONS, drOri: on('dr') ? cfg.sbOri : 'any',
    e2Pos: on('e2') ? cfg.sbE2 : null, e2Ori: on('e2') ? cfg.sbE2Ori : 'any',
    coPos: on('co') ? cfg.sbCo : null, coOri: on('co') ? cfg.sbCoOri : 'any',
  };
};
const PIECE_KEYS = ['dr', 'e2', 'co'];
// テストの自己ベストを分ける鍵。DR だけ指定のときは以前と同じ形
const sbPieceKey = (cfg) => {
  const c = pieceCond(cfg);
  const opt = (tag, pos, all, ori) => (!pos || (pos.length === all.length && ori === 'any') ? '' : ` ${tag}:${pos.join(',')} ${ori}`);
  return `${cfg.sbSide} DR:${c.drPos.join(',')} ${c.drOri}${opt('E2', c.e2Pos, DR_POSITIONS, c.e2Ori)}${opt('C', c.coPos, CORNER_POSITIONS, c.coOri)}`;
};
const pieceName = (k, side) => ({ dr: 'DRエッジ', e2: `${SQ_E2[side]}エッジ`, co: `${SQ_CO[side]}コーナー` })[k];
function pieceOpts(cfg) {
  // 位置は「問わない」(全部)か、1つ以上を選ぶ
  const group = (title, id, list, sel, oriId, oris, ori) => `<div class="opt"><span class="sub">${title}の位置(複数可)</span>
      <div class="chips" id="${id}"><button class="chip ${sel.length === list.length ? 'on' : ''}" data-pos="*">問わない</button>${list.map((p) => `<button class="chip ${sel.length < list.length && sel.includes(p) ? 'on' : ''}" data-pos="${p}">${p}</button>`).join('')}</div></div>
    <div class="opt"><span class="sub">${title}の向き</span>
      <div class="chips" id="${oriId}">${Object.entries({ any: '問わない', ...oris }).map(([k, v]) => `<button class="chip ${ori === k ? 'on' : ''}" data-ori="${k}">${v}</button>`).join('')}</div></div>`;
  const n = sbPieceCount(pieceCond(cfg));
  const on = (k) => cfg.sbPick.includes(k);
  return `<div class="opt"><span class="sub">指定するピース(複数可)</span>
      <div class="chips" id="sbpick">${PIECE_KEYS.map((k) => `<button class="chip ${on(k) ? 'on' : ''}" data-pick="${k}">${pieceName(k, cfg.sbSide)}</button>`).join('')}</div></div>`
    + (on('dr') ? group('DRエッジ', 'sbdr', DR_POSITIONS, cfg.sbDr, 'sbori', DR_ORIS, cfg.sbOri) : '')
    + (on('e2') ? group(pieceName('e2', cfg.sbSide), 'sbe2', DR_POSITIONS, cfg.sbE2, 'sbe2ori', DR_ORIS, cfg.sbE2Ori) : '')
    + (on('co') ? group(pieceName('co', cfg.sbSide), 'sbco', CORNER_POSITIONS, cfg.sbCo, 'sbcoori', CO_ORIS, cfg.sbCoOri) : '')
    + `<div class="sub" id="sbcount" style="${n ? '' : 'color:var(--ng)'}">${n ? `条件に合う置き方: ${n}通り(全5184通り中、最短2手以上)` : 'この条件に合う置き方はありません。条件をゆるめてください'}</div>`;
}
const pieceLabel = (cfg) => {
  const on = (k) => cfg.sbPick.includes(k);
  const part = (k, name, pos, all, ori, oris) => (!on(k) || (pos.length === all.length && ori === 'any') ? '' : `${name}:${pos.length === all.length ? '位置問わず' : pos.join(' ')}${ori === 'any' ? '' : `(${oris[ori]})`}`);
  return [part('dr', 'DR', cfg.sbDr, DR_POSITIONS, cfg.sbOri, DR_ORIS), part('e2', SQ_E2[cfg.sbSide], cfg.sbE2, DR_POSITIONS, cfg.sbE2Ori, DR_ORIS), part('co', SQ_CO[cfg.sbSide], cfg.sbCo, CORNER_POSITIONS, cfg.sbCoOri, CO_ORIS)].filter(Boolean).join(' ・ ') || '位置・向き 指定なし';
};
// QSTM は 180° を 2 手と数えるので長くなる(最長 11 手)
const SB_LENS_Q = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const sbLenOf = (cfg) => (cfg.sbMetric === 'qstm' ? cfg.sbLenQ : cfg.sbLen);
const sbLenMaxOf = (cfg) => (cfg.sbMetric === 'qstm' ? cfg.sbLenQMax : cfg.sbLenMax);
const sbLenLabel = (cfg) => (sbLenOf(cfg) === sbLenMaxOf(cfg) ? `${sbLenOf(cfg)}手` : `${sbLenOf(cfg)}〜${sbLenMaxOf(cfg)}手`);
const SB_GAP = 3;
const algFor = (c, slot) => S.customAlg(c.name, slot) || c.alg;
const algOf = (c) => algFor(c, S.get().settings.algSlot);

// LSE EO と EOLR の出題条件: 最短手数(QSTM) か、向きが悪いエッジの数と位置(EOLR は UL・UR エッジの位置も)
const EO_KIT = {
  lseEo: { name: 'LSE EO', by: 'eoBy', len: 'eoLen', counts: 'eoCounts', pos: 'eoPos', COUNTS: BAD_COUNTS, LENS: START_LENS, count: eoCount },
  eolr: { name: 'EOLR', by: 'lrBy', len: 'lrLen', counts: 'lrCounts', pos: 'lrPos', COUNTS: LR_BAD_COUNTS, LENS: EOLR_LENS, count: eolrCount },
};
const allOrNull = (list) => (list.length === EDGE_POS.length ? null : list);
function lseEoCond(cfg) {
  const k = EO_KIT[cfg.menu];
  if (cfg[k.by] === 'len') return { by: 'len', len: cfg[k.len] };
  const c = { by: 'pos', counts: cfg[k.counts].length === k.COUNTS.length ? null : cfg[k.counts], pos: cfg[k.pos] };
  if (cfg.menu === 'eolr') { c.ul = allOrNull(cfg.lrUL); c.ur = allOrNull(cfg.lrUR); }
  return c;
}
function lseEoLabel(cfg) {
  const c = lseEoCond(cfg);
  if (c.by === 'len') return `QSTM ${c.len}手`;
  const bad = EDGE_POS.filter((p) => c.pos[p] === 'bad'), good = EDGE_POS.filter((p) => c.pos[p] === 'good');
  const parts = [c.counts ? `悪い${c.counts.join('/')}個` : '', bad.length ? `悪い:${bad.join(',')}` : '', good.length ? `合う:${good.join(',')}` : '',
    c.ul ? `UL→${c.ul.join('/')}` : '', c.ur ? `UR→${c.ur.join('/')}` : ''].filter(Boolean);
  return parts.length ? parts.join(' ・ ') : '条件なし';
}
function lseEoOpts(cfg) {
  const k = EO_KIT[cfg.menu], lr = cfg.menu === 'eolr';
  const n = k.count(lseEoCond(cfg));
  const counts = cfg[k.counts], pos = cfg[k.pos];
  const all = counts.length === k.COUNTS.length;
  const posLabel = { bad: '悪い', good: '合う' };
  const lrChips = (id, key, name) => {
    const any = cfg[key].length === EDGE_POS.length;
    return `<div class="opt"><span class="sub">${name}エッジの今の位置(複数可)</span>
      <div class="chips" id="${id}"><button class="chip ${any ? 'on' : ''}" data-pos="*">問わない</button>${EDGE_POS.map((p) => `<button class="chip ${!any && cfg[key].includes(p) ? 'on' : ''}" data-pos="${p}">${p}</button>`).join('')}</div></div>`;
  };
  return `<div class="opt"><span class="sub">出題条件</span>
      <div class="chips" id="eoby">${[['len', '最短手数'], ['pos', lr ? 'EOとUL/URの位置' : 'EOの数と位置']].map(([v, l]) => `<button class="chip ${cfg[k.by] === v ? 'on' : ''}" data-by="${v}">${l}</button>`).join('')}</div></div>
    ${cfg[k.by] === 'len' ? `<div class="opt"><span class="sub">最短手数(QSTM)</span>
      <select id="eolen">${k.LENS.map((x) => `<option value="${x}" ${x === cfg[k.len] ? 'selected' : ''}>${x}手</option>`).join('')}</select></div>`
    : `<div class="opt"><span class="sub">向きが悪いエッジの数(複数可)</span>
      <div class="chips" id="eocnt"><button class="chip ${all ? 'on' : ''}" data-v="*">問わない</button>${k.COUNTS.map((x) => `<button class="chip ${!all && counts.includes(x) ? 'on' : ''}" data-v="${x}">${x}個</button>`).join('')}</div></div>
    <div class="opt"><span class="sub">位置ごとの向き(タップで 問わない → 悪い → 合う)</span>
      <div class="chips" id="eopos">${EDGE_POS.map((p) => `<button class="chip eop ${pos[p] || ''}" data-pos="${p}">${p}${pos[p] ? ` ${posLabel[pos[p]]}` : ''}</button>`).join('')}<button class="chip" id="eoposreset">すべて問わない</button></div></div>
    ${lr ? lrChips('lrul', 'lrUL', 'UL') + lrChips('lrur', 'lrUR', 'UR') : ''}`}
    <div class="sub" style="${n ? '' : 'color:var(--ng)'}">${n ? `条件に合う形: ${n}通り(${lr ? 'エッジの位置と向き、' : ''}センターの位置も含む)` : 'この条件に合う形はありません。条件をゆるめてください'}</div>
    <div class="sub">${lr
    ? "CMLLまで終わった状態(U面センターはU面かD面)から、EOを揃えて、ULとURのエッジをU色がD面を向くようにDF・DBに入れる手順(どちらにどちらが入ってもよい)を U' U M' M のボタンで入力します。"
    : "CMLLまで終わった状態(U面センターはU面かD面)から、LSEのEOを揃える手順を U' U M' M のボタンで入力します。"}QSTM(90°を1手、180°は2手)で最短なら正解です。すべてのピースに色を付けます。手順の最後には、U/D面のセンターがU/D面に来るようにM列も合わせます(その手も手数に入ります)。向きは、U/D色がU/D面を向いていれば合っている、とします(センターがM/M'ずれのときは、UF・UB・DF・DBのエッジはF/B面向きで合っている)。${cfg[k.by] === 'pos' ? '最短手数は問題文に表示されます。' : ''}</div>`;
}

function genOpts(cfg) {
  if (EO_KIT[cfg.menu]) return lseEoCond(cfg);
  if (cfg.menu === 'sb') return cfg.sbSqMetric === 'qstm' ? { minLen: cfg.sbMinQ, maxLen: cfg.sbMaxQ, metric: 'qstm' } : { minLen: cfg.sbMin, maxLen: cfg.sbMax };
  if (cfg.caseNo != null) return { side: cfg.sbSide, caseNo: cfg.caseNo };
  if (cfg.menu === 'sbSolve') return cfg.sbBy === 'dr' ? pieceCond(cfg) : { len: sbLenOf(cfg), lenMax: sbLenMaxOf(cfg), side: cfg.sbSide, metric: cfg.sbMetric };
  return { sets: cfg.sets, only: selectedCases(cfg).map((c) => c.name), stats: cfg.weak ? (S.get().caseStats[drillOf(cfg)] || {}) : null, algOf };
}

function startQuiz(mode, override = null) {
  const cfg = override || practiceCfg();
  quiz = { mode, cfg, drill: drillOf(cfg), idx: 0, correct: 0, combo: 0, maxCombo: 0, xp: 0, answered: false, problems: null, mistakesIds: [] };
  if (mode === 'test' && (cfg.menu === 'sb' || cfg.menu === 'sbSolve' || EO_KIT[cfg.menu])) {
    quiz.problems = Array.from({ length: cfg.testN }, () => generate(quiz.drill, genOpts(cfg)));
    quiz.total = cfg.testN;
    quiz.cfgKey = EO_KIT[cfg.menu] ? lseEoLabel(cfg) : cfg.menu === 'sb' ? (cfg.sbSqMetric === 'qstm' ? `QSTM ${cfg.sbMinQ}-${cfg.sbMaxQ}手` : `${cfg.sbMin}-${cfg.sbMax}手`) : (cfg.sbBy === 'dr' ? sbPieceKey(cfg) : `${cfg.sbSide} ${cfg.sbMetric === 'qstm' ? 'QSTM' : ''}${sbLenLabel(cfg)}`);
  } else if (mode === 'test') {
    const pool = selectedCases(cfg);
    const seq = [];
    while (seq.length < cfg.testN) seq.push(...[...pool].sort(() => Math.random() - 0.5));
    quiz.problems = seq.slice(0, cfg.testN).map((c) => ({ ...generate(baseDrill(quiz.drill), { sets: cfg.sets, forceCase: c.name, algOf }), drill: quiz.drill }));
    quiz.total = cfg.testN;
    quiz.cfgKey = pool.length === CMLL_CASES.length ? 'all'
      : (cfg.excluded || []).length ? `cases:${pool.map((c) => c.name).join(',')}` : cfg.sets.join(',');
  }
  if (mode === 'review') {
    const ms = liveMistakes().slice(0, 20);
    quiz.problems = ms.map((m) => {
      const pr = { ...m.problem, colors: m.problem.colors.split('').map(Number) };
      // 旧形式(AUF 固定のみ)の EO 問題を読み替える
      if (pr.eoBad && !pr.eoAnswers) pr.eoAnswers = [{ auf: '', bad: pr.eoBad, after: pr.after }];
      return pr;
    });
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
      <div style="text-align:center;flex:1"><div style="font-weight:800">${title} ・ ${quiz.mode === 'review' ? '間違えた問題' : drillName(quiz.drill)}</div><div class="sub" id="qcount"></div></div>
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
  const sbQuiz = ['sbSq', 'sbSolve'].includes(quiz.drill) || quiz.mode === 'review';
  tools.innerHTML = '<button data-v="top">上から</button><button data-v="reset">視点リセット</button>'
    + (sbQuiz ? `<button data-v="d" class="dtog ${s.hideD ? '' : 'on'}">D面色</button>` : '');
  tools.addEventListener('pointerdown', (e) => e.stopPropagation());
  tools.onclick = (e) => {
    const v = e.target.dataset.v;
    if (v === 'top') quiz.view.setView(-88, 0, true);
    if (v === 'reset') quiz.view.setView(...DRILLS.cmll.view, true);
    if (v === 'd') {
      setShowD(!!S.get().settings.hideD);
      e.target.classList.toggle('on', !S.get().settings.hideD);
      if (quiz.view.colors) quiz.view.setColors(quiz.view.colors, quiz.view.highlight);
    }
  };
  sceneEl.appendChild(tools);
  const afterLabel = document.createElement('div');
  afterLabel.id = 'afterlabel';
  afterLabel.className = 'after-label';
  afterLabel.textContent = 'CMLLを回した後';
  afterLabel.hidden = true;
  sceneEl.appendChild(afterLabel);
  const animLabel = document.createElement('div');
  animLabel.id = 'animlabel';
  animLabel.className = 'anim-label';
  animLabel.hidden = true;
  sceneEl.appendChild(animLabel);
  app.querySelector('#quit').onclick = () => {
    if (quiz.mode === 'test') askConfirm('テストを中断しますか?', 'このテストは記録されません。', '中断する', endQuiz);
    else endQuiz();
  };
  // AUF ランダムでは AUF と手順の両方を選んだ時点で判定する(順番は自由)
  // 手のボタンは押した瞬間(pointerdown)に入力する。2本の指で同時に押しても両方入る
  app.querySelector('#choices').addEventListener('pointerdown', (e) => {
    const padEl = e.target.closest('.padbtn[data-mv]');
    if (!padEl || !quiz || quiz.answered) return;
    const before = quiz.seq.slice();
    quiz.seq.push(padEl.dataset.mv);
    FX.sfxTick();
    showSeq();
    seqCube(before, padEl.dataset.mv);
  });
  app.querySelector('#choices').onclick = (e) => {
    const padEl = e.target.closest('.padbtn');
    if (padEl && padEl.dataset.mv) return;
    if (padEl && quiz && !quiz.answered) {
      if (padEl.id === 'padok') { answerSeq(padEl); return; }
      const before = quiz.seq.slice();
      let undo = null;
      if (padEl.id === 'padback') undo = quiz.seq.pop();
      else if (padEl.id === 'padclear') quiz.seq = [];
      FX.sfxTick();
      showSeq();
      // 1手戻すときは取り消した手を逆に回す。クリアは最初の盤面にすぐ戻す
      seqCube(before, undo ? invMove(undo) : null);
      return;
    }
    const cellEl = e.target.closest('.eocell');
    if (cellEl && quiz && !quiz.answered) {
      const pos = cellEl.dataset.pos;
      quiz.selEdges = quiz.selEdges.includes(pos) ? quiz.selEdges.filter((x) => x !== pos) : [...quiz.selEdges, pos];
      cellEl.classList.toggle('sel');
      FX.sfxTick();
      return;
    }
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
  stopAnim();
  if (quiz.total && quiz.idx >= quiz.total) { finishQuiz(); return; }
  const p = quiz.problems ? quiz.problems[quiz.idx] : { ...generate(baseDrill(quiz.drill), genOpts(quiz.cfg)), drill: quiz.drill };
  quiz.current = p;
  quiz.answered = false;
  quiz.selAlg = null;
  quiz.selAuf = null;
  const aufRow = app.querySelector('#aufrow');
  aufRow.hidden = !p.aufAnswers;
  const rowOpts = p.rowOpts || ['', 'U', 'U2', "U'"].map((a) => [a, a || 'なし']);
  aufRow.innerHTML = rowOpts.map(([v, label]) => `<button class="aufbtn" data-auf="${esc(v)}">${esc(label)}</button>`).join('');
  quiz.view.allowHideD = !p.lseEo; // D面色を隠す設定は SB だけ
  quiz.view.setColors(p.colors, p.highlight || null);
  quiz.view.setView(...DRILLS.cmll.view, quiz.idx > 0);
  aufRow.classList.toggle('two', rowOpts.length === 2);
  app.querySelector('#choices').classList.toggle('nums', !!p.highlight && !p.inputPad);
  app.querySelector('#prompt').textContent = p.prompt;
  quiz.selEdges = [];
  const afterLabel = app.querySelector('#afterlabel');
  if (afterLabel) afterLabel.hidden = true;
  app.querySelector('#scene').classList.toggle('compact', !!p.eoAnswers);
  app.querySelector('#scene').classList.remove('solved-view', 'anim-view');
  quiz.seq = [];
  if (p.inputPad) {
    app.querySelector('#choices').innerHTML = `<div class="seq" id="seq"></div>
      ${p.padMoves ? `<div class="pad pad4">${p.padMoves.map((m) => `<button class="padbtn" data-mv="${esc(m)}">${esc(m)}</button>`).join('')}</div>`
    : `<div class="pad">${PAD_MOVES.map((m) => `<button class="padbtn${m[0] === 'U' ? ' tall' : ''}" data-mv="${esc(m)}">${esc(m)}</button>`).join('')}</div>`}
      <div class="padrow"><button class="padbtn sm" id="padback">⌫ 1手戻す</button><button class="padbtn sm" id="padclear">クリア</button><button class="padbtn sm ok" id="padok">決定</button></div>`;
    showSeq();
  } else if (p.eoAnswers) {
    app.querySelector('#choices').innerHTML = eoBoard(p);
    app.querySelector('#eosubmit').onclick = answerEo;
  } else {
    app.querySelector('#choices').innerHTML = p.choices.map((c, i) =>
      `<button class="choice" data-i="${i}"><span>${esc(c.label)}</span><small>${esc(c.sub || '')}</small></button>`).join('');
  }
  app.querySelector('#feedback').innerHTML = p.sbSols || p.lseEo ? '<button class="btn" id="reveal">答えを見る<small>不正解として記録されます</small></button>' : '';
  if (p.sbSols || p.lseEo) app.querySelector('#reveal').onclick = reveal;
  const qc = app.querySelector('#qcount');
  qc.textContent = quiz.total ? `${quiz.idx + 1} / ${quiz.total}` : `${quiz.idx + 1}問目 ・ 正解 ${quiz.correct}`;
  const prog = app.querySelector('#qprog');
  if (prog) prog.style.width = `${pct(quiz.idx, quiz.total)}%`;
  updateCombo(false);
  quiz.shownT = performance.now();
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
  settle(ok, btn.getBoundingClientRect(), i === p.answer ? (p.rowName === 'square' ? '手数は正解、squareが違います' : '手順は正解、AUFが違います') : '不正解…');
}

// 判定後の共通処理(効果音・記録・XP・次の問題へ)
function settle(ok, rect, wrongMsg) {
  const p = quiz.current;
  const flash = document.createElement('div');
  flash.className = `flash ${ok ? 'ok' : 'ng'}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);

  if (ok) { quiz.correct++; quiz.combo++; quiz.maxCombo = Math.max(quiz.maxCombo, quiz.combo); FX.sfxCorrect(quiz.combo); } else { quiz.combo = 0; FX.sfxWrong(); }

  const stored = { ...p, colors: p.colors.join('') };
  const { gained, events } = S.recordAnswer({
    drill: p.drill || quiz.drill, caseKey: p.caseKey, ok, mode: quiz.mode === 'test' ? 'test' : quiz.mode === 'review' ? 'review' : 'practice', combo: quiz.combo,
    problem: ok || quiz.mode === 'review' ? null : stored,
    timeMs: quiz.mode === 'review' ? 0 : performance.now() - quiz.shownT,
    sbCase: p.caseNo != null && p.square ? `${p.square}#${p.caseNo}` : null,
  });
  quiz.xp += gained;
  if (quiz.mode === 'review' && ok) S.removeMistake(quiz.mistakesIds[quiz.idx]);
  const r = rect;
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
  // SB は答えを覚えるのが目的なので、正解しても次へを押すまで答えを出しておく
  const anim = !!(p.sbSols || p.lseEo); // 答えの手順をアニメーションで見せる問題
  const autoNext = ok && S.get().settings.autoNext && !anim;
  // 解答例の表まで 1 画面に収まるよう、キューブを小さくする
  fb.classList.toggle('sb', anim);
  // 手順入力ではボタンを隠すので、アニメーションが見えるよう少しだけ小さくする
  if (anim) app.querySelector('#scene').classList.add('anim-view');
  fb.innerHTML = `<div class="row between"><div><div class="res ${ok ? 'ok' : 'ng'}">${ok ? (quiz.combo >= 3 ? `正解!🔥×${quiz.combo}` : '正解!') : wrongMsg}${ok && p.inputPad && quiz.okVia ? `<span class="via">${quiz.okVia}</span>` : ''}</div>
    ${p.inputPad && quiz.seq.length ? seqSummary(p) : ''}
    ${anim ? '' : `<div class="sub mono">${esc(p.explain)}</div>`}</div>
    ${autoNext ? '' : '<button class="btn primary" id="next" style="width:auto;padding:12px 22px;margin:0">次へ</button>'}</div>
    ${p.lseEo ? lseEoTable(p) : p.sbSols ? sbTable(p) : ''}
    ${anim ? '<div class="animhint">キューブをタップで停止/再生(どちらも最初の局面から)、右の余白で1手進む、左の余白で1手戻る</div>' : ''}
    <details class="scr"><summary>この盤面の作り方(スクランブル)</summary><div class="mono">${esc(anim ? u2p(p.scramble) : p.scramble)}</div></details>`;
  if (autoNext) {
    setTimeout(() => { if (quiz && !modalQueue.length) nextProblem(); else if (quiz) afterModals(nextProblem); }, p.eoAnswers ? 1600 : 800);
  } else {
    fb.querySelector('#next').onclick = nextProblem;
  }
  // SB・LSE EO: 表の最初の手順を自動で流す。表の手順をタップするとその手順に切り替える
  if (anim) {
    fb.querySelectorAll('.soltab tr[data-alg]').forEach((tr) => { tr.onclick = () => playAlg(tr.dataset.alg); });
    playAlg((fb.querySelector('.soltab tr.best[data-alg]') || fb.querySelector('.soltab tr[data-alg]')).dataset.alg);
  }
}

// 解答手順のアニメーション(player.js)。キューブ本体のタップで停止/再生(どちらも最初の盤面から)、左右の余白で 1 手ずつ
let player = null;
function stopAnim() {
  if (player) player.stop();
  player = null;
  if (quiz && quiz.view) quiz.view.onTap = null;
  const l = app.querySelector('#animlabel');
  if (l) l.hidden = true;
}

function playAlg(alg) {
  if (!quiz) return;
  stopAnim();
  const p = quiz.current;
  app.querySelectorAll('.soltab tr[data-alg]').forEach((tr) => tr.classList.toggle('playing', tr.dataset.alg === alg));
  const label = app.querySelector('#animlabel');
  label.hidden = false;
  const pl = new Player(quiz.view, { label }).load(p.colors, p.highlight, alg);
  player = pl;
  quiz.view.onTap = (side) => pl.tap(side);
  pl.start();
}

// LSE EO / EOLR を入力した手順で揃えたか
const lseSolves = (p, moves) => (p.eolr ? solvesEolr : solvesEo)(p.colors, moves);

// LSE EO の解答例: QSTM で最短の手順
function lseEoTable(p) {
  const rows = p.lseSols.map((alg, i) => `<tr class="best" data-alg="${esc(alg)}">${i ? '' : `<th rowspan="${p.lseSols.length}" class="sq">${p.eolr ? 'EOLR' : 'EO'}</th>`}
      <td class="n">★${p.optQ}手</td><td class="alg">${esc(u2p(alg))}</td></tr>`).join('');
  return `<div class="soltitle">QSTM(90°ごとに1手、180°は2手)</div><table class="soltab">${rows}</table>`;
}

// SB の解答例: square ごとに短い順。最短の行を強調する
function sbTable(p) {
  const htm = (alg) => alg.split(' ').length;
  const qtm = (alg) => alg.split(' ').reduce((a, m) => a + (m.endsWith('2') ? 2 : 1), 0);
  const table = (sols, count) => {
    const best = Math.min(...Object.values(sols).map((l) => count(l[0])));
    const rows = Object.entries(sols).map(([k, list]) => list.map((alg, i) => {
      const n = count(alg);
      return `<tr class="${n === best ? 'best' : ''}" data-alg="${esc(alg)}">${i ? '' : `<th rowspan="${list.length}" class="sq">${k === 'front' ? 'Front' : 'Back'}</th>`}
      <td class="n">${n === best ? '★' : ''}${n}手</td>
      <td class="alg">${esc(u2p(alg))}</td></tr>`;
    }).join('')).join('');
    return `<table class="soltab">${rows}</table>`;
  };
  return `${p.qtmSols ? `<div class="soltitle">QSTM(90°ごとに1手、中層も含む)</div>${table(p.qtmSols, qtm)}` : ''}
    <div class="soltitle">STM(中層・180°も1手)</div>${table(p.sbSols, htm)}`;
}

// 入力中の手順。同じ層が続いたら R R → R2 のようにまとめて手数を数える
function showSeq() {
  const el = app.querySelector('#seq');
  if (!el) return;
  const merged = mergeMoves(quiz.seq);
  el.innerHTML = quiz.seq.length
    ? `<span class="mono">${esc(u2p(merged.join(' ')) || '(打ち消し合って0手)')}</span><b>QSTM ${qtmLen(merged)}${quiz.current.lseEo ? '' : ` / STM ${merged.length}`}</b>`
    : '<span class="sub">ボタンを押して手順を入力</span>';
}

// 判定後はボタンを隠して、解答例の表まで 1 画面に収める
function hidePad() {
  app.querySelectorAll('.pad, .padrow').forEach((el) => { el.hidden = true; });
}

// 入力した手順の手数を STM と QSTM で並べ、最短だった方に印を付ける
function seqSummary(p) {
  const merged = mergeMoves(quiz.seq);
  if (p.lseEo) {
    const ok = lseSolves(p, quiz.seq) && qtmLen(merged) <= p.optQ;
    return `<div class="sub seqsum">入力: <span class="mono">${esc(u2p(merged.join(' ')))}</span><br>
    <span class="${ok ? 'hit' : ''}">QSTM ${qtmLen(merged)}手(最短${p.optQ}手)${ok ? ' ✓' : ''}</span></div>`;
  }
  const solved = solvesSquare(p.colors, p.square, quiz.seq);
  const item = (name, n, opt) => `<span class="${solved && n <= opt ? 'hit' : ''}">${name} ${n}手(最短${opt}手)${solved && n <= opt ? ' ✓' : ''}</span>`;
  return `<div class="sub seqsum">入力: <span class="mono">${esc(u2p(merged.join(' ')))}</span><br>
    ${item('QSTM', qtmLen(merged), p.qOptLen ?? '-')} ・ ${item('STM', merged.length, p.optLen)}</div>`;
}

// 入力中の手順をキューブにそのまま反映する。before の盤面から手 m を短く回して今の盤面にする
function seqCube(before, m) {
  const p = quiz.current, view = quiz.view;
  const now = (seq) => [applyAlg(p.colors, seq), p.highlight ? applyAlg(p.highlight.split(''), seq).join('') : null];
  const [cs, hs] = now(quiz.seq);
  view.cancelMove();
  if (!m) { view.setColors(cs, hs); return; }
  view.setColors(...now(before));
  view.beginMove(m);
  view.tween(1, m.includes('2') ? 260 : 180).then((ok) => {
    if (!ok) return;
    view.endMove();
    view.setColors(cs, hs);
  });
}

// SB 手順入力: 入力した手順で square が揃えば正解
function answerSeq(btn) {
  if (!quiz || quiz.answered) return;
  const p = quiz.current;
  if (!quiz.seq.length) { toast('手順を入力してください'); return; }
  quiz.answered = true;
  if (p.lseEo) {
    // LSE EO は QSTM で最短なら正解
    const done = lseSolves(p, quiz.seq);
    const ok = done && qtmLen(mergeMoves(quiz.seq)) <= p.optQ;
    quiz.okVia = '';
    app.querySelector('#seq').classList.add(ok ? 'correct' : 'wrong');
    hidePad();
    settle(ok, btn.getBoundingClientRect(), done ? '揃いましたが最短ではありません' : p.eolr ? 'EOLRが揃っていません' : 'EOとセンターが揃っていません');
    return;
  }
  // STM・QSTM のどちらかで最短なら正解。揃っていても両方で手数が多ければ不正解
  const solved = solvesSquare(p.colors, p.square, quiz.seq);
  const merged = mergeMoves(quiz.seq);
  const stmOk = solved && merged.length <= p.optLen;
  const qOk = solved && qtmLen(merged) <= (p.qOptLen ?? Infinity);
  const ok = stmOk || qOk;
  quiz.okVia = stmOk && qOk ? 'STM・QSTMの両方で最短' : stmOk ? 'STMで最短' : qOk ? 'QSTMで最短' : '';
  app.querySelector('#seq').classList.add(ok ? 'correct' : 'wrong');
  hidePad();
  settle(ok, btn.getBoundingClientRect(), solved ? '揃いましたが最短ではありません' : 'squareが揃いません');
}

// 答えを見る: 正解を表示して不正解として記録する
function reveal() {
  if (!quiz || quiz.answered) return;
  quiz.answered = true;
  const p = quiz.current;
  app.querySelectorAll('.picked').forEach((x) => x.classList.remove('picked'));
  app.querySelectorAll('.choice').forEach((b, k) => b.classList.add(k === p.answer ? 'correct' : 'dim'));
  app.querySelectorAll('.aufbtn').forEach((x) => x.classList.add((p.aufAnswers || []).includes(x.dataset.auf) ? 'correct' : 'dim'));
  hidePad();
  settle(false, app.querySelector('#reveal').getBoundingClientRect(), '答え');
}

// CMLL→EO: 選んだエッジの集合が過不足なく一致したら正解
function answerEo() {
  if (!quiz || quiz.answered) return;
  const p = quiz.current;
  const withAuf = !!p.aufAnswers;
  if (withAuf && quiz.selAuf === null) { toast('先にAUFを選んでください'); return; }
  quiz.answered = true;
  const auf = withAuf ? quiz.selAuf : '';
  // AUF が正しければその AUF で回した後、違えば正解の AUF の結果で答え合わせする
  const entry = p.eoAnswers.find((e) => e.auf === auf);
  const shown = entry || p.eoAnswers[0];
  const sel = new Set(quiz.selEdges);
  const bad = new Set(shown.bad);
  const edgesOk = sel.size === bad.size && [...sel].every((x) => bad.has(x));
  const ok = !!entry && edgesOk;
  if (withAuf) {
    app.querySelectorAll('.aufbtn').forEach((x) => {
      x.classList.remove('picked');
      const a = x.dataset.auf;
      if (p.aufAnswers.includes(a)) x.classList.add('correct');
      else if (a === auf) x.classList.add('wrong');
      else x.classList.add('dim');
    });
  }
  app.querySelectorAll('.eocell').forEach((c) => {
    const pos = c.dataset.pos;
    c.classList.remove('sel');
    if (bad.has(pos) && sel.has(pos)) c.classList.add('hit');
    else if (bad.has(pos)) c.classList.add('miss');
    else if (sel.has(pos)) c.classList.add('extra');
  });
  // 回した後の状態を 3D で見せて確かめられるようにする
  quiz.view.setColors(shown.after.split('').map(Number));
  quiz.view.setView(-55, -20, true);
  const label = app.querySelector('#afterlabel');
  if (label) { label.hidden = false; label.textContent = withAuf ? `${shown.auf || 'AUFなし'} → CMLLを回した後` : 'CMLLを回した後'; }
  const submit = app.querySelector('#eosubmit');
  submit.disabled = true;
  const missed = [...bad].filter((x) => !sel.has(x)).length;
  const extra = [...sel].filter((x) => !bad.has(x)).length;
  let msg = `不正解…(見逃し ${missed} ・ 余分 ${extra})`;
  if (!entry) msg = edgesOk ? 'エッジは正解、AUFが違います' : `不正解…AUFが違います(正しいAUFの場合: 見逃し ${missed} ・ 余分 ${extra})`;
  settle(ok, submit.getBoundingClientRect(), msg);
}

// 42 ケースから練習するケースを個別に選ぶ(セットごとにまとめて切り替えも可)
function openCasePicker() {
  const cfg = practiceCfg();
  const sel = new Set(selectedCases(cfg).map((c) => c.name));
  const body = () => CMLL_SETS.map((set) => {
    const cs = CMLL_CASES.filter((c) => c.set === set);
    const n = cs.filter((c) => sel.has(c.name)).length;
    return `<div class="pick-set"><div class="row between"><b>${set} <span class="sub">${n}/${cs.length}</span></b>
      <button class="chip" data-all="${set}">${n === cs.length ? '全部外す' : '全部選ぶ'}</button></div>
      <div class="pick-grid">${cs.map((c) => `<button class="pick ${sel.has(c.name) ? 'on' : ''}" data-c="${esc(c.name)}">${caseDiagram(c)}</button>`).join('')}</div></div>`;
  }).join('');
  openSheet(`<h3>練習するケースを選ぶ</h3><div class="sub">タップで選択/解除。選んだケースだけが出題されます。</div>
    <div id="pickbody" class="pick-body">${body()}</div>
    <div class="row" style="gap:10px;margin-top:10px"><button class="btn" id="pcancel" style="flex:1;margin:0">やめる</button><button class="btn primary" id="pok" style="flex:2;margin:0">決定(<span id="pn">${sel.size}</span>ケース)</button></div>`,
  (el, close) => {
    const refresh = () => { el.querySelector('#pickbody').innerHTML = body(); el.querySelector('#pn').textContent = sel.size; };
    el.querySelector('#pickbody').onclick = (e) => {
      const all = e.target.closest('[data-all]');
      if (all) {
        const cs = CMLL_CASES.filter((c) => c.set === all.dataset.all);
        const full = cs.every((c) => sel.has(c.name));
        cs.forEach((c) => (full ? sel.delete(c.name) : sel.add(c.name)));
        refresh();
        return;
      }
      const b = e.target.closest('[data-c]');
      if (!b) return;
      sel.has(b.dataset.c) ? sel.delete(b.dataset.c) : sel.add(b.dataset.c);
      refresh();
    };
    el.querySelector('#pcancel').onclick = close;
    el.querySelector('#pok').onclick = () => {
      if (!sel.size) { toast('1つ以上選んでください'); return; }
      const sets = CMLL_SETS.filter((x) => CMLL_CASES.some((c) => c.set === x && sel.has(c.name)));
      const excluded = CMLL_CASES.filter((c) => sets.includes(c.set) && !sel.has(c.name)).map((c) => c.name);
      S.setLastPractice({ ...practiceCfg(), sets, excluded });
      close();
      renderHome();
    };
  });
}

// U 面(上から見た図)の右に、D 面のエッジを後ろ→前の順で縦に並べる(行の高さを揃えて前後を対応させる)
function eoBoard(p) {
  const cell = (pos, label) => `<button class="eocell" data-pos="${pos}"><b>${label}</b><span>${pos}</span></button>`;
  return `<div class="eoboard">
      <div class="eopanel"><div class="eotitle">U面のエッジ</div>
        <div class="eogrid">
          <i></i>${cell('UB', '後')}<i></i>
          ${cell('UL', '左')}<i class="eoc">U</i>${cell('UR', '右')}
          <i></i>${cell('UF', '前')}<i></i>
        </div></div>
      <div class="eopanel"><div class="eotitle">D面のエッジ</div>
        <div class="eodcol">${cell('DB', '後')}<i class="eoc">D</i>${cell('DF', '前')}</div></div>
    </div>
    <div class="row between" style="margin-top:8px;align-items:flex-start;gap:10px">
      <details class="scr" style="margin:0;flex:1;min-width:0"><summary>回す手順を見る</summary><div class="mono">${esc(p.alg)}</div></details>
      <button class="btn primary" id="eosubmit">回答する</button>
    </div>
    <div class="sub" style="margin-top:4px">何も選ばずに回答すると「全部揃う」</div>`;
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
  stopAnim();
  const q = quiz;
  quiz = null;
  if (q && q.mode === 'practice' && q.idx > 0) toast(`おつかれさま!${q.idx}問 ・ 正答率${pct(q.correct, q.idx)}% ・ +${q.xp} XP`);
  render();
}

function setShowD(on) {
  S.updateSettings({ hideD: !on });
  CubeView.hideD = !on;
}
const showDChip = () => `<button class="chip dchip ${S.get().settings.hideD ? '' : 'on'}" id="showd">D面の色を表示</button>`;

// ---------------- SB 学習 ----------------
// 条件に合うケース(square の 3 ピースの置き方)を 12 個ずつ並べ、最短手順で揃うアニメーションを流す。
// 画面に見えているキューブだけ動かす。タップで詳細
let learn = null; // { cfg, list, page, detail(一覧の番号 or null) }
let learnPlayers = [];
let learnObserver = null;
const LEARN_PER = 12;
const learnCond = (cfg) => (cfg.sbBy === 'dr' ? pieceCond(cfg) : { side: cfg.sbSide, len: sbLenOf(cfg), lenMax: sbLenMaxOf(cfg), metric: cfg.sbMetric });
const learnMemo = new Map();
function learnList(cfg) {
  const key = JSON.stringify(learnCond(cfg));
  if (!learnMemo.has(key)) learnMemo.set(key, sbCatalog(learnCond(cfg)));
  return learnMemo.get(key);
}

function stopLearnPlayers() {
  learnPlayers.forEach((pl) => pl.stop());
  learnPlayers = [];
  if (learnObserver) learnObserver.disconnect();
  learnObserver = null;
}
function closeLearnState() {
  stopLearnPlayers();
  learn = null;
}
function openLearn(cfg) {
  learn = { cfg, list: learnList(cfg), page: 0, detail: null };
  render();
}
function newLearnView(host, scale) {
  const view = new CubeView(host, { scale });
  const st = S.get().settings;
  view.setScheme(st.up, st.front);
  view.setView(...DRILLS.cmll.view);
  return view;
}

function renderLearn() {
  stopLearnPlayers();
  const { cfg, list } = learn;
  const pages = Math.max(1, Math.ceil(list.length / LEARN_PER));
  learn.page = Math.max(0, Math.min(learn.page, pages - 1));
  const start = learn.page * LEARN_PER;
  const items = list.slice(start, start + LEARN_PER);
  const cond = cfg.sbBy === 'dr' ? pieceLabel(cfg) : `${cfg.sbMetric === 'qstm' ? 'QSTM ' : 'STM '}${sbLenLabel(cfg)}`;
  const pager = (id) => (pages > 1 ? `<div class="pager" id="${id}"><button data-pg="-1" ${learn.page ? '' : 'disabled'}>‹ 前へ</button><span class="sub">${learn.page + 1} / ${pages} ページ</span><button data-pg="1" ${learn.page < pages - 1 ? '' : 'disabled'}>次へ ›</button></div>` : '');
  app.innerHTML = `
    <div class="quiz-top">
      <button class="x" id="lclose">✕</button>
      <div style="text-align:center;flex:1;min-width:0"><div style="font-weight:800">SB 学習 ・ ${SQ_LABEL[cfg.sbSide]}</div><div class="sub">${esc(cond)} ・ ${list.length}ケース</div></div>
      <div style="width:40px"></div>
    </div>
    <div class="dbar"><button class="chip dchip" id="lplay">${learn.paused ? '▶ 全て再生' : '⏸ 全て停止'}</button>${showDChip()}</div>
    ${list.length ? '' : '<div class="card sub">条件に合うケースがありません。</div>'}
    ${pager('pgtop')}
    <div class="lgrid">${items.map((c, i) => `<div class="lcell" data-i="${i}"><div class="lscene"></div>
      <div class="lcap"></div></div>`).join('')}</div>
    ${pager('pgbot')}
    <div class="sub" style="text-align:center;margin-top:6px">キューブをタップすると詳しく見られます。</div>`;
  app.querySelector('#lclose').onclick = () => { closeLearnState(); render(); };
  app.querySelector('#showd').onclick = () => { setShowD(!!S.get().settings.hideD); renderLearn(); };
  app.querySelectorAll('.pager').forEach((el) => {
    el.onclick = (e) => { const b = e.target.closest('[data-pg]'); if (b) { learn.page += Number(b.dataset.pg); renderLearn(); window.scrollTo(0, 0); } };
  });
  const cells = [...app.querySelectorAll('.lcell')];
  const entries = new Map();
  items.forEach((c, i) => {
    const view = newLearnView(cells[i].querySelector('.lscene'), 0.5);
    const p = sbCaseProblem(c.side, c.id);
    const pl = new Player(view, { sound: false, label: cells[i].querySelector('.lcap') }).load(p.colors, p.highlight, p.qtmSols[p.square][0]);
    pl.paused = true;
    learnPlayers.push(pl);
    entries.set(cells[i], pl);
    view.onTap = () => { learn.detail = start + i; render(); };
    cells[i].querySelector('.lcap').onclick = view.onTap;
  });
  // 見えているキューブだけ動かす。始まりを少しずつずらして、全部が同時に回らないようにする
  const visible = new Set();
  learnObserver = new IntersectionObserver((list2) => {
    for (const en of list2) {
      const pl = entries.get(en.target);
      if (!pl) continue;
      if (en.isIntersecting) {
        visible.add(pl);
        if (!learn.paused) setTimeout(() => { if (learn && !learn.paused && visible.has(pl)) pl.resume(); }, Math.random() * 700);
      } else { visible.delete(pl); pl.pause(); }
    }
  }, { threshold: 0.2 });
  // 全て停止(最初の盤面に戻す) / 全て再生(ページを移っても続く)
  app.querySelector('#lplay').onclick = (e) => {
    learn.paused = !learn.paused;
    e.target.textContent = learn.paused ? '▶ 全て再生' : '⏸ 全て停止';
    if (learn.paused) learnPlayers.forEach((pl) => pl.rewind());
    else visible.forEach((pl) => pl.resume());
  };
  cells.forEach((c) => learnObserver.observe(c));
}

function renderLearnDetail() {
  stopLearnPlayers();
  const { cfg, list } = learn;
  const idx = learn.detail;
  const c = list[idx];
  const p = sbCaseProblem(c.side, c.id);
  const rec = (S.get().sbCaseStats || {})[`${c.side}#${c.id}`];
  app.innerHTML = `
    <div class="quiz-top">
      <button class="x" id="lback" aria-label="一覧へ">‹</button>
      <div style="text-align:center;flex:1"><div style="font-weight:800">${SQ_LABEL[c.side]} ・ ケース ${idx + 1} / ${list.length}</div><div class="sub">最短 QSTM ${c.qstm}手 / STM ${c.stm}手</div></div>
      <div style="width:40px"></div>
    </div>
    <div class="dbar">${showDChip()}</div>
    <div id="lscene" class="scene anim-view"></div>
    <div class="pager"><button id="lprev" ${idx ? '' : 'disabled'}>‹ 前のケース</button><button id="lnext" ${idx < list.length - 1 ? '' : 'disabled'}>次のケース ›</button></div>
    <div class="sub lrec">${rec ? `このケースの練習: ${rec.n}回 ・ 正解 ${rec.correct}回(${pct(rec.correct, rec.n)}%)` : 'このケースはまだ練習していません'}</div>
    <div class="feedback">${sbTable(p)}<div class="animhint">キューブをタップで停止/再生(どちらも最初の局面から)、右の余白で1手進む、左の余白で1手戻る。表の手順をタップするとその手順を再生します</div></div>
    <button class="btn primary" id="lpractice" style="margin-top:12px">このケースを練習<small>手順入力で、このケースだけをくり返し出題します</small></button>`;
  const sceneEl = app.querySelector('#lscene');
  const view = newLearnView(sceneEl, 0.48);
  const label = document.createElement('div');
  label.className = 'anim-label';
  sceneEl.appendChild(label);
  const play = (alg) => {
    stopLearnPlayers();
    app.querySelectorAll('.soltab tr[data-alg]').forEach((tr) => tr.classList.toggle('playing', tr.dataset.alg === alg));
    const pl = new Player(view, { label }).load(p.colors, p.highlight, alg);
    learnPlayers.push(pl);
    view.onTap = (side) => pl.tap(side);
    pl.start();
  };
  app.querySelectorAll('.soltab tr[data-alg]').forEach((tr) => { tr.onclick = () => play(tr.dataset.alg); });
  play(app.querySelector('.soltab tr[data-alg]').dataset.alg);
  const go = (d) => { learn.detail = idx + d; renderLearnDetail(); window.scrollTo(0, 0); };
  app.querySelector('#lback').onclick = () => { learn.page = Math.floor(idx / LEARN_PER); learn.detail = null; render(); };
  app.querySelector('#showd').onclick = () => { setShowD(!!S.get().settings.hideD); renderLearnDetail(); };
  app.querySelector('#lprev').onclick = () => go(-1);
  app.querySelector('#lnext').onclick = () => go(1);
  app.querySelector('#lpractice').onclick = () => {
    stopLearnPlayers();
    startQuiz('practice', { ...cfg, menu: 'sbSolve', sbSide: c.side, caseNo: c.id });
  };
}

// ---------------- 記録 ----------------
function renderHistory() {
  const tabs = { calendar: '日別', tests: 'タイム', cases: 'ケース別', review: '復習', badges: 'バッジ' };
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
      ${Object.entries(sel.practice).map(([dr, p]) => `<tr><td>${drillName(dr)}</td><td class="r">${p.n}問</td><td class="r">${p.n ? pct(p.correct, p.n) + '%' : '-'}</td><td class="r">${p.testN}問</td><td class="r">${p.testN ? pct(p.testCorrect, p.testN) + '%' : '-'}</td></tr>`).join('')}
      </table>
      ${sel.tests.length ? `<h2>この日のテスト</h2><table>${sel.tests.map((t) => `<tr><td>${drillName(t.drill)} ${t.n}問 <span class="sub">${esc(cfgLabel(t.cfg))}</span></td><td class="r mono">${fmtTime(t.timeMs)}</td><td class="r">${pct(t.correct, t.n)}%</td></tr>`).join('')}</table>` : ''}`;
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

let timeSrc = 'test';
// ケースごとの解答タイムの推移(1ケース1グラフ)
function histTests(body) {
  caseSlot ||= S.get().settings.algSlot;
  const drill = caseSlot === 'oh' ? `${caseMode}Oh` : caseMode;
  const times = (S.get().caseTimes || {})[drill] || {};
  const rows = CMLL_CASES.map((c) => {
    const all = (times[c.name] || []).filter((t) => timeSrc === 'all' || t[3]);
    const okT = all.filter((t) => t[2]).map((t) => t[1]);
    const recent = okT.slice(-5);
    return { c, all, avg: recent.length ? recent.reduce((a, v) => a + v, 0) / recent.length : null, best: okT.length ? Math.min(...okT) : null };
  });
  const seen = rows.filter((r) => r.all.length).sort((a, b) => (b.avg ?? Infinity) - (a.avg ?? Infinity));
  const unseen = rows.length - seen.length;
  const sec = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(2)}秒`);
  body.innerHTML = `
    <div class="chips" id="cslot" style="margin-bottom:8px">${Object.entries(SLOT_NAMES).map(([k, v]) => `<button class="chip ${caseSlot === k ? 'on' : ''}" data-s="${k}">${v}</button>`).join('')}</div>
    <div class="chips" id="cmode" style="margin-bottom:8px">${CASE_MODES.map(([k, v]) => `<button class="chip ${caseMode === k ? 'on' : ''}" data-m="${k}">${v}</button>`).join('')}</div>
    <div class="chips" id="tsrc" style="margin-bottom:12px">${[['test', 'テストのみ'], ['all', '練習も含む']].map(([k, v]) => `<button class="chip ${timeSrc === k ? 'on' : ''}" data-t="${k}">${v}</button>`).join('')}</div>
    <div class="sub" style="margin-bottom:8px">1問ごとの解答タイム(問題が出てから答えるまで)。緑=正解、赤=不正解。平均は直近5回の正解から。遅いケースが上。</div>
    ${seen.length ? seen.map(({ c, all, avg, best }) => `<div class="card tcase">
      <div class="row between"><div class="row" style="gap:10px">${caseDiagram(c)}<div><b>${c.set}</b> <span class="sub">${all.length}回</span><div class="mono" style="font-size:11px">${esc(algFor(c, caseSlot))}</div></div></div>
      <div style="text-align:right"><div class="sub">平均</div><div class="mono"><b>${sec(avg)}</b></div><div class="sub">ベスト ${sec(best)}</div></div></div>
      ${caseChart(all)}</div>`).join('') : '<div class="empty">まだ記録がありません。<br>問題に答えるとケースごとのタイムが記録されます。</div>'}
    ${seen.length && unseen ? `<div class="sub" style="text-align:center">記録のないケース ${unseen}個</div>` : ''}`;
  body.querySelector('#cslot').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { caseSlot = b.dataset.s; renderHistory(); } };
  body.querySelector('#cmode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { caseMode = b.dataset.m; renderHistory(); } };
  body.querySelector('#tsrc').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { timeSrc = b.dataset.t; renderHistory(); } };
}

function caseChart(all) {
  const pts = all.slice(-30);
  if (pts.length < 2) return '<div class="sub" style="padding:6px 0">2回以上解くとグラフが表示されます</div>';
  const W = 320, H = 110, L = 34, R = 8, T = 10, B = 16;
  const v = pts.map((t) => t[1] / 1000);
  const max = Math.max(...v), min = Math.min(...v);
  const span = max - min || 1;
  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (s) => H - B - ((s - min) / span) * (H - T - B);
  const path = v.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(' ');
  const day = (t) => { const d = new Date(t[0]); return `${d.getMonth() + 1}/${d.getDate()}`; };
  return `<svg class="chart small" viewBox="0 0 ${W} ${H}">
    <text x="${L - 4}" y="${y(max) + 4}" fill="#9aa3b5" font-size="10" text-anchor="end">${max.toFixed(1)}s</text>
    <text x="${L - 4}" y="${y(min) + 4}" fill="#9aa3b5" font-size="10" text-anchor="end">${min.toFixed(1)}s</text>
    <text x="${L}" y="${H - 2}" fill="#9aa3b5" font-size="10">${day(pts[0])}</text>
    <text x="${W - R}" y="${H - 2}" fill="#9aa3b5" font-size="10" text-anchor="end">${day(pts[pts.length - 1])}</text>
    <path d="${path}" fill="none" stroke="#4c8dff" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((t, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v[i]).toFixed(1)}" r="3.5" fill="${t[2] ? '#2ecc71' : '#ff5a5a'}"/>`).join('')}
  </svg>`;
}

const CASE_MODES = [['cmll', '手順・AUFなし'], ['cmllAuf', '手順・AUFランダム'], ['cmllEo', 'EO・AUFなし'], ['cmllEoAuf', 'EO・AUFランダム']];
let caseMode = 'cmll';
let caseSlot = null;
function histCases(body) {
  caseSlot ||= S.get().settings.algSlot;
  const stats = S.get().caseStats[caseSlot === 'oh' ? `${caseMode}Oh` : caseMode] || {};
  const rows = CMLL_CASES.map((c) => ({ c, s: stats[c.name] || { n: 0, correct: 0 } }));
  const seen = rows.filter((r) => r.s.n).sort((a, b) => a.s.correct / a.s.n - b.s.correct / b.s.n || b.s.n - a.s.n);
  const unseen = rows.filter((r) => !r.s.n);
  const mastered = rows.filter((r) => r.s.correct > 0).length;
  body.innerHTML = `
    <div class="chips" id="cslot" style="margin-bottom:8px">${Object.entries(SLOT_NAMES).map(([k, v]) => `<button class="chip ${caseSlot === k ? 'on' : ''}" data-s="${k}">${v}</button>`).join('')}</div>
    <div class="chips" id="cmode" style="margin-bottom:12px">${CASE_MODES.map(([k, v]) => `<button class="chip ${caseMode === k ? 'on' : ''}" data-m="${k}">${v}</button>`).join('')}</div>
    <div class="card row between"><div><div class="sub">正解したことのあるケース</div><div class="big">${mastered}<span style="font-size:14px"> / 42</span></div></div>
      <div class="bar" style="width:120px"><i style="width:${pct(mastered, 42)}%"></i></div></div>
    <div class="card"><div class="sub" style="margin-bottom:6px">正答率の低い順(苦手ケースが上)</div>
    <table><tr><th>セット</th><th>手順</th><th class="r">回数</th><th class="r">正答率</th></tr>
    ${seen.map(({ c, s }) => { const p = pct(s.correct, s.n); return `<tr><td>${c.set}</td><td class="mono" style="font-size:11px">${esc(algFor(c, caseSlot))}</td><td class="r">${s.n}</td><td class="r"><span class="acc-bar"><i style="width:${p}%;background:${accColor(p)}"></i></span> ${p}%</td></tr>`; }).join('')}
    ${unseen.map(({ c }) => `<tr style="opacity:.45"><td>${c.set}</td><td class="mono" style="font-size:11px">${esc(algFor(c, caseSlot))}</td><td class="r">0</td><td class="r">未出題</td></tr>`).join('')}
    </table></div>`;
  body.querySelector('#cslot').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { caseSlot = b.dataset.s; renderHistory(); } };
  body.querySelector('#cmode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { caseMode = b.dataset.m; renderHistory(); } };
}

function histReview(body) {
  const ms = liveMistakes();
  if (!ms.length) { body.innerHTML = '<div class="empty">間違えた問題はありません 🎉</div>'; return; }
  body.innerHTML = `
    <button class="btn primary" id="rev">まとめて復習(最大20問)<small>正解すると一覧から消えます</small></button>
    <div class="card">${ms.slice(0, 100).map((m) => `<div class="mistake"><div><b>${drillName(m.drill)}</b> <span class="mono" style="font-size:12px">${esc(m.problem.explain)}</span></div>
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
      <label class="set"><span>SB の3DでD面の色を表示<small class="sub" style="display:block">オフにすると、色の付いたピースの D 面の色(${COLOR_JA[scheme[3]]})のステッカーを灰色にします</small></span><input type="checkbox" id="showd" ${s.hideD ? '' : 'checked'}></label>
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
  $('#showd').onchange = (e) => setShowD(e.target.checked);
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
CubeView.hideD = !!S.get().settings.hideD;
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
// 更新の即時反映: 起動時とアプリに戻ったときに新しい版を確かめ、入れ替わったら読み込み直す。
// 練習中・学習画面ではホームに戻るまで待つ(記録は解答ごとに保存済み)
function reloadIfIdle() {
  if (pendingReload && !quiz && !learn) location.reload();
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    pendingReload = true;
    reloadIfIdle();
  });
}
render();
if (S.openToday()) {
  const streak = S.streakNow();
  const t = S.today();
  showModal(`<div class="huge">🎁</div><h3>ログインボーナス</h3><div class="sub">ログインで +10 XP!<br>今日のノルマ ${S.get().settings.dailyGoal}問 をクリアすると<br>スタンプと ${S.stampReward(streak + 1)} XP がもらえます</div>
    ${stampCard(streak, t.goalDone)}<div style="height:12px"></div>`, render);
}
