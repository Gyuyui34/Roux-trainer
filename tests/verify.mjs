// node tests/verify.mjs : 手順表と出題生成の検証
import * as C from '../js/cube.js';
import { CMLL_CASES, generate, _internal, badEdges, SQUARES, solvesSquare, mergeMoves, DR_POSITIONS, qtmLen, CORNER_POSITIONS, CO_ORIS, sbPieceCount, sbCatalog, sbCaseProblem } from '../js/drills.js';

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
// SB square: 手数の範囲を指定したら、正解も選択肢も範囲内
for (const [a, b] of [[2, 5], [3, 6], [6, 9], [2, 9], [4, 8]]) {
  for (let i = 0; i < 15; i++) {
    const p = generate('sbSq', { minLen: a, maxLen: b });
    const nums = p.choices.map((c) => Number(c.label.replace('手', '')));
    check(nums.every((n) => n >= a && n <= b) && nums.includes(Number(p.caseKey.replace('手', ''))), `sbSq range ${a}-${b}: ${nums} ${p.caseKey}`);
  }
}
// SB 手順入力: square のもう一つのエッジとコーナーの位置・向きの指定
{
  const all = sbPieceCount({ side: 'front' });
  check(all === 5180, `piece count all ${all}`);
  const sum = (key, list) => list.reduce((a, v) => a + sbPieceCount({ side: 'front', [key]: v }), 0);
  check(sum('coOri', Object.keys(CO_ORIS)) === all, 'corner ori partition');
  check(sum('coPos', CORNER_POSITIONS.map((p) => [p])) === all, 'corner pos partition');
  check(sum('e2Pos', DR_POSITIONS.map((p) => [p])) === all, 'edge2 pos partition');
  check(sum('e2Ori', ['good', 'bad']) === all, 'edge2 ori partition');
  check(sbPieceCount({ side: 'front', drPos: ['FR'], e2Pos: ['FR'] }) === 0, 'impossible combo');
  for (const side of ['front', 'back']) {
    const c = side === 'front' ? 'DRF' : 'DRB', e = side === 'front' ? 'FR' : 'BR';
    for (const opts of [{ coPos: ['UFR'], coOri: 'cw' }, { e2Pos: ['UB'], e2Ori: 'bad', coPos: ['DFR', 'DBR'], coOri: 'good' }, { drPos: ['DR'], drOri: 'bad', e2Pos: ['UL'], coPos: ['UBL'], coOri: 'ccw' }]) {
      const all2 = DR_POSITIONS;
      const p = generate('sbSolve', { side, drPos: all2, drOri: 'any', ...opts });
      const ok = (pos, ori, v, o) => (!pos || pos.includes(v)) && (!ori || ori === o);
      check(p.optLen >= 2 && p.square === side && ok(opts.e2Pos, opts.e2Ori, p.e2Pos, p.e2Ori) && ok(opts.coPos, opts.coOri, p.coPos, p.coOri) && ok(opts.drPos, opts.drOri, p.drPos, p.drOri), `piece cond ${side} ${JSON.stringify(opts)} → ${p.e2Pos}/${p.e2Ori} ${p.coPos}/${p.coOri}`);
    }
  }
  // 時計回りの定義: UFR の位置で D 色が R 面にあれば時計回り
  const n = sbPieceCount({ side: 'front', coPos: ['UFR'], coOri: 'cw' }), m = sbPieceCount({ side: 'front', coPos: ['UFR'], coOri: 'ccw' });
  check(n > 0 && m > 0, 'cw/ccw both occur');
}
// SB 手順入力: QSTM で手数を指定すると、その QSTM 最短手数の問題が出る
for (const side of ['front', 'back']) {
  for (const len of [2, 6, 8, 11]) {
    const p = generate('sbSolve', { side, len, metric: 'qstm' });
    check(p.qOptLen === len && p.caseKey === `${side} QSTM${len}手`, `sbSolve qstm ${side} ${len}: ${p.qOptLen}`);
  }
}
// SB 手順入力: 指定どおりの手数・square。180°回しをボタン 2 回で入力しても揃う
// パッドは U U' M M' R R'。r は M' R、r' は M R' で入力する
const PRESS = { r: ["M'", 'R'], "r'": ['M', "R'"] };
const quarter = (m) => (m.endsWith('2') ? [m[0], m[0]] : [m]).flatMap((q) => PRESS[q] || [q]);
for (const side of ['front', 'back']) {
  for (const len of [2, 4, 6, 9]) {
    const p = generate('sbSolve', { side, len });
    check(p.square === side && p.optLen === len && C.isSolvedAt(p.colors, C.FB_STICKERS), `sbSolve ${side} ${len} meta`);
    for (const alg of p.sbSols[side]) {
      const presses = alg.split(' ').flatMap(quarter);
      check(solvesSquare(p.colors, side, presses), `sbSolve ${side} ${len} solves: ${alg}`);
      check(alg.split(' ').length >= len && mergeMoves(presses).length === alg.split(' ').length, `sbSolve merge ${alg}`);
    }
    check(!solvesSquare(p.colors, side, []), 'sbSolve unsolved at start');
    check(p.qOptLen === qtmLen(p.qtmSols[side][0].split(' ')), 'sbSolve qOptLen');
    check(p.highlight.split('').filter((x) => x === '1').length === 8, 'sbSolve highlights only the 3 square pieces + R center');
  }
}
// SB 手順入力(DR エッジの位置で指定): DR エッジが指定した位置にあり、示した最短手順で揃う
const piece0 = (n) => C.piecesStickers([n]);
for (const pos of DR_POSITIONS) {
  for (const side of ['front', 'back']) {
    const ori = side === 'front' ? 'good' : 'bad';
    const p = generate('sbSolve', { side, drPos: [pos], drOri: ori });
    // D 色(3)のステッカーの面で向きを確かめる
    const dAt = piece0(pos).find((i) => C.applyAlg(C.solved(), p.scramble)[i] === 3);
    const dFace = C.FACES[Math.floor(dAt / 9)];
    check(p.drOri === ori && ((['FR', 'BR'].includes(pos) ? 'FB' : 'UD').includes(dFace) === (ori === 'good')), `sbSolve DR@${pos} eo ${ori} (${dFace})`);
    const at = C.applyAlg(C.solved(), p.scramble);
    const piece = C.piecesStickers([pos]);
    check(p.drPos === pos && piece.some((i) => at[i] === 3) && piece.some((i) => at[i] === 1), `sbSolve DR@${pos} ${side}`);
    check(p.optLen >= 2 && p.sbSols[side][0].split(' ').length === p.optLen && solvesSquare(p.colors, side, p.sbSols[side][0]), `sbSolve DR@${pos} ${side} solution`);
  }
}
const sqDone = (st, k) => C.isSolvedAt(st, C.piecesStickers(SQUARES[k].pieces));
// QTM の解答例: 揃う / HTM の解より QTM で長くない / 短い順 / 小さい手数では本当に最短
const SB_QUARTER = ['U', "U'", 'R', "R'", 'r', "r'", 'M', "M'"];
const shorterQ = (st, k, depth) => sqDone(st, k) || (depth > 0 && SB_QUARTER.some((m) => shorterQ(C.applyAlg(st, [m]), k, depth - 1)));
for (let i = 0; i < 40; i++) {
  const p = i % 2 ? generate('sbSq') : generate('sbSolve', { side: i % 4 ? 'front' : 'back', len: 2 + (i % 5) });
  for (const [k, list] of Object.entries(p.qtmSols)) {
    const qs = list.map((a) => qtmLen(a.split(' ')));
    check(list.every((a) => sqDone(C.applyAlg(p.colors, a), k)), `qtm solves ${k}`);
    check(qs.every((q, j) => !j || qs[j - 1] <= q), `qtm sorted ${qs}`);
    check(qs[0] <= Math.min(...p.sbSols[k].map((a) => qtmLen(a.split(' ')))), `qtm <= htm-sol qtm ${k}`);
    if (qs[0] <= 5) check(!shorterQ(p.colors, k, qs[0] - 1), `qtm optimal ${k} ${list[0]}`);
  }
}
// SB square: 示した手順で square が揃う / FB は揃ったまま / 手数より短い解がない
const SB_SET = C.expandMoveSet(['U', 'R', 'r', 'M']);
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
// SB 学習: 手数ごとの一覧を合わせると 2 手以上の全ケース。各ケースの盤面は一覧の手数どおり
for (const side of ['front', 'back']) {
  let tot = 0, totQ = 0;
  for (let n = 2; n <= 10; n++) tot += sbCatalog({ side, len: n, metric: 'stm' }).length;
  for (let n = 2; n <= 11; n++) totQ += sbCatalog({ side, len: n, metric: 'qstm' }).length;
  check(tot === 5180 && totQ === 5180, `sbCatalog ${side} total ${tot} ${totQ}`);
  const list = sbCatalog({ side, len: 4, metric: 'qstm' });
  check(list.every((c, i) => !i || list[i - 1].stm <= c.stm), 'sbCatalog sorted');
  for (const c of list.slice(0, 40)) {
    const p = sbCaseProblem(side, c.id);
    check(p.qOptLen === c.qstm && p.optLen === c.stm && p.caseNo === c.id, `sbCaseProblem ${side}#${c.id}`);
    check(C.isSolvedAt(p.colors, C.FB_STICKERS) && p.colors[4] === 0, 'sbCaseProblem FB/centers');
    check(sqDone(C.applyAlg(p.colors, p.qtmSols[side][0]), side), 'sbCaseProblem solution');
    const g = generate('sbSolve', { side, caseNo: c.id });
    check(g.caseNo === c.id, 'genSbSolve caseNo');
  }
  const pc = sbCatalog({ side, drPos: ['UF'], drOri: 'good', e2Pos: null, e2Ori: 'any', coPos: null, coOri: 'any' });
  check(pc.length === sbPieceCount({ side, drPos: ['UF'], drOri: 'good', e2Pos: null, e2Ori: 'any', coPos: null, coOri: 'any' }) && pc.every((c) => c.dr.pos === 'UF' && c.dr.ori === 'good'), 'sbCatalog pieces');
}
// LSE EO: 表の手数が総当たりと一致・解答例で揃う・条件どおりに出る
{
  const L = await import('../js/lse.js');
  const brute = (cols, depth) => L.solvesEo(cols, []) || (depth > 0 && L.MOVES.some((m) => brute(C.applyAlg(cols, [m]), depth - 1)));
  for (const n of L.START_LENS) {
    for (let i = 0; i < (n <= 5 ? 6 : 2); i++) {
      const p = L.genLseEo({ by: 'len', len: n });
      check(p && p.optQ === n, `lseEo len ${n}`);
      check(C.isSolvedAt(p.colors, C.F2B_STICKERS) && (p.colors[4] === 0 || p.colors[31] === 0), 'lseEo start');
      for (const a of p.lseSols) check(L.solvesEo(p.colors, a.split(' ')) && qtmLen(a.split(' ')) === n, `lseEo sol ${a}`);
      if (n <= 6) check(!brute(p.colors, n - 1), `lseEo optimal ${n}`);
      check(L.solvesEo(C.applyAlg(C.solved(), p.scramble.split(' ')), p.lseSols[0].split(' ')), 'lseEo scramble');
    }
  }
  const p = L.genLseEo({ by: 'pos', counts: [4], pos: { UF: 'bad', DB: 'good' } });
  check(p.badPos.length === 4 && p.badPos.includes('UF') && !p.badPos.includes('DB'), `lseEo pos ${p.badPos}`);
}
// SB 手順入力「短い方」: 指定手数が front/back の短い方。短い方の解答例でどちらかが揃う
for (const metric of ['stm', 'qstm']) {
  for (let i = 0; i < 6; i++) {
    const n = 4 + i;
    const p = generate('sbSolve', { side: 'both', len: n, metric });
    check((metric === 'qstm' ? p.qOptLen : p.optLen) === n, `sbSolve both ${metric} ${n}`);
    const bestQ = Object.values(p.qtmSols).map((l) => l[0]).sort((a, b) => qtmLen(a.split(' ')) - qtmLen(b.split(' ')))[0];
    check(solvesSquare(p.colors, 'both', bestQ.split(' ')) && qtmLen(bestQ.split(' ')) === p.qOptLen, 'sbSolve both sol');
    check(!solvesSquare(p.colors, 'both', []), 'sbSolve both unsolved');
  }
}
// 範囲指定: front と back の両方の最短手数が 最短〜最長 に入る
for (const [metric, lo, hi] of [['stm', 3, 5], ['qstm', 6, 9], ['stm', 2, 2], ['qstm', 11, 11]]) {
  for (let i = 0; i < 4; i++) {
    const p = generate('sbSolve', { side: 'both', len: lo, lenMax: hi, metric });
    const lens = Object.keys(SQUARES).map((k) => (metric === 'qstm' ? qtmLen(p.qtmSols[k][0].split(' ')) : p.sbSols[k][0].split(' ').length));
    check(lens.every((n) => n >= lo && n <= hi), `sbSolve both range ${metric} ${lo}-${hi}: ${lens}`);
  }
  const q = generate('sbSolve', { side: 'front', len: lo, lenMax: hi, metric });
  const n = metric === 'qstm' ? q.qOptLen : q.optLen;
  check(n >= lo && n <= hi, `sbSolve front range ${metric} ${lo}-${hi}: ${n}`);
}
console.log('cmllEo bad-edge counts', JSON.stringify(dist));
console.log(fail ? `${fail} failures` : 'all passed');
process.exit(fail ? 1 : 0);
