// 出題の生成。各問題は表示用の色配列・選択肢・正解番号を持つ。
import * as C from './cube.js';
import { BlockSolver, trackedSolved, trackedApply, colorsOf } from './solver.js';
import { CMLL_ALGS, CMLL_SETS, OCLL_REF } from './cmll.js';

const AUFS = ['', 'U', 'U2', "U'"];
const FACE_MOVES = C.expandMoveSet(['U', 'D', 'R', 'L', 'F', 'B']);
const FB_MOVES = C.expandMoveSet(['U', 'D', 'R', 'L', 'F', 'B', 'M', 'r']);
const SB_MOVES = C.expandMoveSet(['U', 'R', 'r', 'M']);
const LSE_MOVES = C.expandMoveSet(['U', 'M']);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const parse = (s) => (s ? C.parseAlg(s) : []);

// ---------- CMLL ----------
const UC = C.piecesStickers(C.U_CORNERS);
const CORNER_POS = C.U_CORNERS.map((n) => C.piecesStickers([n]));

function oriKey(state) {
  let best = null;
  for (const a of AUFS) {
    const s = C.applyAlg(state, parse(a));
    const k = CORNER_POS.map((st) => st.map((i) => (s[i] === 0 ? C.STICKERS[i].face : '')).join('')).join('-');
    if (best === null || k < best) best = k;
  }
  return best;
}

// 持ち替え 24 通り(手順に x / y / z が含まれる場合の補正用)
const ROTATIONS = (() => {
  const out = [];
  const seen = new Set();
  let frontier = [[]];
  while (frontier.length) {
    const next = [];
    for (const seq of frontier) {
      const k = C.applyAlg(C.solved(), seq).join('');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(seq);
      for (const r of ['x', 'y', 'z']) next.push([...seq, r]);
    }
    frontier = next;
  }
  return out;
})();

// F2B が揃う向きへの持ち替え(なければ null)
function f2bRotation(state) {
  return ROTATIONS.find((q) => C.isSolvedAt(C.applyAlg(state, q), C.F2B_STICKERS)) || null;
}

// F2B が揃う向きに持ち替えた状態を返す(揃わなければ null)
function orientF2B(state) {
  const q = f2bRotation(state);
  return q ? C.applyAlg(state, q) : null;
}

// 手順の逆で作った盤面から CMLL ケースの識別子を求める(手順前後の AUF は同一視)
function caseKeyOfInverse(inv) {
  let best = null;
  for (const b of AUFS) {
    const s0 = orientF2B(C.applyAlg(C.applyAlg(C.solved(), parse(b)), inv));
    if (!s0) return null;
    for (const a of AUFS) {
      const s = C.applyAlg(s0, parse(a));
      const k = UC.map((i) => s[i]).join('');
      if (best === null || k < best) best = k;
    }
  }
  return best;
}

const SET_BY_ORI = {};
for (const [name, alg] of Object.entries(OCLL_REF)) {
  SET_BY_ORI[oriKey(C.applyAlg(C.solved(), C.invertAlg(parse(alg))))] = name;
}

export const CMLL_CASES = CMLL_ALGS.map((alg) => {
  const moves = C.parseAlg(alg);
  const inv = C.invertAlg(moves);
  const set = SET_BY_ORI[oriKey(C.applyAlg(C.solved(), inv))];
  return { alg, moves, inv, set, key: caseKeyOfInverse(inv) };
});
const CASE_BY_KEY = new Map(CMLL_CASES.map((c) => [c.key, c]));

// 貼り付けられた手順がどの CMLL ケースを解くか。読めない・F2B が崩れる・CMLL でない場合は理由を返す。
// 実際にその盤面(F2B は左右)に手順をかけて確かめる。最後の持ち替えと前後の AUF は許す。
const cornersUpToAuf = (s) => AUFS.some((a) => C.isSolvedAt(C.applyAlg(s, parse(a)), UC));
export function solvesCase(c, moves) {
  const P = C.applyAlg(C.solved(), c.inv);
  return AUFS.some((a) => {
    const s = orientF2B(C.applyAlg(C.applyAlg(P, parse(a)), moves));
    return s && cornersUpToAuf(s);
  });
}

