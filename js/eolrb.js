// EOLRb 練習: EO を揃え、UL・UR エッジを UF・UB に入れて、U 面のコーナーと合わせた 1×1×3 のブロックを U 面に 2 つ作る。
// 完成形(ユーザー指定 2026-11-03): EO が揃い、UL・UR が UF・UB にあり(どちらがどちらでもよい)、
// それぞれ両隣のコーナーと 1×1×3 のブロックになっている(U を何回か回せば UL・UR が元の位置に戻り、コーナーも揃う)。
// EO: U センターが U/D 面なら 6 本とも U/D 色が U/D 面。F/B 面なら UL・UR の 2 本は U 色が U 面、残り 4 本は U/D 面以外(EOLR と同じ考え方)。
// 局面 = エッジの位置(720) × 向き(64) × センター(4) × コーナーのずれ(4)。手数は QSTM。
import * as C from './cube.js';
import { EDGE_POS, sortSols } from './lse.js';
import { _internal as R, LR_BAD_COUNTS, fromColors as edgeState, badOf } from './eolr.js';

const { stepR, decR, toColors, FULL, A_T, scrambleOf, CORNER_STK } = R;
export const MOVES = ['U', "U'", 'M', "M'"];
const N = R.N * 4;
const UF = 0, UB = 1, UL = 2, UR = 3;
const SOLVED = C.solved();
const step = (y, mi) => stepR(y >> 2, mi) * 4 + A_T[(y & 3) * 4 + mi];

// y = 局面(エッジ) * 4 + a(あと何回 U を回せばコーナーが揃うか)
function isEolrb(y) {
  const x = y >> 2, a = y & 3;
  const s = decR(x);
  if (![UF, UB].includes(s.perm.indexOf(UL)) || ![UF, UB].includes(s.perm.indexOf(UR))) return false;
  // UL・UR(UF・UB にある)は U 色が U 面。残り 4 本は センターが U/D 面なら 0、F/B 面なら 1
  if (!s.ori.every((o, i) => o === (i === UF || i === UB ? 0 : s.c % 2))) return false;
  // U を a 回まわしてコーナーを揃えたとき、UL・UR が元の位置に来ればブロックになっている
  let z = x;
  for (let k = 0; k < a; k++) z = stepR(z, 0);
  const t = decR(z);
  return t.perm[UL] === UL && t.perm[UR] === UR;
}

let DIST = null;
function build() {
  if (DIST) return DIST;
  DIST = new Int8Array(N).fill(-1);
  let frontier = [];
  for (let y = 0; y < N; y++) if (FULL[y] >= 0 && isEolrb(y)) { DIST[y] = 0; frontier.push(y); }
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const y of frontier) for (let mi = 0; mi < 4; mi++) {
      const z = step(y, mi);
      if (DIST[z] < 0) { DIST[z] = d; next.push(z); }
    }
    frontier = next;
  }
  return DIST;
}

function stateOf(cols) {
  const s = edgeState(cols);
  let a = 0, st = cols;
  while (a < 4 && !CORNER_STK.every((k) => st[k] === SOLVED[k])) { st = C.applyAlg(st, ['U']); a++; }
  return R.encS(s) * 4 + (a % 4);
}

export function solutions(y, want = 4) {
  const D = build(), out = [];
  const TRY = [3, 1, 2, 0]; // M' → U' の多い手順を先に集める
  const walk = (z, path) => {
    if (out.length >= 3000) return;
    const d = D[z];
    if (d === 0) { out.push(path.slice()); return; }
    for (const mi of TRY) {
      const w = step(z, mi);
      if (D[w] === d - 1) { path.push(MOVES[mi]); walk(w, path); path.pop(); }
    }
  };
  walk(y, []);
  return sortSols(out, want);
}

// 出題条件は EOLR と同じ形: { by: 'len', len } / { by: 'pos', counts, pos, ul, ur }
export const LRB_BAD_COUNTS = LR_BAD_COUNTS;
function matchY(y, o) {
  const D = build();
  if ((y >> 2) % 2 || D[y] <= 0) return false; // U センターが U/D 面で、まだ揃っていない
  if (o.by === 'len') return D[y] === o.len;
  const s = decR(y >> 2), bad = badOf(s);
  const n = bad.reduce((p, b) => p + b, 0);
  if (o.counts && !o.counts.includes(n)) return false;
  if (o.pos && !EDGE_POS.every((p, i) => !o.pos[p] || (o.pos[p] === 'bad') === !!bad[i])) return false;
  if (o.ul && !o.ul.includes(EDGE_POS[s.perm.indexOf(UL)])) return false;
  if (o.ur && !o.ur.includes(EDGE_POS[s.perm.indexOf(UR)])) return false;
  return true;
}
const cache = new Map();
function candidates(o) {
  const key = JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const r = [];
  for (let y = 0; y < N; y++) if (FULL[y] >= 0 && matchY(y, o)) r.push(y);
  if (cache.size > 20) cache.clear();
  cache.set(key, r);
  return r;
}
// 条件に合う局面の数(エッジの位置・向き、センター、コーナーのずれ)
export const eolrbCount = (o) => candidates(o).length;

export function genEolrb(opts = {}) {
  const o = opts.by ? opts : { by: 'len', len: 8 };
  const list = candidates(o);
  if (!list.length) return null;
  const y = list[Math.floor(Math.random() * list.length)];
  const s = decR(y >> 2), a = y & 3;
  const d = build()[y];
  const bad = badOf(s);
  return {
    lseEo: true,
    eolrb: true,
    inputPad: true,
    padMoves: ["U'", 'U', "M'", 'M'],
    colors: toColors(s, a),
    highlight: null,
    optQ: d,
    lseSols: solutions(y, 4),
    scramble: scrambleOf(y >> 2, a).join(' '),
    prompt: `EOLRbを最短で揃える手順を入力(QSTM ${d}手)`,
    caseKey: `QSTM${d}手`,
    badPos: EDGE_POS.filter((_, i) => bad[i]),
  };
}

export const solvesEolrb = (colors, moves) => build()[stateOf(C.applyAlg(colors, moves))] === 0;

let lens = null;
export const eolrbLens = () => lens || (lens = [...new Set(candidates({ by: 'pos' }).map((y) => build()[y]))].sort((p, q) => p - q));

export const _internalB = { isEolrb, stateOf, build, N };
