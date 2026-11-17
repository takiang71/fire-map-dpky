// B2 (17 พ.ย. 69): ฟังก์ชันบริสุทธิ์ใน wjLib (index.html ระหว่าง WJ-LIB-BEGIN/END) ที่รันใน Web Worker — กองจุดความร้อน (hcLink/hcHull/hcGroups),
// ภูมิประเทศ (trBuild/trHorn/trSA/trContours) และพื้นที่เผาไหม้ (bnMerge) · ตรวจกับตารางเล็กและไฟล์ตัวอย่างที่รู้คำตอบ
// และกันไม่ให้ lib แตะ DOM/map/S (ต้องรันใน Worker ได้)
const { test } = require('node:test');
const assert = require('node:assert');
const { grab, load } = require('./helpers.cjs');

const SRC = grab(/\/\*WJ-LIB-BEGIN\*\/([\s\S]*?)\/\*WJ-LIB-END\*\//);
const L = load(SRC, ['wjLib']).wjLib();
const f64 = a => Float64Array.from(a);
const csr = (off, idx) => { const o = []; for (let i = 0; i < off.length - 1; i++) o.push(Array.from(idx.subarray(off[i], off[i + 1]))); return o };

test('wjLib ไม่อ้างถึง DOM/map/S/localStorage (ต้องรันใน Worker ได้)', () => {
  for (const re of [/\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bmap\.(get|set|add|on)\w*\(/, /[^\w.]S\.(xdy|hc[lpdgr]|burn|sats|base)\b/, /\$\(/, /\bfetchT?\(/, /\bHCC\b|\bTR\.|\bBND\b|\bBNK\b/]) assert.ok(!re.test(SRC), 'พบ ' + re);
  assert.deepStrictEqual(Object.keys(L).sort(), ['bnHotCalc', 'bnLL', 'bnM', 'bnMerge', 'hcGroups', 'hcHull', 'hcLink', 'rpMerge', 'tlPut', 'tlTile', 'trBuild', 'trContours', 'trElev', 'trHorn', 'trLa', 'trLo', 'trMpp', 'trSA', 'trW', 'trX', 'trY']);
});

// ---------- กองจุดความร้อน ----------
// จุด A, B ห่าง 500 ม. วันเดียวกัน · C ห่างจาก B 800 ม. (จาก A 1,300 ม.) วันเดียวกัน → ลูกโซ่ A-B-C กองเดียว · D ที่ตำแหน่ง A วันถัดไป · E ไกล 5 กม.
const DEG = 1 / (Math.cos(14.3 * Math.PI / 180) * 111320); // องศาลองจิจูดต่อเมตร (สูตรเดียวกับ hcLink)
const PTS = [[101.5, 14.3, 100], [101.5 + 500 * DEG, 14.3, 100], [101.5 + 1300 * DEG, 14.3, 100], [101.5, 14.3, 101], [101.5 + 5000 * DEG, 14.3, 100]];
const lo = f64(PTS.map(p => p[0])), la = f64(PTS.map(p => p[1])), d = f64(PTS.map(p => p[2]));

test('hcLink: เชื่อมแบบลูกโซ่ ≤ HCD · gap วัน · ลำดับกลุ่มตามสมาชิกตัวแรก', () => {
  const C = L.hcLink(lo, la, d, 1000, 0);
  assert.deepStrictEqual(csr(C.off, C.idx), [[0, 1, 2], [3], [4]]);
  const G = L.hcLink(lo, la, d, 1000, 2);
  assert.deepStrictEqual(csr(G.off, G.idx), [[0, 1, 2, 3], [4]], 'D (วันถัดไป ตำแหน่ง A) รวมกับกอง A-B-C');
  const N = L.hcLink(lo, la, d, 400, 2);
  assert.deepStrictEqual(csr(N.off, N.idx), [[0, 3], [1], [2], [4]], 'HCD 400 ม. = ไม่เชื่อม');
});

test('hcHull: จุดเดียว = 16 เหลี่ยมรัศมี HCR · วงแหวนปิด · ไร่ตามสูตร · สองจุด = รูปยาว', () => {
  const h = L.hcHull(lo, la, Int32Array.from([4]), 0, 1, 200);
  assert.strictEqual(h.ring.length, 17); assert.deepStrictEqual(h.ring[0], h.ring[16]);
  const exp = 8 * 200 * 200 * Math.sin(Math.PI / 8) / 1600; // พื้นที่ 16 เหลี่ยมด้านเท่า = 8 r² sin(22.5°)
  assert.ok(Math.abs(h.rai - exp) < 1e-9, h.rai + ' vs ' + exp);
  const h2 = L.hcHull(lo, la, Int32Array.from([0, 1]), 0, 2, 200);
  assert.ok(Math.abs(h2.rai - (exp + 500 * 400 / 1600)) < 1e-6, 'สองจุดห่าง 500 ม. = 16 เหลี่ยม + สี่เหลี่ยม 500×400');
  assert.ok(h2.ring.every(([x, y]) => x >= 101.5 - 201 * DEG && x <= 101.5 + 701 * DEG && Math.abs(y - 14.3) < 201 / 110574));
});

test('hcGroups: CSR ทั้งสองชุด + ring/rai ต่อกองรวม + __t โอน buffer', () => {
  const o = L.hcGroups({ lo, la, d, HCD: 1000, HCG: 2, HCR: 200 });
  assert.deepStrictEqual(csr(o.cOff, o.cIdx), [[0, 1, 2], [3], [4]]);
  assert.deepStrictEqual(csr(o.gOff, o.gIdx), [[0, 1, 2, 3], [4]]);
  assert.strictEqual(o.rai.length, 2); assert.ok(o.rai[0] > o.rai[1]);
  assert.strictEqual(o.rOff[2] * 2, o.ring.length);
  const r1 = L.hcHull(lo, la, o.gIdx, o.gOff[1], o.gOff[2], 200);
  assert.deepStrictEqual(Array.from(o.ring.subarray(o.rOff[1] * 2)), r1.ring.flat());
  assert.strictEqual(o.__t.length, 7);
  const e = L.hcGroups({ lo: f64([]), la: f64([]), d: f64([]), HCD: 1000, HCG: 2, HCR: 200 });
  assert.deepStrictEqual([e.cOff.length, e.gOff.length, e.rai.length], [1, 1, 0], 'ไม่มีจุด');
});

// ---------- ภูมิประเทศ ----------
test('trHorn: ระนาบเอียง → ลาดชัน atan(ความชัน) · ทิศด้านลาด = ทิศที่ลาดลง', () => {
  const W = 3, E = f64([0, 1, 2, 0, 1, 2, 0, 1, 2]); // สูงขึ้นไปทางตะวันออก 1 ม./ช่อง
  const [s, a] = L.trHorn(E, 4, W, 1);
  assert.ok(Math.abs(s - 45) < 1e-9); assert.ok(Math.abs(a - 270) < 1e-9, 'ลาดลงทางตะวันตก');
  const [s2, a2] = L.trHorn(f64([0, 0, 0, 1, 1, 1, 2, 2, 2]), 4, W, 2); // สูงขึ้นไปทางใต้ 1 ม./ช่อง ช่อง 2 ม.
  assert.ok(Math.abs(s2 - Math.atan(.5) * 180 / Math.PI) < 1e-9); assert.ok(Math.abs(a2 - 0) < 1e-9, 'ลาดลงทางเหนือ');
  assert.deepStrictEqual(L.trHorn(f64(Array(9).fill(7)), 4, W, 1), [0, 0], 'ราบ');
});

// แผ่น DEM 256×256 ค่า = x (ม.) ที่ซูม 1 แผ่น (0,0) · ตาราง 6×6 ช่องกว้าง 1 พิกเซล เริ่ม (0,0) · รูป = สี่เหลี่ยมคลุมช่อง 1..4
function grid() {
  const t = new Float32Array(65536); for (let i = 0; i < 65536; i++) t[i] = i % 256;
  const V = f64([1, 1, 5, 1, 5, 5, 1, 5]);
  return { W: 6, H: 6, Ox: 0, Oy: 0, c: 1, z: 1, V, tk: f64([0]), td: [t] };
}
test('trBuild: ค่าช่อง = bilinear กลางช่อง · หน้ากาก scanline · ตร.ม./ช่อง · สถิติความสูง', () => {
  const G = L.trBuild(grid());
  assert.strictEqual(G.E.length, 36);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) assert.strictEqual(G.E[j * 6 + i], i, `E(${i},${j})`); // กลางช่อง i+.5 → ค่า x = i
  assert.strictEqual(G.nin, 16); assert.deepStrictEqual(Array.from(G.M), [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  const m = L.trMpp(1, L.trLa(.5, 1)); assert.ok(Math.abs(G.ar[0] - m * m) < 1e-6, 'ตร.ม. ต่อช่องแถวแรก');
  assert.strictEqual(G.el.mn, 1); assert.strictEqual(G.el.mx, 4); assert.ok(G.el.a > 0 && Math.abs(G.el.av - 2.5) < 1e-6);
  assert.deepStrictEqual(G.__t, [G.E.buffer, G.M.buffer, G.ar.buffer]);
  const o = L.trBuild(Object.assign(grid(), { td: [] })); assert.ok(isNaN(o.E[0]) && o.nin === 16 && o.el.mn === Infinity, 'ไม่มีแผ่น = NaN');
});

test('trSA: ลาดชันคำนวณเฉพาะช่องในหน้ากาก (ไม่ใช่ขอบตาราง) · ระนาบเอียงทุกช่องเท่ากัน', () => {
  const g = grid(), G = L.trBuild(g), SA = L.trSA({ W: 6, H: 6, E: G.E, M: G.M, c: 1, z: 1, Oy: 0 });
  const m = 1 * L.trMpp(1, L.trLa(1.5, 1)), exp = Math.atan(1 / m) * 180 / Math.PI; // สูงขึ้น 1 ม. ต่อช่อง m ม.
  assert.ok(isNaN(SA.S[0]) && isNaN(SA.A[0]), 'นอกหน้ากาก = NaN');
  assert.ok(Math.abs(SA.S[7] - exp) < 1e-6 && Math.abs(SA.A[7] - 270) < 1e-6);
  assert.strictEqual(SA.__t.length, 2);
});

test('trContours: ระนาบเอียง (ระยะ 1 ม.) → เส้นแนวตั้ง 1 เส้นต่อระดับ ระดับละ ~1 ช่อง · kk = ความสูง/iv · เพดานจุดยอด', () => {
  const W = 12, H = 12, E = new Float32Array(W * H); for (let k = 0; k < W * H; k++) E[k] = 10 * (k % W); // 0..110 ม. ขึ้นทางตะวันออก
  const M = new Uint8Array(W * H).fill(1), ar = f64(Array(H).fill(1));
  const C = L.trContours({ W, H, E, M, ar, Ox: 0, Oy: 0, c: 1, z: 1 }, 10, 1e6);
  assert.strictEqual(C.el.mn, 0); assert.strictEqual(C.el.mx, 110);
  assert.deepStrictEqual(Array.from(C.kk).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'ระดับ 10..100 (ระดับ 0 และ 110 อยู่ขอบพอดี ไม่มีเส้น)');
  assert.strictEqual(C.nl, 10); assert.ok(!C.over);
  assert.strictEqual(C.off.length, 11); assert.strictEqual(C.xy.length, C.off[10] * 2);
  // เส้นระดับ 50 (kk=5) ไกลขอบ: ลองจิจูดทุกจุดเท่ากัน (เส้นตรงแนวเหนือ-ใต้) และอยู่ที่ x = 5 ช่อง
  const i5 = Array.from(C.kk).indexOf(5), xs = []; for (let j = C.off[i5]; j < C.off[i5 + 1]; j++) xs.push(C.xy[2 * j]);
  assert.ok(xs.every(x => Math.abs(x - xs[0]) < 1e-6), 'เส้นตรง');
  assert.ok(Math.abs(xs[0] - L.trLo(5.5, 1)) < 1e-5, 'กึ่งกลางช่องที่ 5');
  assert.ok(C.len > 0);
  const o = L.trContours({ W, H, E, M, ar, Ox: 0, Oy: 0, c: 1, z: 1 }, 10, 5); assert.ok(o.over, 'เกินเพดานจุดยอด');
  const n = L.trContours({ W, H, E: new Float32Array(W * H).fill(3), M, ar, Ox: 0, Oy: 0, c: 1, z: 1 }, 10, 1e6); assert.strictEqual(n.nl, 0, 'ราบ = ไม่มีเส้น');
});

// ---------- พื้นที่เผาไหม้ ----------
// 2 รอบ กริดเดียว: รอบ 1 แถว y=1 ช่อง x=0..2 (ประเภท 1 พื้นที่ 1 สถานี 1) · รอบ 2 แถว y=1 ช่อง x=1..3 (พื้นที่ 1 สถานี 1) + แถว y=3 ช่อง x=0 พื้นที่ 2 สถานี 0 (ดงใหญ่)
const F1 = JSON.stringify({ g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 0, 3, 1, 1, 1] } } });
const F2 = JSON.stringify({ g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 1, 3, 1, 1, 1, 2, 0, 1, 1, 2, 0] } } });
const DY = Uint8Array.from([0, 0, 0, 0, 1, 1]); // ar 3 × st 2: พื้นที่ 2 = ดงใหญ่

