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
    this.stickerEls = new Array(54);
    C.FACES.forEach((face, f) => {
      const el = document.createElement('div');
      el.className = 'face';
      el.dataset.face = face;
      for (let i = 0; i < 9; i++) {
        const s = document.createElement('div');
        s.className = 'sticker';
        el.appendChild(s);
        this.stickerEls[f * 9 + i] = s;
      }
      this.cube.appendChild(el);
      this[`face${face}`] = el;
    });
    this.layout();
    this.bindDrag();
    new ResizeObserver(() => this.layout()).observe(host);
  }

  layout() {
    const size = Math.min(this.host.clientWidth, this.host.clientHeight) * this.scale;
    this.cube.style.width = this.cube.style.height = `${size}px`;
    C.FACES.forEach((face) => {
      this[`face${face}`].style.transform = `${FACE_TRANSFORM[face]} translateZ(${size / 2}px)`;
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
    let last = null;
    this.host.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      this.cube.style.transition = '';
      this.host.setPointerCapture(e.pointerId);
    });
    this.host.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      this.yaw += dx * 0.6;
      this.pitch = Math.max(-90, Math.min(90, this.pitch - dy * 0.6));
      this.apply();
    });
    const end = () => { last = null; };
    this.host.addEventListener('pointerup', end);
    this.host.addEventListener('pointercancel', end);
  }
}
