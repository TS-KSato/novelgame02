// キットの単体試験（ブラウザ不要）：作品データの検証、演出の状態、行IDの挿入への強さ、eval の不使用。
'use strict';
const fs = require('fs');
const path = require('path');
const { check, section, summary } = require('../lib/check');

const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'kit', 'engine', 'validate.js'));

function loadSample(name) {
  const src = fs.readFileSync(path.join(ROOT, 'kit', 'samples', name, 'game.js'), 'utf8');
  const w = {};
  new Function('window', src)(w); // 試験用：サンプルの作品データを読む（エンジンは eval を使わない）
  return w.KIT_GAME;
}

// 作品データを深く複製する（テストごとに壊しても他へ影響しないように）。関数はそのまま持つ。
const clone = (v) => {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
};

const A = loadSample('sample-a');
const B = loadSample('sample-b');

section('作品データの検証');
check('sample-a は検証に通る', V.validateGame(A).ok, V.validateGame(A).errors.join(' / '));
check('sample-b は検証に通る', V.validateGame(B).ok, V.validateGame(B).errors.join(' / '));

function errorsOf(mutate) {
  const g = clone(A);
  mutate(g);
  return V.validateGame(g).errors.join(' / ');
}
const expectError = (name, mutate, pattern) => {
  const msg = errorsOf(mutate);
  check(name, pattern.test(msg), '実際: ' + (msg || '（エラーなし）'));
};

expectError('行IDの重複を検出する', (g) => { g.scenes.hall.lines[0].id = 'a-001'; }, /重複/);
expectError('行IDの形式不正を検出する', (g) => { g.scenes.room.lines[0].id = 'A 001'; }, /行IDがないか/);
expectError('存在しない行への演出を検出する', (g) => { g.cues.push({ at: 'zz-999', bg: 'bg-room' }); }, /行ID「zz-999」が存在しません/);
expectError('演出の種類が二つ入っていると検出する', (g) => { g.cues.push({ at: 'a-002', bg: 'bg-room', se: 'chime' }); }, /一つだけ/);
expectError('未定義の背景を検出する', (g) => { g.cues.push({ at: 'a-002', bg: 'bg-none' }); }, /背景「bg-none」/);
expectError('未定義の立ち絵の表情を検出する', (g) => { g.cues.push({ at: 'a-002', portrait: { slot: 'left', char: 'mio', expr: 'angry' } }); }, /表情「angry」/);
expectError('立ち絵の位置が不正だと検出する', (g) => { g.cues.push({ at: 'a-002', portrait: { slot: 'center', char: 'mio', expr: 'normal' } }); }, /left か right/);
expectError('CG の区間が別の場面にまたがると検出する', (g) => { g.cues[g.cues.length - 1].cg.until = 'c-001'; }, /同じ場面/);
expectError('CG の終了行が開始行より前だと検出する', (g) => { g.cues[g.cues.length - 1].cg = { id: 'cg-sunset', until: 'a-001' }; g.cues[g.cues.length - 1].at = 'b-003'; }, /開始行より前|同じ場面/);
expectError('CG の区間の重なりを検出する', (g) => { g.cues.push({ at: 'b-004', cg: { id: 'cg-sunset' } }); }, /重なって/);
expectError('フラグの既定値が範囲外だと検出する', (g) => { g.flags.route.default = 'other'; }, /既定値が values/);
expectError('選択肢が未定義のフラグを設定すると検出する', (g) => { g.scenes.room.choices[0].set.nope = true; }, /フラグ「nope」/);
expectError('選択肢の移り先が存在しないと検出する', (g) => { g.scenes.room.choices[0].to = 'nowhere'; }, /移り先の場面/);
expectError('開始行が開始場面にないと検出する', (g) => { g.start.line = 'b-001'; }, /開始行は開始場面/);
expectError('移行の対応先が存在しないと検出する', (g) => { g.migrations = { '2026.09-0': { lines: { 'old-1': 'nope' } } }; }, /移し先の行ID/);
expectError('現在の版と同じ版の移行を検出する', (g) => { g.migrations = { '2026.10-1': { lines: 'identity' } }; }, /現在の版と同じ版/);
expectError('行の対応が書かれていないと検出する', (g) => { g.migrations = { '2026.09-0': {} }; }, /行の対応/);
expectError('旧い aliases を使うと検出する', (g) => { g.aliases = { 'a-001': 'a-002' }; }, /aliases は使えません/);
expectError('素材のパスが画像・音声でないと検出する', (g) => { g.assets.backgrounds['bg-room'] = 'assets/x.txt'; }, /素材のパス/);
expectError('作品IDに英小文字以外があると検出する', (g) => { g.id = 'Sample A'; }, /作品ID/);

