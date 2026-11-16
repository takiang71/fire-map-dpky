// C5 เทียบ API ไทย ↔ NASA FIRMS รายเดือน (16 พ.ย. 69): scripts/firms_audit.js --from YYYY-MM กับ FIRMS จำลอง (ไม่ใช้โควตาจริง)
//  · เซิร์ฟเวอร์จำลอง /api/data_availability + /api/area (ตอบเฉพาะแถวในช่วงวัน UTC ที่ขอ เหมือนของจริง) ผ่าน FIRMS_BASE
//  · API 3 จุด (พิกัดจริงในแนวเขต — ค่าคงที่ ไม่อ่าน data/ ที่ sync เปลี่ยน) · FIRMS 3 จุด: 2 จุดตรงกับ API (เวลาเหลื่อม ≤10 นาที) + 1 จุดที่ API ไม่มี → ครบถ้วน 66.7%, ขาด 1, เกิน 1
//  · หน้าเว็บ faLine() (ดึงจาก index.html) สร้างข้อความ "ความครบถ้วนของ API เทียบ NASA FIRMS เดือน …"
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const { ROOT, grab, load } = require('./helpers.cjs');

const run = (args, env) => new Promise((res, rej) => cp.execFile(process.execPath, [path.join(ROOT, 'scripts', 'firms_audit.js'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' }, (e, o, s) => e ? rej(new Error(o + s)) : res(o)));

test('firms_audit.js --from 2026-10 กับ FIRMS จำลอง → data/firms_audit_<YYYYMM>.json (ครบถ้วน/ขาด/เกิน)', async () => {
  // จุดในแนวเขต 3 จุด (พิกัดจุดจริงจาก adata ปีงบ 2568: อช.ทับลาน, อช.ตาพระยา ×2 — คนละดาวเทียมจึงไม่จับคู่ข้ามกัน) ย้ายวันมาไว้ ต.ค. 69
  const P = [{ la: 1416568, lo: 10191405 }, { la: 1424129, lo: 10285786 }, { la: 1424322, lo: 10285445 }];
  const D = [Date.UTC(2026, 9, 5) / 864e5, Date.UTC(2026, 9, 12) / 864e5, Date.UTC(2026, 9, 31) / 864e5];
  const api = { raw: { days: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [Date.UTC(2026, 9, 1 + i) / 864e5, 0])), recs: [
    { d: D[0], t: 1325, la: P[0].la, lo: P[0].lo, sat: 'NOAA20', cf: 'nominal', tm: 'ก' },
    { d: D[1], t: 1410, la: P[1].la, lo: P[1].lo, sat: 'SNPP', cf: 'nominal', tm: 'ข' },
    { d: D[2], t: 105, la: P[2].la, lo: P[2].lo, sat: 'NOAA21', cf: 'nominal', tm: 'ค' },    /* API มีแต่ FIRMS ไม่มี */
    { d: D[2], t: 105, la: P[2].la, lo: P[2].lo, sat: 'NOAA21', cf: 'nominal', src: 'firms' }, /* จุดที่เติมจาก FIRMS ไม่นับเป็น API */
    { d: D[1] + 40, t: 1300, la: P[0].la, lo: P[0].lo, sat: 'NOAA20', cf: 'nominal' },         /* นอกเดือน */
  ] } };
  // FIRMS (UTC = ไทย −7 ชม.)
  const csv = {
    VIIRS_NOAA20_NRT: [['2026-10-05', '0630', P[0]], ['2026-10-20', '1845', P[1]]],   /* จุดที่ 2: 21 ต.ค. 01:45 น. ไทย — API ไม่มี */
    VIIRS_SNPP_NRT: [['2026-10-12', '0702', P[1]]],
    VIIRS_NOAA21_NRT: [],
  };
  const H = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
  const req = [];
  const srv = http.createServer((q, s) => {
    req.push(q.url);
    if (q.url.startsWith('/api/data_availability/')) return s.end('data_id,min_date,max_date\n' + Object.keys(csv).map(k => `${k},2026-08-01,2026-11-15`).join('\n'));
    const m = q.url.match(/^\/api\/area\/csv\/TESTKEY\/([A-Z0-9_]+)\/[^/]+\/(\d+)\/(\d{4}-\d{2}-\d{2})$/);
    if (!m) { s.statusCode = 404; return s.end('Invalid') }
    const a = Date.parse(m[3]), b = a + (+m[2] - 1) * 864e5;
    s.end([H].concat((csv[m[1]] || []).filter(([d]) => Date.parse(d) >= a && Date.parse(d) <= b).map(([d, t, p]) => `${p.la / 1e5},${p.lo / 1e5},330,0.4,0.4,${d},${t},N,VIIRS,n,2.0NRT,290,3.1,D`)).join('\n'));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-')), A = path.join(dir, 'api.json'), O = path.join(dir, 'out.json');
  fs.writeFileSync(A, JSON.stringify(api));
  try {
    const o = await run(['--from', '2026-10', '--api', A, '--out', O], { FIRMS_KEY: 'TESTKEY', FIRMS_BASE: `http://127.0.0.1:${srv.address().port}` });
    const J = JSON.parse(fs.readFileSync(O, 'utf8'));
    assert.equal(J.month, '2026-10'); assert.equal(J.from, '2026-10-01'); assert.equal(J.to, '2026-10-31'); assert.equal(J.partial, false);
    assert.deepEqual(J.apiDays, [31, 31]);
    assert.deepEqual(J.tot, { firms: 3, api: 3, match: 2, miss: 1, extra: 1 });
    assert.equal(J.pct, 66.7);
    assert.deepEqual(J.sats.NOAA20, { firms: 2, api: 1, match: 1, miss: 1, extra: 0 });
    assert.deepEqual(J.sats.NOAA21, { firms: 0, api: 1, match: 0, miss: 0, extra: 1 });
    assert.deepEqual(J.miss.map(r => r.slice(0, 3)), [['2026-10-21', '01:45', 'NOAA20']]);
    assert.deepEqual(J.extra.map(r => r.slice(0, 3)), [['2026-10-31', '01:05', 'NOAA21']]);
    assert.ok(!('dnp' in J), 'ต.ค. 69 = ปีงบ 2570 ยังไม่มีข้อมูลกรมอุทยานฯ');
    assert.match(o, /ความครบถ้วนของ API เทียบ FIRMS เดือน 2026-10: 66\.7%/);
    // ขอเป็นช่วง ≤5 วัน UTC (เริ่ม 30 ก.ย. UTC = 1 ต.ค. ไทย) ไม่มีคำขออื่นนอกจาก availability + area
    assert.ok(req.every(u => /^\/api\/(data_availability|area)\//.test(u)), req.join('\n'));
    assert.ok(req.some(u => u.endsWith('/5/2026-09-30')));
    // หน้าเว็บ
    const { faLine } = load(grab(/function faLine\([\s\S]*?\n(?=function faLoad)/), ['faLine'], { nf: n => String(n), esc: s => String(s) });
    assert.match(faLine(J), /ความครบถ้วนของ API เทียบ NASA FIRMS เดือน ต\.ค\. 69: <b>66\.7%<\/b>.*API ขาด 1 จุด.*API มีแต่ FIRMS ไม่มี 1 จุด/);
    assert.match(faLine({ ...J, pct: null, tot: { firms: 0, api: 0, match: 0, miss: 0, extra: 0 } }), /FIRMS ไม่มีจุดในแนวเขต/);
    assert.match(faLine({ ...J, apiDays: [29, 31] }), /API มีข้อมูล 29\/31 วัน/);
    assert.equal(faLine(null), '');
  } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }) }
});
