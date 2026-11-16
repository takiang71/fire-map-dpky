// ตัวช่วยของชุดทดสอบ (ไม่ใช่ไฟล์เทสต์): ดึงโค้ดจาก index.html มาทดสอบใน Node · ตัวสุ่มแบบกำหนดค่าเริ่มได้
const fs = require('fs'), path = require('path'), assert = require('node:assert');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ข้อความโค้ดที่ตรงกับ re (กลุ่มที่ 1 ถ้ามี) — ไม่เจอ = เทสต์ล้ม พร้อมบอกว่าหาอะไรไม่เจอ (ชื่อฟังก์ชันในหน้าเว็บถูกเปลี่ยน)
function grab(re, html = HTML) {
  const m = html.match(re);
  assert.ok(m, 'ไม่พบโค้ดใน index.html: ' + re);
  return m[1] !== undefined ? m[1] : m[0];
}
// รันโค้ดที่ดึงมาในขอบเขตแยก แล้วคืนตัวแปรตามชื่อใน names · env = ตัวแปรที่โค้ดอ้างถึง (เช่น DIC, Date)
function load(src, names, env = {}) {
  const k = Object.keys(env);
  return new Function(...k, `${src}\n;return {${names.join(',')}};`)(...k.map(x => env[x]));
}
// ตัวสุ่ม mulberry32 (ผลเหมือนเดิมทุกรอบ)
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 };
}

// ไฟล์ .xlsx อย่างง่ายจากแถว (ชีตเดียว, inlineStr/ตัวเลข) — ทดสอบตัวนำเข้า Excel โดยไม่ต้องมีไฟล์จริง
const zlib = require('zlib');
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 });
const crc32 = b => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 };
function zip(files) {
  const loc = [], cen = []; let off = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw), nm = Buffer.from(name, 'utf8'), crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, nm, data); cen.push(c, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const col = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + i % 26);
function xlsx(rows) {
  const sh = rows.map((r, y) => `<row r="${y + 1}">` + r.map((v, x) => v == null ? '' : typeof v === 'number' ? `<c r="${col(x)}${y + 1}"><v>${v}</v></c>` : `<c r="${col(x)}${y + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('') + '</row>').join('');
  return zip([['[Content_Types].xml', '<?xml version="1.0"?><Types/>'], ['xl/workbook.xml', `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>'], ['xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet ${NS}><sheetData>${sh}</sheetData></worksheet>`]]);
}
module.exports = { ROOT, HTML, grab, load, rng, zip, xlsx, fixture: f => path.join(__dirname, 'fixtures', f) };
