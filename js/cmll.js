// CMLL 42 ケースの手順。どのケースに対応するかは手順を逆再生して求める
// (tests/verify.mjs で F2B を崩さないこと・42 ケースが重複なく揃うことを確認)。
export const CMLL_ALGS = [
  // O
  "R U R' F' R U R' U' R' F R2 U' R'",
  "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  // H
  "R U2 R' U' R U R' U' R U' R'",
  "F R U R' U' R U R' U' R U R' U' F'",
  "r U' r2 D' r U' r' D r2 U r'",
  "R U2 R2 F R F' U2 R' F R F'",
  // Pi
  "F R U R' U' R U R' U' F'",
  "F R' F' R U2 R U' R' U R U2 R'",
  "R' F R U F U' R U R' U' F'",
  "R U2 R' U' R U R' U2 R' F R F'",
  "r U' r2 D' r U r' D r2 U r'",
  "R' U' R' F R F' R U' R' U2 R",
  // U
  "R2 D R' U2 R D' R' U2 R'",
  "R2 D' R U2 R' D R U2 R",
  "R2 F U' F U F2 R2 U' R' F R",
  "F R2 D R' U R D' R2 U' F'",
  "r U' r' U r' D' r U' r' D r",
  "F R U R' U' F'",
  // T
  "R U R' U' R' F R F'",
  "L' U' L U L F' L' F",
  "F R' F R2 U' R' U' R U R' F2",
  "r' U r U2 R2 F R F' R",
  "r' D' r U r' D r U' r U r'",
  "r2 D' r U r' D r2 U' r' U' r",
  // S
  "R U R' U R U2 R'",
  "L' U2 L U2 L F' L' F",
  "F R' F' R U2 R U2 R'",
  "R U' L' U R' U' L",
  "R U R' U R' F R F' R U2 R'",
  "F U' R2 D R' U R D' R2 U F'",
  // AS
  "R' U' R U' R' U R' F R F' U R",
  "R U2 R' U' R U' R'",
  "R2 D R' U R D' R' U R' U' R U' R'",
  "F' L F L' U2 L' U2 L",
  "R U2 R' U2 R' F R F'",
  "r' F R F' r U R'",
  // L
  "F R U' R' U' R U R' F'",
  "F R' F' R U R U' R'",
  "R U2 R' U' R U R' U' R U R' U' R U' R'",
  "R U2 R D R' U2 R D' R2",
  "R' U2 R' D' R U2 R' D R2",
  "r U2 R2 F R F' R U2 r'",
];

export const CMLL_SETS = ['O', 'H', 'Pi', 'U', 'T', 'S', 'AS', 'L'];

// 向きの判定に使う代表手順(OCLL)
export const OCLL_REF = {
  O: '', H: "R U2 R' U' R U R' U' R U' R'", Pi: "R U2 R2 U' R2 U' R2 U2 R",
  U: "R2 D R' U2 R D' R' U2 R'", T: "r U R' U' r' F R F'", L: "F R' F' r U R U' r'",
  S: "R U R' U R U2 R'", AS: "R U2 R' U' R U' R'",
};
