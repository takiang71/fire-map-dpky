// F7 (18 พ.ย. 69) บันทึกเส้นทางเดิน (GPS track) — ฟังก์ชันบริสุทธิ์ในบล็อก /*TK-PURE-BEGIN*/…/*TK-PURE-END*/ ของ index.html + GIO.toGPX
//  · tkOk ตัวกรองจุด: ความแม่นยำ >50 ม. ทิ้ง · ความเร็วจากจุดที่เก็บล่าสุด >15 กม./ชม. ทิ้ง · ห่าง <5 ม. ไม่เก็บ · เวลาไม่เดินหน้า ทิ้ง · free = ไม่ตรวจความเร็ว (หลังกดต่อ)
//  · เดิน 6 จุดมีจุดกระโดด 1 จุด → เก็บ 5 (สถานการณ์เดียวกับ check_site)
//  · tkLen/tkUD/tkSm ระยะและขึ้น/ลงสะสมแบบ elLine · tkDP ย่อเหลือ ≤500 จุด คงปลายทั้งสอง
//  · GIO.toGPX: เส้นที่มี _t/_e ได้ <ele>/<time> ทุกจุด · ไม่มี = ผลเดิมทุกไบต์ · ความยาวไม่ตรง = ไม่ใส่
//  · โครงสร้าง: watchPosition มีตัวเดียว (ของ LOC) · IndexedDB fm-tk แยกจาก fm-ul · โมดูลไม่ส่งข้อมูลออกเอง (ulApi เฉพาะ GET)
const test = require('node:test'), assert = require('node:assert/strict');
const { HTML, grab, load, rng } = require('./helpers.cjs');

const T = load(grab(/\/\*TK-PURE-BEGIN\*\/([\s\S]*?)\/\*TK-PURE-END\*\//), ['TKA', 'TKV', 'TKN', 'tkM', 'tkOk', 'tkLen', 'tkUD', 'tkSm', 'tkDP']);
const GIO = load(grab(/const GIO=\(\(\)=>\{[\s\S]*?return\{dms,load[^}]*\}\}\)\(\);/), ['GIO']).GIO;
const M = 1 / 111195.08; // องศาละติจูดต่อ 1 ม. บนทรงกลมรัศมี 6,371,008.8 ม. (tkM = haversine)
const P = (lo, la, t, acc = 8) => [lo, la, t, acc];

test('ค่าเกณฑ์ตามที่ตกลง: 50 ม. / 15 กม./ชม. / 5 ม.', () => {
  assert.equal(T.TKA, 50); assert.equal(T.TKV, 15); assert.equal(T.TKN, 5);
  const d = T.tkM([101, 14], [101, 14 + 1000 * M]); assert.ok(Math.abs(d - 1000) < 0.01, 'haversine 1 กม. ' + d);
});

test('tkOk: ความแม่นยำ / ยืนนิ่ง / ความเร็ว / เวลา / free', () => {
  const a = P(101.37, 14.43, 0);
  assert.equal(T.tkOk(null, P(101.37, 14.43, 0, 50)), '', 'จุดแรก ±50 ม. = เก็บ');
  assert.equal(T.tkOk(null, P(101.37, 14.43, 0, 50.5)), 'acc', '>50 ม. = ทิ้ง');
  assert.equal(T.tkOk(null, P(101.37, 14.43, 0, NaN)), 'acc', 'ไม่มีค่าความแม่นยำ = ทิ้ง');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 4.9 * M, 10e3)), 'near', '<5 ม. ไม่เก็บ');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 6 * M, 10e3)), '', '6 ม. ใน 10 วิ (2.2 กม./ชม.)');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 40 * M, 10e3)), '', '40 ม. ใน 10 วิ = 14.4 กม./ชม.');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 43 * M, 10e3)), 'spd', '43 ม. ใน 10 วิ = 15.5 กม./ชม.');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 43 * M, 10e3), true), '', 'free = ไม่ตรวจความเร็ว');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 40 * M, 0)), 'old', 'เวลาเท่าเดิม');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 40 * M, -5)), 'old', 'เวลาถอยหลัง (ตำแหน่งแคช)');
  assert.equal(T.tkOk(a, P(101.37, 14.43 + 40 * M, 10e3, 60)), 'acc', 'ความแม่นยำตรวจก่อน');
});

test('เดิน 6 จุด มีจุดกระโดด 1 จุด → เก็บ 5 จุด (เทียบกับจุดที่เก็บล่าสุด ไม่ใช่จุดที่ถูกทิ้ง)', () => {
  const s = 9 * M, t = 3000, W = [P(101.37, 14.43, 0), P(101.37, 14.43 + s, t), P(101.37, 14.43 + 2 * s, 2 * t), P(101.38, 14.43 + 2 * s, 3 * t), P(101.37, 14.43 + 3 * s, 4 * t), P(101.37, 14.43 + 4 * s, 5 * t)];
  const K = [], why = [];
  for (const q of W) { const r = T.tkOk(K[K.length - 1] || null, q); why.push(r); if (!r) K.push(q) }
  assert.deepEqual(why, ['', '', '', 'spd', '', '']); assert.equal(K.length, 5);
  assert.ok(Math.abs(T.tkLen(K) - 36) < 0.5, 'ระยะ 4 ช่วง × 9 ม. ' + T.tkLen(K));
});

