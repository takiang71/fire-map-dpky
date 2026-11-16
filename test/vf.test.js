// F1 รายงานผลตรวจสอบจากหน้างาน (16 พ.ย. 69)
//  · scripts/lib/vfmsg.js: fresh() เลือกรายงานที่ยังไม่แจ้ง/ไม่เก่าเกิน · vfText() Telegram (HTML) / LINE (ข้อความ) มีผล/ไร่/สาเหตุ/ลิงก์ ?hs=
//  · ฟังก์ชันในหน้าเว็บ (ดึงจาก index.html): vfKey = hKey ของจุด, vfOf จับคู่ตรง hKey / ใกล้เคียง ≤400 ม. ±2 นาที, vfFC 1 ป้ายต่อจุดใช้รายงานล่าสุด, vfCan สิทธิ์ 24 ชม.
//  · gzCam (แก้ gzGo): cameraForBounds คืน undefined ที่ padding ใหญ่ → ลด padding ตามลำดับ · ไม่ได้เลย = null (gzFit ใช้ jumpTo)
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load } = require('./helpers.cjs');
const VM = require('../scripts/lib/vfmsg');

const NOW = Date.UTC(2026, 10, 16, 3, 0); // 16 พ.ย. 69 10:00 น.
const R = [
  { id: 'a1', fy: 2570, hk: '20773|1330|14265|101988', hs: { la: 14.26532, lo: 101.98765, t: NOW - 20 * 36e5, sat: 'NOAA20' }, res: 'none', rai: 0, cs: 1, ta: '14:05', te: null, un: 'สถานีฯ ทับลาน', note: 'ควันจากเผาไร่นอกเขต', pos: null, ar: 'อุทยานแห่งชาติทับลาน', st: 'สถานีควบคุมไฟป่าทับลาน', tm: 'บุพราหมณ์|นาดี|ปราจีนบุรี', by: { u: 'somchai', d: 'สมชาย' }, c: NOW - 2 * 36e5, m: NOW - 2 * 36e5 },
  { id: 'b2', fy: 2570, hk: null, hs: null, res: 'fire', rai: 12.5, cs: 2, ta: null, te: null, un: '', note: '', pos: [101.9, 14.2, 8], ar: 'อุทยานแห่งชาติเขาใหญ่', st: 'สถานีควบคุมไฟป่าเขาใหญ่', tm: '', by: { u: 'x', d: 'สมหญิง' }, c: NOW - 60 * 36e5, m: NOW - 60 * 36e5 },
];
test('vfmsg.fresh: ข้ามที่แจ้งแล้วและที่เก่ากว่า 48 ชม. เรียงตามเวลาสร้าง', () => {
  assert.deepEqual(VM.fresh(R, {}, NOW).map(r => r.id), ['a1'], 'b2 เก่า 60 ชม.');
  assert.deepEqual(VM.fresh(R, { a1: 1 }, NOW), []);
  assert.deepEqual(VM.fresh(R, {}, NOW, 72).map(r => r.id), ['b2', 'a1']);
  assert.deepEqual(VM.fresh(null, null, NOW), []);
});
test('vfmsg.vfText: Telegram HTML มีผล/จุด/พื้นที่/ไร่/สาเหตุ/ชื่อ/ลิงก์ · LINE ไม่มีแท็ก', () => {
  const cs = ['เก็บหาของป่า', 'ไม่ทราบสาเหตุ', 'เผาไร่'];
  const t = VM.vfText(R, { site: 'https://x/', now: NOW, html: true, cs });
  assert.match(t, /<b>ผลตรวจสอบจากหน้างาน 2 รายการ<\/b>/);
  assert.match(t, /✅ <b>ตรวจแล้วไม่พบไฟ<\/b> · จุด 15 พ\.ย\. 14:00 น\. NOAA-20 · อช\.ทับลาน · ต\.บุพราหมณ์ อ\.นาดี/);
  assert.match(t, /ไม่ทราบสาเหตุ · เข้าถึง 14:05 น\. · หน่วย: สถานีฯ ทับลาน · โดย สมชาย/);
  assert.ok(!/0 ไร่/.test(t.split('\n')[3]), 'ไม่พบไฟ ไม่แสดงไร่');
  assert.match(t, /🔥 <b>พบไฟกำลังไหม้<\/b> · อช\.เขาใหญ่\n  12\.5 ไร่ · เผาไร่ · โดย สมหญิง/);
  assert.match(t, /href="https:\/\/x\/\?hs=14\.26532,101\.98765"/); assert.match(t, /href="https:\/\/x\/\?hs=14\.20000,101\.90000"/, 'ไม่มีจุด = ใช้พิกัดที่พบจริง');
  assert.match(t, /“ควันจากเผาไร่นอกเขต”/);
  const l = VM.vfText(R, { site: 'https://x/', now: NOW, html: false, cs });
  assert.ok(!/<[a-z]/.test(l), 'LINE ไม่มีแท็ก'); assert.match(l, /แผนที่ไฟป่า https:\/\/x\/\?hs=14\.26532,101\.98765/);
  assert.match(VM.vfText(R, { now: NOW, per: 1, cs }), /…และอีก 1 รายการ/);
  assert.match(VM.vfText(R, { now: NOW, cs, test: true }), /🧪/);
});

