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
    mistakes: [],
    tests: [],
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

export function recordAnswer({ drill, caseKey, ok, mode, combo, problem }) {
  const events = [];
  const d = today();
  const p = (d.practice[drill] ||= { n: 0, correct: 0, testN: 0, testCorrect: 0 });
  if (mode === 'test') { p.testN++; if (ok) p.testCorrect++; } else { p.n++; if (ok) p.correct++; }
  const cs = ((data.caseStats[drill] ||= {})[caseKey] ||= { n: 0, correct: 0 });
  cs.n++;
  if (ok) cs.correct++;

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
  return { gained, events };
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
  const cm = { ...(data.caseStats.cmllAuf || {}) };
  for (const [k, v] of Object.entries(data.caseStats.cmll || {})) if (v.correct > 0 || !cm[k]) cm[k] = v;
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
