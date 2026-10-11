/**
 * CloudPet 像素画 —— 纯代码绘制的宠物形象, 无任何图片资源。
 * 浏览器通过 <script> 引入得到全局 PET_ART, Node 可直接 require。
 * 每个进化形态是一张字符画, 每个字符对应一种颜色:
 *   . 透明  o 描边  f 主毛色  F 深色条纹  w 白  p 粉  c 腮红
 *   b 眼睛  m 嘴  M 张嘴  r 舌头/宝石  s 蛋壳斑点  t 眼泪
 *   W 翅膀  g 金色皇冠  - 闭眼
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.PET_ART = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STAGES = {
    egg: {
      eyesRow: -1,
      mouthRow: -1,
      palette: {
        o: '#d19a5b', w: '#fff3d6', s: '#f0b06a', c: '#f7c1a0',
      },
      map: [
        '................',
        '................',
        '................',
        '..oooooooooooo..',
        '..owwwwwwwwwwo..',
        '..owwsswwsswwo..',
        '..owsswwwwsswo..',
        '..owwwwwwwwwwo..',
        '..owswwwwwwswo..',
        '..owsswwwwsswo..',
        '..owwsswwsswwo..',
        '..owwwwwwwwwwo..',
        '..oooooooooooo..',
        '................',
        '................',
      ],
    },

    kitten: {
      eyesRow: 6,
      mouthRow: 9,
      palette: {
        o: '#4a3323', f: '#f7b267', F: '#e08e3c', w: '#fff3e0',
        p: '#f98ba0', c: '#f9b8c4', C: '#f4728c', b: '#3a2417',
        m: '#8a5a44', M: '#7a3b2e', r: '#f2668b', t: '#5aa7e8', '-': '#3a2417',
      },
      map: [
        '................',
        '...o........o...',
        '..ofo......ofo..',
        '.ofpfo....ofpfo.',
        'oooooooooooooooo',
        'ofFFfffffffFFffo',
        'offffbbffbbffffo',
        'offffffffffffffo',
        'offcfwwppwwfcffo',
        'offfffwmmwfffffo',
        'offffffffffffffo',
        'ooffffffffffffoo',
        'ofFFfffffffFFffo',
        'owwffffffffffwwo',
        '.oooooooooooooo.',
      ],
    },

    cat: {
      eyesRow: 6,
      mouthRow: 9,
      palette: {
        o: '#3f2c20', f: '#e8964b', F: '#c9742f', w: '#fdf1e0',
        p: '#ef7f96', c: '#f3a8b5', C: '#ee6d89', b: '#2e1d12',
        m: '#7a4a3a', M: '#6e3425', r: '#f2668b', t: '#5aa7e8', '-': '#2e1d12',
      },
      map: [
        '................',
        '...o........o...',
        '..ofo......ofo..',
        '.ofpfo....ofpfo.',
        'oooooooooooooooo',
        'ofFFfffffffFFffo',
        'offffbbffbbffffo',
        'offFFfffffFFfffo',
        'offcfwwppwwfcffo',
        'offfffwmmwfffffo',
        'ooffffffffffffoo',
        'ofFFfffffffFFffo',
        'ofFFfffffffFFffo',
        'owwffffffffffwwo',
        '.oooooooooooooo.',
      ],
    },

    legend: {
      eyesRow: 9,
      mouthRow: 12,
      palette: {
        o: '#4a3524', f: '#ffd98e', F: '#eab456', w: '#fffaf0',
        p: '#f98ba0', c: '#f9b8c4', C: '#f4728c', b: '#3a2417',
        m: '#8a5a44', M: '#7a3b2e', r: '#e8436a', t: '#5aa7e8', '-': '#3a2417',
        W: '#ffe9b0', g: '#ffcf3f',
      },
      map: [
        '........g.g.g.........',
        '........ggrgg.........',
        '.......ogggggo........',
        '......................',
        '......o........o......',
        '.....ofo......ofo.....',
        '....ofpfo....ofpfo....',
        '...oooooooooooooooo...',
        '...ofFFfffffffFFffo...',
        '...offffbbffbbffffo...',
        '...offffffffffffffo...',
        '...offcfwwppwwfcffo...',
        'W..offfffwmmwfffffo..W',
        'WW.offffffffffffffo.WW',
        'WWWooffffffffffffooWWW',
        '.WWofFFfffffffFFffoWW.',
        '..WowwffffffffffwwoW..',
        '....oooooooooooooo....',
      ],
    },
  };

  // 表情状态变换: 换行内的特定字符
  const TRANSFORMS = {
    blink: (stage, rows) => {
      if (stage.eyesRow >= 0) rows[stage.eyesRow] = rows[stage.eyesRow].replace(/b/g, '-');
    },
    eat: (stage, rows) => {
      if (stage.mouthRow >= 0) rows[stage.mouthRow] = rows[stage.mouthRow].replace('mm', 'Mr');
    },
    sad: (stage, rows) => {
      if (stage.eyesRow >= 0) rows[stage.eyesRow] = rows[stage.eyesRow].replace(/b/g, 't');
      if (stage.mouthRow >= 0) rows[stage.mouthRow] = rows[stage.mouthRow].replace('mm', '--');
    },
    happy: (stage, rows) => {
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i].replace(/c/g, 'C');
    },
  };

  // 根据形态 + 表情状态生成最终的字符画
  function buildMap(stageKey, state = {}) {
    const stage = STAGES[stageKey] || STAGES.kitten;
    const rows = stage.map.map((r) => r.slice());
    if (state.blink) TRANSFORMS.blink(stage, rows);
    if (state.eat) TRANSFORMS.eat(stage, rows);
    if (state.sad) TRANSFORMS.sad(stage, rows);
    if (state.happy) TRANSFORMS.happy(stage, rows);
    return { stage, rows, palette: stage.palette, width: rows[0].length, height: rows.length };
  }

  // 渲染: 单个元素 + box-shadow 像素技术, 无缝隙、可整体缩放、超轻量
  function renderInto(stageKey, state, el) {
    const { rows, palette } = buildMap(stageKey, state);
    const CELL = 16;
    const width = rows[0].length;
    const height = rows.length;
    let first = null;
    const shadows = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = palette[rows[y][x]];
        if (!color || rows[y][x] === '.') continue;
        if (first === null) first = { x: x * CELL, y: y * CELL, color };
        else shadows.push(`${x * CELL}px ${y * CELL}px 0 0 ${color}`);
      }
    }
    el.style.width = `${width * CELL}px`;
    el.style.height = `${height * CELL}px`;
    const px = el.firstElementChild;
    px.style.width = `${CELL}px`;
    px.style.height = `${CELL}px`;
    px.style.left = first ? `${first.x}px` : '0px';
    px.style.top = first ? `${first.y}px` : '0px';
    px.style.background = first ? first.color : 'transparent';
    px.style.boxShadow = shadows.join(',');
  }

  function validate(stageKey) {
    const stage = STAGES[stageKey];
    if (!stage) return [`unknown stage: ${stageKey}`];
    const errors = [];
    const w = stage.map[0].length;
    stage.map.forEach((row, i) => {
      if (row.length !== w) errors.push(`stage ${stageKey} row ${i}: width ${row.length} != ${w}`);
      const bad = row.split('').filter((ch) => ch !== '.' && !stage.palette[ch]);
      if (bad.length) errors.push(`stage ${stageKey} row ${i}: no color for chars ${[...new Set(bad)].join('')}`);
    });
    return errors;
  }

  return { STAGES, buildMap, renderInto, validate };
});