section('演出の状態（行ID基準）');
const st = V.stateAt(A, 'b-003');
check('b-003 の背景は bg-hall', st.bg === 'bg-hall', st.bg);
check('b-003 の立ち絵（右）は smile', st.portraits.right && st.portraits.right.expr === 'smile', JSON.stringify(st.portraits.right));
check('b-003 の CG は cg-sunset（区間の中）', st.cg === 'cg-sunset', st.cg);
check('b-002 の CG はまだ出ない（区間の前）', V.stateAt(A, 'b-002').cg === null);
check('BGM は場面が変わっても同じ曲が続く（b-003 も theme）', V.stateAt(A, 'b-003').bgm === 'theme');
check('環境音は b-001 から wind', V.stateAt(A, 'b-001').ambience === 'wind');
check('一回きりの効果音は b-001 だけ', V.oneShotsAt(A, 'b-001').some((c) => c.se === 'chime') && V.oneShotsAt(A, 'b-002').length === 0);

// 行の挿入：先頭近くに行を一つ足しても、既存の行IDの状態は変わらない
section('行の挿入への強さ');
const before = {};
for (const e of V.flattenLines(A)) before[e.id] = V.stateAt(A, e.id);
const inserted = clone(A);
inserted.scenes.room.lines.splice(2, 0, { id: 'a-002x', speaker: 'mio', text: '新しく入れた行。' });
inserted.scenes.hall.lines.splice(0, 0, { id: 'b-000', text: '場面の先頭に行を足した。' });
check('挿入後も検証に通る', V.validateGame(inserted).ok, V.validateGame(inserted).errors.join(' / '));
let same = true;
const diffs = [];
for (const e of V.flattenLines(A)) {
  const a = JSON.stringify(before[e.id]);
  const b = JSON.stringify(V.stateAt(inserted, e.id));
  if (a !== b) { same = false; diffs.push(e.id); }
}
check('既存の行IDの状態は、挿入の前後で同じ', same, diffs.join(', '));
check('挿入した行は、その場所の状態を引き継ぐ', V.stateAt(inserted, 'a-002x').bg === 'bg-room');

section('既読の指紋');
const line = A.scenes.room.lines[1];
const sameText = { ...line, text: line.text.replace(/\s/g, '') };
check('空白だけの違いは同じ指紋', V.hashLine(line) === V.hashLine({ ...line, text: line.text + ' ' }));
check('句読点の違いは別の指紋', V.hashLine(line) !== V.hashLine({ ...line, text: line.text.replace('。', '！') }));
check('話者の違いは別の指紋', V.hashLine(line) !== V.hashLine({ ...line, speaker: 'other' }));
check('空白を除いた同一文は同じ指紋', V.hashLine(line) === V.hashLine(sameText));

section('保存の評価（版・フラグ・既読・移行）');
const SAVE = require(path.join(ROOT, 'kit', 'engine', 'save.js'));
const schemaA = SAVE.flagSchema(A);
const rawSave = (over) => ({
  v: 1, game: 'sample-a', dataVersion: A.dataVersion, flagSchema: schemaA, kit: '0.1.0',
  auto: { at: 'a-003', flags: { met: false, route: 'none' }, dataVersion: A.dataVersion },
  slots: [null, null, null], seen: [], gallery: {}, settings: { speed: 20, sound: false, mix: { bgm: 50, amb: 100, se: 100 } },
  ...over,
});
const seenKey = (id) => id + '#' + V.hashLine(V.flattenLines(A).find((e) => e.id === id).line);
const textOf = (g) => JSON.stringify(g);

check('保存がなければ empty', SAVE.assess(A, null, null).mode === 'empty');
const cur = rawSave({ seen: [seenKey('a-001'), 'a-002#00000000'] });
const curText = JSON.stringify(cur);
const r1 = SAVE.assess(A, cur, curText);
check('同じ版・同じフラグの定義は current', r1.mode === 'current', r1.reason);
check('current は既読の指紋が一致するものだけ残す', r1.record.seen.length === 1 && r1.record.seen[0] === seenKey('a-001'), JSON.stringify(r1.record.seen));
check('current の設定は保たれる', r1.record.settings.speed === 20 && r1.record.settings.mix.bgm === 50);

// 版が同じでフラグの定義だけ変わった：読まず、書かない
const Aflag = clone(A); Aflag.flags.route.values = ['none', 'warm', 'cool'];
const rf = SAVE.assess(Aflag, cur, curText);
check('版を変えずにフラグの定義が変わると blocked', rf.mode === 'blocked' && /フラグ/.test(rf.reason), rf.reason);

// 版が違い、移し方がない：blocked。入力は変更されない
const other = rawSave({ dataVersion: '2026.09-0' });
const otherText = JSON.stringify(other);
const ro = SAVE.assess(A, other, otherText);
check('移し方のない版の保存は blocked', ro.mode === 'blocked' && /移す方法/.test(ro.reason), ro.reason);
check('blocked の評価は、元の保存を変えない', JSON.stringify(other) === otherText);

