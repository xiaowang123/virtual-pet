'use strict';

// 探测截图区域内的主要颜色, 用于校准校验容差
// 用法: node scripts/probe-png.js <png> <x0> <y0> <x1> <y1> [topN]
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  let pos = 8, width, height, bitDepth, colorType, interlace;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported: bitDepth=${bitDepth} interlace=${interlace}`);
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colorType=${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.slice(rp, rp + stride);
    rp += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) throw new Error(`bad filter ${filter}`);
      cur[x] = v;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, channels, data: out };
}

const [file, x0s, y0s, x1s, y1s, topNs] = process.argv.slice(2);
const img = decodePNG(fs.readFileSync(file));
// 坐标: 全部 <=1 视为 0-1 比例, 否则视为绝对像素
const toPx = (v, size) => (v <= 1 ? Math.floor(size * v) : Math.floor(v));
const x0 = toPx(+x0s, img.width), x1 = toPx(+x1s, img.width);
const y0 = toPx(+y0s, img.height), y1 = toPx(+y1s, img.height);
if (x1 <= x0 || y1 <= y0 || x1 > img.width || y1 > img.height) {
  throw new Error(`非法区域: (${x0},${y0})-(${x1},${y1}) in ${img.width}x${img.height}`);
}
const topN = +(topNs || 8);
const counts = new Map();
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * img.channels;
    const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
console.log(`区域 (${x0},${y0})-(${x1},${y1}) 主要颜色:`);
top.forEach(([k, n]) => console.log(`  rgb(${k}) × ${n}`));