test('bnMerge: รวมพิกเซลไม่นับซ้ำ · B4 นับครั้งสะสม · f/l รอบแรก/ล่าสุด · pr ไร่ต่อรอบ (x = ไม่รวมดงใหญ่)', () => {
  const o = L.bnMerge({ files: [F1, F2], C: false, dy: DY, ns: 2, BNPX: .25 });
  assert.strictEqual(o.n, 4);
  const rows = []; for (let i = 0; i < o.n; i++) rows.push(Array.from(o.v.subarray(i * 8, i * 8 + 8)));
  assert.deepStrictEqual(rows, [[1, 0, 1, 1, 1, 1, 0, 0], [1, 1, 2, 2, 1, 1, 0, 1], [1, 3, 1, 1, 1, 1, 1, 1], [3, 0, 1, 1, 2, 0, 1, 1]], 'y,x,n,v,a,s,f,l');
  assert.deepStrictEqual(Array.from(o.dy), [0, 0, 0, 1]);
  assert.deepStrictEqual(o.pr, [{ all: .75, x: .75, ca: [0, .75, 0, 0, 0, 0], cx: [0, .75, 0, 0, 0, 0] }, { all: 1, x: .75, ca: [0, 1, 0, 0, 0, 0], cx: [0, .75, 0, 0, 0, 0] }]);
  // พิกัด: โซน 47 E 800000 N 1600000 ≈ 101.78°E 14.47°N · bb ครอบ q · แถวถัดไป (y มากขึ้น = ใต้) ค่า y เมอร์เคเตอร์มากขึ้น
  const [lon, lat] = L.bnLL(800000, 1600000, 47); assert.ok(Math.abs(lon - 101.78) < .02 && Math.abs(lat - 14.47) < .02, lon + ',' + lat);
  const bb = i => Array.from(o.bb.subarray(i * 4, i * 4 + 4)), q = i => Array.from(o.q.subarray(i * 8, i * 8 + 8));
  for (let i = 0; i < o.n; i++) { const b = bb(i), Q = q(i); assert.ok(b[0] < b[2] && b[1] < b[3]); for (let k = 0; k < 8; k += 2) assert.ok(Q[k] >= b[0] && Q[k] <= b[2] && Q[k + 1] >= b[1] && Q[k + 1] <= b[3]) }
  assert.ok(bb(3)[1] > bb(0)[3], 'แถว y=3 อยู่ใต้แถว y=1');
  assert.ok(Math.abs(bb(1)[0] - bb(0)[2]) < 1e-8, 'แถวติดกันต่อเนื่อง (ขอบ UTM แนวตั้งไม่ใช่เส้นเมริเดียน จึงต่างกันเล็กน้อย)');
  assert.strictEqual(o.__t.length, 4);
});

