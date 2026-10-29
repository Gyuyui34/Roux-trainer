// CSS 3D でキューブを描く。ドラッグで視点を回せる。
import * as C from './cube.js';

const FACE_TRANSFORM = {
  U: 'rotateX(90deg)', D: 'rotateX(-90deg)', F: '', B: 'rotateY(180deg)',
  R: 'rotateY(90deg)', L: 'rotateY(-90deg)',
};

export const COLOR_HEX = {
  white: '#f4f4f4', yellow: '#ffd500', green: '#00b44a', blue: '#1565e8', red: '#e5242b', orange: '#ff7a00',
};
export const COLOR_JA = { white: '白', yellow: '黄', green: '緑', blue: '青', red: '赤', orange: 'オレンジ' };

// 基準配色(白上・緑前)から全 24 通りの持ち方を作る
const STANDARD = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
export const ORIENTATIONS = (() => {
  const res = new Map();
  const centers = [4, 13, 22, 31, 40, 49];
  let frontier = [C.solved()];
  const seen = new Set();
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      const key = centers.map((i) => s[i]).join('');
      if (seen.has(key)) continue;
      seen.add(key);
      const cols = centers.map((i) => STANDARD[s[i]]);
      res.set(`${cols[0]}-${cols[2]}`, cols);
      for (const r of ['x', 'y', 'z']) next.push(C.applyAlg(s, [r]));
    }
    frontier = next;
  }
  return res;
})();

export function schemeFor(up, front) {
  return ORIENTATIONS.get(`${up}-${front}`) || ORIENTATIONS.get('yellow-green');
}

// ステッカーを 1 枚ずつ 3D 上に置く。手のアニメーションでは、その層のステッカーをまとめて回す
const ROT_SIGN = [1, -1, 1]; // 正の軸から見た時計回り → CSS の回転角の向き(x, y, z)
const ROT_FN = ['rotateX', 'rotateY', 'rotateZ'];

