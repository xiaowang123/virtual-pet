'use strict';

// 解码浏览器截图 PNG, 做像素级颜色校验:
//   1) 指定颜色是否存在 (证明对应元素渲染成功)
//   2) 宠物主体色像素的包围盒/数量 (证明像素画形态完整)
//   3) 包围盒内不同颜色数 (颜色数少 = 像素画清晰无糊边)
// 用法: node scripts/verify-png.js <png> '<hex 颜色名 JSON>' [主体色hex] [扫描区域 x0 y0 x1 y1 比例]
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
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported png: bitDepth=${bitDepth} interlace=${interlace}`);
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

const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const near = (p, c, tol) => Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;

function scan(img, cb, x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
  const sx = Math.floor(img.width * x0), ex = Math.floor(img.width * x1);
  const sy = Math.floor(img.height * y0), ey = Math.floor(img.height * y1);
  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      const i = (y * img.width + x) * img.channels;
      cb(x, y, [img.data[i], img.data[i + 1], img.data[i + 2]]);
    }
  }
}

function main() {
  const [file, colorsJson, mainHex, regionJson] = process.argv.slice(2);
  const img = decodePNG(fs.readFileSync(file));
  const report = { file: file.split('/').pop(), size: `${img.width}x${img.height}` };

  const colors = JSON.parse(colorsJson);
  const tol = 8;
  report.colors = {};
  for (const [name, h] of Object.entries(colors)) {
    let found = null;
    scan(img, (x, y, p) => { if (!found && near(p, hex(h), tol)) found = [x, y]; });
    report.colors[name] = found ? `✓ (${found[0]},${found[1]})` : '✗ 缺失';
  }

  if (mainHex && regionJson) {
    const c = hex(mainHex);
    const [x0, y0, x1, y1] = JSON.parse(regionJson);
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0;
    const uniq = new Set();
    scan(img, (x, y, p) => {
      if (near(p, c, tol)) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        uniq.add(`${p[0]},${p[1]},${p[2]}`);
      }
    }, x0, y0, x1, y1);
    report.blob = count
      ? { pixels: count, bbox: [minX, minY, maxX, maxY], w: maxX - minX + 1, h: maxY - minY + 1, ratio: +((maxX - minX + 1) / (maxY - minY + 1)).toFixed(2) }
      : { pixels: 0 };
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
