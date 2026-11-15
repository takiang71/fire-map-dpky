// แนวเขตกลุ่มป่า (scripts/lib/area.js): where() ระบุพื้นที่อนุรักษ์/สถานีฯ/สบอ. · SBP · พื้นที่เฝ้าระวัง · ตรรกะเดียวกับ geoAt ในหน้าเว็บ
const test = require('node:test'), assert = require('node:assert/strict');
const { where, SBP, watchAt, GEO } = require('../scripts/lib/area');
const { grab, load } = require('./helpers.cjs');
const S1 = 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)', S7 = 'สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)';

// [ลองจิจูด, ละติจูด, พื้นที่, สถานีฯ, สบอ.] — จุดภายในแต่ละพื้นที่ (ห่างขอบ ≥1 กม.)
const PTS = [
  [101.40, 14.45, 'อุทยานแห่งชาติเขาใหญ่', 'สถานีควบคุมไฟป่าเขาใหญ่', S1],
  [101.65, 14.15, 'อุทยานแห่งชาติเขาใหญ่', 'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)', S1],
  [101.95, 14.40, 'อุทยานแห่งชาติทับลาน', 'สถานีควบคุมไฟป่าวังน้ำเขียว', S1],
  [102.40, 14.25, 'อุทยานแห่งชาติทับลาน', 'สถานีควบคุมไฟป่าทับลาน', S1],
  [102.15, 14.00, 'อุทยานแห่งชาติปางสีดา', 'ไม่มี', S1],
  [102.65, 14.05, 'อุทยานแห่งชาติตาพระยา', 'สถานีควบคุมไฟป่าตาพระยา - ปางสีดา', S1],
  [102.45, 14.15, 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', 'สถานีควบคุมไฟป่าดงใหญ่', S7],
  [102.60, 13.95, 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมการ)', 'ไม่มี', S1],
  [102.21, 13.661, 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)', 'ไม่มี', S1],
];

test('where(): จุดในแต่ละพื้นที่อนุรักษ์ได้ชื่อพื้นที่/สถานีฯ/สบอ. ถูกต้อง (ชื่อตรง dictionary ของ Excel)', () => {
  for (const [lo, la, ar, st, sb] of PTS) assert.deepEqual(where(lo, la), { ar, st, sb }, `${lo},${la}`);
});

test('where(): นอกแนวเขต = null (กรุงเทพฯ, นอกกรอบ, ในกรอบแต่ไม่อยู่ในพื้นที่ใด)', () => {
  assert.equal(where(100.50, 13.75), null);
  assert.equal(where(105, 15), null);
  assert.equal(where(101.30, 13.70), null);
  assert.equal(where(101.20, 14.33), null, 'จปร. อยู่นอกแนวเขตกลุ่มป่า');
});

test('ดงใหญ่สังกัด สบอ.7 ส่วนพื้นที่อื่นทั้งหมด สบอ.1 (ค่าเริ่มต้นตัวชี้วัดไม่รวมดงใหญ่)', () => {
  const sb = new Set(GEO.cons.features.filter(f => !/ดงใหญ่/.test(f.properties.name)).map(f => f.properties.paro));
  assert.deepEqual([...sb], [S1]);
  assert.equal(GEO.cons.features.find(f => /ดงใหญ่/.test(f.properties.name)).properties.paro, S7);
  assert.equal(GEO.cons.features.length, 7);
});

test('SBP: สบอ. ตามจังหวัดที่เกิดจุด', () => {
  for (const p of ['ปราจีนบุรี', 'นครนายก', 'สระแก้ว']) assert.equal(SBP[p], S1);
  assert.equal(SBP['สระบุรี'], 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 สาขาสระบุรี');
  for (const p of ['นครราชสีมา', 'บุรีรัมย์']) assert.equal(SBP[p], S7);
  assert.equal(SBP['ไม่ระบุ'], undefined, 'จังหวัดอื่น = ใช้ตามแนวเขต');
});

test('watchAt(): พื้นที่เฝ้าระวัง จปร. แยกจากกลุ่มป่า', () => {
  assert.equal(watchAt(101.16, 14.32), 'jpr');
  assert.equal(watchAt(101.15, 14.30), 'jpr');
  assert.equal(watchAt(101.20, 14.33), null);
  assert.equal(watchAt(102.0, 14.2), null);
});

test('geoAt ในหน้าเว็บ ให้พื้นที่/สถานีฯ เดียวกับ where() (ตารางทุก 0.05° ทั่วกลุ่มป่า)', () => {
  const src = grab(/const inside=\(q,r\)=>[^\n]*/) + '\n' + grab(/const inFeat=\(q,f\)=>[^\n]*/) + '\n' + grab(/const geoAt=\(lon,lat\)=>[^\n]*/);
  const { geoAt } = load(src, ['geoAt'], { GEO });
  let n = 0;
  for (let i = 2020; i <= 2066; i++) for (let j = 272; j <= 294; j++) {
    const lo = i * .05, la = j * .05, w = where(lo, la), g = geoAt(lo, la);
    if (!w) { assert.ok(!g.cons && !g.resp.length, `${lo},${la}`); continue }
    n++;
    assert.equal(g.cons ? g.cons.properties.name.replace(/^เตรียมประกาศเป็น(.*)$/, '$1 (เตรียมการ)') : 'นอกพื้นที่อนุรักษ์', w.ar, `${lo},${la}`);
    const m = g.resp.find(f => !/พื้นที่รอง/.test(f.properties.station)) || g.resp[0];
    assert.equal(m ? m.properties.station.replace(/\s*\(พื้นที่รอง\)/, '').trim() : 'ไม่มี', w.st, `${lo},${la}`);
  }
  assert.ok(n > 200, `จุดในแนวเขต ${n}`);
});
