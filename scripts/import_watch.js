// นำเข้า "พื้นที่เฝ้าระวังเป็นพิเศษ" (ผู้ใช้ขอ 6 พ.ย. 69 — โรงเรียนนายร้อยพระจุลจอมเกล้า) จาก KMZ 2 ไฟล์ที่ผู้ใช้ส่ง
//   1) แนวเขตพื้นที่ (Polygon/MultiPolygon, description มี rai)
//   2) จุดความร้อนย้อนหลังในพื้นที่ (Point, description ตาราง ArcGIS: DATE d/m/พ.ศ., TIME hhmm, SATELLITE S|N|N20|N21, TUMBOON, AUMPER, PROVINCE, TYPE, NAME, FOREST Y|N)
// ใช้: node scripts/import_watch.js <แนวเขต.kmz> <จุดความร้อน.kmz> [--fy 2561-2569] [--id jpr] [--name "โรงเรียนนายร้อยพระจุลจอมเกล้า"] [--short จปร.]
// ผลลัพธ์: data/watch.json + ฝังใน index.html (<script type="application/json" id="wdata">) — ห้ามแก้มือ
//   {v, upd, areas:[{id,n,s,rai,src,bb,c:MultiPolygon}], sat[], tm[] ("ตำบล|อำเภอ|จังหวัด"), nm[] (NAME), ty[] (TYPE),
//    r:[[day, hhmm, lat*1e5, lon*1e5, sat, tm, nm, ty, forest 1/0, area index, ลำดับในต้นฉบับ]]}
//   นำเข้าพื้นที่ใหม่ด้วย --id อื่น = เพิ่มพื้นที่ (จุดของพื้นที่เดิมคงไว้) · --id เดิม = แทนที่
// จุดความร้อนปีงบปัจจุบันจาก API อยู่อีกบล็อก (wadata) สร้างโดย sync_hotspots.js
const fs = require('fs'), path = require('path');
const { unzip } = require('./lib/xlsx.js');

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const files = process.argv.slice(2).filter((a, i, A) => !a.startsWith('--') && !(A[i - 1] || '').startsWith('--'));
if (files.length < 2) { console.error('ใช้: node scripts/import_watch.js <แนวเขต.kmz> <จุดความร้อน.kmz> [--id jpr] [--name ชื่อ] [--short ชื่อย่อ]'); process.exit(1) }
const ID = arg('--id') || 'jpr', NAME = arg('--name') || 'โรงเรียนนายร้อยพระจุลจอมเกล้า', SHORT = arg('--short') || 'จปร.';
if (!/^[a-z0-9]+$/.test(ID)) throw new Error('--id ต้องเป็นตัวอักษรอังกฤษเล็ก/ตัวเลข');

const ROOT = path.join(__dirname, '..'), H = path.join(ROOT, 'index.html'), OUT = path.join(ROOT, 'data', 'watch.json');
const kml = f => { const b = fs.readFileSync(f); if (b[0] !== 0x50) return b.toString('utf8'); const z = unzip(b), k = Object.keys(z).find(n => /\.kml$/i.test(n)); if (!k) throw new Error('ไม่พบ .kml ใน ' + f); return z[k].toString('utf8') };
const attrs = p => { const o = {}, re = /<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g; let m; while ((m = re.exec(p))) o[m[1].trim()] = m[2].trim(); return o };
const ring = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number)).map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);

// --- 1) แนวเขต ---
const kb = kml(files[0]), polys = [];
let rai = 0;
for (const pm of kb.split('<Placemark').slice(1)) {
  const a = attrs(pm); rai += +a.rai || 0;
  for (const pg of pm.split('<Polygon').slice(1)) {
    const outer = (pg.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/) || [])[1];
    if (!outer) continue;
    const inner = [...pg.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/g)].map(m => ring(m[1]));
    polys.push([ring(outer), ...inner]);
  }
}
if (!polys.length) throw new Error('ไม่พบรูปหลายเหลี่ยมในไฟล์แนวเขต');
const inside = (q, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > q[1]) !== (r[j][1] > q[1]) && q[0] < (r[j][0] - r[i][0]) * (q[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c };
const inPoly = q => polys.some(p => inside(q, p[0]) && !p.slice(1).some(r => inside(q, r)));
const bb = polys.reduce((b, p) => { p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) }); return b }, [1e9, 1e9, -1e9, -1e9]);
// ไร่จากรูปหลายเหลี่ยม (ฉายแบบ equal-area อย่างง่ายรอบละติจูดกลาง) ใช้เมื่อไฟล์ไม่มี rai
if (!rai) { const k = Math.cos((bb[1] + bb[3]) / 2 * Math.PI / 180), A = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + (x * 111320 * k) * (y2 * 110574) - (x2 * 111320 * k) * (y * 110574) }, 0) / 2);
  rai = Math.round(polys.reduce((s, p) => s + A(p[0]) - p.slice(1).reduce((t, r) => t + A(r), 0), 0) / 1600) }

