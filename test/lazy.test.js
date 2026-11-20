// B1 เฟส 2 (20 พ.ย. 69): โค้ดที่โหลดเมื่อใช้ — บล็อก <script type="text/x-lazy" id="lz-<n>"> ใน index.html (repo) → _site/js/<n>.<sha8>.js (build_site.splitLz)
//  - โครงสร้าง: บล็อกคอมไพล์ได้ · โค้ดหลักไม่อ้างชื่อที่อยู่ในบล็อกตรง ๆ (ยกเว้นผ่านสตับ lzCall) · บล็อกไม่ประกาศ const/let ชื่อที่โค้ดหลักมี
//  - splitLz: ไฟล์ชื่อมี hash เนื้อหาตรงทุกไบต์ · ดัชนี #lzix · sw.js precache + CSP มีโดเมนในโค้ดที่แยก
//  - lzJs/lzCall (โค้ดจริงจาก index.html): บล็อกในหน้า = ไม่ต่อเน็ต · _site = <script src> · ล้ม = toast ภาษาไทย + ลองใหม่ได้ · ไม่วนเรียกตัวเอง
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { HTML, ROOT, grab, load } = require('./helpers.cjs');
const { splitEmb, splitLz, pwaFiles } = require('../scripts/build_site');

const LZ_RE = /<script type="text\/x-lazy" id="lz-(\w+)">([\s\S]*?)<\/script>/g;
const blocks = [...HTML.matchAll(LZ_RE)].map(m => ({ n: m[1], code: m[2] }));
// โค้ดหลัก = ทุก <script> ที่ไม่มี attribute (ไม่รวมบล็อกข้อมูล/บล็อก lazy)
// (ไล่แท็กระดับบนสุดแบบ build_site — สตริง "<script>" ในหมายเหตุ/โค้ดไม่ถูกนับเป็นแท็ก)
const mainCode = (() => {
  const T = []; let i = 0;
  for (; ;) { const a = HTML.indexOf('<script', i); if (a < 0) break; const gt = HTML.indexOf('>', a), e = HTML.indexOf('</script>', gt); if (gt === a + 7) T.push(HTML.slice(gt + 1, e)); i = e + 9 }
  return T.join('\n');
})();
// ชื่อระดับบนสุดที่บล็อกประกาศ (บรรทัดขึ้นต้นด้วย function/async function/const/let — รวมชื่อหลังจุลภาคบนบรรทัด const เดียวกันแบบง่าย)
function topNames(code) {
  const fn = new Set(), lex = new Set();
  for (const l of code.split('\n')) {
    let m = /^(?:async\s+)?function\s*\*?\s*([\w$]+)/.exec(l); if (m) { fn.add(m[1]); continue }
    m = /^(?:const|let)\s+([\w$]+)\s*=/.exec(l); if (m) lex.add(m[1]);
  }
  return { fn, lex };
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");

test('บล็อก lz-adm: มีบล็อกเดียว · คอมไพล์ได้ · มีหลังบ้าน UL + แดชบอร์ด SYS · โค้ดหลักคงส่วนที่ทุกเครื่องใช้', () => {
  assert.deepEqual(blocks.map(b => b.n), ['adm']);
  const B = blocks[0].code;
  new vm.Script(B, { filename: 'lz-adm' });
  for (const f of ['ulAdmin', 'ulALs', 'ulAL', 'ulAclForm', 'ulAUs', 'ulAU', 'ulALog', 'ualDraw', 'ulAGs', 'syDash', 'syDraw', 'syChart', 'syHours', 'syMeter', 'syGh', 'syCfg'])
    assert.match(B, new RegExp('function ' + f + '\\('), f);
  for (const k of ['SYQ', 'SYHN', 'SYNF', 'SYWF', 'UALA', 'UA']) assert.match(B, new RegExp('^const ' + k + '=', 'm'), k);
  // ทุกเครื่องใช้ (ประกาศ/แถบประกาศ/ซ่อนชั้น/นับผู้เข้าชม/สวิตช์ฟอร์ม) ต้องอยู่ในโค้ดหลัก ไม่ใช่ในบล็อก
  for (const f of ['syGate', 'syFlags', 'syHide', 'syAnn', 'syAnnPos', 'syHit', 'ulPublish', 'ulLogAll', 'ulApi', 'ulSrvList'])
    { assert.match(mainCode, new RegExp('function ' + f + '\\('), f); assert.doesNotMatch(B, new RegExp('function ' + f + '\\('), f + ' ต้องไม่อยู่ในบล็อก') }
  for (const k of ['SY', 'SYMSG', 'syAdm']) assert.match(mainCode, new RegExp('^const ' + k + '=', 'm'), k);
});

test('บล็อก lz-*: โค้ดหลักไม่อ้างชื่อในบล็อกตรง ๆ (ต้องผ่านสตับ lzCall) · สตับถูกทับด้วย function ชื่อเดิม · ไม่มี const/let ชนกัน', () => {
  const M = topNames(mainCode), mainTxt = strip(mainCode);
  for (const { n, code } of blocks) {
    const { fn, lex } = topNames(code);
    const stubs = [...mainCode.matchAll(new RegExp(`function ([\\w$]+)\\(\\.\\.\\.a\\)\\{return lzCall\\('${n}','([\\w$]+)',a\\)\\}`, 'g'))];
    assert.ok(stubs.length >= 1, 'ไม่มีสตับของ ' + n);
    for (const s of stubs) { assert.equal(s[1], s[2], 'ชื่อสตับ = ชื่อฟังก์ชันจริง'); assert.ok(fn.has(s[1]), `บล็อก ${n} ไม่มี function ${s[1]} ทับสตับ`) }
    const stubN = new Set(stubs.map(s => s[1]));
    for (const k of lex) assert.ok(!M.lex.has(k) && !M.fn.has(k), `บล็อก ${n} ประกาศ ${k} ซ้ำกับโค้ดหลัก (SyntaxError ตอนโหลด)`);
    for (const k of [...fn, ...lex]) {
      if (stubN.has(k)) continue;
      assert.ok(!M.fn.has(k), `${k} มีทั้งในโค้ดหลักและบล็อก ${n} — ทำเป็นสตับ lzCall หรือเก็บไว้ที่เดียว`);
      const re = new RegExp(`(?<![\\w$.'"\\-])${k.replace(/\$/g, '\\$')}(?![\\w$])`);
      assert.doesNotMatch(mainTxt, re, `โค้ดหลักอ้าง ${k} ซึ่งอยู่ในบล็อก lz-${n} (ยังไม่โหลดตอนเปิดหน้า) — ใช้สตับ lzCall หรือ await lzJs('${n}')`);
    }
  }
});

test('splitLz: บล็อกเป็นไฟล์ js/<n>.<sha8>.js เนื้อหาตรงทุกไบต์ · ดัชนี #lzix · ซ้ำได้ผลเดิม · ไม่มีไฟล์ค้าง', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-'));
  try {
    const e = splitEmb(HTML, d), r = splitLz(e.html, d);
    assert.deepEqual(Object.keys(r.ix), ['adm']);
    assert.match(r.ix.adm, /^js\/adm\.[0-9a-f]{8}\.js$/);
    assert.equal(fs.readFileSync(path.join(d, r.ix.adm), 'utf8'), blocks[0].code);
    assert.doesNotMatch(r.html, /<script type="text\/x-lazy" id="lz-\w+">/);
    assert.ok(r.html.includes(`<script type="application/json" id="lzix">${JSON.stringify(r.ix)}</script>`));
    assert.equal(Buffer.byteLength(e.html) - Buffer.byteLength(r.html) > 50e3, true, 'โค้ดออกจากหน้าแรก ≥ 50 KB');
    assert.deepEqual(splitLz(e.html, d).ix, r.ix);
    assert.deepEqual(fs.readdirSync(path.join(d, 'js')), [r.ix.adm.slice(3)]);
    // ไม่มีบล็อก = html เดิม
    assert.equal(splitLz('<p>x</p>', d).html, '<p>x</p>');
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
});

test('pwaFiles: sw.js precache js/* คู่กับ index.html · SHELL_RE ตรงชื่อไฟล์ · CSP มีโดเมนในโค้ดที่แยก (api.github.com)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-'));
  try {
    const e = splitEmb(HTML, d), r = splitLz(e.html, d), P = pwaFiles(r.html, e.ix, r);
    assert.ok(P.shell.includes(r.ix.adm));
    assert.ok(blocks[0].code.includes('https://api.github.com') && !r.html.includes('https://api.github.com'), 'ตัวอย่างโดเมนที่อยู่เฉพาะในบล็อก');
    assert.match(P.csp, /connect-src [^;]*https:\/\/api\.github\.com/);
    const re = new Function('return ' + grab(/const SHELL_RE = (\/.*\/);/, fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')))();
    assert.ok(re.test(r.ix.adm)); assert.ok(!re.test('js/x.js'));
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
});

// lzJs/lzCall จริงจาก index.html ในหน้าจำลอง
const LZ_SRC = grab(/const LZN=[^\n]*/) + '\n' + grab(/function lzJs\(n\)\{[\s\S]*?throw e\}\)\}/) + '\n' + grab(/function lzCall\(n,f,a\)\{[\s\S]*?,bad\)\}/);
function page({ block = null, ix = null, online = true } = {}) {
  const els = {}, added = [], toasts = [], logs = [], timers = [];
  if (block != null) els['lz-adm'] = { id: 'lz-adm', textContent: block };
  if (ix) els.lzix = { id: 'lzix', textContent: JSON.stringify(ix) };
  const win = {};
  const document = {
    getElementById: id => els[id] || null,
    createElement: () => ({ remove() { this.removed = true } }),
    head: { appendChild: s => { added.push(s); if (s.textContent) vm.runInNewContext(s.textContent, { window: win }) } }
  };
  const W = load(LZ_SRC, ['lzJs', 'lzCall'], { document, window: win, navigator: { onLine: online }, FTO: { big: 6e4 }, dbg: (t, e) => logs.push(t + ' ' + e.message), toast: m => toasts.push(m), setTimeout: f => (timers.push(f), timers.length), clearTimeout: () => { } });
  return { ...W, win, added, toasts, logs, timers };
}

