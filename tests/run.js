// 試験の入口。使い方：npm test、または node tests/run.js [unit|browser|saves|game]（省略時は全部）
// 外部パッケージは Playwright（ブラウザ試験のみ）だけ。手順は README の「試験」を参照。
// ゼルグ本編の試験は、この新作には含めない（取得元の tests/zelg は持ち込んでいない）。
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const SUITES = {
  unit: ['tests/kit/unit.js'],
  browser: ['tests/kit/browser.js'],
  saves: ['tests/kit/saves.js'],
  game: ['tests/game/data.js', 'tests/game/provenance.js', 'tests/game/play.js'],
};

const only = process.argv[2];
const names = only ? [only] : Object.keys(SUITES);
let failed = 0;
for (const name of names) {
  if (!SUITES[name]) { console.error('不明な試験: ' + name); process.exit(2); }
  console.log('\n===== ' + name + ' =====');
  for (const file of SUITES[name]) {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', file)], { stdio: 'inherit' });
    if (r.status !== 0) failed += 1;
  }
}
console.log('\n' + (failed ? failed + ' 個の試験ファイルが失敗' : 'すべての試験が合格'));
process.exitCode = failed ? 1 : 0;
