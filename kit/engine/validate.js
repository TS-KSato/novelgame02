// 作品データの検証と、行の同一性の判定。ブラウザでも Node.js でも読み込める（副作用なし）。
(function (root) {
  'use strict';

  // 作品IDは保存キーの接頭辞になるため、英小文字・数字・ハイフンに限る。
  const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  // 行IDは作品全体で一意。演出（背景・立ち絵・CG・音）は行IDで指定する。
  const LINE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const SCENE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const FLAG_TYPES = ['boolean', 'enum'];
  const ASSET_GROUPS = ['backgrounds', 'bgm', 'ambience', 'se', 'cgs', 'portraits'];
  const FILE_RE = /\.(png|jpe?g|webp|gif|wav|mp3|ogg)$/i;

  // 空白の差は同じ文章とみなす。句読点や言葉の差は別の文章として扱う。
  function normalizeText(s) {
    return String(s).replace(/\s+/g, '');
  }

  // 行の本文の指紋（FNV-1a 32bit）。既読は「行ID＋指紋」で持つので、本文が変わった行は既読にならない。
  function hashLine(line) {
    const s = normalizeText((line.speaker || '') + '\u0001' + line.text);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // 全場面の行を、場面の宣言順に一列へ並べる。線形の位置（linear）で前後関係を比べる。
  function flattenLines(game) {
    const out = [];
    for (const [scene, def] of Object.entries(game.scenes || {})) {
      (def.lines || []).forEach((line, index) => {
        out.push({ id: line.id, scene, index, linear: out.length, line });
      });
    }
    return out;
  }

  function indexById(game) {
    const map = new Map();
    for (const e of flattenLines(game)) map.set(e.id, e);
    return map;
  }

  function validateGame(game) {
    const errors = [];
    const err = (path, msg) => errors.push(path + ': ' + msg);
    if (!game || typeof game !== 'object') return { ok: false, errors: ['game: 作品データがありません'] };

    if (typeof game.id !== 'string' || !GAME_ID_RE.test(game.id)) err('id', '作品IDは英小文字・数字・ハイフンで、40字以内にしてください');
    if (typeof game.title !== 'string' || !game.title) err('title', '作品名がありません');
    if (typeof game.dataVersion !== 'string' || !game.dataVersion) err('dataVersion', '作品データの版（文字列）がありません');
    if (typeof game.kit !== 'string' || !game.kit) err('kit', '使用するキットの版がありません');

    // 場面と行
    const scenes = game.scenes && typeof game.scenes === 'object' ? game.scenes : null;
    if (!scenes || Object.keys(scenes).length === 0) {
      err('scenes', '場面がありません');
      return { ok: false, errors };
    }
    const seenIds = new Map();
    for (const [scene, def] of Object.entries(scenes)) {
      if (!SCENE_RE.test(scene)) err('scenes.' + scene, '場面名は英小文字・数字・ハイフンにしてください');
      if (!def || !Array.isArray(def.lines) || def.lines.length === 0) {
        err('scenes.' + scene, '行（lines）が空です');
        continue;
      }
      def.lines.forEach((line, i) => {
        const at = 'scenes.' + scene + '.lines[' + i + ']';
        if (!line || typeof line.id !== 'string' || !LINE_ID_RE.test(line.id)) {
          err(at, '行IDがないか、形式が不正です');
          return;
        }
        if (typeof line.text !== 'string') err(at, '本文（text）が文字列ではありません');
        if (line.speaker !== undefined && typeof line.speaker !== 'string') err(at, '話者は文字列にしてください');
        if (seenIds.has(line.id)) err(at, '行ID「' + line.id + '」が重複しています（' + seenIds.get(line.id) + ' と同じ）');
        else seenIds.set(line.id, at);
      });
    }
    if (errors.length) return { ok: false, errors };

    const flat = flattenLines(game);
    const byId = indexById(game);
    const lin = (id) => byId.get(id).linear;

    // 開始位置
    if (!game.start || !scenes[game.start.scene]) err('start', '開始場面が存在しません');
    else if (!byId.has(game.start.line)) err('start', '開始行「' + game.start.line + '」が存在しません');
    else if (byId.get(game.start.line).scene !== game.start.scene) err('start', '開始行は開始場面の中にありません');

    // 旧い版の保存の移し方（作品が明示する。行IDが存在するだけでは写さない）
    if (game.aliases !== undefined) err('aliases', 'aliases は使えません。migrations に書き換えてください');
    const migrations = game.migrations === undefined ? {} : game.migrations;
    if (!migrations || typeof migrations !== 'object') err('migrations', 'migrations はオブジェクトにしてください');
    else for (const [ver, entry] of Object.entries(migrations)) {
      const at = 'migrations[' + ver + ']';
      if (ver === game.dataVersion) err(at, '現在の版と同じ版は書けません');
      if (!entry || typeof entry !== 'object') { err(at, '移行の定義がありません'); continue; }
      if (entry.lines === 'identity') { /* 行IDは変わっていないと作品が明示している */ }
      else if (entry.lines && typeof entry.lines === 'object' && !Array.isArray(entry.lines)) {
        for (const [oldId, newId] of Object.entries(entry.lines)) {
          if (newId === null) continue; // 写せないと明示した行
          if (typeof newId !== 'string' || !byId.has(newId)) err(at + '.lines.' + oldId, '移し先の行ID「' + newId + '」が存在しません');
        }
      } else err(at + '.lines', '行の対応（lines）は "identity" か、旧ID→新ID の対応表にしてください');
      if (entry.flags !== undefined && typeof entry.flags !== 'function') err(at + '.flags', 'flags は関数にしてください');
    }

    // フラグ
    const flags = game.flags || {};
    for (const [name, def] of Object.entries(flags)) {
      const at = 'flags.' + name;
      if (!FLAG_TYPES.includes(def.type)) err(at, '型は boolean か enum にしてください');
      if (def.type === 'boolean' && typeof def.default !== 'boolean') err(at, '既定値は true か false にしてください');
      if (def.type === 'enum') {
        if (!Array.isArray(def.values) || def.values.length === 0 || new Set(def.values).size !== def.values.length) {
          err(at, 'enum の値（values）は重複のない配列にしてください');
        } else if (!def.values.includes(def.default)) err(at, '既定値が values に含まれていません');
      }
    }

    // 素材
    const assets = game.assets || {};
    for (const group of ASSET_GROUPS) {
      const g = assets[group] || {};
      for (const [key, value] of Object.entries(g)) {
        const at = 'assets.' + group + '.' + key;
        if (group === 'portraits') {
          for (const [expr, file] of Object.entries(value || {})) {
            if (typeof file !== 'string' || !FILE_RE.test(file)) err(at + '.' + expr, '画像のパスが不正です');
          }
        } else if (group === 'cgs') {
          if (!value || typeof value.src !== 'string' || !FILE_RE.test(value.src)) err(at, 'CG の画像パス（src）が不正です');
        } else if (typeof value !== 'string' || !FILE_RE.test(value)) err(at, '素材のパスが不正です');
      }
    }
    const has = (group, key) => !!(assets[group] && Object.prototype.hasOwnProperty.call(assets[group], key));

    // 場面の遷移・選択肢
    for (const [scene, def] of Object.entries(scenes)) {
      if (def.next !== undefined && typeof def.next !== 'function' && !scenes[def.next]) err('scenes.' + scene + '.next', '次の場面「' + def.next + '」が存在しません');
      (def.choices || []).forEach((c, i) => {
        const at = 'scenes.' + scene + '.choices[' + i + ']';
        if (typeof c.text !== 'string' || !c.text) err(at, '選択肢の文章がありません');
        if (!scenes[c.to]) err(at, '移り先の場面「' + c.to + '」が存在しません');
        if (c.when !== undefined && typeof c.when !== 'function') err(at, 'when は関数にしてください');
        if (c.set !== undefined) {
          for (const [name, v] of Object.entries(c.set)) {
            const f = flags[name];
            if (!f) err(at, 'フラグ「' + name + '」が定義されていません');
            else if (f.type === 'boolean' && typeof v !== 'boolean') err(at, 'フラグ「' + name + '」には true か false を設定してください');
            else if (f.type === 'enum' && !(Array.isArray(f.values) && f.values.includes(v))) err(at, 'フラグ「' + name + '」に不正な値があります');
          }
        }
      });
    }

    // 演出（行IDで指定）
    const cues = Array.isArray(game.cues) ? game.cues : [];
    const bgAt = new Map(), portraitAt = new Map();
    const cgRanges = [];
    cues.forEach((cue, i) => {
      const at = 'cues[' + i + ']';
      if (!cue || typeof cue !== 'object') { err(at, '演出の定義がありません'); return; }
      if (!byId.has(cue.at)) { err(at, '行ID「' + cue.at + '」が存在しません'); return; }
      const kinds = ['bg', 'bgm', 'ambience', 'se', 'portrait', 'cg'].filter((k) => cue[k] !== undefined);
      if (kinds.length !== 1) { err(at, '一つの演出は、bg・bgm・ambience・se・portrait・cg のどれか一つだけにしてください'); return; }
      if (cue.bg !== undefined) {
        if (!has('backgrounds', cue.bg)) err(at, '背景「' + cue.bg + '」が素材に定義されていません');
        if (bgAt.has(cue.at)) err(at, '同じ行に背景の指定が二つあります');
        bgAt.set(cue.at, true);
      }
      if (cue.bgm !== undefined && !has('bgm', cue.bgm)) err(at, 'BGM「' + cue.bgm + '」が素材に定義されていません');
      if (cue.ambience !== undefined && !has('ambience', cue.ambience)) err(at, '環境音「' + cue.ambience + '」が素材に定義されていません');
      if (cue.se !== undefined && !has('se', cue.se)) err(at, '効果音「' + cue.se + '」が素材に定義されていません');
      if (cue.portrait !== undefined) {
        const p = cue.portrait;
        if (p.slot !== 'left' && p.slot !== 'right') err(at, '立ち絵の位置（slot）は left か right にしてください');
        const key = cue.at + '/' + p.slot;
        if (portraitAt.has(key)) err(at, '同じ行・同じ位置に立ち絵の指定が二つあります');
        portraitAt.set(key, true);
        if (!p.clear) {
          const exprs = (assets.portraits || {})[p.char];
          if (!exprs) err(at, '立ち絵の人物「' + p.char + '」が定義されていません');
          else if (!exprs[p.expr]) err(at, '表情「' + p.expr + '」が「' + p.char + '」に定義されていません');
        }
      }
      if (cue.cg !== undefined) {
        const c = cue.cg;
        if (!has('cgs', c.id)) err(at, 'CG「' + c.id + '」が素材に定義されていません');
        let until = cue.at;
        if (c.until !== undefined) {
          if (!byId.has(c.until)) err(at, 'CG の終了行「' + c.until + '」が存在しません');
          else if (byId.get(c.until).scene !== byId.get(cue.at).scene) err(at, 'CG の区間は同じ場面の中にしてください');
          else if (lin(c.until) < lin(cue.at)) err(at, 'CG の終了行が開始行より前にあります');
          else until = c.until;
        }
        cgRanges.push({ id: c.id, from: lin(cue.at), to: lin(until), at });
      }
    });
    // CG の区間が重なると、どの CG を出すか決まらない
    cgRanges.sort((a, b) => a.from - b.from);
    for (let i = 1; i < cgRanges.length; i++) {
      const prev = cgRanges[i - 1], cur = cgRanges[i];
      if (cur.from <= prev.to) err(cur.at, 'CG「' + cur.id + '」の区間が、CG「' + prev.id + '」の区間と重なっています');
    }

    return { ok: errors.length === 0, errors, lines: flat.length };
  }

  // 指定した行の時点で有効な演出の状態。行の挿入や並べ替えがあっても、行IDが同じなら同じ結果になる。
  function stateAt(game, lineId) {
    const byId = indexById(game);
    if (!byId.has(lineId)) throw new Error('行ID「' + lineId + '」が存在しません');
    const target = byId.get(lineId);
    const state = { scene: target.scene, lineId, bg: null, portraits: { left: null, right: null }, bgm: null, ambience: null, cg: null };
    for (const cue of (game.cues || [])) {
      const e = byId.get(cue.at);
      if (!e || e.linear > target.linear) continue;
      if (cue.bg !== undefined) state.bg = cue.bg;
      if (cue.bgm !== undefined) state.bgm = cue.bgm;
      if (cue.ambience !== undefined) state.ambience = cue.ambience;
      if (cue.portrait !== undefined) {
        state.portraits[cue.portrait.slot] = cue.portrait.clear ? null : { char: cue.portrait.char, expr: cue.portrait.expr };
      }
    }
    // CG は区間の中にいるときだけ出る
    for (const cue of (game.cues || [])) {
      if (cue.cg === undefined) continue;
      const from = byId.get(cue.at).linear;
      const to = cue.cg.until !== undefined ? byId.get(cue.cg.until).linear : from;
      if (from <= target.linear && target.linear <= to) state.cg = cue.cg.id;
    }
    return state;
  }

  // 行ごとの一回きりの演出（効果音、CG の解放）。その行へ到達したときに一度だけ起きる。
  function oneShotsAt(game, lineId) {
    return (game.cues || []).filter((c) => c.at === lineId && (c.se !== undefined || c.cg !== undefined));
  }

  const api = { normalizeText, hashLine, flattenLines, indexById, validateGame, stateAt, oneShotsAt };
  root.KitValidate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
