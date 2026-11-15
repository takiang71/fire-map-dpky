// ตัดระเบียนซ้ำของ API จุดความร้อนไทย (scripts/lib/dedup.js + สำเนา apiDups ใน index.html)
// ข้อมูลทดสอบสร้างตามลักษณะที่วัดจากข้อมูลจริง (หมายเหตุหัวไฟล์ dedup.js):
//   รอบซ้ำ = ทุกจุดมีคู่แฝด ตำแหน่งเหลื่อมคงที่ทั้งรอบ ~10–250 หน่วย (1e-5°) เวลาเท่ากันหรือช้ากว่า 1–3 นาที
//   รอบปกติ = จุดข้างเคียงจริงห่าง ≥ ขนาดพิกเซล VIIRS 375 ม. (~340 หน่วย) และมีคู่ <250 หน่วยแค่ 3–26% ของรอบ
const test = require('node:test'), assert = require('node:assert/strict');
const { apiDups, featDups, O } = require('../scripts/lib/dedup');
const { grab, load, rng } = require('./helpers.cjs');

// จุดฐานของรอบ: n จุดกระจายในกลุ่มป่า ห่างกันอย่างน้อย 1,500 หน่วย
function base(n, seed, s = 'NOAA20', m0 = 29000000) {
  const r = rng(seed), P = [];
  while (P.length < n) {
    const la = 1380000 + Math.round(r() * 80000), lo = 10120000 + Math.round(r() * 200000);
    if (P.every(p => Math.hypot(p.la - la, p.lo - lo) >= 1500)) P.push({ s, m: m0 + Math.floor(P.length / 15), la, lo });
  }
  return P;
}
// รอบซ้ำ: ชุดที่สอง (แฝด) เหลื่อม (dla, dlo) และช้ากว่า dm นาที — คืนรายการเรียงแบบที่ API ส่ง (ชุดแรกทั้งหมด แล้วชุดแฝด)
const twin = (P, dla, dlo, dm) => [...P, ...P.map(p => ({ ...p, m: p.m + dm, la: p.la + dla, lo: p.lo + dlo }))];

test('รอบซ้ำทั้งรอบ (แฝดช้ากว่า 1 นาที) → ทิ้งระเบียนเวลาเร็วกว่าครบทุกคู่', () => {
  for (const [dla, dlo] of [[87, -134], [-20, 15], [180, 150]]) {
    const P = twin(base(40, 1), dla, dlo, 1), D = apiDups(P);
    assert.equal(D.size, 40, `เหลื่อม ${dla},${dlo}`);
    assert.deepEqual([...D].sort((a, b) => a - b), [...Array(40).keys()], 'ต้องทิ้งชุดแรก (เวลาเร็วกว่า)');
  }
});

test('รอบซ้ำเวลาเท่ากัน → ทิ้งระเบียนที่มาก่อนในคำตอบ API', () => {
  const P = twin(base(35, 2), 60, 90, 0), D = apiDups(P);
  assert.equal(D.size, 35);
  for (let i = 0; i < 35; i++) assert.ok(D.has(i) && !D.has(i + 35));
});

test('รอบปกติ: จุดข้างเคียงจริง (ห่าง 1 พิกเซล) และคู่ใกล้ <250 หน่วยไม่เกิน 26% → ไม่ทิ้งเลย', () => {
  const P = base(40, 3);
  // จุดข้างเคียงจริงในแนวสแกนเดียวกัน ห่าง 340 หน่วย (≈375 ม.) 10 จุด
  for (let i = 0; i < 10; i++) P.push({ ...P[i], la: P[i].la + 340 });
  // คู่ที่ใกล้กว่า 250 หน่วย 5 คู่ (10 จุด จาก 55 = 18%)
  for (let i = 10; i < 15; i++) P.push({ ...P[i], lo: P[i].lo + 200 });
  assert.equal(apiDups(P).size, 0);
});

