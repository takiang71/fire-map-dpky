// ชั้นชนิดป่า (กรมป่าไม้ "โครงการจัดทำข้อมูลสภาพพื้นที่ป่าไม้ ปี พ.ศ. 2560-2561" shapefile ชนิดป่า 2561) → data/ftype/ftype.json
// รันมือ: node scripts/build_ftype.js [--shp <ไฟล์ .shp ไม่ต้องใส่นามสกุล>] [--px <ขนาดเซลล์ ม. ค่าเริ่มต้น 50>]
//
// ใช้ shapefile foresttypes2561_wgs1984 อย่างเดียว (ผู้ใช้เลือก 4 พ.ย. 69) — ทั้งชนิดป่าและขอบเขตป่า/ไม่ใช่ป่า
// (ไม่ระบุ --shp → แตก .rar "โครงการจัดทำข้อมูลสภาพพื้นที่ป่าไม้ ปี พ.ศ. 2560-2561" ใน data/ ด้วย tar.exe ของ Windows ซึ่งอ่าน RAR ได้)
// shapefile เป็น UTM 47N, DBF UTF-8: ftype_thai (ชื่อชนิด), f_code 10 = ป่า / 90 = ไม่ใช่ป่า · แปลงไม่ซ้อนกัน
// ระบายเซลล์จากจุดกลางเซลล์ (คู่-คี่ ทุกวงของแปลง วงใน = รู)
//
// ผล: { z:47, x0,y0 (มุมซ้ายบน UTM), px, w,h, cn[], col[], r: แถวละ run-length [ยาว,ค่า,…]
//       (ค่า = ชนิด | 128 ถ้าอยู่ในแนวเขต cons/resp · 0 = ไม่ใช่ป่า — กริดครอบป่านอกแนวเขตด้วย ใช้กับโมเดลไฟ/ป๊อปอัป),
//       ar[], st[], s:{"ar|st":[ไร่ต่อชนิด]}, e:[0,0] (รูปแบบเดิมมีการเติมชนิด — ชุดนี้ไม่มี) }
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { llToUTM } = require('./lib/tiff');
const { ROOT, GEO } = require('./lib/area');
const { ARN, STN, rasterize, writeSafe } = require('./lib/tamroypao');

const arg = k => { const a = process.argv.indexOf(k); return a > 0 ? process.argv[a + 1] : null };
const OUT = path.join(ROOT, 'data', 'ftype', 'ftype.json'), PX = +(arg('--px') || 50), RAI = PX * PX / 1600;
// ชนิดป่าและสี (ลำดับคงเดิม — หน้าเว็บ/โมเดลไฟอ้างด้วย index: FTF, FTX · index 1 แหล่งน้ำ ชุด 2561 ไม่มี)
const CL = [null, ['แหล่งน้ำ', '#00a8e6'], ['ป่าดิบชื้น', '#267300'], ['ป่าดิบแล้ง', '#38a800'], ['ป่าดิบเขา', '#4ce600'], ['ป่าบึงน้ำจืด', '#ff5500'],
  ['ป่าเบญจพรรณ', '#a87000'], ['ป่าเต็งรัง', '#e69800'], ['ป่าไผ่', '#ffd37f'], ['สวนป่าสัก', '#e6e600'], ['สวนป่าอื่น ๆ', '#f57ab6'],
  ['ป่าที่ฟื้นฟูตามธรรมชาติ', '#444f89'], ['ป่าทุ่ง', '#ffff73'], ['สังคมพืชลานหิน', '#c29ed7']];
const KEY = n => n.replace(/\s/g, ''), CLK = CL.map(c => c ? KEY(c[0]) : '');

function shpPath() {
  if (arg('--shp')) return arg('--shp');
  const rar = fs.readdirSync(path.join(ROOT, 'data')).find(f => /2560-2561.*\.rar$/i.test(f));
  if (!rar) throw new Error('ไม่พบ shapefile ชนิดป่า 2561 — ใส่ --shp <ไฟล์> หรือวาง "โครงการจัดทำข้อมูลสภาพพื้นที่ป่าไม้ ปี พ.ศ. 2560-2561.rar" ไว้ใน data/');
  const tmp = path.join(os.tmpdir(), 'ftype2561'), base = path.join(tmp, 'foresttypes2561_wgs1984');
  if (!['.shp', '.shx', '.dbf'].every(e => fs.existsSync(base + e))) {
    fs.mkdirSync(tmp, { recursive: true }); console.log('แตกไฟล์', rar, '→', tmp);
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', path.join(ROOT, 'data', rar), '-C', tmp, ...['.shp', '.shx', '.dbf', '.prj'].map(e => 'foresttypes2561_wgs1984' + e)]);
  }
  return base;
}
// DBF: คืนฟังก์ชันอ่านช่องของระเบียน i (UTF-8)
function dbf(file) {
  const b = fs.readFileSync(file), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10), F = {};
  for (let p = 32, off = 1; b[p] !== 0x0d; p += 32) { F[b.toString('latin1', p, p + 11).replace(/\0.*$/, '')] = [off, b[p + 16]]; off += b[p + 16] }
  return (i, k) => b.toString('utf8', hl + i * rl + F[k][0], hl + i * rl + F[k][0] + F[k][1]).trim();
}
// ระบายรูปหลายวง (พิกัดกริด) ที่กลางเซลล์ แบบคู่-คี่ — แบ่งขอบลงแถวก่อน (แปลงป่าใหญ่มีจุดยอดหลายหมื่น)
function fillRings(R, w, h, cb) {
  const rows = new Map();
  for (const r of R) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
    const [xa, y1] = r[a], [xb, y2] = r[b]; if (y1 === y2) continue;
    for (let j = Math.max(0, Math.ceil(Math.min(y1, y2) - 0.5)), J = Math.min(h - 1, Math.ceil(Math.max(y1, y2) - 0.5) - 1); j <= J; j++) {
      let L = rows.get(j); if (!L) rows.set(j, L = []); L.push(xa + (j + 0.5 - y1) / (y2 - y1) * (xb - xa));
    }
  }
  for (const [j, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) { const a = Math.max(0, Math.ceil(xs[q] - 0.5)), b = Math.min(w - 1, Math.floor(xs[q + 1] - 0.5)); if (b >= a) cb(j * w + a, j * w + b + 1) }
  }
}

