// นำเข้า shapefile จุด UTM ใน .zip ที่ผู้ใช้ส่ง 5 พ.ย. 69: "ที่ตั้งหน่วยพิทักษ์ จุดสกัด และฐานเฉพาะกิจ" → data/ranger.json · "พิกัดฐานป้องกันรักษาป่า" → data/fbase.json (เลือกตามฟิลด์ใน DBF)
// node scripts/import_rangers.js <ไฟล์.zip>
// ฟิลด์ DBF (UTF-8): nationalpa, station_na, short_name, remark (ที่ทำการ|หน่วยพิทักษ์|จุดสกัด|ฐานเฉพาะกิจ), Name, TUM, AMP, PROV
// ใช้พิกัดจากเรขาคณิตใน .shp (ทุกจุดเป็น UTM 47N ตาม .prj) — ช่อง X/Y ใน DBF บางแถวเป็นโซน 48 หรือ 0 จึงไม่ใช้
const fs = require('fs');
const path = require('path');
const { unzip } = require('./lib/xlsx.js');
const { utmToLL } = require('./lib/tiff.js');

const zip = process.argv[2];
if (!zip) { console.error('ใช้: node scripts/import_rangers.js <ไฟล์.zip>'); process.exit(1) }
const Z = unzip(fs.readFileSync(zip));
const find = ext => { const k = Object.keys(Z).find(n => n.toLowerCase().endsWith(ext)); if (!k) throw new Error('ไม่พบ ' + ext); return Z[k] };
const prj = find('.prj').toString();
const zone = +((prj.match(/UTM_Zone_(\d+)N/i) || [])[1] || 0);
if (!zone) throw new Error('.prj ไม่ใช่ UTM ซีกโลกเหนือ: ' + prj.slice(0, 80));
const shp = find('.shp'), dbf = find('.dbf');
const pts = []; let p = 100;
while (p < shp.length) { const len = shp.readInt32BE(p + 4) * 2, t = shp.readInt32LE(p + 8); pts.push(t === 1 ? [shp.readDoubleLE(p + 12), shp.readDoubleLE(p + 20)] : null); p += 8 + len }
const n = dbf.readUInt32LE(4), hl = dbf.readUInt16LE(8), rl = dbf.readUInt16LE(10), F = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) F.push({ n: dbf.slice(o, o + 11).toString('latin1').replace(/\0.*$/, ''), l: dbf[o + 16] });
// ชุดข้อมูลแยกตามฟิลด์: station_na = หน่วยพิทักษ์ฯ → data/ranger.json · ban = "พิกัดฐานป้องกันรักษาป่า" (ผู้ใช้ส่ง 5 พ.ย. 69) → data/fbase.json
const fbase = F.some(f => f.n === 'ban');
const feats = [];
for (let i = 0; i < n; i++) {
  let o = hl + i * rl + 1; const r = {};
  for (const f of F) { r[f.n] = dbf.slice(o, o + f.l).toString('utf8').trim(); o += f.l }
  if (!pts[i]) continue;
  const [lo, la] = utmToLL(pts[i][0], pts[i][1], zone);
  const properties = fbase
    ? { n: r.name, s: r.name.replace(/^ฐานปฏิบัติการป้องกันรักษาป่า/, 'ฐานฯ '), t: 'ฐานป้องกันรักษาป่า', p: r.note, ban: r.ban, mo: +r.mo || 0, tam: r.tambon, amp: r.amphoe === 'เมือง' && r.province ? 'เมือง' + r.province : r.amphoe, prov: r.province, utm: [r.zone, +r.x, +r.y] }
    : { n: r.station_na, s: r.short_name || r.Name || r.station_na, t: r.remark, p: r.nationalpa, tam: r.TUM, amp: r.AMP, prov: r.PROV };
  feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [+lo.toFixed(6), +la.toFixed(6)] }, properties });
}
const T = {}; feats.forEach(f => T[f.properties.t] = (T[f.properties.t] || 0) + 1);
const out = path.join(__dirname, '..', 'data', fbase ? 'fbase.json' : 'ranger.json');
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', src: path.basename(zip), features: feats }));
console.log(path.basename(out), feats.length, 'จุด', JSON.stringify(T), fs.statSync(out).size, 'ไบต์');
