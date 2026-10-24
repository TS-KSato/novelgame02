// 保存の互換性の試験（ブラウザ）。変更前の保存（通常の操作で作る）を、変更した作品データで読む。
// 確かめること：行の挿入・本文の変更・行IDの対応表・移せない保存・フラグの定義の変更。
// どの場合も、元の保存は、移行の前にバックアップされるか、移せない場合はそのまま残ること。
'use strict';
const path = require('path');
const { check, section, summary } = require('../lib/check');
const { serve } = require('../lib/serve');
const { launch } = require('../lib/launch');

const ROOT = path.join(__dirname, '..', '..');
const KEY = 'kit:sample-a:v1';
const BACKUP = 'kit:sample-a:v1:backup:2026.10-1';

const st = (page) => page.evaluate(() => ({
  screen: KIT.s.screen, lineId: KIT.s.lineId, choices: KIT.s.choicesVisible, skip: KIT.s.skip_on,
  mode: KIT.s.saveMode, flags: { ...KIT.s.flags }, seen: [...KIT.s.seen],
}));
const prose = (page) => page.textContent('.kit-prose');
const clickText = (page, text) => page.getByRole('button', { name: text, exact: true }).click();
const storage = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

async function open(ctx, url) {
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto(url);
  await page.waitForFunction(() => window.KIT && window.KIT.s);
  await page.evaluate(() => { window.KIT.s.speed = 0; });
  return page;
}

// 保存を作る（通常の操作）。slot 1 は a-003（フラグは未選択）、自動は choice 後の b-001（route = kind）
async function makeBaseSave(ctx, base) {
  const page = await open(ctx, base + 'kit/samples/sample-a/index.html');
  await clickText(page, 'はじめから');
  await page.click('.kit-dialogue'); // a-002
  await page.click('.kit-dialogue'); // a-003
  await clickText(page, 'セーブ');
  await page.getByRole('button', { name: '保存', exact: true }).first().click();
  await page.waitForFunction(() => KIT.s.slots[0] !== null);
  await clickText(page, '閉じる');
  await page.click('.kit-dialogue'); // a-004
  await page.click('.kit-dialogue'); // 選択肢
  await page.click('.kit-choice >> nth=0'); // 声をかける → route kind
  await page.waitForFunction(() => KIT.s.scene === 'hall');
  const raw = await storage(page, KEY);
  await page.close();
  return raw;
}

