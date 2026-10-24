// キットのブラウザ試験（Chromium）。サンプルA・サンプルBを実際に動かして確かめる。
// 選択肢は実際のマウス操作で選ぶ（プログラムからの click() は選ばないことも確かめる）。
'use strict';
const path = require('path');
const { check, section, summary } = require('../lib/check');
const { serve } = require('../lib/serve');
const { launch } = require('../lib/launch');

const ROOT = path.join(__dirname, '..', '..');

async function openSample(page, base, name) {
  await page.goto(base + 'kit/samples/' + name + '/index.html');
  await page.waitForFunction(() => window.KIT && window.KIT.s);
  // 試験のため文字の表示を即時にする（行の進みそのものは変えない）
  await page.evaluate(() => { window.KIT.s.speed = 0; });
}

const st = (page) => page.evaluate(() => ({
  screen: KIT.s.screen, scene: KIT.s.scene, lineId: KIT.s.lineId, choices: KIT.s.choicesVisible,
  auto: KIT.s.auto_on, skip: KIT.s.skip_on, rotated: KIT.s.rotated,
}));
const prose = (page) => page.textContent('.kit-prose');
const clickText = (page, text) => page.getByRole('button', { name: text, exact: true }).click();

async function main() {
  const server = await serve(ROOT, 0);
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await launch();
  const errors = [];
  try {
    // ----- 共通の起動 -----
    section('起動と作品データの検査');
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    await ctx.addInitScript(() => { window.__errors = []; });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('dialog', (d) => d.accept());
    await openSample(page, base, 'sample-a');
    check('タイトル画面が出る', await page.isVisible('.kit-title h1'));
    check('作品名がタイトルに出る', (await page.textContent('.kit-title h1')).includes('サンプルA'));

    const bad = await page.evaluate(() => {
      const box = document.createElement('div');
      document.body.append(box);
      KitEngine.start({ id: 'Bad Id', title: 'x' }, { root: box });
      return box.querySelector('.kit-error') ? box.textContent : null;
    });
    check('不正な作品データは、理由を示して止まる', !!bad && bad.includes('作品IDは'), bad);

    // ----- 本文の進み・選択肢 -----
    section('本文の進み・選択肢・分岐');
    await clickText(page, 'はじめから');
    check('はじめからで第一場の一行目が出る', (await prose(page)).includes('部屋の窓から'));
    check('ページ表示が 1 / 4', (await page.textContent('.kit-page')) === '1 / 4');
    for (let i = 0; i < 4; i++) await page.click('.kit-dialogue');
    check('最後の行の後に選択肢が二つ出る', (await page.locator('.kit-choice').count()) === 2);
    await page.evaluate(() => document.querySelectorAll('.kit-choice')[0].click());
    await page.waitForTimeout(150);
    check('プログラムからの click() では選ばれない', (await st(page)).scene === 'room');
    await page.click('.kit-choice >> nth=0');
    await page.waitForFunction(() => KIT.s.scene === 'hall');
    check('マウスで選ぶと、フラグを設定して次の場面へ進む', (await page.evaluate(() => KIT.s.flags.route)) === 'kind');

    section('背景・立ち絵・CG・ギャラリー');
    check('廊下の背景が bg-hall になる', (await page.getAttribute('.kit-bg', 'style')).includes('bg-hall.png'));
    check('b-001 では CG は出ない', await page.isHidden('.kit-cg'));
    await page.click('.kit-dialogue'); // b-002
    const smile = await page.getAttribute('.kit-portrait-right img', 'src');
    check('b-002 で立ち絵（右）が smile になる', !!smile && smile.endsWith('mio-smile.png'), smile);
    await page.click('.kit-dialogue'); // b-003
    check('b-003 で CG が表示される', !(await page.isHidden('.kit-cg')) && (await page.getAttribute('.kit-cg', 'src')).endsWith('cg-sunset.png'));
    check('到達した CG が解放される', (await page.evaluate(() => KIT.s.gallery['cg-sunset'])) === true);
    await page.click('.kit-dialogue'); // b-004
    await page.click('.kit-dialogue'); // ending-kind
    await page.waitForFunction(() => KIT.s.scene === 'ending-kind');
    check('フラグの分岐で「やさしい道」の終わりへ進む', (await st(page)).scene === 'ending-kind');
    await page.click('.kit-dialogue'); // endGame
    await page.waitForFunction(() => KIT.s.screen === 'title');
    check('終わりの後はタイトルへ戻る', (await st(page)).screen === 'title');

    await clickText(page, 'CG鑑賞');
    check('CG 鑑賞に解放済みの一枚が出る', (await page.locator('.kit-cg-card:not(.locked)').count()) === 1);
    await clickText(page, '閉じる');

    // ----- 手動セーブ・読込・つづきから -----
    section('セーブ・読込・つづきから');
    await clickText(page, 'はじめから');
    await page.click('.kit-dialogue'); // a-002
    await page.click('.kit-dialogue'); // a-003
    await clickText(page, 'セーブ');
    await page.getByRole('button', { name: '保存', exact: true }).first().click();
    await page.waitForFunction(() => KIT.s.slots[0] !== null);
    check('一つ目のスロットに保存される', (await page.evaluate(() => KIT.s.slots[0].at)) === 'a-003');
    await clickText(page, '閉じる');
    await page.click('.kit-dialogue'); // a-004
    await clickText(page, 'タイトル');
    await page.waitForFunction(() => KIT.s.screen === 'title');
    await clickText(page, 'セーブ・読込');
    await page.getByRole('button', { name: '読込', exact: true }).first().click();
    await page.waitForFunction(() => KIT.s.screen === 'play');
    check('手動セーブの位置（a-003）へ読み込める', (await st(page)).lineId === 'a-003');
    check('読込の後も本文が出る（a-003 の文）', (await prose(page)).includes('来てくれるかな'));

    await page.reload();
    await page.waitForFunction(() => window.KIT && window.KIT.s);
    await page.evaluate(() => { window.KIT.s.speed = 0; });
    check('再読み込み後、つづきから が押せる', !(await page.getByRole('button', { name: 'つづきから', exact: true }).isDisabled()));
    await clickText(page, 'つづきから');
    await page.waitForFunction(() => KIT.s.screen === 'play');
    check('つづきから、最後に読んだ位置へ戻る', (await st(page)).lineId === 'a-003');

    // ----- 既読 SKIP / AUTO -----
    section('既読 SKIP・AUTO');
    await clickText(page, 'タイトル');
    await clickText(page, 'はじめから');
    await clickText(page, '既読SKIP');
    await page.waitForFunction(() => KIT.s.choicesVisible && !KIT.s.skip_on, null, { timeout: 8000 }).catch(() => {});
    const skipped = await st(page);
    check('既読の行は飛ばし、選択肢の前で止まる', skipped.choices === true && skipped.skip === false, JSON.stringify(skipped));
    await page.waitForTimeout(400);
    check('選択肢の表示中に、既読 SKIP は選択しない', (await st(page)).choices === true && (await st(page)).scene === 'room');

    // 選択肢が出ている間は、ボタンの押下で選ばれない（表示前から続く押下は無効）
    await clickText(page, 'タイトル');
    await clickText(page, 'はじめから');
    await clickText(page, 'AUTO');
    await page.waitForFunction(() => KIT.s.choicesVisible, null, { timeout: 25000 }).catch(() => {});
    const auto = await st(page);
    check('AUTO は選択肢の前で止まる', auto.choices === true && auto.auto === false, JSON.stringify(auto));

    // ----- 音 -----
    section('音（アイコンだけの切り替え・参考音）');
    await clickText(page, 'タイトル');
    const sound = page.locator('.kit-sound');
    check('音のボタンは文字なしで、aria-label がある', (await sound.textContent()).trim() === '' && (await sound.getAttribute('aria-label')) === '音を切り替え');
    check('初期状態は音オフ', (await sound.getAttribute('aria-pressed')) === 'false');
    await clickText(page, 'はじめから');
    await sound.click();
    check('押すと音オンになる', (await sound.getAttribute('aria-pressed')) === 'true');
    check('音オンで BGM の状態が揃う', (await page.evaluate(() => KIT.audio.now.bgm)) === 'theme');
    await sound.click();
    check('もう一度押すと音オフになる', (await sound.getAttribute('aria-pressed')) === 'false');

    await clickText(page, 'タイトル');
    await clickText(page, '設定');
    await page.evaluate(() => { KIT.s.previewLog = []; });
    const sliders = page.locator('.kit-slider input[type=range]');
    check('音量の調整は、BGM・環境音・効果音の三つ（文字の速さを除く）', (await sliders.count()) === 4);
    const drag = async (i, v) => page.evaluate(([i, v]) => {
      const input = document.querySelectorAll('.kit-slider input[type=range]')[i];
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, [i, v]);
    await drag(1, 40); // BGM
    check('BGM のスライダーでは参考音を鳴らさない', (await page.evaluate(() => KIT.s.previewLog.length)) === 0);
    await drag(2, 40); // 環境音
    await drag(3, 40); // 効果音
    check('環境音と効果音のスライダーだけ参考音を鳴らす', (await page.evaluate(() => KIT.s.previewLog.join(','))) === 'amb,se');
    await clickText(page, '閉じる');

    // ----- 縦向きの案内（横向き専用） -----
    section('横向き専用');
    await clickText(page, 'はじめから');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => KIT.s.rotated === true);
    check('縦向きでは案内を出し、作品を止める', !(await page.isHidden('.kit-rotate')) && (await st(page)).rotated === true);
    const before = await st(page);
    await page.click('.kit-dialogue', { force: true }).catch(() => {});
    check('縦向きでは本文が進まない', (await st(page)).lineId === before.lineId);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => KIT.s.rotated === false);
    check('横向きに戻ると案内は消える', await page.isHidden('.kit-rotate'));

    // ----- 作品の分離（同じ場所・同じ保存領域のもう一つの作品） -----
    section('作品ごとの分離（sample-a と sample-b）');
    const keyA = await page.evaluate(() => localStorage.getItem('kit:sample-a:v1'));
    await openSample(page, base, 'sample-b');
    check('sample-b は sample-a の続きを読まない（つづきから が押せない）', await page.getByRole('button', { name: 'つづきから', exact: true }).isDisabled());
    await clickText(page, 'はじめから');
    await page.click('.kit-dialogue');
    await page.waitForFunction(() => KIT.s.lineId === 'x-002');
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kit:')).sort());
    check('保存は作品IDごとに二つ作られる', JSON.stringify(keys) === JSON.stringify(['kit:sample-a:v1', 'kit:sample-b:v1']), keys.join(' '));
    check('sample-a の保存は、sample-b の操作で変わらない', (await page.evaluate(() => localStorage.getItem('kit:sample-a:v1'))) === keyA);
    const seenB = await page.evaluate(() => KIT.s.seen.size);
    check('sample-b の既読は sample-b だけに付く', seenB === 2);

    // ----- 未読で止まる（別の空の保存で） -----
    section('未読の文章で SKIP が止まる（空の保存）');
    const fresh = await browser.newContext({ viewport: { width: 844, height: 390 } });
    const p2 = await fresh.newPage();
    p2.on('pageerror', (e) => errors.push(String(e)));
    p2.on('dialog', (d) => d.accept());
    await openSample(p2, base, 'sample-a');
    await clickText(p2, 'はじめから');
    await clickText(p2, '既読SKIP');
    await p2.waitForTimeout(1200);
    check('既読のない行では SKIP が進まず止まる', (await st(p2)).lineId === 'a-001' && (await st(p2)).skip === false);
    // a-001 だけを既読にしてから、既読 SKIP を使う。a-002 は未読なので、そこで止まるはず。
    await clickText(p2, 'タイトル');
    await clickText(p2, 'はじめから');
    await clickText(p2, '既読SKIP');
    await p2.waitForTimeout(1200);
    check('既読の a-001 を飛ばし、未読の a-002 で止まる', (await st(p2)).lineId === 'a-002' && (await st(p2)).skip === false, JSON.stringify(await st(p2)));
    await fresh.close();

    // ----- 作品データの版が違う保存（試験用に保存を書き込む） -----
    section('作品データの版が違う保存（移し方がない）');
    const oldCtx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    const p3 = await oldCtx.newPage();
    p3.on('pageerror', (e) => errors.push(String(e)));
    await openSample(p3, base, 'sample-a');
    const oldRaw = JSON.stringify({ v: 1, game: 'sample-a', dataVersion: '2026.09-0', kit: '0.1.0', seen: [], gallery: {}, settings: { speed: 0, sound: false, mix: { bgm: 100, amb: 100, se: 100 } }, auto: { at: 'a-003', flags: {}, dataVersion: '2026.09-0' }, slots: [{ at: 'a-003', flags: {}, dataVersion: '2026.09-0' }, null, null] });
    await p3.evaluate((raw) => localStorage.setItem('kit:sample-a:v1', raw), oldRaw);
    await p3.reload();
    await p3.waitForFunction(() => window.KIT && window.KIT.s);
    await p3.evaluate(() => { window.KIT.s.speed = 0; });
    check('移し方のない版の保存は読まない（つづきから は押せない）', await p3.getByRole('button', { name: 'つづきから', exact: true }).isDisabled());
    check('移し方のない版の保存は blocked と分かる', (await p3.evaluate(() => KIT.s.saveMode)) === 'blocked');
    await clickText(p3, 'はじめから');
    await p3.click('.kit-dialogue');
    check('移し方のない保存は、進行しても書き換えない', (await p3.evaluate(() => localStorage.getItem('kit:sample-a:v1'))) === oldRaw);
    await oldCtx.close();
    await ctx.close();

    // ----- 印象の確認（エラーなし） -----
    section('実行中のエラー');
    check('ページの例外が出ていない', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = summary() ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
