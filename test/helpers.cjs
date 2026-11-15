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
module.exports = { ROOT, HTML, grab, load, rng, fixture: f => path.join(__dirname, 'fixtures', f) };
