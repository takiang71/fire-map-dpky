// B1 เฟส 1: build_site.splitEmb แยกข้อมูลฝังออกจาก _site/index.html (อ่าน index.html จริงแบบอ่านอย่างเดียว เขียนผลลงโฟลเดอร์ชั่วคราว)
// + D2/B3: meta แชร์ลิงก์ ไอคอน และฟอนต์ในเว็บเอง (ไม่มี googleapis)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { HTML, ROOT } = require('./helpers.cjs');
const { splitEmb, EMB_IDS, splitLz } = require('../scripts/build_site');
const { block } = require('../scripts/lib/area');
const tagsOf = h => { const T = []; let i = 0; for (; ;) { const a = h.indexOf('<script', i); if (a < 0) break; const gt = h.indexOf('>', a), e = h.indexOf('</script>', gt); T.push({ attr: h.slice(a + 7, gt).trim(), body: h.slice(gt + 1, e) }); i = e + 9 } return T };

test('splitEmb: ข้อมูลฝัง 6 ชุดแยกเป็นไฟล์ชื่อมี hash เนื้อหาตรงต้นฉบับทุกไบต์ · ข้อมูลออกครบ · index.html (หลัง splitLz) < 1.60 MB', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-'));
  try {
    const r = splitEmb(HTML, d);
    assert.deepEqual(Object.keys(r.ix), EMB_IDS);
    for (const [id, u] of Object.entries(r.ix)) {
      assert.match(u, new RegExp(`^data/emb/${id}\\.[0-9a-f]{8}\\.json$`));
      assert.equal(fs.readFileSync(path.join(d, u), 'utf8'), block(id)[1], id);
    }
    // ข้อมูลฝังถูกแยกออกจริง: ไฟล์เล็กลง ≥ ข้อมูลฝังรวม − 8 KB (ดัชนี #emb + ตัวโหลด ~1.8 KB) — ไม่ขึ้นกับขนาดโค้ดแอป
    const data = EMB_IDS.reduce((s, id) => s + Buffer.byteLength(block(id)[1]), 0);
    assert.ok(Buffer.byteLength(HTML) - Buffer.byteLength(r.html) >= data - 8192, 'ข้อมูลฝังไม่ถูกแยกออกครบ');
    // งบขนาดหน้าแรก: เกณฑ์ตรวจรับ B1 เฟส 1 คือ < 1.5 MB (ผ่านตอนนั้น 1.3 MB) · 18 พ.ย. 69 โค้ดแอปโตถึง 1.49 MB แล้ว F7 (บันทึกเส้นทาง) +40 KB → ขยับงบเป็น 1.6 MB
    //   ถ้าเกินอีก ให้พิจารณาแยกโค้ดโมดูลที่ไม่ได้ใช้ตอนเปิดหน้าออกเป็นไฟล์ (B1 เฟส 2) แทนการขยับเพดาน
    //   19 พ.ย. 69 เมนูไฟป่าที่ตรวจพบ + ฟอร์มบันทึกการดับไฟ (FD) ~40 KB ทำให้ถึง 1.60 MB → ขยายเป็น 1.65 MB (แจ้งผู้ใช้แล้ว; ถัดไปควรทำ B1 เฟส 2)
    //   20 พ.ย. 69 หลังบ้าน SYS (แท็บภาพรวมระบบ/ตั้งค่าระบบ ~40 KB) ทำให้ถึง 1.67 MB → ขยายเป็น 1.70 MB ชั่วคราว
    //   20 พ.ย. 69 B1 เฟส 2: โค้ดเฉพาะผู้ดูแล (หลังบ้าน UL + แดชบอร์ด SYS ~54 KB) แยกเป็น js/adm.<sha8>.js (build_site.splitLz — test/lazy.test.js) → 1.62 MB · งบกลับเป็น 1.65 MB
    //   20 พ.ย. 69 (ต่อ) ย้ายพิมพ์แผนที่ทั้งโมดูล (lz-pm) + ฟอร์ม VF (lz-vf) + ฟอร์ม FD (lz-fd) → 1.53 MB · งบลดเป็น 1.60 MB (เหลือที่โต ~75 KB)
    //   ถ้าเกินอีก: แยกโมดูลที่ใช้ตอนกดเท่านั้นเพิ่มเป็นบล็อก <script type="text/x-lazy" id="lz-<n>"> (docs/arch/data-blocks.md หัวข้อ B1 เฟส 2) แทนการขยับเพดาน
    const z = splitLz(r.html, d);
    assert.ok(Buffer.byteLength(z.html) < 1.60 * 1048576, (Buffer.byteLength(z.html) / 1048576).toFixed(3) + ' MB');
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

// embGet ในหน้าเว็บ (ดึงโค้ดจริงจาก index.html): บล็อกฝังมีอยู่ = ใช้ทันที · ไม่มี = fetch ตามดัชนี #emb + ลองใหม่เมื่อ 5xx/เครือข่ายล้ม (ไม่ลองใหม่เมื่อ 4xx)
const { grab, load } = require('./helpers.cjs');
const EMB_SRC = grab(/const EMB_SITE=[^\n]*/) + '\n' + grab(/function embGet\(id\)\{[\s\S]*?return t\}\)\}/);
function page({ blocks = {}, ix = null, replies = [], protocol = 'https:' } = {}) {
  const els = {}, calls = [], logs = [];
  for (const [id, t] of Object.entries(blocks)) els[id] = { id, textContent: t };
  if (ix) els.emb = { id: 'emb', textContent: JSON.stringify(ix) };
  const document = { getElementById: id => els[id] || null, createElement: () => ({}), body: { appendChild: e => { els[e.id] = e } } };
  const fetchT = u => { calls.push(u); const r = replies.shift(); return r instanceof Error ? Promise.reject(r) : Promise.resolve({ ok: r < 400, status: r, text: () => Promise.resolve('{"ok":' + r + '}') }) };
  const W = load(EMB_SRC, ['embGet'], { document, location: { protocol }, fetchT, FTO: { big: 6e4 }, dbg: (t, e) => logs.push(t), setTimeout: f => f() });
  return { ...W, calls, logs, els };
}

