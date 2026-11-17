// F8 (17 พ.ย. 69) ข้อมูลเปิด: จุดความร้อนรายปีงบ → _site/open/hotspots_fy<ปีงบ>.csv + _site/open/index.json (เรียกจาก build_site.js ทุกรอบ site)
// คำอธิบายช่อง/เงื่อนไขใช้งาน → docs/api.md
//  หนึ่งแถว = หนึ่งจุดที่ดาวเทียมตรวจพบในแนวเขตกลุ่มป่า (ทุกดาวเทียม SNPP / NOAA-20 / NOAA-21):
//   · adata (API ไทย ThaiREN ตั้งแต่ 3 ส.ค. 2567 + NASA FIRMS ก่อนหน้า) + live.json ที่ยังไม่อยู่ใน adata (ปีงบปัจจุบัน)
//   · จุดกรมอุทยานฯ (hdata = Excel) จับคู่กับจุด SNPP ของ adata แบบ 1:1 (วันเดียวกัน ±10 นาที ระยะ <400 หน่วย 1e-5° — กติกาเดียวกับ sync_hotspots.js)
//     จับคู่ได้ = ช่อง in_dnp 1 + ช่องการจัดการเชื้อเพลิง/ประเภทพื้นที่ · ไม่มีคู่ = แถวแหล่ง "กรมอุทยานฯ (Excel)" ของมันเอง
//  ช่อง kpi = นับเป็นตัวชี้วัดกรมอุทยานฯ: ปีงบที่มี Excel → จุดกรมอุทยานฯ ที่การจัดการเชื้อเพลิง "ไม่มี" (= fuOK ในหน้าเว็บ / pfull ใน summary.json)
//    ปีงบที่ไม่มี Excel (ปีงบปัจจุบัน หรือปีที่ยังไม่นำเข้า = hdFill) → จุดของดาวเทียมตัวชี้วัด (indSat: SNPP ก่อน 2 พ.ย. 2569 แล้ว NOAA-20) = fyNow / summary.total
//  ช่อง dong_yai = ขสป.ดงใหญ่ (สบอ.7) ตามกติกา dyAS ของหน้าเว็บ — ค่าเริ่มต้นของหน้าเว็บ/LINE ไม่รวมแถวที่เป็น 1
//  ไม่มีข้อมูลส่วนบุคคล (ไม่รวมรายงาน F1/ชื่อผู้รายงาน/พิกัดสัตว์ป่า)
const fs = require('fs'), path = require('path');

const IND_SW = Date.UTC(2026, 10, 2) / 864e5, indSat = d => d < IND_SW ? 'SNPP' : 'NOAA20';
const SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const hKey = (d, t, la, lo) => d + '|' + t + '|' + Math.round(la * 1e3) + '|' + Math.round(lo * 1e3);
const DYR = /ดงใหญ่/, dyAS = (ar, st) => DYR.test(ar || '') || ((!ar || ar === 'นอกพื้นที่อนุรักษ์') && DYR.test(st || ''));
const fyOf = d => { const y = new Date(d * 864e5); return y.getUTCFullYear() + 543 + (y.getUTCMonth() >= 9 ? 1 : 0) };
const fy0 = F => Date.UTC(F - 544, 9, 1) / 864e5;
const iso = d => new Date(d * 864e5).toISOString().slice(0, 10), hm = t => String(Math.floor(t / 100)).padStart(2, '0') + ':' + String(t % 100).padStart(2, '0');
const mins = t => Math.floor(t / 100) * 60 + t % 100;
const SRC = { api: 'API ไทย (ThaiREN)', firms: 'NASA FIRMS', dnp: 'กรมอุทยานฯ (Excel)', live: 'API ไทย (ThaiREN) 48 ชม.' };

