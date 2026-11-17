// F5 ขั้น B — โมเดลไฟใช้ข้อมูลตรวจวัดจริง (โค้ดดึงจาก index.html)
//  · ffM: FFMC → ความชื้นเชื้อเพลิงละเอียด m = 147.2·(101−FFMC)/(59.5+FFMC) (Van Wagner 1987) — เกือบเป็นสมการกลับของ F = 59.5·(250−m)/(147.2+m)
//  · calc: ไม่มี p.fm = EMC เดิม (ค่าทดสอบ 7.3 → หัวไฟ 4.7 ม./นาที) · มี p.fm = ใช้แทน EMC · ชื้นเกินจุดดับ = หัวไฟขั้นต่ำ 0.05
//  · fqPick: ลำดับที่มา ผู้ใช้ปรับเอง > สถานีกรมอุตุฯ > แบบจำลอง > ค่าตัวอย่าง (แยกทีละค่า) · ความชื้นจาก FFMC เฉพาะเมื่อเลือก 'f' และมีค่า
//  · fqStn: สถานีใกล้สุด ≤30 กม. ที่ค่าล่าสุดไม่เกิน 1 ชม. · ความชื้น <8% ไม่ใช้ · ลมสงบไม่ใช้ทิศ
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load } = require('./helpers.cjs'), { loadModel } = require('../scripts/lib/fmodel');
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} ≠ ${b} ±${e}`);
const M = loadModel();
const TEST = { hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3, sl: 4, asp: null };

test('ffM: FFMC → ความชื้นเชื้อเพลิงละเอียด (Van Wagner)', () => {
  near(M.ffM(85), 147.2 * 16 / 144.5, 1e-12, 'FFMC 85'); near(M.ffM(85), 16.30, 0.01, 'FFMC 85 ≈ 16.3%');
  near(M.ffM(101), 0, 1e-12, 'FFMC 101 = แห้งสนิท'); near(M.ffM(90), 10.83, 0.01, 'FFMC 90');
  for (let F = 50; F <= 99; F += 7) { const m = M.ffM(F); assert.ok(m < M.ffM(F - 1), 'ลดลงเมื่อ FFMC สูงขึ้น'); near(59.5 * (250 - m) / (147.2 + m), F, 0.1, 'สมการกลับ FFMC ' + F) }
});

test('calc: ไม่มี FFMC = ค่าเดิม (7.3 → 4.7) · มี FFMC ใช้แทน EMC', () => {
  const a = M.calc(TEST), b = M.calc({ ...TEST, fm: undefined }), c = M.calc({ ...TEST, fm: M.emc(32.3, 61) });
  near(a.Rh, 4.7, 1e-9, 'ค่าทดสอบ'); assert.deepEqual(b, a); near(c.Rh, 4.7, 1e-9, 'fm = EMC เดิม'); near(c.rai, a.rai, 1e-9, 'พื้นที่เท่าเดิม');
  const d = M.calc({ ...TEST, fm: M.ffM(85) }); near(d.E, M.ffM(85), 1e-12, 'E = m จาก FFMC'); assert.ok(d.Rh < a.Rh, 'FFMC 85 (16.3%) ชื้นกว่า EMC 11.6% → ลามช้าลง');
  near(M.calc({ ...TEST, fm: 30 }).Rh, 0.05, 1e-12, 'ชื้นเกิน 24% = หัวไฟขั้นต่ำ');
  near(M.calc({ ...TEST, hr: 1 }).rai * 36, a.rai, 1e-6, 'พื้นที่ 1 ชม. = 6 ชม. ÷ 36 (วงรีโตตาม t²)');
});

// โค้ด fq จาก index.html
const H = grab(/(const FQK=[^\n]*)/) + '\n' + grab(/(function fqPick\(Q,cur\)\{[\s\S]*?\n const mm=[^\n]*)/) + '\n' + grab(/(function fqStn\([\s\S]*?return b\})/) + '\n' +
  grab(/(const tmShort=[^\n]*)/) + '\n' + grab(/(const tmT=[^\n]*)/) + '\n' + grab(/(const tmNum=[^\n]*)/) + '\n' + grab(/(const tmRhBad=[^\n]*)/) + '\n' + grab(/(const tmKm=[^\n]*)/);
const Q = load(H, ['fqPick', 'fqStn', 'FQKM', 'FQAGE'], { TM_OLD: 3 * 36e5 });

test('fqPick: ผู้ใช้ปรับเอง > สถานี > แบบจำลอง > ค่าตัวอย่าง (แยกทีละค่า)', () => {
  const cur = { T: 32.3, rh: 61, u: 11, from: 90 }, om = { T: 30, rh: 50, u: 8, from: 45 }, stv = { T: 28.4, rh: 66, u: 12, from: null };
  let o = Q.fqPick({ man: {}, mp: 'f' }, cur);
  assert.deepEqual(o.v, cur); assert.deepEqual(o.s, { T: 'd', rh: 'd', u: 'd', from: 'd' }); assert.equal(o.fm, null);
  o = Q.fqPick({ man: {}, om, mp: 'f' }, cur); assert.deepEqual(o.v, om); assert.deepEqual(o.s, { T: 'm', rh: 'm', u: 'm', from: 'm' });
  o = Q.fqPick({ man: {}, om, stv, mp: 'f' }, cur);
  assert.deepEqual(o.v, { T: 28.4, rh: 66, u: 12, from: 45 }, 'ทิศลมสถานีไม่มี → ใช้แบบจำลอง'); assert.deepEqual(o.s, { T: 's', rh: 's', u: 's', from: 'm' });
  o = Q.fqPick({ man: { u: 1, rh: 1 }, om, stv, mp: 'f' }, { ...cur, u: 25, rh: 30 });
  assert.deepEqual(o.v, { T: 28.4, rh: 30, u: 25, from: 45 }); assert.deepEqual(o.s, { T: 's', rh: 'u', u: 'u', from: 'm' });
});

test('fqPick: ความชื้นเชื้อเพลิงจาก FFMC เฉพาะเมื่อเลือก FFMC และมีค่า · ค่าเฉพาะจุด (mo) ทับค่าที่ผู้ใช้เลือกไว้ (mp)', () => {
  const ff = { v: 88.5, m: M.ffM(88.5) };
  assert.equal(Q.fqPick({ man: {}, mp: 'f', ff }, {}).fm, ff.m);
  assert.equal(Q.fqPick({ man: {}, mp: 'e', ff }, {}).fm, null, 'ผู้ใช้เลือกจากอากาศ');
  assert.equal(Q.fqPick({ man: {}, mp: 'f', ff, mo: 'e' }, {}).fm, null, 'เลื่อนความชื้นเอง/ค่าทดสอบ → EMC');
  assert.equal(Q.fqPick({ man: {}, mp: 'f', ff: null }, {}).fm, null, 'ไม่มี FFMC');
  assert.equal(Q.fqPick({ man: {}, mp: 'f', ff: { v: NaN, m: NaN } }, {}).fm, null, 'ค่าเสีย');
});

test('fqStn: สถานีใกล้สุด ≤30 กม. ข้อมูลไม่เกิน 1 ชม.', () => {
  assert.equal(Q.FQKM, 30); assert.equal(Q.FQAGE, 36e5);
  const now = Date.parse('2026-11-18T14:00:00+07:00'), at = m => new Date(now - m * 6e4 + 7 * 36e5).toISOString().slice(0, 19).replace('T', ' ') + '+07:00';
  const st = (id, dLat, min, x = {}) => ({ station_id: id, station_name_th: 'สถานีตรวจอากาศอัตโนมัติทดสอบ' + id, station_lat: 14.4 + dLat, station_lon: 101.4, datetime_utc7: at(min), temperature: 30, humidity: 45, windspeed: 9, winddirection: 120, ...x });
  const L = [st(1, 0.05, 90), st(2, 0.12, 20), st(3, 0.30, 5), st(4, 0.20, 10, { humidity: 5, windspeed: 0.4 })];
  let b = Q.fqStn(L, 101.4, 14.4, now);
  assert.equal(b.id, 2, 'สถานี 1 ใกล้กว่าแต่ข้อมูลเก่า 90 นาที'); near(b.km, 0.12 * 111.2, 0.05, 'ระยะ'); assert.equal(b.n, 'ทดสอบ2');
  assert.deepEqual(b.v, { T: 30, rh: 45, u: 9, from: 120 });
  b = Q.fqStn([L[3], L[2]], 101.4, 14.4, now); assert.equal(b.id, 4); assert.deepEqual(b.v, { T: 30, rh: null, u: 0.4, from: null }, 'ความชื้น 5% = เซนเซอร์ผิด · ลมสงบไม่ใช้ทิศ');
  assert.equal(Q.fqStn([L[2]], 101.4, 14.4, now), null, 'ไกลเกิน 30 กม. (33 กม.)');
  assert.equal(Q.fqStn([st(5, 0.01, 2, { temperature: '', humidity: null, windspeed: '' })], 101.4, 14.4, now), null, 'ไม่มีค่าใดเลย');
  assert.equal(Q.fqStn(null, 101.4, 14.4, now), null);
});