test('bnMerge: โหมดแยกประเภท (C) ค่า = ประเภทของรอบแรก ไม่สะสม · รับ object ที่แปลงแล้วก็ได้', () => {
  const o = L.bnMerge({ files: [JSON.parse(F1), JSON.parse(F2)], C: true, dy: DY, ns: 2, BNPX: .25 });
  const rows = []; for (let i = 0; i < o.n; i++) rows.push(Array.from(o.v.subarray(i * 8, i * 8 + 8)));
  assert.deepStrictEqual(rows.map(r => r[3]), [1, 1, 1, 1]);
  assert.deepStrictEqual(rows.map(r => [r[6], r[7]]), [[0, 0], [0, 1], [1, 1], [1, 1]]);
  const e = L.bnMerge({ files: [], C: false, dy: DY, ns: 2, BNPX: .25 }); assert.strictEqual(e.n, 0); assert.deepStrictEqual(e.pr, []);
});

// ---------- B2 ต่อ: จุดความร้อนใกล้รอยเผา / เผาซ้ำซาก / ไทล์ ----------
test('bnHotCalc: มีจุดห่างกรอบ ≤ R ม. และวันอยู่ในช่วงรอบแรก−10 … รอบล่าสุด → hs=1', () => {
  const o = L.bnMerge({ files: [F1, F2], C: false, dy: DY, ns: 2, BNPX: .25 }), n = o.n, fl = new Int32Array(n * 2);
  for (let i = 0; i < n; i++) { fl[2 * i] = o.v[i * 8 + 6]; fl[2 * i + 1] = o.v[i * 8 + 7] }
  const d0 = f64([90, 95]), d1 = f64([100, 105]); // รอบ 0 = วัน 90(−10)…100 · รอบ 1 = 95…105
  const [lo, la] = L.bnLL(800010, 1599970, 47); // กลางแถวแรก (y=1 x=0)
  const run = P => Array.from(L.bnHotCalc({ bb: o.bb.slice(), fl, d0, d1, P: f64(P), R: 1000 }).hs);
  assert.deepStrictEqual(run([lo, la, 98]), [1, 1, 1, 1], 'จุดกลางแถวแรก วัน 98: ทุกแถวห่าง ≤1 กม. และวันอยู่ในช่วง');
  assert.deepStrictEqual(run([lo, la, 103]), [0, 1, 1, 1], 'วัน 103: แถวแรก (รอบ 0 ถึงวัน 100) ไม่นับ · แถวที่ล่าสุดคือรอบ 1 (ถึง 105) นับ');
  assert.deepStrictEqual(run([lo, la, 80]), [0, 0, 0, 0], 'วันก่อนช่วง');
  assert.deepStrictEqual(run([lo + .05, la, 98]), [0, 0, 0, 0], 'ไกล ~5 กม.');
  assert.deepStrictEqual(run([]), [0, 0, 0, 0]);
});

