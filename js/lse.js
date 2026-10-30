// LSE(U と M だけで動く最後の 6 エッジ)のモデルと EOLRb の最短手数表。
// 局面 = 6 エッジの位置と向き + センターのずれ(M の回数) + コーナーのずれ(U の回数)。
// 手数は QSTM(U・M の 90° を 1 手、180° は 2 手)。
import * as C from './cube.js';

export const EDGE_POS = ['UF', 'UB', 'UL', 'UR', 'DF', 'DB'];
// 各位置の U/D 面のステッカーと、もう一方のステッカー
const UD_STK = EDGE_POS.map((p) => C.stickerAt(p));
const SIDE_STK = EDGE_POS.map((p) => C.stickerAt(p[1] + p[0]));
// センターの置き場所(M で U→F→D→B と回る)
const CENTER_STK = ['U', 'F', 'D', 'B'].map((f) => C.FACES.indexOf(f) * 9 + 4);
const U_CORNERS = C.U_CORNERS.map((n) => C.PIECES.find((st) => st.includes(C.stickerAt(n))));
const CORNER_STK = U_CORNERS.flat();
export const MOVES = ["U", "U'", 'M', "M'"];

const SOLVED = C.solved();
const PIECE_COL = EDGE_POS.map((_, i) => [SOLVED[UD_STK[i]], SOLVED[SIDE_STK[i]]]);

// ---- 番号付け: perm(720) × 向き(64) × センター(4) × コーナー(4)
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
const N = 720 * 64 * 16;
const enc = (perm, ori, c, a) => ((permIndex(perm) * 64 + ori.reduce((x, o, i) => x | (o << i), 0)) * 4 + c) * 4 + a;
function dec(x) {
  const a = x % 4, c = (x >> 2) % 4, ob = (x >> 4) % 64, pi = Math.floor(x / 1024);
  return { perm: permFrom(pi), ori: EDGE_POS.map((_, i) => (ob >> i) & 1), c, a };
}

// ---- 手の作用(ステッカーの置換から作る)
const TABLE = MOVES.map((m) => {
  const perm = C.MOVES[m].perm;
  const edge = EDGE_POS.map((_, i) => {
    const j = perm[UD_STK[i]];
    const q = UD_STK.indexOf(j);
    return q >= 0 ? [q, 0] : [SIDE_STK.indexOf(j), 1];
  });
  const center = CENTER_STK.map((s) => CENTER_STK.indexOf(perm[s]));
  // a = 何回 U を回せばコーナーが揃うか。U を回すと 1 減る
  const corner = m === 'U' ? 3 : m === "U'" ? 1 : 0;
  return { edge, center: center.every((v, i) => v === i) ? null : center, corner };
});
function applyTo(s, mi) {
  const t = TABLE[mi];
  const perm = new Array(6), ori = new Array(6);
  for (let i = 0; i < 6; i++) { const [q, f] = t.edge[i]; perm[q] = s.perm[i]; ori[q] = s.ori[i] ^ f; }
  return { perm, ori, c: t.center ? t.center[s.c] : s.c, a: (s.a + t.corner) % 4 };
}

// ---- ステッカーの盤面 ⇄ 局面
export function fromColors(cols) {
  const perm = [], ori = [];
  for (let i = 0; i < 6; i++) {
    const a = cols[UD_STK[i]], b = cols[SIDE_STK[i]];
    let k = PIECE_COL.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    perm.push(k);
    ori.push(PIECE_COL[k][0] === a ? 0 : 1);
  }
  const c = CENTER_STK.findIndex((s) => cols[s] === SOLVED[CENTER_STK[0]]);
  let a = 0;
  let st = cols;
  while (!CORNER_STK.every((s) => st[s] === SOLVED[s])) { st = C.applyAlg(st, ['U']); a++; if (a > 3) break; }
  return { perm, ori, c, a };
}
export function toColors(s) {
  const cols = SOLVED.slice();
  for (let i = 0; i < 6; i++) {
    const [u, d] = PIECE_COL[s.perm[i]];
    cols[UD_STK[i]] = s.ori[i] ? d : u;
    cols[SIDE_STK[i]] = s.ori[i] ? u : d;
  }
  for (let i = 0; i < 4; i++) cols[CENTER_STK[(i + s.c) % 4]] = SOLVED[CENTER_STK[i]];
  // U を (4-a) 回まわした状態のコーナー = あと a 回 U で揃う
  const turned = C.applyAlg(SOLVED, Array((4 - s.a) % 4).fill('U'));
  for (const k of CORNER_STK) cols[k] = turned[k];
  return cols;
}

