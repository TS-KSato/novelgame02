// サンプルB：サンプルAと別の作品。保存キーが別になることを確かめるための最小の作品。
window.KIT_GAME = {
  id: 'sample-b',
  title: 'サンプルB 最小の作品',
  dataVersion: '2026.10-1',
  kit: '0.1.0',
  start: { scene: 'only', line: 'x-001' },
  speakers: {},
  flags: {},
  assets: {
    backgrounds: { 'bg-plain': 'assets/backgrounds/bg-plain.png' },
    se: { chime: 'assets/se/chime.wav' },
  },
  scenes: {
    only: {
      title: '唯一の場面',
      lines: [
        { id: 'x-001', text: 'これは、もう一つの作品です。' },
        { id: 'x-002', text: '保存や既読は、作品ごとに分かれています。' },
      ],
    },
  },
  cues: [
    { at: 'x-001', bg: 'bg-plain' },
    { at: 'x-002', se: 'chime' },
  ],
  migrations: {},
};
