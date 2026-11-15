// C1: ปีงบที่ไม่มีใน hdata (Excel กรมอุทยานฯ) เลย → hdFill เติมจาก AD เฉพาะดาวเทียมตัวชี้วัด (ดึงโค้ดจริงจาก index.html)
// จำลองวันที่ 2 ต.ค. 2570 (ขึ้นปีงบ 2571 แล้ว แต่ยังไม่นำเข้า Excel ปีงบ 2570) → การ์ดเทียบปีงบ 2570 ต้องไม่เป็น 0 และมีป้าย
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load } = require('./helpers.cjs');

const SRC = [
  grab(/const ymd=d=>\{[^\n]*?\};/),
  grab(/function mkRec\(.*?hg:[^}]*\}\}/),
  grab(/const hid=[^\n]*/),
  grab(/const thDay=\(\)=>[^\n]*/),
  grab(/const IND_SW=Date\.UTC\([^)]*\)\/864e5;/),
  'const indSat=' + grab(/const indSat=(d=>d<IND_SW\?'SNPP':'NOAA20')/) + ';',
  grab(/const fuOK=r=>[^\n]*?;/),
  grab(/function fyCum\(F\)\{[^\n]*/),
  grab(/function hdFill\(H,A,F\)\{[\s\S]*?\n return\[\.\.\.add\][^\n]*/),
  grab(/let HDF=\[\];[^\n]*/),
  grab(/const hdfNote=[^\n]*/),
  grab(/const hdfSats=[^\n]*/),
].join('\n');
const NAMES = ['hdFill', 'HDF', 'hdfNote', 'hdfSats', 'fyCum', 'fuOK', 'mkRec', 'fyOfDay', 'thDay'];
const at = iso => { const ms = Date.parse(iso); return class extends Date { static now() { return ms } } };
const day = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;
// 00:30 น. 2 ต.ค. 2570 เวลาไทย = 1 ต.ค. 2027 17:30 UTC
const NOW = '2027-10-01T17:30:00Z';

// HD จาก Excel: ปีงบ 2568–2569 · fu 1 = จัดการเชื้อเพลิง (ไม่นับในการ์ด)
function world({ hd = [], ad = [], now = NOW } = {}) {
  const DIC = { pv: ['ปราจีนบุรี'], am: ['นาดี'], tm: ['บุพราหมณ์|นาดี'], ar: ['อุทยานแห่งชาติทับลาน'], ld: ['ป่าคงสภาพ'], fu: ['ไม่มี', 'การจัดการเชื้อเพลิง', 'ตรวจสอบแล้วไม่พบไฟ'], st: ['สถานีควบคุมไฟป่าทับลาน'], sb: ['สบอ.1'] };
  let HD = [];
  const env = { DIC, SBP: { 'ปราจีนบุรี': 'สบอ.1' }, Date: at(now), xHD: () => true, dbg: (t, e) => { throw e }, AD: ad, get HD() { return HD } };
  // mkRec ต้องสร้างก่อน HD → โหลดสองรอบ: รอบแรกได้ mkRec สร้าง HD จาก Excel จำลอง, รอบสองรัน hdFill จริง
  const W0 = load(SRC.split('\nlet HDF=')[0], ['mkRec'], { ...env, HD: [], AD: [] });
  HD = hd.map(([d, fu = 0], i) => Object.assign(W0.mkRec(d, 1330, 14.1, 101.9, 0, 0, 0, 0, 0, fu, 0, 0), { i }));
  return Object.assign(load(SRC, NAMES, { ...env, HD, AD: ad }), { HD, DIC });
}
const ad = (d, sat, extra = {}) => ({ d, t: 1330, la: 14.2, lo: 102.0, sat, cf: 'nominal', pv: 'ปราจีนบุรี', am: 'นาดี', tm: 'บุพราหมณ์|นาดี', ar: 'อุทยานแห่งชาติทับลาน', st: 'สถานีควบคุมไฟป่าทับลาน', sb: 'สบอ.1', fm: false, ...extra });
const HD0 = [[day(2025, 3, 1)], [day(2025, 3, 2), 1], [day(2026, 2, 10)], [day(2026, 2, 11)]];
// AD: ปีงบ 2569 (มีใน Excel แล้ว) · ปีงบ 2570: SNPP ก่อน 2 พ.ย. 69 = ตัวชี้วัด, หลังจากนั้น NOAA-20 · NOAA-21 ไม่ใช่ตัวชี้วัด · ปีงบ 2571 = ปีปัจจุบัน
const AD0 = [
  ad(day(2026, 3, 1), 'SNPP'),
  ad(day(2026, 10, 20), 'SNPP'), ad(day(2026, 10, 20), 'NOAA20'), ad(day(2026, 11, 1), 'SNPP'),
  ad(day(2026, 11, 2), 'NOAA20'), ad(day(2026, 11, 2), 'SNPP'), ad(day(2027, 2, 15), 'NOAA20'), ad(day(2027, 2, 15), 'NOAA21'), ad(day(2027, 3, 3), 'NOAA20', { fm: true }),
  ad(day(2027, 9, 30), 'NOAA20'),
  ad(day(2027, 10, 1), 'NOAA20'),
];

test('thDay จำลอง = 2 ต.ค. 2570 → ปีงบ 2571', () => {
  const W = world({ hd: HD0, ad: AD0 });
  assert.equal(W.thDay(), day(2027, 10, 2));
  assert.equal(W.fyOfDay(W.thDay()), 2571);
});

test('hdFill: เติมเฉพาะปีงบ 2570 (ไม่มีใน Excel, ก่อนปีปัจจุบัน) ด้วยดาวเทียมตัวชี้วัดของแต่ละวัน', () => {
  const W = world({ hd: HD0, ad: AD0 });
  assert.deepEqual(W.HDF, [2570]);
  const F = W.HD.filter(r => r.fa);
  assert.equal(F.length, 6, 'SNPP 20 ต.ค. + 1 พ.ย. · NOAA-20 2 พ.ย. + 15 ก.พ. + 3 มี.ค. (FIRMS) + 30 ก.ย. — ไม่รวม NOAA-21, SNPP หลัง 2 พ.ย., NOAA-20 ก่อน 2 พ.ย.');
  assert.deepEqual(F.map(r => r.sat), ['SNPP', 'SNPP', 'NOAA20', 'NOAA20', 'NOAA20', 'NOAA20']);
  assert.ok(F.every(r => r.fy === 2570 && r.fa === 1));
  assert.ok(F.every(r => W.DIC.ld[r.ld] === 'ไม่มีข้อมูลประเภทพื้นที่' && W.fuOK(r)), 'ld/fu ตามที่กำหนด และนับในการ์ด');
  assert.equal(W.DIC.ar[F[0].ar], 'อุทยานแห่งชาติทับลาน');
  assert.equal(W.DIC.sb[F[0].sb], 'สบอ.1', 'สบอ. ตามจังหวัด (SBP)');
  assert.equal(W.HD.filter(r => r.fy === 2569).length, 2, 'ปีงบ 2569 ใช้ Excel เดิม ไม่เติมซ้ำ');
  assert.equal(W.HD.filter(r => r.fy === 2571).length, 0, 'ปีงบปัจจุบันไม่อยู่ใน HD');
  assert.equal(new Set(W.HD.map(r => r.i)).size, W.HD.length, 'i ไม่ซ้ำ');
});

test('การ์ดเทียบปีงบ 2570 ไม่เป็น 0 และมีป้าย "ใช้จุดจาก API"', () => {
  const W = world({ hd: HD0, ad: AD0 });
  const c = W.fyCum(2570);
  assert.equal(c[365], 6, 'ยอดทั้งปีงบ 2570');
  assert.equal(c[day(2026, 11, 2) - day(2026, 10, 1)], 3, 'สะสมถึง 2 พ.ย. 69');
  assert.equal(W.fyCum(2569)[365], 2, 'ปีงบ 2569 ยังเป็น Excel');
  assert.equal(W.hdfNote([2568, 2569, 2570]), 'ปีงบ 2570 ใช้จุดจาก API (ยังไม่มีข้อมูลกรมอุทยานฯ)');
  assert.equal(W.hdfNote([2568, 2569]), '');
  assert.deepEqual(W.hdfSats(2570), ['SNPP', 'NOAA20']);
  assert.deepEqual(W.hdfSats(2569), ['SNPP']);
});

test('มี Excel ปีงบ 2570 แม้จุดเดียว → ไม่เติม (ยึดข้อมูลกรมอุทยานฯ)', () => {
  const W = world({ hd: [...HD0, [day(2027, 1, 5)]], ad: AD0 });
  assert.deepEqual(W.HDF, []);
  assert.equal(W.HD.filter(r => r.fa).length, 0);
  assert.equal(W.fyCum(2570)[365], 1);
});

test('วันนี้ (15 พ.ย. 69 = ปีงบ 2570) → ไม่เติมอะไร (ปีงบ 2570 เป็นปีปัจจุบัน)', () => {
  const W = world({ hd: HD0, ad: AD0, now: '2026-11-15T03:00:00Z' });
  assert.deepEqual(W.HDF, []);
});
