// ตรวจหน้าเว็บก่อนขึ้น GitHub Pages (ผู้ใช้ขอ 11 พ.ย. 69) — ไม่ต้องติดตั้งแพ็กเกจ (Node 22+ มี WebSocket)
//  1) syntax: แยก <script> ทุกบล็อกใน index.html (+ manual/index.html) คอมไพล์ด้วย vm.Script / JSON.parse บล็อกข้อมูล
//  2) smoke test: เปิดหน้าใน Chrome headless (เดสก์ท็อป 1440 + มือถือ 390) กดปุ่มเมนู/เครื่องมือหลัก
//     แล้วนับ error ที่ไม่ถูกจับ (Runtime.exceptionThrown) — error เครือข่าย (โหลดไทล์/API ไม่ได้) ไม่นับ
//
// ใช้ในเครื่อง:  node scripts/check_site.js            (ตรวจ index.html ในโฟลเดอร์โปรเจกต์)
//               node scripts/check_site.js _site       (ตรวจผลของ build_site)
// ใน Actions:   node scripts/check_site.js _site --ci
//   --ci = เขียนผลที่ _site/check.json (health.js อ่านไปแจ้งผู้ดูแล) และถ้าไม่ผ่าน → แทน _site/index.html ด้วยฉบับที่อยู่บนเว็บตอนนี้
//          (ฉบับก่อนหน้าที่ผ่านแล้ว) เพื่อให้ live.json/ข้อมูลอื่นยังขึ้นเว็บตามปกติ แต่โค้ดที่พังไม่ขึ้น · exit 0 เสมอ
//          ถ้า index.html ตรงกับรอบที่ตรวจแล้ว (sha ใน check.json บนเว็บ) ใช้ผลเดิม ไม่เปิด Chrome ซ้ำ
//   exit code (ไม่ใช่ --ci): 0 ผ่าน · 1 ไม่ผ่าน · 2 ตรวจในเบราว์เซอร์ไม่ได้ (หา/เปิด Chrome ไม่ได้)
// ตัวแปร: CHROME = ที่อยู่ Chrome · SITE_URL = เว็บที่ใช้เทียบ/ดึงฉบับก่อนหน้า · CHECK_FORCE=1 ตรวจใหม่แม้ sha เดิม
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), http = require('http'), crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), CI = args.includes('--ci');
const DIR = path.resolve(ROOT, args.find(a => !a.startsWith('--')) || '.');
const SITE = (process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
// ปิดโปรแกรมหลังปล่อย handle ที่ค้าง (process.exit ทันทีบน Windows เคยเจอ assertion UV_HANDLE_CLOSING)
const quit = c => { process.exitCode = c; setTimeout(() => process.exit(c), 800) };

// ---------- 1) syntax ----------
// สำเนา scripts/lib/orbit.js ที่ฝังใน index.html ต้องตรงกับไฟล์ต้นฉบับ (แก้ที่ lib แล้วลืม node scripts/embed_orbit.js)
function orbLib(file) {
  const B = '/*ORB-LIB-BEGIN*/', E = '/*ORB-LIB-END*/', cut = t => { const i = t.indexOf(B), j = t.indexOf(E); return i < 0 || j < i ? null : t.slice(i, j + E.length) };
  const lib = path.join(ROOT, 'scripts', 'lib', 'orbit.js'); if (!fs.existsSync(file) || !fs.existsSync(lib)) return [];
  const a = cut(fs.readFileSync(file, 'utf8')), b = cut(fs.readFileSync(lib, 'utf8').replace(/\r\n/g, '\n'));
  return a === b ? [] : [`${path.relative(ROOT, file).replace(/\\/g, '/')}: สำเนา scripts/lib/orbit.js ${a ? 'ไม่ตรงกับต้นฉบับ' : 'หายไป'} — รัน node scripts/embed_orbit.js`];
}
function syntax(file) {
  const errs = [];
  if (!fs.existsSync(file)) return errs;
  const h = fs.readFileSync(file, 'utf8'), rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi; let m, n = 0;
  while ((m = re.exec(h))) {
    const at = m[1] || '', code = m[2], line = h.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length;
    if (/\ssrc\s*=/.test(at)) continue;
    const ty = (at.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    n++;
    if (/json/i.test(ty)) { try { JSON.parse(code) } catch (e) { errs.push(`${rel}:${line} ข้อมูล JSON ${(at.match(/id="([^"]+)"/) || [])[1] || ''} อ่านไม่ได้: ${e.message}`) } continue }
    if (ty && !/javascript|module/i.test(ty)) continue;
    try { new vm.Script(code, { filename: rel, lineOffset: line - 1 }) }
    catch (e) { const w = (e.stack || '').split('\n')[0]; errs.push(`${w.includes(rel) ? w : rel + ':' + line} ${e.name}: ${e.message}`) }
  }
  console.log(`syntax ${rel}: ${n} บล็อก, ผิด ${errs.length}`);
  return errs;
}

// ---------- 2) smoke test ใน Chrome ----------
function findChrome() {
  const c = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find(p => p && fs.existsSync(p));
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gz': 'application/gzip' };
function serve(dir) {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end() }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  return new Promise(res => s.listen(0, '127.0.0.1', () => res(s)));
}
// error ที่มาจากเครือข่าย/ต้นทางภายนอก ไม่ใช่โค้ดเรา
const NET = /Failed to fetch|NetworkError|Load failed|AJAXError|AbortError|aborted|timed? ?out|ERR_|net::|status (0|4\d\d|5\d\d)|HTTP [45]\d\d|Unexpected token '<'|is not valid JSON|webgl|WebGL/i;

// ขั้นตอนที่กดในหน้า: [ชื่อ, โค้ด JS] — ไม่พบปุ่ม = เตือน (ไม่นับเป็นผิด) · ปุ่มปิดกดเฉพาะเมื่อมองเห็น
const DESK = [
  ['การ์ดสถิติย้อนหลัง', `C('bStat')`], ['  แท็บการดับไฟป่า', `Q('#h-tab [data-v="xt"]')`], ['  ตารางการดับไฟ', `C('x-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  แท็บจุดความร้อน', `Q('#h-tab [data-v="hs"]')`], ['  ตารางสถิติ', `C('h-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  แท็บทุกดาวเทียม', `Q('#h-tab [data-v="ha"]')`], ['  ตารางทุกดาวเทียม', `C('h-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  ปิดการ์ดสถิติ', `C('h-x',1)`],
  ['พื้นที่เฝ้าระวังพิเศษ', `C('bWch')`], ['  ตาราง จปร.', `C('w-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  ปิด', `C('bWch')`],
  ['ย้อนดูการลามของไฟ (ปีงบนี้)', `C('bPlay')`], ['  90 วันล่าสุด', `Q('#pb-w [data-v="90"]')`], ['  ×0.5', `Q('#pb-sp [data-v="0.5"]')`], ['  เล่น', `C('pb-p')`], ['  หยุด', `C('pb-p')`], ['  1 วัน (รายชั่วโมง)', `Q('#pb-w [data-v="1"]')`], ['  สถิติย้อนหลัง', `C('pb-m')`], ['  เล่น', `C('pb-p')`], ['  หยุด', `C('pb-p')`], ['  ปิด', `C('pb-x',1)`], ['  ปิดการ์ดสถิติ', `C('h-x',1)`],
  ['ตารางจุดความร้อน', `C('p-tbl')`], ['  ปีงบย้อนหลัง (ทุกดาวเทียม)', `(()=>{const y=document.getElementById('dt-y');if(!y||y.options.length<2)return 'ไม่พบตัวเลือกปีงบย้อนหลัง';y.value=y.options[1].value;y.dispatchEvent(new Event('change'));return ''})()`], ['  ปิดตาราง', `C('md-x',1)`],
  ['แผงชั้นข้อมูล', `C('bLay')`], ['  ภาพเมฆ Himawari-9', `Q('.sw[data-k="him"]')`], ['  ยอดเมฆ', `Q('#hmseg [data-v="ct"]')`], ['  เล่นภาพ', `C('hm-pl')`], ['  หยุด', `C('hm-pl')`], ['  อินฟราเรด', `Q('#hmseg [data-v="ir"]')`], ['  ปิดภาพเมฆ', `Q('.sw[data-k="him"]')`], ['  อัตราการระบายอากาศ', `Q('.sw[data-k="vr"]')`], ['  วันถัดไป (กรมอุตุฯ)', `Q('#vr-dc [data-i="3"]')`], ['  รายชั่วโมง (Open-Meteo)', `Q('#vrsrc [data-v="om"]')`], ['  ชั่วโมงถัดไป', `C('vr-nx')`], ['  ตอนนี้', `C('vr-0')`], ['  รายวัน (กรมอุตุฯ)', `Q('#vrsrc [data-v="tmd"]')`], ['  ปิดระบายอากาศ', `Q('.sw[data-k="vr"]')`], ['  ปิดแผง', `C('xr',1)`],
  ['ข้อมูลพื้นฐาน', `C('bKnow')`], ['  ปิด', `C('kb-x',1)`],
  ['เครื่องมือวัด', `C('bMs')`], ['  ปิด', `C('bMs')`],
  ['ชั้นข้อมูลของฉัน', `C('bUl')`], ['  ปิด', `C('bUl')`],
  ['วิเคราะห์ภูมิประเทศ', `C('bTr')`], ['  ปิด', `C('bTr')`],
  ['พิมพ์แผนที่', `C('bPm')`], ['  ปิด', `C('pm-x',1)`],
  ['ดาวเทียมรอบถัดไป: ย่อ', `Q('#orb .obh')`], ['  ขยาย', `Q('#orb .obh')`], ['  แถว NOAA-21', `Q('#orb .obr[data-ob="NOAA21"]')`], ['  แผนที่โลกย่อ', `Q('#orb .obwm')`], ['  สวิตช์บนแผนที่ สลับ', `(()=>{const v=()=>map.getLayer('ob-tf')&&map.getLayoutProperty('ob-tf','visibility');const a=v(),r=__ck.Q('#orb .obh .hsp');return r||(v()!==a?'':'error: กดสวิตช์บนแผนที่แล้วชั้นวงโคจรไม่เปลี่ยน')})()`], ['  สวิตช์บนแผนที่ คืนค่า', `Q('#orb .obh .hsp')`], ['  ปิดชั้น', `Q('.sw[data-k="orb"]')`], ['  เปิดกลับ', `Q('.sw[data-k="orb"]')`],
  ['กลับมุมมองกลุ่มป่า', `C('bHome')`],
];
const MOB = [['ปุ่มเครื่องมือ (มือถือ)', `C('bTo')`], ['  ปิด', `C('bTo')`], ['ดาวเทียมรอบถัดไป: ขยาย/ย่อ', `Q('#orb .obh')`], ['  ย่อ/ขยาย', `Q('#orb .obh')`], ['แผงชั้นข้อมูล', `C('bLay')`], ['  ปิดแผง', `C('xr',1)`], ['การ์ดสถิติ', `C('bStat')`], ['  ปิด', `C('h-x',1)`], ['ย้อนดูการลามของไฟ', `C('bPlay')`], ['  เล่น', `C('pb-p')`], ['  ปิด', `C('pb-x',1)`]];
const HELP = `window.__ck={C(id,vis){const e=document.getElementById(id);if(!e)return 'ไม่พบ #'+id;if(vis&&!e.offsetParent&&getComputedStyle(e).position!=='fixed')return 'ข้าม';e.click();return ''},
Q(s){const e=document.querySelector(s);if(!e)return 'ไม่พบ '+s;e.click();return ''},K(k){document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));return ''}};`;

async function browser(dir) {
  const CH = findChrome(); if (!CH) return { skip: 'ไม่พบ Chrome (ตั้งตัวแปร CHROME)' };
  const srv = await serve(dir), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-')), port = 9400 + Math.floor(Math.random() * 400);
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'];
  if (process.platform === 'linux') flags.push('--no-sandbox', '--disable-dev-shm-usage');
  const ch = spawn(CH, [...flags, 'about:blank'], { stdio: 'ignore' });
  const errs = [], warn = [], net = []; let ws, id = 0; const pend = new Map(), done = () => { try { ws && ws.close() } catch (e) { } try { ch.kill() } catch (e) { } srv.close(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }) } catch (e) { } }, 1500) };
  try {
    let wsu; for (let i = 0; i < 75 && !wsu; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) wsu = p.webSocketDebuggerUrl } catch (e) { } if (!wsu) await sleep(200) }
    if (!wsu) return { skip: 'เปิด Chrome ไม่ได้' };
    ws = new WebSocket(wsu); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j });
    let stage = 'โหลดหน้า';
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); return d.error ? p.rej(new Error(d.error.message)) : p.res(d.result) }
      if (d.method === 'Runtime.exceptionThrown') {
        const x = d.params.exceptionDetails, msg = ((x.exception && x.exception.description) || x.text || '').split('\n').slice(0, 3).join(' | ');
        const where = x.url && x.url.includes('127.0.0.1') ? ` (index.html:${x.lineNumber + 1})` : x.url ? ` (${x.url.split('/').pop()})` : '';
        (NET.test(msg) || (x.url && !x.url.includes('127.0.0.1')) ? net : errs).push(`[${stage}] ${msg}${where}`);
      }
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') { const s = d.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300); (NET.test(s) ? net : warn).push(`[${stage}] console.error: ${s}`) }
    };
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => pend.has(i) && (pend.delete(i), rej(new Error('CDP timeout ' + method))), 30e3) });
    const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return r.result.value };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const info = {};
    for (const [nm, w, h, steps] of [['เดสก์ท็อป', 1440, 900, DESK], ['มือถือ', 390, 844, MOB]]) {
      const mob = w < 768; stage = `${nm}: โหลดหน้า`;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
      await send('Emulation.setTouchEmulationEnabled', mob ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await send('Page.navigate', { url });
      // รอแผนที่โหลดสไตล์ (สูงสุด 45 วิ) แล้วรอข้อมูลอีก 4 วิ
      let ok = false; for (let i = 0; i < 90 && !ok; i++) { await sleep(500); try { ok = await ev(`typeof map!=='undefined'&&!!map&&map.isStyleLoaded&&map.isStyleLoaded()`) } catch (e) { } }
      if (!ok) warn.push(`[${nm}] แผนที่โหลดสไตล์ไม่เสร็จใน 45 วิ (WebGL/เครือข่าย?)`);
      await sleep(4000);
      const st = await ev(`({left:!!document.querySelector('#left')&&document.querySelector('#left').innerText.length,card:!!document.querySelector('#pcard'),layers:(typeof map!=='undefined'&&map.getStyle&&map.getStyle())?map.getStyle().layers.length:0})`).catch(e => ({ err: e.message }));
      info[nm] = st;
      if (!st.left) errs.push(`[${nm}] แผงซ้ายว่างเปล่า (หน้าเว็บไม่ได้วาดเนื้อหา)`);
      if (ok && !st.layers) errs.push(`[${nm}] แผนที่ไม่มีเลเยอร์`);
      // ชั้นวงโคจรดาวเทียม (สคริปต์ท้ายไฟล์) — เคยไม่ถูกสร้างเมื่อ setup() ทำงานก่อนสคริปต์ (ผู้ใช้แจ้ง 13 พ.ย. 69) · รอ obTick อีก 1.5 วิ
      if (ok) { await sleep(1500); const ob = await ev(`(typeof S!=='undefined'&&S.orb&&typeof obLayers==='function')?['ob-tf','ob-bf','ob-ic'].filter(id=>!map.getLayer(id)).join(','):''`).catch(() => ''); if (ob) errs.push(`[${nm}] ชั้นวงโคจรดาวเทียมไม่ถูกสร้าง (${ob})`) }
      await ev(HELP);
      for (const [label, js] of steps) {
        stage = `${nm}: ${label.trim()}`;
        const r = await ev(`(()=>{const{C,Q,K}=window.__ck;return ${js}})()`).catch(e => 'error: ' + e.message);
        if (r && r !== 'ข้าม') (r.startsWith('error') ? errs : warn).push(`[${stage}] ${r}`);
        await sleep(r ? 150 : 1300);
      }
      await sleep(1500);
    }
    return { errs, warn, net, info };
  } catch (e) { return { skip: 'ตรวจในเบราว์เซอร์ไม่สำเร็จ: ' + e.message, errs, warn, net } }
  finally { done() }
}