async function main() {
  const server = await serve(ROOT, 0);
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    const blank = await ctx.newPage();
    await blank.goto(base + 'tests/kit/fixtures/blank.html');

    section('変更前の保存を、通常の操作で作る');
    const baseRaw = await makeBaseSave(ctx, base);
    const baseObj = JSON.parse(baseRaw);
    check('基準の保存は版 2026.10-1 で、自動セーブは b-001', baseObj.dataVersion === '2026.10-1' && baseObj.auto.at === 'b-001', baseRaw.slice(0, 120));
    check('基準の保存は手動セーブ 1 に a-003 を持つ', baseObj.slots[0] && baseObj.slots[0].at === 'a-003');
    check('基準の保存のフラグは route=kind', baseObj.auto.flags.route === 'kind');

    // 変更版を開く前に、基準の保存へ戻す（試験ごとに同じ出発点から始める）
    const restore = async () => {
      await blank.evaluate(([k, v]) => { localStorage.setItem(k, v); for (const x of Object.keys(localStorage)) if (x.includes(':backup:')) localStorage.removeItem(x); }, [KEY, baseRaw]);
    };
    const variant = (name) => open(ctx, base + 'tests/kit/fixtures/play.html?v=' + name);

    section('行の挿入（版は変えない）');
    await restore();
    let p = await variant('insertLine');
    check('挿入後も、同じ版の保存は現在の保存として読む', (await st(p)).mode === 'current');
    await clickText(p, 'つづきから');
    check('自動セーブは、挿入の前後で同じ行 b-001 を指す', (await st(p)).lineId === 'b-001');
    await clickText(p, 'タイトル');
    await clickText(p, 'セーブ・読込');
    await p.getByRole('button', { name: '読込', exact: true }).first().click();
    await p.waitForFunction(() => KIT.s.screen === 'play');
    const s3 = await st(p);
    check('手動セーブは、挿入の後も a-003 を指す', s3.lineId === 'a-003', s3.lineId);
    check('a-003 の立ち絵は、挿入の前と同じ（mio-normal）', (await p.getAttribute('.kit-portrait-right img', 'src')).endsWith('mio-normal.png'));
    check('a-003 の本文は変わらない', (await prose(p)).includes('来てくれるかな'));
    check('挿入で版は変わらず、バックアップは作られない', (await storage(p, BACKUP)) === null);
    await p.close();

    section('本文の変更：変わった行は既読SKIPで飛ばされない');
    await restore();
    p = await variant('editText');
    check('本文を変えた版の保存は、移行して読む', (await st(p)).mode === 'migrated', (await st(p)).mode);
    check('移行の前に、元の保存をバックアップする', (await storage(p, BACKUP)) === baseRaw);
    await clickText(p, 'はじめから');
    await clickText(p, '既読SKIP');
    await p.waitForFunction(() => KIT.s.lineId === 'a-002' && !KIT.s.skip_on, null, { timeout: 8000 }).catch(() => {});
    check('既読の a-001 は飛ばし、変わった a-002 で止まる', (await st(p)).lineId === 'a-002' && (await st(p)).skip === false, JSON.stringify(await st(p)));
    check('変わった a-002 の新しい本文が出る', (await prose(p)).includes('きっと来るはず'));
    await p.close();

    section('行IDの変更：対応表で移す');
    await restore();
    p = await variant('renameMapped');
    check('対応表に書いた行の保存は移行して読む', (await st(p)).mode === 'migrated', (await st(p)).mode);
    await clickText(p, 'セーブ・読込');
    await p.getByRole('button', { name: '読込', exact: true }).first().click();
    await p.waitForFunction(() => KIT.s.screen === 'play');
    check('手動セーブの位置は、写した行 a-003n を指す', (await st(p)).lineId === 'a-003n', (await st(p)).lineId);
    check('既読は写した行IDへ移る（a-003n の指紋が残る）', (await st(p)).seen.some((k) => k.startsWith('a-003n#')));
    check('写せなかった既読は残らない（a-003 の古い ID は無い）', !(await st(p)).seen.some((k) => k.startsWith('a-003#')));
    await p.close();

    section('移せない保存：書かず、元のまま残す');
    await restore();
    p = await variant('renameUnmapped');
    let s = await st(p);
    check('対応表に無い行IDの保存は、移せないと判定する', s.mode === 'blocked', s.mode);
    check('タイトルに、移せない理由を出す', /移せません/.test(await p.textContent('.kit-note')));
    check('移せない保存では、つづきから は押せない', await p.getByRole('button', { name: 'つづきから', exact: true }).isDisabled());
    await clickText(p, 'はじめから');
    await p.click('.kit-dialogue');
    await p.click('.kit-dialogue');
    await p.click('.kit-dialogue');
    check('移せない保存では、進行しても元の保存は変わらない', (await storage(p, KEY)) === baseRaw);
    check('移せない保存では、バックアップも作らない', (await storage(p, BACKUP)) === null);
    await p.close();

    section('フラグの定義が版を変えずに変わった：読まず、書かない');
    await restore();
    p = await variant('flagsSameVersion');
    s = await st(p);
    check('フラグの定義だけ変わった保存は blocked', s.mode === 'blocked', s.mode);
    check('理由にフラグの定義の変更を示す', /フラグの定義/.test(await p.textContent('.kit-note')));
    await clickText(p, 'はじめから');
    await clickText(p, 'タイトル');
    await clickText(p, 'はじめから');
    await p.click('.kit-dialogue');
    check('blocked の保存は、進行しても変わらない', (await storage(p, KEY)) === baseRaw);
    await p.close();

    section('フラグの定義が変わり、作品が移行方法を書いた');
    await restore();
    p = await variant('flagsMigrated');
    check('フラグの移行方法があれば migrated', (await st(p)).mode === 'migrated', (await st(p)).mode);
    await clickText(p, 'つづきから');
    s = await st(p);
    check('移行後の自動セーブのフラグは route=warm（kind から移した）', s.flags.route === 'warm', JSON.stringify(s.flags));
    check('移行の前の保存は、バックアップに残る', (await storage(p, BACKUP)) === baseRaw);
    await p.close();

    section('既存の保存を、移行の後も読み直せる');
    p = await variant('flagsMigrated');
    check('移行後の保存は current として読める', (await st(p)).mode === 'current', (await st(p)).mode);
    await clickText(p, 'つづきから');
    check('移行後も自動セーブの位置は b-001', (await st(p)).lineId === 'b-001');
    await p.close();

    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = summary() ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