// [หัวไทย, หัวอังกฤษ, คำอธิบาย] — ลำดับ = ลำดับคอลัมน์ใน CSV
const COLS = [
  ['ปีงบประมาณ', 'fiscal_year', 'ปีงบประมาณ พ.ศ. (1 ต.ค. – 30 ก.ย.)'],
  ['วันที่', 'date', 'วันที่ตามเวลาไทย รูปแบบ YYYY-MM-DD (ค.ศ.)'],
  ['เวลา', 'time_th', 'เวลาที่ดาวเทียมสแกน (เวลาไทย UTC+7) HH:MM'],
  ['ดาวเทียม', 'satellite', 'Suomi NPP / NOAA-20 / NOAA-21 (เครื่องวัด VIIRS 375 ม.)'],
  ['ละติจูด', 'lat', 'องศา WGS84 ทศนิยม 5 ตำแหน่ง'],
  ['ลองจิจูด', 'lon', 'องศา WGS84 ทศนิยม 5 ตำแหน่ง'],
  ['ความเชื่อมั่น', 'confidence', 'low / nominal / high ตามต้นทาง (ว่าง = แถวจาก Excel กรมอุทยานฯ)'],
  ['ตำบล', 'subdistrict', 'ชื่อตำบล'],
  ['อำเภอ', 'district', 'ชื่ออำเภอ'],
  ['จังหวัด', 'province', 'ชื่อจังหวัด'],
  ['พื้นที่อนุรักษ์', 'protected_area', 'พื้นที่อนุรักษ์ตามแนวเขตของระบบ (นอกพื้นที่อนุรักษ์ = อยู่ในแปลงรับผิดชอบของสถานีฯ แต่นอกเขตอนุรักษ์)'],
  ['สถานีควบคุมไฟป่า', 'fire_station', 'สถานีควบคุมไฟป่าที่รับผิดชอบแปลง (ไม่มี = ไม่อยู่ในแปลงสถานีฯ)'],
  ['สบอ.', 'pao', 'สำนักบริหารพื้นที่อนุรักษ์'],
  ['แหล่งข้อมูล', 'source', 'API ไทย (ThaiREN) / NASA FIRMS / กรมอุทยานฯ (Excel) / API ไทย (ThaiREN) 48 ชม. (ยังไม่เข้าคลังรายวัน)'],
  ['อยู่ในข้อมูลกรมอุทยานฯ', 'in_dnp', '1 = เป็นจุดเดียวกับข้อมูล Excel กรมอุทยานฯ (จับคู่ 1:1) · 0 = ไม่อยู่'],
  ['การจัดการเชื้อเพลิง', 'dnp_fuel_mgmt', 'ช่องการจัดการเชื้อเพลิงจาก Excel กรมอุทยานฯ (ไม่มี / การจัดการเชื้อเพลิง / ตรวจสอบแล้วไม่พบไฟ) — ว่าง = ไม่อยู่ในข้อมูลกรมอุทยานฯ'],
  ['ประเภทพื้นที่', 'dnp_land_type', 'ประเภทพื้นที่จาก Excel กรมอุทยานฯ'],
  ['ดาวเทียมตัวชี้วัด', 'indicator_sat', '1 = ดาวเทียมตัวชี้วัดของวันนั้น (Suomi NPP ก่อน 2 พ.ย. 2569, NOAA-20 ตั้งแต่ 2 พ.ย. 2569)'],
  ['นับตัวชี้วัด', 'kpi', '1 = นับในยอดตัวชี้วัดกรมอุทยานฯ (ปีงบที่มี Excel: in_dnp=1 และการจัดการเชื้อเพลิง "ไม่มี" · ปีงบที่ยังไม่มี Excel: indicator_sat=1)'],
  ['ขสป.ดงใหญ่', 'dong_yai', '1 = ขสป.ดงใหญ่ หรือแปลงสถานีฯ ดงใหญ่นอกพื้นที่อนุรักษ์ (สบอ.7) — หน้าเว็บ/LINE ค่าเริ่มต้นไม่รวม'],
];

// A = adata, H = hdata (อ็อบเจกต์ JSON ของบล็อก), live = features ของ live.json, today = วันไทย (นับจาก 1970-01-01)
function rows(A, H, live, today) {
  const out = [], to = A.to ? Date.parse(A.to + 'T00:00Z') / 864e5 : -1, seen = new Set();
  for (const r of A.r) {
    const d = r[0]; if (d > today) continue;
    const sat = satKey(A.sat[r[4]]), [tb, am] = String(A.tm[r[8]] || '').split('|'), la = r[2] / 1e5, lo = r[3] / 1e5;
    seen.add(hKey(d, r[1], la, lo));
    out.push({ d, t: r[1], la, lo, sat, cf: A.cf[r[5]] || '', tb: tb || '', am: A.am[r[7]] || am || '', pv: A.pv[r[6]] || '', ar: A.ar[r[9]] || '', st: A.st[r[10]] || '', sb: A.sb[r[11]] || '', src: r[13] ? 'firms' : 'api' });
  }
  for (const f of live || []) {
    const p = f.properties || {}, c = f.geometry && f.geometry.coordinates, fd = String(p.full_date || ''); if (!c || !fd) continue;
    const d = Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 864e5, t = +fd.slice(11, 13) * 100 + +fd.slice(14, 16), [lo, la] = c, k = hKey(d, t, la, lo);
    if (d <= to || d > today || seen.has(k) || !p._ar) continue; seen.add(k);
    out.push({ d, t, la, lo, sat: satKey(p.satellite_name), cf: p.confidence || '', tb: p.subdistrict_name_th || '', am: p.district_name_th || '', pv: p.province_name_th || '', ar: p._ar, st: p._st || 'ไม่มี', sb: require('./area').SBP[p.province_name_th] || '', src: 'live' });
  }
  // จับคู่จุดกรมอุทยานฯ ↔ จุด SNPP (ต่อวัน, ใกล้สุดก่อน)
  const byDay = new Map(); out.forEach((o, i) => { if (o.sat === 'SNPP') (byDay.get(o.d) || byDay.set(o.d, []).get(o.d)).push(i) });
  const pairs = [];
  H.r.forEach((h, hi) => { for (const i of byDay.get(h[0]) || []) { const o = out[i]; if (Math.abs(mins(h[1]) - mins(o.t)) <= 10) { const dd = Math.hypot(h[2] - o.la * 1e5, h[3] - o.lo * 1e5); if (dd < 400) pairs.push([dd, i, hi]) } } });
  const uO = new Set(), uH = new Set();
  for (const [, i, hi] of pairs.sort((x, y) => x[0] - y[0])) if (!uO.has(i) && !uH.has(hi)) { uO.add(i); uH.add(hi); out[i].h = H.r[hi] }
  H.r.forEach((h, hi) => {
    if (uH.has(hi) || h[0] > today) return; const [tb, am] = String(H.tm[h[6]] || '').split('|');
    out.push({ d: h[0], t: h[1], la: h[2] / 1e5, lo: h[3] / 1e5, sat: 'SNPP', cf: '', tb: tb || '', am: H.am[h[5]] || am || '', pv: H.pv[h[4]] || '', ar: H.ar[h[7]] || '', st: H.st[h[10]] || '', sb: H.sb[h[11]] || '', src: 'dnp', h });
  });
  const hfy = new Set(H.r.map(h => fyOf(h[0])));
  for (const o of out) {
    o.fy = fyOf(o.d); o.ind = o.sat === indSat(o.d) ? 1 : 0; o.dy = dyAS(o.ar, o.st) ? 1 : 0;
    o.fu = o.h ? H.fu[o.h[9]] || '' : ''; o.ld = o.h ? H.ld[o.h[8]] || '' : '';
    o.kpi = hfy.has(o.fy) ? (o.h && o.fu === 'ไม่มี' ? 1 : 0) : o.ind; o.hfy = hfy.has(o.fy);
  }
  return out.sort((a, b) => a.d - b.d || a.t - b.t || a.la - b.la || a.lo - b.lo);
}

