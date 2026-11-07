// 記録・連続日数・XP の保存(localStorage)
const KEY = 'rouxTrainer.v1';

export const DEFAULT_SETTINGS = {
  up: 'yellow', front: 'green', sound: true, dailyGoal: 20, autoNext: true, algSlot: 'two',
};

function emptyData() {
  return {
    version: 1,
    createdAt: Date.now(),
    xp: 0,
    days: {},
    streak: { current: 0, best: 0, lastGoalDay: null },
    stamps: 0,
    caseStats: {},
    caseTimes: {},
    mistakes: [],
    tests: [],
    ratings: {},
    badges: {},
    lastOpenDay: null,
    lastPractice: null,
    customAlgs: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { ...emptyData(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
    }
  } catch (e) { /* 読めないときは新規 */ }
  return emptyData();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 容量超過など */ }
}

export const get = () => data;

export function today() {
  const k = dayKey();
  data.days[k] ||= { practice: {}, tests: [], goalDone: false, xp: 0 };
  return data.days[k];
}

// ---------- レベル ----------
export function levelInfo(xp = data.xp) {
  let level = 1, need = 100, rest = xp;
  while (rest >= need) { rest -= need; level++; need = 100 + (level - 1) * 30; }
  return { level, into: rest, need };
}

function addXp(n, events) {
  const before = levelInfo().level;
  data.xp += n;
  today().xp += n;
  const after = levelInfo().level;
  if (after > before) events.push({ type: 'levelup', level: after });
}

// ---------- 連続日数 ----------
export function streakNow() {
  const s = data.streak;
  const t = dayKey();
  if (s.lastGoalDay === t || s.lastGoalDay === addDays(t, -1)) return s.current;
  return 0;
}

export function stampReward(day) {
  // 7 日周期のスタンプカード。7 日目は大当たり
  const pos = ((day - 1) % 7) + 1;
  return pos === 7 ? 300 : 40 + pos * 15;
}

// アプリを開いたときに呼ぶ。今日初めてなら true
export function openToday() {
  const t = dayKey();
  if (data.lastOpenDay === t) return false;
  data.lastOpenDay = t;
  const events = [];
  addXp(10, events);
  save();
  return true;
}

// ---------- 解答の記録 ----------
const COMBO_CAP = 10;

export function recordAnswer({ drill, caseKey, ok, mode, combo, problem, timeMs, sbCase, rateQ }) {
  const events = [];
  // レート: 最短手数(QSTM)がわかる問題だけ。復習は対象外
  const rating = rateQ != null && RATED.includes(drill) && mode !== 'review' ? applyRating(drill, rateQ, ok, events) : null;
  // SB の square の置き方ごとの記録(学習モードの詳細で見る)
  if (sbCase) {
    const c = ((data.sbCaseStats ||= {})[sbCase] ||= { n: 0, correct: 0 });
    c.n++;
    if (ok) c.correct++;
  }
  const d = today();
  const p = (d.practice[drill] ||= { n: 0, correct: 0, testN: 0, testCorrect: 0 });
  if (mode === 'test') { p.testN++; if (ok) p.testCorrect++; } else { p.n++; if (ok) p.correct++; }
  const cs = ((data.caseStats[drill] ||= {})[caseKey] ||= { n: 0, correct: 0 });
  cs.n++;
  if (ok) cs.correct++;
  // ケースごとの解答タイム [日時, ミリ秒, 正解なら1, テストなら1]。各ケース直近100件
  if (timeMs > 0 && mode !== 'review') {
    data.caseTimes ||= {};
    const arr = ((data.caseTimes[drill] ||= {})[caseKey] ||= []);
    arr.push([Date.now(), Math.round(timeMs), ok ? 1 : 0, mode === 'test' ? 1 : 0]);
    if (arr.length > 100) arr.splice(0, arr.length - 100);
  }

  let gained = 0;
  if (ok) gained = 10 + Math.min(combo, COMBO_CAP) * 2;
  else gained = 2;
  addXp(gained, events);

  if (!ok && problem) {
    data.mistakes.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), drill, problem });
    data.mistakes = data.mistakes.slice(0, 150);
  }

  const total = Object.values(d.practice).reduce((a, x) => a + x.n + x.testN, 0);
  if (!d.goalDone && total >= data.settings.dailyGoal) {
    d.goalDone = true;
    const s = data.streak;
    const yesterday = addDays(dayKey(), -1);
    s.current = s.lastGoalDay === yesterday ? s.current + 1 : 1;
    s.lastGoalDay = dayKey();
    s.best = Math.max(s.best, s.current);
    data.stamps++;
    const bonus = stampReward(s.current);
    addXp(bonus, events);
    events.push({ type: 'goal', streak: s.current, bonus });
  }
  checkBadges(events);
  save();
  return { gained, events, rating };
}

