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
  const pool = CMLL_CASES.filter((c) => sets.includes(c.set) && (!opts.only || opts.only.includes(c.name)));
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

// AUF 固定: 手順をそのまま回す。AUF ランダム: 正解の AUF(対称なケースでは複数)ごとに回した後の EO を求める
function genCmllEo(opts) {
  const p = genCmll(opts);
  const alg = p.choices[p.answer].label;
  const aufs = opts.auf === 'random' ? p.aufAnswers : [''];
  const eoAnswers = aufs.map((a) => {
    const after = C.applyAlg(C.applyAlg(p.colors, parse(a)), alg);
    return { auf: a, bad: badEdges(after), after: after.join('') };
  });
  const fmt = (bad) => (bad.length ? bad.join(' ') : 'なし(全部揃う)');
  const detail = opts.auf === 'random'
    ? eoAnswers.map((e) => `${e.auf || 'AUFなし'}: ${fmt(e.bad)}`).join(' / ')
    : fmt(eoAnswers[0].bad);
  return {
    ...p,
    drill: opts.auf === 'random' ? 'cmllEoAuf' : 'cmllEo',
    prompt: opts.auf === 'random'
      ? 'AUFと、CMLL後に向きが揃わないエッジを選択'
      : 'CMLL後に向きが揃わないエッジをすべて選択',
    alg,
    eoAnswers,
    explain: `${p.explain} → 揃っていないエッジ: ${detail}`,
  };
}

// ---------- SB の square ----------
// square = DR エッジ + コーナー 1 個 + エッジ 1 個(2×2×1)。front / back の 2 通り
export const SQUARES = {
  front: { name: 'Front square', pieces: ['DR', 'DRF', 'FR'] },
  back: { name: 'Back square', pieces: ['DR', 'DRB', 'BR'] },
};
const SB_PIECE_STICKERS = new Set(C.piecesStickers(C.SB_PIECES));
const SQ_STICKERS = {};
for (const [k, v] of Object.entries(SQUARES)) SQ_STICKERS[k] = C.piecesStickers(v.pieces);
const sqSolvers = {};
// ピース 3 個の表を丸ごと作るので、表の値がそのまま最短手数になる
const getSq = (k) => (sqSolvers[k] ||= new BlockSolver(SQUARES[k].pieces, SB_MOVES, [[0, 1, 2]]));

// R r M が続く部分を、R 層と M 層の回転量にまとめる。もっと少ない手数で書ける並びは無駄なので除く
const X_TURNS = { R: [1, 0], r: [1, 3], M: [0, 1] };
// QTM の手数(180° は 2 手)
export const qtmLen = (moves) => moves.reduce((a, m) => a + (m.endsWith('2') ? 2 : 1), 0);
const blockQtm = qtmLen;
// R 層と M 層の回転量 (a, b) を R / r / M の 2 手以内で作るときの QTM の最小手数
const X_QTM_MIN = (() => {
  const t = [0, 1, 2, 1];
  const out = [...Array(4)].map(() => Array(4).fill(Infinity));
  const bases = ['R', 'r', 'M'];
  for (const b1 of bases) for (const b2 of bases) for (let n1 = 0; n1 < 4; n1++) for (let n2 = 0; n2 < 4; n2++) {
    const a = (X_TURNS[b1][0] * n1 + X_TURNS[b2][0] * n2) % 4;
    const b = (X_TURNS[b1][1] * n1 + X_TURNS[b2][1] * n2) % 4;
    out[a][b] = Math.min(out[a][b], t[n1] + t[n2]);
  }
  return out;
})();
function tightXBlocks(moves, qtm = false) {
  for (let i = 0; i < moves.length;) {
    let j = i, a = 0, b = 0;
    while (j < moves.length && X_TURNS[C.MOVES[moves[j]].base]) {
      const [ra, mb] = X_TURNS[C.MOVES[moves[j]].base];
      const n = moves[j].endsWith('2') ? 2 : moves[j].endsWith("'") ? 3 : 1;
      a = (a + ra * n) % 4; b = (b + mb * n) % 4;
      j++;
    }
    if (qtm ? blockQtm(moves.slice(i, j)) > X_QTM_MIN[a][b] : j - i > (!a && !b ? 0 : !a || !b || (a + b) % 4 === 0 ? 1 : 2)) return false;
    i = Math.max(j, i + 1);
  }
  return true;
}
// U と R/r/M の切り替わり位置(各まとまりの終わり)
function blocksOf(moves) {
  const out = [];
  for (let i = 1; i <= moves.length; i++) if (i === moves.length || C.MOVES[moves[i]].axis !== C.MOVES[moves[i - 1]].axis) out.push(i);
  return out;
}

