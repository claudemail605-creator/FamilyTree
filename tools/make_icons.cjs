#!/usr/bin/env node
/* =====================================================================
   Generate the web-app icons (Phase 6, item 6).

   No image library is used: the pixels are drawn by hand and written as PNG
   with Node's built-in zlib. Re-run after changing the colours:

     node tools/make_icons.cjs

   Produces icons/icon-192.png, icons/icon-512.png and
   icons/icon-maskable-512.png (the maskable one keeps the drawing inside the
   safe circle Android crops to).
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'icons');

/* ------------------------------- PNG writer ------------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;        // bit depth
  ihdr[9] = 6;        // colour type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

/* -------------------------------- drawing -------------------------------- */
const ACCENT = [31, 111, 107];     // --accent
const CREAM = [245, 243, 238];     // --bg

// A small three-person tree: two children joined to one parent.
function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const alpha = a == null ? 1 : a;
    px[i] = Math.round(px[i] * (1 - alpha) + rgb[0] * alpha);
    px[i + 1] = Math.round(px[i + 1] * (1 - alpha) + rgb[1] * alpha);
    px[i + 2] = Math.round(px[i + 2] * (1 - alpha) + rgb[2] * alpha);
    px[i + 3] = 255;
  };
  const circle = (cx, cy, r, rgb) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r - 1) put(x, y, rgb, 1);
        else if (d <= r) put(x, y, rgb, r - d);      // one-pixel soft edge
      }
    }
  };
  const bar = (x0, y0, x1, y1, t, rgb) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
      for (let dy = -t; dy <= t; dy += 0.5) {
        for (let dx = -t; dx <= t; dx += 0.5) {
          const d = Math.hypot(dx, dy);
          if (d <= t) put(Math.round(x + dx), Math.round(y + dy), rgb, d > t - 1 ? t - d : 1);
        }
      }
    }
  };

  // background: rounded square (full bleed for maskable icons)
  const r = maskable ? size * 0.5 : size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const d = Math.hypot(dx, dy);
      if (d <= r - 1) put(x, y, ACCENT, 1);
      else if (d <= r) put(x, y, ACCENT, r - d);
      else if (maskable) put(x, y, ACCENT, 1);        // maskable icons fill the square
    }
  }

  // the tree
  const s = size / 100;
  const ink = CREAM;
  circle(50 * s, 26 * s, 9 * s, ink);                 // parent
  circle(26 * s, 70 * s, 8 * s, ink);                 // child one
  circle(74 * s, 70 * s, 8 * s, ink);                 // child two
  bar(50 * s, 34 * s, 50 * s, 52 * s, 2.6 * s, ink);
  bar(26 * s, 52 * s, 74 * s, 52 * s, 2.6 * s, ink);
  bar(26 * s, 52 * s, 26 * s, 62 * s, 2.6 * s, ink);
  bar(74 * s, 52 * s, 74 * s, 62 * s, 2.6 * s, ink);
  return px;
}

/* --------------------------------- build --------------------------------- */
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true]
];
jobs.forEach(([name, size, maskable]) => {
  const bytes = writePng(path.join(outDir, name), size, size, draw(size, maskable));
  console.log(name + ': ' + size + 'x' + size + ', ' + bytes + ' bytes');
});
