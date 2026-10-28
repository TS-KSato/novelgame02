# キットの取り込みと、将来の更新手順

## 1. 取り込み元と版

| 項目 | 値 |
|---|---|
| 取得元 | https://github.com/ts-ksato/novelgame01 |
| 取得元ブランチ | `kit/starter-kit-prep` |
| 固定したコミット | `48c0362ea42feb684e42e2742f75c6c44dd44c8b`（`48c0362`） |
| キットの版 | `0.1.0` |
| 取得日 | 2026-10-24 |

ブランチの最新ではなく、上のコミットのファイルを使っています。取得元へは読み取りのみ行い、取得元の `.git`・履歴・作品ファイルは持ち込んでいません。取り込んだファイルの一覧とハッシュは [kit-provenance.json](kit-provenance.json) にあります。

## 2. 上流由来のファイル（取り込み時のまま）

`kit-provenance.json` の `imported` に 34 件を記録し、`tests/game/provenance.js` が毎回ハッシュを照合します。

| 場所 | 中身 | 役割 |
|---|---|---|
| `kit/releases/0.1.0/` | `validate.js` `save.js` `kit.js` `kit.css` | **作品が実行時に読む固定版** |
| `kit/engine/` | 同じ四ファイル | 回帰試験が参照する上流の複製（固定版と同じバイト列） |
| `kit/README.md` | 上流の原文 | キットの説明。試験の手順は新作の README と差がある（後述） |
| `kit/samples/sample-a/`・`sample-b/` | 試験用の作品と図形・音 | キットの回帰試験専用。新作の本文や素材の下敷きにしない |
| `tests/kit/` | `unit.js` `browser.js` `saves.js` `fixtures/` | キットの回帰試験 |
| `tests/lib/check.js` `launch.js` | 試験の共通部品 | |
| `docs/kit/SPLIT.md` | 上流の原文 | 作品と共通部分の分け方 |
| `.gitignore` `.nojekyll` | 上流のまま | |

上流の `kit/tools/`（`make-assets.js`・`release.js`）は、今回の試験に必要ないため取り込んでいません。`npm run assets` と `npm run release` も新作の `package.json` には残していません。

## 3. 新作側で変更したファイル

| ファイル | 変更の内容 | 理由 |
|---|---|---|
| `package.json` | 名前を `novelgame02-kit-and-tests` に変更。スクリプトを `serve` `test` `test:unit` `test:browser` `test:saves` `test:game` に組み直した | ゼルグ試験（`test:zelg`）と、取り込んでいない tools を外すため |
| `package-lock.json` | ルートの `name` だけを新作名に揃えた（依存は変更なし） | `npm ci` の整合のため |
| `tests/run.js` | `zelg` 群を外し、`game` 群（`tests/game/`）を加えた | ゼルグの試験を呼ばないため |
| `tests/lib/serve.js` | 第二引数 `prefix` を追加（例：`/novelgame02`）。省略時は従来どおり | 公開先 `/novelgame02/` と同じ形で配信して試すため。ルート直下の参照は 404 にする |

## 4. 作品固有のファイル（新作で書いたもの）

| ファイル | 中身 |
|---|---|
| `index.html` | 入口。`./` の相対パスで、固定版 0.1.0 の四ファイルと `game.js` を読む |
| `game.js` | 作品データ（`window.KIT_GAME`）。冒頭一場面 23 行、仮背景一枚、`migrations: {}` |
| `game.css` | 新作専用の見た目。キットの後に読み、場面名とページ数を明暗どちらの背景でも読める札に入れる。キット本体の CSS は変えない |
| `assets/backgrounds/field-morning-temp.png` | **仮素材**。手続きで描いた朝のグラウンド。本番用の画像ではない |
| `docs/opening-script.md` | 冒頭本文の確認用（`game.js` と一致させ、`tests/game/data.js` が照合する） |
| `docs/project-basis.md` | 企画前提。読者向けの本文とは分けて置く |
| `docs/kit-provenance.json` | 取り込みの記録 |
| `tests/game/` | 作品データ・固定版・冒頭一場面の試験 |

## 5. 試験の実行

```sh
npm ci
npx playwright install chromium   # 初回のみ。既に Chromium がある環境では不要
npm test                          # 四群すべて
npm run test:game                 # 作品データ・取り込み・冒頭一場面（ブラウザ）
```

ブラウザの実行ファイルを別に指定するときは `KIT_CHROMIUM_PATH` を使います（コードに個人環境のパスは書いていません）。

## 6. 将来のキット更新の手順

キットの版は作品ごとに固定します。共通エンジンが更新されても、この作品は自動では変わりません。新しい版へ移すときは、次の順に行います。

1. 上流で新しい版を作り、そのフォルダ（例：`kit/releases/0.2.0/`）を**新しい場所へ**取り込む。既存の `kit/releases/0.1.0/` は上書きしない。
2. `index.html` の読込パスを `./kit/releases/0.2.0/...` に書き換える。
3. `game.js` の `kit` を `'0.2.0'` にする。
4. 保存の互換性が変わるなら、`migrations` に古い版の移し方を明示する。ゼルグ固有の移行は持ち込まない。
5. `tests/game/provenance.js` の基準ハッシュと `kit-provenance.json` を新しい版に合わせて更新する。
6. `npm test` を通し、横向きで実際に動かして確かめる。

取得元のブランチ最新を無条件に pull して作品を変える仕組みは作りません。

## 7. 試験手順の違い（上流の `kit/README.md` との差）

- 上流の `kit/README.md` は、`npm test` が `tests/zelg` を含むことを前提にしています。新作では `tests/zelg` を持たないため、`npm test` は `kit`（unit・browser・saves）と `game` の四群を実行します。
- 上流の `npm run assets` `npm run release` は、新作では使えません（`kit/tools` を取り込んでいないため）。
- サブパス配信（`/novelgame02/`）は、新作の `npm run serve` と `tests/game/play.js` が確かめます。
- 上流と同じく、試験はデスクトップ版 Chromium で行っています。スマホ実機（iPhone・Android の Safari・Chrome）の確認は、今回は行っていません。
