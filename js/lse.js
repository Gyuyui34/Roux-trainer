// LSE(U と M だけで動く最後の 6 エッジ)の EO 練習。
// EO だけを見るので、局面は「6 か所それぞれの向き」と「センターのずれ(M の回数)」の 64×4 通りで足りる。
// 手数は QSTM(U・M の 90° を 1 手、180° は 2 手)。
import * as C from './cube.js';

export const EDGE_POS = ['UF', 'UB', 'UL', 'UR', 'DF', 'DB'];
// 各位置の U/D 面のステッカーと、もう一方のステッカー
const UD_STK = EDGE_POS.map((p) => C.stickerAt(p));
const SIDE_STK = EDGE_POS.map((p) => C.stickerAt(p[1] + p[0]));
// センターの置き場所(M で U→F→D→B と回る)
const CENTER_STK = ['U', 'F', 'D', 'B'].map((f) => C.FACES.indexOf(f) * 9 + 4);
export const MOVES = ['U', "U'", 'M', "M'"];
const SOLVED = C.solved();
const UD_COLORS = [SOLVED[CENTER_STK[0]], SOLVED[CENTER_STK[2]]];
const M_SLICE = [0, 1, 4, 5];

// 盤面 → { ori: 位置ごとに U/D 色が U/D 面にないなら 1, c: U センターの置き場所 }
export function eoState(cols) {
  return {
    ori: EDGE_POS.map((_, i) => (UD_COLORS.includes(cols[UD_STK[i]]) ? 0 : 1)),
    c: CENTER_STK.findIndex((s) => cols[s] === UD_COLORS[0]),
  };
}
// 向きが悪い位置。センターが M/M' ずれのときは、M 列のエッジは U/D 色が F/B 面を向いていれば合っている
export const badOf = (s) => s.ori.map((o, i) => (s.c % 2 && M_SLICE.includes(i) ? 1 - o : o));
export const eoDone = (s) => badOf(s).every((b) => !b);
// 練習の完成形: EO が揃い、U/D のセンターが U/D 面にある(手順の最後に M 列も合わせる)
export const eoFinished = (s) => s.c % 2 === 0 && eoDone(s);

// 手の作用(ステッカーの置換から作る)
const TABLE = MOVES.map((m) => {
  const perm = C.MOVES[m].perm;
  return {
    edge: EDGE_POS.map((_, i) => {
      const j = perm[UD_STK[i]];
      const q = UD_STK.indexOf(j);
      return q >= 0 ? [q, 0] : [SIDE_STK.indexOf(j), 1];
    }),
    center: CENTER_STK.map((s) => CENTER_STK.indexOf(perm[s])),
  };
});
function applyTo(s, mi) {
  const t = TABLE[mi], ori = new Array(6);
  for (let i = 0; i < 6; i++) { const [q, f] = t.edge[i]; ori[q] = s.ori[i] ^ f; }
  return { ori, c: t.center[s.c] };
}
const enc = (s) => s.ori.reduce((x, o, i) => x | (o << i), 0) * 4 + s.c;
const dec = (x) => ({ ori: EDGE_POS.map((_, i) => ((x >> 2) >> i) & 1), c: x % 4 });

// EO 完成からの幅優先探索(手の集合は逆手で閉じている)
const DIST = new Int8Array(256).fill(-1);
let frontier = [];
for (let x = 0; x < 256; x++) if (eoFinished(dec(x))) { DIST[x] = 0; frontier.push(x); }
for (let d = 1; frontier.length; d++) {
  const next = [];
  for (const x of frontier) for (let mi = 0; mi < 4; mi++) {
    const y = enc(applyTo(dec(x), mi));
    if (DIST[y] < 0) { DIST[y] = d; next.push(y); }
  }
  frontier = next;
}
export const distOf = (s) => DIST[enc(s)];
export const MAX_LEN = Math.max(...DIST);