test('lzJs: บล็อกในหน้า (repo/ดับเบิลคลิก) = รันจากข้อความทันที ไม่ตั้ง src · Promise เดียวกันต่อชื่อ', async () => {
  const P = page({ block: 'window.hit=(window.hit||0)+1' });
  await P.lzJs('adm'); await P.lzJs('adm');
  assert.equal(P.lzJs('adm'), P.lzJs('adm'));
  assert.equal(P.win.hit, 1, 'รันครั้งเดียว'); assert.equal(P.added.length, 1); assert.equal(P.added[0].src, undefined);
});

test('lzJs: _site = <script src> ตามดัชนี · onerror/เกินเวลา = reject แล้วเรียกใหม่ได้ · ไม่มีในดัชนี = error', async () => {
  const P = page({ ix: { adm: 'js/adm.1234abcd.js' } });
  const a = P.lzJs('adm'); assert.equal(P.added[0].src, 'js/adm.1234abcd.js', 'path สัมพัทธ์ (file:// ของ _site ก็ใช้ได้)');
  P.added[0].onerror(); await assert.rejects(a, /โหลดไฟล์ js\/adm\.1234abcd\.js ไม่ได้/); assert.ok(P.added[0].removed);
  const b = P.lzJs('adm'); assert.notEqual(b, a, 'ล้มแล้วไม่แคชผลล้ม'); P.added[1].onload(); await b;
  const c = P.lzJs('x'); await assert.rejects(c, /ไม่มีโค้ด x/);
  const T = page({ ix: { adm: 'js/adm.1.js' } }), t = T.lzJs('adm'); T.timers[0](); await assert.rejects(t, /ไม่ได้/);
});