(async () => {
  const file = path.join(DIR, 'index.html');
  if (!fs.existsSync(file)) { console.error('ไม่พบ', file); return quit(CI ? 0 : 1) }
  const html = fs.readFileSync(file), sha = crypto.createHash('sha1').update(html).digest('hex');
  const res = { at: new Date().toISOString(), sha, ok: null, errs: [], warn: [], net: 0 };
  let prev = null;
  if (CI && !process.env.CHECK_FORCE) try { const r = await fetch(SITE + 'check.json?t=' + Date.now(), { signal: AbortSignal.timeout(15e3) }); if (r.ok) prev = await r.json() } catch (e) { }
  if (prev && prev.sha === sha && typeof prev.ok === 'boolean') {
    Object.assign(res, prev, { at: res.at, reused: prev.reused || prev.at });
    console.log(`index.html เหมือนรอบที่ตรวจแล้ว (${prev.reused || prev.at}) → ใช้ผลเดิม: ${prev.ok ? 'ผ่าน' : 'ไม่ผ่าน'}`);
  } else {
    res.errs.push(...syntax(file), ...syntax(path.join(DIR, 'manual', 'index.html')), ...orbLib(file));
    if (res.errs.length) console.log('syntax ผิด → ข้ามการเปิดในเบราว์เซอร์');
    else {
      const b = await browser(DIR);
      if (b.skip) { res.skip = b.skip; console.log('⚠', b.skip) }
      res.errs.push(...(b.errs || [])); res.warn.push(...(b.warn || [])); res.net = (b.net || []).length; res.info = b.info;
      if (b.net && b.net.length) console.log(`error เครือข่าย/ภายนอก ${b.net.length} รายการ (ไม่นับ):\n  ` + b.net.slice(0, 5).join('\n  '));
    }
    res.ok = res.errs.length ? false : res.skip ? null : true;
  }
  res.sec = Math.round((Date.now() - t0) / 1000);
  if (res.warn.length) console.log('คำเตือน:\n  ' + res.warn.slice(0, 15).join('\n  '));
  if (res.errs.length) console.log('ข้อผิดพลาด:\n  ' + res.errs.slice(0, 15).join('\n  '));
  console.log(res.ok === true ? `✅ ผ่าน (${res.sec} วิ)` : res.ok === false ? `❌ ไม่ผ่าน ${res.errs.length} รายการ` : '⚠ ตรวจในเบราว์เซอร์ไม่ได้ (syntax ผ่าน)');
  if (!CI) return quit(res.ok === true ? 0 : res.ok === false ? 1 : 2);

  // ---------- --ci: ไม่ผ่าน → ใช้ index.html ฉบับบนเว็บ ----------
  if (res.ok === false) {
    console.log(`::error title=หน้าเว็บฉบับใหม่ไม่ผ่านการตรวจ::${res.errs.slice(0, 3).join(' ; ').replace(/\r?\n/g, ' ')}`);
    try {
      const r = await fetch(SITE + 'index.html?t=' + Date.now(), { signal: AbortSignal.timeout(60e3) });
      const b = Buffer.from(await r.arrayBuffer());
      if (!r.ok || b.length < 1e5 || !b.includes('maplibre')) throw new Error('HTTP ' + r.status + ' ' + b.length + ' ไบต์');
      fs.writeFileSync(file, b); res.fallback = crypto.createHash('sha1').update(b).digest('hex');
      console.log(`ใช้ index.html ฉบับบนเว็บแทน (${(b.length / 1024).toFixed(0)} KB) — live.json/ข้อมูลอื่นยังขึ้นตามปกติ`);
    } catch (e) { res.fallback = null; console.log('::warning::ดึง index.html ฉบับบนเว็บไม่ได้ (' + e.message + ') — ขึ้นฉบับใหม่ไปตามเดิม') }
  } else if (res.ok === null) console.log('::warning title=ตรวจหน้าเว็บในเบราว์เซอร์ไม่ได้::' + (res.skip || ''));
  res.errs = res.errs.slice(0, 20); res.warn = res.warn.slice(0, 20);
  fs.writeFileSync(path.join(DIR, 'check.json'), JSON.stringify(res));
  quit(0);
})().catch(e => { console.error(e); quit(CI ? 0 : 2) });
