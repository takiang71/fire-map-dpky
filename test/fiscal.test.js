// ฟังก์ชันปีงบ/ตัวชี้วัดในหน้าเว็บ (ดึงโค้ดจริงจาก index.html): fy0 · thDay · fyOfDay · indSat · fuOK · dyAS
// รอยต่อสำคัญ: ปีงบเริ่ม 1 ต.ค. · ตัวชี้วัดกรมอุทยานฯ เปลี่ยน Suomi NPP → NOAA-20 ตั้งแต่ 2 พ.ย. 2569 · วันไทย = UTC+7
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load } = require('./helpers.cjs');

const SRC = [
  grab(/const ymd=d=>\{[^\n]*?\};/),
  grab(/const thDay=\(\)=>[^\n]*/),
  grab(/const IND_SW=Date\.UTC\([^)]*\)\/864e5;/),
  'const indSat=' + grab(/const indSat=(d=>d<IND_SW\?'SNPP':'NOAA20')/) + ';',
  grab(/const fuOK=r=>[^\n]*?;/),
  'const DYR=' + grab(/const DYR=(\/[^/]+\/),dyAS=/) + ',dyAS=' + grab(/,dyAS=(\(ar,st\)=>.*?),\r?\n/) + ';',
].join('\n');
const NAMES = ['ymd', 'thDay', 'fy0', 'fyOfDay', 'IND_SW', 'indSat', 'fuOK', 'dyAS'];
// Date ปลอม: Date.now() = เวลาที่กำหนด (ส่วนอื่นเหมือน Date จริง)
const at = iso => { const ms = Date.parse(iso); return class extends Date { static now() { return ms } } };
const W = (env = {}) => load(SRC, NAMES, { DIC: { fu: ['ไม่มี', 'จัดการเชื้อเพลิง', 'ตรวจสอบแล้วไม่พบไฟ'] }, Date, ...env });
const day = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;

test('fy0: ปีงบ พ.ศ. เริ่ม 1 ต.ค. ของปี ค.ศ. ก่อนหน้า', () => {
  const { fy0 } = W();
  assert.equal(fy0(2569), day(2025, 10, 1));
  assert.equal(fy0(2570), day(2026, 10, 1));
  assert.equal(fy0(2561), day(2017, 10, 1), 'ปีงบแรกของข้อมูล Excel');
});

test('fyOfDay: รอยต่อ 30 ก.ย. / 1 ต.ค. (รวมปีอธิกสุรทิน)', () => {
  const { fyOfDay, fy0 } = W();
  assert.equal(fyOfDay(day(2025, 9, 30)), 2568);
  assert.equal(fyOfDay(day(2025, 10, 1)), 2569);
  assert.equal(fyOfDay(day(2026, 9, 30)), 2569);
  assert.equal(fyOfDay(day(2026, 10, 1)), 2570);
  assert.equal(fyOfDay(day(2024, 2, 29)), 2567);
  for (let F = 2561; F <= 2575; F++) { assert.equal(fyOfDay(fy0(F)), F); assert.equal(fyOfDay(fy0(F) - 1), F - 1) }
});

test('thDay: วันตามเวลาไทย เปลี่ยนวันตอน 17:00 UTC', () => {
  assert.equal(W({ Date: at('2026-11-14T16:59:59Z') }).thDay(), day(2026, 11, 14));
  assert.equal(W({ Date: at('2026-11-14T17:00:00Z') }).thDay(), day(2026, 11, 15));
  assert.equal(W({ Date: at('2026-09-30T17:00:00Z') }).fyOfDay(W({ Date: at('2026-09-30T17:00:00Z') }).thDay()), 2570, '00:00 น. 1 ต.ค. 69 ไทย = ปีงบ 2570');
});

test('indSat: ตัวชี้วัด Suomi NPP ถึง 1 พ.ย. 2569 · NOAA-20 ตั้งแต่ 2 พ.ย. 2569 (ทั้งวัน)', () => {
  const { indSat, IND_SW } = W();
  assert.equal(IND_SW, day(2026, 11, 2));
  assert.equal(indSat(day(2026, 11, 1)), 'SNPP');
  assert.equal(indSat(day(2026, 11, 2)), 'NOAA20');
  assert.equal(indSat(day(2026, 11, 2) + 0.99), 'NOAA20');
  assert.equal(indSat(day(2025, 10, 1)), 'SNPP', 'ปีงบ 2569 ใช้ SNPP ทั้งปี');
});

test('fuOK: นับเฉพาะจุดที่ไม่ใช่การจัดการเชื้อเพลิง/ตรวจสอบแล้วไม่พบไฟ', () => {
  const { fuOK } = W();
  assert.deepEqual([0, 1, 2].map(fu => fuOK({ fu })), [true, false, false]);
  // dictionary จริงในบล็อก hdata (อ่านอย่างเดียว) ต้องยังมีคำว่า "ไม่มี" — ไม่งั้นประวัติในการ์ดจะเป็น 0 ทั้งหมด
  const { block } = require('../scripts/lib/area');
  const fu = JSON.parse(block('hdata')[1].split('<\\/').join('</')).fu;
  assert.ok(fu.includes('ไม่มี'), 'hdata.fu = ' + JSON.stringify(fu));
});

test('dyAS: ไม่รวม ขสป.ดงใหญ่ = จุดในเขตฯ ดงใหญ่ + จุดนอกพื้นที่อนุรักษ์ในพื้นที่รับผิดชอบสถานีฯ ดงใหญ่', () => {
  const { dyAS } = W();
  assert.equal(dyAS('เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', 'สถานีควบคุมไฟป่าดงใหญ่'), true);
  assert.equal(dyAS('เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', 'ไม่มี'), true);
  assert.equal(dyAS('นอกพื้นที่อนุรักษ์', 'สถานีควบคุมไฟป่าดงใหญ่'), true);
  assert.equal(dyAS('', 'สถานีควบคุมไฟป่าดงใหญ่'), true);
  assert.equal(dyAS('อุทยานแห่งชาติทับลาน', 'สถานีควบคุมไฟป่าดงใหญ่'), false, 'พื้นที่อนุรักษ์อื่นที่ Excel ระบุสถานีฯ ดงใหญ่ยังนับ');
  assert.equal(dyAS('อุทยานแห่งชาติเขาใหญ่', 'สถานีควบคุมไฟป่าเขาใหญ่'), false);
  assert.equal(dyAS(null, null), false);
});
