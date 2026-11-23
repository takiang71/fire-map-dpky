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

const blk = n => (blocks.find(b => b.n === n) || {}).code;
const fnIn = (code, f) => new RegExp('function ' + f + '\\(').test(code);

test('บล็อก lz-*: mt/pm/adm/vf/fd ตามลำดับในไฟล์ · คอมไพล์ได้ทุกบล็อก · ใส่ชื่อภาษาไทยใน LZN ครบ', () => {
  assert.deepEqual(blocks.map(b => b.n), ['mt', 'pm', 'adm', 'vf', 'fd']);
  for (const { n, code } of blocks) { new vm.Script(code, { filename: 'lz-' + n }); assert.match(grab(/const LZN=\{[^}]*\}/), new RegExp(n + ":'[^']+'"), 'LZN.' + n) }
});

test('บล็อก lz-pm/vf/fd: พิมพ์แผนที่ทั้งโมดูล · ฟอร์ม VF/FD เท่านั้น (ส่วนวาดบนแผนที่/การ์ด/คลิกจุดยังอยู่ในโค้ดหลัก)', () => {
  const P = blk('pm'), V = blk('vf'), D = blk('fd');
  for (const f of ['pmOpen', 'pmClose', 'pmRedraw', 'pmRender', 'pmOut', 'pmPdf', 'pmBind']) assert.ok(fnIn(P, f), f);
  for (const k of ['PP', 'PMQ', 'PMAP']) assert.match(P, new RegExp('^let ' + k + '=', 'm'), k);
  assert.match(P, /addEventListener\('keydown'/, 'ปุ่ม Esc ผูกในบล็อก');
  assert.match(mainCode, /\$\('#bPm'\)\.onclick=\(\)=>pmOpen\(\);/);
  for (const f of ['vfForm', 'vfDel', 'vfXlsx']) assert.ok(fnIn(V, f), f);
  for (const f of ['vfSetup', 'vfHit', 'vfBox', 'vfCard', 'vfApply', 'vfLoad', 'dfXT']) { assert.ok(fnIn(mainCode, f), f); assert.ok(!fnIn(V, f), f + ' ต้องอยู่ในโค้ดหลัก') }
  for (const f of ['fdForm', 'fdMiss', 'fdCand', 'fdUseHs']) assert.ok(fnIn(D, f), f);
  assert.match(D, /^const fdTimeChk=/m);
  for (const f of ['fdSetup', 'fdHit', 'fdRender', 'fdOpen', 'fdFlush', 'fdQueue', 'fdSave']) { assert.ok(fnIn(mainCode, f), f); assert.ok(!fnIn(D, f), f + ' ต้องอยู่ในโค้ดหลัก') }
});

test('บล็อก lz-adm: มีหลังบ้าน UL + แดชบอร์ด SYS · โค้ดหลักคงส่วนที่ทุกเครื่องใช้', () => {
  const B = blk('adm');
  for (const f of ['ulAdmin', 'ulALs', 'ulAL', 'ulAclForm', 'ulAUs', 'ulAU', 'ulALog', 'ualDraw', 'ulAGs', 'syDash', 'syDraw', 'syChart', 'syHours', 'syMeter', 'syGh', 'syCfg'])
    assert.match(B, new RegExp('function ' + f + '\\('), f);
  for (const k of ['SYQ', 'SYHN', 'SYNF', 'SYWF', 'UALA', 'UA']) assert.match(B, new RegExp('^const ' + k + '=', 'm'), k);
  // ทุกเครื่องใช้ (ประกาศ/แถบประกาศ/ซ่อนชั้น/นับผู้เข้าชม/สวิตช์ฟอร์ม) ต้องอยู่ในโค้ดหลัก ไม่ใช่ในบล็อก
  for (const f of ['syGate', 'syFlags', 'syHide', 'syAnn', 'syAnnPos', 'syHit', 'ulPublish', 'ulLogAll', 'ulApi', 'ulSrvList'])
    { assert.match(mainCode, new RegExp('function ' + f + '\\('), f); assert.doesNotMatch(B, new RegExp('function ' + f + '\\('), f + ' ต้องไม่อยู่ในบล็อก') }
  for (const k of ['SY', 'SYMSG', 'syAdm']) assert.match(mainCode, new RegExp('^const ' + k + '=', 'm'), k);
});

test('บล็อก lz-*: โค้ดหลักและบล็อกอื่นไม่อ้างชื่อในบล็อกตรง ๆ (ต้องผ่านสตับ lzCall) · สตับถูกทับด้วย function ชื่อเดิม · ไม่มี const/let ชนกัน', () => {
  for (const { n, code } of blocks) {
    // "ที่อื่น" = โค้ดหลัก + บล็อกอื่น (บล็อกอื่นอาจโหลดก่อน/ไม่โหลดบล็อกนี้)
    const rest = mainCode + '\n' + blocks.filter(b => b.n !== n).map(b => b.code).join('\n'), M = topNames(rest), mainTxt = strip(rest);
    const { fn, lex } = topNames(code);
    const stubs = [...mainCode.matchAll(new RegExp(`function ([\\w$]+)\\(\\.\\.\\.a\\)\\{return lzCall\\('${n}','([\\w$]+)',a\\)\\}`, 'g'))];
    assert.ok(stubs.length >= 1, 'ไม่มีสตับของ ' + n);
    for (const s of stubs) { assert.equal(s[1], s[2], 'ชื่อสตับ = ชื่อฟังก์ชันจริง'); assert.ok(fn.has(s[1]), `บล็อก ${n} ไม่มี function ${s[1]} ทับสตับ`) }
    const stubN = new Set(stubs.map(s => s[1]));
    for (const k of lex) assert.ok(!M.lex.has(k) && !M.fn.has(k), `บล็อก ${n} ประกาศ ${k} ซ้ำกับโค้ดหลัก/บล็อกอื่น (SyntaxError ตอนโหลด)`);
    for (const k of [...fn, ...lex]) {
      if (stubN.has(k)) continue;
      assert.ok(!M.fn.has(k), `${k} มีทั้งในบล็อก ${n} และที่อื่น — ทำเป็นสตับ lzCall หรือเก็บไว้ที่เดียว`);
      const re = new RegExp(`(?<![\\w$.'"\\-])${k.replace(/\$/g, '\\$')}(?![\\w$])`);
      assert.doesNotMatch(mainTxt, re, `โค้ดหลัก/บล็อกอื่นอ้าง ${k} ซึ่งอยู่ในบล็อก lz-${n} (ยังไม่โหลด) — ใช้สตับ lzCall หรือ await lzJs('${n}')`);
    }
  }
});

test('splitLz: บล็อกเป็นไฟล์ js/<n>.<sha8>.js เนื้อหาตรงทุกไบต์ · ดัชนี #lzix · ซ้ำได้ผลเดิม · ไม่มีไฟล์ค้าง', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-'));
  try {
    const e = splitEmb(HTML, d), r = splitLz(e.html, d);
    assert.deepEqual(Object.keys(r.ix), blocks.map(b => b.n));
    for (const { n, code } of blocks) {
      assert.match(r.ix[n], new RegExp(`^js/${n}\\.[0-9a-f]{8}\\.js$`));
      assert.equal(fs.readFileSync(path.join(d, r.ix[n]), 'utf8'), code, n);
    }
    assert.doesNotMatch(r.html, /<script type="text\/x-lazy" id="lz-\w+">/);
    assert.equal(r.html.split('id="lzix"').length, 2, 'ดัชนีเดียว');
    assert.ok(r.html.includes(`<script type="application/json" id="lzix">${JSON.stringify(r.ix)}</script>`));
    const code = blocks.reduce((s, b) => s + Buffer.byteLength(b.code), 0);
    assert.ok(Buffer.byteLength(e.html) - Buffer.byteLength(r.html) >= code, 'โค้ดในบล็อกออกจากหน้าแรกครบ');
    assert.ok(code > 140e3, 'บล็อกรวม > 140 KB (pm ~57 + adm ~54 + vf ~12 + fd ~23)');
    assert.deepEqual(splitLz(e.html, d).ix, r.ix);
    assert.deepEqual(fs.readdirSync(path.join(d, 'js')).sort(), Object.values(r.ix).map(u => u.slice(3)).sort());
    // ไม่มีบล็อก = html เดิม
    assert.equal(splitLz('<p>x</p>', d).html, '<p>x</p>');
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
});

test('pwaFiles: sw.js precache js/* คู่กับ index.html · SHELL_RE ตรงชื่อไฟล์ · CSP มีโดเมนในโค้ดที่แยก (api.github.com)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-'));
  try {
    const e = splitEmb(HTML, d), r = splitLz(e.html, d), P = pwaFiles(r.html, e.ix, r);
    for (const u of Object.values(r.ix)) assert.ok(P.shell.includes(u), u);
    assert.ok(blk('adm').includes('https://api.github.com') && !r.html.includes('https://api.github.com'), 'ตัวอย่างโดเมนที่อยู่เฉพาะในบล็อก');
    assert.match(P.csp, /connect-src [^;]*https:\/\/api\.github\.com/);
    // ทุกโดเมนในบล็อก (เช่น ไทล์ของแผนที่พิมพ์) อยู่ในนโยบาย
    for (const h of require('../scripts/lib/csp').cspHosts(blocks.map(b => b.code).join('\n'))) if (!require('../scripts/lib/csp').NAV_ONLY.has(h)) assert.ok(P.csp.includes(h), h);
    const re = new Function('return ' + grab(/const SHELL_RE = (\/.*\/);/, fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')))();
    for (const u of Object.values(r.ix)) assert.ok(re.test(u), u);
    assert.ok(!re.test('js/x.js'));
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
