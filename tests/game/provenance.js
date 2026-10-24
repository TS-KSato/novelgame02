// キットの取り込みの試験（ブラウザ不要）。確かめること：
// 固定版 0.1.0 の四ファイルが基準のハッシュと一致する、エンジンの複製が固定版と同じ、
// 取り込んだ上流ファイルが docs/kit-provenance.json のハッシュのとおり、作品が固定版を読んでいる。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { check, section, summary } = require('../lib/check');

const ROOT = path.join(__dirname, '..', '..');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');

// 固定版の基準（取得元コミット 48c0362 の kit/releases/0.1.0 のハッシュ）
const BASELINE = {
  'validate.js': '6ba64e98dc8762f059f03c0245d1020ddd2725c21852d12cca498a0379890201',
  'save.js': '9e0700d144d2d072f23478965a59aae86731c2587409c12e46bf826d6aecb3ae',
  'kit.js': '6a6228ad67abf0ac1b169a2e11abd301517943f57865f0e6c8a8a512fc92e84d',
  'kit.css': '99367e781c9b50c8af837827054076bdb8a06ea3c1a2f38370726fbf36e68503',
};
const RELEASE = 'kit/releases/0.1.0/';
const ENGINE = 'kit/engine/';

section('固定版 0.1.0 の基準ハッシュ');
for (const [f, expected] of Object.entries(BASELINE)) {
  const got = sha256(RELEASE + f);
  check(f + ' が基準と一致する', got === expected, got);
}

section('エンジンの複製と固定版');
for (const f of Object.keys(BASELINE)) {
  check(f + '：engine と固定版が同じバイト列', sha256(ENGINE + f) === sha256(RELEASE + f));
}

section('取り込みの記録（docs/kit-provenance.json）');
const prov = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'kit-provenance.json'), 'utf8'));
check('取得元は ts-ksato/novelgame01', prov.repository === 'https://github.com/ts-ksato/novelgame01', prov.repository);
check('取得元ブランチは kit/starter-kit-prep', prov.branchAtImport === 'kit/starter-kit-prep', prov.branchAtImport);
check('取得元コミットは 48c0362ea42feb684e42e2742f75c6c44dd44c8b', prov.commit === '48c0362ea42feb684e42e2742f75c6c44dd44c8b', prov.commit);
check('使用キットの版は 0.1.0', prov.kitVersion === '0.1.0', prov.kitVersion);
const modified = new Set(Object.keys(prov.modifiedAfterImport || {}));
let drift = [];
let checked = 0;
for (const entry of prov.imported || []) {
  if (modified.has(entry.path)) continue;
  checked += 1;
  if (!fs.existsSync(path.join(ROOT, entry.path)) || sha256(entry.path) !== entry.sha256) drift.push(entry.path);
}
check('取り込んだ上流ファイル（変更なし）のハッシュが一致する（' + checked + ' 件）', drift.length === 0, drift.join(', '));
for (const p of modified) {
  check('取り込み後に変更したファイルは実在する：' + p, fs.existsSync(path.join(ROOT, p)));
}

section('作品が固定版を読んでいる');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('index.html の読込は kit/releases/0.1.0 の四ファイル', ['validate.js', 'save.js', 'kit.js', 'kit.css'].every((f) => idx.includes('./kit/releases/0.1.0/' + f)));
check('index.html の読込に、engine 側のファイルがない', !idx.includes('kit/engine/'));

process.exitCode = summary() ? 1 : 0;