// 行IDの対応表で移す（a-003 → a-003n）
const Ar = clone(A);
Ar.scenes.room.lines.find((l) => l.id === 'a-003').id = 'a-003n';
Ar.cues.forEach((c) => { if (c.at === 'a-003') c.at = 'a-003n'; });
Ar.dataVersion = '2026.10-3';
Ar.migrations = { '2026.10-1': { lines: { 'a-001': 'a-001', 'a-002': 'a-002', 'a-003': 'a-003n', 'a-004': 'a-004' } } };
const ra = SAVE.assess(Ar, cur, curText);
check('対応表があれば位置を写して migrated', ra.mode === 'migrated' && ra.record.auto.at === 'a-003n', ra.reason + ' ' + (ra.record && ra.record.auto && ra.record.auto.at));
check('写した保存は現在の版になる', ra.record.dataVersion === '2026.10-3' && ra.record.auto.dataVersion === '2026.10-3');
check('既読は写した行IDへ移り、指紋が一致する', (ra.record.seen || []).length === 1 && ra.record.seen[0] === 'a-001#' + V.hashLine(V.flattenLines(Ar).find((e) => e.id === 'a-001').line));

// 対応表に無い位置がある：移せないので blocked（一部だけ移さない）
const Arm = clone(Ar);
Arm.migrations = { '2026.10-1': { lines: { 'a-001': 'a-001', 'a-002': 'a-002', 'a-004': 'a-004' } } };
const rm = SAVE.assess(Arm, cur, curText);
check('対応表に無い位置があると blocked（一部だけは移さない）', rm.mode === 'blocked' && rm.record === null && /移せません/.test(rm.reason), rm.reason);

// 行IDが同じでも、identity と書かれていなければ写さない（存在するだけでは受理しない）
const Aed = clone(A);
Aed.dataVersion = '2026.10-2';
Aed.migrations = { '2026.10-1': { lines: { 'a-001': 'a-001' } } };
const rid = SAVE.assess(Aed, cur, curText);
check('対応表に書かれていない行IDは、存在していても写さない', rid.mode === 'blocked', rid.mode);
Aed.migrations = { '2026.10-1': { lines: 'identity' } };
const rid2 = SAVE.assess(Aed, cur, curText);
check('identity と書けば、同じ行IDの位置は移る', rid2.mode === 'migrated' && rid2.record.auto.at === 'a-003');
// 本文が変わった既読は、版の移行でも有効にならない
Aed.scenes.room.lines.find((l) => l.id === 'a-001').text = '本文を変えた。';
const rtext = SAVE.assess(Aed, cur, curText);
check('本文の変わった行の既読は移らない', rtext.mode === 'migrated' && rtext.record.seen.length === 0, JSON.stringify(rtext.record && rtext.record.seen));

// フラグの定義が変わった：移行方法（flags）が無ければ blocked、あれば関数の結果を使う
const Af = clone(A);
Af.dataVersion = '2026.10-4';
Af.flags.route.values = ['none', 'warm', 'cool'];
Af.migrations = { '2026.10-1': { lines: 'identity' } };
const rfn0 = SAVE.assess(Af, cur, curText);
check('フラグの移行方法が無いと blocked', rfn0.mode === 'blocked' && /flags/.test(rfn0.reason), rfn0.reason);
Af.migrations = { '2026.10-1': { lines: 'identity', flags: (f) => ({ ...f, route: f.route === 'kind' ? 'warm' : f.route }) } };
const curK = rawSave({ auto: { at: 'a-003', flags: { met: true, route: 'kind' }, dataVersion: A.dataVersion } });
const curKText = JSON.stringify(curK);
const rfn = SAVE.assess(Af, curK, curKText);
check('フラグの移行方法があれば、その結果で移る', rfn.mode === 'migrated' && rfn.record.auto.flags.route === 'warm', JSON.stringify(rfn.record && rfn.record.auto));
Af.migrations = { '2026.10-1': { lines: 'identity', flags: () => ({ met: true, route: 'nope' }) } };
const rbad = SAVE.assess(Af, curK, curKText);
check('移行の結果が定義に合わなければ blocked', rbad.mode === 'blocked', rbad.reason);
Af.migrations = { '2026.10-1': { lines: 'identity', flags: () => { throw new Error('x'); } } };
check('移行の関数が例外を投げたら blocked', SAVE.assess(Af, curK, curKText).mode === 'blocked');
check('フラグ移行の入力も元の保存を変えない', JSON.stringify(curK) === curKText);

section('安全性（eval を使わない）');
for (const f of ['validate.js', 'kit.js']) {
  const src = fs.readFileSync(path.join(ROOT, 'kit', 'engine', f), 'utf8');
  check(f + ' に eval・文字列からの関数生成がない', !/\beval\s*\(|new\s+Function\s*\(|setTimeout\(\s*['"]/.test(src));
}

process.exitCode = summary() ? 1 : 0;
