// ตรวจย้อนหลังกับ NASA FIRMS (ต้องมี FIRMS_KEY หรือไฟล์ .firms_key) — รายงานอย่างเดียว ไม่แก้ข้อมูล
// ใช้: node scripts/firms_audit.js [--from 2025-10-01] [--to YYYY-MM-DD]
//  1) จุดในแนวเขตที่ FIRMS มีแต่ API ไทย (data/hotspots_api.json) ไม่มี → รายวัน/ดาวเทียม
//  2) จุดของกรมอุทยานฯ (hdata, Suomi NPP) ที่ไม่พบใน API → FIRMS มีหรือไม่ (งานค้างข้อ 12)
//  ผลละเอียด: data/firms_audit.csv
// โหมดรายเดือน (C5, 16 พ.ย. 69): --from YYYY-MM (ไม่มีวัน) = ทั้งเดือนนั้น → data/firms_audit_<YYYYMM>.json แทน CSV
//  · sync.yml รอบแรกของเดือนที่ยังไม่มีไฟล์ของเดือนก่อน (continue-on-error, timeout 10 นาที) · build_site คัดลอกขึ้น _site/data/ + firms_audit.json = เดือนล่าสุด
//  · หน้าเว็บแสดง "ความครบถ้วนของ API เทียบ NASA FIRMS" ใน #p-src (faLoad/faLine)
//  · สคีมา: {v, month, from, to, generated, partial, apiDays:[มี, ทั้งเดือน], sats:{SNPP|NOAA20|NOAA21:{firms, api, match, miss, extra}},
//           tot:{…เหมือน sats}, pct (match/firms ×100 ทศนิยม 1 ตำแหน่ง · FIRMS ไม่มีจุด = null), miss:[[วันที่, HH:MM, ดาวเทียม, lat, lon, ตำบล, พื้นที่]], extra:[…],
//           dnp:{n, noApi, firms} (เฉพาะเดือนที่มีข้อมูลกรมอุทยานฯ Suomi NPP)}
// ตัวเลือกสำหรับเทสต์: --api <ไฟล์ hotspots_api.json> · --out <ไฟล์ JSON> · FIRMS_BASE = เซิร์ฟเวอร์จำลอง (scripts/lib/firms.js)
const fs = require('fs'), path = require('path');
const FM = require('./lib/firms');
const { block } = require('./lib/area');

const ROOT = path.join(__dirname, '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const today = Math.floor((Date.now() + 7 * 36e5) / 864e5), SNPP_END = Date.UTC(2026, 10, 2) / 864e5;
const MON = /^(\d{4})-(\d{2})$/.exec(arg('--from') || '');
const D0 = MON ? Date.UTC(+MON[1], +MON[2] - 1, 1) / 864e5 : FM.dayOf(arg('--from') || '2025-10-01');
const D1 = MON ? Math.min(Date.UTC(+MON[1], +MON[2], 0) / 864e5, today - 1) : arg('--to') ? FM.dayOf(arg('--to')) : today - 1;
const hhmm = t => String(t).padStart(4, '0').replace(/(..)$/, ':$1');

(async () => {
  if (!FM.key()) { console.log('ไม่มี MAP_KEY: ตั้ง env FIRMS_KEY หรือสร้างไฟล์ .firms_key ที่รากโปรเจกต์'); process.exit(1) }
  if (D1 < D0) { console.log('ช่วงวันที่ว่าง (เดือนยังไม่เริ่ม?)'); process.exit(1) }
  const AJ = JSON.parse(fs.readFileSync(arg('--api') || path.join(ROOT, 'data', 'hotspots_api.json'), 'utf8'));
  const api = AJ.raw.recs.filter(r => r.src !== 'firms');
  const F = [], SAT = {};
  for (const s of ['SNPP', 'NOAA20', 'NOAA21']) {
    const e = s === 'SNPP' ? Math.min(D1, SNPP_END) : D1; if (e < D0) continue;
    const L = await FM.area(s, D0, e, console.log); F.push(...L); SAT[s] = e;
    console.log(`FIRMS ${s} ${FM.isoOf(D0)}–${FM.isoOf(e)}: ในแนวเขต ${L.length} จุด (${[...new Set(L.map(r => r.fid))].join(', ') || '-'})`);
  }
  const A = api.filter(r => r.d >= D0 && r.d <= D1 && (SAT[r.sat] || 0) >= r.d);   /* เทียบเฉพาะดาวเทียม/ช่วงที่ขอ FIRMS */
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

  if (MON) {
    const ym = MON[1] + MON[2], out = arg('--out') || path.join(ROOT, 'data', `firms_audit_${ym}.json`);
    const n = (L, s) => s ? L.filter(r => r.sat === s).length : L.length;
    const st = s => ({ firms: n(F, s), api: n(A, s), match: s ? [...mA].filter(i => A[i].sat === s).length : mA.size, miss: n(miss, s), extra: n(extra, s) });
    const row = r => [FM.isoOf(r.d), hhmm(r.t), r.sat, +(r.la / 1e5).toFixed(5), +(r.lo / 1e5).toFixed(5), r.tm || '', r.ar || ''];
    const days = AJ.raw.days || {}, nd0 = D1 - D0 + 1, have = Array.from({ length: nd0 }, (_, i) => D0 + i).filter(d => d in days).length;
    const tot = st(), J = {
      v: 1, month: `${MON[1]}-${MON[2]}`, from: FM.isoOf(D0), to: FM.isoOf(D1), generated: new Date().toISOString(), partial: D1 < Date.UTC(+MON[1], +MON[2], 0) / 864e5,
      apiDays: [have, nd0], sats: Object.fromEntries(Object.keys(SAT).map(s => [s, st(s)])), tot, pct: tot.firms ? Math.round(tot.match / tot.firms * 1000) / 10 : null,
      miss: miss.map(row), extra: extra.map(row), ...(hd.length ? { dnp: { n: hd.length, noApi: nd.length, firms: nd.filter(h => h.f).length } } : {}),
    };
    fs.writeFileSync(out, JSON.stringify(J));
    console.log(`\nความครบถ้วนของ API เทียบ FIRMS เดือน ${J.month}: ${J.pct == null ? 'FIRMS ไม่มีจุดในแนวเขต' : J.pct + '%'} · API มีข้อมูล ${have}/${nd0} วัน → ${path.relative(ROOT, out)}`);
    return;
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
