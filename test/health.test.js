// health.js รายการใหม่ (15 พ.ย. 69): xlsx (C1 — ยังไม่นำเข้า Excel กรมอุทยานฯ) · savi / b4 (A6 — ต้นทางตามรอยเผาหยุด/ช้า)
// เวลาจำลองด้วย HEALTH_NOW (ตั้งก่อน require — health.js อ่านครั้งเดียวตอนโหลด) · ไม่ส่งข้อความ (main ทำงานเฉพาะเมื่อรันเป็นสคริปต์)
const test = require('node:test'), assert = require('node:assert/strict');
process.env.HEALTH_NOW = String(Date.parse('2027-12-02T03:00:00Z')); // 10:00 น. 2 ธ.ค. 2570 = ปีงบ 2571
const H = require('../scripts/health');
// health.js โหลด lib/state ซึ่งอ่าน STATE_DIR ตอนโหลด — ล้าง cache ให้ state.test.js (รันในโปรเซสเดียวกันผ่าน test/index.js) ได้โมดูลใหม่ตาม env ของตัวเอง
delete require.cache[require.resolve('../scripts/lib/state')];
const FY = [2561, 2562, 2563, 2564, 2565, 2566, 2567, 2568, 2569];
const at = iso => Date.parse(iso);

test('HEALTH_NOW ถูกใช้เป็นเวลาปัจจุบัน', () => {
  assert.equal(H.now, at('2027-12-02T03:00:00Z'));
});

test('xlsx: Excel ถึงปีงบ 2569 · 2 ธ.ค. 2570 (ปีงบ 2571) → เตือนนำเข้าปีงบ 2570', () => {
  const m = H.chkXlsx(FY);
  assert.match(m, /ถึงปีงบ 2569/);
  assert.match(m, /นำเข้า Excel ปีงบ 2570/);
  assert.match(m, /excel_to_hdata\.js/);
  assert.match(m, /docs\/arch\/data-update\.md/);
});

test('xlsx: ยังไม่ถึง 1 ธ.ค. / นำเข้าแล้ว / ปีงบปัจจุบันยังไม่จบ → ไม่เตือน', () => {
  assert.equal(H.chkXlsx(FY, at('2027-11-30T16:59:00Z')), null, '23:59 น. 30 พ.ย. 70');
  assert.notEqual(H.chkXlsx(FY, at('2027-11-30T17:00:00Z')), null, '00:00 น. 1 ธ.ค. 70 เวลาไทย');
  assert.equal(H.chkXlsx(FY, at('2027-10-02T03:00:00Z')), null, '2 ต.ค. 70 ยังไม่ถึง 1 ธ.ค.');
  assert.equal(H.chkXlsx([...FY, 2570]), null, 'มีปีงบ 2570 แล้ว');
  assert.equal(H.chkXlsx(FY, at('2026-12-15T03:00:00Z')), null, 'ปีงบ 2570 (ปัจจุบัน) มี Excel ถึง 2569 = ปกติ');
  assert.match(H.chkXlsx(FY, at('2028-12-02T03:00:00Z')), /ปีงบ 2570–2571 ใช้จุดจาก API/, 'ขาดสองปี');
  assert.match(H.chkXlsx([]), /อ่านปีงบ/);
});

test('xlsx/savi เตือนเดือนละครั้ง · b4 สัปดาห์ละครั้ง (ช่องที่ 3 ของ CHECKS)', () => {
  assert.equal(H.CHECKS.xlsx[2], 30 * 864e5);
  assert.equal(H.CHECKS.savi[2], 30 * 864e5);
  assert.equal(H.CHECKS.b4[2], 7 * 864e5);
  assert.equal(H.CHECKS.api[2], undefined, 'เรื่องอื่นยังทวนทุก 12 ชม.');
});

test('savi: เดือนล่าสุด ม.ค. 69 จบเกิน 90 วัน → เตือนพร้อมวันที่ตรวจต้นทาง', () => {
  const fu = { months: [{ m: '202512' }, { m: '202601' }], srcLatest: '202601', checked: '2026-11-15' };
  const m = H.chkSavi(fu, at('2026-11-15T03:00:00Z'));
  assert.match(m, /ยังไม่เผยแพร่ SAVI เดือนใหม่ตั้งแต่ ม\.ค\. 69 \(287 วัน\)/);
  assert.match(m, /ตรวจต้นทางล่าสุด 2026-11-15/);
  assert.equal(H.chkSavi(fu, at('2026-05-01T03:00:00Z')), null, '1 พ.ค. = 89 วันหลังสิ้น ม.ค.');
  assert.notEqual(H.chkSavi(fu, at('2026-05-03T03:00:00Z')), null, '91 วัน');
  assert.match(H.chkSavi({ ...fu, srcLatest: '202605' }, at('2026-06-10T03:00:00Z')), /ต้นทางมีเดือน พ\.ค\. 69 แล้วแต่เว็บยังเป็น ม\.ค\. 69 — ดูขั้น sync_fuel/);
  assert.match(H.chkSavi({ months: [{ m: '202601' }] }, at('2026-11-15T03:00:00Z')), /ยังไม่มีวันที่ตรวจต้นทาง/);
  assert.match(H.chkSavi(null), /อ่าน data\/fuel/);
});

test('b4: รอบล่าสุดจบเกิน 21 วัน → เตือน · ต้นทางมีรอบใหม่กว่าเว็บ → บอกให้ดู sync_burn', () => {
  const bn = { periods: [{ p: '20261015_20261021', d0: '20261015', d1: '20261021' }, { p: '20261022_20261028', d0: '20261022', d1: '20261028' }], srcLatest: { b4: '20261022_20261028', c: '202609' }, checked: '2026-11-15' };
  assert.equal(H.chkB4(bn, at('2026-11-15T03:00:00Z')), null, '17 วัน');
  assert.equal(H.chkB4(bn, at('2026-11-19T03:00:00Z')), null, '21 วัน');
  assert.match(H.chkB4(bn, at('2026-11-20T03:00:00Z')), /ยังไม่ออกภาพรอบใหม่หลัง 28 ต\.ค\. 69 \(22 วัน\)/);
  assert.match(H.chkB4({ ...bn, srcLatest: { b4: '20261029_20261104' } }, at('2026-11-10T03:00:00Z')), /ต้นทางมีรอบ 29 ต\.ค\. 69–4 พ\.ย\. 69 แล้วแต่เว็บยังเป็นรอบ 22 ต\.ค\. 69–28 ต\.ค\. 69/);
  assert.match(H.chkB4({ periods: [] }), /ไม่มีรอบ B4/);
});

test('hdFys อ่านปีงบจาก hdata จริงใน index.html (อ่านอย่างเดียว) และเริ่มที่ปีงบ 2561', () => {
  const y = H.hdFys();
  assert.ok(Array.isArray(y) && y.includes(2561) && y.includes(2569), JSON.stringify(y));
});
