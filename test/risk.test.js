// F2 scripts/lib/risk.js — ดัชนีเสี่ยงไฟป่าของระบบนี้ (ไม่ใช่ค่าทางการ)
//  · fwiDay: ชุดทดสอบมาตรฐานของ Van Wagner & Pickett (1985) แถวแรก 17°C 42% 25 กม./ชม. ฝน 0 เมษายน (ละติจูดแคนาดา) → FFMC 87.7 DMC 8.5 DC 19.0 ISI 10.9 BUI 8.5 FWI 10.1
//    + ฝนตกหนักลด FFMC/DMC/DC · ละติจูดเขตร้อนใช้ค่าปรับ (DC 1.4 ทุกเดือน)
//  · dekad / fyOf / fyDays (รอยต่อ 1 ต.ค.) · climBuild (หดเข้าค่ารวม, ไม่นับปีที่ไม่ได้เลือก, เรียบรอบปี) · auc / confusion / fitLogit (กู้สัมประสิทธิ์ข้อมูลสังเคราะห์)
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../scripts/lib/risk'), { rng } = require('./helpers.cjs');
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} ≠ ${b} ±${e}`);
const day = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;

test('fwiDay ตรงชุดทดสอบมาตรฐาน Van Wagner', () => {
  const o = R.fwiDay(null, { t: 17, h: 42, w: 25, p: 0 }, 46, 4);
  near(o.ffmc, 87.7, 0.05, 'FFMC'); near(o.dmc, 8.5, 0.05, 'DMC'); near(o.dc, 19.0, 0.05, 'DC');
  near(o.isi, 10.9, 0.06, 'ISI'); near(o.bui, 8.5, 0.05, 'BUI'); near(o.fwi, 10.1, 0.05, 'FWI');
});
test('fwiDay ฝนตกหนักลดดัชนี · เขตร้อน DC ใช้ 1.4', () => {
  const dry = R.fwiDay({ ffmc: 92, dmc: 60, dc: 400 }, { t: 35, h: 30, w: 15, p: 0 }, 14, 3);
  const wet = R.fwiDay({ ffmc: 92, dmc: 60, dc: 400 }, { t: 30, h: 80, w: 5, p: 40 }, 14, 3);
  assert.ok(wet.ffmc < dry.ffmc - 20 && wet.dmc < dry.dmc && wet.dc < dry.dc && wet.fwi < dry.fwi);
  const t = R.fwiDay({ ffmc: 85, dmc: 6, dc: 15 }, { t: 30, h: 50, w: 10, p: 0 }, 14, 1);
  near(t.dc - 15, 0.5 * (0.36 * (30 + 2.8) + 1.4), 1e-9, 'DC เขตร้อน');
});
test('dekad / fyOf / fyDays', () => {
  assert.equal(R.dekad(day(2026, 1, 1)), 0); assert.equal(R.dekad(day(2026, 1, 11)), 1); assert.equal(R.dekad(day(2026, 1, 31)), 2); assert.equal(R.dekad(day(2026, 12, 31)), 35);
  assert.equal(R.fyOf(day(2025, 9, 30)), 2568); assert.equal(R.fyOf(day(2025, 10, 1)), 2569);
  assert.deepEqual(R.fyDays(2569), [day(2025, 10, 1), day(2026, 9, 30)]);
});
test('climBuild: หดเข้าค่ารวม + ไม่นับปีที่ไม่ได้เลือก + เรียบรอบปี', () => {
  const f = { a: new Set([day(2025, 3, 5), day(2025, 3, 6), day(2026, 3, 5)]), b: new Set() };
  const c = R.climBuild(f, ['a', 'b'], [2568], 60), k = R.dekad(day(2025, 3, 5));
  assert.ok(c.u.a[k] > c.g[k] && c.g[k] > c.u.b[k] && c.u.b[k] > 0, 'หน่วยที่มีไฟ > ค่ารวม > หน่วยไม่มีไฟ > 0');
  near(c.g[k], 0.5 * 2 / (10 * 2), 1e-12, 'ค่ารวม = ½ ของช่วงนั้น (เรียบ) — ปีงบ 2569 ไม่นับ');
  near(c.g[k - 1], 0.25 * 2 / 20, 1e-12, 'ช่วงข้างเคียงได้ ¼');
  assert.equal(c.g[(k + 18) % 36], 0);
});
test('auc / confusion / brier', () => {
  assert.equal(R.auc([1, 2, 3, 4], [0, 0, 1, 1]), 1); assert.equal(R.auc([4, 3, 2, 1], [0, 0, 1, 1]), 0); assert.equal(R.auc([1, 1, 1, 1], [0, 1, 0, 1]), 0.5);
  const c = R.confusion([1, 5, 4, 2, 5], [0, 1, 0, 1, 0], 4);
  assert.deepEqual([c.tp, c.fp, c.fn, c.tn], [1, 2, 1, 1]); assert.equal(c.rows[4].n, 2); assert.equal(c.rows[4].fire, 1);
  assert.equal(R.level(0.2, [0.01, 0.02, 0.05, 0.1]), 5); assert.equal(R.level(0.001, [0.01, 0.02, 0.05, 0.1]), 1);
  assert.ok(R.brier([0, 1], [0, 1]).bss === 1);
});
test('fitLogit กู้สัมประสิทธิ์จากข้อมูลสังเคราะห์', () => {
  const r = rng(7), X = [], y = [], b = [-3, 1.2, 0.8];
  for (let i = 0; i < 20000; i++) { const x = [1, r() * 4 - 2, r() * 3]; X.push(x); y.push(r() < R.prob(x, b) ? 1 : 0) }
  const f = R.fitLogit(X, y, [0, 1, 2], 0);
  f.forEach((v, i) => near(v, b[i], 0.15, 'b' + i));
  const g = R.fitLogit(X, y, [0, 2], 0); assert.equal(g[1], 0, 'คอลัมน์ที่ไม่ใช้ = 0');
});