test('tkUD: ขึ้น/ลงสะสมแบบ elLine ข้ามค่าว่าง · tkSm สุ่มทุก ≤5 ม. รวมปลาย', () => {
  assert.deepEqual(T.tkUD([100, 105, 103, NaN, 110, null, 108]), { up: 12, dn: 4 });
  assert.deepEqual(T.tkUD([null, 700]), { up: 0, dn: 0 }); assert.deepEqual(T.tkUD([]), { up: 0, dn: 0 });
  const a = [101.37, 14.43], b = [101.37, 14.43 + 23 * M], S = T.tkSm(a, b);
  assert.equal(S.length, 5); assert.deepEqual(S[S.length - 1], b);
  let prev = a; for (const q of S) { assert.ok(T.tkM(prev, q) <= 5.0001); prev = q }
  assert.equal(T.tkSm(a, a).length, 1, 'จุดเดียวกัน = 1 ตัวอย่าง');
});

test('tkDP: ≤500 จุด คงจุดแรก/สุดท้าย · เส้นตรง = 2 จุด · สั้นกว่าเพดาน = สำเนาเดิม · จุดหักมุมใหญ่ถูกเก็บ', () => {
  const R = rng(7), W = [[101.3, 14.4]];
  for (let i = 1; i < 6000; i++) { const p = W[i - 1]; W.push([p[0] + (R() - .45) * 8e-5, p[1] + (R() - .5) * 8e-5]) }
  const D = T.tkDP(W, 500); assert.ok(D.length <= 500 && D.length > 400, 'จำนวนจุด ' + D.length);
  assert.deepEqual(D[0], W[0]); assert.deepEqual(D[D.length - 1], W[W.length - 1]);
  let j = 0; for (const p of D) { j = W.indexOf(p, j); assert.ok(j >= 0, 'เป็นจุดเดิมตามลำดับ') }
  const L = Array.from({ length: 1000 }, (_, i) => [101 + i * 1e-5, 14 + i * 1e-5]); assert.equal(T.tkDP(L, 500).length, 2);
  const S = W.slice(0, 300), c = T.tkDP(S, 500); assert.deepEqual(c, S); assert.notEqual(c, S);
  const V = Array.from({ length: 1001 }, (_, i) => [101 + i * 1e-5, 14 + (i === 500 ? 1e-3 : 0)]); assert.ok(T.tkDP(V, 10).some(p => p[1] > 14.0005), 'ยอดแหลม 110 ม. ต้องอยู่');
  const O = Array.from({ length: 2000 }, (_, i) => [101 + Math.sin(i / 2000 * Math.PI) * 1e-2, 14]); // ไป-กลับทับแนวเดิม (ระยะถึง "ส่วนของเส้น" ไม่ใช่เส้นตรงไม่สิ้นสุด)
  assert.ok(Math.max(...T.tkDP(O, 50).map(p => p[0])) > 101.0099, 'จุดกลับตัวของเส้นไป-กลับต้องอยู่');
});

test('GIO.toGPX: เส้นทางที่มี _t/_e → <ele>/<time> ทุกจุด (ISO ไม่มีมิลลิวินาที, ele ก่อน time)', () => {
  const t0 = Date.UTC(2026, 10, 18, 1, 15, 3, 456), C = [[101.37, 14.43], [101.37, 14.43008], [101.37, 14.43016], [101.37, 14.43024], [101.37, 14.43032]];
  const f = { type: 'Feature', properties: { name: 'เส้นทาง 18 พ.ย. 69 08:15', 'ระยะ_กม': 0.036, _id: 'x', _t: C.map((_, i) => t0 + i * 3000), _e: [764.62, 764.9, 764.7, 764.2, 763.7] }, geometry: { type: 'LineString', coordinates: C } };
  const g = GIO.toGPX([{ name: 'a', fc: { type: 'FeatureCollection', features: [f] } }]);
  const pts = g.match(/<trkpt [^>]*>.*?<\/trkpt>/g) || [];
  assert.equal(pts.length, 5); assert.equal((g.match(/<trkpt /g) || []).length, 5);
  pts.forEach((p, i) => { assert.match(p, /^<trkpt lat="[\d.]+" lon="[\d.]+"><ele>[\d.]+<\/ele><time>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/time><\/trkpt>$/, p) });
  assert.match(pts[0], /<ele>764\.6<\/ele><time>2026-11-18T01:15:03Z<\/time>/); assert.match(pts[4], /<time>2026-11-18T01:15:15Z<\/time>/);
  assert.ok(!/_t|_e|_id/.test(g), 'ช่องภายใน (_) ไม่หลุดออกไฟล์');
  // MultiLineString: _t/_e นับรวมทุกส่วน
  const m = { type: 'Feature', properties: { _t: [1, 2, 3, 4].map(x => t0 + x * 1e3), _e: [1, 2, 3, 4] }, geometry: { type: 'MultiLineString', coordinates: [C.slice(0, 2), C.slice(2, 4)] } };
  const gm = GIO.toGPX([{ fc: { features: [m] } }]); assert.equal((gm.match(/<time>/g) || []).length, 4); assert.equal((gm.match(/<trkseg>/g) || []).length, 2);
  // ความยาวไม่ตรงจำนวนจุด (แก้เส้นแล้ว) = ไม่ใส่ แต่ไม่พัง · ค่าว่างบางจุด = ข้ามเฉพาะจุดนั้น
  const bad = { ...f, properties: { ...f.properties, _t: [t0], _e: null } }; assert.ok(!/<time>|<ele>/.test(GIO.toGPX([{ fc: { features: [bad] } }])));
  const part = { ...f, properties: { ...f.properties, _e: [1, null, 3, null, 5] } }, gp = GIO.toGPX([{ fc: { features: [part] } }]);
  assert.equal((gp.match(/<ele>/g) || []).length, 3); assert.equal((gp.match(/<time>/g) || []).length, 5);
});

