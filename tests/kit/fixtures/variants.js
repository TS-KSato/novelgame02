// 試験用の作品データの変更版。サンプルAの作品データから、一つの変更だけを加える。
// 変更の内容は、保存の移行（行IDの対応・フラグの移行）の試験に対応する。
function cloneKeep(v) {
  if (Array.isArray(v)) return v.map(cloneKeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneKeep(x)]));
  return v;
}
function prefixAssets(g, base) {
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string' && v.startsWith('assets/')) o[k] = base + v;
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(g.assets);
}
function lineIds(g) { return Object.values(g.scenes).flatMap((s) => s.lines.map((l) => l.id)); }
function renameLine(g, from, to) {
  for (const s of Object.values(g.scenes)) for (const l of s.lines) if (l.id === from) l.id = to;
  for (const c of g.cues) if (c.at === from) c.at = to;
}
function editLine(g, id, text) {
  for (const s of Object.values(g.scenes)) for (const l of s.lines) if (l.id === id) l.text = text;
}
// 行IDの対応表：現在の行IDのすべてを、対応表の中で写す（renamed だけを変える）
function identityLines(ids, renamed) {
  const out = {};
  ids.forEach((id) => { out[id] = Object.prototype.hasOwnProperty.call(renamed, id) ? renamed[id] : id; });
  return out;
}

const KIT_VARIANTS = {
  // 変更なし（保存を作ったときと同じ作品データ）
  base: (g) => g,

  // 行の挿入（版は変えない）：既存の行IDは同じ行を指すこと
  insertLine: (g) => {
    g.scenes.room.lines.splice(2, 0, { id: 'a-002x', speaker: 'mio', text: '新しく入れた行。' });
    return g;
  },

  // 本文の変更（版を上げ、行IDは変えない）：変わった行は既読にならないこと
  editText: (g) => {
    editLine(g, 'a-002', '……ここで待っていれば、きっと来るはず。');
    g.dataVersion = '2026.10-2';
    g.migrations = { '2026.10-1': { lines: 'identity' } };
    return g;
  },

  // 行IDの変更：対応表で写す（a-003 → a-003n）
  renameMapped: (g) => {
    const ids = lineIds(g);
    renameLine(g, 'a-003', 'a-003n');
    g.dataVersion = '2026.10-3';
    g.migrations = { '2026.10-1': { lines: identityLines(ids, { 'a-003': 'a-003n' }) } };
    return g;
  },

  // 行IDの変更：対応表に書かない（a-003 を写せない）→ 移行できず、元の保存を変えない
  renameUnmapped: (g) => {
    const ids = lineIds(g).filter((id) => id !== 'a-003');
    renameLine(g, 'a-003', 'a-003n');
    g.dataVersion = '2026.10-3';
    g.migrations = { '2026.10-1': { lines: identityLines(ids, {}) } };
    return g;
  },

  // フラグの定義が変わったが版は同じ：読まず、書かない
  flagsSameVersion: (g) => {
    g.flags.route.values = ['none', 'warm', 'cool'];
    g.scenes.room.choices[0].set.route = 'warm';
    return g;
  },

  // フラグの定義が変わり、版を上げて移行方法を書いた：kind は warm に移す
  flagsMigrated: (g) => {
    g.flags.route.values = ['none', 'warm', 'cool'];
    g.scenes.room.choices[0].set.route = 'warm';
    g.dataVersion = '2026.10-4';
    g.migrations = {
      '2026.10-1': {
        lines: 'identity',
        flags: (f) => ({ ...f, route: f.route === 'kind' ? 'warm' : f.route }),
      },
    };
    return g;
  },
};
