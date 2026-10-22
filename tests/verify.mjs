// node tests/verify.mjs : 手順表と出題生成の検証
import * as C from '../js/cube.js';
import { CMLL_CASES, generate, _internal, badEdges } from '../js/drills.js';

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
// AUF モード: なし=手順をそのままかければ解ける / ランダム=正解 AUF の後に手順で解ける
const solvedCmll = (s) => ['', 'y', 'y2', "y'", 'x', 'x2', "x'", 'z', "z'", 'z2'].some((q) => {
  const t = C.applyAlg(s, q ? [q] : []);
  return C.isSolvedAt(t, C.F2B_STICKERS) && cornersSolvedUpToAuf(t);
});
for (let i = 0; i < 60; i++) {
  const p = generate('cmll', {});
  check(p.aufAnswers === null && solvedCmll(C.applyAlg(p.colors, p.choices[p.answer].label)), 'cmll no-auf direct');
  check(p.colors[4] === 0, 'cmll no-auf centers');
  const r = generate('cmllAuf', {});
  check(r.drill === 'cmllAuf' && r.aufAnswers.length >= 1, 'cmllAuf answers');
  for (const a of ['', 'U', 'U2', "U'"]) {
    const ok = solvedCmll(C.applyAlg(C.applyAlg(r.colors, a ? [a] : []), r.choices[r.answer].label));
    check(ok === r.aufAnswers.includes(a), `cmllAuf auf ${a} ok=${ok} answers=${r.aufAnswers}`);
  }
}
console.log('auf modes checked');

// CMLL→EO: 揃っていないエッジの数は偶数。判定は eoDone と一致(0 個 ⇔ EO 完成)
const dist = {};
for (let i = 0; i < 300; i++) {
  const p = generate('cmllEo', {});
  check(p.eoBad.length % 2 === 0, `eo bad count odd ${p.eoBad}`);
  check((p.eoBad.length === 0) === _internal.eoDone(p.after), `eo consistency ${p.eoBad}`);
  check(C.isSolvedAt(p.after, C.F2B_STICKERS) && cornersSolvedUpToAuf(p.after), 'cmllEo after solved');
  dist[p.eoBad.length] = (dist[p.eoBad.length] || 0) + 1;
}
// M を 1 回かけても判定が変わらない(揃っている/いないは M 列の向きの基準で不変)
for (let i = 0; i < 100; i++) {
  const s = C.applyAlg(C.solved(), C.randomMoves(['M', "M'", 'M2', 'U', "U'", 'U2'], 20));
  const before = badEdges(s).length;
  // センターが揃っている(または M2 ずれ)ときは U で揃っていないエッジの数は変わらない
  if (s[4] === 0 || s[4] === 3) check(badEdges(C.applyAlg(s, ['U'])).length === before, 'U keeps bad count');
  check(_internal.eoDone(s) === (before === 0), 'eoDone matches badEdges');
}
console.log('cmllEo bad-edge counts', JSON.stringify(dist));
console.log(fail ? `${fail} failures` : 'all passed');
process.exit(fail ? 1 : 0);
