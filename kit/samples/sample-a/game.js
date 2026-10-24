// サンプルA：作品データの見本。作品の中身はすべてここに書く（エンジンには書かない）。
// 行IDは作品全体で一意。演出（背景・立ち絵・CG・音）は行IDで指定する。
window.KIT_GAME = {
  id: 'sample-a',
  title: 'サンプルA 夕方の約束',
  dataVersion: '2026.10-1',   // 作品データの版。文章や行を変えたら上げる
  kit: '0.1.0',               // 使うキットの版。キットを上げるときは、ここを手で書き換える

  start: { scene: 'room', line: 'a-001' },

  // 話者の表示名。キーは line.speaker に書く。話者のない行は地の文になる
  speakers: { mio: 'ミオ' },

  // 作品のフラグ。boolean か enum だけ。既定値を必ず決める
  flags: {
    met: { type: 'boolean', default: false },
    route: { type: 'enum', values: ['none', 'kind', 'cool'], default: 'none' },
  },

  // 素材。キーの名前で cue から参照する
  assets: {
    backgrounds: { 'bg-room': 'assets/backgrounds/bg-room.png', 'bg-hall': 'assets/backgrounds/bg-hall.png' },
    portraits: {
      mio: { normal: 'assets/portraits/mio-normal.png', smile: 'assets/portraits/mio-smile.png' },
    },
    cgs: { 'cg-sunset': { src: 'assets/cg/cg-sunset.png', title: '夕焼け' } },
    bgm: { theme: 'assets/bgm/theme-a.wav' },
    ambience: { wind: 'assets/ambience/wind.wav' },
    se: { chime: 'assets/se/chime.wav' },
  },

  // 場面。lines は { id, speaker?, text }。最後の行の後に choices があれば選択肢になる
  scenes: {
    room: {
      title: '第一場 部屋',
      lines: [
        { id: 'a-001', text: '部屋の窓から、夕方の光が差している。' },
        { id: 'a-002', speaker: 'mio', text: 'ここで待っていれば、来るはず。' },
        { id: 'a-003', speaker: 'mio', text: '……来てくれるかな。' },
        { id: 'a-004', text: 'ドアの向こうで、足音がした。' },
      ],
      choices: [
        { text: '声をかける', to: 'hall', set: { met: true, route: 'kind' } },
        { text: '黙って待つ', to: 'hall', set: { route: 'cool' } },
      ],
    },
    hall: {
      title: '第二場 廊下',
      lines: [
        { id: 'b-001', text: '廊下は静かで、遠くで風の音がする。' },
        { id: 'b-002', speaker: 'mio', text: 'あ、来てくれたんだ。' },
        { id: 'b-003', text: '空が、赤く染まっている。' },
        { id: 'b-004', speaker: 'mio', text: '今日は、ここで話せてよかった。' },
      ],
      // 次の場面は、フラグで決まる（関数は作品データに書く。文字列の評価はしない）
      next: (flags) => (flags.route === 'kind' ? 'ending-kind' : 'ending-cool'),
    },
    'ending-kind': {
      title: '終わり（やさしい道）',
      lines: [
        { id: 'k-001', speaker: 'mio', text: 'ありがとう。また明日も、ここで。' },
      ],
    },
    'ending-cool': {
      title: '終わり（静かな道）',
      lines: [
        { id: 'c-001', text: 'ふたりは何も言わず、夕焼けを見ていた。' },
      ],
    },
  },

  // 演出。行IDで指定する。一つの演出につき、bg・bgm・ambience・se・portrait・cg のどれか一つ
  cues: [
    { at: 'a-001', bg: 'bg-room' },
    { at: 'a-001', bgm: 'theme' },
    { at: 'a-003', portrait: { slot: 'right', char: 'mio', expr: 'normal' } },
    { at: 'b-001', bg: 'bg-hall' },
    { at: 'b-001', ambience: 'wind' },
    { at: 'b-001', se: 'chime' },
    { at: 'b-002', portrait: { slot: 'right', char: 'mio', expr: 'smile' } },
    { at: 'b-003', cg: { id: 'cg-sunset', until: 'b-004' } },
  ],

  // 旧い版の保存の移し方（版ごとに書く。行IDが同じなら lines: 'identity' と書く）
  migrations: {},
};