export function identifyCmll(text) {
  let moves;
  try { moves = C.parseAlg(text); } catch (e) { return { error: e.message }; }
  if (!moves.length) return { error: '手順が空です' };
  const c = CMLL_CASES.find((k) => solvesCase(k, moves));
  if (c) return { case: c, moves };
  if (!orientF2B(C.applyAlg(C.solved(), moves))) return { error: 'F2B(左右のブロック)が崩れる手順です' };
  return { error: 'どのCMLLケースも解けない手順です' };
}

const counters = {};
for (const c of CMLL_CASES) {
  counters[c.set] = (counters[c.set] || 0) + 1;
  c.name = `${c.set} ${counters[c.set]}`;
}

// ---------- ソルバー(遅延生成) ----------
let fbSolver = null, sbSolver = null;
const getFb = () => (fbSolver ||= new BlockSolver(C.FB_PIECES, FB_MOVES, [[0, 1, 2, 3], [0, 1, 2, 4]]));
const getSb = () => (sbSolver ||= new BlockSolver(C.SB_PIECES, SB_MOVES, [[0, 1, 2, 3], [0, 1, 2, 4]]));

// 正解の手順を 1 手だけ変えた、同じ手数の誤答を作る
function distractors(correct, moveSet, isSolved, count) {
  const out = [];
  const seen = new Set([correct.join(' ')]);
  for (let tries = 0; out.length < count && tries < 500; tries++) {
    const d = correct.slice();
    const k = Math.floor(Math.random() * d.length);
    const prev = d[k - 1], next = d[k + 1];
    const cand = moveSet.filter((m) => {
      const b = C.MOVES[m].base;
      return m !== d[k] && (!prev || C.MOVES[prev].base !== b) && (!next || C.MOVES[next].base !== b);
    });
    if (!cand.length) continue;
    d[k] = pick(cand);
    // 2 か所変える誤答も混ぜて、見た目が似すぎないようにする
    if (tries % 3 === 2 && d.length > 3) {
      const k2 = (k + 1 + Math.floor(Math.random() * (d.length - 1))) % d.length;
      const c2 = moveSet.filter((m) => m !== d[k2]
        && (!d[k2 - 1] || C.MOVES[d[k2 - 1]].base !== C.MOVES[m].base)
        && (!d[k2 + 1] || C.MOVES[d[k2 + 1]].base !== C.MOVES[m].base));
      if (c2.length) d[k2] = pick(c2);
    }
    const s = d.join(' ');
    if (seen.has(s) || isSolved(d)) continue;
    seen.add(s);
    out.push(d);
  }
  return out;
}

function buildChoices(correctLabel, wrongLabels, extra = {}) {
  const items = shuffle([{ label: correctLabel, ok: true, ...extra.correct }, ...wrongLabels.map((l) => ({ label: l, ok: false }))]);
  return { choices: items.map(({ label, sub }) => ({ label, sub })), answer: items.findIndex((i) => i.ok) };
}

// ---------- 各ドリル ----------
function genBlock(kind, opts) {
  const solver = kind === 'fb' ? getFb() : getSb();
  const moveSet = kind === 'fb' ? FB_MOVES : SB_MOVES;
  const goalStickers = kind === 'fb' ? C.FB_STICKERS : C.F2B_STICKERS;
  const [minLen, maxLen] = opts.range || [1, 20];
  for (let attempt = 0; attempt < 200; attempt++) {
    const scramble = kind === 'fb'
      ? C.randomMoves(FACE_MOVES, 25)
      : C.randomMoves(SB_MOVES, 30);
    const tracked = trackedApply(trackedSolved(), scramble);
    const sols = solver.solve(tracked, { maxSolutions: 6 });
    if (!sols.length) continue;
    const len = sols[0].length;
    if (len < minLen || len > maxLen) continue;
    const colors = colorsOf(tracked);
    const correct = sols[0];
    const isSolved = (m) => C.isSolvedAt(C.applyAlg(colors, m), goalStickers);
    const wrong = distractors(correct, moveSet, isSolved, 3);
    if (wrong.length < 3) continue;
    const { choices, answer } = buildChoices(correct.join(' '), wrong.map((w) => w.join(' ')));
    return {
      drill: kind,
      colors,
      scramble: scramble.join(' '),
      prompt: kind === 'fb' ? 'ファーストブロックを最短で揃える手順は?' : 'セカンドブロックを最短で揃える手順は?',
      choices,
      answer,
      caseKey: `len${len}`,
      explain: `最短 ${len} 手。` + (sols.length > 1 ? `別解: ${sols.slice(1, 3).map((s) => s.join(' ')).join(' / ')}` : ''),
    };
  }
  throw new Error('問題を生成できませんでした');
}