// ---- EO と EOLRb の完成判定
// EO: U/D 色が U/D 面を向いていれば合っている。センターが M/M' ずれのときは M 列のエッジは F/B 面向きで合っている
const M_SLICE = [0, 1, 4, 5];
export const eoBad = (s) => s.ori.map((o, i) => (s.c % 2 && M_SLICE.includes(i) ? 1 - o : o));
const UL = 2, UR = 3;
const M2 = [2, 2]; // M M
// EOLRb: EO が揃い、UL・UR が DF・DB にあり、M2 のあと UL・UR を戻す U でコーナーも揃う
export function isEolrb(s) {
  if (eoBad(s).some((b) => b)) return false;
  if (![4, 5].includes(s.perm.indexOf(UL)) || ![4, 5].includes(s.perm.indexOf(UR))) return false;
  let t = s;
  for (const mi of M2) t = applyTo(t, mi);
  for (let j = 0; j < 4; j++) {
    if (t.perm[UL] === UL && t.perm[UR] === UR) return t.a === 0;
    t = applyTo(t, 0);
  }
  return false;
}

// ---- 最短手数表(EOLRb 完成からの幅優先探索。手の集合は逆手で閉じているのでそのまま使える)
let DIST = null;
export let MAX_DIST = 0;
function build() {
  if (DIST) return DIST;
  DIST = new Int8Array(N).fill(-1);
  let frontier = [];
  // 完成形を全部集める: EO 揃い・UL/UR が下・センターとコーナーのずれを全部試す
  for (let pi = 0; pi < 720; pi++) {
    const perm = permFrom(pi);
    for (let ob = 0; ob < 64; ob++) {
      for (let c = 0; c < 4; c++) for (let a = 0; a < 4; a++) {
        const s = { perm, ori: EDGE_POS.map((_, i) => (ob >> i) & 1), c, a };
        if (isEolrb(s)) { const x = enc(s.perm, s.ori, c, a); if (DIST[x] < 0) { DIST[x] = 0; frontier.push(x); } }
      }
    }
  }
  let d = 0;
  while (frontier.length) {
    const next = [];
    for (const x of frontier) {
      const s = dec(x);
      for (let mi = 0; mi < 4; mi++) {
        const t = applyTo(s, mi);
        const y = enc(t.perm, t.ori, t.c, t.a);
        if (DIST[y] < 0) { DIST[y] = d + 1; next.push(y); }
      }
    }
    if (next.length) d++;
    frontier = next;
  }
  MAX_DIST = d;
  return DIST;
}
export const distOf = (s) => build()[enc(s.perm, s.ori, s.c, s.a)];

// 最短手順をいくつか(QSTM。同じ層の 90° が続いたら 2 にまとめて書く)
export function solutions(s, limit = 4) {
  // U U と U' U' はどちらも U2 と書くので、多めに探して同じ表記をまとめる
  const want = limit;
  limit = want * 4;
  const D = build();
  const out = [];
  const walk = (st, path) => {
    if (out.length >= limit) return;
    const d = D[enc(st.perm, st.ori, st.c, st.a)];
    if (d === 0) { out.push(path.slice()); return; }
    for (let mi = 0; mi < 4; mi++) {
      // 逆の手をすぐ戻すのは最短にならないので見なくてよい(距離で自然に除かれる)
      const t = applyTo(st, mi);
      if (D[enc(t.perm, t.ori, t.c, t.a)] === d - 1) { path.push(MOVES[mi]); walk(t, path); path.pop(); }
    }
  };
  walk(s, []);
  return [...new Set(out.map(joinQuarter))].slice(0, want);
}
// U U → U2 のようにまとめる(U' U' も U2)
function joinQuarter(moves) {
  const out = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === m[0] && !last.endsWith('2')) { out[out.length - 1] = `${m[0]}2`; continue; }
    out.push(m);
  }
  return out.join(' ');
}

