// Generates PWA icons with zero dependencies: a dark tile with an accent
// delta (Δ) triangle. Emits public/icon-192.png, icon-512.png, apple-touch-icon.png.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [11, 15, 20]; // --bg  #0b0f14
const FG = [76, 141, 255]; // --accent #4c8dff

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  // Delta triangle vertices.
  const cx = size / 2;
  const top = size * 0.2;
  const bottom = size * 0.78;
  const half = size * 0.3;
  const ax = cx, ay = top;
  const bx = cx - half, by = bottom;
  const dx = cx + half, dy = bottom;

  const inTri = (px, py) => {
    const s = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const t = (dx - bx) * (py - by) - (dy - by) * (px - bx);
    const u = (ax - dx) * (py - dy) - (ay - dy) * (px - dx);
    return (s <= 0 && t <= 0 && u <= 0) || (s >= 0 && t >= 0 && u >= 0);
  };

  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter type 0 (none)
    for (let x = 0; x < size; x++) {
      const c = inTri(x + 0.5, y + 0.5) ? FG : BG;
      raw[o++] = c[0];
      raw[o++] = c[1];
      raw[o++] = c[2];
      raw[o++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(`public/${name}`, png(size));
  console.log(`wrote public/${name}`);
}
