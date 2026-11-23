// MTT วงคาดการณ์ไฟ (23 พ.ย. 69): wjLib.mtSolve (Dijkstra 32 ทิศ + เส้นเวลาถึง) — ตรวจกับวงรี calc ที่รู้คำตอบ, แนวน้ำกั้นไฟ, ลาดชันเร่งไฟขึ้นเขา, ไฟถึงขอบกริด
const { test } = require('node:test');
const assert = require('node:assert');
const { grab, load } = require('./helpers.cjs');
const { loadModel } = require('../scripts/lib/fmodel.js');

const L = load(grab(/\/\*WJ-LIB-BEGIN\*\/([\s\S]*?)\/\*WJ-LIB-END\*\//), ['wjLib']).wjLib();
const M = loadModel({ GEO: {} });
const PWC = 7.47 * Math.exp(-.133 * 1500 ** .55), PWB = .02526 * 1500 ** .54;
const P0 = { sm: 'g', hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3, sl: 4, asp: null };

// ภูมิประเทศเรียบเท่ากันทั้งกริด: φS ชี้ไปทางเดียวกับลม (แบบ asp == null ของ calc) → ต้องได้วงรีเดียวกับ calc
function uniform(p, N = 129, edit) {
  const r = M.calc(p), ext = r.head * 1.35, cs = 2 * ext / (N - 1), NN = N * N, wt = (p.from + 180) % 360 * Math.PI / 180;
  const fw = M.spreadVec({ ...p, sl: 0 }).fe, fs = M.spreadVec(p).fe - fw, T = p.hr * 60;
  const o = { N, cs, kf: new Float32Array(NN).fill(M.R0 * M.FUEL[p.fuel].k), sx: new Float32Array(NN).fill(fs * Math.sin(wt)), sy: new Float32Array(NN).fill(fs * Math.cos(wt)),
    bd: T, wx: [fw * Math.sin(wt)], wy: [fw * Math.cos(wt)], et: [M.eta(M.emc(p.T, p.rh))], T, lv: [T / 3, 2 * T / 3, T], pc: PWC, pb: PWB };
  if (edit) edit(o, cs);
  return { r, o: L.mtSolve(o), cs, T };
}
const bbox = pl => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of pl) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]) } return { x0, x1, y0, y1 } };

test('mtSolve: ภูมิประเทศเรียบ = วงรี calc (ค่าทดสอบ 7.3: 1,999 ไร่ ±5%, หัว/ท้ายไฟ ±1 ช่อง)', () => {
  const { r, o, cs } = uniform(P0);
  assert.strictEqual(o.edge, false);
  assert.deepStrictEqual(o.lv.map(z => z.p.length), [1, 1, 1]);
  const rai = o.lv[2].a / 1e4 * M.EH; assert.ok(Math.abs(rai / r.rai - 1) < .05, 'ไร่ ' + rai);
  assert.ok(Math.abs(o.per / r.per - 1) < .05, 'เส้นรอบวง ' + o.per);
  const b = bbox(o.lv[2].p[0][0]); /* ลมพัดมาจากตะวันออก → หัวไฟไปตะวันตก (x ลบ) */
  assert.ok(Math.abs(-b.x0 - r.head) < cs && Math.abs(b.x1 - r.Rb * 360) < cs, JSON.stringify(b));
  assert.ok(o.lv[0].a < o.lv[1].a && o.lv[1].a < o.lv[2].a);
  const a1 = o.lv[0].a / 1e4 * M.EH; assert.ok(Math.abs(a1 / (r.rai / 9) - 1) < .08, 'วงแรก (1/3 ของเวลา) ≈ 1/9 ของพื้นที่ ' + a1);
});

test('mtSolve: ลมแรง/ลมสงบ ยังใกล้วงรี ±7%', () => {
  for (const p of [{ ...P0, u: 30 }, { ...P0, u: 2, sl: 0 }]) { const { r, o } = uniform(p); assert.ok(Math.abs(o.lv[2].a / 1e4 * M.EH / r.rai - 1) < .07, JSON.stringify(p)) }
});

test('mtSolve: แนวแหล่งน้ำ (kf = 0) กั้นไฟ — ไฟไม่ข้าม แม้ก้าวยาว 3 ช่อง', () => {
  let cs0 = 0;
  const { o, r } = uniform(P0, 129, (o, cs) => { cs0 = cs; for (let j = 0; j < 129; j++) for (let i = 50; i <= 51; i++) o.kf[j * 129 + i] = 0 }); /* แนวน้ำกว้าง 2 ช่อง ทางหัวไฟ (ตะวันตก) */
  const b = bbox(o.lv[2].p[0][0]), wall = (51 - 64) * cs0;
  assert.ok(b.x0 > wall - cs0, 'ไฟข้ามแนวน้ำ x0 ' + b.x0 + ' แนว ' + wall);
  assert.ok(o.lv[2].a / 1e4 * M.EH < r.rai * .9);
});

test('mtSolve: ลาดขึ้นไปทางเหนือ = ไฟลามไปเหนือไกลกว่าใต้ (ลมสงบ)', () => {
  const { o } = uniform({ ...P0, u: 0, sl: 0 }, 129, (o, cs) => { o.cs = cs * 8; const fs = M.spreadVec({ ...P0, u: 0, sl: 25, asp: 180 }).fe; o.sy.fill(fs) });
  const b = bbox(o.lv[2].p[0][0]); assert.strictEqual(o.edge, false); assert.ok(b.y1 > 2 * -b.y0, JSON.stringify(b));
});

test('mtSolve: กริดเล็กเกิน = edge true', () => {
  const { o } = uniform(P0, 129, (o, cs) => { o.cs = cs / 3 });
  assert.strictEqual(o.edge, true);
});
