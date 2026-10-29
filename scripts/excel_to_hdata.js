// อ่าน Excel จุดความร้อนย้อนหลัง (ชีตแรก, คอลัมน์ตามไฟล์ DPKY61-69) แล้วเข้ารหัสแบบ dictionary ฝังลง index.html (id="hdata")
// ใช้ dictionary เดิมเป็นฐานเพื่อให้ลำดับเดิมคงที่ · รัน: node scripts/excel_to_hdata.js [ไฟล์.xlsx]
// หลังรันแล้วให้รัน node scripts/sync_hotspots.js เพื่อจับคู่ dnp ของ adata กับข้อมูลใหม่ (ไม่งั้นจุดที่เพิ่มจะถูกนับซ้ำใน HD)
const fs = require('fs'), path = require('path');
const { readXlsx } = require('./lib/xlsx');

const ROOT = path.join(__dirname, '..'), P = path.join(ROOT, 'index.html');
const X = process.argv[2] || path.join(ROOT, 'data', 'Data_hotspots_61-69_DPYK_Full2.xlsx');
const RE = /(<script type="application\/json" id="hdata">)([\s\S]*?)(<\/script>)/;
let h = fs.readFileSync(P, 'utf8');
const old = JSON.parse(h.match(RE)[2]);
const rows = readXlsx(X)[0].rows.slice(1).filter(r => r && r[1] != null);
const D = Object.fromEntries(['pv', 'am', 'tm', 'ar', 'ld', 'fu', 'st', 'sb'].map(k => [k, [...old[k]]]));
const str = v => v == null ? '' : String(v).trim();
// ชื่อที่ต้นฉบับสะกดต่างกันในแต่ละรอบ ให้เป็นชื่อเดียวกับ dictionary เดิม (ใช้เทียบกับแนวเขต/LINE)
const fix = {
  ar: v => v.replace(/^เตรียมการ(.+)$/, '$1 (เตรียมการ)'),
  fu: v => v.replace(/^เข้าตรวจสอบแล้วไม่พบไฟ$/, 'ตรวจสอบแล้วไม่พบไฟ'),
};
const idx = (k, v) => { v = fix[k] ? fix[k](str(v)) : str(v); let i = D[k].indexOf(v); if (i < 0) { i = D[k].length; D[k].push(v) } return i };
// เวลาในไฟล์เป็น ชม.นาที เช่น 13.58 (บางแถวเป็นข้อความ "02.34") · วันที่เป็นเลขวันของ Excel (บางแถวมีเศษเวลาติดมา)
const hhmm = t => { const [a, b] = (+t).toFixed(2).split('.'); return +a * 100 + +b };
// ปัดครึ่งไปหาเลขคู่แบบ round() ของ Python (สคริปต์เดิม) ให้ได้ค่าพิกัดเดิมทุกจุด
const e5 = v => { const x = v * 1e5, r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r };
const out = rows.map(r => [Math.floor(r[1]) - 25569, hhmm(r[2]), e5(r[3]), e5(r[4]),
  idx('pv', r[9]), idx('am', r[8]), idx('tm', str(r[7]) + '|' + str(r[8])), idx('ar', r[10]), idx('ld', r[14]), idx('fu', r[13]), idx('st', r[11]), idx('sb', r[12])]);

for (const k in D) if (D[k].length > old[k].length) console.log('ค่าใหม่ใน', k, D[k].slice(old[k].length));
// รวมชื่อสถานีที่สะกดต่างกัน (เว้นวรรครอบขีด) ให้เป็นชื่อเดียว
const first = {}; D.st.forEach((v, i) => { const k = v.replace(/\s/g, ''); if (!(k in first)) first[k] = i });
const keep = [...new Set(D.st.map(v => first[v.replace(/\s/g, '')]))].sort((a, b) => a - b), ni = new Map(keep.map((v, n) => [v, n]));
out.forEach(r => { r[10] = ni.get(first[D.st[r[10]].replace(/\s/g, '')]) }); D.st = keep.map(i => D.st[i]);

const o = old.r; let same = 0; while (same < o.length && same < out.length && String(out[same]) === String(o[same])) same++;
console.log('แถวเดิม', o.length, '→ ใหม่', out.length, '· เหมือนเดิมช่วงต้น', same, 'แถว');
const s = JSON.stringify({ ...D, r: out });
h = h.replace(RE, (_, a, __, b) => a + s + b);
fs.writeFileSync(P, h);
const fy = {}; out.forEach(r => { const d = new Date(r[0] * 864e5), y = d.getUTCFullYear() + 543 + (d.getUTCMonth() >= 9 ? 1 : 0); fy[y] = (fy[y] || 0) + 1 });
console.log('rows', out.length, 'ต่อปีงบ', fy);
