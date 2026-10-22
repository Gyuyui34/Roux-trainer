// node tests/verify.mjs : 手順表と出題生成の検証
import * as C from '../js/cube.js';
import { CMLL_CASES, generate, _internal } from '../js/drills.js';

let fail = 0;
const check = (cond, msg) => { if (!cond) { fail++; console.log('NG:', msg); } };

// CMLL: F2B を崩さない / 42 ケースが重複しない / セットごとの数
for (const c of CMLL_CASES) {
  check(C.isSolvedAt(C.applyAlg(C.solved(), c.moves), C.F2B_STICKERS), `F2B broken: ${c.alg}`);
  check(c.set, `unknown set: ${c.alg}`);
}
const keys = new Set(CMLL_CASES.map((c) => c.key));
check(keys.size === 42, `distinct cases ${keys.size}`);
const counts = {};
CMLL_CASES.forEach((c) => (counts[c.set] = (counts[c.set] || 0) + 1));
check(JSON.stringify(counts) === JSON.stringify({ O: 2, H: 4, Pi: 6, U: 6, T: 6, S: 6, AS: 6, L: 6 }), `set counts ${JSON.stringify(counts)}`);

const UC = C.piecesStickers(C.U_CORNERS);
const cornersSolvedUpToAuf = (s) => ['', 'U', 'U2', "U'"].some((a) => C.isSolvedAt(C.applyAlg(s, a ? [a] : []), UC));

for (const drill of ['fb', 'sb', 'cmll', 'eo']) {
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const p = generate(drill, {});
    check(p.choices.length === 4, `${drill} choices`);
    p.choices.forEach((ch, idx) => {
      const after = C.applyAlg(p.colors, ch.label);
      let ok;
      // CMLL は手順前の AUF を許す
      const anyAuf = (f) => ['', 'U', 'U2', "U'"].some((a) => f(C.applyAlg(C.applyAlg(p.colors, a ? [a] : []), ch.label)));
      if (drill === 'fb') ok = C.isSolvedAt(after, C.FB_STICKERS);
      if (drill === 'sb') ok = C.isSolvedAt(after, C.F2B_STICKERS);
      if (drill === 'cmll') ok = anyAuf((s) => C.isSolvedAt(s, C.F2B_STICKERS) && cornersSolvedUpToAuf(s));
      if (drill === 'eo') ok = _internal.eoDone(after);
      check(ok === (idx === p.answer), `${drill} choice ${idx} ok=${ok} answer=${p.answer} ${ch.label}`);
    });
    if (drill === 'cmll') check(p.colors[4] === 0 && p.colors[22] === 2, 'cmll centers aligned');
    if (drill !== 'fb') check(C.isSolvedAt(p.colors, drill === 'sb' ? C.FB_STICKERS : C.F2B_STICKERS), `${drill} precondition`);
  }
  console.log(drill, 'ok', `${((Date.now() - t0) / 40).toFixed(1)}ms/問`);
}
console.log(fail ? `${fail} failures` : 'all passed');
process.exit(fail ? 1 : 0);