export class CubeView {
  constructor(host, { scale = 0.48 } = {}) {
    this.host = host;
    this.scale = scale;
    this.yaw = -35;
    this.pitch = -28;
    this.scheme = schemeFor('yellow', 'green');
    host.classList.add('scene');
    this.cube = document.createElement('div');
    this.cube.className = 'cube3d';
    host.appendChild(this.cube);
    this.tileEls = [];
    this.stickerEls = [];
    C.STICKERS.forEach(() => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const st = document.createElement('div');
      st.className = 'sticker';
      tile.appendChild(st);
      this.cube.appendChild(tile);
      this.tileEls.push(tile);
      this.stickerEls.push(st);
    });
    this.layout();
    this.bindDrag();
    new ResizeObserver(() => this.layout()).observe(host);
  }

  layout() {
    const size = Math.min(this.host.clientWidth, this.host.clientHeight) * this.scale;
    this.size = size;
    this.cube.style.width = this.cube.style.height = `${size}px`;
    const u = size / 3;
    C.STICKERS.forEach((s, i) => {
      const el = this.tileEls[i];
      el.style.width = el.style.height = `${u}px`;
      el.style.left = el.style.top = `${(size - u) / 2}px`;
      const c = s.pos.map((v, a) => v * u + s.normal[a] * (u / 2));
      el.style.transform = `translate3d(${c[0]}px, ${-c[1]}px, ${c[2]}px) ${FACE_TRANSFORM[C.FACES[s.face]]}`;
    });
    this.apply();
  }

  setScheme(up, front) {
    this.scheme = schemeFor(up, front);
    if (this.colors) this.setColors(this.colors, this.highlight);
  }

  // highlight: 54 文字の '0'/'1'。'1' のステッカーだけ色を付ける
  setColors(colors, highlight = null) {
    this.colors = colors;
    this.highlight = highlight;
    // 強調表示のときは、それ以外を同じ灰色の半透明にして裏側のステッカーを透かして見せる
    this.cube.classList.toggle('xray', !!highlight);
    colors.forEach((c, i) => {
      const ghost = !!highlight && highlight[i] === '0';
      this.stickerEls[i].style.background = ghost ? '' : COLOR_HEX[this.scheme[c]];
      this.stickerEls[i].classList.toggle('ghost', ghost);
    });
  }

  // 層を回すアニメーション。手 m の層をまとめ、progress(0〜1)で回転角を決める。
  // tween で好きな位置まで動かし、stopTween でその場に止められる(途中で一時停止できる)
  // "U2'" のように 2' と書いた手は ' の向きに 180° 回す
  beginMove(m, progress = 0) {
    this.cancelMove();
    const rev = m.endsWith("2'");
    const { axis, layers, turns: t0 } = C.MOVES[rev ? m.slice(0, -1) : m];
    const turns = rev ? -2 * (C.MOVES[m.slice(0, -2) + "'"].turns === 3 ? 1 : -1) : t0;
    const group = document.createElement('div');
    group.className = 'layer';
    this.cube.appendChild(group);
    const moving = this.tileEls.filter((_, i) => layers.includes(C.STICKERS[i].pos[axis]));
    moving.forEach((el) => group.appendChild(el));
    this.moving = { m, group, tiles: moving, axis, deg: ROT_SIGN[axis] * (turns === 3 ? -90 : turns * 90), progress: 0 };
    this.setProgress(progress);
  }

  setProgress(p) {
    const mv = this.moving;
    mv.progress = p;
    const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2; // ease-in-out
    mv.group.style.transform = `${ROT_FN[mv.axis]}(${mv.deg * e}deg)`;
  }

  // 今の位置から target まで動かす。1手ぶん(0→1)が ms ミリ秒。止められたら false
  tween(target, ms) {
    this.stopTween();
    const mv = this.moving;
    const from = mv.progress, dur = Math.max(1, Math.abs(target - from) * ms), t0 = performance.now();
    return new Promise((resolve) => {
      const tw = { resolve };
      this.tw = tw;
      const step = (now) => {
        if (this.tw !== tw) return;
        const k = Math.min(1, (now - t0) / dur);
        this.setProgress(from + (target - from) * k);
        if (k < 1) tw.raf = requestAnimationFrame(step);
        else { this.tw = null; resolve(true); }
      };
      tw.raf = requestAnimationFrame(step);
    });
  }

  stopTween() {
    const tw = this.tw;
    if (!tw) return;
    this.tw = null;
    cancelAnimationFrame(tw.raf);
    tw.resolve(false);
  }

  // 回している層を元に戻す(ステッカーの色は変えない)
  endMove() {
    const mv = this.moving;
    if (!mv) return;
    this.moving = null;
    mv.tiles.forEach((el) => this.cube.appendChild(el));
    mv.group.remove();
  }

  cancelMove() {
    this.stopTween();
    this.endMove();
  }

  setView(pitch, yaw, animate = false) {
    this.pitch = pitch;
    this.yaw = yaw;
    this.cube.style.transition = animate ? 'transform .35s ease' : '';
    this.apply();
  }

  apply() {
    this.cube.style.transform = `rotateX(${this.pitch}deg) rotateY(${this.yaw}deg)`;
  }

  bindDrag() {
    // ドラッグで視点を回す。ほとんど動かさずに離したらタップとして onTap(side) を呼ぶ
    // side: キューブの左の余白 -1 / キューブ本体 0 / 右の余白 1
    let last = null, start = null, moved = 0;
    this.host.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      start = e.target.closest('button') ? null : last;
      moved = 0;
      this.cube.style.transition = '';
      this.host.setPointerCapture(e.pointerId);
    });
    this.host.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw += dx * 0.6;
      this.pitch = Math.max(-90, Math.min(90, this.pitch - dy * 0.6));
      this.apply();
    });
    const end = () => { last = null; };
    this.host.addEventListener('pointerup', (e) => {
      if (start && moved < 10 && this.onTap) {
        let l = Infinity, r = -Infinity;
        for (const el of this.tileEls) { const b = el.getBoundingClientRect(); l = Math.min(l, b.left); r = Math.max(r, b.right); }
        this.onTap(e.clientX < l ? -1 : e.clientX > r ? 1 : 0);
      }
      start = null;
      end();
    });
    this.host.addEventListener('pointercancel', end);
  }
}
