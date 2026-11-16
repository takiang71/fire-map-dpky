// D4 ค้นหาสถานที่/พิกัด (ดึงโค้ดจริงจาก index.html): gzFind ชื่อ (admin.json + GEO + ranger.json) · gzCo พิกัด ละติจูด/ลองจิจูด และ UTM 47/48 ผ่าน udCoParse
// อ่าน data/admin.json และ data/ranger.json (สร้างครั้งเดียวด้วย build_admin.js/import_rangers.js — sync ไม่แก้) และบล็อก geo ใน index.html (อ่านอย่างเดียว)
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { ROOT, HTML, grab, load } = require('./helpers.cjs');

const GEO = JSON.parse(grab(/<script type="application\/json" id="geo">([\s\S]*?)<\/script>/));
const GIO = load(grab(/const GIO=\(\(\)=>\{[\s\S]*?return\{dms,load[^}]*\}\}\)\(\);/), ['GIO']).GIO;
const SRC = [
  grab(/function udCoParse\(t\)\{[\s\S]*?\n return\{P,E\}\}/),
  grab(/const GZT=[\s\S]*?(?=function gzRun\(\))/),
].join('\n');
const NAMES = ['udCoParse', 'GZ', 'gzN', 'gzGeo', 'gzAdm', 'gzPts', 'gzFind', 'gzCo'];
const W = () => {
  const UDCO = { f: 'utm', z: 47 };
  const w = load(SRC, NAMES, { GEO, GIO, UDCO, WAR: [{ id: 'jpr', n: 'โรงเรียนนายร้อยพระจุลจอมเกล้า', s: 'จปร.', bb: [101.08, 14.25, 101.23, 14.38] }], window: {}, dbg: () => { }, fetchT: null, FTO: {}, admLoad: null, RG_URL: '', FB_URL: '' });
  return Object.assign(w, { UDCO });
};
const ADM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/admin.json'), 'utf8'));
// bb ของตำบล/อำเภอ (ในหน้าเว็บ admLoad คำนวณให้)
for (const L of ['am', 'tm']) ADM[L].features.forEach(f => { const b = [1e9, 1e9, -1e9, -1e9]; (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(p => p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) })); f.bb = b });
const RG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ranger.json'), 'utf8'));
const full = () => { const w = W(); w.GZ.src.geo = w.gzGeo(); w.GZ.src.adm = w.gzAdm(ADM); w.GZ.src.rg = w.gzPts(RG, 'rg'); return w };

test('"บุพราหมณ์" ผลแรก = ต.บุพราหมณ์ อ.นาดี จ.ปราจีนบุรี (มีแนวเขตไว้ไฮไลต์)', () => {
  const R = full().gzFind('บุพราหมณ์');
  assert.equal(R[0].k, 'tm'); assert.equal(R[0].n, 'ต.บุพราหมณ์'); assert.match(R[0].s, /อ\.นาดี จ\.ปราจีนบุรี/);
  assert.ok(R[0].g && R[0].bb && R[0].bb[0] > 101 && R[0].bb[2] < 102.5);
  assert.ok(R.some(e => e.k === 'rg'), 'หน่วยพิทักษ์ใน ต.บุพราหมณ์ ก็ขึ้นด้วย');
});

test('"ทับลาน" ผลแรก = อุทยานแห่งชาติทับลาน ตามด้วยสถานีควบคุมไฟป่าทับลาน', () => {
  const R = full().gzFind('ทับลาน');
  assert.equal(R[0].k, 'pa'); assert.equal(R[0].n, 'อุทยานแห่งชาติทับลาน');
  assert.equal(R[1].k, 'st'); assert.match(R[1].n, /^สถานีควบคุมไฟป่าทับลาน/);
});

test('คำนำหน้า อ./ต./จ. ดันชนิดนั้นขึ้นก่อน · ค้นได้โดยไม่มีข้อมูลที่ต้องโหลด (ออฟไลน์ครั้งแรก)', () => {
  const w = full();
  assert.equal(w.gzFind('อ.นาดี')[0].n, 'อ.นาดี');
  assert.equal(w.gzFind('ต.นาดี')[0].n, 'ต.นาดี');
  assert.equal(w.gzFind('จ.ปราจีนบุรี')[0].k, 'pv');
  assert.equal(w.gzFind('ขญ.1')[0].n, 'จุดเฝ้าระวัง ขญ.1');
  assert.equal(w.gzFind('จปร')[0].k, 'wa');
  const g = W(); g.GZ.src.geo = g.gzGeo();
  assert.equal(g.gzFind('ทับลาน')[0].n, 'อุทยานแห่งชาติทับลาน', 'ไม่มี admin.json/ranger.json ก็ยังค้นพื้นที่อนุรักษ์ได้');
  assert.deepEqual(g.gzFind('  '), []);
});

test('พิกัด UTM "47 820000 1560000" → 14.0928, 101.9632 และไม่เปลี่ยนค่าโหมดของเครื่องมือวาด', () => {
  const w = W(), R = w.gzCo('47 820000 1560000');
  assert.equal(R.length, 1); assert.equal(R[0].k, 'co');
  assert.ok(Math.abs(R[0].pt[1] - 14.09275) < 1e-4 && Math.abs(R[0].pt[0] - 101.96324) < 1e-4, String(R[0].pt));
  assert.match(R[0].s, /^UTM 47N 820000 1560000/);
  assert.deepEqual(w.UDCO, { f: 'utm', z: 47 });
  const r2 = w.gzCo('820000 1560000'); assert.equal(r2.length, 1, 'ไม่ระบุโซน: โซน 48 ตกนอกไทย ตัดทิ้ง'); assert.match(r2[0].s, /ไม่ระบุโซน/);
  const r3 = w.gzCo('48 188000 1600000'); assert.equal(r3.length, 1); assert.ok(r3[0].pt[0] > 102 && r3[0].pt[0] < 103, 'UTM 48N ฝั่งตะวันออก');
});

test('พิกัด ละติจูด/ลองจิจูด "14.1,101.9" (และสลับลำดับ, องศา ลิปดา) · ข้อความทั่วไปไม่ถือเป็นพิกัด', () => {
  const w = W(); w.UDCO.f = 'll';
  for (const q of ['14.1,101.9', '14.1, 101.9', '101.9 14.1', '14°06\'00"N 101°54\'00"E']) {
    const R = w.gzCo(q);
    assert.equal(R.length, 1, q); assert.ok(Math.abs(R[0].pt[1] - 14.1) < 1e-6 && Math.abs(R[0].pt[0] - 101.9) < 1e-6, q + ' → ' + R[0].pt);
    assert.match(R[0].s, /^UTM 47N 813156 1560718/);
  }
  assert.equal(w.UDCO.f, 'll', 'คืนค่าโหมดเดิม');
  for (const q of ['ทับลาน', '', '5', '1 2 3 4', '0,0', 'ขญ.1']) assert.deepEqual(w.gzCo(q), [], q);
});
