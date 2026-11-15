// สรุปประจำวัน LINE/Telegram: FWI (fwisum.js) · อัตราการระบายอากาศ GFS (vrsum.js) · PM2.5 CAMS (camssum.js)
// ไฟล์ตัวอย่าง test/fixtures/{fwi,gfs_vr,cams_grid}.json เป็นข้อมูลสังเคราะห์ (ค่าเท่ากันทั้งพื้นที่) ให้คิดค่าที่ถูกต้องด้วยมือได้
const test = require('node:test'), assert = require('node:assert/strict');
const { fwiSummary, FWN } = require('../scripts/lib/fwisum');
const { vrSummary, vrLevel } = require('../scripts/lib/vrsum');
const { camsSummary, PMN, pmLevel } = require('../scripts/lib/camssum');
const { fixture } = require('./helpers.cjs');
const NOW = Date.parse('2026-11-14T22:30:00Z'); // 05:30 น. 15 พ.ย. 69 เวลาไทย = เวลาส่งสรุปประจำวัน

test('fwiSummary: วันนี้+พรุ่งนี้ ค่าเฉลี่ย/ระดับ/สัดส่วนระดับสูงขึ้นไป/พื้นที่สูงสุด/FFMC', () => {
  const R = fwiSummary(NOW, 2, fixture('fwi.json'));
  assert.equal(R.run, '2026-11-15');
  assert.deepEqual(R.days.map(d => d.d), ['2026-11-15', '2026-11-16'], 'ตัดวันที่ผ่านไปแล้ว');
  const [a, b] = R.days;
  assert.deepEqual([a.mean, a.min, a.max, a.c, a.cx, a.hi], [20, 1.2, 45, 1, 3, 20]);
  assert.deepEqual(a.top, { k: 'dy', n: 'ขสป.ดงใหญ่', v: 30.1, c: 1 });
  assert.deepEqual(a.ffmc, { mean: 88.2, max: 91.6, c: 1, cx: 2 });
  assert.deepEqual([a.t, a.rh, a.pr], [31.3, 48, 0]);
  assert.ok([12.3, 12.4].includes(a.ws), 'ลม 12.35 ปัดทศนิยม 1 ตำแหน่ง');
  assert.deepEqual([b.mean, b.c, b.cx, b.hi, b.top.k, b.top.c, b.ffmc.c], [35, 2, 4, 70, 'ky', 3, 3]);
  assert.equal(FWN[a.c], 'ปานกลาง');
});

test('fwiSummary: รอบเก่ากว่า 3 วัน / ไม่มีวันนี้ / ไม่มีไฟล์ → null', () => {
  assert.equal(fwiSummary(Date.parse('2026-11-18T22:30:00Z'), 2, fixture('fwi.json')), null, 'รอบ 15 พ.ย. ใช้ถึง 18 พ.ย.');
  assert.equal(fwiSummary(Date.parse('2026-11-17T22:30:00Z'), 2, fixture('fwi.json')), null, '18 พ.ย. ไม่มีในข้อมูล');
  assert.equal(fwiSummary(NOW, 2, fixture('ไม่มีไฟล์.json')), null);
});

// A5 (15 พ.ย. 69): รอบ TFDRS เก่า (เครื่องผู้ดูแลปิด) → ค่าของวันจาก LFA (fixtures/fwi_lfa.json สังเคราะห์ ค่าของ 19 พ.ย.)
test('fwiSummary: รอบ TFDRS เก่าเกิน 3 วัน → ใช้ค่าของวันจาก LFA วันเดียว ติดธง lfa', () => {
  const T = Date.parse('2026-11-18T22:30:00Z'); // 05:30 น. 19 พ.ย. — index.json รอบ 15 พ.ย. ใช้ไม่ได้แล้ว
  const R = fwiSummary(T, 2, fixture('fwi.json'), fixture('fwi_lfa.json'));
  assert.equal(R.lfa, 1);
  assert.equal(R.run, '2026-11-19');
  assert.equal(R.days.length, 1, 'ไม่มีพยากรณ์ล่วงหน้า');
  const [a] = R.days;
  assert.deepEqual([a.d, a.f, a.mean, a.min, a.max, a.c, a.cx, a.hi], ['2026-11-19', 0, 35, 10, 60, 2, 4, 50]);
  assert.deepEqual(a.top, { k: 'ky', n: 'อช.เขาใหญ่', v: 40, c: 3 });
  assert.deepEqual(a.ffmc, { mean: 91, max: 95, c: 2, cx: 3 });
  assert.deepEqual([a.t, a.rh, a.ws, a.pr], [null, null, null, null], 'ไม่มีอากาศเที่ยงวัน');
});

test('fwiSummary: รอบ TFDRS ยังใช้ได้ → ไม่ใช้ LFA · LFA ไม่ใช่ค่าของวันนี้ → null', () => {
  const R = fwiSummary(NOW, 2, fixture('fwi.json'), fixture('fwi_lfa.json'));
  assert.equal(R.lfa, undefined);
  assert.equal(R.days.length, 2);
  assert.equal(fwiSummary(Date.parse('2026-11-19T22:30:00Z'), 2, fixture('fwi.json'), fixture('fwi_lfa.json')), null, 'LFA เป็นค่าของเมื่อวาน');
  assert.equal(fwiSummary(Date.parse('2026-11-18T22:30:00Z'), 2, fixture('ไม่มีไฟล์.json'), fixture('fwi_lfa.json')).lfa, 1, 'ไม่มี index.json ก็ยังใช้ LFA');
});

