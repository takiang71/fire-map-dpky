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
// อ่าน PNG 8 บิต (เทา/RGB/พาเลต/เทา+อัลฟา/RGBA ไม่สลับแถว) → {w,h,d: Uint8Array RGBA} — ใช้อ่านกราฟของกรมอุตุฯ (sync_tmdvr.js)
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ไม่ใช่ไฟล์ PNG');
  let p = 8, w, h, bd, ct, il, pal, trns; const idat = [];
  while (p < buf.length) {
    const n = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + n); p += 12 + n;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12] }
    else if (t === 'PLTE') pal = d; else if (t === 'tRNS') trns = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
  }
  if (bd !== 8 || il) throw new Error(`PNG แบบที่ไม่รองรับ (bit ${bd}, interlace ${il})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!ch) throw new Error('ชนิดสี PNG ไม่รองรับ ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = w * ch, px = Buffer.alloc(st * h), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], s = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), o = y * st;
    for (let x = 0; x < st; x++) {
      const a = x >= ch ? px[o + x - ch] : 0, b = y ? px[o - st + x] : 0, c = x >= ch && y ? px[o - st + x - ch] : 0;
      let v = s[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      px[o + x] = v & 255;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, o = i * 4;
    if (ct === 3) { const k = px[s]; out[o] = pal[k * 3]; out[o + 1] = pal[k * 3 + 1]; out[o + 2] = pal[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255 }
    else if (ct === 0 || ct === 4) { out[o] = out[o + 1] = out[o + 2] = px[s]; out[o + 3] = ct === 4 ? px[s + 1] : 255 }
    else { out[o] = px[s]; out[o + 1] = px[s + 1]; out[o + 2] = px[s + 2]; out[o + 3] = ct === 6 ? px[s + 3] : 255 }
  }
  return { w, h, d: out };
}
module.exports = { palettePNG, decodePNG };