const q = v => { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.split('"').join('""') + '"' : v };
// BOM + หัว "ไทย (english)" + CRLF → Excel ภาษาไทยเปิดได้ตรง
function csv(R) {
  const L = [COLS.map(c => `${c[0]} (${c[1]})`).join(',')];
  for (const o of R) L.push([o.fy, iso(o.d), hm(o.t), SATN[o.sat] || o.sat, o.la.toFixed(5), o.lo.toFixed(5), o.cf, o.tb, o.am, o.pv, o.ar, o.st, o.sb, SRC[o.src], o.h ? 1 : 0, o.fu, o.ld, o.ind, o.kpi, o.dy].map(q).join(','));
  return '﻿' + L.join('\r\n') + '\r\n';
}

// เขียนไฟล์ทุกปีงบ + index.json → คืนรายการ (สำหรับ log)
function write(outDir, { A, H, live, now = Date.now(), site = '' }) {
  const today = Math.floor((now + 7 * 36e5) / 864e5), F = fyOf(today), R = rows(A, H, live, today), dir = path.join(outDir, 'open');
  fs.mkdirSync(dir, { recursive: true });
  const fys = [...new Set(R.map(o => o.fy))].sort(), files = [];
  for (const y of fys) {
    const X = R.filter(o => o.fy === y), b = csv(X), file = `hotspots_fy${y}.csv`, sats = {};
    X.forEach(o => { const k = SATN[o.sat] || o.sat; sats[k] = (sats[k] || 0) + 1 });
    fs.writeFileSync(path.join(dir, file), b);
    files.push({ fy: y, file, url: site ? site + 'open/' + file : 'open/' + file, from: iso(fy0(y)), to: iso(Math.min(today, fy0(y + 1) - 1)), complete: today >= fy0(y + 1), rows: X.length, sats,
      kpi: X.filter(o => o.kpi).length, kpi_ex_dy: X.filter(o => o.kpi && !o.dy).length, kpi_basis: X[0] && X[0].hfy ? 'dnp' : 'indicator_sat',
      in_dnp: X.filter(o => o.h).length, dnp_only: X.filter(o => o.src === 'dnp').length, bytes: Buffer.byteLength(b) });
  }
  const ix = { generated: new Date(now).toISOString(), fy_now: F, adata_to: A.to, encoding: 'UTF-8 with BOM, CRLF, comma',
    docs: 'https://github.com/takiang71/fire-map-dpky/blob/main/docs/api.md',
    note: 'จุดความร้อนในแนวเขตกลุ่มป่าดงพญาเย็น-เขาใหญ่ ทุกดาวเทียม · kpi = นับตัวชี้วัดกรมอุทยานฯ · ปีงบปัจจุบันเปลี่ยนทุกรอบ (~5 นาที) · ต้องให้เครดิตแหล่งข้อมูลต้นทางตาม docs/api.md',
    credit: ['จุดความร้อน: ระบบ Land Fire Alerts Thailand (ThaiREN / สกสว.) และ NASA FIRMS (VIIRS 375 m, NASA LANCE)', 'ข้อมูลตัวชี้วัดย้อนหลัง: กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช'],
    columns: COLS.map(c => ({ th: c[0], en: c[1], desc: c[2] })), files };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(ix, null, 1));
  return ix;
}

module.exports = { rows, csv, write, COLS, SRC, dyAS };
