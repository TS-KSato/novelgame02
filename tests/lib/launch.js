// Chromium の起動を一か所にまとめる。
// 通常は Playwright が取得したブラウザを使う（手順は README の「試験」を参照）。
// 別のブラウザを使うときだけ、環境変数 KIT_CHROMIUM_PATH に実行ファイルのパスを指定する。
'use strict';

async function launch() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    throw new Error('playwright が見つかりません。リポジトリの直下で npm ci を実行してください。');
  }
  const opts = { args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.KIT_CHROMIUM_PATH) opts.executablePath = process.env.KIT_CHROMIUM_PATH;
  try {
    return await chromium.launch(opts);
  } catch (e) {
    throw new Error('Chromium を起動できません（' + e.message.split('\n')[0] + '）。npx playwright install chromium を実行するか、KIT_CHROMIUM_PATH を指定してください。');
  }
}

module.exports = { launch };
