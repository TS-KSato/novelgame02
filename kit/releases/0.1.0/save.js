// 保存の読み方を決める（副作用なし。ブラウザでも Node.js でも読める）。
// 保存は三つに分けて扱う：
//   保存位置（自動・手動）：行IDは、作品の版が同じ時だけそのまま使う。版が違えば migrations の対応表で写す。
//   既読：「行ID＋本文の指紋」が、現在の行と一致する時だけ有効。対応表があれば、写した行ID で照合する。
//   フラグ：保存時の定義（flagSchema）と現在の定義が同じ時だけそのまま使う。違えば migrations の flags で移す。
// 移せないものが一つでもあれば、その保存は「移行できない（blocked）」になる。blocked の保存は読まず、書かない。
(function (root) {
  'use strict';
  const V = (typeof module !== 'undefined' && module.exports) ? require('./validate.js') : root.KitValidate;

  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // キーの順番に依存しない JSON（定義の比較に使う）
  function canon(x) {
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }

  // フラグの定義（名前・型・値・既定値）。保存に書き、版が変わらない変更も検出する。
  function flagSchema(game) {
    const out = {};
    for (const name of Object.keys(game.flags || {}).sort()) {
      const d = game.flags[name];
      out[name] = d.type === 'enum'
        ? { type: 'enum', values: [...d.values], default: d.default }
        : { type: 'boolean', default: d.default };
    }
    return out;
  }

  function flagValueOk(def, v) {
    return def.type === 'boolean' ? typeof v === 'boolean' : def.values.includes(v);
  }

  // 保存のフラグを作品の定義に合わせる。定義にない名前は捨て、型の違う値は既定値にする（現在の版の保存だけ）。
  function cleanFlags(game, raw) {
    const out = {};
    for (const [name, def] of Object.entries(game.flags || {})) {
      const v = raw && hasOwn(raw, name) ? raw[name] : undefined;
      out[name] = flagValueOk(def, v) ? v : def.default;
    }
    return out;
  }

  // 移行したフラグは、すべての名前が定義どおりの値でなければ受け付けない（既定値で埋めない）
  function strictFlags(game, raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    for (const [name, def] of Object.entries(game.flags || {})) {
      if (!hasOwn(raw, name) || !flagValueOk(def, raw[name])) return null;
      out[name] = raw[name];
    }
    return out;
  }

  // 行IDの写し方。'identity' は「行IDは変わっていない」と作品が明示したとき。
  // 対応表（オブジェクト）は、書いてある ID だけを写す。書いていない ID は写せない。
  function mapperFor(lines) {
    if (lines === 'identity') return (id) => id;
    if (lines && typeof lines === 'object') return (id) => (hasOwn(lines, id) ? lines[id] : undefined);
    return null;
  }

  // 既読の一つを現在の行へ写す。行が無い・指紋が違う（本文が変わった）なら捨てる。
  function keepSeen(key, map, byId) {
    if (typeof key !== 'string') return null;
    const i = key.indexOf('#');
    if (i <= 0) return null;
    const newId = map(key.slice(0, i));
    if (typeof newId !== 'string' || !byId.has(newId)) return null;
    const h = key.slice(i + 1);
    if (V.hashLine(byId.get(newId).line) !== h) return null;
    return newId + '#' + h;
  }

  function keepGallery(game, raw) {
    const out = {};
    const cgs = (game.assets && game.assets.cgs) || {};
    if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) if (raw[k] === true && hasOwn(cgs, k)) out[k] = true;
    return out;
  }

  function keepSettings(raw) {
    return raw && typeof raw.settings === 'object' && raw.settings ? raw.settings : {};
  }

  // 保存を評価する。raw は読んだ JSON（読めなければ undefined）。raw は変更しない。
  // 返り値：{ mode, record, partial, reason }
  //   mode: 'empty'（保存なし）| 'current'（そのまま使う）| 'migrated'（移行して使う）| 'blocked'（読まず、書かない）
  //   record: 使う保存（empty と blocked では null）
  //   partial: blocked のときに読んでよい部分（設定・既読のうち現在の行と一致するもの・CG 解放）
  function assess(game, raw, text) {
    const byId = V.indexById(game);
    const schema = flagSchema(game);
    const identity = mapperFor('identity');
    if (text === null || text === undefined) return { mode: 'empty', record: null, partial: null, reason: '' };

    const blocked = (reason, partialRaw) => ({
      mode: 'blocked',
      record: null,
      reason,
      partial: {
        settings: keepSettings(partialRaw),
        seen: Array.isArray(partialRaw && partialRaw.seen) ? partialRaw.seen.map((k) => keepSeen(k, identity, byId)).filter(Boolean) : [],
        gallery: keepGallery(game, partialRaw && partialRaw.gallery),
      },
    });

    if (!raw || typeof raw !== 'object' || raw.v !== 1 || raw.game !== game.id || typeof raw.dataVersion !== 'string') {
      return blocked('保存の形式が読めません。', null);
    }

    const sameVersion = raw.dataVersion === game.dataVersion;
    const sameFlags = canon(raw.flagSchema) === canon(schema);

    if (sameVersion && sameFlags) {
      const record = {
        v: 1, game: game.id, dataVersion: game.dataVersion, flagSchema: schema,
        auto: raw.auto || null,
        slots: Array.isArray(raw.slots) ? [0, 1, 2].map((i) => raw.slots[i] || null) : [null, null, null],
        seen: Array.isArray(raw.seen) ? raw.seen.map((k) => keepSeen(k, identity, byId)).filter(Boolean) : [],
        gallery: keepGallery(game, raw.gallery),
        settings: keepSettings(raw),
      };
      return { mode: 'current', record, partial: null, reason: '' };
    }

    if (sameVersion) {
      return blocked('フラグの定義が、版（' + game.dataVersion + '）を変えずに変わっています。作品の版を上げ、移行の方法を書いてください。', raw);
    }

    const entry = hasOwn(game.migrations || {}, raw.dataVersion) ? game.migrations[raw.dataVersion] : null;
    if (!entry) {
      return blocked('版「' + raw.dataVersion + '」の保存を移す方法が、作品に書かれていません。保存は読まず、そのまま残します。', raw);
    }
    const map = mapperFor(entry.lines);
    if (!map) return blocked('版「' + raw.dataVersion + '」の行の対応（lines）が書かれていません。', raw);

    let flagFn = null;
    if (!sameFlags) {
      if (typeof entry.flags !== 'function') return blocked('版「' + raw.dataVersion + '」からフラグの定義が変わっています。移行の方法（flags）が必要です。', raw);
      flagFn = entry.flags;
    }
    const migrateFlags = (f) => {
      if (!flagFn) return strictFlags(game, f);
      let out;
      try { out = flagFn(JSON.parse(JSON.stringify(f || {})), JSON.parse(JSON.stringify(raw.flagSchema))); } catch (e) { return null; }
      return strictFlags(game, out);
    };
    const migratePosition = (p) => {
      if (!p || typeof p !== 'object' || typeof p.at !== 'string') return null;
      const target = map(p.at);
      if (typeof target !== 'string' || !byId.has(target)) return null;
      const flags = migrateFlags(p.flags);
      if (!flags) return null;
      return { ...p, at: target, flags, dataVersion: game.dataVersion };
    };

    const failed = [];
    let auto = null;
    if (raw.auto) {
      auto = migratePosition(raw.auto);
      if (!auto) failed.push('自動セーブ');
    }
    const slots = [null, null, null];
    (Array.isArray(raw.slots) ? raw.slots : []).slice(0, 3).forEach((p, i) => {
      if (!p) return;
      const m = migratePosition(p);
      if (m) slots[i] = m; else failed.push('手動セーブ' + (i + 1));
    });
    if (failed.length) {
      return blocked('次の保存の位置を、版「' + raw.dataVersion + '」から移せません：' + failed.join('、') + '。保存は読まず、そのまま残します。', raw);
    }

    const record = {
      v: 1, game: game.id, dataVersion: game.dataVersion, flagSchema: schema,
      auto, slots,
      seen: Array.isArray(raw.seen) ? raw.seen.map((k) => keepSeen(k, map, byId)).filter(Boolean) : [],
      gallery: keepGallery(game, raw.gallery),
      settings: keepSettings(raw),
    };
    return { mode: 'migrated', record, partial: null, reason: '' };
  }

  const api = { canon, flagSchema, cleanFlags, assess };
  root.KitSave = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