// 局面を全部並べる(出題用)。センターは U/D 面にあるもの、1 手以上かかるものだけ
let ALL = null;
export function startStates() {
  if (ALL) return ALL;
  const D = build();
  ALL = [];
  for (let x = 0; x < N; x++) {
    const d = D[x];
    if (d < 1) continue;
    const c = (x >> 2) % 4;
    if (c % 2) continue;
    ALL.push(x);
  }
  return ALL;
}
export const stateOf = (x) => dec(x);
export const distAt = (x) => build()[x];

// ---- 出題(EOLRb 手順入力)
// opts: { by: 'len', len } 最短手数 / { by: 'pos', eo: [悪いエッジの数], ul: [位置], ur: [位置] }
const EO_COUNTS = [0, 2, 4, 6];
export { EO_COUNTS };
const matchPos = (s, o) => {
  const bad = eoBad(s).reduce((a, b) => a + b, 0);
  return (!o.eo || o.eo.includes(bad))
    && (!o.ul || o.ul.includes(EDGE_POS[s.perm.indexOf(UL)]))
    && (!o.ur || o.ur.includes(EDGE_POS[s.perm.indexOf(UR)]));
};
const poolCache = new Map();
export function eolrbPool(opts) {
  const key = JSON.stringify(opts);
  if (!poolCache.has(key)) {
    const all = startStates();
    poolCache.set(key, opts.by === 'len' ? all.filter((x) => distAt(x) === opts.len) : all.filter((x) => matchPos(dec(x), opts)));
  }
  return poolCache.get(key);
}

// 色を付けるステッカー: U/D のセンター・U 面コーナー・UL/UR エッジ。残りの LSE エッジは U/D 色だけ
function highlightOf(cols, s) {
  const h = Array(54).fill('0');
  for (const k of CENTER_STK) if (cols[k] === SOLVED[CENTER_STK[0]] || cols[k] === SOLVED[CENTER_STK[2]]) h[k] = '1';
  for (const k of CORNER_STK) h[k] = '1';
  const ud = [SOLVED[CENTER_STK[0]], SOLVED[CENTER_STK[2]]];
  for (let i = 0; i < 6; i++) {
    const lr = s.perm[i] === UL || s.perm[i] === UR;
    for (const k of [UD_STK[i], SIDE_STK[i]]) if (lr || ud.includes(cols[k])) h[k] = '1';
  }
  return h.join('');
}

export function genEolrb(opts = {}) {
  const o = opts.by ? opts : { by: 'len', len: 8 };
  const pool = eolrbPool(o);
  const x = pool.length ? pool[Math.floor(Math.random() * pool.length)] : startStates()[0];
  const s = dec(x);
  const colors = toColors(s);
  const d = distAt(x);
  const sols = solutions(s, 4);
  return {
    eolrb: true,
    inputPad: true,
    padMoves: ["U'", 'U', "M'", 'M'],
    colors,
    highlight: highlightOf(colors, s),
    optQ: d,
    eolrbSols: sols,
    prompt: `EOLRbを最短で揃える手順を入力(QSTM ${d}手)`,
    caseKey: `QSTM${d}手`,
    eoCount: eoBad(s).reduce((a, b) => a + b, 0),
    ulPos: EDGE_POS[s.perm.indexOf(UL)],
    urPos: EDGE_POS[s.perm.indexOf(UR)],
  };
}

// 入力した手順で EOLRb が揃うか
export const solvesEolrb = (colors, moves) => isEolrb(fromColors(C.applyAlg(colors, moves)));

// 最短手数の最大(全探索の結果。tests/verify.mjs で確かめる)
export const MAX_LEN = 14;
