// 効果音と演出
let ctx = null;
let enabled = true;

export function setSound(on) { enabled = on; }

export function unlockAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  } catch (e) { ctx = null; }
}

function tone(freq, start, dur, type = 'sine', vol = 0.18) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sfxCorrect(combo) {
  const base = 660 * Math.pow(2, Math.min(combo, 12) / 12);
  tone(base, 0, 0.12, 'triangle');
  tone(base * 1.5, 0.07, 0.18, 'triangle');
}

export function sfxWrong() {
  tone(180, 0, 0.25, 'sawtooth', 0.08);
  tone(140, 0.1, 0.3, 'sawtooth', 0.08);
}

export function sfxFanfare() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.16));
  tone(1319, 0.48, 0.6, 'triangle', 0.14);
}

export function sfxTick() { tone(880, 0, 0.06, 'square', 0.05); }

// 紙吹雪
export function confetti(amount = 120) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#ffd500', '#00b44a', '#1565e8', '#e5242b', '#ff7a00', '#ffffff'];
  const parts = Array.from({ length: amount }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const startT = performance.now();
  const frame = (t) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (t - startT < 2600) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

// 浮かび上がる文字(+XP など)
export function floatText(text, x, y, cls = '') {
  const el = document.createElement('div');
  el.className = `float-text ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
