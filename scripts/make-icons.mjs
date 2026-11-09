/**
 * Generates the PNG app icons with no dependencies.
 * Run: node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'assets');
mkdirSync(outDir, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- tiny PNG encoder ---------- */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);

  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- icon artwork ---------- */

function draw(size) {
  const SS = 3; // supersample factor
  const W = size * SS;
  const buffer = Buffer.alloc(W * W * 4);
  const center = W / 2;

  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const nx = x / W;
      const ny = y / W;

      // Warm paper base.
      const t = Math.min(1, Math.max(0, nx * 0.45 + ny * 0.55));
      let r = lerp(246, 224, t);
      let g = lerp(238, 211, t);
      let b = lerp(222, 187, t);

      // Faint vermilion bloom in the upper right.
      const gx = nx - 0.78;
      const gy = ny - 0.18;
      const glow = Math.max(0, 1 - Math.sqrt(gx * gx + gy * gy) / 0.62);
      const glowPower = glow * glow;
      r += 8 * glowPower;
      g -= 12 * glowPower;
      b -= 20 * glowPower;

      const dx = x - center;
      const dy = y - center;
      const radius = Math.sqrt(dx * dx + dy * dy);

      // Ink ring.
      if (Math.abs(radius - 0.305 * W) < 0.018 * W) {
        r = lerp(r, 25, 0.92);
        g = lerp(g, 20, 0.92);
        b = lerp(b, 16, 0.92);
      }

      // Four-point star (astroid) inside the ring.
      const ax = Math.abs(dx) / (0.175 * W);
      const ay = Math.abs(dy) / (0.175 * W);
      const inStar = Math.pow(ax, 2 / 3) + Math.pow(ay, 2 / 3) <= 1;

      if (inStar) {
        r = lerp(r, 193, 0.94);
        g = lerp(g, 59, 0.94);
        b = lerp(b, 39, 0.94);
      }

      buffer[i] = clamp(r);
      buffer[i + 1] = clamp(g);
      buffer[i + 2] = clamp(b);
      buffer[i + 3] = 255;
    }
  }

  // Downsample for smooth edges.
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          r += buffer[i];
          g += buffer[i + 1];
          b += buffer[i + 2];
        }
      }

      const n = SS * SS;
      const o = (y * size + x) * 4;

      out[o] = clamp(r / n);
      out[o + 1] = clamp(g / n);
      out[o + 2] = clamp(b / n);
      out[o + 3] = 255;
    }
  }

  return out;
}

for (const size of [192, 512]) {
  const rgba = draw(size);
  const png = encodePng(size, size, rgba);
  const target = join(outDir, 'icon-' + size + '.png');
  writeFileSync(target, png);
  console.log('wrote ' + target + ' (' + png.length + ' bytes)');
}
