// F8 ข้อมูลเปิด (scripts/lib/opendata.js → _site/open/hotspots_fy<ปีงบ>.csv + index.json) และช่องใหม่ของ summary.json (w/pw/sn/psn — F4 แดชบอร์ด)
//  - ข้อมูลสังเคราะห์: จับคู่จุดกรมอุทยานฯ 1:1, กติกา kpi สองแบบ (ปีงบที่มี Excel / ไม่มี), ดงใหญ่, live.json ที่ยังไม่เข้า adata, CSV (BOM/หัว/อัญประกาศ)
//  - ข้อมูลจริงใน index.html: ยอด kpi ของ CSV = summary.json (ปีงบนี้ = total, ปีงบก่อน = pfull) ← ตัวเลขเดียวกับการ์ดหลัก/LINE
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { rows, csv, write, COLS } = require('../scripts/lib/opendata');
const { block } = require('../scripts/lib/area');

const D = s => Date.parse(s + 'T00:00Z') / 864e5;
// adata/hdata สังเคราะห์ (พจนานุกรมเล็ก) — ปีงบ 2569 มี Excel, ปีงบ 2570 ไม่มี
const A = { to: '2026-11-10', sat: ['SNPP', 'NOAA20', 'NOAA21'], cf: ['nominal', 'high'], pv: ['ปราจีนบุรี', 'นครราชสีมา'], am: ['นาดี', 'ปะคำ'], tm: ['บุพราหมณ์|นาดี', 'หูทำนบ|ปะคำ'],
  ar: ['อุทยานแห่งชาติทับลาน', 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', 'นอกพื้นที่อนุรักษ์'], st: ['ไม่มี', 'สถานีควบคุมไฟป่าดงใหญ่'], sb: ['สบอ.1'],
  r: [
    [D('2026-03-01'), 1330, 1422800, 10197700, 0, 0, 0, 0, 0, 0, 0, 0, 1],        // SNPP คู่กับ Excel (ห่าง 0.0001° 2 นาที)
    [D('2026-03-01'), 1330, 1422850, 10197750, 1, 0, 0, 0, 0, 0, 0, 0, 0],        // NOAA-20 ตำแหน่งเดียวกัน — ไม่จับคู่ (ไม่ใช่ SNPP)
    [D('2026-03-02'), 1400, 1430000, 10250000, 0, 1, 1, 1, 1, 1, 1, 0, 0],        // SNPP ดงใหญ่ ไม่มีใน Excel
    [D('2026-10-20'), 1300, 1430000, 10250000, 0, 0, 1, 1, 1, 2, 1, 0, 0],        // ปีงบ 2570 SNPP (ตัวชี้วัดก่อน 2 พ.ย.) นอกพื้นที่อนุรักษ์ + สถานีฯ ดงใหญ่ = ดงใหญ่
    [D('2026-11-05'), 1320, 1422800, 10197700, 1, 0, 0, 0, 0, 0, 0, 0, 0],        // ปีงบ 2570 NOAA-20 (ตัวชี้วัดหลัง 2 พ.ย.)
    [D('2026-11-05'), 1250, 1422900, 10197800, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1],     // NOAA-21 จาก FIRMS (ช่องท้าย 1)
  ] };
const H = { pv: ['ปราจีนบุรี'], am: ['นาดี'], tm: ['บุพราหมณ์|นาดี'], ar: ['อุทยานแห่งชาติทับลาน'], ld: ['ป่าคงสภาพ'], fu: ['ไม่มี', 'การจัดการเชื้อเพลิง'], st: ['ไม่มี'], sb: ['สบอ.1'],
  r: [
    [D('2026-03-01'), 1332, 1422810, 10197710, 0, 0, 0, 0, 0, 0, 0, 0],            // คู่กับ SNPP แถวแรก
    [D('2026-03-05'), 1340, 1420000, 10190000, 0, 0, 0, 0, 0, 1, 0, 0],            // ไม่มีคู่ + จัดการเชื้อเพลิง → kpi 0
    [D('2026-03-06'), 1340, 1420000, 10190000, 0, 0, 0, 0, 0, 0, 0, 0],            // ไม่มีคู่ → แถว Excel kpi 1
  ] };
const live = [
  { geometry: { coordinates: [102.0, 14.3] }, properties: { full_date: '2026-11-12 13:10:00', satellite_name: 'NOAA20', confidence: 'nominal', subdistrict_name_th: 'บ้านราษฎร์', district_name_th: 'เสิงสาง', province_name_th: 'นครราชสีมา', _ar: 'อุทยานแห่งชาติทับลาน', _st: 'ไม่มี' } },
  { geometry: { coordinates: [102.5, 14.5] }, properties: { full_date: '2026-11-09 13:10:00', satellite_name: 'NOAA20', _ar: 'อุทยานแห่งชาติทับลาน', _st: 'ไม่มี' } }, // วันก่อน adata.to → ข้าม
];
const TODAY = D('2026-11-17');

test('F8 rows: จับคู่ Excel 1:1, แถว Excel ที่ไม่มีคู่, live หลัง adata.to, กติกา kpi/ดงใหญ่', () => {
  const R = rows(A, H, live, TODAY);
  assert.equal(R.length, 6 + 2 + 1, 'adata 6 + Excel ไม่มีคู่ 2 + live 1');
  const y69 = R.filter(o => o.fy === 2569), y70 = R.filter(o => o.fy === 2570);
  assert.equal(y69.filter(o => o.h).length, 3, 'จุดกรมอุทยานฯ ครบ 3');
  const m = y69.find(o => o.src === 'api' && o.sat === 'SNPP' && o.d === D('2026-03-01'));
  assert.ok(m.h && m.fu === 'ไม่มี' && m.ld === 'ป่าคงสภาพ' && m.kpi === 1, 'SNPP คู่กับ Excel นับ kpi');
  assert.equal(y69.find(o => o.sat === 'NOAA20').kpi, 0, 'ปีงบที่มี Excel: NOAA-20 ไม่นับ');
  assert.equal(y69.find(o => o.d === D('2026-03-02')).kpi, 0, 'SNPP ที่ไม่มีใน Excel ไม่นับ (ตาม Excel)');
  assert.equal(y69.find(o => o.d === D('2026-03-02')).dy, 1);
  assert.deepEqual(y69.filter(o => o.src === 'dnp').map(o => [o.fu, o.kpi]), [['การจัดการเชื้อเพลิง', 0], ['ไม่มี', 1]]);
  assert.equal(y69.filter(o => o.kpi).length, 2, '= จุด Excel การจัดการเชื้อเพลิง "ไม่มี" (pfull)');
  // ปีงบ 2570 ไม่มี Excel → kpi ตามดาวเทียมตัวชี้วัด
  assert.deepEqual(y70.map(o => [o.sat, o.ind, o.kpi, o.dy, o.src]), [
    ['SNPP', 1, 1, 1, 'api'], ['NOAA21', 0, 0, 0, 'firms'], ['NOAA20', 1, 1, 0, 'api'], ['NOAA20', 1, 1, 0, 'live']]);
  assert.equal(y70.find(o => o.src === 'live').sb, 'สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)', 'สบอ. ตามจังหวัด (SBP)');
});

test('F8 csv: BOM, หัวไทย (อังกฤษ), CRLF, อัญประกาศเมื่อมีจุลภาค', () => {
  const R = rows(A, H, [], TODAY), X = R.filter(o => o.fy === 2570); X[0].tb = 'ตำบล,"ทดสอบ"';
  const s = csv(X), L = s.split('\r\n');
  assert.equal(s.charCodeAt(0), 0xFEFF);
  assert.equal(L[0].slice(1), COLS.map(c => `${c[0]} (${c[1]})`).join(','));
  assert.ok(L[0].includes('นับตัวชี้วัด (kpi)') && L[0].includes('ดาวเทียม (satellite)'));
  assert.equal(L.length, X.length + 2, 'หัว + แถว + บรรทัดว่างท้าย');
  assert.ok(L[1].startsWith('2570,2026-10-20,13:00,Suomi NPP,14.30000,102.50000,nominal,"ตำบล,""ทดสอบ""",'), L[1]);
  assert.equal(L[1].split(',').slice(-3).join(','), '1,1,1');
});

test('F8 write: ไฟล์ทุกปีงบ + index.json (ยอด kpi/ไม่รวมดงใหญ่/สถานะครบปี)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'open-'));
  const ix = write(d, { A, H, live, now: Date.parse('2026-11-17T05:00:00Z') });
  assert.deepEqual(fs.readdirSync(path.join(d, 'open')).sort(), ['hotspots_fy2569.csv', 'hotspots_fy2570.csv', 'index.json']);
  const f = Object.fromEntries(ix.files.map(x => [x.fy, x]));
  assert.equal(ix.fy_now, 2570);
  assert.deepEqual([f[2569].kpi, f[2569].kpi_ex_dy, f[2569].kpi_basis, f[2569].complete, f[2569].dnp_only], [2, 2, 'dnp', true, 2]);
  assert.deepEqual([f[2570].kpi, f[2570].kpi_ex_dy, f[2570].kpi_basis, f[2570].complete, f[2570].to], [3, 2, 'indicator_sat', false, '2026-11-17']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'open', 'index.json'), 'utf8')).columns.length, COLS.length);
});

