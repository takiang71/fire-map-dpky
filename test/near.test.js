// กันแจ้งเตือนจุดเดียวกันซ้ำ (scripts/lib/near.js) — ใช้ใน line_notify.js / telegram_notify.js
const test = require('node:test'), assert = require('node:assert/strict');
const { isNew, remember, prune, seenNear, sameRec } = require('../scripts/lib/near');

// จุดจาก API: พิกัด (องศา) + เวลาไทย + ดาวเทียม (+ รหัส)
const F = (id, lon, lat, fd, sat = 'NOAA-20') => ({ id, geometry: { coordinates: [lon, lat] }, properties: { full_date: fd, satellite_name: sat } });
const idOf = f => f.id, NOW = Date.parse('2026-11-15T07:00:00Z');

test('จุดเดียวกันจาก FIRMS (ไม่มี unique_id) แล้ว API ส่งรหัสใหม่ ห่าง ~70 ม. ต่าง 2 นาที → ไม่แจ้งซ้ำ', () => {
  const st = { sent: {} }, a = F('firms-1', 102.10000, 14.20000, '2026-11-15 13:30:00');
  assert.ok(isNew(st, a, idOf));
  remember(st, a, idOf, NOW);
  assert.ok(!isNew(st, a, idOf), 'รหัสเดิม');
  assert.ok(!isNew(st, F('api-9', 102.10050, 14.20040, '2026-11-15 13:32:00'), idOf), 'ใกล้ + เวลาใกล้ = จุดเดิม');
  assert.equal(st.near.length, 1);
});

test('จุดข้างเคียงจริง (≥1 พิกเซล 375 ม.) / คนละดาวเทียม / ต่างเวลาเกิน 10 นาที → แจ้งแยก', () => {
  const st = { sent: {} };
  remember(st, F('a', 102.1, 14.2, '2026-11-15 13:30:00'), idOf, NOW);
  assert.ok(isNew(st, F('b', 102.1034, 14.2, '2026-11-15 13:30:00'), idOf), 'ห่าง 340 หน่วย');
  assert.ok(isNew(st, F('c', 102.1, 14.2, '2026-11-15 13:30:00', 'NOAA-21'), idOf), 'คนละดวง');
  assert.ok(isNew(st, F('d', 102.1, 14.2, '2026-11-15 13:41:00'), idOf), 'ต่าง 11 นาที');
  assert.ok(!isNew(st, F('e', 102.1, 14.2, '2026-11-15 13:40:00'), idOf), 'ต่าง 10 นาทีพอดี = จุดเดิม');
});

test('ชื่อดาวเทียมต่างรูปแบบ (NOAA-20 / noaa20 / N20) ถือเป็นดวงเดียวกัน · Suomi NPP = SNPP', () => {
  const st = { sent: {} };
  remember(st, F('a', 102.1, 14.2, '2026-11-15 13:30:00', 'NOAA-20'), idOf, NOW);
  assert.ok(seenNear(st, F('b', 102.1, 14.2, '2026-11-15 13:30:00', 'N20')));
  remember(st, F('c', 101.5, 14.4, '2026-11-15 01:30:00', 'Suomi NPP'), idOf, NOW);
  assert.ok(seenNear(st, F('d', 101.5, 14.4, '2026-11-15 01:31:00', 'npp')));
});

test('remember ไม่เก็บตำแหน่งซ้ำ และ prune ลบตำแหน่งที่สแกนเก่ากว่า keepH ชม.', () => {
  const st = { sent: {} };
  remember(st, F('a', 102.1, 14.2, '2026-11-13 13:30:00'), idOf, NOW);
  remember(st, F('b', 102.1, 14.2, '2026-11-13 13:31:00'), idOf, NOW);
  remember(st, F('c', 101.9, 14.3, '2026-11-15 13:30:00'), idOf, NOW);
  assert.equal(st.near.length, 2);
  assert.deepEqual(Object.keys(st.sent), ['a', 'b', 'c']);
  prune(st, Date.parse('2026-11-15T07:00:00Z'), 48);
  assert.equal(st.near.length, 1, 'จุด 13 พ.ย. 13:30 น. เก่ากว่า 48 ชม.');
  assert.equal(st.near[0][1], 1430000);
});

test('sameRec: เกณฑ์ <200 หน่วย และ ≤10 นาที', () => {
  const r = [0, 1420000, 10210000, 'NOAA20'];
  assert.ok(sameRec(r, [600e3, 1420199, 10210000, 'NOAA20']));
  assert.ok(!sameRec(r, [0, 1420200, 10210000, 'NOAA20']));
  assert.ok(!sameRec(r, [600001, 1420000, 10210000, 'NOAA20']));
});
