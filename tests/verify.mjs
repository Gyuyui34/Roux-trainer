// node tests/verify.mjs : 手順表と出題生成の検証
import * as C from '../js/cube.js';
import { CMLL_CASES, generate, _internal, badEdges, SQUARES } from '../js/drills.js';

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
  const p = generate(i % 2 ? 'cmllEoAuf' : 'cmllEo', {});
  check(p.eoAnswers.length >= 1 && (i % 2 ? p.aufAnswers.length === p.eoAnswers.length : p.eoAnswers[0].auf === ''), 'eo answers shape');
  for (const e of p.eoAnswers) {
    const after = e.after.split('').map(Number);
    // 記録された「回した後」は実際に AUF → 手順をかけた状態と一致し、CMLL が解けている
    check(after.join('') === C.applyAlg(C.applyAlg(p.colors, e.auf ? [e.auf] : []), p.alg).join(''), 'eo after matches');
    check(C.isSolvedAt(after, C.F2B_STICKERS) && cornersSolvedUpToAuf(after), 'cmllEo after solved');
    check(e.bad.length % 2 === 0, `eo bad count odd ${e.bad}`);
    check((e.bad.length === 0) === _internal.eoDone(after), `eo consistency ${e.bad}`);
    dist[e.bad.length] = (dist[e.bad.length] || 0) + 1;
  }
}
// M を 1 回かけても判定が変わらない(揃っている/いないは M 列の向きの基準で不変)
for (let i = 0; i < 100; i++) {
  const s = C.applyAlg(C.solved(), C.randomMoves(['M', "M'", 'M2', 'U', "U'", 'U2'], 20));
  const before = badEdges(s).length;
  // センターが揃っている(または M2 ずれ)ときは U で揃っていないエッジの数は変わらない
  if (s[4] === 0 || s[4] === 3) check(badEdges(C.applyAlg(s, ['U'])).length === before, 'U keeps bad count');
  check(_internal.eoDone(s) === (before === 0), 'eoDone matches badEdges');
}
// SB square: 示した手順で square が揃う / FB は揃ったまま / 手数より短い解がない
const SB_SET = C.expandMoveSet(['U', 'R', 'r', 'M']);
const sqDone = (st, k) => C.isSolvedAt(st, C.piecesStickers(SQUARES[k].pieces));
const anyShorter = (st, k, depth) => {
  if (sqDone(st, k)) return true;
  if (!depth) return false;
  return SB_SET.some((m) => anyShorter(C.applyAlg(st, [m]), k, depth - 1));
};
for (let i = 0; i < 60; i++) {
  const p = generate('sbSq');
  check(C.isSolvedAt(p.colors, C.FB_STICKERS), 'sbSq FB solved');
  check(p.colors[4] === 0, 'sbSq centers aligned');
  const best = Number(p.caseKey.replace('手', ''));
  check(p.choices[p.answer].label === p.caseKey, 'sbSq answer label');
  for (const k of Object.keys(SQUARES)) {
    const m = p.explain.match(new RegExp(`${SQUARES[k].name} (\\d+)手 \\(([^/)]+)`));
    const len = Number(m[1]);
    check(sqDone(C.applyAlg(p.colors, m[2].trim()), k), `sbSq ${k} solution works`);
    check(len >= best && p.aufAnswers.includes(k) === (len === best), `sbSq ${k} answer set`);
    if (len <= 4) check(!anyShorter(p.colors, k, len - 1), `sbSq ${k} optimal`);
  }
}
console.log('cmllEo bad-edge counts', JSON.stringify(dist));
console.log(fail ? `${fail} failures` : 'all passed');
process.exit(fail ? 1 : 0);
