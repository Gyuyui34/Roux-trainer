// EOLR 練習: LSE の EO を揃えながら、UL・UR エッジを DF・DB に入れる。
// 完成形(ユーザー指定): EO が揃い、UL・UR の 2 本が U 色を D 面に向けて DF・DB にある(どちらがどちらでもよい)、
// U/D センターが U/D 面にある(最後の M 列合わせも手数に入る)。コーナーは見ない。
// 局面 = エッジの位置(720) × 位置ごとの向き(64) × センター(4)。表示と作り方のためにコーナーのずれ(4)も持つ。
// 手数は QSTM(U・M の 90° を 1 手、180° は 2 手)。
import * as C from './cube.js';
import { EDGE_POS, sortSols } from './lse.js';

const UD_STK = EDGE_POS.map((p) => C.stickerAt(p));
const SIDE_STK = EDGE_POS.map((p) => C.stickerAt(p[1] + p[0]));
const CENTER_STK = ['U', 'F', 'D', 'B'].map((f) => C.FACES.indexOf(f) * 9 + 4);
const U_CORNERS = C.U_CORNERS.map((n) => C.PIECES.find((st) => st.includes(C.stickerAt(n))));
const CORNER_STK = U_CORNERS.flat();
export const MOVES = ['U', "U'", 'M', "M'"];
const SOLVED = C.solved();
const PIECE_COL = EDGE_POS.map((_, i) => [SOLVED[UD_STK[i]], SOLVED[SIDE_STK[i]]]);
const M_SLICE = [0, 1, 4, 5];
const UL = 2, UR = 3, DF = 4, DB = 5;

// ---- 番号付け
const FACT = [120, 24, 6, 2, 1, 1];
function permIndex(p) {
  let idx = 0;
  for (let i = 0; i < 6; i++) {
    let s = 0;
    for (let j = i + 1; j < 6; j++) if (p[j] < p[i]) s++;
    idx += s * FACT[i];
  }
  return idx;
}
function permFrom(idx) {
  const rest = [0, 1, 2, 3, 4, 5], p = [];
  for (let i = 0; i < 6; i++) { const k = Math.floor(idx / FACT[i]); idx %= FACT[i]; p.push(rest.splice(k, 1)[0]); }
  return p;
}
const PERMS = Array.from({ length: 720 }, (_, i) => permFrom(i));
const N = 720 * 64 * 4; // EOLR の局面(コーナーなし)
const encR = (pi, ob, c) => (pi * 64 + ob) * 4 + c;

// ---- 手の作用(ステッカーの置換から作る)。各座標ごとの表にしておく
const PERM_T = new Int16Array(720 * 4), ORI_T = new Int8Array(64 * 4), C_T = new Int8Array(16), A_T = new Int8Array(16);
MOVES.forEach((m, mi) => {
  const perm = C.MOVES[m].perm;
  const edge = EDGE_POS.map((_, i) => {
    const j = perm[UD_STK[i]];
    const q = UD_STK.indexOf(j);
    return q >= 0 ? [q, 0] : [SIDE_STK.indexOf(j), 1];
  });
  for (let pi = 0; pi < 720; pi++) {
    const p = PERMS[pi], np = new Array(6);
    for (let i = 0; i < 6; i++) np[edge[i][0]] = p[i];
    PERM_T[pi * 4 + mi] = permIndex(np);
  }
  for (let ob = 0; ob < 64; ob++) {
    let nb = 0;
    for (let i = 0; i < 6; i++) nb |= (((ob >> i) & 1) ^ edge[i][1]) << edge[i][0];
    ORI_T[ob * 4 + mi] = nb;
  }
  for (let c = 0; c < 4; c++) C_T[c * 4 + mi] = CENTER_STK.indexOf(perm[CENTER_STK[c]]);
  // a = あと何回 U を回せばコーナーが揃うか
  for (let a = 0; a < 4; a++) A_T[a * 4 + mi] = (a + (m === 'U' ? 3 : m === "U'" ? 1 : 0)) % 4;
});
const stepR = (x, mi) => {
  const c = x % 4, ob = (x >> 2) % 64, pi = Math.floor(x / 256);
  return encR(PERM_T[pi * 4 + mi], ORI_T[ob * 4 + mi], C_T[c * 4 + mi]);
};

// ---- 局面のオブジェクト表現
const decR = (x) => ({ perm: PERMS[Math.floor(x / 256)], ori: EDGE_POS.map((_, i) => ((x >> 2) >> i) & 1), c: x % 4 });
const encS = (s) => encR(permIndex(s.perm), s.ori.reduce((v, o, i) => v | (o << i), 0), s.c);
export function fromColors(cols) {
  const perm = [], ori = [];
  for (let i = 0; i < 6; i++) {
    const a = cols[UD_STK[i]], b = cols[SIDE_STK[i]];
    const k = PIECE_COL.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    perm.push(k);
    ori.push(PIECE_COL[k][0] === a ? 0 : 1);
  }
  return { perm, ori, c: CENTER_STK.findIndex((s) => cols[s] === SOLVED[CENTER_STK[0]]) };
}
function toColors(s, a) {
  const cols = SOLVED.slice();
  for (let i = 0; i < 6; i++) {
    const [u, d] = PIECE_COL[s.perm[i]];
    cols[UD_STK[i]] = s.ori[i] ? d : u;
    cols[SIDE_STK[i]] = s.ori[i] ? u : d;
  }
  for (let i = 0; i < 4; i++) cols[CENTER_STK[(i + s.c) % 4]] = SOLVED[CENTER_STK[i]];
  const turned = C.applyAlg(SOLVED, Array((4 - a) % 4).fill('U'));
  for (const k of CORNER_STK) cols[k] = turned[k];
  return cols;
}

