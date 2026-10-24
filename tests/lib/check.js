// 試験の共通部品。失敗を集めて、最後に結果を一度に表示する。
'use strict';

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || detail === undefined ? '' : '  → ' + detail));
}

function section(title) { console.log('\n' + title); }

function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' 件が合格');
  return failed.length;
}

module.exports = { check, section, summary };
