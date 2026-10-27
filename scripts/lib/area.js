// แนวเขตกลุ่มป่า (อ่าน GEO จาก index.html) + ตรวจว่าจุดอยู่ในพื้นที่ไหน — ใช้ร่วมกันโดย sync_hotspots.js และ build_site.js
// ตรรกะเดียวกับ inFeat/geoAt ใน index.html
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const H = path.join(ROOT, 'index.html');
const html = fs.readFileSync(H, 'utf8');
const block = id => html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
const GEO = JSON.parse(block('geo')[1].split('<\\/').join('</'));

const inside = (q, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > q[1]) !== (r[j][1] > q[1]) && q[0] < (r[j][0] - r[i][0]) * (q[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c };
const inFeat = (q, f) => f.geometry.coordinates.some(p => inside(q, p[0]) && !p.slice(1).some(r => inside(q, r)));
const ALL = [...GEO.cons.features, ...GEO.resp.features];
const BB = ALL.reduce((b, f) => { f.geometry.coordinates.forEach(p => p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) })); return b }, [1e9, 1e9, -1e9, -1e9]);
// ชื่อให้ตรงกับ dictionary ของข้อมูล Excel
const AR = { 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าโคกสูง': 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมการ)', 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าเขาฉกรรจ์': 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)' };
function where(lon, lat) {
  if (lon < BB[0] || lon > BB[2] || lat < BB[1] || lat > BB[3]) return null;
  const q = [lon, lat], c = GEO.cons.features.find(f => inFeat(q, f)), r = GEO.resp.features.filter(f => inFeat(q, f));
  if (!c && !r.length) return null;
  const main = r.find(f => !/พื้นที่รอง/.test(f.properties.station)) || r[0];
  return {
    ar: c ? AR[c.properties.name] || c.properties.name : 'นอกพื้นที่อนุรักษ์',
    st: main ? main.properties.station.replace(/\s*\(พื้นที่รอง\)/, '').trim() : 'ไม่มี',
    sb: (c || main).properties.paro,
  };
}

// สบอ. แยกตามจังหวัดที่เกิดจุด (ผู้ใช้กำหนด) · จังหวัดอื่น/ไม่ระบุ ใช้ตามแนวเขต
const SBP = { 'ปราจีนบุรี': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)', 'นครนายก': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)', 'สระแก้ว': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)', 'สระบุรี': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 สาขาสระบุรี', 'นครราชสีมา': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)', 'บุรีรัมย์': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)' };

module.exports = { ROOT, H, html, block, GEO, where, SBP };