(() => {
  const t0 = Date.now();
  // กริด UTM 47N ครอบแนวเขต cons+resp
  const bb = [1e9, 1e9, -1e9, -1e9];
  [...GEO.cons.features, ...GEO.resp.features].forEach(f => f.geometry.coordinates.forEach(p => p[0].forEach(([x, y]) => { const [E, N] = llToUTM(x, y, 47); bb[0] = Math.min(bb[0], E); bb[1] = Math.min(bb[1], N); bb[2] = Math.max(bb[2], E); bb[3] = Math.max(bb[3], N) })));
  const x0 = Math.floor(bb[0] / PX) * PX, y0 = Math.ceil(bb[3] / PX) * PX, w = Math.ceil((bb[2] - x0) / PX), h = Math.ceil((y0 - bb[1]) / PX);
  const F = shpPath(), rec = dbf(F + '.dbf'), shx = fs.readFileSync(F + '.shx'), fd = fs.openSync(F + '.shp', 'r');
  const n = (shx.length - 100) / 8, hdr = Buffer.alloc(44), X1 = x0 + w * PX, Y0 = y0 - h * PX, g = new Uint8Array(w * h), bad = {};
  let used = 0;
  for (let i = 0; i < n; i++) {
    const off = shx.readInt32BE(100 + i * 8) * 2, len = shx.readInt32BE(104 + i * 8) * 2; fs.readSync(fd, hdr, 0, 44, off);
    if (hdr.readInt32LE(8) === 0) continue;
    const b = [12, 20, 28, 36].map(o => hdr.readDoubleLE(o)); if (b[0] > X1 || b[2] < x0 || b[1] > y0 || b[3] < Y0) continue;
    let c = 0;
    if (rec(i, 'f_code') === '10') { const nm = rec(i, 'ftype_thai'); c = CLK.indexOf(KEY(nm)); if (c < 2) { bad[nm] = (bad[nm] || 0) + 1; continue } }
    if (!c) continue; used++;
    const r = Buffer.alloc(len + 8); fs.readSync(fd, r, 0, len + 8, off);
    const np = r.readInt32LE(44), nt = r.readInt32LE(48), parts = [], base = 52 + np * 4; for (let k = 0; k < np; k++) parts.push(r.readInt32LE(52 + k * 4)); parts.push(nt);
    const R = []; for (let k = 0; k < np; k++) { const a = []; for (let j = parts[k]; j < parts[k + 1]; j++) a.push([(r.readDoubleLE(base + j * 16) - x0) / PX, (y0 - r.readDoubleLE(base + j * 16 + 8)) / PX]); R.push(a) }
    fillRings(R, w, h, (a, z) => g.fill(c, a, z));
  }
  fs.closeSync(fd);
  if (Object.keys(bad).length) throw new Error('ชนิดป่าที่ไม่รู้จัก: ' + JSON.stringify(bad));
  console.log(`shapefile 2561: แปลงป่าทับกริด ${used} แปลง · ${w} × ${h} เซลล์ ${PX} ม.`);
  // สถิติไร่ต่อชนิด แยกพื้นที่อนุรักษ์|สถานีฯ (ตรรกะเดียวกับ sync_burn/sync_fuel)
  const { ar, st } = rasterize({ w, h, x0, y0, px: [PX, PX] }, 47), s = {}, r = [];
  for (let k = 0; k < w * h; k++) if (g[k] && (ar[k] || st[k])) { const key = ar[k] + '|' + st[k], a = s[key] || (s[key] = Array(CL.length).fill(0)); a[g[k]] += RAI }
  for (const key in s) s[key] = s[key].map(v => Math.round(v));
  const val = k => g[k] ? g[k] | (ar[k] || st[k] ? 128 : 0) : 0;
  for (let j = 0; j < h; j++) {
    const row = []; let i = 0;
    while (i < w) { const v = val(j * w + i); let m = 1; while (i + m < w && val(j * w + i + m) === v) m++; row.push(m, v); i += m }
    if (row.length === 2 && row[1] === 0) row.length = 0; r.push(row);
  }
  const J = { v: 2, src: 'กรมป่าไม้ โครงการจัดทำข้อมูลสภาพพื้นที่ป่าไม้ ปี พ.ศ. 2560-2561 (ชนิดป่า 2561)', z: 47, x0, y0, px: PX, w, h,
    cn: CL.map(c => c ? c[0] : ''), col: CL.map(c => c ? c[1] : ''), ar: ARN, st: STN, s, e: [0, 0], maps: [], r };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); writeSafe(OUT, JSON.stringify(J));
  const tot = Array(CL.length).fill(0); Object.values(s).forEach(a => a.forEach((v, i) => tot[i] += v));
  console.log(tot.map((v, i) => [v, i]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).map(([v, i]) => CL[i][0] + ' ' + v.toLocaleString()).join(', '), '(ไร่ ในแนวเขต)');
  console.log(path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(0), 'KB ·', ((Date.now() - t0) / 1000).toFixed(0), 'วิ');
})();
