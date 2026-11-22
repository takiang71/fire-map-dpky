// WK นำทางเดินเท้าไปจุดความร้อน (22 พ.ย. 69) — ฟังก์ชันบริสุทธิ์ในบล็อก /*WK-PURE-BEGIN*/…/*WK-PURE-END*/ ของ index.html
//  · wkBrg ทิศ · wkRel มุมเทียบทิศที่หันหน้า (บวก = ขวา) · wkTurn/wkClock ข้อความ · wkDir ทิศ 8 ทาง
//  · wkPx ขนาดพิกเซล VIIRS 375 / MODIS 1000 · wkIn/wkFoot กรอบพิกเซล · wkHead เข็มทิศ (iOS / Android absolute / ไม่ absolute = null)
//  · wkSm กรองแกว่งข้าม 0/360 · wkDs รูปแบบระยะ
//  · โครงสร้าง: watchPosition ตัวเดียว (locFix → wkFix) · โมดูลไม่ส่งข้อมูลออก · ปุ่ม #d-wk ในแผงรายละเอียด · wkLayers ใน setup()
const test = require('node:test'), assert = require('node:assert/strict');
const { HTML, grab, load } = require('./helpers.cjs');

const W = load(grab(/\/\*WK-PURE-BEGIN\*\/([\s\S]*?)\/\*WK-PURE-END\*\//), ['wkN', 'wkM', 'wkBrg', 'wkRel', 'wkDir', 'wkClock', 'wkTurn', 'wkPx', 'wkIn', 'wkFoot', 'wkHead', 'wkSm', 'wkDs']);
const M = 1 / 111195.08; // องศาละติจูดต่อ 1 ม. (haversine ทรงกลม 6,371,008.8 ม.)
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} ≠ ${b}`);

test('wkBrg / wkM: เหนือ ตะวันออก ใต้ ตะวันตก', () => {
  const a = [101.37, 14.43];
  near(W.wkBrg(a, [101.37, 14.43 + 500 * M]), 0, 1e-6, 'เหนือ');
  near(W.wkBrg(a, [101.38, 14.43]), 90, 0.01, 'ตะวันออก');
  near(W.wkBrg(a, [101.37, 14.42]), 180, 1e-6, 'ใต้');
  near(W.wkBrg(a, [101.36, 14.43]), 270, 0.01, 'ตะวันตก');
  near(W.wkBrg(a, [101.38, 14.42]), 135, 1, 'ตะวันออกเฉียงใต้');
  near(W.wkM(a, [101.37, 14.43 + 500 * M]), 500, 0.01, 'ระยะ 500 ม.');
});

test('wkRel / wkTurn / wkClock / wkDir', () => {
  assert.equal(W.wkRel(10, 350), 20); assert.equal(W.wkRel(350, 10), -20); assert.equal(W.wkRel(180, 0), -180);
  assert.equal(W.wkTurn(0), 'ตรงไปข้างหน้า'); assert.equal(W.wkTurn(-15), 'ตรงไปข้างหน้า');
  assert.equal(W.wkTurn(90), 'เบี่ยงขวา 90°'); assert.equal(W.wkTurn(-40.4), 'เบี่ยงซ้าย 40°'); assert.equal(W.wkTurn(170), 'หันหลังกลับ');
  assert.equal(W.wkClock(0), 12); assert.equal(W.wkClock(60), 2); assert.equal(W.wkClock(-90), 9); assert.equal(W.wkClock(180), 6); assert.equal(W.wkClock(-14), 12); assert.equal(W.wkClock(16), 1);
  assert.equal(W.wkDir(0), 'เหนือ'); assert.equal(W.wkDir(359), 'เหนือ'); assert.equal(W.wkDir(245), 'ตะวันตกเฉียงใต้'); assert.equal(W.wkDir(90), 'ตะวันออก'); assert.equal(W.wkDir(-45), 'ตะวันตกเฉียงเหนือ');
});

test('wkPx / wkIn / wkFoot: VIIRS 375 ม. MODIS 1 กม.', () => {
  assert.equal(W.wkPx('NOAA-20'), 375); assert.equal(W.wkPx('Suomi NPP'), 375); assert.equal(W.wkPx(''), 375);
  assert.equal(W.wkPx('Terra'), 1000); assert.equal(W.wkPx('MODIS Aqua'), 1000);
  const t = [101.37, 14.43], kx = 1 / (111320 * Math.cos(14.43 * Math.PI / 180)), ky = 1 / 110574;
  assert.ok(W.wkIn([t[0] + 180 * kx, t[1] - 180 * ky], t, 375), 'มุมใน 180 ม.');
  assert.ok(!W.wkIn([t[0] + 190 * kx, t[1]], t, 375), 'ตะวันออก 190 ม. อยู่นอก');
  assert.ok(!W.wkIn([t[0], t[1] + 190 * ky], t, 375), 'เหนือ 190 ม. อยู่นอก');
  assert.ok(W.wkIn([t[0], t[1] + 490 * ky], t, 1000), 'MODIS 490 ม. อยู่ใน');
  const F = W.wkFoot(t, 375);
  assert.equal(F.length, 5); assert.deepEqual(F[0], F[4]);
  near((F[1][0] - F[0][0]) / kx, 375, 1e-6, 'กว้าง'); near((F[2][1] - F[1][1]) / ky, 375, 1e-6, 'สูง');
});

test('wkHead: iOS webkitCompassHeading · Android absolute · ไม่ absolute = null · หมุนจอ', () => {
  assert.equal(W.wkHead({ webkitCompassHeading: 30, alpha: 0 }, 0), 30);
  assert.equal(W.wkHead({ webkitCompassHeading: 350 }, 90), 80);
  assert.equal(W.wkHead({ webkitCompassHeading: -1, alpha: 10, absolute: false }, 0), null, 'iOS ยังไม่ปรับเทียบ (-1)');
  assert.equal(W.wkHead({ type: 'deviceorientationabsolute', alpha: 90 }, 0), 270);
  assert.equal(W.wkHead({ type: 'deviceorientation', absolute: true, alpha: 0 }, 0), 0);
  assert.equal(W.wkHead({ type: 'deviceorientation', absolute: true, alpha: 300 }, 90), 150);
  assert.equal(W.wkHead({ type: 'deviceorientation', absolute: false, alpha: 90 }, 0), null, 'ไม่เทียบเหนือ');
  assert.equal(W.wkHead({ type: 'deviceorientationabsolute', alpha: null }, 0), null);
  assert.equal(W.wkHead(null, 0), null);
});

test('wkSm กรองแกว่งข้าม 0/360 · wkDs รูปแบบระยะ', () => {
  assert.equal(W.wkSm(null, 370, .25), 10);
  near(W.wkSm(350, 10, .5), 0, 1e-9, '350→10 ผ่าน 0 (ไม่ใช่ 180)');
  near(W.wkSm(10, 350, .25), 5, 1e-9, '10→350');
  assert.equal(W.wkDs(3), '5 ม.'); assert.equal(W.wkDs(47), '45 ม.'); assert.equal(W.wkDs(384), '380 ม.');
  assert.equal(W.wkDs(996), '1.00 กม.'); assert.equal(W.wkDs(1234), '1.23 กม.'); assert.equal(W.wkDs(12345), '12.3 กม.'); assert.equal(W.wkDs(NaN), '–');
});

test('โครงสร้าง: GPS ตัวเดียว · ไม่ส่งข้อมูลออก · ปุ่มในแผงรายละเอียด · ชั้นใน setup()', () => {
  const mod = (HTML.match(/\/\* ===== WK นำทางเดินเท้า[\s\S]*?<\/script>/) || [''])[0];
  assert.ok(mod.length > 5000, 'พบโมดูล WK');
  assert.equal((HTML.match(/watchPosition\(/g) || []).length, 1, 'watchPosition ตัวเดียว');
  assert.ok(!/\bfetchT?\(|sendBeacon|ulApi\(|XMLHttpRequest/.test(mod), 'โมดูลไม่เรียกเครือข่าย');
  assert.ok(/try\{tkFix\(p\)\}catch\(e\)\{dbg\('tkFix',e\)\}if\(typeof wkFix==='function'\)try\{wkFix\(p\)\}/.test(HTML), 'locFix → wkFix');
  assert.ok(/id="d-wk"/.test(HTML) && /id="d-wk2"/.test(HTML), 'ปุ่ม #d-wk และลิงก์ #d-wk2');
  assert.ok(/typeof wkLayers==='function'\)wkLayers\(\)/.test(HTML), 'wkLayers ใน setup() (สลับแผนที่ฐานแล้วชั้นกลับมา)');
  assert.ok(!/[;)}\]]\s*\/\/[^\n]*[;{]\s*\S/.test(mod.replace(/https?:\/\//g, '')), 'ไม่มี // ท้ายบรรทัดที่มีโค้ด');
});