// --- 2) จุดความร้อนย้อนหลัง ---
const kh = kml(files[1]), D = { sat: [], tm: [], nm: [], ty: [] };
let W = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
if (W) for (const k in D) D[k] = W[k] || [];
const ix = (k, v) => { let n = D[k].indexOf(v); if (n < 0) { n = D[k].length; D[k].push(v) } return n };
const areas = W ? W.areas.filter(a => a.id !== ID) : [], ai = areas.length;
const keep = W ? W.r.filter(r => W.areas[r[9]] && W.areas[r[9]].id !== ID).map(r => [...r.slice(0, 9), areas.findIndex(a => a.id === W.areas[r[9]].id), r[10]]) : [];
const rows = [], out = [], bad = [];
for (const pm of kh.split('<Placemark').slice(1)) {
  const a = attrs(pm), c = (pm.match(/<Point>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/) || [])[1];
  const [lo, la] = c ? c.trim().split(',').map(Number) : [+a.LONGITUDE, +a.LATITUDE];
  const dm = String(a.DATE || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dm || !isFinite(la) || !isFinite(lo)) { bad.push(a.FID); continue }
  const y = +dm[3] > 2400 ? +dm[3] - 543 : +dm[3], day = Date.UTC(y, +dm[2] - 1, +dm[1]) / 864e5, t = +a.TIME || 0;
  if (t % 100 > 59 || t > 2359) { bad.push(a.FID); continue }
  if (!inPoly([lo, la])) out.push(a.FID);
  rows.push([day, t, Math.round(la * 1e5), Math.round(lo * 1e5), ix('sat', a.SATELLITE || 'ไม่ระบุ'), ix('tm', [a.TUMBOON, a.AUMPER, a.PROVINCE].map(v => (v || 'ไม่ระบุ').trim()).join('|')),
    ix('nm', a.NAME || 'ไม่ระบุ'), ix('ty', a.TYPE || a.OWN || 'ไม่ระบุ'), /^y/i.test(a.FOREST || '') ? 1 : 0, ai, +a['ลำด'] || 0]);
}
rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
// ช่วงปีงบของไฟล์ย้อนหลังตามชื่อไฟล์ (เช่น "hotspot_2561 to 2569" หรือ "Hotspot_61ถึง69") หรือ --fy 2561-2569 — กราฟรายปีแสดงปีที่ไม่มีจุดเป็น 0 และใช้หาค่าเฉลี่ยต่อปี
// รับทั้ง "2561 to 2569" และ "61ถึง69" (ปี 2 หลัก = 25xx)
const fm = ((arg('--fy') || path.basename(files[1])).match(/(?<!\d)(?:25)?(\d\d)\s*(?:to|-|–|ถึง)\s*(?:25)?(\d\d)(?!\d)/i) || []).slice(1).map(v => 2500 + +v);
areas.push({ id: ID, n: NAME, s: SHORT, rai, src: [path.basename(files[0]), path.basename(files[1])], ...(fm.length ? { fy: fm } : {}), bb: bb.map(v => +v.toFixed(5)), c: polys });
W = { v: 1, upd: new Date().toISOString().slice(0, 10), areas, ...D, r: [...keep, ...rows].sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
fs.writeFileSync(OUT, JSON.stringify(W));

const s = JSON.stringify(W).split('</').join('<\\/');
let h = fs.readFileSync(H, 'utf8');
if (/<script type="application\/json" id="wdata">/.test(h)) h = h.split(/<script type="application\/json" id="wdata">[\s\S]*?<\/script>/).join('<script type="application/json" id="wdata">' + s + '</script>');
else { const m = h.match(/<script type="application\/json" id="adata">[\s\S]*?<\/script>/); if (!m) throw new Error('ไม่พบบล็อก adata ใน index.html'); h = h.split(m[0]).join(m[0] + '\n<script type="application/json" id="wdata">' + s + '</script>') }
fs.writeFileSync(H, h);

const fy = {}; rows.forEach(r => { const d = new Date(r[0] * 864e5), f = d.getUTCFullYear() + 543 + (d.getUTCMonth() >= 9 ? 1 : 0), k = f + ' ' + D.sat[r[4]]; fy[k] = (fy[k] || 0) + 1 });
console.log(`${NAME} (${ID}): แนวเขต ${polys.length} รูป ${rai.toLocaleString()} ไร่ · จุดความร้อน ${rows.length} จุด` + (out.length ? ` (นอกแนวเขต ${out.length} จุด — เก็บไว้ตามไฟล์ต้นฉบับ)` : '') + (bad.length ? ` · ข้าม ${bad.length} แถว (วันที่/พิกัดใช้ไม่ได้)` : ''));
console.log('ปีงบ × ดาวเทียม', JSON.stringify(fy));
console.log('data/watch.json', (fs.statSync(OUT).size / 1024).toFixed(1), 'KB · ฝังใน index.html', (s.length / 1024).toFixed(1), 'KB');
