// วงโคจรดาวเทียม SGP4 (scripts/lib/orbit.js) — ชุดตรวจมาตรฐานของ Vallado 2006 + สำเนาที่ฝังใน index.html + รอบผ่านกลุ่มป่า
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs');
const O = require('../scripts/lib/orbit');
const { HTML, fixture } = require('./helpers.cjs');
const V = JSON.parse(fs.readFileSync(fixture('vallado.json'), 'utf8'));

for (const id of ['00005', '28057']) test(`Vallado ${id}: ตำแหน่งตรงค่าอ้างอิง 0.000 ม. ทุกช่วงเวลา`, () => {
  const s = V.sats[id], sr = O.parse(s.l1, s.l2);
  assert.ok(s.rows.length >= 10);
  for (const [t, x, y, z, vx, vy, vz] of s.rows) {
    const p = O.sgp4(sr, t);
    const dr = Math.max(...p.r.map((a, i) => Math.abs(a - [x, y, z][i]))) * 1000, dv = Math.max(...p.v.map((a, i) => Math.abs(a - [vx, vy, vz][i])));
    assert.ok(dr < 0.0005, `t=${t} นาที คลาด ${dr.toFixed(6)} ม.`);
    assert.ok(dv < 2e-9, `t=${t} นาที ความเร็วคลาด ${dv} กม./วิ`);
  }
});

test('index.html ฝังสำเนา orbit.js ตรงกับไฟล์ (ถ้าไม่ตรง: node scripts/embed_orbit.js)', () => {
  const lib = fs.readFileSync(require.resolve('../scripts/lib/orbit'), 'utf8').replace(/\r\n/g, '\n');
  const cut = s => s.slice(s.indexOf('/*ORB-LIB-BEGIN*/'), s.indexOf('/*ORB-LIB-END*/'));
  assert.ok(HTML.includes('/*ORB-LIB-BEGIN*/'), 'ไม่พบเครื่องหมาย ORB-LIB ใน index.html');
  assert.equal(cut(HTML.replace(/\r\n/g, '\n')), cut(lib));
});

test('รอบผ่านกลุ่มป่า 24 ชม. (TLE ตัวอย่าง NOAA-20/21): เรียงเวลา อยู่ในแถบสแกน และระยะตรงกับตำแหน่งดาวเทียม', () => {
  const tle = JSON.parse(fs.readFileSync(fixture('tle.json'), 'utf8')), t0 = Date.parse(tle.upd);
  const P = O.next(tle, t0, 24);
  assert.ok(P.length >= 2 && P.length <= 8, `ได้ ${P.length} รอบ`);
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (i) assert.ok(p.t >= P[i - 1].t, 'เรียงตามเวลา');
    assert.ok(p.t >= t0 && p.t <= t0 + 24 * 36e5);
    assert.ok(p.ang <= O.SCANMAX, `มุมสแกน ${p.ang}`);
    assert.equal(p.edge, p.ang > O.EDGE);
    const s = O.parse(tle.sats[p.k].l1, tle.sats[p.k].l2), q = O.at(s, p.t);
    assert.ok(Math.abs(O.dist(q.lat, q.lon, O.DPKY[1], O.DPKY[0]) - p.km) < 1, 'ระยะจุดใต้ดาวเทียมถึงกลุ่มป่า');
    assert.ok(q.alt > 800 && q.alt < 860, `ความสูง ${q.alt} กม.`);
  }
  assert.ok(P.some(p => p.day) && P.some(p => !p.day), 'มีทั้งรอบกลางวันและกลางคืน');
  assert.match(O.label(P[0], t0), /^NOAA-2[01] [☀☾] \d\d:\d\d/);
});

test('มุมสแกน ↔ ระยะบนพื้น แปลงกลับได้ และฟังก์ชันระยะ/ทิศ', () => {
  for (const km of [0, 300, 900, 1500]) assert.ok(Math.abs(O.scanKm(O.scanAng(km, 830), 830) - km) < 1e-6);
  const [lo, la] = O.dest(14.13, 102.177, 45, 100);
  assert.ok(Math.abs(O.dist(14.13, 102.177, la, lo) - 100) < 1e-6);
  assert.ok(Math.abs(O.bearing(14.13, 102.177, la, lo) - 45) < 0.01);
});