test('lzCall: โหลดแล้วเรียกฟังก์ชันจริงที่ทับสตับ · โหลดไม่ได้ = toast ภาษาไทย + dbg (ไม่เงียบ) · บล็อกไม่ทับสตับ = ไม่วนเรียกตัวเอง', async () => {
  const P = page({ block: 'window.ulAdmin=function(t,o){return "จริง:"+t+":"+o.x}' });
  P.win.ulAdmin = function stub(...a) { return P.lzCall('adm', 'ulAdmin', a) };
  assert.equal(await P.win.ulAdmin('sys', { x: 1 }), 'จริง:sys:1');
  const F = page({ ix: { adm: 'js/adm.1.js' }, online: false }); F.win.ulAdmin = () => 0;
  const r = F.lzCall('adm', 'ulAdmin', ['sys']); F.added[0].onerror();
  assert.equal(await r, undefined);
  assert.equal(F.toasts.length, 1); assert.match(F.toasts[0], /^โหลดส่วนหลังบ้านไม่ได้ \(ออฟไลน์\) — ตรวจการเชื่อมต่ออินเทอร์เน็ต/); assert.match(F.logs[0], /^lzJs adm/);
  const S = page({ block: '/* ไม่ได้ประกาศ ulAdmin */' }); S.win.ulAdmin = function stub(...a) { return S.lzCall('adm', 'ulAdmin', a) };
  assert.equal(await S.win.ulAdmin('sys'), undefined); assert.match(S.toasts[0], /โหลดส่วนหลังบ้านไม่ได้/); assert.match(S.logs[0], /ไม่พบ ulAdmin/);
});