export function removeMistake(id) {
  data.mistakes = data.mistakes.filter((m) => m.id !== id);
  save();
}

export function recordTest({ drill, cfg, n, correct, timeMs }) {
  const events = [];
  const key = `${drill}|${cfg}|${n}`;
  const prev = bestTest(key);
  const rec = { key, drill, cfg, n, correct, timeMs, at: Date.now(), day: dayKey() };
  data.tests.push(rec);
  today().tests.push({ drill, cfg, n, correct, timeMs });
  const qualifies = correct / n >= 0.9;
  const pb = qualifies && (!prev || timeMs < prev.timeMs);
  addXp(30 + correct * 3 + (pb ? 100 : 0), events);
  if (pb) events.push({ type: 'pb', prev: prev ? prev.timeMs : null });
  checkBadges(events);
  save();
  return { pb, prev, events };
}

export function bestTest(key) {
  return data.tests.filter((t) => t.key === key && t.correct / t.n >= 0.9)
    .reduce((b, t) => (!b || t.timeMs < b.timeMs ? t : b), null);
}

// ---------- レート(イロレート風) ----------
// モードごとに 1 つ。問題の難易度レートは最短手数(QSTM)から決める: 2手=600、1手増えるごとに +100
export const RATED = ['sbSq', 'sbSolve', 'lseEo', 'eolr', 'eolrb'];
export const RATING_START = 1000;
export const diffRating = (q) => 400 + 100 * q;
// レートに合う最短手数(この手数の問題で正解率がちょうど 50%)
export const lenForRating = (r) => (r - 400) / 100;
export const RANKS = [
  { min: 0, name: 'ブロンズ', icon: '🥉' },
  { min: 800, name: 'シルバー', icon: '🥈' },
  { min: 1000, name: 'ゴールド', icon: '🥇' },
  { min: 1200, name: 'プラチナ', icon: '💠' },
  { min: 1400, name: 'ダイヤ', icon: '💎' },
  { min: 1600, name: 'マスター', icon: '👑' },
  { min: 1800, name: 'グランドマスター', icon: '🏆' },
];
export const rankIndex = (r) => RANKS.reduce((a, x, i) => (r >= x.min ? i : a), 0);
export const rankOf = (r) => RANKS[rankIndex(r)];
// 正解できそうな確率
export const expectScore = (r, q) => 1 / (1 + 10 ** ((diffRating(q) - r) / 400));

export function ratingOf(drill) {
  const x = (data.ratings || {})[drill];
  return x || { r: RATING_START, n: 0, best: RATING_START, peakRank: rankIndex(RATING_START), hist: [] };
}
// 今日のレートの増減
export const ratingToday = (drill) => (today().rate || {})[drill] || 0;

