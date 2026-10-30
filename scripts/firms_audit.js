// ตรวจย้อนหลังกับ NASA FIRMS (ต้องมี FIRMS_KEY หรือไฟล์ .firms_key) — รายงานอย่างเดียว ไม่แก้ข้อมูล
// ใช้: node scripts/firms_audit.js [--from 2025-10-01] [--to YYYY-MM-DD]
//  1) จุดในแนวเขตที่ FIRMS มีแต่ API ไทย (data/hotspots_api.json) ไม่มี → รายวัน/ดาวเทียม
//  2) จุดของกรมอุทยานฯ (hdata, Suomi NPP) ที่ไม่พบใน API → FIRMS มีหรือไม่ (งานค้างข้อ 12)
//  ผลละเอียด: data/firms_audit.csv
const fs = require('fs'), path = require('path');
const FM = require('./lib/firms');
const { block } = require('./lib/area');

const ROOT = path.join(__dirname, '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const today = Math.floor((Date.now() + 7 * 36e5) / 864e5), SNPP_END = Date.UTC(2026, 10, 2) / 864e5;
const D0 = FM.dayOf(arg('--from') || '2025-10-01'), D1 = arg('--to') ? FM.dayOf(arg('--to')) : today - 1;
const hhmm = t => String(t).padStart(4, '0').replace(/(..)$/, ':$1');

(async () => {
  if (!FM.key()) { console.log('ไม่มี MAP_KEY: ตั้ง env FIRMS_KEY หรือสร้างไฟล์ .firms_key ที่รากโปรเจกต์'); process.exit(1) }
  const api = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hotspots_api.json'), 'utf8')).raw.recs.filter(r => r.src !== 'firms');
  const F = [];
  for (const s of ['SNPP', 'NOAA20', 'NOAA21']) {
    const e = s === 'SNPP' ? Math.min(D1, SNPP_END) : D1; if (e < D0) continue;
    const L = await FM.area(s, D0, e, console.log); F.push(...L);
    console.log(`FIRMS ${s} ${FM.isoOf(D0)}–${FM.isoOf(e)}: ในแนวเขต ${L.length} จุด (${[...new Set(L.map(r => r.fid))].join(', ') || '-'})`);
  }
  const A = api.filter(r => r.d >= D0 && r.d <= D1);
  const [mA, mF] = FM.match(A, F), miss = F.filter((r, j) => !mF.has(j)), extra = A.filter((o, i) => !mA.has(i));
  const by = {}; miss.forEach(r => { const k = FM.isoOf(r.d) + ' ' + r.sat; by[k] = (by[k] || 0) + 1 });
  console.log(`\nAPI ไทย ${A.length} จุด · FIRMS ${F.length} จุด · จับคู่ได้ ${mA.size} · FIRMS มีแต่ API ไม่มี ${miss.length} จุด · API มีแต่ FIRMS ไม่มี ${extra.length} จุด`);
  Object.entries(by).sort().forEach(([k, n]) => console.log('  ', k, n, 'จุด'));

  // จุดกรมอุทยานฯ ที่ API ไม่มี
  const H = JSON.parse(block('hdata')[1]), tm = i => String(H.tm[i] || '').split('|')[0];
  const hd = H.r.filter(a => a[0] >= D0 && a[0] <= Math.min(D1, SNPP_END)).map(a => ({ d: a[0], t: a[1], la: a[2], lo: a[3], sat: 'SNPP', tm: tm(a[6]), ar: H.ar[a[7]] }));
  const [mH] = FM.match(hd, A.filter(o => o.sat === 'SNPP')), nd = hd.filter((h, i) => !mH.has(i));
  const [, , mN] = FM.match(nd, F);
  console.log(`\nจุดกรมอุทยานฯ ${hd.length} จุด · ไม่พบใน API ${nd.length} จุด:`);
  for (const [i, h] of nd.entries()) {
    const f = F[mN.get(i)];
    console.log(`   ${FM.isoOf(h.d)} ${hhmm(h.t)} ต.${h.tm} ${h.ar} → ${f ? `FIRMS มี (${f.fid} ${hhmm(f.t)} ห่าง ~${Math.round(Math.hypot(f.la - h.la, f.lo - h.lo) * 1.1)} ม.)` : 'FIRMS ก็ไม่มี'}`);
    h.f = f;
  }

  const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const rows = ['ประเภท,วันที่,เวลา,ดาวเทียม,ความเชื่อมั่น,ละติจูด,ลองจิจูด,ตำบล,อำเภอ,จังหวัด,พื้นที่อนุรักษ์,สถานีควบคุมไฟป่า,ชุดข้อมูล FIRMS']
    .concat(miss.map(r => ['FIRMS มีแต่ API ไม่มี', FM.isoOf(r.d), hhmm(r.t), r.sat, r.cf, (r.la / 1e5).toFixed(5), (r.lo / 1e5).toFixed(5), r.tm, r.am, r.pv, r.ar, r.st, r.fid]))
    .concat(extra.map(r => ['API มีแต่ FIRMS ไม่มี', FM.isoOf(r.d), hhmm(r.t), r.sat, r.cf, (r.la / 1e5).toFixed(5), (r.lo / 1e5).toFixed(5), r.tm, r.am, r.pv, r.ar, r.st, '']))
    .concat(nd.map(h => ['กรมอุทยานฯ ไม่พบใน API · ' + (h.f ? 'FIRMS มี' : 'FIRMS ไม่มี'), FM.isoOf(h.d), hhmm(h.t), 'SNPP', '', (h.la / 1e5).toFixed(5), (h.lo / 1e5).toFixed(5), h.tm, '', '', h.ar, '', h.f ? h.f.fid : '']))
    .map(r => Array.isArray(r) ? r.map(q).join(',') : r);
  fs.writeFileSync(path.join(ROOT, 'data', 'firms_audit.csv'), '﻿' + rows.join('\r\n'));
  console.log('\nรายละเอียด: data/firms_audit.csv');
})().catch(e => { console.log('ผิดพลาด:', e.message); process.exit(1) });