// 苦手優先: 正答率が低いケースや未出題のケースほど出やすくする
function pickWeighted(pool, stats) {
  const w = pool.map((c) => {
    const s = stats[c.name];
    if (!s || !s.n) return 2;
    return 0.5 + 4 * (1 - s.correct / s.n);
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function genCmll(opts) {
  const sets = opts.sets && opts.sets.length ? opts.sets : CMLL_SETS;
  const pool = CMLL_CASES.filter((c) => sets.includes(c.set));
  let target;
  if (opts.forceCase) target = CMLL_CASES.find((c) => c.name === opts.forceCase);
  else if (opts.stats) target = pickWeighted(pool, opts.stats);
  else target = pick(pool);
  const algText = opts.algOf ? opts.algOf(target) : target.alg;
  const algMoves = C.parseAlg(algText);
  const lse = C.randomMoves(LSE_MOVES, 16);
  // LSE をかき混ぜた後、コーナーを揃った向きに戻しておく
  const align = AUFS.find((a) => C.isSolvedAt(C.applyAlg(C.solved(), [...lse, ...parse(a)]), UC));
  const setup = [...lse, ...parse(align)];
  if (opts.auf === 'random') {
    setup.push(...target.inv, ...parse(pick(AUFS)));
  } else {
    // AUF なし: 出題に使う手順をそのままかければ解ける向きで出す
    setup.push(...C.invertAlg(algMoves));
    setup.push(...f2bRotation(C.applyAlg(C.solved(), setup)));
  }
  // M 列を回してセンターを揃える(コーナーには影響しない)
  const fix = ['M', 'M2', "M'"].find((m) => C.applyAlg(C.solved(), [...setup, m])[4] === 0);
  if (C.applyAlg(C.solved(), setup)[4] !== 0) setup.push(fix);
  const colors = C.applyAlg(C.solved(), setup);
  // 手順の前に必要な AUF(対称なケースでは複数ありうる)
  const aufAnswers = AUFS.filter((a) => {
    const st = orientF2B(C.applyAlg(C.applyAlg(colors, parse(a)), algMoves));
    return st && cornersUpToAuf(st);
  });
  let others = pool.filter((c) => c !== target);
  // 同じセットの別ケースを優先して紛らわしくする
  const same = shuffle(others.filter((c) => c.set === target.set));
  const diff = shuffle(others.filter((c) => c.set !== target.set));
  if (pool.length < 4) {
    others = shuffle(CMLL_CASES.filter((c) => c !== target));
  } else {
    others = [...same, ...diff];
  }
  const wrong = others.slice(0, 3);
  const items = shuffle([target, ...wrong]);
  return {
    drill: opts.auf === 'random' ? 'cmllAuf' : 'cmll',
    colors,
    scramble: setup.join(' '),
    prompt: opts.auf === 'random' ? 'AUFと手順を選んでください' : 'このCMLLを解く手順は?',
    aufAnswers: opts.auf === 'random' ? aufAnswers : null,
    choices: items.map((c) => ({ label: opts.algOf ? opts.algOf(c) : c.alg, sub: c.set })),
    answer: items.indexOf(target),
    caseKey: target.name,
    explain: `${target.set}セット: ${opts.auf === 'random' ? `${aufAnswers.map((a) => a || 'AUFなし').join(' / ')} → ` : ''}${algText}`,
  };
}

// LSE の EO: 向きが揃っているか
const LSE_EDGES = ['UF', 'UB', 'UL', 'UR', 'DF', 'DB'].map((n) => C.piecesStickers([n]));
function eoDone(colors) {
  let s = colors;
  const uc = s[4];
  if (uc !== 0 && uc !== 3) s = C.applyAlg(s, ['M']);
  return LSE_EDGES.every((st) => st.every((i) => {
    const col = s[i];
    if (col !== 0 && col !== 3) return true;
    const f = C.STICKERS[i].face;
    return f === 0 || f === 3;
  }));
}

function solveEo(colors, maxDepth = 12) {
  const sols = [];
  const path = [];
  const rec = (s, d, prevBase) => {
    if (sols.length >= 4) return;
    if (d === 0) { if (eoDone(s)) sols.push(path.slice()); return; }
    for (const m of LSE_MOVES) {
      if (C.MOVES[m].base === prevBase) continue;
      path.push(m);
      rec(C.applyMove(s, m), d - 1, C.MOVES[m].base);
      path.pop();
    }
  };
  for (let d = 0; d <= maxDepth && !sols.length; d++) rec(colors, d, null);
  return sols;
}

function badCount(colors) {
  return LSE_EDGES.filter((st) => st.some((i) => {
    const col = colors[i];
    return (col === 0 || col === 3) && C.STICKERS[i].face !== 0 && C.STICKERS[i].face !== 3;
  })).length;
}

function genEo(opts) {
  const [minLen, maxLen] = opts.range || [1, 20];
  for (let attempt = 0; attempt < 200; attempt++) {
    const setup = C.randomMoves(LSE_MOVES, 18);
    const colors = C.applyAlg(C.solved(), setup);
    if (eoDone(colors)) continue;
    const sols = solveEo(colors);
    const len = sols[0].length;
    if (len < minLen || len > maxLen) continue;
    const wrong = distractors(sols[0], LSE_MOVES, (m) => eoDone(C.applyAlg(colors, m)), 3);
    if (wrong.length < 3) continue;
    const { choices, answer } = buildChoices(sols[0].join(' '), wrong.map((w) => w.join(' ')));
    return {
      drill: 'eo',
      colors,
      scramble: setup.join(' '),
      prompt: 'EO(エッジの向き)を最短で揃える手順は?',
      choices,
      answer,
      caseKey: `bad${badCount(colors)}-len${len}`,
      explain: `最短 ${len} 手。` + (sols.length > 1 ? `別解: ${sols.slice(1, 3).map((s) => s.join(' ')).join(' / ')}` : ''),
    };
  }
  throw new Error('問題を生成できませんでした');
}

// ---------- CMLL 後の EO ----------
export const LSE_POS = ['UB', 'UL', 'UR', 'UF', 'DF', 'DB'];
const M_SLICE = new Set(['UB', 'UF', 'DF', 'DB']);

// 向きが揃っていないエッジの位置。センターが M / M' ずれているときは、
// M 列のエッジは U/D 色が F/B 面を向いているものが「揃っている」(M を 1 回戻すと U/D に来る)
export function badEdges(colors) {
  const odd = colors[4] !== 0 && colors[4] !== 3;
  return LSE_POS.filter((pos) => {
    const st = C.piecesStickers([pos]).find((i) => colors[i] === 0 || colors[i] === 3);
    const face = C.FACES[C.STICKERS[st].face];
    const good = odd && M_SLICE.has(pos) ? face === 'F' || face === 'B' : face === 'U' || face === 'D';
    return !good;
  });
}

function genCmllEo(opts) {
  const p = genCmll({ ...opts, auf: 'none' });
  const alg = p.choices[p.answer].label;
  const after = C.applyAlg(p.colors, alg);
  const bad = badEdges(after);
  return {
    ...p,
    drill: 'cmllEo',
    prompt: 'CMLLを回した後、向きが揃っていないエッジをすべて選んでください',
    alg,
    eoBad: bad,
    after,
    explain: `${p.explain} → 揃っていないエッジ: ${bad.length ? bad.join(' ') : 'なし(全部揃う)'}`,
  };
}

export const ENABLED_DRILLS = ['cmll'];

export const DRILLS = {
  fb: { name: 'FB', full: 'ファーストブロック', gen: (o) => genBlock('fb', o), view: [-28, 38], ranges: [[1, 5], [6, 6], [7, 7], [8, 20]] },
  sb: { name: 'SB', full: 'セカンドブロック', gen: (o) => genBlock('sb', o), view: [-28, -35], ranges: [[1, 8], [9, 10], [11, 20]] },
  cmll: { name: 'CMLL', full: 'CMLL(AUFなし)', gen: genCmll, view: [-35, -30] },
  cmllEo: { name: 'CMLL→EO', full: 'CMLL後のEO', gen: genCmllEo, view: [-35, -30] },
  cmllAuf: { name: 'CMLL+AUF', full: 'CMLL(AUFランダム)', gen: (o) => genCmll({ ...o, auf: 'random' }), view: [-35, -30] },
  eo: { name: 'EO', full: 'LSE EO', gen: genEo, view: [-40, -20], ranges: [[1, 4], [5, 6], [7, 20]] },
};

export function generate(drill, opts = {}) {
  return DRILLS[drill].gen(opts);
}

export const _internal = { eoDone, solveEo, getFb, getSb };
