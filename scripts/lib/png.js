// เขียน PNG แบบพาเลต (8 บิต) ไม่ต้องติดตั้งแพ็กเกจ — ใช้ทำไทล์แผนที่ของ sync_fuel.js
const zlib = require('zlib');
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c });
const crc = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 };
function chunk(type, data) {
  const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
// px = Uint8Array w*h ของลำดับสีในพาเลต · pal = ['#rrggbb', …] · alpha = ความทึบต่อสี (0–255) เช่น สี 0 โปร่งใส
function palettePNG(w, h, px, pal, alpha) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 3;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; raw.set(px.subarray(y * w, y * w + w), y * (w + 1) + 1) }
  const P = Buffer.from(pal.flatMap(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('PLTE', P), chunk('tRNS', Buffer.from(alpha)),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { palettePNG };
