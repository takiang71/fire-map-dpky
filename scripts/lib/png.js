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
// อ่าน PNG 8 บิต ไม่สลับแถว (เทา/RGB/พาเลต/เทา+อัลฟา/RGBA) → {w, h, rgba: Uint8Array w*h*4} — ใช้อ่านไทล์ความสูง Terrarium (fire_model_eval.js)
function readPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ไม่ใช่ไฟล์ PNG');
  let o = 8, w, h, bd, ct, il, pal = null, trn = null; const idat = [];
  while (o < buf.length) {
    const n = buf.readUInt32BE(o), t = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + n); o += 12 + n;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12] }
    else if (t === 'PLTE') pal = d; else if (t === 'tRNS') trn = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
  }
  if (bd !== 8 || il) throw new Error('รองรับเฉพาะ PNG 8 บิต ไม่สลับแถว');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!ch) throw new Error('ชนิดสี PNG ไม่รองรับ: ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = w * ch, px = Buffer.alloc(st * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], s = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), c = px.subarray(y * st, (y + 1) * st), p = y ? px.subarray((y - 1) * st, y * st) : null;
    for (let i = 0; i < st; i++) {
      const a = i >= ch ? c[i - ch] : 0, b = p ? p[i] : 0, q = p && i >= ch ? p[i - ch] : 0;
      let v = s[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const e = a + b - q, pa = Math.abs(e - a), pb = Math.abs(e - b), pc = Math.abs(e - q); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : q }
      c[i] = v & 255;
    }
  }
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    if (ct === 2) { out[k] = px[i * 3]; out[k + 1] = px[i * 3 + 1]; out[k + 2] = px[i * 3 + 2]; out[k + 3] = 255 }
    else if (ct === 6) out.set(px.subarray(i * 4, i * 4 + 4), k);
    else if (ct === 3) { const j = px[i]; out[k] = pal[j * 3]; out[k + 1] = pal[j * 3 + 1]; out[k + 2] = pal[j * 3 + 2]; out[k + 3] = trn && j < trn.length ? trn[j] : 255 }
    else { const g = px[i * (ct === 4 ? 2 : 1)]; out[k] = out[k + 1] = out[k + 2] = g; out[k + 3] = ct === 4 ? px[i * 2 + 1] : 255 }
  }
  return { w, h, rgba: out };
}
// เขียน PNG RGB 8 บิต (rgb = Uint8Array w*h*3) เลือกฟิลเตอร์รายแถวแบบผลรวมค่าสัมบูรณ์น้อยสุด — ใช้ทำไทล์ความสูง Terrarium (build_dem15.js)
function rgbPNG(w, h, rgb) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const st = w * 3, raw = Buffer.alloc((st + 1) * h), tmp = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const c = rgb.subarray(y * st, y * st + st), p = y ? rgb.subarray((y - 1) * st, y * st) : null;
    let best = -1, bs = Infinity;
    for (let f = 0; f < 5; f++) {
      let s = 0;
      for (let i = 0; i < st; i++) {
        const a = i >= 3 ? c[i - 3] : 0, b = p ? p[i] : 0, q = p && i >= 3 ? p[i - 3] : 0;
        let pr = 0;
        if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
        else if (f === 4) { const e = a + b - q, pa = Math.abs(e - a), pb = Math.abs(e - b), pc = Math.abs(e - q); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : q }
        const v = (c[i] - pr) & 255; tmp[i] = v; s += v < 128 ? v : 256 - v;
      }
      if (s < bs) { bs = s; best = f; raw[y * (st + 1)] = f; tmp.copy(raw, y * (st + 1) + 1) }
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// ความสูง (ม.) → Terrarium RGB · q = ปัดเป็นช่วงละ q ม. (ไฟล์เล็กลง) · NaN = 0 ม.
function terrariumRGB(e, q) {
  const n = e.length, o = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    let v = e[i]; if (!Number.isFinite(v)) v = 0; if (q) v = Math.round(v / q) * q;
    v = Math.min(Math.max(v + 32768, 0), 65535.99);
    const r = Math.floor(v / 256), g = Math.floor(v) - r * 256, b = Math.min(255, Math.round((v - Math.floor(v)) * 256));
    o[i * 3] = r; o[i * 3 + 1] = g; o[i * 3 + 2] = b;
  }
  return o;
}
module.exports = { palettePNG, readPNG, rgbPNG, terrariumRGB };
