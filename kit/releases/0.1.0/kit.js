// ノベルゲーム制作キットの共通エンジン。作品の内容は持たず、作品データ（window.KIT_GAME）を読んで動く。
// 依存：validate.js、save.js（この順で先に読み込むこと）。
(function (root) {
  'use strict';
  const V = root.KitValidate;
  const KitSave = root.KitSave;
  const KIT_VERSION = '0.1.0';
  const SPEED_DEFAULT = 38;      // 文字の表示間隔（ミリ秒/字）。0 は即時表示
  const SPEED_MAX = 75;
  const SLOTS = 3;
  const SND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const SND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  // 起動して、作品を一つ動かす。複数の作品は、それぞれ別のページ（別の保存キー）で動かす。
  function start(game, options) {
    const host = (options && options.root) || document.getElementById('kit-root');
    const check = V.validateGame(game);
    if (!check.ok) return fail(host, '作品データに問題があります', check.errors);
    if (game.kit !== KIT_VERSION) return fail(host, 'キットの版が一致しません', ['作品は キット ' + game.kit + '、読み込まれたのは ' + KIT_VERSION + ' です']);
    return new Game(game, host, options || {}).boot();
  }

  function fail(host, title, lines) {
    host.textContent = '';
    const box = el('div', 'kit-error');
    box.append(el('h2', null, title));
    for (const l of lines) box.append(el('p', null, l));
    host.append(box);
    if (root.console) root.console.error('[kit] ' + title + ': ' + lines.join(' / '));
    return null;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  // ----- 保存 -----
  // 保存キーは作品IDごとに分ける。別の作品の保存は、キーが違うので読めない。
  function saveKey(id) { return 'kit:' + id + ':v1'; }
  // 移行の前に、元の保存をそのまま残す（一度だけ作る）
  function backupKey(id, version) { return 'kit:' + id + ':v1:backup:' + version; }

  function defaultFlags(game) { return KitSave.cleanFlags(game, {}); }

  // ----- 文字の指紋（既読の判定） -----
  function seenKey(line) { return line.id + '#' + V.hashLine(line); }

  // ----- Game（一つの作品の実行） -----
  class Game {
    constructor(game, host, options) {
      this.g = game;
      this.host = host;
      this.byId = V.indexById(game);
      this.flat = V.flattenLines(game);
      this.linearOf = new Map(this.flat.map((e) => [e.id, e.linear]));
      this.options = options;
      this.s = {
        screen: 'title', scene: null, lineId: null, flags: defaultFlags(game),
        seen: new Set(), speed: SPEED_DEFAULT, sound: false, mix: { bgm: 100, amb: 100, se: 100 },
        gallery: {}, slots: [null, null, null], auto: null,
        saveMode: 'empty', saveNote: '',
        typing: null, timer: null, autoTimer: null, skipTimer: null,
        auto_on: false, skip_on: false, readAtShow: false, shownAt: 0, pressedAt: 0, keyedAt: 0,
        choicesVisible: false, modal: null, rotated: false, previewLog: [], cg: null,
      };
      this.audio = { ctx: null, master: null, bus: {}, buffers: {}, now: { bgm: null, ambience: null }, loops: {} };
      this.log = []; // 試験用：何をしたかの記録（表示には使わない）
      this.schema = KitSave.flagSchema(game);
    }

    // ----- 起動 -----
    boot() {
      this.buildDom();
      this.loadSave();
      this.installInput();
      this.refreshRotation();
      this.showTitle();
      return this;
    }

    // 保存を読む。保存の評価（現在の版・移行・移行できない）は KitSave が決め、ここでは適用と書き込みだけ行う。
    loadSave() {
      let text = null;
      try { text = localStorage.getItem(saveKey(this.g.id)); } catch (e) { text = null; }
      if (text === null) return;
      let raw;
      try { raw = JSON.parse(text); } catch (e) { raw = undefined; }
      const a = KitSave.assess(this.g, raw, text);
      if (a.mode === 'migrated') {
        // 移す前に、元の保存をそのまま残す。残せないときは移さない（書き込まない）。
        const key = backupKey(this.g.id, raw.dataVersion);
        try {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, text);
        } catch (e) {
          this.applySave(null, a.partial, 'blocked');
          this.s.saveNote = 'バックアップを残せないため、保存を移しません。';
          return;
        }
      }
      this.applySave(a.record, a.partial, a.mode, a.reason);
      if (a.mode === 'migrated') this.notify('保存を新しい版へ移しました。');
    }

    applySave(record, partial, mode, reason) {
      const src = record || partial || {};
      this.s.saveMode = mode;
      this.s.saveNote = reason || '';
      this.s.auto = record && record.auto ? record.auto : null;
      this.s.slots = record ? record.slots : [null, null, null];
      this.s.seen = new Set(src.seen || []);
      this.s.gallery = src.gallery || {};
      const st = src.settings || {};
      if (typeof st.speed === 'number' && Number.isFinite(st.speed)) this.s.speed = Math.min(SPEED_MAX, Math.max(0, Math.round(st.speed)));
      if (st.sound === true) this.s.sound = true;
      for (const k of ['bgm', 'amb', 'se']) {
        const v = st.mix && st.mix[k];
        if (typeof v === 'number' && Number.isFinite(v)) this.s.mix[k] = Math.min(100, Math.max(0, Math.round(v)));
      }
    }

    // 保存の内容。移行できない保存（blocked）のときは書かない。
    persist() {
      if (this.s.saveMode === 'blocked') {
        this.notify('この保存は移行できないため、変更を保存していません。');
        return false;
      }
      const data = {
        v: 1, game: this.g.id, dataVersion: this.g.dataVersion, flagSchema: this.schema, kit: KIT_VERSION,
        auto: this.s.auto, slots: this.s.slots,
        seen: [...this.s.seen].slice(-20000),
        gallery: this.s.gallery,
        settings: { speed: this.s.speed, sound: this.s.sound, mix: this.s.mix },
      };
      try {
        localStorage.setItem(saveKey(this.g.id), JSON.stringify(data));
        this.s.saveMode = 'current';
        return true;
      } catch (e) {
        this.notify('ブラウザに保存できません。');
        return false;
      }
    }

    // ----- 画面の骨組み -----
    buildDom() {
      const host = this.host;
      host.textContent = '';
      host.classList.add('kit-root');
      document.title = this.g.title;
      this.ui = {};
      const q = (name, node) => { this.ui[name] = node; return node; };

      q('bg', el('div', 'kit-bg'));
      q('portraitL', el('div', 'kit-portrait kit-portrait-left'));
      q('portraitR', el('div', 'kit-portrait kit-portrait-right'));
      q('cg', el('img', 'kit-cg')); this.ui.cg.alt = ''; this.ui.cg.hidden = true;

      // 作品画面
      const play = q('play', el('section', 'kit-play'));
      play.hidden = true;
      const chapter = q('scene', el('div', 'kit-scene'));
      const dialogue = q('dialogue', el('button', 'kit-dialogue'));
      dialogue.type = 'button';
      dialogue.setAttribute('aria-label', '文章を進める');
      q('speaker', el('span', 'kit-speaker'));
      q('prose', el('span', 'kit-prose'));
      q('next', el('span', 'kit-next', 'タップで進む ▾'));
      dialogue.append(this.ui.speaker, this.ui.prose, this.ui.next);
      q('choices', el('div', 'kit-choices'));
      const bar = el('div', 'kit-bar');
      q('page', el('span', 'kit-page'));
      const btns = el('div', 'kit-bar-buttons');
      q('autoBtn', this.button('AUTO', () => this.toggleAuto()));
      q('skipBtn', this.button('既読SKIP', () => this.toggleSkip()));
      q('saveBtn', this.button('セーブ', () => this.openSaves('play')));
      q('menuBtn', this.button('タイトル', () => this.showTitle()));
      q('soundBtn', this.soundButton());
      btns.append(this.ui.autoBtn, this.ui.skipBtn, this.ui.saveBtn, this.ui.menuBtn, this.ui.soundBtn);
      bar.append(this.ui.page, btns);
      play.append(chapter, this.ui.dialogue, this.ui.choices, bar);
      this.ui.dialogue.addEventListener('click', () => this.next());

      // タイトル
      const title = q('title', el('section', 'kit-title'));
      title.append(el('h1', null, this.g.title));
      q('note', el('p', 'kit-note'));
      q('newBtn', this.button('はじめから', () => this.newGame()));
      q('contBtn', this.button('つづきから', () => this.continueGame()));
      title.append(this.ui.note, this.ui.newBtn, this.ui.contBtn,
        this.button('セーブ・読込', () => this.openSaves('title')),
        this.button('CG鑑賞', () => this.openCgList()),
        this.button('設定', () => this.openSettings()));

      // 縦向きの案内（横向き専用の作品）
      const rotate = q('rotate', el('section', 'kit-rotate'));
      rotate.append(el('p', null, '横向きでお楽しみください'));
      rotate.hidden = true;

      // 通知
      q('toast', el('div', 'kit-toast'));
      this.ui.toast.setAttribute('role', 'status');

      // モーダル
      const modal = q('modal', el('dialog', 'kit-modal'));
      const top = el('div', 'kit-modal-top');
      top.append(el('h2', null, ''), this.button('閉じる', () => this.closeModal()));
      modal.append(top, q('modalBody', el('div', 'kit-modal-body')));

      host.append(this.ui.bg, this.ui.portraitL, this.ui.portraitR, this.ui.cg, title, play, rotate, this.ui.toast, modal);
      this.ui.portraitL.setAttribute('aria-hidden', 'true');
      this.ui.portraitR.setAttribute('aria-hidden', 'true');
    }

    button(label, onClick) {
      const b = el('button', 'kit-btn', label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }

    soundButton() {
      const b = el('button', 'kit-sound');
      b.type = 'button';
      b.setAttribute('aria-label', '音を切り替え');
      b.addEventListener('click', () => this.toggleSound());
      return b;
    }

    refreshSound() {
      const b = this.ui.soundBtn;
      b.innerHTML = this.s.sound ? SND_ON : SND_OFF;
      b.setAttribute('aria-pressed', String(this.s.sound));
      b.classList.toggle('is-on', this.s.sound);
    }

    notify(text) {
      this.ui.toast.textContent = text;
      this.ui.toast.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => this.ui.toast.classList.remove('show'), 2400);
    }

    // ----- 画面の切り替え -----
    showTitle() {
      this.stopTimers();
      this.s.screen = 'title';
      this.ui.play.hidden = true;
      this.ui.title.hidden = false;
      this.ui.contBtn.disabled = !this.s.auto;
      this.ui.note.textContent = this.s.saveNote;
      this.ui.note.hidden = !this.s.saveNote;
      this.refreshSound();
      this.updateFromState(null);
      this.log.push('title');
    }

    newGame() {
      this.closeModal();
      const start = this.g.start.line;
      this.s.flags = defaultFlags(this.g);
      this.enterPlay(start, { jump: true });
    }

    continueGame() {
      if (!this.s.auto) return this.notify('つづきから読めません。');
      this.loadPosition(this.s.auto, true);
    }

    enterPlay(lineId, opts) {
      this.s.screen = 'play';
      this.ui.title.hidden = true;
      this.ui.play.hidden = false;
      this.goLine(lineId, opts || {});
    }

    // ----- 位置の移動 -----
    // 行へ移る。jump（読込・はじめから）のときは、一回きりの演出（効果音）を鳴らさない。
    goLine(lineId, opts) {
      const e = this.byId.get(lineId);
      if (!e) return this.notify('行の位置が見つかりません。');
      const prevScene = this.s.scene;
      this.s.scene = e.scene;
      this.s.lineId = lineId;
      // 行が変わっても、AUTO と既読SKIP は続ける（止めるのは選択肢・未読・画面の切り替えのとき）
      this.clearLineTimers();
      this.s.choicesVisible = false;
      this.ui.choices.textContent = '';
      this.ui.choices.hidden = true;

      // 演出の状態（背景・立ち絵・CG・BGM・環境音）は、行IDから求めた状態で揃える
      const st = V.stateAt(this.g, lineId);
      this.updateFromState(st);
      if (!opts.jump) {
        for (const c of V.oneShotsAt(this.g, lineId)) {
          if (c.se !== undefined) this.playOnce(c.se);
        }
      }
      // 到達したCGは解放する（読込のときも、それまでに到達したCGを解放する）
      for (const c of this.g.cues || []) {
        if (c.cg === undefined) continue;
        if (this.linearOf.get(c.at) <= e.linear) this.unlockCg(c.cg.id);
      }
      this.showLine(e, opts);
      if (prevScene !== e.scene) this.log.push('scene:' + e.scene);
      this.s.auto = { at: lineId, flags: { ...this.s.flags }, dataVersion: this.g.dataVersion };
      this.persist();
    }

    showLine(e, opts) {
      const line = e.line;
      this.ui.scene.textContent = this.g.scenes[e.scene].title || e.scene;
      this.ui.speaker.textContent = line.speaker ? (this.speakerName(line.speaker)) : '';
      this.ui.speaker.hidden = !line.speaker;
      this.ui.page.textContent = (e.index + 1) + ' / ' + this.g.scenes[e.scene].lines.length;
      this.s.readAtShow = this.s.seen.has(seenKey(line));
      this.s.shownAt = performance.now();
      const full = line.text;
      this.ui.prose.textContent = '';
      clearInterval(this.s.typing);
      this.s.typing = null;
      if (this.s.speed === 0 || (this.s.skip_on && this.s.readAtShow) || opts.instant) {
        this.complete(line, full);
      } else {
        let at = 0;
        const chars = Array.from(full);
        this.s.typing = setInterval(() => {
          at += 1;
          this.ui.prose.textContent = chars.slice(0, at).join('');
          if (at >= chars.length) this.complete(line, full);
        }, this.s.speed);
      }
      // 未読の行に来たら、既読SKIPは止める（未読の文章を飛ばさない）
      if (this.s.skip_on && !this.s.readAtShow) this.stopSkip();
    }

    complete(line, full) {
      clearInterval(this.s.typing);
      this.s.typing = null;
      this.ui.prose.textContent = full;
      this.s.seen.add(seenKey(line));
      this.persist();
      if (this.s.auto_on) this.scheduleAuto();
    }

    // 次の行への自動送り。選択肢は自動では選ばない：選択肢が出た時点で showChoices が AUTO を止める。
    scheduleAuto() {
      clearTimeout(this.s.autoTimer);
      const len = Array.from(this.currentLine().text).length;
      this.s.autoTimer = setTimeout(() => this.next(), Math.max(1800, len * 75));
    }

    currentLine() { return this.byId.get(this.s.lineId).line; }

    visibleChoices() {
      const scene = this.g.scenes[this.s.scene];
      return (scene.choices || []).filter((c) => !c.when || c.when(this.publicFlags()));
    }

    publicFlags() { return { ...this.s.flags }; }

    // 次へ。文章の途中なら表示を完了し、行の終わりなら次の行か選択肢か次の場面へ移る。
    next() {
      if (this.s.screen !== 'play' || this.s.rotated || this.isModalOpen() || this.s.choicesVisible) return;
      if (this.s.typing) {
        const line = this.currentLine();
        this.complete(line, line.text);
        return;
      }
      const scene = this.g.scenes[this.s.scene];
      const e = this.byId.get(this.s.lineId);
      if (e.index < scene.lines.length - 1) {
        this.goLine(scene.lines[e.index + 1].id, {});
        return;
      }
      const choices = this.visibleChoices();
      if (choices.length) {
        this.showChoices(choices);
        return;
      }
      const to = typeof scene.next === 'function' ? scene.next(this.publicFlags()) : scene.next;
      if (!to) return this.endGame();
      this.goLine(this.g.scenes[to].lines[0].id, {});
    }

    showChoices(choices) {
      this.stopTimers();
      this.s.choicesVisible = true;
      this.s.shownAt = performance.now();
      this.ui.choices.textContent = '';
      for (const c of choices) {
        const b = el('button', 'kit-choice', c.text);
        b.type = 'button';
        b.addEventListener('click', (ev) => this.choose(c, ev));
        this.ui.choices.append(b);
      }
      this.ui.choices.hidden = false;
      this.refreshButtons();
    }

    // 選択肢は、表示された後に始まった押下（ポインター・キー）でだけ決まる。
    // AUTO や既読 SKIP を止めた押下、表示前から続いている押下では選ばない。
    choose(choice, ev) {
      const started = ev && ev.detail ? this.s.pressedAt : this.s.keyedAt;
      if (started < this.s.shownAt) return;
      if (!this.s.choicesVisible) return;
      this.stopTimers();
      if (choice.set) Object.assign(this.s.flags, choice.set);
      this.s.choicesVisible = false;
      this.goLine(this.g.scenes[choice.to].lines[0].id, {});
    }

    endGame() {
      this.stopTimers();
      this.notify('この作品はここまでです。');
      this.s.auto = null;
      this.persist();
      this.showTitle();
    }

    loadPosition(saved, fromAuto) {
      if (!saved || !this.byId.has(saved.at)) return this.notify('この保存の位置は、現在の作品にありません。');
      this.s.flags = KitSave.cleanFlags(this.g, saved.flags);
      this.closeModal();
      this.enterPlay(saved.at, { jump: true, instant: true });
      if (fromAuto) this.notify('つづきから再開しました。');
    }

    // ----- 既読 SKIP / AUTO -----
    toggleAuto() {
      if (this.s.screen !== 'play') return;
      this.s.auto_on = !this.s.auto_on;
      if (this.s.auto_on) { this.s.skip_on = false; if (!this.s.typing) this.scheduleAuto(); }
      else clearTimeout(this.s.autoTimer);
      this.refreshButtons();
    }

    toggleSkip() {
      if (this.s.screen !== 'play') return;
      if (this.s.skip_on) { this.stopSkip(); return; }
      this.s.auto_on = false;
      clearTimeout(this.s.autoTimer);
      this.s.skip_on = true;
      this.s.skipTimer = setInterval(() => {
        if (!this.s.readAtShow || this.s.choicesVisible) return this.stopSkip();
        if (this.s.typing) return this.complete(this.currentLine(), this.currentLine().text);
        this.next();
      }, 160);
      this.refreshButtons();
    }

    stopSkip() {
      clearInterval(this.s.skipTimer);
      this.s.skip_on = false;
      this.refreshButtons();
    }

    stopAutoAtChoices() {
      this.s.auto_on = false;
      clearTimeout(this.s.autoTimer);
      this.refreshButtons();
    }

    // 行の移動のための後始末（文字の表示と、次の行への自動送りだけ止める）
    clearLineTimers() {
      clearTimeout(this.s.autoTimer);
      clearInterval(this.s.typing);
      this.s.typing = null;
    }

    // 選択肢・画面の切り替えなど、AUTO と既読SKIP を完全に止めるとき
    stopTimers() {
      this.clearLineTimers();
      clearInterval(this.s.skipTimer);
      this.s.auto_on = false;
      this.s.skip_on = false;
      this.refreshButtons();
    }

    refreshButtons() {
      this.ui.autoBtn.classList.toggle('active', this.s.auto_on);
      this.ui.skipBtn.classList.toggle('active', this.s.skip_on);
      this.ui.autoBtn.setAttribute('aria-pressed', String(this.s.auto_on));
      this.ui.skipBtn.setAttribute('aria-pressed', String(this.s.skip_on));
    }

    // ----- 入力 -----
    installInput() {
      this._down = (e) => { this.s.pressedAt = performance.now(); };
      this._key = (e) => {
        if (e.repeat) return;
        this.s.keyedAt = performance.now();
        if ((e.code === 'Space' || e.code === 'Enter') && this.s.screen === 'play' && !this.isModalOpen()) {
          e.preventDefault();
          this.next();
        }
      };
      document.addEventListener('pointerdown', this._down, true);
      document.addEventListener('keydown', this._key, true);
      this._portrait = matchMedia('(orientation: portrait)');
      this._portrait.addEventListener('change', () => this.refreshRotation());
    }

    refreshRotation() {
      const portrait = this._portrait ? this._portrait.matches : false;
      this.s.rotated = portrait;
      this.ui.rotate.hidden = !portrait;
      if (portrait) {
        if (this.s.typing) this.complete(this.currentLine(), this.currentLine().text);
        this.stopTimers();
      }
    }

    isModalOpen() { return this.ui.modal.open; }

    // ----- 演出の表示 -----
    updateFromState(st) {
      if (!st) {
        this.ui.bg.style.backgroundImage = '';
        this.ui.portraitL.textContent = ''; this.ui.portraitR.textContent = '';
        this.ui.cg.hidden = true; this.ui.cg.removeAttribute('src');
        this.s.cg = null;
        return;
      }
      const bg = st.bg && this.g.assets.backgrounds[st.bg];
      this.ui.bg.style.backgroundImage = bg ? 'url("' + bg + '")' : '';
      this.renderPortrait(this.ui.portraitL, st.portraits.left);
      this.renderPortrait(this.ui.portraitR, st.portraits.right);
      const cgSrc = st.cg ? this.g.assets.cgs[st.cg].src : null;
      if (cgSrc) {
        if (this.ui.cg.getAttribute('src') !== cgSrc) this.ui.cg.src = cgSrc;
        this.ui.cg.hidden = false;
      } else {
        this.ui.cg.hidden = true;
        this.ui.cg.removeAttribute('src');
      }
      this.s.cg = st.cg;
      this.syncAudio(st);
    }

    renderPortrait(node, p) {
      node.textContent = '';
      if (!p) return;
      const file = this.g.assets.portraits[p.char][p.expr];
      const img = el('img', 'kit-portrait-img');
      img.src = file;
      img.alt = '';
      node.append(img);
    }

    speakerName(key) {
      const names = this.g.speakers || {};
      return names[key] || key;
    }

    // ----- 音声（Web Audio。音は設定が入のときだけ出す） -----
    ensureAudio() {
      const A = this.audio;
      if (A.ctx) return true;
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return false;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.connect(A.ctx.destination);
      for (const k of ['bgm', 'amb', 'se']) {
        A.bus[k] = A.ctx.createGain();
        A.bus[k].connect(A.master);
      }
      this.applyMix();
      return true;
    }

    applyMix() {
      const A = this.audio;
      if (!A.ctx) return;
      A.master.gain.value = this.s.sound ? 1 : 0;
      for (const k of ['bgm', 'amb', 'se']) A.bus[k].gain.value = this.s.mix[k] / 100;
    }

    load(url) {
      const A = this.audio;
      if (!A.buffers[url]) {
        A.buffers[url] = fetch(url)
          .then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
          .then((ab) => A.ctx.decodeAudioData(ab));
      }
      return A.buffers[url];
    }

    // 演出の状態から、BGM と環境音を揃える。同じ曲が続くなら止めない（場面が変わっただけでは止めない）。
    syncAudio(st) {
      if (!this.s.sound || !this.ensureAudio()) return;
      this.applyMix();
      for (const kind of ['bgm', 'ambience']) {
        const want = st[kind];
        if (this.audio.now[kind] === want) continue;
        this.stopLoop(kind);
        this.audio.now[kind] = want;
        if (want) this.playLoop(kind, want);
      }
    }

    fileOf(kind, name) {
      const group = kind === 'bgm' ? 'bgm' : kind === 'ambience' ? 'ambience' : 'se';
      return this.g.assets[group][name];
    }

    playLoop(kind, name) {
      const A = this.audio;
      const url = this.fileOf(kind, name);
      this.load(url).then((buf) => {
        if (this.audio.now[kind] !== name || !this.s.sound) return; // 途中で変わった・止まった
        const src = A.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(A.bus[kind === 'bgm' ? 'bgm' : 'amb']);
        src.start();
        A.loops[kind] = src;
      }).catch((e) => { this.log.push('audio-error:' + e.message); });
    }

    stopLoop(kind) {
      const src = this.audio.loops[kind];
      if (src) { try { src.stop(); } catch (e) { /* 既に止まっている */ } }
      this.audio.loops[kind] = null;
    }

    playOnce(name) {
      if (!this.s.sound || !this.ensureAudio()) return;
      const A = this.audio;
      this.load(this.fileOf('se', name)).then((buf) => {
        if (!this.s.sound) return;
        const src = A.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(A.bus.se);
        src.start();
      }).catch((e) => { this.log.push('audio-error:' + e.message); });
    }

    toggleSound() {
      this.s.sound = !this.s.sound;
      this.refreshSound();
      if (this.s.sound) {
        this.ensureAudio();
        if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
        const st = this.currentState();
        if (st) { this.audio.now = { bgm: null, ambience: null }; this.syncAudio(st); }
      } else {
        this.applyMix();
        for (const k of ['bgm', 'ambience']) this.stopLoop(k);
        this.audio.now = { bgm: null, ambience: null };
      }
      this.persist();
    }

    currentState() {
      return this.s.lineId ? V.stateAt(this.g, this.s.lineId) : null;
    }

    // 参考音は環境音と効果音のスライダーだけ。BGM のスライダーでは鳴らさない。
    previewVolume(kind) {
      if (kind !== 'amb' && kind !== 'se') return;
      this.s.previewLog.push(kind); // 試験用の記録（表示には使わない）
      if (!this.s.sound || !this.ensureAudio()) return;
      if (kind === 'amb') {
        const name = Object.keys(this.g.assets.ambience || {})[0];
        if (!name) return;
        const url = this.fileOf('ambience', name);
        this.load(url).then((buf) => {
          const src = this.audio.ctx.createBufferSource();
          src.buffer = buf; src.connect(this.audio.bus.amb); src.start(); src.stop(this.audio.ctx.currentTime + 1.5);
        }).catch((e) => { this.log.push('audio-error:' + e.message); });
      } else {
        const name = Object.keys(this.g.assets.se || {})[0];
        if (!name) return;
        this.playOnce(name);
      }
    }

    // ----- CG -----
    unlockCg(id) {
      if (this.s.gallery[id]) return;
      this.s.gallery[id] = true;
      this.persist();
    }

    openCgList() {
      this.openModal('CG鑑賞');
      const body = this.ui.modalBody;
      body.textContent = '';
      const grid = el('div', 'kit-cg-grid');
      for (const [id, def] of Object.entries(this.g.assets.cgs || {})) {
        const unlocked = !!this.s.gallery[id];
        const b = el('button', 'kit-cg-card' + (unlocked ? '' : ' locked'));
        b.type = 'button';
        if (unlocked) {
          const img = el('img'); img.src = def.src; img.alt = '';
          b.append(img);
          b.setAttribute('aria-label', def.title || id);
          b.addEventListener('click', () => this.openCgViewer(id));
        } else {
          b.disabled = true;
          b.innerHTML = LOCK_SVG;
          b.setAttribute('aria-label', '未解放');
        }
        grid.append(b);
      }
      body.append(grid);
    }

    openCgViewer(id) {
      const def = this.g.assets.cgs[id];
      this.openModal(def.title || id);
      const body = this.ui.modalBody;
      body.textContent = '';
      const img = el('img', 'kit-cg-view'); img.src = def.src; img.alt = def.title || '';
      body.append(img);
      const back = this.button('一覧へ戻る', () => this.openCgList());
      body.append(back);
    }

    // ----- 設定 -----
    openSettings() {
      this.openModal('設定');
      const body = this.ui.modalBody;
      body.textContent = '';
      body.append(this.slider('文字の速さ（右ほど速い）', 0, SPEED_MAX, SPEED_MAX - this.s.speed, (v) => {
        this.s.speed = SPEED_MAX - v;
        this.persist();
      }));
      const labels = { bgm: 'BGM', amb: '環境音', se: '効果音' };
      // 参考音は環境音と効果音だけ。BGM のスライダーには参考音を付けない。
      for (const k of ['bgm', 'amb', 'se']) {
        const onRelease = k === 'bgm' ? null : () => this.previewVolume(k);
        body.append(this.slider(labels[k], 0, 100, this.s.mix[k], (v) => {
          this.s.mix[k] = v;
          this.applyMix();
          this.persist();
        }, onRelease));
      }
    }

    slider(label, min, max, value, onInput, onRelease) {
      const wrap = el('label', 'kit-slider');
      wrap.append(el('span', null, label));
      const input = el('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(value);
      input.addEventListener('input', () => onInput(Number(input.value)));
      if (onRelease) input.addEventListener('change', () => onRelease(Number(input.value)));
      wrap.append(input);
      return wrap;
    }

    // ----- 手動セーブ・読込 -----
    openSaves(from) {
      this.openModal('セーブ・読込');
      const body = this.ui.modalBody;
      body.textContent = '';
      this.slotRows = [];
      for (let i = 0; i < SLOTS; i++) {
        const row = el('div', 'kit-slot');
        const slot = this.s.slots[i];
        row.append(el('span', null, (i + 1) + '　' + (slot ? this.describe(slot) : '空き')));
        if (from === 'play' && this.s.screen === 'play') {
          row.append(this.button('保存', () => this.saveSlot(i)));
        }
        if (slot) row.append(this.button('読込', () => this.loadSlot(i)));
        body.append(row);
      }
    }

    describe(slot) {
      const e = this.byId.get(slot.at);
      if (!e) return '読めない保存';
      return (this.g.scenes[e.scene].title || e.scene) + '（' + (e.index + 1) + '行目）';
    }

    saveSlot(i) {
      if (this.s.saveMode === 'blocked') return this.notify('この保存は移行できないため、変更を保存していません。');
      if (this.s.slots[i] && !window.confirm('このスロットを上書きしますか？')) return;
      this.s.slots[i] = { at: this.s.lineId, flags: { ...this.s.flags }, dataVersion: this.g.dataVersion, savedAt: Date.now() };
      if (this.persist()) this.notify('保存しました。');
      this.openSaves('play');
    }

    loadSlot(i) {
      const slot = this.s.slots[i];
      if (!slot) return;
      if (this.s.screen === 'play' && !window.confirm('今の進行を、このスロットに置き換えますか？')) return;
      this.loadPosition(slot, false);
    }

    // ----- モーダル -----
    openModal(title) {
      this.ui.modal.querySelector('h2').textContent = title;
      if (!this.ui.modal.open) this.ui.modal.showModal();
    }

    closeModal() {
      if (this.ui.modal.open) this.ui.modal.close();
    }
  }

  const api = { start, KIT_VERSION, Game };
  root.KitEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