function applyRating(drill, q, ok, events) {
  data.ratings ||= {};
  const x = (data.ratings[drill] ||= ratingOf(drill));
  const before = x.r;
  // 最初の 30 問は早く実力に近づくよう大きめに動かす
  const K = x.n < 30 ? 48 : 32;
  let delta = Math.round(K * ((ok ? 1 : 0) - expectScore(before, q)));
  if (ok && delta < 1) delta = 1;
  if (!ok && delta > -1) delta = -1;
  x.r = Math.max(100, before + delta);
  delta = x.r - before;
  x.n++;
  x.best = Math.max(x.best, x.r);
  x.hist.push([Date.now(), x.r, ok ? 1 : 0, q]);
  if (x.hist.length > 300) x.hist.splice(0, x.hist.length - 300);
  const t = today();
  (t.rate ||= {})[drill] = (t.rate[drill] || 0) + delta;
  // 段位が今までの最高を超えたときだけ演出する
  const ri = rankIndex(x.r);
  if (ri > (x.peakRank ?? 0)) { x.peakRank = ri; events.push({ type: 'rankup', drill, rank: RANKS[ri], r: x.r }); }
  return { before, after: x.r, delta, q };
}

// ---------- バッジ ----------
export const BADGES = [
  { id: 'first', name: 'はじめの一歩', desc: '初めて問題に答えた', test: (s) => s.total >= 1 },
  { id: 'q100', name: '百問斬り', desc: '累計100問', test: (s) => s.total >= 100 },
  { id: 'q1000', name: '千本ノック', desc: '累計1000問', test: (s) => s.total >= 1000 },
  { id: 'streak3', name: '三日坊主じゃない', desc: '3日連続ノルマ達成', test: (s) => s.bestStreak >= 3 },
  { id: 'streak7', name: '一週間皆勤', desc: '7日連続ノルマ達成', test: (s) => s.bestStreak >= 7 },
  { id: 'streak30', name: '習慣の鬼', desc: '30日連続ノルマ達成', test: (s) => s.bestStreak >= 30 },
  { id: 'test1', name: '腕試し', desc: 'テストモードを完走', test: (s) => s.tests >= 1 },
  { id: 'perfect', name: 'パーフェクト', desc: 'テストで全問正解', test: (s) => s.perfect },
  { id: 'cmllAll', name: 'CMLLコンプリート', desc: 'CMLL全42ケースを正解', test: (s) => s.cmllCases >= 42 },
  { id: 'lv10', name: 'ベテラン', desc: 'レベル10到達', test: (s) => s.level >= 10 },
];

function summary() {
  let total = 0;
  for (const d of Object.values(data.days)) for (const p of Object.values(d.practice)) total += p.n + p.testN;
  // どのモード・両手/片手でも、一度正解したケースを数える
  const cm = {};
  for (const key of ['cmll', 'cmllAuf', 'cmllOh', 'cmllAufOh']) {
    for (const [k, v] of Object.entries(data.caseStats[key] || {})) if (v.correct > 0 || !cm[k]) cm[k] = v;
  }
  return {
    total,
    bestStreak: data.streak.best,
    tests: data.tests.length,
    perfect: data.tests.some((t) => t.correct === t.n),
    cmllCases: Object.values(cm).filter((c) => c.correct > 0).length,
    level: levelInfo().level,
  };
}

function checkBadges(events) {
  const s = summary();
  for (const b of BADGES) {
    if (!data.badges[b.id] && b.test(s)) {
      data.badges[b.id] = Date.now();
      events.push({ type: 'badge', badge: b });
    }
  }
}

export function setLastPractice(cfg) {
  data.lastPractice = cfg;
  save();
}

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  save();
}

// ---------- 自分の手順 ----------
// customAlgs[ケース名] = { two: '...', oh: '...' }(未設定の枠は初期手順)
export function customAlg(caseName, slot) {
  const c = data.customAlgs[caseName];
  return c && c[slot] ? c[slot] : null;
}

export function setCustomAlg(caseName, slot, alg) {
  const c = (data.customAlgs[caseName] ||= {});
  if (alg) c[slot] = alg; else delete c[slot];
  save();
}

// ---------- バックアップ ----------
export function exportJson() {
  return JSON.stringify(data, null, 1);
}

export function importJson(text) {
  const d = JSON.parse(text);
  if (!d || d.version !== 1 || typeof d.days !== 'object') throw new Error('形式が違います');
  data = { ...emptyData(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  save();
}

export function resetAll() {
  data = emptyData();
  save();
}
