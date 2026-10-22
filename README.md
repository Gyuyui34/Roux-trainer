# Roux Trainer (PWA)

iPhone の Safari で「ホーム画面に追加」して使う Roux 法の練習アプリ。ビルド不要の静的ファイルのみ。

- 動かす: このフォルダを静的サーバーで配信(例 `python3 -m http.server`)。GitHub Pages ならリポジトリ直下に置くだけ。
- 検証: `node tests/verify.mjs`(CMLL 42 ケースの手順と出題の正誤をシミュレーションで確認)
- 更新したら `sw.js` の `VERSION` を上げる(オフラインキャッシュの更新)

## 構成
- `js/cube.js` ステッカー54枚のキューブモデル(全ムーブ・持ち替え対応)
- `js/solver.js` FB/SB 最短手順ソルバー(現在は画面に未公開)
- `js/cmll.js` CMLL 初期手順 / `js/drills.js` 出題生成・手順のケース判定
- `js/view3d.js` CSS 3D 表示 / `js/store.js` 記録・連続日数・XP(localStorage)/ `js/fx.js` 効果音と演出
- `js/app.js` 画面

FB/SB/EO の出題は `drills.js` に実装済みで、`ENABLED_DRILLS` と画面を足せば追加できる。