// opts.minLen / opts.maxLen: 出題する最短手数(front と back の短い方)の範囲
// FB だけ揃った盤面(M 列でセンターを揃える。SB のピースには影響しない)
function sbScramble() {
  const scramble = C.randomMoves(SB_MOVES, 30);
  const fix = ['', 'M', 'M2', "M'"].find((m) => C.applyAlg(C.solved(), [...scramble, ...parse(m)])[4] === 0);
  scramble.push(...parse(fix));
  return { scramble, tracked: trackedApply(trackedSolved(), scramble) };
}

const sqDist = (tracked, k) => getSq(k).h(getSq(k).locsFromState(tracked));

// square k の解答例を短い順に 3 つ。無駄な手を含む解(途中で揃う・1 手抜いても揃う)と、
// square のピースの動きが同じ解(r と R の違いだけなど)は 1 つにまとめる
function filterSols(tracked, k, list, qtm = false) {
  const done = (moves) => C.isSolvedAt(colorsOf(trackedApply(tracked, moves)), SQ_STICKERS[k]);
  const seen = new Set();
  return list.filter((x) => {
    if (!tightXBlocks(x, qtm)) return false;
    const key = blocksOf(x).map((b) => { const t = trackedApply(tracked, x.slice(0, b)); return SQ_STICKERS[k].map((i) => t.indexOf(i)).join(','); }).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    for (let i = 1; i < x.length; i++) if (done(x.slice(0, i))) return false;
    for (let i = 0; i < x.length; i++) if (done([...x.slice(0, i), ...x.slice(i + 1)])) return false;
    return true;
  });
}

function sqSolutions(tracked, k) {
  const sols = filterSols(tracked, k, getSq(k).solve(tracked, { maxSolutions: 400, extra: 3 }))
    .sort((p, q) => p.length - q.length).slice(0, 3);
  return { k, len: sols[0].length, sols };
}

// pieces: 色を付けるピースのステッカー(省略時は SB の 5 ピース)
// QTM の最短手順。表は 90° の手だけで作るので値がそのまま QTM の距離になる。
// 探索は 180° の手も 1 つの手(コスト 2)として使い、R2 のように表記する
const QTM_MOVES = SB_MOVES.filter((m) => !m.endsWith('2'));
const qtmSolvers = {};
const getQtm = (k) => (qtmSolvers[k] ||= new BlockSolver(SQUARES[k].pieces, QTM_MOVES, [[0, 1, 2]]));
function qtmSearch(tracked, k, { extra = 3, max = 400 } = {}) {
  const full = getSq(k), q = getQtm(k);
  const cost = full.moves.map((m) => (m.endsWith('2') ? 2 : 1));
  const start = full.locsFromState(tracked);
  const sols = [], path = [];
  const dfs = (locs, budget, prev) => {
    if (sols.length >= max) return;
    const h = q.h(locs);
    if (h > budget) return;
    if (budget === 0) { if (h === 0) sols.push(path.map((mi) => full.moves[mi])); return; }
    for (let mi = 0; mi < full.moves.length; mi++) {
      if (cost[mi] > budget) continue;
      if (prev >= 0 && full.axis[mi] === full.axis[prev] && full.baseRank[mi] <= full.baseRank[prev]) continue;
      path.push(mi);
      dfs(full.step(locs, mi), budget - cost[mi], mi);
      path.pop();
    }
  };
  const d = q.h(start);
  for (let b = d; b <= d + extra && sols.length < max; b++) dfs(start, b, -1);
  return sols;
}

// QTM で短い順に 3 つ。無駄を除く条件は HTM と同じ
function sqSolutionsQtm(tracked, k) {
  // 同じ QTM 手数なら手の数が少ない表記(R r より R2)を残す
  const byLen = (p, q) => qtmLen(p) - qtmLen(q) || p.length - q.length;
  return filterSols(tracked, k, qtmSearch(tracked, k).sort(byLen), true).slice(0, 3);
}

// R面センター(13)は常に色付き
const R_CENTER = 1 * 9 + 4;
const sbHighlight = (tracked, pieces = SB_PIECE_STICKERS) => tracked.map((orig) => (pieces.has(orig) || orig === R_CENTER ? 1 : 0)).join('');