// 最短手順をいくつか(同じ層の 90° が 2 回続いたら 2 とまとめて書く。U U と U' U' は同じ U2 なので 1 つにする)。
// 並び順(ユーザー指定): M' が多いもの → U' が多いもの。2 は ' の向きに書く(M2'・U2')ので ' 2 回と数える
const primes = (alg, b) => alg.split(' ').reduce((a, m) => a + (m[0] !== b ? 0 : m.endsWith('2') ? 2 : m.endsWith("'") ? 1 : 0), 0);
export function solutions(s, want = 4) {
  const out = [];
  const walk = (st, path) => {
    if (out.length >= 5000) return;
    const d = DIST[enc(st)];
    if (d === 0) { out.push(path.slice()); return; }
    for (let mi = 0; mi < 4; mi++) {
      const t = applyTo(st, mi);
      if (DIST[enc(t)] === d - 1) { path.push(MOVES[mi]); walk(t, path); path.pop(); }
    }
  };
  walk(s, []);
  const join = (moves) => {
    const r = [];
    for (const m of moves) {
      const last = r[r.length - 1];
      if (last && last[0] === m[0] && !last.endsWith('2')) r[r.length - 1] = `${m[0]}2`;
      else r.push(m);
    }
    return r.join(' ');
  };
  return [...new Set(out.map(join))]
    .sort((a, b) => primes(b, 'M') - primes(a, 'M') || primes(b, 'U') - primes(a, 'U'))
    .slice(0, want);
}

// ---- 出題
// opts: { by: 'len', len } 最短手数 / { by: 'pos', counts: [悪いエッジの数], pos: { UF: 'bad'|'good', ... } }
export const BAD_COUNTS = [2, 4, 6];
const matches = (s, o) => {
  const bad = badOf(s);
  if (o.by === 'len') return distOf(s) === o.len;
  const n = bad.reduce((a, b) => a + b, 0);
  if (!n) return false;
  if (o.counts && !o.counts.includes(n)) return false;
  return EDGE_POS.every((p, i) => !o.pos || !o.pos[p] || (o.pos[p] === 'bad') === !!bad[i]);
};
// 条件に合う向きのパターンの数(U センターが U/D 面のもの)
export function eoCount(o) {
  let n = 0;
  for (let x = 0; x < 256; x++) { const s = dec(x); if (s.c % 2 === 0 && DIST[x] > 0 && matches(s, o)) n++; }
  return n;
}

// CMLL まで終わった状態から U と M をランダムに回し、U センターを U/D 面に戻して条件に合うものを探す
export function genLseEo(opts = {}) {
  const o = opts.by ? opts : { by: 'len', len: 4 };
  let cols = null, s = null, scramble = null;
  for (let tries = 0; tries < 5000; tries++) {
    const seq = Array.from({ length: 25 }, () => MOVES[Math.floor(Math.random() * 4)]);
    let st = C.applyAlg(SOLVED, seq);
    const c = eoState(st).c;
    if (c % 2) { const fix = Math.random() < 0.5 ? 'M' : "M'"; seq.push(fix); st = C.applyAlg(st, [fix]); }
    const e = eoState(st);
    if (distOf(e) > 0 && matches(e, o)) { cols = st; s = e; scramble = seq; break; }
  }
  if (!cols) return null;
  const d = distOf(s);
  const bad = badOf(s);
  return {
    lseEo: true,
    inputPad: true,
    padMoves: ["U'", 'U', "M'", 'M'],
    colors: cols,
    highlight: null, // 全部のピースに色を付ける
    optQ: d,
    lseSols: solutions(s, 4),
    scramble: scramble.join(' '),
    prompt: `EOを最短で揃える手順を入力(QSTM ${d}手)`,
    caseKey: `QSTM${d}手`,
    badPos: EDGE_POS.filter((_, i) => bad[i]),
  };
}

// 入力した手順で EO が揃い、U/D センターが U/D 面にあるか
export const solvesEo = (colors, moves) => eoFinished(eoState(C.applyAlg(colors, moves)));

// 出題できる最短手数(U センターが U/D 面にある局面で現れるもの)
export const START_LENS = Array.from({ length: MAX_LEN }, (_, i) => i + 1).filter((n) => eoCount({ by: 'len', len: n }) > 0);