// ---- ฟังก์ชันในหน้าเว็บ ----
const SRC = grab(/(const VF=\{L:\[\][\s\S]*?\nfunction vfIndex[\s\S]*?\nfunction vfOf[^\n]*\n)/);
const FC = grab(/(function vfFC\(\)\{[\s\S]*?\n)function vfSetup/);
const hKey = (d, t, la, lo) => d + '|' + t + '|' + Math.round(la * 1e3) + '|' + Math.round(lo * 1e3);
const W = load(SRC + FC, ['VF', 'vfKey', 'vfOf', 'vfIndex', 'vfFC', 'vfCan', 'vfFy', 'vfLL'], { hKey, UL: { me: null }, Date });
test('vfKey = hKey ของจุด (วันไทย|HHMM|lat×1e3|lon×1e3) และ vfFy ปีงบไทย', () => {
  assert.equal(W.vfKey({ t: Date.UTC(2026, 10, 15, 6, 30), lat: 14.26532, lon: 101.98765 }), '20772|1330|14265|101988');
  assert.equal(W.vfFy(Date.UTC(2026, 8, 30, 16, 59)), 2569, '30 ก.ย. 23:59 น.'); assert.equal(W.vfFy(Date.UTC(2026, 8, 30, 17)), 2570, '1 ต.ค. 00:00 น.');
});
test('vfOf: ตรง hKey · ไม่ตรงแต่ใกล้ ≤400 ม. ±2 นาที นับด้วย · ไกล/คนละเวลาไม่นับ · เรียงใหม่สุดก่อน', () => {
  const t = Date.UTC(2026, 10, 15, 6, 30), h = { t, lat: 14.26532, lon: 101.98765 };
  W.VF.L = [
    { id: 'k', hk: W.vfKey(h), hs: { la: 14.26532, lo: 101.98765, t }, c: 1 },
    { id: 'near', hk: 'other', hs: { la: 14.2660, lo: 101.9900, t: t + 60e3 }, c: 5 },
    { id: 'far', hk: 'other2', hs: { la: 14.30, lo: 101.98765, t }, c: 9 },
    { id: 'late', hk: 'other3', hs: { la: 14.26532, lo: 101.98765, t: t + 10 * 60e3 }, c: 9 },
    { id: 'nohs', hk: null, hs: null, pos: [101.98765, 14.26532, 5], c: 9 },
  ];
  W.vfIndex();
  assert.deepEqual(W.vfOf(h).map(r => r.id), ['near', 'k'], 'ใหม่สุดก่อน (c มาก)');
});
test('vfFC: 1 ป้ายต่อจุด (hk) ใช้รายงานล่าสุด · ไม่มี hk ใช้พิกัดที่พบจริง · ไม่มีพิกัดเลย = ไม่แสดง', () => {
  W.VF.L = [{ id: 'a', hk: 'K', res: 'fire', hs: { la: 14, lo: 101 }, c: 1 }, { id: 'b', hk: 'K', res: 'out', hs: { la: 14, lo: 101 }, c: 2 }, { id: 'c', hk: null, res: 'none', hs: null, pos: [102, 15, 3], c: 3 }, { id: 'd', hk: null, res: 'none', hs: null, pos: null, c: 4 }];
  const F = W.vfFC().features;
  assert.deepEqual(F.map(f => [f.properties.id, f.properties.r, f.geometry.coordinates]), [['b', 'out', [101, 14]], ['c', 'none', [102, 15]]]);
});
test('vfCan: เจ้าของภายใน 24 ชม. · ผู้ดูแลทุกรายการ · ไม่ล็อกอินไม่ได้', () => {
  const W2 = load(SRC + FC, ['vfCan'], { hKey, UL: { me: { u: 'a', a: false } }, Date });
  assert.equal(W2.vfCan({ by: { u: 'a' }, c: Date.now() - 36e5 }), true); assert.equal(W2.vfCan({ by: { u: 'a' }, c: Date.now() - 25 * 36e5 }), false); assert.equal(W2.vfCan({ by: { u: 'b' }, c: Date.now() }), false);
  assert.equal(load(SRC + FC, ['vfCan'], { hKey, UL: { me: { u: 'z', a: true } }, Date }).vfCan({ by: { u: 'b' }, c: 0 }), true);
  assert.equal(W.vfCan({ by: { u: 'a' }, c: Date.now() }), false);
});
test('gzCam: padding ใหญ่คืน undefined → ใช้ padding ถัดไป · ไม่ได้เลย = null', () => {
  const G = load(grab(/(function gzCam\(m,b,pads\)\{[^\n]*\n)/), ['gzCam']);
  const fake = ok => ({ cameraForBounds: (b, o) => ok(o.padding) ? { center: [0, 0], zoom: 9 } : undefined });
  assert.deepEqual(G.gzCam(fake(p => typeof p === 'number' && p <= 40), [[0, 0], [1, 1]], [{ top: 300, left: 400 }, 40, 0]).pad, 40);
  assert.equal(G.gzCam(fake(p => p === 0), [[0, 0], [1, 1]], [{ top: 300 }, 40, 0]).pad, 0);
  assert.equal(G.gzCam(fake(() => false), [[0, 0], [1, 1]], [{ top: 300 }, 40, 0]), null);
  assert.equal(G.gzCam({ cameraForBounds: () => { throw new Error('x') } }, [[0, 0], [1, 1]], [0]), null, 'โยน error = ถือว่าไม่ได้');
});