// 入力した手順で square k が揃うか
export function solvesSquare(colors, k, moves) {
  return C.isSolvedAt(C.applyAlg(colors, moves), SQ_STICKERS[k]);
}

// 続けて押した手をまとめる。手数はまとめた後で数える
// ・同じ層: R R → R2、R R' → なし
// ・M' と R (順不同) → r、M と R' (順不同) → r'
const TO_M = { "M' R": 'r', "R M'": 'r', "M R'": "r'", "R' M": "r'" };
export function mergeMoves(moves) {
  const out = [];
  const n = (x) => (x.endsWith('2') ? 2 : x.endsWith("'") ? 3 : 1);
  const push = (m) => {
    const last = out[out.length - 1];
    if (last && TO_M[`${last} ${m}`]) { out.pop(); push(TO_M[`${last} ${m}`]); return; }
    if (last && C.MOVES[last].base === C.MOVES[m].base) {
      out.pop();
      const t = (n(last) + n(m)) % 4;
      const b = C.MOVES[m].base;
      if (t) push(t === 1 ? b : t === 2 ? `${b}2` : `${b}'`);
      return;
    }
    out.push(m);
  };
  moves.forEach(push);
  return out;
}

// 解答例は最後の R 系を r 系で書く(square のピースは R 層だけなので揃い方は同じ)。
// 最後の x 軸の手は最短解なら 1 手だけなので、直前と重なることはない
const wideLast = (sols) => [...new Set(sols.map((x) => {
  const m = x[x.length - 1];
  return (m && m[0] === 'R' ? [...x.slice(0, -1), 'r' + m.slice(1)] : x).join(' ');
}))];

function genSbSquare(opts = {}) {
  const minLen = Math.max(2, opts.minLen || 2), maxLen = Math.max(minLen, opts.maxLen || 99);
  for (let attempt = 0; attempt < 20000; attempt++) {
    const { scramble, tracked } = sbScramble();
    // 表の値がそのまま最短手数なので、範囲外の盤面は解を探す前に捨てる
    const d = Math.min(...Object.keys(SQUARES).map((k) => sqDist(tracked, k)));
    if (d < minLen || d > maxLen) continue;
    const res = Object.keys(SQUARES).map((k) => sqSolutions(tracked, k));
    const best = Math.min(...res.map((r) => r.len));
    if (best < 2) continue;
    const squares = res.filter((r) => r.len === best).map((r) => r.k);
    // 選択肢: 正解の前後の手数から 4 つ(小さい順)
    // 選択肢の 4 つも出題範囲(下限〜上限)に収める
    const hiCap = Math.max(minLen, (opts.maxLen || best + 3) - 3);
    const lo = Math.min(Math.max(minLen, best - Math.floor(Math.random() * 4)), hiCap, best);
    const nums = [lo, lo + 1, lo + 2, lo + 3];
    const choices = nums.map((n) => ({ label: `${n}手` }));
    const fmt = (r) => `${SQUARES[r.k].name} ${r.len}手 (${r.sols[0].join(' ')})`;
    return {
      drill: 'sbSq',
      colors: colorsOf(tracked),
      highlight: sbHighlight(tracked),
      sbSols: Object.fromEntries(res.map((r) => [r.k, wideLast(r.sols)])),
      qtmSols: Object.fromEntries(res.map((r) => [r.k, wideLast(sqSolutionsQtm(tracked, r.k))])),
      scramble: scramble.join(' '),
      prompt: 'squareを作る最短手数は? Front / Back はどっち?',
      choices,
      answer: nums.indexOf(best),
      rowOpts: Object.entries(SQUARES).map(([k, v]) => [k, v.name]),
      rowName: 'square',
      aufAnswers: squares,
      caseKey: `${best}手`,
      explain: `最短 ${best}手(${squares.map((k) => SQUARES[k].name).join(' / ')})。${res.map(fmt).join('、')}`,
    };
  }
  throw new Error('問題を生成できませんでした');
}

