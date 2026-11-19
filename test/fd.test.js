// FD เมนูหลัก "ไฟป่าที่ตรวจพบ" + ฟอร์มบันทึกการดับไฟป่า (18 พ.ย. 69) — docs/arch/ui-modules.md หัวข้อ "ไฟป่าที่ตรวจพบ"
//  · fdGrp: จัดช่องทางรับแจ้ง (XD.rp ของ fxdata) เป็น 3 กลุ่ม ดาวเทียม / เจ้าหน้าที่พบเอง / ได้รับแจ้ง (+ ไม่ระบุ)
//  · fdMs/fdBk: วันที่+เวลาไทยในฟอร์ม ↔ ms (UTC+7) — ปีงบของบันทึกคิดจากค่านี้ (Worker repFy)
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load, HTML } = require('./helpers.cjs');

const RP = ['องค์กรปกครองท้องถิ่น', 'เครือข่ายไฟป่าและหมอกควัน (อส.อส)', 'ผู้นำชุมชน (กำนัน ผู้ใหญ่บ้าน)', 'ชุดลาดตระเวนและเฝ้าระวังไฟป่า', 'ชุดลาดตระเวนหน่วยพิทักษ์ป่า (อส.)', 'ชุดจุดตรวจ/จุดสกัด/จุดเฝ้าระวังไฟป่า', 'สายด่วนพิทักษ์ป่า 1362', 'ชาวบ้านในพื้นที่', 'ดาวเทียม (Hotspot)', 'หน่วยงาน อส.ในพื้นที่', 'สถานีควบคุมไฟป่าในพื้นที่', 'ศูนย์สั่งการฯ ไฟป่าและหมอกควัน (War room)', 'ไม่ระบุ'];
const src = grab(/(const fdGrp=v=>\{[^\n]*)/) + '\n' + grab(/(const fdRpS=s=>[^\n]*)/) + '\n' + grab(/(const fdMs=\(d,t\)=>[^\n]*)/) + '\n' + grab(/(const fdBk=ms=>[^\n]*)/);
const F = load(src, ['fdGrp', 'fdRpS', 'fdMs', 'fdBk'], { XD: { rp: RP } });

test('fdGrp: ช่องทางรับแจ้ง → 3 กลุ่ม', () => {
  const g = RP.map((_, i) => F.fdGrp(i));
  assert.deepEqual(g, ['net', 'net', 'net', 'own', 'own', 'own', 'net', 'net', 'sat', 'own', 'own', 'net', 'na']);
  assert.equal(F.fdGrp(99), 'na', 'ดัชนีนอกรายการ = ไม่ระบุ');
});
test('fdRpS: ชื่อสั้นบนปุ่มฟอร์ม', () => {
  assert.equal(F.fdRpS('ดาวเทียม (Hotspot)'), 'ดาวเทียม (จุดความร้อน)');
  assert.equal(F.fdRpS('ชุดลาดตระเวนและเฝ้าระวังไฟป่า'), 'ลาดตระเวนไฟป่า (พบเอง)');
  assert.equal(F.fdRpS('ชาวบ้านในพื้นที่'), 'ชาวบ้านในพื้นที่');
});
test('fdMs/fdBk: เวลาไทย ↔ ms · ไม่มีวันที่ = null · ไม่มีเวลา = เที่ยง', () => {
  assert.equal(F.fdMs('2026-11-18', '13:10'), Date.UTC(2026, 10, 18, 6, 10));
  assert.equal(F.fdMs('2026-11-18', ''), Date.UTC(2026, 10, 18, 5, 0));
  assert.equal(F.fdMs('', '13:10'), null);
  assert.equal(F.fdMs('18/11/2569', '13:10'), null);
  assert.deepEqual(F.fdBk(Date.UTC(2026, 9, 31, 17, 30)), ['2026-11-01', '00:30'], 'ข้ามเที่ยงคืนตามเวลาไทย');
  const ms = F.fdMs('2026-09-30', '23:59'), [d, t] = F.fdBk(ms); assert.equal(d + ' ' + t, '2026-09-30 23:59');
});
test('ปุ่มเมนูหลักแทนพยากรณ์อากาศ + การ์ด/ฟอร์มอยู่ในหน้า', () => {
  assert.ok(!/id="bWy"/.test(HTML), 'ปุ่ม #bWy ถูกแทนแล้ว');
  assert.match(HTML, /id="bFd"[^>]*>.*?ไฟป่าที่ตรวจพบ/);
  assert.match(HTML, /<div class="card" id="fcard" hidden/);
  assert.match(HTML, /if\(typeof fdHit==='function'&&fdHit\(e\)\)return;/, 'ผูกกับตัวจัดการคลิกแผนที่หลัก');
  assert.ok(!/window\.ADM/.test(HTML), 'ADM ประกาศด้วย let ไม่อยู่บน window');
});
test('STRN เปลี่ยนชื่อสถานีฯ (19 พ.ย. 69): index.html กับ import_fx.js ชุดเดียวกัน · ข้อมูลดับไฟไม่เหลือชื่อเดิม', () => {
  const fs = require('fs'), path = require('path');
  const a = load(grab(/(const STRN=\{[^}]*\};)/), ['STRN']).STRN;
  const b = load(grab(/(const STRN = \{[^}]*\};)/, fs.readFileSync(path.join(__dirname, '..', 'scripts', 'import_fx.js'), 'utf8')), ['STRN']).STRN;
  assert.deepEqual(a, b);
  assert.deepEqual(a, { 'สถานีควบคุมไฟป่านครนายก': 'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)', 'สถานีควบคุมไฟป่าปราจีนบุรี': 'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)' });
  // ตัวแปลงดัชนีตอนโหลด: ชื่อใหม่มีอยู่แล้ว = รวมเข้าดัชนีเดิม · ไม่มี = เปลี่ยนชื่อในที่
  const XD = { st: ['สถานีควบคุมไฟป่าทับลาน', 'สถานีควบคุมไฟป่านครนายก', 'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)', 'สถานีควบคุมไฟป่าปราจีนบุรี'] };
  const SA = load('const STRN=' + JSON.stringify(a) + ';' + grab(/(const SA=XD\.st\.map\(.*?XD\.st\[i\]=t;return i\}\);)/), ['SA'], { XD }).SA;
  assert.deepEqual(SA, [0, 2, 2, 3]); assert.equal(XD.st[3], 'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)');
});
test('fdTimeChk: ลำดับเวลา รับแจ้ง → เข้าดับ → เสร็จ (19 พ.ย. 69)', () => {
  const F = load(grab(/(const fdMs=\(d,t\)=>[^\n]*)/) + '\n' + grab(/(const fdTimeChk=\(o,now\)=>[^\n]*)/), ['fdTimeChk']);
  const NOW = Date.UTC(2026, 10, 19, 3, 48), o = (tn, ta, te, dt = '2026-11-19') => ({ dt, tn, ta, te }); // 10:48 น.
  const ok = F.fdTimeChk(o('09:00', '09:30', '10:40'), NOW); assert.deepEqual(ok.e, []); assert.deepEqual(ok.w, []);
  assert.equal((ok.te - ok.ta) / 6e4, 70);
  // รายงานทดสอบจริง: เข้าดับ 11:46 หลังเวลาส่ง 10:48 → อนาคต
  assert.deepEqual(F.fdTimeChk(o('10:44', '11:46', '01:39'), NOW).e, [['เวลาเข้าดับไฟอยู่ในอนาคต', 'fd-ta']]);
  // เมื่อวาน: เสร็จหลังเที่ยงคืน = เตือนยืนยัน ไม่ใช่ผิด
  const nx = F.fdTimeChk(o('22:10', '22:40', '01:20', '2026-11-18'), NOW); assert.deepEqual(nx.e, []); assert.equal(nx.w.length, 1); assert.match(nx.w[0], /หลังเที่ยงคืน/); assert.equal((nx.te - nx.ta) / 6e4, 160);
  // เข้าดับก่อนรับแจ้ง (พิมพ์ผิด) = ข้ามวัน > 12 ชม. = ผิด
  assert.equal(F.fdTimeChk(o('10:00', '09:50', '10:30'), NOW).e[0][1], 'fd-ta');
  // เข้าดับหลังเที่ยงคืนจริง (รับแจ้ง 23:50 เข้าดับ 00:20) = เตือน 1 ข้อ
  const mn = F.fdTimeChk(o('23:50', '00:20', '01:00', '2026-11-18'), NOW); assert.deepEqual(mn.e, []); assert.equal(mn.w.length, 1);
  assert.deepEqual(F.fdTimeChk(o('10:00', '10:20', '11:30'), NOW).e, [['เวลาดับไฟเสร็จอยู่ในอนาคต', 'fd-te']]);
  assert.deepEqual(F.fdTimeChk(o('', '10:20', '11:30'), NOW), { e: [], w: [] }, 'ช่องว่าง = ให้ fdMiss รายงาน');
});