// rep.json ย่อ: กริดเดียว K=8 (มีบิต b4) · แถว: dy,dx,n,mask,b4,a,s,cl
const REP = JSON.stringify({ fy: [2568, 2569, 2570], n: 8, g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 0, 2, 0b111, 0b001, 1, 1, 1, 0, 1, 1, 0b010, 0b010, 2, 0, 2, 1, 0, 3, 0b011, 0, 1, 1, 1] } } });
test('rpMerge: นับปีงบจาก mask · เรียงตามจำนวนปี (คงลำดับเดิมเมื่อเท่ากัน) · b4 · ดงใหญ่ · พิกัดตรงกับ bnMerge', () => {
  const o = L.rpMerge({ text: REP, dy: DY, ns: 2 });
  assert.strictEqual(o.n, 3); assert.deepStrictEqual(o.fy, [2568, 2569, 2570]); assert.strictEqual(o.hasB4, true);
  const rows = []; for (let i = 0; i < o.n; i++) rows.push(Array.from(o.iv.subarray(i * 7, i * 7 + 7)));
  assert.deepStrictEqual(rows, [[1, 2, 2, 1, 2, 0, 2], [3, 3, 0, 2, 1, 1, 1], [2, 7, 1, 3, 1, 1, 1]], 'n,m,b4,c,a,s,cl เรียง c 1,2,3');
  assert.deepStrictEqual(Array.from(o.dy), [1, 0, 0]);
  const b = L.bnMerge({ files: [JSON.stringify({ g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 0, 2, 1, 1, 1] } } })], C: false, dy: DY, ns: 2, BNPX: .25 });
  assert.deepStrictEqual(Array.from(o.q.subarray(16, 24)), Array.from(b.q.subarray(0, 8)), 'แถว y=1 x=0 n=2 พิกัดเท่ากับ bnMerge');
  const k7 = L.rpMerge({ text: { fy: [2569], g: { '47PQR': { z: 47, x0: 800000, y0: 1600000, px: 20, r: [1, 0, 1, 1, 1, 1, 3] } } }, dy: DY, ns: 2 });
  assert.deepStrictEqual(Array.from(k7.iv), [1, 1, -1, 1, 1, 1, 3], 'K=7 ไม่มี b4 → -1'); assert.strictEqual(k7.hasB4, false);
});

test('tlPut/tlTile: เก็บล่าสุด 8 ชั้น · ไม่มีชั้น = tl-miss · ไม่มี OffscreenCanvas = tl-noc (ผู้เรียกวาดบน main thread แทน)', async () => {
  const lib = load(SRC, ['wjLib']).wjLib(), o = () => ({ q: f64(Array(8).fill(.5)), bb: f64([.4, .4, .6, .6]), ci: Uint8Array.from([0]), dy: Uint8Array.from([0]), f: null, hs: null });
  for (let i = 0; i < 9; i++) assert.deepStrictEqual(lib.tlPut('t' + i, o()), { n: 1 });
  await assert.rejects(lib.tlTile('t0', 1, 0, 0, { pal: ['#000'] }), /tl-miss/, 'ชั้นเก่าสุดถูกตัด');
  await assert.rejects(lib.tlTile('x', 1, 0, 0, { pal: ['#000'] }), /tl-miss/);
  if (typeof OffscreenCanvas === 'undefined') await assert.rejects(lib.tlTile('t8', 1, 0, 0, { pal: ['#000'] }), /tl-noc/);
});