test('embGet: มีบล็อกฝัง (repo/ดับเบิลคลิก) = ใช้ทันทีไม่ต่อเน็ต · ผลแคชต่อ id', async () => {
  const P = page({ blocks: { geo: '{"cons":1}' } });
  assert.equal(await P.embGet('geo'), '{"cons":1}');
  assert.equal(P.embGet('geo'), P.embGet('geo'), 'Promise เดียวกัน');
  assert.equal(P.calls.length, 0);
});

test('embGet: _site ไม่มีบล็อก → fetch ตามดัชนีแล้วสร้างบล็อก id เดิม · file:// ดึงจากเว็บจริง', async () => {
  const P = page({ ix: { adata: 'data/emb/adata.12345678.json' }, replies: [200] });
  assert.equal(await P.embGet('adata'), '{"ok":200}');
  assert.deepEqual(P.calls, ['data/emb/adata.12345678.json']);
  assert.equal(P.els.adata.textContent, '{"ok":200}', 'โค้ดเดิมอ่าน getElementById(id).textContent ได้');
  assert.equal(P.els.adata.type, 'application/json');
  const F = page({ ix: { geo: 'data/emb/geo.1.json' }, replies: [200], protocol: 'file:' });
  await F.embGet('geo');
  assert.deepEqual(F.calls, ['https://takiang71.github.io/fire-map-dpky/data/emb/geo.1.json']);
});

test('embGet: 503 / เครือข่ายล้ม → ลองใหม่ได้ 2 ครั้ง · 404 ไม่ลองใหม่ · ไม่มีในดัชนี = error', async () => {
  const A = page({ ix: { hdata: 'h.json' }, replies: [503, new TypeError('Failed to fetch'), 200] });
  assert.equal(await A.embGet('hdata'), '{"ok":200}');
  assert.equal(A.calls.length, 3); assert.equal(A.logs.length, 2);
  const B = page({ ix: { hdata: 'h.json' }, replies: [503, 503, 503, 200] });
  await assert.rejects(B.embGet('hdata'), /HTTP 503/); assert.equal(B.calls.length, 3, 'ลองรวม 3 ครั้งแล้วหยุด');
  const C = page({ ix: { hdata: 'h.json' }, replies: [404, 200] });
  await assert.rejects(C.embGet('hdata'), /HTTP 404/); assert.equal(C.calls.length, 1);
  await assert.rejects(page({ ix: {} }).embGet('wdata'), /ไม่มีข้อมูลฝัง wdata/);
});
