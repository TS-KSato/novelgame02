# きみのための甲子園

ブラウザで遊ぶ横向きのノベルゲームの作品データ（試作）。今回は冒頭の一場面だけを実装しています。

- 場面：春のグラウンド（`opening-ground`）。平野の入学時の期待から、グラウンドへ向かうまで（23行）
- 公開予定：https://ts-ksato.github.io/novelgame02/ （**未公開**。この段階では公開していません）
- キット：ノベルゲーム制作キット 0.1.0（固定版。取り込みの経緯は [docs/kit-integration.md](docs/kit-integration.md)）

## 注意

- **背景は仮素材**です。手続きで描いた朝のグラウンドの PNG（`assets/backgrounds/field-morning-temp.png`）で、本番用の画像ではありません。後で同じ素材の名前から差し替えられるようにしています。
- 人物の立ち絵・BGM・環境音・効果音は**未登録**です。話者名と本文だけで読めます。
- 横向き専用です。縦向きでは案内を出して進行を止めます。
- 試験はデスクトップ版 Chromium で行っています。スマホ実機（iPhone・Android の Safari・Chrome）では確かめていません。

## 中身

```text
index.html                 入口（/novelgame02/ の下で動く。相対パスのみ）
game.js                    作品データ（window.KIT_GAME）
game.css                   新作専用の見た目（場面名・ページ数の札）
assets/backgrounds/        仮背景
kit/releases/0.1.0/        作品が実行時に読む、固定版のキット（4 ファイル）
kit/engine/                上流の複製（回帰試験が参照）
kit/samples/               キットの回帰試験用の作品（新作の下敷きではない）
tests/                     試験（kit/ はキットの回帰、game/ は新作の作品データと冒頭一場面）
docs/                      確認用の本文・企画前提・取り込みの記録
```

## 動かす

Node.js 18 以上が必要です。リポジトリの直下で次を実行します。

```sh
npm ci
npm run serve
```

ブラウザで次を開きます（横向きで見てください）。

- http://127.0.0.1:8080/novelgame02/

`npm run serve` は、リポジトリを `/novelgame02/` の下に置いて配信します。ルート直下（`http://127.0.0.1:8080/`）は配信しません。

## 試験

```sh
npm test                 # すべて（kit の unit・browser・saves と、game）
npm run test:unit        # キット：作品データの検証・演出・保存の評価（ブラウザ不要）
npm run test:browser     # キット：サンプルA・Bの操作（ブラウザ）
npm run test:saves       # キット：変更前の保存を、変更した作品データで読む（ブラウザ）
npm run test:game        # 新作：作品データ・取り込みの記録・冒頭一場面（ブラウザ）
```

- ブラウザ試験は、試験自身が静的サーバーを起動・終了します。外部でサーバーを立てる必要はありません。
- 試験で使うブラウザは Playwright（1.56.1）が取得した Chromium です。別の Chromium を使うときは環境変数 `KIT_CHROMIUM_PATH` に実行ファイルのパスを指定します。
- `npm test` は、上流 `kit/README.md` の手順と違い、ゼルグの試験を呼びません（新作には含めていません）。

## 冒頭一場面の確認

- 本文と行IDは [docs/opening-script.md](docs/opening-script.md) にあります。`game.js` と一致することを `tests/game/data.js` が確かめます。
- 試験では、新規開始から最後の行まで、クリックとキーだけで読み進めます。途中でリロードして「つづきから」で戻り、手動セーブも確かめます。

## 素材とキットの出所

- キット（`kit/`）は上流 https://github.com/ts-ksato/novelgame01 の固定版です。
- 作品の本文（`game.js`）と仮背景は、この作品のためのものです。
- サンプルA・Bの図形と音は、キットの試験用の素材です。
