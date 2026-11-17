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
