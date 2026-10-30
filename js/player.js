// 解答手順のアニメーション再生(層をなめらかに回し、最後まで行ったら最初からくり返す)
// 一時停止(pause)は回している途中の角度で止まる(左右の 1 手送りで使う)。タップの停止/再生は最初の盤面から。左右の 1 手送りは順番に積んで 1 手ずつ回す
import { applyAlg } from './cube.js';
import * as FX from './fx.js';

// U2・M2 は U2'・M2' と書く(表示とアニメーションの向きだけ。中身は U2・M2 のまま)
export const u2p = (alg) => alg.replace(/([UM])2(?!')/g, "$12'");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const invMove = (m) => (m.endsWith("2'") ? m.slice(0, -1) : m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : m + "'");
const moveMs = (m) => (m.includes('2') ? 800 : 560);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Player {
  // view: CubeView / label: 手順を表示する要素(なくてもよい) / sound: 1 手ごとの効果音
  constructor(view, { label = null, sound = true, speed = 1 } = {}) {
    this.view = view;
    this.label = label;
    this.sound = sound;
    this.speed = speed;
    this.dead = false;
  }

  // colors0: 最初の盤面 / highlight: '0'/'1' の文字列(なければ null) / alg: 内部表記の手順
  load(colors0, highlight, alg) {
    const internal = alg.split(' ').filter(Boolean);
    this.moves = u2p(alg).split(' ').filter(Boolean);
    this.colors = [colors0];
    this.marks = [highlight ? highlight.split('') : null];
    for (const m of internal) {
      this.colors.push(applyAlg(this.colors[this.colors.length - 1], [m]));
      const mk = this.marks[this.marks.length - 1];
      this.marks.push(mk ? applyAlg(mk, [m]) : null);
    }
    this.pos = 0;
    this.paused = false;
    this.run = null;
    this.queue = [];
    this.stepping = false;
    this.snap();
    this.show();
    return this;
  }

  start(delay = 400) {
    sleep(delay).then(() => { if (!this.dead && !this.paused && !this.run) this.loop(); });
    return this;
  }

  stop() {
    this.dead = true;
    this.run = null;
    this.view.cancelMove();
  }

  mark(i) { return this.marks[i] ? this.marks[i].join('') : null; }

  show() {
    if (!this.label || this.dead) return;
    const cur = this.view.moving ? this.pos : -1;
    this.label.innerHTML = this.moves.map((m, k) => `<span class="${k === cur ? 'cur' : k < this.pos ? 'done' : ''}">${esc(m)}</span>`).join(' ')
      + (this.paused ? ' <span class="pause">⏸</span>' : '');
  }

  // 今の手数の盤面にする(回している途中の層は戻す)
  snap() {
    this.view.cancelMove();
    this.view.setColors(this.colors[this.pos], this.mark(this.pos));
  }

  // 回している途中の手(moves[pos])を target(1:回し切る / 0:回す前に戻す)まで動かす
  async go(target, ms) {
    this.show();
    const ok = await this.view.tween(target, ms / this.speed);
    if (!ok || this.dead) return false;
    this.view.endMove();
    if (target === 1) {
      this.pos++;
      this.view.setColors(this.colors[this.pos], this.mark(this.pos));
    }
    if (this.sound) FX.sfxTurn(Math.max(0, this.pos - 1), this.moves.length);
    this.show();
    return true;
  }

  async loop() {
    const run = {};
    this.run = run;
    const alive = () => !this.dead && this.run === run && !this.paused;
    while (alive()) {
      if (this.pos >= this.moves.length) {
        this.show();
        await sleep(600 / this.speed);
        if (!alive()) return;
        this.pos = 0;
        this.snap();
        this.show();
        await sleep(400 / this.speed);
        continue;
      }
      if (!this.view.moving) this.view.beginMove(this.moves[this.pos]);
      if (!(await this.go(1, moveMs(this.moves[this.pos]))) || !alive()) return;
      await sleep(180 / this.speed);
    }
  }

  pause() {
    if (this.dead) return;
    this.paused = true;
    this.run = null;
    this.view.stopTween();
    this.show();
  }

  // 止めて最初の盤面に戻す
  rewind() {
    if (this.dead) return;
    this.pause();
    this.queue = [];
    this.pos = 0;
    this.snap();
    this.show();
  }

  resume() {
    if (this.dead || !this.paused) return;
    this.queue = [];
    this.paused = false;
    this.loop();
  }

  step(dir) {
    if (!this.paused) this.pause();
    this.queue.push(dir);
    if (!this.stepping) this.drain();
  }

  async drain() {
    const n = this.moves.length, view = this.view;
    this.stepping = true;
    while (!this.dead && this.paused && this.queue.length) {
      const dir = this.queue.shift();
      if (!view.moving) {
        // 端では反対の端へループする
        if (dir > 0 && this.pos >= n) { this.pos = 0; this.snap(); this.show(); continue; }
        if (dir < 0 && this.pos <= 0) { this.pos = n; this.snap(); this.show(); continue; }
        if (dir > 0) view.beginMove(this.moves[this.pos], 0);
        else {
          this.pos--;
          view.setColors(this.colors[this.pos], this.mark(this.pos));
          view.beginMove(this.moves[this.pos], 1);
        }
      }
      if (!(await this.go(dir > 0 ? 1 : 0, Math.round(moveMs(this.moves[this.pos]) * 0.7)))) break;
    }
    this.stepping = false;
  }

  // キューブ本体のタップで停止/再生、右の余白で 1 手進む、左の余白で 1 手戻る。
  // 停止も再生も最初の盤面から(ユーザーの決めた仕様。キューブのタップで止める機能はすべてこれに揃える)
  tap(side) {
    if (this.dead) return;
    if (side) this.step(side);
    else if (this.paused) { this.rewind(); this.resume(); }
    else this.rewind();
  }
}
