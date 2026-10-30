// ブロック系(FB/SB)の最短手順ソルバー。
// 各ピースから 1 枚ずつステッカーを選んで位置を追跡する(1 枚で位置と向きが決まる)。
import { MOVES, STICKERS, stickerAt } from './cube.js';

const EDGE_IDX = [], CORNER_IDX = [];
const COMPACT = new Array(54).fill(-1);
STICKERS.forEach((s, i) => {
  const nz = s.pos.filter((v) => v !== 0).length;
  if (nz === 2) { COMPACT[i] = EDGE_IDX.length; EDGE_IDX.push(i); }
  if (nz === 3) { COMPACT[i] = CORNER_IDX.length; CORNER_IDX.push(i); }
});

export class BlockSolver {
  // pieces: ['DL','FL',...] / moves: ['U',"U'",...] / tables: ピース番号の組の配列
  constructor(pieces, moves, tables) {
    this.moves = moves;
    this.goal = pieces.map((p) => COMPACT[stickerAt(p)]);
    this.isCorner = pieces.map((p) => p.length === 3);
    // trans[m][class][compact] → compact
    this.trans = moves.map((m) => {
      const perm = MOVES[m].perm;
      return [EDGE_IDX.map((i) => COMPACT[perm[i]]), CORNER_IDX.map((i) => COMPACT[perm[i]])];
    });
    this.axis = moves.map((m) => MOVES[m].axis);
    const order = ['U', 'D', 'E', 'u', 'd', 'R', 'L', 'M', 'r', 'l', 'F', 'B', 'S', 'f', 'b'];
    this.baseRank = moves.map((m) => order.indexOf(MOVES[m].base));
    this.tables = tables.map((subset) => this.buildTable(subset));
  }

  step(locs, mi) {
    const t = this.trans[mi];
    return locs.map((v, k) => t[this.isCorner[k] ? 1 : 0][v]);
  }

  buildTable(subset) {
    const size = 24 ** subset.length;
    const dist = new Uint8Array(size).fill(255);
    const n = subset.length;
    const cls = subset.map((k) => (this.isCorner[k] ? 1 : 0));
    const digits = new Array(n);
    dist[subset.reduce((a, k) => a * 24 + this.goal[k], 0)] = 0;
    for (let d = 0, changed = true; changed; d++) {
      changed = false;
      for (let e = 0; e < size; e++) {
        if (dist[e] !== d) continue;
        for (let j = n - 1, v = e; j >= 0; j--) { digits[j] = v % 24; v = (v - digits[j]) / 24; }
        for (let mi = 0; mi < this.trans.length; mi++) {
          const t = this.trans[mi];
          let ne = 0;
          for (let j = 0; j < n; j++) ne = ne * 24 + t[cls[j]][digits[j]];
          if (dist[ne] === 255) { dist[ne] = d + 1; changed = true; }
        }
      }
    }
    return { subset, dist };
  }

  h(locs) {
    let best = 0;
    for (const { subset, dist } of this.tables) {
      let e = 0;
      for (const k of subset) e = e * 24 + locs[k];
      if (dist[e] > best) best = dist[e];
    }
    return best;
  }

  locsFromState(state) {
    // state[i] は位置 i にあるステッカーの元の面。ピースを特定するため、
    // 各位置の「元のステッカー番号」を持つ追跡用配列から求める。
    return this.goal.map((g, k) => {
      const home = (this.isCorner[k] ? CORNER_IDX : EDGE_IDX)[g];
      return COMPACT[state.indexOf(home)];
    });
  }

  // tracked: 54 要素の配列 tracked[pos] = 元のステッカー番号
  solve(tracked, opts) {
    return this.solveLocs(this.locsFromState(tracked), opts);
  }

  // locs: 追跡しているステッカーの位置(圧縮番号)
  solveLocs(locs, { maxSolutions = 1, extra = 0, maxDepth = 14 } = {}) {
    const sols = [];
    const path = [];
    const start = this.h(locs);
    let found = -1;
    for (let depth = start; depth <= maxDepth; depth++) {
      this.search(locs, depth, -1, path, sols, maxSolutions);
      if (sols.length && found < 0) found = depth;
      if (found >= 0 && (depth >= found + extra || sols.length >= maxSolutions)) break;
    }
    return sols;
  }

  search(locs, depth, prev, path, sols, max) {
    if (sols.length >= max) return;
    const h = this.h(locs);
    if (h > depth) return;
    if (depth === 0) {
      if (h === 0) sols.push(path.map((mi) => this.moves[mi]));
      return;
    }
    for (let mi = 0; mi < this.moves.length; mi++) {
      if (prev >= 0 && this.axis[mi] === this.axis[prev] && this.baseRank[mi] <= this.baseRank[prev]) continue;
      path.push(mi);
      this.search(this.step(locs, mi), depth - 1, mi, path, sols, max);
      path.pop();
      if (sols.length >= max) return;
    }
  }
}

// ステッカーの「個体」を追跡するための状態。tracked[pos] = 元のステッカー番号
export function trackedSolved() {
  return STICKERS.map((_, i) => i);
}

export function trackedApply(tracked, moves) {
  for (const m of moves) {
    const perm = MOVES[m].perm;
    const next = new Array(54);
    for (let i = 0; i < 54; i++) next[perm[i]] = tracked[i];
    tracked = next;
  }
  return tracked;
}

export function colorsOf(tracked) {
  return tracked.map((i) => STICKERS[i].face);
}