// ---- 完成判定
// 向きが悪い位置。センターが M/M' ずれのときは、UF・UB・DF・DB のエッジは U/D 色が F/B 面を向いていれば合っている
export const badOf = (s) => s.ori.map((o, i) => (s.c % 2 && M_SLICE.includes(i) ? 1 - o : o));
export const isEolr = (s) => s.c % 2 === 0 && badOf(s).every((b) => !b)
  && [DF, DB].includes(s.perm.indexOf(UL)) && [DF, DB].includes(s.perm.indexOf(UR));

// ---- 最短手数表(完成形からの幅優先探索。手の集合は逆手で閉じている)
const DIST = new Int8Array(N).fill(-1);
{
  let frontier = [];
  for (let x = 0; x < N; x++) if (isEolr(decR(x))) { DIST[x] = 0; frontier.push(x); }
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const x of frontier) for (let mi = 0; mi < 4; mi++) {
      const y = stepR(x, mi);
      if (DIST[y] < 0) { DIST[y] = d; next.push(y); }
    }
    frontier = next;
  }
}
export const distOf = (s) => DIST[encS(s)];

// 揃った状態(CMLL まで完成)からの距離。出題する盤面の作り方(スクランブル)を出すのに使う
const FULL = new Int8Array(N * 4).fill(-1);
{
  const start = encR(0, 0, 0) * 4;
  FULL[start] = 0;
  let frontier = [start];
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const y of frontier) {
      const x = y >> 2, a = y & 3;
      for (let mi = 0; mi < 4; mi++) {
        const z = stepR(x, mi) * 4 + A_T[a * 4 + mi];
        if (FULL[z] < 0) { FULL[z] = d; next.push(z); }
      }
    }
    frontier = next;
  }
}
const INV = { U: "U'", "U'": 'U', M: "M'", "M'": 'M' };
function scrambleOf(x, a) {
  let y = x * 4 + a;
  const path = [];
  while (FULL[y] > 0) {
    for (let mi = 0; mi < 4; mi++) {
      const z = stepR(y >> 2, mi) * 4 + A_T[(y & 3) * 4 + mi];
      if (FULL[z] === FULL[y] - 1) { path.push(MOVES[mi]); y = z; break; }
    }
  }
  return path.reverse().map((m) => INV[m]);
}

// 最短手順をいくつか。M' → U' の順に試して、M' の多い手順を先に集める
const TRY = [3, 1, 2, 0];
export function solutions(s, want = 4) {
  const out = [];
  const walk = (x, path) => {
    if (out.length >= 3000) return;
    const d = DIST[x];
    if (d === 0) { out.push(path.slice()); return; }
    for (const mi of TRY) {
      const y = stepR(x, mi);
      if (DIST[y] === d - 1) { path.push(MOVES[mi]); walk(y, path); path.pop(); }
    }
  };
  walk(encS(s), []);
  return sortSols(out, want);
}

// ---- 出題条件
// { by: 'len', len } 最短手数 / { by: 'pos', counts: [悪いエッジの数] | null, pos: { UF: 'bad'|'good' }, ul: [位置] | null, ur: [位置] | null }
export const LR_BAD_COUNTS = [0, 2, 4, 6];
function matchX(x, o) {
  if (x % 2 || DIST[x] <= 0) return false; // U センターが U/D 面にあって、まだ揃っていないもの
  if (o.by === 'len') return DIST[x] === o.len;
  const s = decR(x), bad = badOf(s);
  const n = bad.reduce((a, b) => a + b, 0);
  if (o.counts && !o.counts.includes(n)) return false;
  if (o.pos && !EDGE_POS.every((p, i) => !o.pos[p] || (o.pos[p] === 'bad') === !!bad[i])) return false;
  if (o.ul && !o.ul.includes(EDGE_POS[s.perm.indexOf(UL)])) return false;
  if (o.ur && !o.ur.includes(EDGE_POS[s.perm.indexOf(UR)])) return false;
  return true;
}
const candidates = (o) => { const r = []; for (let x = 0; x < N; x += 2) if (matchX(x, o)) r.push(x); return r; };
// 条件に合う局面の数(エッジの位置・向きとセンター。コーナーは数えない)
export const eolrCount = (o) => candidates(o).length;

export function genEolr(opts = {}) {
  const o = opts.by ? opts : { by: 'len', len: 6 };
  const list = candidates(o);
  if (!list.length) return null;
  const x = list[Math.floor(Math.random() * list.length)];
  // コーナーのずれは作れるもの(エッジの並びの偶奇で決まる 2 通り)からランダム
  const as = [0, 1, 2, 3].filter((a) => FULL[x * 4 + a] >= 0);
  const a = as[Math.floor(Math.random() * as.length)];
  const s = decR(x);
  const d = DIST[x];
  const bad = badOf(s);
  return {
    lseEo: true,
    eolr: true,
    inputPad: true,
    padMoves: ["U'", 'U', "M'", 'M'],
    colors: toColors(s, a),
    highlight: null, // 全部のピースに色を付ける
    optQ: d,
    lseSols: solutions(s, 4),
    scramble: scrambleOf(x, a).join(' '),
    prompt: `EOLRを最短で揃える手順を入力(QSTM ${d}手)`,
    caseKey: `QSTM${d}手`,
    badPos: EDGE_POS.filter((_, i) => bad[i]),
  };
}

// 入力した手順で EOLR の完成形になるか
export const solvesEolr = (colors, moves) => isEolr(fromColors(C.applyAlg(colors, moves)));

export const EOLR_LENS = [...new Set(candidates({ by: 'pos' }).map((x) => DIST[x]))].sort((a, b) => a - b);

// テスト用
export const _internal = { fromColors, toColors, encS, decR, stepR, DIST, FULL, N };
