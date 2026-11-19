// พื้นที่เฝ้าระวังพิเศษในชั้นราสเตอร์ (ผู้ใช้ขอ 19 พ.ย. 69): ชนิดป่า / ความสูงเรือนยอด / แหล่งเชื้อเพลิง / พื้นที่เผาไหม้ / เผาซ้ำซาก / ดัชนีเสี่ยง
// ป้ายต่อท้าย st[] (tamroypao.WA_PRE) — วาดบนแผนที่ แต่ไม่นับในยอดของกลุ่มป่าเสมอ
const { test } = require('node:test');
const assert = require('node:assert');
const { grab, load } = require('./helpers.cjs');

const T = require('../scripts/lib/tamroypao');
const { WATCH } = require('../scripts/lib/area');

test('tamroypao: พื้นที่เฝ้าระวังพิเศษต่อท้าย STN (ลำดับสถานีฯ เดิมไม่เลื่อน) · isWA · rasterize ติดป้ายในแนวเขตพื้นที่', () => {
  assert.ok(WATCH.length >= 1);
  const tail = T.STN.slice(-WATCH.length);
  assert.deepStrictEqual(tail, WATCH.map(a => T.WA_PRE + a.n));
  assert.ok(tail.every(T.isWA) && !T.STN.slice(0, -WATCH.length).some(T.isWA));
  // กริด UTM 47 ขนาด 200 ม. รอบกลางกรอบพื้นที่แรก → มีเซลล์ที่ได้ป้ายพื้นที่ (ar = 0 นอกพื้นที่อนุรักษ์)
  const { llToUTM } = require('../scripts/lib/tiff'), a = WATCH[0], [E, N] = llToUTM((a.bb[0] + a.bb[2]) / 2, (a.bb[1] + a.bb[3]) / 2, 47);
  const t = { w: 40, h: 40, x0: E - 4000, y0: N + 4000, px: [200, 200] }, M = T.rasterize(t, 47), k = T.STN.indexOf(T.WA_PRE + a.n);
  const n = M.st.filter(v => v === k).length;
  assert.ok(n > 100, 'เซลล์ในพื้นที่ ' + n);
  for (let i = 0; i < M.st.length; i++) if (M.st[i] === k) assert.strictEqual(M.ar[i], 0);
});

test('หน้าเว็บ WAS ตรงกับ tamroypao.isWA', () => {
  const src = grab(/(const WAS=s=>[^\n]*)/);
  const { WAS } = load(src, ['WAS']);
  for (const s of T.STN) assert.strictEqual(WAS(s), T.isWA(s), s);
  assert.strictEqual(WAS(undefined), false);
});

test('bnMerge/rpMerge: ค่าหน้ากาก 2 = พื้นที่เฝ้าระวังพิเศษ → คงในแถว (dy=2 วาดได้) แต่ไม่นับใน pr.all/x', () => {
  const L = load(grab(/\/\*WJ-LIB-BEGIN\*\/([\s\S]*?)\/\*WJ-LIB-END\*\//), ['wjLib']).wjLib();
  // ar 3 × st 2: (2,0) = พื้นที่เฝ้าระวังพิเศษ, (2,1) = ดงใหญ่
  const DY = Uint8Array.from([0, 0, 0, 0, 2, 1]);
  const F = JSON.stringify({ g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 0, 3, 1, 1, 1, 2, 0, 1, 1, 2, 0, 0, 1, 2, 1, 2, 1] } } });
  const o = L.bnMerge({ files: [F], C: false, dy: DY, ns: 2, BNPX: .25 });
  assert.strictEqual(o.n, 3);
  assert.deepStrictEqual(Array.from(o.dy), [0, 2, 1]);
  assert.deepStrictEqual(o.pr, [{ all: 1.25, x: .75, ca: [0, 1.25, 0, 0, 0, 0], cx: [0, .75, 0, 0, 0, 0] }], 'all ไม่รวมพื้นที่เฝ้าระวัง (0.25) · x ไม่รวมดงใหญ่ด้วย');
  const R = L.rpMerge({ text: { fy: [2569], n: 7, g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 0, 1, 1, 2, 0, 1] } } }, dy: DY, ns: 2 });
  assert.deepStrictEqual(Array.from(R.dy), [2]);
});

test('risksum: พื้นที่เฝ้าระวังพิเศษเป็นหน่วย wa แยก (ไม่ปนตำบล/สถานีฯ)', () => {
  const S = require('../scripts/lib/risksum'), P = S.points([]), W = P.filter(x => x.wa);
  assert.ok(W.length > 100, 'จุดพื้นที่เฝ้าระวัง ' + W.length);
  const U = S.units(P);
  assert.deepStrictEqual(Object.keys(U.wa), WATCH.map(a => 'พื้นที่เฝ้าระวังพิเศษ ' + a.n));
  for (const k of Object.keys(U.tm).concat(Object.keys(U.st))) assert.ok(!/^พื้นที่เฝ้าระวังพิเศษ/.test(k), k);
  const U0 = S.units(P.filter(x => !x.wa));
  assert.deepStrictEqual(Object.keys(U.tm).sort(), Object.keys(U0.tm).sort(), 'ตำบลเท่าเดิม');
  assert.deepStrictEqual(Object.keys(U.st).sort(), Object.keys(U0.st).sort(), 'สถานีฯ เท่าเดิม');
});

test('burnsum ตัดพื้นที่เฝ้าระวังพิเศษออกจากการ์ด LINE/Telegram', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'lib', 'burnsum.js'), 'utf8');
  assert.match(src, /WA\.test\(idx\.st\[s\]/);
});