test('รอบเล็ก (<30 จุด) ที่ดูเหมือนซ้ำ: ไม่ทิ้งถ้าทั้งชุดเป็นแบบปกติ · ทิ้งถ้าทั้งชุดเป็นแบบซ้ำ', () => {
  const normal = base(60, 4, 'NOAA21', 29000000);                 /* รอบใหญ่ปกติของอีกดวง */
  const small = twin(base(6, 5, 'NOAA20', 29000600), 50, 50, 1);  /* รอบเล็ก 12 ระเบียน มีคู่ 100% */
  assert.equal(apiDups([...normal, ...small]).size, 0, 'ทั้งชุดส่วนใหญ่ปกติ = ตัดสินจากรอบเล็กไม่ได้');
  const D = apiDups([...twin(base(10, 6, 'NOAA21', 29000000), 70, -40, 2), ...small]);
  assert.equal(D.size, 16, 'ทั้งชุดเป็นแบบซ้ำ (≥20 ระเบียน, ≥60% มีคู่) = ตัดรอบเล็กด้วย');
});

test('แบ่งรอบตามดาวเทียมและช่วงเวลา: รอบซ้ำไม่ลามไปรอบปกติ', () => {
  const dup = twin(base(40, 7, 'NOAA20', 29000000), 100, 100, 1);
  const later = base(40, 8, 'NOAA20', 29000000 + 100);            /* ดวงเดียวกัน 100 นาทีต่อมา (รอบถัดไป) */
  const other = base(40, 9, 'NOAA21', 29000000);                  /* อีกดวง เวลาเดียวกัน */
  const D = apiDups([...dup, ...later, ...other]);
  assert.equal(D.size, 40);
  assert.ok([...D].every(i => i < 40));
});

test('จับคู่แบบหนึ่งต่อหนึ่ง: จุดจริงที่อยู่ติดกันในรอบซ้ำ ไม่ถูกทิ้งเกินจำนวนคู่', () => {
  const P = base(40, 10);
  P.push({ ...P[0], la: P[0].la + 340 });                          /* จุดจริงข้างเคียง 1 พิกเซล */
  const T = twin(P, 30, 30, 1), D = apiDups(T);
  assert.equal(D.size, 41);
  assert.equal(T.length - D.size, 41, 'เหลือจุดเท่าจำนวนจุดจริง');
});

test('featDups: อ่าน GeoJSON ของ API (full_date เวลาไทย, ชื่อดาวเทียมหลายแบบ) แล้วข้ามฟีเจอร์ที่ไม่มีพิกัด/เวลา', () => {
  const P = twin(base(30, 11), 90, -60, 1), z = n => String(n).padStart(2, '0');
  const F = P.map((p, i) => {
    const d = new Date(Date.UTC(2026, 0, 15, 13, 30) + (p.m - 29000000) * 6e4);
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lo / 1e5, p.la / 1e5] },
      properties: { satellite_name: i % 2 ? 'NOAA-20' : 'noaa20', full_date: `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:00` } };
  });
  F.splice(5, 0, { type: 'Feature', geometry: null, properties: {} });
  const D = featDups(F);
  assert.equal(D.size, 30);
  assert.ok(!D.has(5), 'ฟีเจอร์เสียไม่ถูกนับ');
  assert.ok([...D].every(i => i <= 30), 'ดัชนีอ้างตามลำดับฟีเจอร์เดิม (รวมตัวที่ข้าม)');
});

test('ค่าเกณฑ์ไม่ถูกแก้โดยไม่ตั้งใจ', () => {
  assert.deepEqual(O, { TW: 250, DT: 3, PAIR: 450, RATIO: 0.6, MINN: 30, ALLN: 20, GAP: 6 });
});

test('สำเนา apiDups ในหน้าเว็บ (index.html) ให้ผลเหมือน scripts/lib/dedup.js', () => {
  const { apiDups: web } = load(grab(/function apiDups\(P\)\{[\s\S]*?\n return drop\}/), ['apiDups']);
  const cases = [
    twin(base(40, 1), 87, -134, 1), twin(base(35, 2), 60, 90, 0), base(40, 3),
    [...base(60, 4, 'NOAA21'), ...twin(base(6, 5, 'NOAA20', 29000600), 50, 50, 1)],
    [...twin(base(40, 7), 100, 100, 1), ...base(40, 8, 'NOAA20', 29000100), ...base(40, 9, 'NOAA21')],
  ];
  for (const P of cases) assert.deepEqual([...web(P)].sort((a, b) => a - b), [...apiDups(P)].sort((a, b) => a - b));
});
