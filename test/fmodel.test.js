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
test('เชื้อเพลิงเริ่มต้นนอกป่า: นครราชสีมา/บุรีรัมย์ = อ้อย จังหวัดอื่น = ข้าว · ในป่า/ยังไม่รู้จังหวัด = กติกาเดิม · MTT ช่องนอกป่าใช้พืชเดียวกัน', async () => {
  const M = loadModel({ demTile: async () => new Float32Array(65536) }), h = { lon: 102, lat: 14.3 };
  assert.equal(M.cropAt(h), null, 'แนวเขตยังไม่โหลด');
  assert.equal(M.cropAt({ ...h, prov: 'ไม่ระบุ' }), null);
  assert.equal(M.cropAt({ ...h, prov: 'บุรีรัมย์' }).i, 7);
  for (const [p, i] of [['นครราชสีมา', 7], ['บุรีรัมย์', 7], ['ปราจีนบุรี', 5], ['สระแก้ว', 5], ['สระบุรี', 5], ['นครนายก', 5]]) { M.setAdm(() => ({ p })); const c = M.cropAt({ ...h, prov: 'อื่น' }); assert.equal(c.i, i, p); for (const cw of [null, { n: 99, op: .9, md: 0 }, { n: 99, op: .1, md: 4 }, { n: 20, op: 0, md: 20 }]) { const f = M.fuelAt(null, 600, null, cw, c); assert.equal(f.i, i, p + JSON.stringify(cw)); assert.match(f.why, new RegExp('จ.' + p)) }
    assert.equal(M.fuelAt(null, 600, null, { n: 99, op: .1, md: 5 }, c).i, 0, 'เรือนยอด ≥5 ม. = เบญจพรรณ'); assert.equal(M.fuelAt(null, 600, null, { n: 99, op: 0, md: 10 }, c).i, 2, '≥10 ม. = ดิบแล้ง') }
  assert.equal(M.fuelAt(null, 600, { k: 3, n: 'ป่าดิบแล้ง', e: 0 }, null, { i: 7, p: 'x' }).i, 2, 'มีชนิดป่า = ชนิดป่าก่อน');
  M.setFT(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'ftype', 'ftype.json'), 'utf8')));
  M.setP({ sm: 'g', hr: 6, fuel: 2, u: 11, from: 90, rh: 61, T: 32.3 });
  for (const [p, i] of [['นครราชสีมา', 7], ['ปราจีนบุรี', 5]]) { M.setAdm(() => ({ p })); const G = await M.mtGrid({ lon: 101.3712, lat: 14.4302 }, 300); assert.equal(G.cp, i); assert.ok(G.fc[i] > 1000, p + ' ' + G.fc);
    M.setMt(null, () => 8); const K = await M.mtGrid({ lon: 101.3712, lat: 14.4302 }, 300); assert.ok(K.ch && K.fc[i] === 0 && K.fc[0] >= G.fc[i], 'ช่องเรือนยอด 8 ม. = เบญจพรรณ ' + K.fc); M.setMt(null, () => 3); assert.equal((await M.mtGrid({ lon: 101.3712, lat: 14.4302 }, 300)).fc[i], G.fc[i], 'เรือนยอด 3 ม. = พืช'); M.setMt(null) }
  M.setAdm(null); const G = await M.mtGrid({ lon: 101.3712, lat: 14.4302 }, 300); assert.equal(G.cp, -1); assert.equal(G.fc[5] + G.fc[7], 0);
});

test('เชื้อเพลิงเกษตร: 3 แบบท้ายตาราง · ค่าตามที่มา · fuelAt ไม่เลือกอัตโนมัติ · MTT ช่องป่ายังเป็นป่า นอกป่า = พืช', async () => {
  const M = loadModel({ demTile: async () => new Float32Array(65536) }), C = M.FUEL.map((f, i) => [f, i]).filter(x => x[0].cr);
  assert.deepEqual(C.map(x => [x[1], x[0].w, x[0].cf]), [[5, .3, .8], [6, .93, .8], [7, .92, .83]]);
  for (const cw of [null, { n: 99, op: 1, md: 0 }, { n: 99, op: 0, md: 20 }]) assert.ok(M.fuelAt(null, 100, null, cw).i < 5);
  M.setFT(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'ftype', 'ftype.json'), 'utf8')));
  M.setP({ sm: 'g', hr: 6, fuel: 7, u: 11, from: 90, rh: 61, T: 32.3 }); M.setAuto(false);
  const G = await M.mtGrid({ lon: 101.3712, lat: 14.4302 }, 300); const cl = Math.cos(14.4302 * Math.PI / 180) * 111320; let nf = 0; for (let j = 0; j < G.N; j++) for (let i = 0; i < G.N; i++) { const f = M.ftAt(101.3712 + (i - 64) * G.cs / cl, 14.4302 + (j - 64) * G.cs / 110574); if (!f || (i === 64 && j === 64)) nf++ } assert.ok(nf < G.N * G.N * .9); assert.equal(G.fc[7], nf, 'พืชเฉพาะช่องนอกป่า + ช่องจุดไฟ');
  let at = null; for (let k = 0; k < 400 && !at; k++) { const p = { lon: 101.5 + k * .004, lat: 14.4 }; if ([-1, 0, 1].every(a => [-1, 0, 1].every(b => !M.ftAt(p.lon + a * .005, p.lat + b * .005)))) at = p }
  const N = await M.mtGrid(at, 300); assert.equal(N.fc[7], N.N * N.N, 'นอกป่า = พืชทุกช่อง');
  M.setP({ sm: 'g', hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3 }); const U = await M.mtGrid({ lon: 101.3712, lat: 14.4302 }, 300); assert.equal(U.fc[0], U.N * U.N, 'เลือกชนิดป่าเอง = ทุกช่องเหมือนเดิม');
});