test('F8/F4 ข้อมูลจริง: kpi ใน CSV = summary.json · w/pw/sn/psn รวมได้เท่า fy/pfull/prv', () => {
  delete require.cache[require.resolve('../scripts/build_site')];
  const S = require('../scripts/build_site').summary(null), AA = JSON.parse(block('adata')[1]), HH = JSON.parse(block('hdata')[1]);
  const T = Math.floor((Date.now() + 7 * 36e5) / 864e5), R = rows(AA, HH, [], T), sum = (a, f) => a.reduce((s, x) => s + f(x), 0), V = Object.entries(S.areas);
  assert.equal(R.filter(o => o.fy === S.fy && o.kpi).length, S.total, 'ปีงบนี้ทุกพื้นที่');
  assert.equal(R.filter(o => o.fy === S.fy && o.kpi && !o.dy).length, sum(V.filter(([k]) => !/ดงใหญ่/.test(k)), ([, o]) => o.fy), 'ปีงบนี้ไม่รวมดงใหญ่ (การ์ดหลัก/LINE)');
  assert.equal(R.filter(o => o.fy === S.fy - 1 && o.kpi).length, sum(V, ([, o]) => o.pfull), 'ปีงบก่อนทั้งปี');
  assert.equal(R.filter(o => o.fy === S.fy - 1 && o.kpi && !o.dy).length, sum(V.filter(([k]) => !/ดงใหญ่/.test(k)), ([, o]) => o.pfull), 'ปีงบก่อนไม่รวมดงใหญ่');
  assert.equal(R.filter(o => o.fy === S.fy - 1 && o.h).length, HH.r.filter(r => r[0] >= Date.UTC(S.fy - 545, 9, 1) / 864e5 && r[0] < Date.UTC(S.fy - 544, 9, 1) / 864e5).length, 'จุด Excel ปีงบก่อนครบทุกจุด');
  for (const [k, o] of V) {
    assert.equal(o.w.length, 53); assert.equal(sum(o.w, x => x), o.fy, k + ' w'); assert.equal(sum(o.pw, x => x), o.pfull, k + ' pw');
    assert.equal(sum(Object.values(o.sn), x => x), o.fy, k + ' sn'); assert.equal(sum(Object.values(o.psn), x => x), o.prv, k + ' psn');
  }
});