// 指定した square を指定した手数で作る問題。手順をボタンで入力して答える
// DR エッジが今いる場所(UF, DB など)。向きは問わない
export const DR_POSITIONS = ['UF', 'UB', 'UL', 'UR', 'DF', 'DB', 'FR', 'BR', 'DR'];
const DR_STICKER = C.stickerAt('DR');
const POS_OF_STICKER = new Map(DR_POSITIONS.flatMap((n) => C.piecesStickers([n]).map((i) => [i, n])));
const drPosition = (tracked) => POS_OF_STICKER.get(tracked.indexOf(DR_STICKER));
// DR エッジの EO(F/B 軸の向き)。D 色のステッカーが U/D 面にあれば合っている。
// U/D 面に接していない FR・BR では、D 色が F/B 面にあれば合っている
export const DR_ORIS = { good: 'EOが合っている', bad: 'EOが合っていない' };
function drOrientation(tracked) {
  const at = tracked.indexOf(DR_STICKER);
  const face = C.FACES[Math.floor(at / 9)];
  const eSlice = ['FR', 'BR'].includes(POS_OF_STICKER.get(at));
  return (eSlice ? face === 'F' || face === 'B' : face === 'U' || face === 'D') ? 'good' : 'bad';
}

// opts.len: 最短手数を指定 / opts.drPos: DR エッジの位置(複数可)を指定。手数は 2 手以上でランダム
function genSbSolve(opts = {}) {
  const k = SQUARES[opts.side] ? opts.side : 'front';
  const byDr = Array.isArray(opts.drPos) && opts.drPos.length;
  for (let attempt = 0; attempt < 40000; attempt++) {
    const { scramble, tracked } = sbScramble();
    const len = sqDist(tracked, k);
    const pos = drPosition(tracked);
    const ori = drOrientation(tracked);
    const oriOk = !opts.drOri || opts.drOri === 'any' || opts.drOri === ori;
    if (byDr ? !opts.drPos.includes(pos) || !oriOk || len < 2 : len !== (opts.len || 5)) continue;
    const r = sqSolutions(tracked, k);
    const qSols = sqSolutionsQtm(tracked, k);
    const qLen = qtmLen(qSols[0]);
    return {
      drill: 'sbSolve',
      colors: colorsOf(tracked),
      highlight: sbHighlight(tracked, new Set(SQ_STICKERS[k])),
      sbSols: { [k]: wideLast(r.sols) },
      qtmSols: { [k]: wideLast(qSols) },
      qOptLen: qLen,
      square: k,
      optLen: len,
      inputPad: true,
      scramble: scramble.join(' '),
      prompt: `${SQUARES[k].name}を最短で作る手順を入力(QSTM ${qLen}手 / STM ${len}手)`,
      drPos: pos,
      drOri: ori,
      caseKey: byDr ? `${k} DR@${pos}${ori === 'good' ? '' : '*'}` : `${k} ${len}手`,
      explain: `${SQUARES[k].name} ${len}手 DRエッジ:${pos}(${DR_ORIS[ori]}) (${r.sols[0].join(' ')})`,
    };
  }
  throw new Error('問題を生成できませんでした');
}

export const ENABLED_DRILLS = ['cmll'];

export const DRILLS = {
  fb: { name: 'FB', full: 'ファーストブロック', gen: (o) => genBlock('fb', o), view: [-28, 38], ranges: [[1, 5], [6, 6], [7, 7], [8, 20]] },
  sb: { name: 'SB', full: 'セカンドブロック', gen: (o) => genBlock('sb', o), view: [-28, -35], ranges: [[1, 8], [9, 10], [11, 20]] },
  cmll: { name: 'CMLL', full: 'CMLL(AUFなし)', gen: genCmll, view: [-35, -30] },
  cmllEo: { name: 'CMLL→EO', full: 'CMLL後のEO', gen: (o) => genCmllEo({ ...o, auf: 'none' }), view: [-35, -30] },
  cmllEoAuf: { name: 'CMLL→EO+AUF', full: 'CMLL後のEO(AUFランダム)', gen: (o) => genCmllEo({ ...o, auf: 'random' }), view: [-35, -30] },
  cmllAuf: { name: 'CMLL+AUF', full: 'CMLL(AUFランダム)', gen: (o) => genCmll({ ...o, auf: 'random' }), view: [-35, -30] },
  sbSolve: { name: 'SB手順入力', full: 'SBのsquareを手順で', gen: genSbSolve, view: [-28, -35], noSlot: true },
  sbSq: { name: 'SB square', full: 'SBのsquare', gen: genSbSquare, view: [-28, -35], noSlot: true },
  eo: { name: 'EO', full: 'LSE EO', gen: genEo, view: [-40, -20], ranges: [[1, 4], [5, 6], [7, 20]] },
};

export function generate(drill, opts = {}) {
  return DRILLS[drill].gen(opts);
}

export const _internal = { eoDone, solveEo, getFb, getSb };
