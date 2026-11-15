// B1 เฟส 1: build_site.splitEmb แยกข้อมูลฝังออกจาก _site/index.html (อ่าน index.html จริงแบบอ่านอย่างเดียว เขียนผลลงโฟลเดอร์ชั่วคราว)
// + D2/B3: meta แชร์ลิงก์ ไอคอน และฟอนต์ในเว็บเอง (ไม่มี googleapis)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { HTML, ROOT } = require('./helpers.cjs');
const { splitEmb, EMB_IDS } = require('../scripts/build_site');
const { block } = require('../scripts/lib/area');
const tagsOf = h => { const T = []; let i = 0; for (; ;) { const a = h.indexOf('<script', i); if (a < 0) break; const gt = h.indexOf('>', a), e = h.indexOf('</script>', gt); T.push({ attr: h.slice(a + 7, gt).trim(), body: h.slice(gt + 1, e) }); i = e + 9 } return T };

test('splitEmb: ข้อมูลฝัง 6 ชุดแยกเป็นไฟล์ชื่อมี hash เนื้อหาตรงต้นฉบับทุกไบต์ · index.html < 1.5 MB', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-'));
  try {
    const r = splitEmb(HTML, d);
    assert.deepEqual(Object.keys(r.ix), EMB_IDS);
    for (const [id, u] of Object.entries(r.ix)) {
      assert.match(u, new RegExp(`^data/emb/${id}\\.[0-9a-f]{8}\\.json$`));
      assert.equal(fs.readFileSync(path.join(d, u), 'utf8'), block(id)[1], id);
    }
    assert.ok(Buffer.byteLength(r.html) < 1.5 * 1048576, (Buffer.byteLength(r.html) / 1048576).toFixed(2) + ' MB');
    // ข้อมูลเดิม = ชื่อไฟล์เดิม (แคชได้) · splitEmb ซ้ำได้ผลเดียวกัน
    assert.deepEqual(splitEmb(HTML, d).ix, r.ix);
    assert.deepEqual(fs.readdirSync(path.join(d, 'data', 'emb')).sort(), Object.values(r.ix).map(u => u.split('/').pop()).sort(), 'ไม่มีไฟล์ค้างจากรอบก่อน');
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
});

test('splitEmb: สคริปต์ก่อนข้อมูลฝังรันตามปกติ · สคริปต์แอปหลังจากนั้นถูกพักไว้ครบและเนื้อหาไม่เปลี่ยน · ตัวโหลดอยู่ถัดจากดัชนี', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-'));
  try {
    const r = splitEmb(HTML, d), A = tagsOf(HTML), B = tagsOf(r.html);
    const first = A.findIndex(t => /application\/json/.test(t.attr));
    const app = A.slice(first).filter(t => t.attr === ''), parked = B.filter(t => t.attr === 'type="text/x-emb-app"');
    assert.equal(parked.length, app.length);
    assert.deepEqual(parked.map(t => t.body), app.map(t => t.body), 'โค้ดแอปเหมือนเดิมทุกไบต์ ลำดับเดิม');
    assert.deepEqual(B.slice(0, first).map(t => t.body), A.slice(0, first).map(t => t.body), 'สคริปต์ส่วนหัว (D8, fail/fetchT/embGet, MapLibre) ไม่ถูกแตะ');
    assert.equal(B[first].attr, 'type="application/json" id="emb"');
    assert.match(B[first + 1].body, /Promise\.all\(\[\.\.\.Object\.keys\(ix\)\.map\(embGet\),dom\(\)\]\)/, 'ตัวโหลดรอข้อมูลครบ + DOMContentLoaded');
    assert.equal(B.filter(t => /application\/json/.test(t.attr)).length, 1, 'เหลือแค่ดัชนี');
    assert.match(A[0].body, /เบราว์เซอร์รุ่นเก่า/); assert.equal(B[0].body, A[0].body, 'สคริปต์ตรวจเบราว์เซอร์เก่ายังเป็นตัวแรก');
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
});

test('D2: meta คำอธิบาย/Open Graph/Twitter และไอคอนมีไฟล์จริง', () => {
  for (const p of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:url"', 'name="twitter:card"', 'rel="icon"', 'rel="apple-touch-icon"'])
    assert.ok(HTML.includes(p), p);
  for (const f of ['img/og.jpg', 'img/icon.svg', 'img/icon-32.png', 'img/apple-touch-icon.png']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.match(HTML, /og:image" content="https:\/\/takiang71\.github\.io\/fire-map-dpky\/img\/og\.jpg"/, 'og:image ต้องเป็น URL เต็ม');
});

test('B3: ไม่โหลดฟอนต์จาก googleapis/gstatic · @font-face ชี้ไฟล์ที่มีอยู่จริง (หน้าเว็บและคู่มือ)', () => {
  const man = fs.readFileSync(path.join(ROOT, 'manual', 'index.html'), 'utf8');
  for (const [h, base] of [[HTML, ROOT], [man, path.join(ROOT, 'manual')]]) {
    assert.doesNotMatch(h.replace(/<!--[\s\S]*?-->/g, ''), /fonts\.googleapis|fonts\.gstatic/);
    const urls = [...h.matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => m[1]);
    assert.equal(urls.length, 6, '400/600/800 × thai/latin');
    for (const u of urls) assert.ok(fs.existsSync(path.join(base, u)), u);
  }
});
