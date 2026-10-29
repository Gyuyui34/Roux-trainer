// ステッカー(54枚)ベースのキューブモデル。
// 面の順序は U R F D L B、各面 9 枚を外側から見た行優先で並べる。
// 座標系: x=右(R), y=上(U), z=前(F)。

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

const NORMALS = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

// 各面の (row, col) → 立方体上の位置
function posOf(face, r, c) {
  switch (face) {
    case 'U': return [c - 1, 1, r - 1];
    case 'D': return [c - 1, -1, 1 - r];
    case 'F': return [c - 1, 1 - r, 1];
    case 'B': return [1 - c, 1 - r, -1];
    case 'R': return [1, 1 - r, 1 - c];
    case 'L': return [-1, 1 - r, c - 1];
  }
}

export const STICKERS = [];
for (let f = 0; f < 6; f++) {
  for (let i = 0; i < 9; i++) {
    const face = FACES[f];
    STICKERS.push({ face: f, pos: posOf(face, Math.floor(i / 3), i % 3), normal: NORMALS[face] });
  }
}

const keyOf = (p, n) => `${p.join(',')}|${n.join(',')}`;
const STICKER_INDEX = new Map(STICKERS.map((s, i) => [keyOf(s.pos, s.normal), i]));

// 正の軸方向から見て時計回りに 90° 回す
function rot(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) return [x, z, -y];
  if (axis === 1) return [-z, y, x];
  return [y, -x, z];
}

// 基本ムーブ: 軸, 対象レイヤー(座標値の集合), 正の軸から見た時計回り回数
const BASE_MOVES = {
  U: [1, [1], 1], D: [1, [-1], 3], E: [1, [0], 3],
  R: [0, [1], 1], L: [0, [-1], 3], M: [0, [0], 3],
  F: [2, [1], 1], B: [2, [-1], 3], S: [2, [0], 1],
  r: [0, [0, 1], 1], l: [0, [-1, 0], 3],
  u: [1, [0, 1], 1], d: [1, [-1, 0], 3],
  f: [2, [0, 1], 1], b: [2, [-1, 0], 3],
  x: [0, [-1, 0, 1], 1], y: [1, [-1, 0, 1], 1], z: [2, [-1, 0, 1], 1],
};

// perm[i] = j : 位置 i のステッカーが位置 j に移る
function quarterPerm(axis, layers, turns) {
  const perm = new Array(54);
  for (let i = 0; i < 54; i++) {
    let { pos, normal } = STICKERS[i];
    if (layers.includes(pos[axis])) {
      for (let t = 0; t < turns; t++) { pos = rot(pos, axis); normal = rot(normal, axis); }
    }
    perm[i] = STICKER_INDEX.get(keyOf(pos, normal));
  }
  return perm;
}

export const MOVES = {};
for (const [name, [axis, layers, turns]] of Object.entries(BASE_MOVES)) {
  // layers / turns はアニメーション用(正の軸から見た時計回りの 90° 回数)
  MOVES[name] = { perm: quarterPerm(axis, layers, turns % 4), axis, base: name, layers, turns: turns % 4 };
  MOVES[name + '2'] = { perm: quarterPerm(axis, layers, (turns * 2) % 4), axis, base: name, layers, turns: (turns * 2) % 4 };
  MOVES[name + "'"] = { perm: quarterPerm(axis, layers, (turns * 3) % 4), axis, base: name, layers, turns: (turns * 3) % 4 };
}

export function solved() {
  return STICKERS.map((s) => s.face);
}

// 貼り付けられた手順も読めるよう、括弧・Rw 表記・空白なしの表記を許す
export function parseAlg(alg) {
  const s = alg.replace(/[’`´′]/g, "'").replace(/[()[\]{}]/g, ' ').replace(/([RLUDFB])w/g, (_, f) => f.toLowerCase());
  const tokens = s.match(/[RLUDFBMESrludfbxyz](?:2'|'2|2|3|')?|\S/g) || [];
  return tokens.map((t) => {
    const m = t.replace(/2'$|'2$/, '2').replace(/3$/, "'");
    if (!MOVES[m]) throw new Error(`読めない記号: ${t}`);
    return m;
  });
}

export function applyMove(state, m) {
  const perm = MOVES[m].perm;
  const next = new Array(54);
  for (let i = 0; i < 54; i++) next[perm[i]] = state[i];
  return next;
}

export function applyAlg(state, alg) {
  const moves = typeof alg === 'string' ? parseAlg(alg) : alg;
  for (const m of moves) state = applyMove(state, m);
  return state;
}

export function invertMove(m) {
  if (m.endsWith('2')) return m;
  if (m.endsWith("'")) return m.slice(0, -1);
  return m + "'";
}

export function invertAlg(moves) {
  return moves.slice().reverse().map(invertMove);
}

export function algToString(moves) {
  return moves.join(' ');
}

// ピース: 位置が同じステッカーの集まり
export const PIECES = (() => {
  const map = new Map();
  STICKERS.forEach((s, i) => {
    const k = s.pos.join(',');
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  return [...map.values()];
})();

// 面名の組 (例 "DL", "DLF") からステッカー位置を探す。先頭の面のステッカーを返す。
export function stickerAt(faces) {
  const want = [...faces].map((f) => FACES.indexOf(f));
  const pos = [0, 0, 0];
  for (const f of want) NORMALS[FACES[f]].forEach((v, a) => { if (v) pos[a] = v; });
  return STICKER_INDEX.get(keyOf(pos, NORMALS[FACES[want[0]]]));
}

// 指定ステッカー群がすべて「解けた色」と一致しているか
export function isSolvedAt(state, indices) {
  return indices.every((i) => state[i] === STICKERS[i].face);
}

// ピース名の一覧から、そのピースの全ステッカー位置を返す
export function piecesStickers(names) {
  const out = [];
  for (const n of names) {
    const s = stickerAt(n);
    const piece = PIECES.find((p) => p.includes(s));
    out.push(...piece);
  }
  return out;
}

export const FB_PIECES = ['DL', 'FL', 'BL', 'DLF', 'DLB'];
export const SB_PIECES = ['DR', 'FR', 'BR', 'DRF', 'DRB'];
export const U_CORNERS = ['UFL', 'UFR', 'UBR', 'UBL'];
export const FB_STICKERS = [...piecesStickers(FB_PIECES), 4 * 9 + 4];
export const SB_STICKERS = [...piecesStickers(SB_PIECES), 1 * 9 + 4];
export const F2B_STICKERS = [...FB_STICKERS, ...SB_STICKERS];

export function randomMoves(moveSet, n, rng = Math.random) {
  const out = [];
  let prevAxis = -1, prevBases = [];
  while (out.length < n) {
    const m = moveSet[Math.floor(rng() * moveSet.length)];
    const { axis, base } = MOVES[m];
    if (axis === prevAxis && prevBases.includes(base)) continue;
    if (axis !== prevAxis) prevBases = [];
    prevAxis = axis;
    prevBases.push(base);
    out.push(m);
  }
  return out;
}

export function expandMoveSet(bases) {
  return bases.flatMap((b) => [b, b + "'", b + '2']);
}