test('GIO.toGPX: วัตถุที่ไม่มี _t/_e ได้ผลเดิมทุกไบต์ (ก่อน F7)', () => {
  const L = [{ name: 'a', fc: { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: 'หมุด', description: 'x<y', _id: '1' }, geometry: { type: 'Point', coordinates: [101.1, 14.2] } },
    { type: 'Feature', properties: { name: 'เส้น', _c: '#f00' }, geometry: { type: 'LineString', coordinates: [[101.1, 14.2], [101.2, 14.3]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[101, 14], [101.01, 14.01]], [[101.02, 14.02], [101.03, 14.03]]] } },
    { type: 'Feature', properties: { name: 'รูป' }, geometry: { type: 'Polygon', coordinates: [[[101, 14], [101.1, 14], [101.1, 14.1], [101, 14]]] } }] } }];
  assert.equal(GIO.toGPX(L), '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="แผนที่สถานการณ์ไฟป่า สบอ.1" xmlns="http://www.topografix.com/GPX/1/1">\n<wpt lat="14.2" lon="101.1"><name>หมุด</name><desc>x&lt;y</desc></wpt>\n<trk><name>เส้น</name><trkseg><trkpt lat="14.2" lon="101.1"/><trkpt lat="14.3" lon="101.2"/></trkseg></trk>\n<trk><trkseg><trkpt lat="14" lon="101"/><trkpt lat="14.01" lon="101.01"/></trkseg><trkseg><trkpt lat="14.02" lon="101.02"/><trkpt lat="14.03" lon="101.03"/></trkseg></trk>\n<trk><name>รูป</name><trkseg><trkpt lat="14" lon="101"/><trkpt lat="14" lon="101.1"/><trkpt lat="14.1" lon="101.1"/><trkpt lat="14" lon="101"/></trkseg></trk>\n</gpx>\n');
});

test('โครงสร้าง: watchPosition ตัวเดียว · locFix ส่งต่อ tkFix · fm-tk แยกจาก fm-ul · โมดูลไม่ส่งข้อมูลออกเอง', () => {
  assert.equal((HTML.match(/watchPosition\(/g) || []).length, 1, 'ห้ามเปิด watchPosition ตัวที่สอง');
  assert.match(grab(/function locFix\(p\)\{[\s\S]*?\n(?=map\.on\('zoom',locAccPx\))/), /tkFix\(p\)/);
  assert.match(HTML, /indexedDB\.open\('fm-tk',1\)/); assert.match(HTML, /indexedDB\.open\('fm-ul',1\);r\.onupgradeneeded=\(\)=>r\.result\.createObjectStore\('L'/, 'fm-ul คงเดิม (ไม่เพิ่ม store)');
  const src = grab(/(\/\*TK-PURE-BEGIN\*\/[\s\S]*?)<\/script>/);
  assert.ok(!/fetchT\(|fetch\(|sendBeacon|XMLHttpRequest|navigator\.share/.test(src), 'ไม่มีการส่งเครือข่ายตรงในโมดูล');
  const calls = src.match(/ulApi\([^)]*\)/g) || [];
  assert.deepEqual(calls, ["ulApi('/')", "ulApi('/reports/'+r.id+'/trk')"], 'ulApi ในโมดูลเป็น GET อ่านอย่างเดียว');
  assert.match(src, /ulNewL\(name,\{type:'FeatureCollection',features:\[f\]\},\{src:'gps'/, 'หยุดแล้วสร้างชั้นด้วย ulNewL');
  for (const k of ['เวลาเริ่ม', 'เวลาสิ้นสุด', 'ระยะ_กม', 'ขึ้นสะสม_ม', 'ลงสะสม_ม', 'จำนวนจุด']) assert.ok(src.includes(`'${k}'`), 'ช่อง ' + k);
});