test('fwi_lfa: เกณฑ์รอบเก่า (≥2 วันตามเวลาไทย) และสรุปค่าจุดตัวอย่างแบบเดียวกับ sync_fwi', () => {
  const { stale, summarize, samples } = require('../scripts/fwi_lfa');
  assert.equal(stale({ run: '2026-11-15' }, Date.parse('2026-11-16T16:59:00Z')), false, '23:59 น. 16 พ.ย. = 1 วัน');
  assert.equal(stale({ run: '2026-11-15' }, Date.parse('2026-11-16T17:00:00Z')), true, '00:00 น. 17 พ.ย. = 2 วัน');
  assert.equal(stale(null), true);
  const A = samples();
  assert.equal(A.all.length, Object.keys(A).filter(k => k !== 'all').reduce((s, k) => s + A[k].length, 0));
  for (const k of ['ky', 'tl', 'ps', 'tp', 'dy', 'ks', 'kc']) assert.ok(A[k] && A[k].length >= 1, k);
  const S = summarize({ all: [[1, 1], [2, 2], [3, 3], [4, 4]], x: [[1, 1]] }, { FWI: new Map([['1,1', 10], ['2,2', 20], ['3,3', 45], ['4,4', null]]) });
  assert.deepEqual(S.all.FWI, [25, 10, 45, [0.333, 0.333, 0, 0.333, 0]], 'ข้ามจุดที่ไม่มีค่า · 10 ต่ำ / 20 ปานกลาง / 45 สูงมาก (เกณฑ์ 17/31/40/54)');
  assert.deepEqual(S.x.FWI, [10, 10, 10, [1, 0, 0, 0, 0]]);
});

test('vrSummary: วัน UTC (07:00–07:00 น.) ค่าเฉลี่ย/สูงสุด/ช่วงชั่วโมงระบายได้ (≥2,000)', () => {
  const R = vrSummary(NOW, 5, fixture('gfs_vr.json'));
  assert.equal(R.cyc, '2026-11-15T00Z');
  assert.equal(R.days.length, 2);
  for (const [i, d] of R.days.entries()) {
    const st = Date.parse('2026-11-15T00:00:00Z') + i * 864e5;
    assert.equal(d.d, new Date(st).toISOString().slice(0, 10));
    assert.equal(d.part, false);
    assert.equal(d.mean, 2460, '(7×6,000 + 17×1,000)/24 = 2,458 → ปัด 10');
    assert.equal(d.max, 6000);
    assert.deepEqual([d.a, d.z, d.hrs], [st + 3 * 36e5, st + 9 * 36e5, 7], '10:00–16:00 น. ไทย');
    assert.deepEqual([d.pk, d.pkT], [6000, st + 3 * 36e5]);
  }
  assert.equal(vrSummary(Date.parse('2026-11-15T13:00:00Z'), 5, fixture('gfs_vr.json')).days.length, 1, 'วันที่เหลือไม่ถึงครึ่งวันถูกตัด');
  assert.equal(vrSummary(NOW, 5, fixture('ไม่มีไฟล์.json')), null);
});

test('vrLevel: เกณฑ์กรมอุตุฯ', () => {
  assert.deepEqual([0, 1999, 2000, 3999, 4000, 8000, 16000, 30000].map(vrLevel), ['ไม่ดี', 'ไม่ดี', 'อ่อน', 'อ่อน', 'ดี', 'ดีมาก', 'ดีที่สุด', 'ดีที่สุด']);
});

test('camsSummary: วันไทย 8 เวลา ค่าเฉลี่ย 24 ชม. รายอุทยาน และค่าสูงสุดราย 3 ชม.', () => {
  const R = camsSummary(NOW, 3, fixture('cams_grid.json'));
  assert.equal(R.days.length, 2, 'วันที่สามไม่มีค่า (65535) → หยุด');
  const [a, b] = R.days;
  assert.equal(a.d, '2026-11-15');
  assert.deepEqual([a.mean, a.c], [23.8, 1], '(7×20 + 50)/8 = 23.75');
  assert.deepEqual(a.parks, [['เขาใหญ่', 23.8], ['ทับลาน', 23.8], ['ปางสีดา', 23.8], ['ตาพระยา', 23.8]]);
  assert.deepEqual(a.top, { n: 'เขาใหญ่', v: 23.8, c: 1 });
  assert.deepEqual([a.pk, a.pkT, a.pkN, a.pc], [50, Date.parse('2026-11-15T06:00:00Z'), 'เขาใหญ่', 3], 'สูงสุด 13:00 น.');
  assert.deepEqual([b.d, b.mean, b.c, b.pk, b.pc], ['2026-11-16', 80, 4, 80, 4]);
  assert.equal(PMN[a.c], 'ดี');
});

test('camsSummary: ตารางไม่อัปเดตเกิน 2 วัน / ไม่มีไฟล์ → null', () => {
  assert.equal(camsSummary(Date.parse('2026-11-17T00:00:00Z'), 3, fixture('cams_grid.json')), null);
  assert.equal(camsSummary(NOW, 3, fixture('ไม่มีไฟล์.json')), null);
});

test('pmLevel: เกณฑ์กรมควบคุมมลพิษ 2566 (≤15 / ≤25 / ≤37.5 / ≤75 / >75)', () => {
  assert.deepEqual([0, 15, 15.1, 25, 25.1, 37.5, 37.6, 75, 75.1].map(pmLevel), [0, 0, 1, 1, 2, 2, 3, 3, 4]);
});
