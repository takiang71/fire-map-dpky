// F5 scripts/lib/fmodel.js — ดึงโค้ดโมเดลไฟจาก index.html มารันใน Node (ใช้กับ scripts/fire_model_eval.js)
//  · ค่าทดสอบเดิม (ปุ่ม #d-test: ลม 11 กม./ชม. จากทิศตะวันออก, ความชื้น 61%, 32.3 °C, ลาด 4°, เบญจพรรณ, 6 ชม.) → หัวไฟ 4.7 ม./นาที (ค่าที่ R0 สอบเทียบไว้)
//  · fuelAt ตามความสูงเมื่อไม่มีชนิดป่า · huy/hyAdj (โหมด Lagrangian) ลมคงที่ ≈ วงรี · slopeAt ต่อ demTile ฝั่ง Node (พื้นเอียงสังเคราะห์)
//  · lib/png.js readPNG อ่านไฟล์จาก palettePNG กลับได้ทุกพิกเซล
const test = require('node:test'), assert = require('node:assert/strict');
const { loadModel } = require('../scripts/lib/fmodel'), { readPNG, palettePNG } = require('../scripts/lib/png');
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} ≠ ${b} ±${e}`);
const TEST = { hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3, sl: 4, asp: null };

test('ค่าทดสอบเดิม 7.3 → หัวไฟ 4.7 ม./นาที (calc จาก index.html)', () => {
  const M = loadModel(), r = M.calc(TEST);
  near(r.Rh, 4.7, 1e-9, 'หัวไฟ'); assert.equal(M.FUEL[0].n, 'ป่าเบญจพรรณ');
  near(r.rai, r.ha * M.EH, 1e-9, 'ไร่ = เฮกตาร์ × 6.25'); assert.ok(r.rai > 1900 && r.rai < 2100, 'พื้นที่ 6 ชม. ' + r.rai);
  assert.equal(r.toDir, 270, 'ลมจากตะวันออก → หัวไฟไปตะวันตก');
  // ความชื้นสูงขึ้น = ลามช้าลง · ลมแรงขึ้น = ลามเร็วขึ้น
  assert.ok(M.calc({ ...TEST, rh: 85 }).Rh < r.Rh && M.calc({ ...TEST, u: 25 }).Rh > r.Rh);
});

test('fuelAt ไม่มีชนิดป่า/แปลง → ตามความสูง · สูงเกิน 1,000 ม. = ดิบเขา', () => {
  const M = loadModel(), g = { cons: null, resp: [] };
  assert.equal(M.fuelAt(g, 120, null).i, 1); assert.equal(M.fuelAt(g, 600, null).i, 0); assert.equal(M.fuelAt(g, 1200, null).i, 3);
  assert.equal(M.fuelAt(g, null, null).i, 0);
  assert.equal(M.fuelAt(g, 600, { k: 7, n: 'ป่าเต็งรัง', e: 0 }).i, 1, 'ชั้นชนิดป่า 2561 มาก่อนความสูง');
});

test('huy + hyAdj ลมคงที่ ≈ พื้นที่วงรี (คลาด < 5%)', () => {
  const M = loadModel(), r = M.calc(TEST);
  M.setP({ ...TEST, sm: 'l' }, null); const H = M.huy(r), a = M.hyAdj(r, H);
  near(a.rai / r.rai, 1, 0.05, 'Huygens/วงรี');
  M.setP({ ...TEST, sm: 'l' }, { u: Array(26).fill(11), d: Array(26).fill(90) }); near(M.hyAdj(r, M.huy(r)).rai, a.rai, 1e-6, 'WS คงที่ = ลมสไลเดอร์');
});

test('slopeAt ใช้ demTile ฝั่ง Node: พื้นสูงขึ้นไปทางตะวันออก 0.2 ม./ม. → ลาด 11.3° ลาดลงไปทิศตะวันตก', async () => {
  // ความสูง = 0.2 × ระยะทางทิศตะวันออก (เมตรตามมาตราส่วนเมอร์เคเตอร์ของละติจูด 14.4 ซูม 12)
  const z = 12, W = 256 * 2 ** z, m = 40075017 * Math.cos(14.4 * Math.PI / 180) / W;
  const demTile = async (zz, tx) => { const e = new Float32Array(65536); for (let i = 0; i < 65536; i++) e[i] = 0.2 * m * ((tx - 3200) * 256 + i % 256); return e };   /* ฐาน 3200 กันความละเอียด Float32 */
  const M = loadModel({ demTile }), s = await M.slopeAt(101.4, 14.4);
  near(s.s, Math.atan(0.2) * 180 / Math.PI, 0.05, 'ความลาด'); near(s.asp, 270, 0.5, 'ทิศลาดลง');
});

test('readPNG อ่าน palettePNG กลับได้ทุกพิกเซล (สี + โปร่งใส)', () => {
  const px = new Uint8Array(37 * 11).map((_, i) => (i * 7) % 3), pal = ['#000000', '#ff8000', '#12abcd'], al = [0, 255, 128];
  const r = readPNG(palettePNG(37, 11, px, pal, al)); assert.equal(r.w, 37); assert.equal(r.h, 11);
  const C = pal.map((c, k) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).concat(al[k]));
  for (let i = 0; i < px.length; i++) assert.deepEqual([...r.rgba.subarray(i * 4, i * 4 + 4)], C[px[i]]);
  assert.throws(() => readPNG(Buffer.from('not a png')), /PNG/);
});

test('fuelAt + เรือนยอดรอบจุด (แบบ ก 19 พ.ย. 69): ใช้เฉพาะเมื่อไม่ใช่ป่า · โล่ง ≥60% → เต็งรัง · >1,000 ม. → ดิบเขา · มัธยฐาน ≥10 ม. → ดิบแล้ง · อื่น → เบญจพรรณ · ค่าน้อยกว่า CHWN = กติกาเดิม', () => {
  const M = loadModel(), w = (op, md, n = 121) => ({ n, op, md });
  assert.equal(M.CHWN, 30);
  assert.deepEqual(M.chWinSum([0, 1, 1, 3, 12, 255, null, 20]), { n: 6, op: 0.5, md: 3 });
  assert.deepEqual(M.chWinSum([255, null]), { n: 0, op: 0, md: 0 });
  assert.equal(M.fuelAt(null, 600, null, w(0.6, 1)).i, 1);
  assert.match(M.fuelAt(null, 600, null, w(0.72, 1)).why, /โล่ง 72%.*เต็งรัง/);
  assert.equal(M.fuelAt(null, 600, null, w(0.59, 10)).i, 2);
  assert.equal(M.fuelAt(null, 600, null, w(0.3, 9)).i, 0);
  assert.equal(M.fuelAt(null, 1200, null, w(0.9, 0)).i, 1);           /* สูงเกิน 1,000 ม. แต่โล่ง = เต็งรัง (หญ้า) */
  assert.equal(M.fuelAt(null, 1200, null, w(0.2, 12)).i, 3);          /* สูงเกิน 1,000 ม. ไม่โล่ง = ดิบเขาตามเดิม */
  assert.equal(M.fuelAt(null, 200, null, w(0.9, 0, 29)).i, M.fuelByElev(200)); /* ค่าน้อย = ตามความสูงเหมือนเดิม */
  assert.equal(M.fuelAt(null, 600, { k: 3, n: 'ป่าดิบแล้ง', e: 0 }, w(0.9, 0)).i, 2); /* มีชนิดป่า = ชนิดป่ามาก่อนเสมอ */
});

test('fmodel.mtRun (MTT จากหน้าเว็บ): DEM ราบ + ยังไม่โหลดชนิดป่า = วงรี calc ±5% · ไฟถึงขอบ = ขยายกริด', async () => {
  const flat = async () => new Float32Array(65536);
  const M = require('../scripts/lib/fmodel.js').loadModel({ demTile: flat });
  const p = { sm: 'g', hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3, sl: 0, asp: null }; M.setP(p);
  const r = M.calc(p), m = await M.mtRun({ lon: 101.4, lat: 14.4 }, r.head * 1.35);
  assert.strictEqual(m.edge, false);
  assert.ok(Math.abs(m.lv[2].a / 1e4 * M.EH / r.rai - 1) < .05, String(m.lv[2].a));
  const s = await M.mtRun({ lon: 101.4, lat: 14.4 }, r.head * .3);
  assert.ok(s.ext > r.head * .3 && !s.edge, 'ext ' + s.ext);
});

test('mtGrid: แหล่งน้ำจริง (water.json) ไม่ติดไฟ ทั้งเชื้อเพลิงอัตโนมัติ/เลือกเอง · ไม่มีไฟล์ = wt false', async () => {
  const fs = require('fs'), path = require('path'), W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ftype', 'water.json'), 'utf8'));
  const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ftype', 'ftype.json'), 'utf8'));
  for (const k of ['x0', 'y0', 'px', 'w', 'h', 'z']) assert.equal(W[k], F[k], 'กริดตรง ftype: ' + k);
  assert.ok(W.n > 5e4);
  const M = loadModel({ demTile: async () => new Float32Array(65536) }); M.setP({ sm: 'g', hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3 });
  const at = { lon: 102.2216, lat: 14.4043 };
  assert.equal((await M.mtGrid(at, 1000)).wt, false);
  M.setMt(W); const G = await M.mtGrid(at, 1000), i0 = G.fc[G.fc.length - 1];
  assert.ok(G.wt && i0 > 100 && [...G.kf].filter(v => v === 0).length === i0, 'ช่องน้ำ ' + i0);
  const c = (G.N >> 1) * G.N + (G.N >> 1); assert.ok(G.kf[c] > 0, 'ช่องจุดไฟติดไฟเสมอ');
});
test('mtGrid: ช่องที่ไม่ใช่ป่าเลือกเชื้อเพลิงจากเรือนยอด (ไม่ใช่เชื้อเพลิงของจุด)', async () => {
  const M = loadModel({ demTile: async () => new Float32Array(65536) }); M.setFT(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'ftype', 'ftype.json'), 'utf8')));
  M.setP({ sm: 'g', hr: 6, fuel: 4, u: 11, from: 90, rh: 61, T: 32.3 });
  let at = null; for (let k = 0; k < 400 && !at; k++) { const p = { lon: 101.5 + k * .004, lat: 14.4 }; if ([-1, 0, 1].every(a => [-1, 0, 1].every(b => !M.ftAt(p.lon + a * .005, p.lat + b * .005)))) at = p }
  assert.ok(at); M.setMt(null, () => 0); const G = await M.mtGrid(at, 300);
  assert.equal(G.fc[1], G.N * G.N - 1, 'โล่ง = เต็งรัง'); assert.equal(G.fc[4], 1);
});
