// ตรวจหน้าเว็บก่อนขึ้น GitHub Pages (ผู้ใช้ขอ 11 พ.ย. 69) — ไม่ต้องติดตั้งแพ็กเกจ (Node 22+ มี WebSocket)
//  1) syntax: แยก <script> ทุกบล็อกใน index.html (+ manual/index.html) คอมไพล์ด้วย vm.Script / JSON.parse บล็อกข้อมูล
//  2) smoke test: เปิดหน้าใน Chrome headless (เดสก์ท็อป 1440 + มือถือ 390) กดปุ่มเมนู/เครื่องมือหลัก
//     แล้วนับ error ที่ไม่ถูกจับ (Runtime.exceptionThrown) — error เครือข่าย (โหลดไทล์/API ไม่ได้) ไม่นับ
//  3) ?debug=1: มี __LOG/dbg/fetchT + ปุ่ม #dg-cp · fetchT('/__hang', 0.8 วิ) ต้องได้ TimeoutError · ออฟไลน์แล้วกด ↻ ต้องมี toast ภายใน 22 วิ
//     และ __LOG เพิ่ม · ปุ่มคัดลอกได้ JSON (ua/ver/log) · info.debug ใน check.json
//  3b) F4 แดชบอร์ด ?dash ที่ 1920×1080 และ 390: เปิดเอง, KPI ตรง summary.json, ไทล์ 24 ชม. = การ์ดหลัก, ไม่ล้น, ปุ่ม #bDash/×/ดงใหญ่
//  4) จำลองเบราว์เซอร์รุ่นเก่า (ลบ DecompressionStream ก่อนโหลดหน้า) → ต้องขึ้นกล่อง #oldb เต็มจอ
//
// ใช้ในเครื่อง:  node scripts/check_site.js            (ตรวจ index.html ในโฟลเดอร์โปรเจกต์)
//               node scripts/check_site.js _site       (ตรวจผลของ build_site)
// ใน Actions:   node scripts/check_site.js _site --ci
//   --ci = เขียนผลที่ _site/check.json (health.js อ่านไปแจ้งผู้ดูแล) และถ้าไม่ผ่าน → แทน _site/index.html ด้วยฉบับที่อยู่บนเว็บตอนนี้
//          (ฉบับก่อนหน้าที่ผ่านแล้ว) เพื่อให้ live.json/ข้อมูลอื่นยังขึ้นเว็บตามปกติ แต่โค้ดที่พังไม่ขึ้น · exit 0 เสมอ
//          ถ้า index.html ตรงกับรอบที่ตรวจแล้ว (sha ใน check.json บนเว็บ) ใช้ผลเดิม ไม่เปิด Chrome ซ้ำ
//   exit code (ไม่ใช่ --ci): 0 ผ่าน · 1 ไม่ผ่าน · 2 ตรวจในเบราว์เซอร์ไม่ได้ (หา/เปิด Chrome ไม่ได้)
// ตัวแปร: CHROME = ที่อยู่ Chrome · SITE_URL = เว็บที่ใช้เทียบ/ดึงฉบับก่อนหน้า · CHECK_FORCE=1 ตรวจใหม่แม้ sha เดิม
//        UNIT=failure (--ci, site.yml ส่งผลขั้น node --test test/) = ชุดทดสอบหน่วยไม่ผ่าน → ถือว่าไม่ผ่าน ใช้ฉบับบนเว็บ ไม่ใช้ผลเดิม
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), http = require('http'), crypto = require('crypto');
const { spawn } = require('child_process');
const CSP = require('./lib/csp'), LINT = require('./lint_html');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), CI = args.includes('--ci'), UNIT_FAIL = CI && process.env.UNIT === 'failure';
const DIR = path.resolve(ROOT, args.find(a => !a.startsWith('--')) || '.');
const SITE = (process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STEP_TO = 180e3; // ขั้นใน DESK/MOB: นานกว่าเพดานรอในหน้าที่ยาวที่สุด (TRKY 600×250 ms = 150 วิ) — เดิม 30 วิ ทำให้ DEM โหลดช้าแล้วขั้นล้มทั้งที่ยังรออยู่
const t0 = Date.now();
// ปิดโปรแกรมหลังปล่อย handle ที่ค้าง (process.exit ทันทีบน Windows เคยเจอ assertion UV_HANDLE_CLOSING)
const quit = c => { process.exitCode = c; setTimeout(() => process.exit(c), 800) };

// ---------- 1) syntax ----------
// สำเนา scripts/lib/orbit.js ที่ฝังใน index.html ต้องตรงกับไฟล์ต้นฉบับ (แก้ที่ lib แล้วลืม node scripts/embed_orbit.js)
// F2 (16 พ.ย. 69): scripts/lib/risk.js (RISK-LIB) ตรวจแบบเดียวกัน — node scripts/embed_risk.js
function orbLib(file, name = 'orbit', tag = 'ORB') {
  const B = `/*${tag}-LIB-BEGIN*/`, E = `/*${tag}-LIB-END*/`, cut = t => { const i = t.indexOf(B), j = t.indexOf(E); return i < 0 || j < i ? null : t.slice(i, j + E.length) };
  const lib = path.join(ROOT, 'scripts', 'lib', name + '.js'); if (!fs.existsSync(file) || !fs.existsSync(lib)) return [];
  const a = cut(fs.readFileSync(file, 'utf8')), b = cut(fs.readFileSync(lib, 'utf8').replace(/\r\n/g, '\n'));
  return a === b ? [] : [`${path.relative(ROOT, file).replace(/\\/g, '/')}: สำเนา scripts/lib/${name}.js ${a ? 'ไม่ตรงกับต้นฉบับ' : 'หายไป'} — รัน node scripts/embed_${name}.js`];
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
    if (ty && !/javascript|module|x-emb-app/i.test(ty)) continue; // x-emb-app = สคริปต์แอปที่ build_site พักไว้ให้ตัวโหลดรันหลังข้อมูลฝังมาครบ (B1)
    try { new vm.Script(code, { filename: rel, lineOffset: line - 1 }) }
    catch (e) { const w = (e.stack || '').split('\n')[0]; errs.push(`${w.includes(rel) ? w : rel + ':' + line} ${e.name}: ${e.message}`) }
  }
  // B1: _site/index.html มีดัชนี #emb → ไฟล์ data/emb/*.json ต้องมีและเป็น JSON
  const ix = h.match(/<script type="application\/json" id="emb">([\s\S]*?)<\/script>/);
  if (ix) for (const [id, u] of Object.entries(JSON.parse(ix[1]))) { try { JSON.parse(fs.readFileSync(path.join(path.dirname(file), u), 'utf8')) } catch (e) { errs.push(`${rel} ข้อมูลฝัง ${id} (${u}) อ่านไม่ได้: ${e.message.slice(0, 120)}`) } }
  console.log(`syntax ${rel}: ${n} บล็อก${ix ? ' + ข้อมูลฝังแยกไฟล์ ' + Object.keys(JSON.parse(ix[1])).length : ''}, ผิด ${errs.length}`);
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.gz': 'application/gzip' };
function serve(dir) {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    // ปลายทางที่ไม่ตอบ 5 วิ — ใช้ตรวจว่า fetchT ตัดตามเวลาที่กำหนด (A2)
    if (p === '/__hang') { setTimeout(() => { try { r.writeHead(204); r.end() } catch (e) { } }, 5000); return }
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end() }
    const hd = { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' };
    // E2: หน้า HTML ได้ CSP แบบรายงานอย่างเดียว (scripts/lib/csp.js) เหมือน serve.js / sw.js บนโฮสต์ — ไม่บล็อกอะไร
    if (path.extname(f).toLowerCase() === '.html') hd[CSP.HEADER] = CSP.policy(fs.readFileSync(f, 'utf8'));
    r.writeHead(200, hd); fs.createReadStream(f).pipe(r);
  });
  return new Promise(res => s.listen(0, '127.0.0.1', () => res(s)));
}
// error ที่มาจากเครือข่าย/ต้นทางภายนอก ไม่ใช่โค้ดเรา
const NET = /Failed to fetch|NetworkError|Load failed|AJAXError|AbortError|aborted|timed? ?out|ERR_|net::|status (0|4\d\d|5\d\d)|HTTP [45]\d\d|Unexpected token '<'|is not valid JSON|webgl|WebGL/i;

// D4 ค้นหา (16 พ.ย. 69): พิมพ์ในช่อง #gz-q แล้วรอผลแรกตรงเงื่อนไข ≤10 วิ (admin.json/ranger.json โหลดตอนเปิดช่องครั้งแรก)
const GZQ = (q, cond) => `(async()=>{const i=document.getElementById('gz-q');if(!i||document.getElementById('gz').hidden)return 'error: ช่องค้นหาไม่เปิด';i.value=${JSON.stringify(q)};i.dispatchEvent(new Event('input'));const ok=e=>e&&(${cond});for(let k=0;k<40&&!ok(GZ.R[0]);k++)await new Promise(r=>setTimeout(r,250));const e=GZ.R[0];return ok(e)?'':'error: ค้น '+${JSON.stringify(JSON.stringify(q))}+' ได้ '+(e?e.k+' '+e.n:'ไม่มีผล')+' · '+document.getElementById('gz-n').textContent})()`;
const GZ4 = [['  ค้น "บุพราหมณ์"', GZQ('บุพราหมณ์', "e.k==='tm'&&e.n==='ต.บุพราหมณ์'&&/อ\.นาดี/.test(e.s)")], ['  ค้น "ทับลาน"', GZQ('ทับลาน', "e.k==='pa'&&e.n==='อุทยานแห่งชาติทับลาน'")], ['  ค้น "47 820000 1560000"', GZQ('47 820000 1560000', "e.k==='co'&&Math.abs(e.pt[1]-14.09275)<1e-4&&Math.abs(e.pt[0]-101.96324)<1e-4")], ['  ค้น "14.1,101.9"', GZQ('14.1,101.9', "e.k==='co'&&Math.abs(e.pt[1]-14.1)<1e-6&&Math.abs(e.pt[0]-101.9)<1e-6")]];
// B2 (17 พ.ย. 69) งานหนักใน Web Worker (WJ): ต้องรอข้อความ "กำลังคำนวณ…" หายก่อนอ่านตัวเลข · ตัวเลขต้องเท่ากับการคำนวณบน main thread (fallback) · Worker ต้องถูกใช้จริง (ไม่งั้นเตือน)
const WAIT = (cond, n) => `for(let k=0;k<${n}&&!(${cond});k++)await new Promise(r=>setTimeout(r,250));`;
const HC2563 = `(async()=>{const s=document.getElementById('hc-s');if(!s||!s.querySelector('option[value="y2563"]'))return 'ไม่พบตัวเลือกปีงบ 2563 ในกล่องกองจุดความร้อน';s.value='y2563';s.dispatchEvent(new Event('change'));
 const T=()=>document.getElementById('hc-a').textContent;${WAIT(`!/กำลังคำนวณ/.test(T())&&HCC&&HCC.k.startsWith('y2563|')`, 240)}
 if(/กำลังคำนวณ/.test(T()))return 'error: กองจุดความร้อนปีงบ 2563 ยังขึ้น "กำลังคำนวณ…" หลัง 60 วิ';if(!HCC||!HCC.k.startsWith('y2563|'))return 'error: HCC ไม่ใช่ปีงบ 2563 ('+(HCC&&HCC.k.slice(0,20))+')';
 if(!HCC.P.length||!HCC.C.length||!T().includes(nf(HCC.P.length)+' จุด'))return 'error: กล่องกองจุดความร้อนไม่แสดงตัวเลข ('+T().slice(0,80)+')';
 window.__ckWJ=Object.assign(window.__ckWJ||{},{worker:!!WJ.w&&!WJ.dead,hc:{n:HCC.P.length,C:HCC.C.length,G:HCC.G.length,rai:Math.round(HCC.G.reduce((s,g)=>s+g.rai,0))}});
 return WJ.w&&!WJ.dead?'':'Worker ไม่ได้ถูกใช้ (คำนวณบน main thread: '+(WJ.dead?'dead':'ไม่ได้สร้าง')+')'})()`;
// คำนวณซ้ำบน main thread ด้วยโค้ดชุดเดียวกับ fallback (WJ.main0 + hcFin) แล้วเทียบกับผลจาก Worker ทุกค่า (จำนวนกอง, ไร่, วงแหวน, จุดเริ่มต้น)
const HCSYNC = `(()=>{const H=HCC;if(!H)return 'error: ไม่มี HCC';const P=H.P,N=P.length,lo=new Float64Array(N),la=new Float64Array(N),d=new Float64Array(N);P.forEach((p,i)=>{lo[i]=p.lo;la[i]=p.la;d[i]=p.d});
 const M=hcFin(H.k,H.R,P.map(p=>Object.assign({},p)),WJ.main0('hcGroups',[{lo,la,d,HCD,HCG,HCR}])),key=X=>JSON.stringify([X.C.map(c=>[c.n,c.d,c.c,c.g]),X.G.map(g=>[g.n,g.rai,g.ring,g.path,g.ign.c,g.ign.d,g.ign.t,g.cl])]);
 return key(M)===key(H)?'':'error: ผล Worker ≠ main thread (กอง '+H.C.length+'/'+M.C.length+' กองรวม '+H.G.length+'/'+M.G.length+')'})()`;
const BNWAIT = `(async()=>{const T=()=>document.getElementById('bn-a').textContent;${WAIT(`!/กำลังโหลด|กำลังคำนวณ/.test(T())&&T().length>10&&(!BNCUR||BNCUR.k===BNK)`, 360)}
 if(/ไม่สำเร็จ/.test(T()))return 'พื้นที่เผาไหม้: '+T().slice(0,100);if(/กำลัง/.test(T()))return 'error: พื้นที่เผาไหม้ยังขึ้น "'+T().slice(0,30)+'" หลัง 90 วิ';
 if(!BNCUR||BNCUR.k!==BNK||!/ไร่/.test(T()))return 'error: กล่องพื้นที่เผาไหม้ไม่แสดงตัวเลข ('+T().slice(0,80)+')';
 window.__ckWJ=Object.assign(window.__ckWJ||{},{bn:{k:BNK,runs:BNCUR.R.length,rai:Math.round(BNCUR.R.reduce((s,o)=>s+(S.xdy&&o.dy?0:o.n*BNPX),0))}});return ''})()`;
// B2 ต่อ (17 พ.ย. 69): ไทล์ burn/brep วาดใน Worker ต้องได้พิกเซลเท่ากับวาดบน main thread (bnTile0/rpTile0 = ทางเดิม) ทุกไทล์ที่สุ่ม
// และจุดความร้อนใกล้รอยเผา (bnHotP ใน Worker) ต้องเท่ากับ bnHot เดิมทุกแถว · Worker วาดไม่ได้ (คืน null) = error
const PXH = `const hash=async ab=>{const bm=await createImageBitmap(new Blob([ab],{type:'image/png'})),c=new OffscreenCanvas(256,256),g=c.getContext('2d');g.drawImage(bm,0,0);const d=g.getImageData(0,0,256,256).data;let h=2166136261,n=0;for(let i=0;i<d.length;i++)h=Math.imul(h^d[i],16777619)>>>0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return h+':'+n};
 const pick=(R,zs)=>{const L=[];for(const z of zs)for(const f of [0,.5,.99]){const o=R[Math.floor(f*(R.length-1))];if(o)L.push([z,Math.floor((o.bb[0]+o.bb[2])/2*2**z),Math.floor((o.bb[1]+o.bb[3])/2*2**z)])}return L};`;
const BNTILE = `(async()=>{const D=BNCUR;if(!D||!D.pk||!D.R.length)return 'ข้าม';if(typeof OffscreenCanvas==='undefined')return 'ไม่มี OffscreenCanvas';${PXH}
 const C=Object.assign({},D,{R:D.R.map(o=>Object.assign({},o)),hsDone:0,hsP:null});bnHot(C);const dh=D.R.findIndex((o,i)=>o.hs!==C.R[i].hs);if(dh>=0||C.hsPre!==D.hsPre)return 'error: จุดความร้อนใกล้รอยเผา Worker ≠ main thread (แถว '+dh+')';
 let n=0;for(const xh of [false,true])for(const [z,x,y] of pick(D.R,[9,12,15])){const w=await bnTileW(D,z,x,y,!!S.xdy,xh);if(!w)return 'error: Worker วาดไทล์พื้นที่เผาไหม้ไม่ได้ ('+z+'/'+x+'/'+y+')';
  const a=await hash(w),b=await hash(await bnTile0(D,z,x,y,!!S.xdy,xh));if(a!==b)return 'error: ไทล์พื้นที่เผาไหม้ '+z+'/'+x+'/'+y+(xh?' (เน้นสี)':'')+' Worker ≠ main thread ('+a+' / '+b+')';n++}
 window.__ckWJ=Object.assign(window.__ckWJ||{},{bnTiles:n,hs:D.R.filter(o=>o.hs).length});return ''})()`;
const RPTILE = `(async()=>{const T=()=>document.getElementById('rp-a').textContent;${WAIT(`typeof RPV!=='undefined'&&RPV&&!/กำลัง/.test(T())`, 240)}
 if(!RPV)return /ไม่สำเร็จ/.test(T())?'เผาซ้ำซาก: '+T().slice(0,80):'error: พื้นที่เผาซ้ำซากไม่ขึ้นใน 60 วิ';if(typeof OffscreenCanvas==='undefined')return '';${PXH}
 let n=0;for(const mn of [1,2])for(const [z,x,y] of pick(RPV.R.filter(o=>o.c>=mn),[9,13])){const w=await rpTileW(RPV,z,x,y,mn,!!S.xdy);if(!w)return 'error: Worker วาดไทล์เผาซ้ำซากไม่ได้';
  const a=await hash(w),b=await hash(await rpTile0(RPV,z,x,y,mn,!!S.xdy));if(a!==b)return 'error: ไทล์เผาซ้ำซาก '+z+'/'+x+'/'+y+' m'+mn+' Worker ≠ main thread';n++}
 window.__ckWJ=Object.assign(window.__ckWJ||{},{rpTiles:n,rpRows:RPV.R.length});return ''})()`;
// ภูมิประเทศ: อช.เขาใหญ่ (รูปใหญ่สุดของแนวเขต) เส้นชั้นความสูง 20 ม. แล้วความลาดชัน — DEM จาก AWS (เน็ต) โหลดไม่ได้ = เตือน
const TRWAIT = (cond, n) => `${WAIT(`(TR.R&&TR.st===''&&(${cond}))||(TR.st&&!/^กำลัง/.test(TR.st))`, n)}if(TR.st&&/โหลดข้อมูลความสูง/.test(TR.st))return 'ภูมิประเทศ: '+TR.st;if(TR.st)return 'error: ภูมิประเทศ: '+TR.st;if(!TR.R||!(${cond}))return 'error: ภูมิประเทศไม่มีผลตามที่คาด';`;
const TRKY = `(async()=>{const g=JSON.parse(document.getElementById('geo').textContent).cons.features.find(f=>/เขาใหญ่/.test(f.properties.name)).geometry,P=g.type==='Polygon'?g.coordinates[0]:g.coordinates.map(p=>p[0]).sort((a,b)=>msArea(b)-msArea(a))[0];
 TR.t='c';TR.iv=20;trUse(P,0);${TRWAIT(`TR.R.t==='c'&&TR.R.iv===20`, 600)}if(!(TR.R.nl>0&&TR.R.el.mx>TR.R.el.mn))return 'error: เส้นชั้นความสูงเขาใหญ่ว่าง';
 window.__ckWJ=Object.assign(window.__ckWJ||{},{tr:{rai:Math.round(TR.R.A/1600),mn:Math.round(TR.R.el.mn),mx:Math.round(TR.R.el.mx),nl:TR.R.nl,km:Math.round(TR.R.len/1000)}});return ''})()`;
const TRSLOPE = `(async()=>{if(!TR.R)return 'ข้าม';TR.t='s';trRun();${TRWAIT(`TR.R.t==='s'`, 600)}const ok=TR.R.sw>0&&TR.R.cnt.length===7;TR.t='c';TR.iv=10;return ok?'':'error: ความลาดชันเขาใหญ่ว่าง'})()`;
// ขั้นตอนที่กดในหน้า: [ชื่อ, โค้ด JS] — ไม่พบปุ่ม = เตือน (ไม่นับเป็นผิด) · ปุ่มปิดกดเฉพาะเมื่อมองเห็น
// E2 (16 พ.ย. 69): KML ที่ชื่อไฟล์/ชื่อชั้น/ชื่อวัตถุ/คำอธิบาย (CDATA)/ExtendedData เป็น <img src=x onerror=alert(1)> ผ่าน GIO.load (ulImport)
// → รายการชั้น + ป๊อปอัปวัตถุต้องแสดงเป็นข้อความ: alert ไม่ถูกเรียก, ไม่มี <img src="x"> ในหน้า, ข้อความ "<img src=x" อยู่ใน textContent · แล้วลบชั้นทดสอบ
const XSS = `(async()=>{const P='<img src=x onerror=alert(1)>',X=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),sl=ms=>new Promise(r=>setTimeout(r,ms));
 window.__xss=0;window.alert=()=>{window.__xss++};
 const kml='<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>'+X(P)+'</name><Placemark><name>'+X(P)+'</name><description><![CDATA['+P+' <b>ตัวหนา</b>]]></description><ExtendedData><Data name="'+X(P)+'"><value>'+X(P)+'</value></Data><SchemaData><SimpleData name="f">'+X(P)+'</SimpleData></SchemaData></ExtendedData><Point><coordinates>101.9,14.3,0</coordinates></Point></Placemark></Document></kml>';
 if(typeof ulImport!=='function'||typeof GIO==='undefined')return 'error: ไม่มี ulImport/GIO';
 const n0=UL.L.length;await ulImport([new File([kml],P+'.kml',{type:'application/vnd.google-earth.kml+xml'})]);await sl(700);
 if(UL.L.length!==n0+1)return 'error: นำเข้า KML ทดสอบไม่ได้';
 const l=UL.L[UL.L.length-1],k='l'+l.id,f=l.fc.features[0];ulList();ulPop(k,f.properties._id,{lng:101.9,lat:14.3});await sl(500);
 const pp=document.querySelector('.maplibregl-popup'),e=[];
 if(window.__xss)e.push('alert ถูกเรียก '+window.__xss+' ครั้ง');
 if(document.querySelector('img[src="x"]'))e.push('มี <img src="x"> ในหน้า (HTML จากไฟล์ถูกแปลเป็นแท็ก)');
 if(!pp)e.push('ไม่มีป๊อปอัปวัตถุ');else if(!pp.textContent.includes(P))e.push('ป๊อปอัปไม่แสดงชื่อ/คำอธิบายเป็นข้อความ');
 if(!(document.getElementById('ul-ll')||document.body).textContent.includes(P))e.push('รายการชั้นไม่แสดงชื่อเป็นข้อความ');
 window.__ckXss={popup:pp?pp.textContent.split(P).length-1:0,list:(document.getElementById('ul-ll')||document.body).textContent.split(P).length-1,alert:window.__xss};
 UL.L=UL.L.filter(x=>x!==l);try{ULDB.del(l.id).catch(()=>{})}catch(_){}try{ulDrop(k)}catch(_){}if(ULP)ULP.remove();ulList();
 return e.length?'error: XSS — '+e.join(' · '):''})()`;
// E3 (17 พ.ย. 69): หลังบ้านชั้นข้อมูล — แท็บ "บันทึกการใช้งาน" (ผู้ดูแล) + ปุ่ม "ออกจากระบบทุกอุปกรณ์" + ตรวจขนาด 8 MB ก่อนอัปโหลด
// ใช้ ulApi จำลองในหน้า (ไม่ต่อ Worker จริง ไม่ล็อกอินจริง) แล้วคืนค่าเดิม · ชื่อชั้นในบันทึกเป็น HTML ต้องแสดงเป็นข้อความ · มือถือ: ตารางบันทึกต้องไม่ล้นแนวนอน
const E3UI = `(async()=>{if(typeof ulALog!=='function'||typeof ulLogAll!=='function')return 'error: ไม่มี ulALog/ulLogAll';
 const o=ulApi,me=UL.me,tk=UL.tok,op=UL.open,sl=ms=>new Promise(r=>setTimeout(r,ms)),calls=[],c0=window.confirm,X='<img src=x onerror=alert(1)>';window.__xss=window.__xss||0;window.alert=()=>{window.__xss++};
 ulApi=async(p,x={})=>{calls.push(p);if(p==='/users')return{users:[],groups:[],root:'admin'};if(p==='/layers')return{layers:[],groups:[]};
  if(p==='/log')return{log:[{t:Date.now(),u:'admin',d:'ผู้ดูแลหลัก',a:'layer-add',k:'layer',id:'ab12',n:X,x:'12 KB'},{t:Date.now()-6e4,u:'somchai',d:'สมชาย',a:'rep-add',k:'report',id:'cd34',fy:2570,n:'บุพราหมณ์|นาดี|ปราจีนบุรี',x:'none'},{t:Date.now()-12e4,u:'somchai',d:'สมชาย',a:'login',k:'auth'}],max:200};
  if(p==='/logout-all')return{ok:true};return o(p,x)};
 try{UL.me={u:'admin',d:'ผู้ดูแลหลัก',a:true,root:true,g:[]};UL.tok='ck-fake';
  const big='{"type":"FeatureCollection","features":[{"properties":{"n":"'+'ก'.repeat(2.9e6)+'"}}]}';let er='';try{await o('/layers',{method:'POST',body:big})}catch(e){er=e.message}
  if(!/ใหญ่เกิน 8 MB/.test(er))return 'error: ไม่ตรวจขนาด 8 MB ก่อนอัปโหลด ('+er+')';
  await ulAdmin('log');for(let k=0;k<20&&!document.getElementById('ua-lt');k++)await sl(100);
  const b=document.getElementById('ua-b'),t=b?b.textContent:'';if(!document.getElementById('ua-lt'))return 'error: แท็บบันทึกการใช้งานไม่มีตาราง: '+t.slice(0,100);
  if(!/อัปโหลดชั้นใหม่/.test(t)||!/บันทึกผลตรวจสอบ/.test(t)||!/ต\\.บุพราหมณ์ อ\\.นาดี/.test(t)||!/ไม่พบไฟ/.test(t)||!t.includes(X))return 'error: บันทึกแสดงไม่ครบ: '+t.slice(0,160);
  if(document.querySelector('img[src="x"]')||window.__xss)return 'error: XSS ในบันทึกการใช้งาน';
  const sel=document.getElementById('ua-lk');sel.value='report';sel.dispatchEvent(new Event('change'));if(document.querySelectorAll('#ua-lt tr').length!==2)return 'error: กรองประเภท "ผลตรวจสอบ" ไม่ได้ 1 แถว';
  const md=document.getElementById('md-b'),ov=md&&md.scrollWidth-md.clientWidth;window.__ckE3={rows:3,ov};if(ov>2)return 'error: ตารางบันทึกล้นแนวนอน '+ov+' px';
  closeModal();if(!UL.open)ulOpen(true);ulList();const a=document.querySelector('#ul-acc [data-a="lall"]');if(!a)return 'error: ไม่มีปุ่ม "ออกจากระบบทุกอุปกรณ์" ในแผงชั้นข้อมูลของฉัน';
  window.confirm=()=>true;a.click();for(let k=0;k<20&&UL.tok;k++)await sl(100);
  if(!calls.includes('/logout-all'))return 'error: ไม่ได้เรียก /logout-all';if(UL.tok||UL.me)return 'error: กดแล้วยังไม่ออกจากระบบในเครื่องนี้';
  return ''}finally{window.confirm=c0;await sl(200);ulApi=o;UL.tok=tk;UL.me=me;try{closeModal()}catch(_){}if(!op&&UL.open)ulOpen(false);else ulList()}})()`;
// F5 (18 พ.ย. 69): แผงรายละเอียดจุด → โมเดลไฟ: ที่มาของทุกค่า (#fq-src) · ข้อความศักยภาพ + พื้นที่ 1 ชม. (#fq-pot) · ค่าทดสอบ 7.3 = หัวไฟ 4.7 และ FFMC ที่มาทีหลังไม่ทับ
// · ปุ่มสลับ FFMC/EMC (#fq-mm, FFMC จำลอง 88.5 เพราะไฟล์กรอบ FWI ของวันนี้อาจไม่มีในเครื่อง) · มือถือ: ตารางที่มาไม่ล้นแนวนอน
// · (6) กลางคืน (FQ.nt) ใช้ EMC + เหตุผลใน #fuel-why แต่กด FFMC เองได้ · (7) Lagrangian + ค่าทดสอบ ≈1,999 ไร่ ไม่ใช้รายชั่วโมง, ไม่ใช้ FFMC/ไม่ปรับเอง = P.hrly
const FQCK = `(async()=>{if(typeof fqPick!=='function')return 'error: ไม่มีโมดูล fq (F5)';
 openDetail({id:9001,lat:14.4302,lon:101.3712,t:Date.now()-36e5,sat:'NOAA-20',frp:5,conf:'n',prov:'ไม่ระบุ',amp:'ไม่ระบุ',tam:'ไม่ระบุ',demo:true,ns:'sample'});
 ${WAIT(`FQ.stOk&&FQ.ffOk&&FQ.om`, 60)}
 const s=document.getElementById('fq-src').textContent,p=document.getElementById('fq-pot').textContent;
 if(!/ลำดับที่มา/.test(s)||!/ความชื้นเชื้อเพลิง/.test(s)||!/ความลาดชัน/.test(s))return 'error: ไม่แสดงที่มาของค่า: '+s.slice(0,80);
 if(!/ศักยภาพเมื่อไฟลามอิสระโดยไม่มีการดับ ไม่ใช่การพยากรณ์รอยไหม้จริง/.test(p)||!/ที่ 1 ชม/.test(p))return 'error: ไม่มีข้อความศักยภาพ/พื้นที่ 1 ชม.: '+p;
 if(FQ.om&&!(WS&&WS.rh&&WS.T))return 'error: Open-Meteo รายชั่วโมงไม่มีความชื้น/อุณหภูมิ (WS.rh/WS.T)';window.__ckFqL=FQ.om?{hrly:P.hrly,rh0:WS.rh[0],rh6:WS.rh[6]}:null;
 document.getElementById('d-test').click();if(Math.abs(LASTR.Rh-4.7)>1e-9)return 'error: ค่าทดสอบ 7.3 ได้หัวไฟ '+LASTR.Rh;
 FQ.ff={v:88.5,m:ffM(88.5),d:fwTday(),f:1};FQ.ffOk=1;fqApply();upd();if(Math.abs(LASTR.Rh-4.7)>1e-9)return 'error: FFMC ที่มาทีหลังทับค่าทดสอบ';
 document.querySelector('#fq-mm [data-m="f"]').click();if(Math.abs(LASTR.E-ffM(88.5))>1e-9||!/FFMC 88.5/.test(document.getElementById('fuel-why').textContent))return 'error: ปุ่ม FFMC ไม่ใช้ความชื้นจาก FFMC';
 document.querySelector('#fq-mm [data-m="e"]').click();if(P.fm!=null)return 'error: ปุ่มจากอากาศ (EMC) ไม่สลับกลับ';FQ.mp='f';
 document.querySelector('#sm [data-m="l"]').click();const lr=LASTR.rai;document.querySelector('#sm [data-m="g"]').click();if(P.hrly||Math.abs(lr/1999-1)>.05)return 'error: Lagrangian ค่าทดสอบควร ≈1,999 ไร่ ไม่ใช้รายชั่วโมง ได้ '+Math.round(lr)+' hrly '+P.hrly;
 FQ.test=0;FQ.man={};FQ.mo=null;FQ.mp='f';FQ.nt=1;fqApply();upd();if(P.fm!=null||!/กลางคืน — FFMC เป็นค่าเที่ยงวัน จึงใช้ความชื้นจากอากาศขณะนั้น/.test(document.getElementById('fuel-why').textContent))return 'error: กลางคืนไม่ใช้ EMC/ไม่บอกเหตุผล: '+document.getElementById('fuel-why').textContent;
 if(!P.hrly)return 'error: ไม่ใช้ FFMC และไม่ได้ปรับเอง แต่ P.hrly ไม่ถูกตั้ง';document.querySelector('#fq-mm [data-m="f"]').click();if(Math.abs((P.fm||0)-ffM(88.5))>1e-9)return 'error: กลางคืนกดเลือก FFMC เองไม่ได้';if(P.hrly)return 'error: ใช้ FFMC แล้วยังใช้ EMC รายชั่วโมง';FQ.mp='f';
 const b=document.getElementById('fq-src'),ov=b.scrollWidth-b.clientWidth;window.__ckFq={st:FQ.st&&FQ.st.n,ff:FQ.ffOk,ov};if(ov>2)return 'error: ตารางที่มาล้นแนวนอน '+ov+' px';
 return ''})()`;
const DESK = [
  ['การ์ดสถิติย้อนหลัง', `C('bStat')`], ['  แท็บการดับไฟป่า', `Q('#h-tab [data-v="xt"]')`], ['  ตารางการดับไฟ', `C('x-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  Excel แบบ อส. (F1)', `C('x-xls')`], ['  แถวที่ควรตรวจพิกัด (C4)', `C('x-chk')`], ['  แท็บจุดความร้อน', `Q('#h-tab [data-v="hs"]')`], ['  ตารางสถิติ', `C('h-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  แท็บทุกดาวเทียม', `Q('#h-tab [data-v="ha"]')`], ['  ตารางทุกดาวเทียม', `C('h-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  รายงานประจำเดือน (F3)', `(async()=>{const b=document.getElementById('h-mrep');if(!b)return 'ไม่พบ #h-mrep';b.click();const B=()=>document.getElementById('md-b').textContent;for(let k=0;k<40&&/กำลังโหลด/.test(B());k++)await new Promise(r=>setTimeout(r,250));return document.querySelector('#md-b table.dt a[href*="reports/"]')||/ยังไม่มีรายงาน/.test(B())?'':'รายการรายงานประจำเดือนไม่ขึ้น: '+B().slice(0,80)})()`], ['  ปิด', `C('md-x',1)`], ['  ปิดการ์ดสถิติ', `C('h-x',1)`],
  ['พื้นที่เฝ้าระวังพิเศษ', `C('bWch')`], ['  ตาราง จปร.', `C('w-tbl')`], ['  ปิดตาราง', `C('md-x',1)`], ['  ปิด', `C('bWch')`],
  ['ย้อนดูการลามของไฟ (ปีงบนี้)', `C('bPlay')`], ['  90 วันล่าสุด', `Q('#pb-w [data-v="90"]')`], ['  ×0.5', `Q('#pb-sp [data-v="0.5"]')`], ['  เล่น', `C('pb-p')`], ['  หยุด', `C('pb-p')`], ['  1 วัน (รายชั่วโมง)', `Q('#pb-w [data-v="1"]')`], ['  สถิติย้อนหลัง', `C('pb-m')`], ['  เล่น', `C('pb-p')`], ['  หยุด', `C('pb-p')`], ['  ปิด', `C('pb-x',1)`], ['  ปิดการ์ดสถิติ', `C('h-x',1)`],
  ['ตารางจุดความร้อน', `C('p-tbl')`], ['  ปีงบย้อนหลัง (ทุกดาวเทียม)', `(()=>{const y=document.getElementById('dt-y');if(!y||y.options.length<2)return 'ไม่พบตัวเลือกปีงบย้อนหลัง';y.value=y.options[1].value;y.dispatchEvent(new Event('change'));return ''})()`], ['  ปิดตาราง', `C('md-x',1)`],
  ['แผงชั้นข้อมูล', `C('bLay')`], ['  ภาพเมฆ Himawari-9', `Q('.sw[data-k="him"]')`], ['  ยอดเมฆ', `Q('#hmseg [data-v="ct"]')`], ['  เล่นภาพ', `C('hm-pl')`], ['  หยุด', `C('hm-pl')`], ['  อินฟราเรด', `Q('#hmseg [data-v="ir"]')`], ['  เรดาร์ฝน', `Q('#hmseg [data-v="rd"]')`], ['  เล่นเรดาร์', `C('rd-pl')`], ['  หยุดเรดาร์', `C('rd-pl')`], ['  กลับอินฟราเรด', `Q('#hmseg [data-v="ir"]')`], ['  ปิดเมฆและเรดาร์ฝน', `Q('.sw[data-k="him"]')`], ['  สภาพอากาศแบบจำลอง', `Q('.sw[data-k="wx"]')`], ['  ลม', `Q('#wxseg [data-v="ws"]')`], ['  ชั่วโมงถัดไป', `C('wx-nx')`], ['  ปิดเส้นลม', `Q('.sw[data-k="wxw"]')`], ['  อุณหภูมิ', `Q('#wxseg [data-v="t"]')`], ['  เปิดเส้นลม', `Q('.sw[data-k="wxw"]')`], ['  ปิดสภาพอากาศแบบจำลอง', `Q('.sw[data-k="wx"]')`], ['  ฝุ่น PM2.5', `Q('.sw[data-k="pm"]')`], ['  วันพรุ่งนี้ (CAMS)', `Q('#cm-dc .chip:nth-child(3)')`], ['  เล่น (CAMS)', `C('cm-pl')`], ['  หยุด (CAMS)', `C('cm-pl')`], ['  ตอนนี้ (CAMS)', `C('cm-0')`], ['  ปิดแบบจำลอง CAMS', `Q('.sw[data-k="pmc"]')`], ['  ปิดสถานี', `Q('.sw[data-k="pmst"]')`], ['  เปิดสถานี', `Q('.sw[data-k="pmst"]')`], ['  เปิดแบบจำลอง CAMS', `Q('.sw[data-k="pmc"]')`], ['  ปิดฝุ่น PM2.5', `Q('.sw[data-k="pm"]')`], ['  อัตราการระบายอากาศ', `Q('.sw[data-k="vr"]')`], ['  วันถัดไป (GFS)', `Q('#vr-dc [data-i="3"]')`], ['  สูงสุดของวัน', `Q('#vr-gm [data-v="max"]')`], ['  เลื่อนแถบรายชั่วโมง', `(()=>{const r=document.getElementById('vr-gr');if(!r)return 'ไม่พบแถบ';r.value=+r.value+5;r.dispatchEvent(new Event('input'));return ''})()`], ['  ชั่วโมงถัดไป', `C('vr-gn')`], ['  ชั่วโมงก่อนหน้า', `C('vr-gp')`], ['  เฉลี่ยทั้งวัน', `Q('#vr-gm [data-v="mean"]')`], ['  วันนี้', `C('vr-g0')`], ['  ปิดระบายอากาศ', `Q('.sw[data-k="vr"]')`], ['  พื้นที่เสี่ยงไฟป่า (F2)', `Q('.sw[data-k="rk"]')`], ['  รอตารางพื้นที่เสี่ยง', `(async()=>{for(let k=0;k<40&&!document.querySelector('#rk-tb table')&&!/ไม่ได้|ไม่มีข้อมูล/.test(document.getElementById('rk-n').textContent);k++)await new Promise(r=>setTimeout(r,250));return document.querySelector('#rk-tb tr[data-i]')&&map.getLayer('rk-f')?'':'ตาราง/ชั้นพื้นที่เสี่ยงไม่ขึ้น (ไม่มี risk.json?): '+document.getElementById('rk-n').textContent.slice(0,80)})()`], ['  แปลงสถานีฯ', `Q('#rk-u [data-v="st"]')`], ['  พรุ่งนี้', `Q('#rk-dc [data-i="1"]')`], ['  แตะแถวแรก', `Q('#rk-tb tr[data-i="0"]')`], ['  ตำบล', `Q('#rk-u [data-v="tm"]')`], ['  ปิดพื้นที่เสี่ยง', `Q('.sw[data-k="rk"]')`], ['  ดัชนีอันตรายไฟป่า FWI', `Q('.sw[data-k="fwi"]')`], ['  วันพยากรณ์ (FWI)', `Q('#fwi-dc .chip.fc')`], ['  ดัชนี DC', `Q('#fwi-v [data-v="DC"]')`], ['  ลม (FWI)', `Q('#fwi-w [data-v="Wsp_noon"]')`], ['  เลือกวันจากตาราง', `Q('#fwi-pt [data-i="0"]')`], ['  ดัชนี FWI', `Q('#fwi-v [data-v="FWI"]')`], ['  ปิดดัชนี FWI', `Q('.sw[data-k="fwi"]')`], ['  สถานีตรวจอากาศ กรมอุตุฯ', `Q('.sw[data-k="tmd"]')`], ['  ความชื้น (กรมอุตุฯ)', `Q('#tmseg [data-v="rh"]')`], ['  ลม (กรมอุตุฯ)', `Q('#tmseg [data-v="ws"]')`], ['  ฝน 7 วัน (กรมอุตุฯ)', `Q('#tmseg [data-v="r7"]')`], ['  แตะสถานีในตาราง', `Q('#tm-ar [data-tm]')`], ['  อุณหภูมิ (กรมอุตุฯ)', `Q('#tmseg [data-v="t"]')`], ['  ปิดสถานีกรมอุตุฯ', `Q('.sw[data-k="tmd"]')`],
  ['  กองจุดความร้อนรายวัน', `Q('.sw[data-k="hcl"]')`], ['  กองรวม + จุดเริ่มต้นไฟ', `Q('.sw[data-k="hgp"]')`], ['  ปีงบ 2563 (รอ "กำลังคำนวณ…" หาย — Worker B2)', HC2563], ['  fallback บน main thread ให้ค่าเท่ากัน', HCSYNC], ['  ปิดกองรวม', `Q('.sw[data-k="hgp"]')`], ['  ปิดกองรายวัน', `Q('.sw[data-k="hcl"]')`],
  ['  พื้นที่เผาไหม้', `Q('.sw[data-k="burn"]')`], ['  รอตัวเลขพื้นที่เผาไหม้ (Worker B2)', BNWAIT], ['  ไทล์/จุดความร้อนใกล้รอยเผา Worker = main thread', BNTILE], ['  ปิดพื้นที่เผาไหม้', `Q('.sw[data-k="burn"]')`], ['  พื้นที่เผาซ้ำซาก', `Q('.sw[data-k="rep"]')`], ['  ไทล์เผาซ้ำซาก Worker = main thread', RPTILE], ['  ปิดพื้นที่เผาซ้ำซาก', `Q('.sw[data-k="rep"]')`], ['  ปิดแผง', `C('xr',1)`],
  ['ข้อมูลพื้นฐาน', `C('bKnow')`], ['  ปิด', `C('kb-x',1)`],
  ['เครื่องมือวัด', `C('bMs')`], ['  ปิด', `C('bMs')`],
  ['ชั้นข้อมูลของฉัน', `C('bUl')`], ['  นำเข้า KML ชื่อ/คำอธิบายเป็น HTML (E2)', XSS], ['  หลังบ้าน: บันทึกการใช้งาน + ออกจากระบบทุกอุปกรณ์ + 8 MB (E3, API จำลอง)', E3UI], ['  ปิด', `C('bUl')`],
  ['วิเคราะห์ภูมิประเทศ', `C('bTr')`], ['  เขาใหญ่ เส้นชั้นความสูง 20 ม. (รอ "กำลังคำนวณ…" หาย — Worker B2)', TRKY], ['  ความลาดชัน (Worker B2)', TRSLOPE], ['  ปิด', `C('bTr')`],
  ['พิมพ์แผนที่', `C('bPm')`], ['  ปิด', `C('pm-x',1)`],
  ['ดาวเทียมรอบถัดไป: ย่อ', `Q('#orb .obh')`], ['  ขยาย', `Q('#orb .obh')`], ['  แถว NOAA-21', `Q('#orb .obr[data-ob="NOAA21"]')`], ['  แผนที่โลกย่อ', `Q('#orb .obwm')`], ['  สวิตช์บนแผนที่ สลับ', `(()=>{const v=()=>map.getLayer('ob-tf')&&map.getLayoutProperty('ob-tf','visibility');const a=v(),r=__ck.Q('#orb .obh .hsp');return r||(v()!==a?'':'error: กดสวิตช์บนแผนที่แล้วชั้นวงโคจรไม่เปลี่ยน')})()`], ['  สวิตช์บนแผนที่ คืนค่า', `Q('#orb .obh .hsp')`], ['  ปิดชั้น', `Q('.sw[data-k="orb"]')`], ['  เปิดกลับ', `Q('.sw[data-k="orb"]')`],
  ['ค้นหาสถานที่/พิกัด', `C('bSr')`], ...GZ4, ['  Enter = ซูมไปผลแรก + ป๊อปอัป', `(async()=>{document.getElementById('gz-q').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(r=>setTimeout(r,400));return GZ.pop&&GZ.mk?'':'error: Enter แล้วไม่มีป๊อปอัป/หมุด'})()`], ['  ปิดการค้นหา', `C('gz-x')`],
  ['คัดลอกลิงก์มุมมองนี้ (D3)', `(async()=>{const u0=location.href;document.getElementById('vw-cp').click();await new Promise(r=>setTimeout(r,300));return /[?]v=-?[0-9]+[.][0-9]{5},-?[0-9]+[.][0-9]{5},[0-9]+[.][0-9]{2}/.test(vwCopy.last||'')&&/[?&]v=/.test(location.search)?'':'error: ลิงก์มุมมองผิดรูปแบบ '+vwCopy.last})()`],
  ['ฟอร์มผลตรวจสอบจากหน้างาน (F1)', `(()=>{vfForm({lat:14.26532,lon:101.98765,t:Date.now()-36e5,sat:'NOAA-20',tam:'บุพราหมณ์',amp:'นาดี',prov:'ปราจีนบุรี'},null);return document.getElementById('vf-f')?'':'ไม่พบฟอร์ม #vf-f'})()`], ['  เลือกผล "ไม่พบไฟ"', `Q('#vf-res [data-v="none"]')`], ['  ปิด', `C('md-x',1)`],
  ['แผงรายละเอียดจุด: โมเดลไฟ ที่มาของค่า/FFMC/ค่าทดสอบ (F5)', FQCK], ['  ปิดแผงรายละเอียด', `C('d-x',1)`],
  ['กลับมุมมองกลุ่มป่า', `C('bHome')`],
];
const MOB = [['ปุ่มเครื่องมือ (มือถือ)', `C('bTo')`], ['  ปิด', `C('bTo')`], ['ดาวเทียมรอบถัดไป: ขยาย/ย่อ', `Q('#orb .obh')`], ['  ย่อ/ขยาย', `Q('#orb .obh')`], ['แผงชั้นข้อมูล', `C('bLay')`], ['  กองจุดความร้อนรายวัน', `Q('.sw[data-k="hcl"]')`], ['  ปีงบ 2563 (รอ "กำลังคำนวณ…" หาย — Worker B2)', HC2563], ['  ปิดกองรายวัน', `Q('.sw[data-k="hcl"]')`], ['  ปิดแผง', `C('xr',1)`], ['การ์ดสถิติ', `C('bStat')`], ['  ปิด', `C('h-x',1)`], ['ย้อนดูการลามของไฟ', `C('bPlay')`], ['  เล่น', `C('pb-p')`], ['  ปิด', `C('pb-x',1)`],
  ['หลังบ้านชั้นข้อมูล (มือถือ, E3 API จำลอง)', E3UI],
  ['แผงรายละเอียดจุด: โมเดลไฟ (มือถือ, F5)', FQCK], ['  ปิดแผงรายละเอียด', `C('d-x',1)`],
  ['ค้นหา (มือถือ)', `C('bSr')`], GZ4[0], ['  แผ่นผลค้นหาไม่บังคอลัมน์ปุ่ม', `(()=>{const s=document.getElementById('gz-s').getBoundingClientRect(),c=document.getElementById('ctl').getBoundingClientRect(),q=document.querySelector('#gz .gzh').getBoundingClientRect();if(document.getElementById('gz-s').hidden||s.height<40)return 'error: ไม่มีแผ่นผลค้นหา';if(Math.round(s.bottom)<innerHeight-2)return 'error: แผ่นผลไม่ชิดขอบล่าง';if(getComputedStyle(document.getElementById('ctl')).display!=='none'&&(s.top<c.bottom-1||q.right>c.left+1))return 'error: บังคอลัมน์ปุ่ม (แผ่นบน '+Math.round(s.top)+' ปุ่มล่าง '+Math.round(c.bottom)+')';return ''})()`], GZ4[2], ['  แตะผลแรก', `(async()=>{const b=document.querySelector('#gz-r button[data-i="0"]');if(!b)return 'error: ไม่มีผล';b.click();await new Promise(r=>setTimeout(r,400));return GZ.pop&&document.getElementById('gz-s').hidden?'':'error: แตะผลแล้วไม่มีป๊อปอัป/แผ่นไม่ปิด'})()`], ['  ปิดการค้นหา', `C('gz-x')`]];
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
    // to = เพดานเวลารอคำตอบ CDP (ค่าปกติ 30 วิ) · ขั้นที่รอผลในหน้าเอง (B2: กองจุด/ภูมิประเทศเขาใหญ่/เผาไหม้ รอได้ถึง 150 วิ) ใช้ STEP_TO
    const send = (method, params = {}, to = 30e3) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => pend.has(i) && (pend.delete(i), rej(new Error('CDP timeout ' + method))), to) });
    const ev = async (e, to) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, to); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return r.result.value };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const info = {};
    // รอแผนที่โหลดสไตล์ (สูงสุด 45 วิ)
    const waitMap = async () => { let ok = false; for (let i = 0; i < 90 && !ok; i++) { await sleep(500); try { ok = await ev(`typeof map!=='undefined'&&!!map&&map.isStyleLoaded&&map.isStyleLoaded()`) } catch (e) { } } return ok };
    for (const [nm, w, h, steps] of [['เดสก์ท็อป', 1440, 900, DESK], ['มือถือ', 390, 844, MOB]]) {
      const mob = w < 768; stage = `${nm}: โหลดหน้า`;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
      await send('Emulation.setTouchEmulationEnabled', mob ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await send('Page.navigate', { url });
      // รอแผนที่โหลดสไตล์ แล้วรอข้อมูลอีก 4 วิ
      const ok = await waitMap();
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
        const r = await ev(`(()=>{const{C,Q,K}=window.__ck;return ${js}})()`, STEP_TO).catch(e => 'error: ' + e.message);
        if (r && r !== 'ข้าม') (r.startsWith('error') ? errs : warn).push(`[${stage}] ${r}`);
        await sleep(r ? 150 : 1300);
      }
      await sleep(1500);
      if (!mob) { const x = await ev('window.__ckXss||null').catch(() => null); if (x) info.xss = x }
      const wj = await ev('window.__ckWJ||null').catch(() => null); if (wj) (info.wj = info.wj || {})[nm] = wj;
      // E2 CSP แบบรายงานอย่างเดียว: ต้องมี __CSPV (ตัวฟัง) และ header ทำงาน — ลองโหลดภาพจากโดเมนที่ไม่อยู่ในนโยบาย ต้องได้ violation แบบ report (ไม่ถูกบล็อก)
      stage = `${nm}: CSP แบบรายงานอย่างเดียว (E2)`;
      const cv = await ev(`(async()=>{if(!Array.isArray(window.__CSPV))return {e:'ไม่มี window.__CSPV (ตัวฟัง securitypolicyviolation)'};const n0=__CSPV.length;new Image().src='https://csp-probe.invalid/x.png?'+Date.now();await new Promise(r=>setTimeout(r,800));
        const p=__CSPV.slice(n0).find(v=>/csp-probe/.test(v.u));const L=__CSPV.filter(v=>!/csp-probe/.test(v.u)).map(v=>v.d+' '+v.u.replace(/^(https?:[/][/][^/]+).*$/,'$1'));
        return {probe:p?p.m:null,n:L.length,u:[...new Set(L)].slice(0,15)}})()`).catch(e => ({ e: e.message }));
      if (cv.e) errs.push(`[${stage}] ${cv.e}`);
      else { if (cv.probe !== 'report') errs.push(`[${stage}] header Content-Security-Policy-Report-Only ไม่ทำงาน (โดเมนนอกนโยบายไม่ขึ้น violation แบบ report: ${cv.probe})`);
        if (cv.n) warn.push(`[${stage}] ถ้าบังคับใช้จะบล็อก ${cv.n} ครั้ง: ${cv.u.join(' · ')}`);
        (info.csp = info.csp || {})[nm] = { probe: cv.probe, n: cv.n, u: cv.u } }
    }

    // ---------- D3 ลิงก์มุมมอง ?v=&l= เปิดคืน (ตำแหน่ง/ซูม/ทิศ/ชั้น/แผนที่ฐาน) · URL ไม่ถูกเขียนเอง · ?bb มาก่อน v ----------
    {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setTouchEmulationEnabled', { enabled: false });
      const VQ = '?v=14.20000,101.60000,11.50,15,0&l=base:flat,-cons,amp,fwi:DC';
      stage = 'ลิงก์มุมมอง ?v= (D3)'; await send('Page.navigate', { url: url + VQ });
      if (!await waitMap()) warn.push(`[${stage}] แผนที่โหลดสไตล์ไม่เสร็จใน 45 วิ`);
      await sleep(3000);
      const r = await ev(`(()=>{const c=map.getCenter(),e=[];if(Math.abs(c.lat-14.2)>1e-4||Math.abs(c.lng-101.6)>1e-4||Math.abs(map.getZoom()-11.5)>.01||Math.round(map.getBearing())!==15)e.push('กล้อง '+c.lat.toFixed(4)+','+c.lng.toFixed(4)+' z'+map.getZoom().toFixed(2)+' b'+map.getBearing().toFixed(0));
        if(S.base!=='flat'||S.cons||!S.amp||!S.fwi||S.fwv!=='DC')e.push('ชั้น '+JSON.stringify({base:S.base,cons:S.cons,amp:S.amp,fwi:S.fwi,fwv:S.fwv}));if(map.getLayer('cons-f')&&map.getLayoutProperty('cons-f','visibility')!=='none')e.push('ชั้นพื้นที่อนุรักษ์ยังแสดง');
        if(location.search!==${JSON.stringify(VQ)})e.push('URL ถูกเขียนเองเป็น '+location.search);if(vwEnc()!=='base:flat,-cons,amp,fwi:DC')e.push('เข้ารหัสกลับได้ '+vwEnc());return e.length?'error: '+e.join(' ; '):''})()`).catch(e => 'error: ' + e.message);
      if (r) (r.startsWith('error') ? errs : warn).push(`[${stage}] ${r}`); else info.viewlink = { url: VQ, ok: true };
      stage = 'ลิงก์ตรง ?bb มาก่อน ?v (D3)'; await send('Page.navigate', { url: url + '?bb=101.0,14.0,101.2,14.2&v=14.9,102.6,12&l=-cons,amp' });
      if (!await waitMap()) warn.push(`[${stage}] แผนที่โหลดสไตล์ไม่เสร็จใน 45 วิ`);
      await sleep(2500);
      const r2 = await ev(`(()=>{const c=map.getCenter();return S.cons&&!S.amp&&Math.abs(c.lat-14.9)+Math.abs(c.lng-102.6)>.05?'':'error: มี ?bb แต่ยังใช้ v/l ('+c.lat.toFixed(3)+','+c.lng.toFixed(3)+' cons '+S.cons+' amp '+S.amp+')'})()`).catch(e => 'error: ' + e.message);
      if (r2) (r2.startsWith('error') ? errs : warn).push(`[${stage}] ${r2}`);
    }

    // ---------- F7 บันทึกเส้นทาง (18 พ.ย. 69): ตำแหน่งจำลอง (CDP Emulation.setGeolocationOverride) เดิน 6 จุด มีจุดกระโดด 1 จุด → หยุด ----------
    //  ต้องได้: ชั้นของฉัน 1 เส้น 5 จุด (ช่อง เวลาเริ่ม/สิ้นสุด/ระยะ/ขึ้น-ลง/จำนวนจุด) · GPX 5 <trkpt> มี <time> ทุกจุด (+<ele> ทุกจุด — โหลด DEM จาก AWS ไม่ได้ = เตือน)
    //  · เลือกแนบในฟอร์มรายงาน F1 ได้ (ย่อ ≤500 จุด) · รีโหลดกลางทาง = กล่องถาม บันทึกต่อ/จบและเก็บ/ทิ้ง → บันทึกต่อได้จุดเดิมครบ · ทิ้ง = ลบจาก IndexedDB fm-tk
    //  · มือถือ 390: แถบ #tk ไม่ทับคอลัมน์ปุ่ม #ctl / ป้ายดาวเทียม #orb / แผ่นล่าง #left → info.track ใน check.json
    {
      const W = `const w=ms=>new Promise(r=>setTimeout(r,ms));`, S9 = 9 / 111195.08, LA = 14.4302, LO = 101.3712, tr = info.track = {};
      const geo = (k, lo = LO) => send('Emulation.setGeolocationOverride', { latitude: LA + k * S9, longitude: lo, accuracy: 8 });
      const step = async (nm, js, to = 60e3) => { stage = 'บันทึกเส้นทาง (F7): ' + nm; const r = await ev(`(async()=>{${W}${js}})()`, to).catch(e => 'error: ' + e.message); if (typeof r === 'string' && r) (r.startsWith('error') ? errs : warn).push(`[${stage}] ${r}`); return r };
      stage = 'บันทึกเส้นทาง (F7): อนุญาตตำแหน่ง';
      try { await send('Browser.grantPermissions', { origin: new URL(url).origin, permissions: ['geolocation'] }) } catch (e) { warn.push(`[${stage}] Browser.grantPermissions: ${e.message}`) }
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await geo(0); stage = 'บันทึกเส้นทาง (F7): โหลดหน้า'; await send('Page.navigate', { url });
      if (!await waitMap()) warn.push(`[${stage}] แผนที่โหลดสไตล์ไม่เสร็จใน 45 วิ`); await sleep(2500);
      const okLoc = `document.getElementById('bLoc').click();for(let i=0;i<60&&!LOC.p;i++)await w(250);if(!LOC.p)return 'error: ตำแหน่งจำลองไม่มาถึง watchPosition';const t=document.getElementById('tk');if(!t||t.hidden||!document.getElementById('tk-b'))return 'error: เปิดตำแหน่งแล้วไม่มีปุ่มบันทึกเส้นทาง #tk-b';`;
      if (!await step('เปิดตำแหน่งของฉัน', okLoc + `return ''`)) {
        // Chrome ใส่เวลาของตำแหน่งจำลอง = ตอนตั้งค่า (หน้าโหลดช้า = เก่ากว่า 15 วิ จุดแรกไม่ถูกใช้) → ขยับ ~0.5 ม. ก่อนกดเริ่มทุกรอบ
        await geo(0.05); await sleep(600);
        await step('เริ่มบันทึก (กล่องก่อนเริ่มครั้งแรก)', `document.getElementById('tk-b').click();await w(300);const g=document.getElementById('tk-go');if(!g)return 'error: ไม่มีกล่องก่อนเริ่มครั้งแรก #tk-go';
          if(!/จอดับ/.test(document.getElementById('md-b').textContent)||!/ติดตั้งเป็นแอป/.test(document.getElementById('md-b').textContent))return 'error: กล่องไม่บอกข้อจำกัดจอดับ/ติดตั้งเป็นแอป';g.click();await w(400);
          return TK.on&&TK.P.length===1?'':'error: เริ่มแล้ว on='+TK.on+' จุด='+TK.P.length`);
        // เดิน 5 ก้าว ห่าง 9 ม. ทุก 3 วิ (~11 กม./ชม.) · ก้าวที่ 3 กระโดดไป ~1 กม. (ต้องถูกทิ้ง) แล้วเดินต่อจากจุดเดิม
        for (const [k, lo] of [[1], [2], [2, LO + 0.01], [3], [4]]) { await sleep(3000); stage = 'บันทึกเส้นทาง (F7): เดิน'; await geo(k, lo) }
        await sleep(1500);
        const n = await ev(`({n:TK.P.length,spd:TK.sk.spd,sw:!!(navigator.serviceWorker&&navigator.serviceWorker.controller)})`).catch(() => ({}));
        Object.assign(tr, { n: n.n, spd: n.spd, sw: n.sw }); // sw = หน้าอยู่ใต้ service worker (_site) — IndexedDB/ตำแหน่งต้องทำงานเหมือนเดิม if (n.n !== 5 || !(n.spd >= 1)) errs.push(`[บันทึกเส้นทาง (F7): กรองจุด] ต้องได้ 5 จุด และทิ้งจุดกระโดด ≥1 — ได้ ${n.n} จุด ทิ้งเพราะความเร็ว ${n.spd}`);
        await step('หยุด (แตะ ■ สองครั้ง)', `document.getElementById('tk-s').click();await w(200);if(!/แตะอีกครั้ง/.test(document.getElementById('tk-s').textContent))return 'error: แตะ ■ ครั้งแรกไม่ขึ้นยืนยัน';document.getElementById('tk-s').click();
          for(let i=0;i<240&&(TK.on||document.getElementById('md-t').textContent!=='บันทึกเส้นทางแล้ว');i++)await w(250);return TK.on?'error: หยุดแล้วยังบันทึกอยู่ (รอ 60 วิ)':''`, 90e3);
        const g = await ev(`(()=>{const L=UL.L.filter(l=>l.src==='gps'),f=L[0]&&L[0].fc.features[0];if(!f)return {e:'ไม่มีชั้น gps'};tkGpx(f,f.properties.name);const t=tkGpx.last,b=GIO.readGPX(t).features[0].properties,p=f.properties;closeModal();
          return {layers:L.length,feats:L[0].fc.features.length,type:f.geometry.type,n:f.geometry.coordinates.length,trkpt:(t.match(/<trkpt /g)||[]).length,time:(t.match(/<time>/g)||[]).length,ele:(t.match(/<ele>/g)||[]).length,rt:(b._t||[]).length,
           f:['เวลาเริ่ม','เวลาสิ้นสุด','ระยะ_กม','ขึ้นสะสม_ม','ลงสะสม_ม','จำนวนจุด'].filter(k=>p[k]==null),km:p['ระยะ_กม'],up:p['ขึ้นสะสม_ม'],dn:p['ลงสะสม_ม'],np:p['จำนวนจุด']}})()`).catch(e => ({ e: e.message }));
        stage = 'บันทึกเส้นทาง (F7): ชั้นของฉัน + GPX'; tr.gpx = g;
        if (g.e) errs.push(`[${stage}] ${g.e}`);
        else {
          if (g.layers !== 1 || g.feats !== 1 || g.type !== 'LineString' || g.n !== 5 || g.np !== 5) errs.push(`[${stage}] ต้องได้ 1 เส้น 5 จุด — ได้ ${g.layers} ชั้น ${g.feats} วัตถุ ${g.type} ${g.n} จุด`);
          if (g.trkpt !== 5 || g.time !== 5) errs.push(`[${stage}] GPX ต้องมี 5 <trkpt> และ <time> ทุกจุด — ได้ ${g.trkpt}/${g.time}`);
          if (g.rt !== 5) errs.push(`[${stage}] อ่าน GPX กลับได้เวลา ${g.rt} จุด`);
          if (g.ele !== 5 || g.f.length) warn.push(`[${stage}] <ele> ${g.ele}/5 · ช่องว่าง ${g.f.join(',') || '-'} (โหลดแบบจำลองความสูงจาก AWS ไม่ได้?)`);
        }
        await step('แนบกับรายงาน F1 (เลือกเส้นทางในฟอร์ม)', `vfForm({lat:14.26532,lon:101.98765,t:Date.now()-36e5,sat:'NOAA-20',tam:'บุพราหมณ์',amp:'นาดี',prov:'ปราจีนบุรี'},null);const s=document.getElementById('vf-trk');if(!s)return 'error: ฟอร์มรายงานไม่มีช่องแนบเส้นทาง #vf-trk';
          if(s.options.length<2)return 'error: ไม่มีเส้นทางให้เลือก';s.value='0';const v=tkVfVal();closeModal();if(!v||v.c.length!==10||v.n!==5||!v.t0||!(v.t1>=v.t0))return 'error: ข้อมูลแนบผิด '+JSON.stringify(v);
          const D=tkDP(Array.from({length:3000},(_,i)=>[101+i*1e-5,14+Math.sin(i/30)*1e-4]),500);return D.length<=500?'':'error: ย่อแล้วเกิน 500 จุด'`);
        // รีโหลดกลางทาง → กล่องถาม → บันทึกต่อ
        await geo(4.05); await sleep(600);
        await step('เริ่มรอบที่ 2', `tkStart();await w(400);return TK.on?'':'error: เริ่มรอบที่ 2 ไม่ได้'`);
        for (const k of [5, 6]) { await sleep(3000); stage = 'บันทึกเส้นทาง (F7): เดินรอบที่ 2'; await geo(k) }
        await sleep(1500);
        const n0 = await ev(`(async()=>({n:TK.P.length,db:(await TKDB.pts(TK.k)).length}))()`, 30e3).catch(e => ({ e: e.message }));
        tr.reload = { n: n0.n, db: n0.db }; if (!(n0.n >= 2) || n0.db !== n0.n) errs.push(`[บันทึกเส้นทาง (F7): IndexedDB] ทุกจุดต้องอยู่ใน fm-tk — จุด ${n0.n} ใน DB ${n0.db}`);
        stage = 'บันทึกเส้นทาง (F7): รีโหลดกลางทาง'; await send('Page.reload', { ignoreCache: false }); if (!await waitMap()) warn.push(`[${stage}] แผนที่โหลดสไตล์ไม่เสร็จใน 45 วิ`);
        await step('รีโหลดกลางทาง → กล่องถาม → บันทึกต่อ', `for(let i=0;i<40&&!document.getElementById('tk-r1');i++)await w(250);if(!document.getElementById('tk-r1')||!document.getElementById('tk-r2')||!document.getElementById('tk-r3'))return 'error: รีโหลดแล้วไม่มีกล่องถาม บันทึกต่อ/จบและเก็บ/ทิ้ง';
          if(!/ยังบันทึกไม่จบ/.test(document.getElementById('md-t').textContent))return 'error: หัวกล่องผิด';document.getElementById('tk-r1').click();for(let i=0;i<40&&!LOC.p;i++)await w(250);await w(500);
          return TK.on&&!TK.ps&&TK.P.length===${n0.n | 0}&&LOC.w!=null?'':'error: บันทึกต่อแล้ว on='+TK.on+' ps='+TK.ps+' จุด='+TK.P.length+' (ควร ${n0.n | 0})'`);
        await step('บันทึกต่อแล้วหยุด = ชั้นที่ 2', `TK.cf=1;tkStopAsk();for(let i=0;i<240&&TK.on;i++)await w(250);closeModal();const L=UL.L.filter(l=>l.src==='gps');return L.length===2?'':'error: ชั้น gps '+L.length+' (ควร 2)'`, 90e3);
        // ทิ้ง = ลบจาก fm-tk (แตะสองครั้ง)
        await geo(6.05); await sleep(600);
        await step('เริ่มรอบที่ 3', `tkStart();await w(600);return TK.on&&TK.P.length>=1?'':'error: รอบที่ 3 ไม่มีจุดแรก (จุด '+TK.P.length+')'`);
        stage = 'บันทึกเส้นทาง (F7): รีโหลดรอบที่ 3'; await send('Page.reload', { ignoreCache: false }); await waitMap();
        await step('รีโหลด → ทิ้ง (แตะสองครั้ง)', `for(let i=0;i<40&&!document.getElementById('tk-r3');i++)await w(250);const b=document.getElementById('tk-r3');if(!b)return 'error: ไม่มีปุ่มทิ้ง';b.click();await w(150);if(document.getElementById('md').hidden)return 'error: แตะทิ้งครั้งแรกปิดกล่องทันที (ต้องยืนยัน)';
          b.click();await w(800);const A=await TKDB.all();return A.length?'error: ทิ้งแล้วยังเหลือใน fm-tk '+A.length:''`);
      }
      // มือถือ: แถบไม่ทับคอลัมน์ปุ่ม/ป้ายดาวเทียม/แผ่นล่าง (ก่อนและระหว่างบันทึก)
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      stage = 'บันทึกเส้นทาง (F7): มือถือ โหลดหน้า'; await send('Page.navigate', { url }); await waitMap(); await sleep(2500);
      const lay = `const R=s=>{const e=document.querySelector(s);if(!e||!e.getClientRects().length||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom}},X=(a,b)=>a&&b&&a.l<b.r-1&&b.l<a.r-1&&a.t<b.b-1&&b.t<a.b-1,
        k=R('#tk'),c=R('#ctl'),o=R('#orb'),s=R('#left');(window.__ckTk=window.__ckTk||[]).push({k,c,o,s});if(!k)return 'error: ไม่มีแถบ #tk';if(X(k,c))return 'error: แถบทับคอลัมน์ปุ่ม';if(s&&k.b>s.t+1)return 'error: แถบทับแผ่นล่าง';if(X(k,o))return o.b+8+(k.b-k.t)>((s&&s.t)||innerHeight)-8?'เตือน: ไม่มีที่ว่างใต้กล่องดาวเทียม (ขยายอยู่) แถบโหมดย่อทับส่วนล่างของกล่อง':'error: แถบทับป้ายดาวเทียมทั้งที่มีที่ว่าง';return ''`;
      const m0 = await step('มือถือ: เปิดตำแหน่ง', okLoc + lay);
      if (!m0 || !String(m0).startsWith('error')) {
        await step('มือถือ: ระหว่างบันทึก', `tkStart();await w(600);if(!TK.on)return 'error: เริ่มบันทึกไม่ได้';${lay}`);
        await step('มือถือ: หยุด (1 จุด = ไม่สร้างเส้น)', `TK.cf=1;tkStopAsk();for(let i=0;i<80&&TK.on;i++)await w(250);return TK.on?'error: ยังบันทึกอยู่':''`);
      }
      tr.mob = await ev('window.__ckTk||null').catch(() => null);
      await send('Emulation.clearGeolocationOverride').catch(() => { });
    }

    // ---------- F4 แดชบอร์ด ?dash (17 พ.ย. 69): จอ TV 1920×1080 + มือถือ 390 · ไม่มี error · KPI ตรง summary.json (และการ์ดหลัก) · ไม่ล้น ----------
    // KPI ที่คาด = ผลรวม areas ใน summary.json (ไม่รวมคีย์ "ดงใหญ่" เมื่อ S.xdy) คิดใน Node แยกจากโค้ดหน้าเว็บ · ไม่มี summary.json ในโฟลเดอร์ (ตรวจราก repo) = เทียบกับไฟล์ที่หน้าโหลดมาจากเว็บ
    {
      let SUM = null; try { SUM = JSON.parse(fs.readFileSync(path.join(DIR, 'summary.json'), 'utf8')) } catch (e) { }
      const exp = (J, x) => { const E = Object.entries(J.areas || {}).filter(([k]) => !(x && /ดงใหญ่/.test(k))), t = f => E.reduce((a, [, o]) => a + (o[f] || 0), 0), fy = t('fy'), prv = t('prv'); return { fy, prv, pfull: t('pfull'), pct: prv ? Math.round((fy - prv) / prv * 100) : null } };
      for (const [nm, w, h] of [['1920', 1920, 1080], ['390', 390, 844]]) {
        const mob = w < 768; stage = `แดชบอร์ด ?dash ${nm}`;
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
        await send('Emulation.setTouchEmulationEnabled', mob ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
        await send('Page.navigate', { url: url + '?dash' }); await waitMap(); await sleep(2000);
        const r = await ev(`(async()=>{for(let k=0;k<80&&!(typeof DS!=='undefined'&&DS.lt);k++)await new Promise(r=>setTimeout(r,250));
          const e=[],d=document.getElementById('ds');if(!d||d.hidden)return{e:'?dash แล้วไม่เปิดแผ่น #ds'};if(!DS.lt)return{e:'แดชบอร์ดไม่ได้โหลดข้อมูลใน 20 วิ'};
          const R=d.getBoundingClientRect();if(R.width<innerWidth-1||R.height<innerHeight-1)e.push('แผ่น #ds ไม่เต็มจอ');
          const kd=document.getElementById('ds-kp').dataset.k;let k=null;try{k=JSON.parse(kd)}catch(_){}
          const J=DS.J['summary.json'];if(J&&!k)e.push('ไม่มีค่า KPI (data-k)');
          if(J&&k){const c=dsKpi(J,!!S.xdy);if(c.fy!==k.fy||c.prv!==k.prv||c.pfull!==k.pfull)e.push('KPI ไม่ตรง dsKpi(summary)');
            const t=document.querySelector('#ds-kfy b').textContent.replace(/[^0-9]/g,'');if(t!==String(k.fy))e.push('ตัวเลขบนไทล์ '+t+' ≠ '+k.fy)}
          const ov=document.documentElement.scrollWidth-innerWidth,b=document.getElementById('ds-b'),hx=b.scrollWidth-b.clientWidth,vy=b.scrollHeight-b.clientHeight;
          if(ov>1||hx>1)e.push('ล้นแนวนอน '+Math.max(ov,hx)+' px');
          const empty=[...document.querySelectorAll('#ds-g>section')].filter(s=>!s.textContent.trim()).map(s=>s.id);if(empty.length)e.push('การ์ดว่าง '+empty.join(','));
          const T0=thDay(),F=fyOfDay(T0),T=T0-fy0(F),cf=typeof fyNow==='function'&&fyNow(F,T)?fyNow(F,T)[T]:null;
          const n24=HS.filter(h=>ageH(h)<24).length,d24=+document.querySelector('#ds-k24 b').textContent.replace(/[^0-9]/g,'');if(n24!==d24)e.push('ไทล์ 24 ชม. '+d24+' ≠ การ์ดหลัก '+n24);
          return{e:e.join(' ; '),k,x:!!S.xdy,web:Object.keys(DS.web),card:cf,vy,files:Object.keys(DS.J).length}})()`, 60e3).catch(e => ({ e: e.message }));
        if (r.e) errs.push(`[${stage}] ${r.e}`);
        if (r.k) {
          const ref = SUM && !r.web.includes('summary.json') ? SUM : null;
          if (ref) { const x = exp(ref, r.x); for (const f of ['fy', 'prv', 'pfull', 'pct']) if (x[f] !== r.k[f]) errs.push(`[${stage}] KPI ${f} ${r.k[f]} ≠ summary.json ${x[f]}`) }
          else warn.push(`[${stage}] ไม่มี summary.json ในโฟลเดอร์ที่ตรวจ — เทียบกับไฟล์ที่หน้าโหลดจากเว็บเท่านั้น (${r.web.join(', ') || '-'})`);
          if (ref && r.card != null && r.card !== r.k.fy) warn.push(`[${stage}] สะสมปีงบในการ์ดหลัก ${r.card} ≠ แดชบอร์ด ${r.k.fy} (live.json/API คนละรอบกับ summary.json?)`);
        }
        if (!mob && r.vy > 2) warn.push(`[${stage}] เนื้อหาเกินจอ 1080 (${r.vy} px) — จอ TV ต้องเลื่อน`);
        (info.dash = info.dash || {})[nm] = { k: r.k || null, xdy: r.x, card: r.card, web: r.web, files: r.files, vy: r.vy };
        if (!mob) { stage = 'แดชบอร์ด: ปิด/เปิดจากปุ่ม #bDash';
          const c = await ev(`(async()=>{document.getElementById('ds-x').click();if(!document.getElementById('ds').hidden)return 'error: กด × แล้วแดชบอร์ดไม่ปิด';const b=document.getElementById('bDash');if(!b)return 'error: ไม่มีปุ่ม #bDash ในแผงซ้าย';b.click();await new Promise(r=>setTimeout(r,800));if(document.getElementById('ds').hidden)return 'error: กด #bDash แล้วไม่เปิด';document.getElementById('ds-xd').click();await new Promise(r=>setTimeout(r,300));const k=JSON.parse(document.getElementById('ds-kp').dataset.k||'{}');document.getElementById('ds-xd').click();return k.x===!S.xdy?'':'error: ปุ่มดงใหญ่ในแดชบอร์ดไม่เปลี่ยน S.xdy'})()`).catch(e => 'error: ' + e.message);
          if (c) (c.startsWith('error') ? errs : warn).push(`[${stage}] ${c}`) }
      }
      await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }

    // ---------- ?debug=1 (A3) · fetchT เกินเวลา + ออฟไลน์แล้วกด ↻ (A2) ----------
    stage = 'debug: โหลดหน้า ?debug=1';
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Page.navigate', { url: url + '?debug=1' });
    if (!await waitMap()) warn.push(`[${stage}] แผนที่โหลดสไตล์ไม่เสร็จใน 45 วิ`);
    await sleep(2000);
    const chk = (r, ex) => { if (r) (r.startsWith('error') ? errs : warn).push(`[${stage}] ${r}`); if (ex) info.debug = Object.assign(info.debug || {}, ex) };
    stage = 'debug: __LOG/fetchT เกินเวลา';
    chk(await ev(`(async()=>{const r=[];
      if(!Array.isArray(window.__LOG)||typeof dbg!=='function'||typeof fetchT!=='function')return 'error: ไม่มี __LOG/dbg/fetchT';
      if(window.__OLD||document.getElementById('oldb'))r.push('error: เบราว์เซอร์ปกติแต่ขึ้นกล่องเบราว์เซอร์รุ่นเก่า');
      if(!document.querySelector('#attr #dg-cp'))r.push('error: ?debug=1 แล้วไม่มีปุ่ม #dg-cp ใน #attr');
      const t0=Date.now(),e=await fetchT('__hang',{},800).then(()=>null,e=>e),ms=Date.now()-t0;
      if(!e||e.name!=='TimeoutError')r.push('error: fetchT ไม่ตัดเมื่อเกินเวลา ('+(e&&e.name)+')');else if(ms>4000)r.push('error: fetchT ตัดช้า '+ms+' ms');
      if(!__LOG.some(x=>/__hang/.test(x.tag)&&x.name==='TimeoutError'))r.push('error: __LOG ไม่มีรายการเกินเวลาของ fetchT');
      return r.join(' ; ')})()`).catch(e => 'error: ' + e.message));
    stage = 'debug: ออฟไลน์แล้วกด ↻';
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const n0 = await ev('__LOG.length'), ts = Date.now();
    await ev(`(()=>{const t=document.getElementById('toast');if(t)t.classList.remove('show');document.getElementById('rf').click()})()`);
    let tt = '';
    for (let i = 0; i < 44 && !tt; i++) { await sleep(500); tt = await ev(`(()=>{const t=document.getElementById('toast');return t&&t.classList.contains('show')&&/ดึงข้อมูล|ต้นทาง/.test(t.textContent)?t.textContent:''})()`).catch(() => '') }
    const sec = Math.round((Date.now() - ts) / 100) / 10;
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const n1 = await ev('__LOG.length');
    chk(!tt ? 'error: ออฟไลน์แล้วกด ↻ ไม่มี toast ภายใน 22 วิ (ค้าง?)' : /ดึงข้อมูลใหม่แล้ว/.test(tt) ? 'error: ออฟไลน์แต่ toast บอกว่าดึงข้อมูลสำเร็จ' : n1 > n0 ? '' : 'error: ออฟไลน์แล้ว __LOG ไม่มีรายการเพิ่ม', { offline: { toast: tt, sec, log: n1 - n0 } });
    stage = 'debug: คัดลอกบันทึกข้อผิดพลาด';
    await sleep(1500);
    chk(await ev(`(async()=>{document.getElementById('dg-cp').click();await new Promise(r=>setTimeout(r,800));let j;try{j=JSON.parse(dgCopy.last||'')}catch(e){return 'error: กดปุ่มแล้วไม่ได้ JSON'}
      const x=document.getElementById('dg-tx');if(x)x.remove();return j.ua&&j.ver&&Array.isArray(j.log)&&j.log.length?'':'error: JSON ไม่มี ua/ver/log'})()`).catch(e => 'error: ' + e.message), { copy: await ev('dgCopy.how||""').catch(() => '') });

    // ---------- กล่องเบราว์เซอร์รุ่นเก่า (D8): ลบ DecompressionStream ก่อนสคริปต์ของหน้า ----------
    stage = 'เบราว์เซอร์รุ่นเก่า (จำลอง)';
    const e0 = errs.length, sc = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete window.DecompressionStream' });
    await send('Page.navigate', { url }); await sleep(3000);
    const ob = await ev(`(async()=>{for(let i=0;i<48&&!document.getElementById('oldb');i++)await new Promise(r=>setTimeout(r,250));const d=document.getElementById('oldb');if(!d)return 'error: ไม่ขึ้นกล่อง #oldb';const r=d.getBoundingClientRect();
      if(getComputedStyle(d).display==='none'||r.width<innerWidth*.9||r.height<innerHeight*.9)return 'error: กล่องไม่เต็มจอ';return /เบราว์เซอร์รุ่นเก่า/.test(d.innerText)&&window.__OLD===1?'':'error: ข้อความ/ธง __OLD ไม่ตรง'})()`).catch(e => 'error: ' + e.message);
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sc.identifier });
    // error ของแอปที่ยังทำงานต่อหลังกล่อง (เบราว์เซอร์จริงไม่ได้เก่า) ไม่นับ
    warn.push(...errs.splice(e0)); chk(ob);

    // ---------- PWA (D1): service worker ลงทะเบียน · manifest + ติดตั้งได้ (CDP) · ปิดเน็ต/เว็บล่มแล้วรีโหลดหน้ายังขึ้น ----------
    stage = 'PWA: ลงทะเบียน service worker';
    await send('Page.navigate', { url }); await waitMap(); await sleep(2000);
    const sw = await ev(`(async()=>{if(!('serviceWorker' in navigator))return{e:'ไม่มี serviceWorker'};const r=await Promise.race([navigator.serviceWorker.ready,new Promise(z=>setTimeout(()=>z(null),20000))]);
      if(!r)return{e:'service worker ไม่พร้อมใน 20 วิ'};const v=await new Promise(z=>{const c=new MessageChannel();navigator.serviceWorker.addEventListener('message',m=>z(m.data&&m.data.sw),{once:true});r.active.postMessage('version');setTimeout(()=>z('?'),3000)});
      return{scope:r.scope,state:r.active&&r.active.state,ctl:!!navigator.serviceWorker.controller,ver:v}})()`).catch(e => ({ e: e.message }));
    chk(sw.e ? 'error: ' + sw.e : sw.state !== 'activated' ? 'error: service worker ไม่ activated (' + sw.state + ')' : '', { pwa: { sw: sw.ver, scope: sw.scope && sw.scope.replace(/^https?:\/\/[^/]+/, '') } });
    // รีโหลดออนไลน์ 1 ครั้ง (หน้าอยู่ใต้ service worker แล้ว → เก็บแคชระหว่างใช้งาน)
    await send('Page.reload', { ignoreCache: false }); await waitMap(); await sleep(3000);
    stage = 'PWA: manifest/ติดตั้งได้';
    const man = await send('Page.getAppManifest').catch(e => ({ e: e.message }));
    const ins = await send('Page.getInstallabilityErrors').catch(e => ({ e: e.message }));
    const mErr = (man.errors || []).filter(x => x.critical).map(x => x.message), iErr = (ins.installabilityErrors || []).map(x => x.errorId + (x.errorArguments || []).map(a => ' ' + a.value).join(''));
    chk(man.e ? 'error: อ่าน manifest ไม่ได้ ' + man.e : !man.url ? 'error: ไม่พบ <link rel="manifest">' : mErr.length ? 'error: manifest ผิด ' + mErr.join(' ; ') : iErr.length ? 'error: ติดตั้งเป็นแอปไม่ได้ (' + iErr.join(', ') + ')' : '', { pwa: Object.assign(info.debug && info.debug.pwa || {}, { installable: !iErr.length && !mErr.length }) });
    // ปิดเน็ต: หน้าเว็บ offline + เซิร์ฟเวอร์ในเครื่องหยุดตอบ (service worker เป็นอีก target ที่ emulate ไม่ถึง จึงตัดต้นทางจริงด้วย)
    stage = 'PWA: ปิดเน็ตแล้วรีโหลด';
    const e1 = errs.length;
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    srv.close(); if (srv.closeAllConnections) srv.closeAllConnections();
    await send('Page.reload', { ignoreCache: false });
    let up = false; for (let i = 0; i < 50 && !up; i++) { await sleep(500); up = await ev(`typeof map!=='undefined'&&!!map&&!!map.getSource&&!!map.getSource('cons')`).catch(() => false) }
    await sleep(4000);
    const off = await ev(`({title:document.title,kp:/\\d/.test((document.getElementById('p-kp')||{}).innerText||''),hd:typeof HD!=='undefined'?HD.length:0,cons:!!(map.getSource&&map.getSource('cons')),bar:((document.getElementById('pwa-bar')||{}).innerText||'').replace(/\\s+/g,' '),barOn:!!document.getElementById('pwa-bar')&&!document.getElementById('pwa-bar').hidden,at:typeof getHotspots!=='undefined'&&getHotspots.at||0,live:typeof LIVE!=='undefined'?LIVE.length:-1})`).catch(e => ({ e: e.message }));
    // error ระหว่างออฟไลน์ (ไทล์/ฟอนต์ภายนอกโหลดไม่ได้) เป็นเรื่องปกติ → คำเตือน
    warn.push(...errs.splice(e1));
    chk(off.e ? 'error: ' + off.e : !up ? 'error: ปิดเน็ตแล้วรีโหลด หน้าเว็บไม่ขึ้น (ไม่มีแผนที่/แนวเขต)' : !(off.kp && off.hd && off.cons) ? 'error: ออฟไลน์แล้วการ์ด/ข้อมูลย้อนหลัง/แนวเขตไม่ครบ ' + JSON.stringify(off) : !off.barOn ? 'error: ออฟไลน์แต่ไม่ขึ้นแถบสถานะออฟไลน์' : '',
      { pwa: Object.assign(info.debug && info.debug.pwa || {}, { offline: { bar: off.bar, hd: off.hd, live: off.live, at: off.at ? new Date(off.at).toISOString() : null } }) });
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.navigate', { url: 'about:blank' });
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
  // รอบก่อนไม่ผ่านเพราะชุดทดสอบหน่วย = ตรวจใหม่ (แก้แค่ scripts/ แล้ว index.html อาจ sha เดิม)
  if (!UNIT_FAIL && prev && prev.sha === sha && typeof prev.ok === 'boolean' && prev.unit !== false) {
    Object.assign(res, prev, { at: res.at, reused: prev.reused || prev.at });
    console.log(`index.html เหมือนรอบที่ตรวจแล้ว (${prev.reused || prev.at}) → ใช้ผลเดิม: ${prev.ok ? 'ผ่าน' : 'ไม่ผ่าน'}`);
  } else {
    if (UNIT_FAIL) { res.unit = false; res.errs.push('ชุดทดสอบหน่วยไม่ผ่าน (node --test test/) — ดู log ขั้น unit tests') }
    res.errs.push(...syntax(file), ...syntax(path.join(DIR, 'manual', 'index.html')), ...orbLib(file), ...orbLib(file, 'risk', 'RISK'));
    // E2: ค่าที่เข้า innerHTML/insertAdjacentHTML/setHTML โดยไม่ผ่าน esc() จุดใหม่ (นอก scripts/lint_html_base.json) = คำเตือน ไม่ทำให้ไม่ผ่าน
    try { const A = LINT.lintDir(DIR), N = LINT.fresh(A); res.lint = { all: A.length, new: N.length };
      console.log(`lint_html: ${A.length} จุดไม่ผ่าน esc() · ตรวจแล้ว ${A.length - N.length} · ใหม่ ${N.length}`);
      res.warn.push(...N.slice(0, 10).map(r => `[lint_html] ${r.file}:${r.line} ${r.sink} {${r.expr}} ไม่ผ่าน esc() — ค่าภายนอกให้ใส่ esc() · ค่าจากโค้ดใช้ node scripts/lint_html.js --update-base`)) }
    catch (e) { res.warn.push('[lint_html] ตรวจไม่ได้: ' + e.message) }
    if (res.errs.length) console.log((UNIT_FAIL ? 'ชุดทดสอบหน่วยไม่ผ่าน' : 'syntax ผิด') + ' → ข้ามการเปิดในเบราว์เซอร์');
    else {
      const b = await browser(DIR);
      if (b.skip) { res.skip = b.skip; console.log('⚠', b.skip) }
      res.errs.push(...(b.errs || [])); res.warn.push(...(b.warn || [])); res.net = (b.net || []).length; res.info = b.info;
      if (b.net && b.net.length) console.log(`error เครือข่าย/ภายนอก ${b.net.length} รายการ (ไม่นับ):\n  ` + b.net.slice(0, 5).join('\n  '));
    }
    res.ok = res.errs.length ? false : res.skip ? null : true;
  }
  res.sec = Math.round((Date.now() - t0) / 1000);
  if (res.info && res.info.debug) console.log('?debug=1:', JSON.stringify(res.info.debug));
  if (res.info && (res.info.xss || res.info.csp)) console.log('E2 XSS/CSP:', JSON.stringify({ xss: res.info.xss || null, csp: res.info.csp || null }));
  if (res.info && res.info.wj) console.log('B2 Worker:', JSON.stringify(res.info.wj));
  if (res.info && res.info.dash) console.log('F4 ?dash:', JSON.stringify(res.info.dash));
  if (res.info && res.info.track) { const t = res.info.track; console.log('F7 บันทึกเส้นทาง:', JSON.stringify({ n: t.n, spd: t.spd, sw: t.sw, gpx: t.gpx && { n: t.gpx.n, trkpt: t.gpx.trkpt, time: t.gpx.time, ele: t.gpx.ele, km: t.gpx.km, up: t.gpx.up, dn: t.gpx.dn }, reload: t.reload, mob: t.mob })) }
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
      // B1: ฉบับบนเว็บอ้างไฟล์ข้อมูลฝัง data/emb/<id>.<sha8>.json ของรอบนั้น — ดึงมาด้วย (deploy ใหม่แทนทั้งเว็บ ไฟล์เก่าจะหาย)
      const ix = b.toString('utf8').match(/<script type="application\/json" id="emb">([\s\S]*?)<\/script>/);
      if (ix) for (const u of Object.values(JSON.parse(ix[1]))) { const t = path.join(DIR, u); if (fs.existsSync(t)) continue;
        const q = await fetch(SITE + u, { signal: AbortSignal.timeout(60e3) }); if (!q.ok) throw new Error('ข้อมูลฝัง ' + u + ' HTTP ' + q.status); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, Buffer.from(await q.arrayBuffer())) }
      fs.writeFileSync(file, b); res.fallback = crypto.createHash('sha1').update(b).digest('hex');
      console.log(`ใช้ index.html ฉบับบนเว็บแทน (${(b.length / 1024).toFixed(0)} KB) — live.json/ข้อมูลอื่นยังขึ้นตามปกติ`);
    } catch (e) { res.fallback = null; console.log('::warning::ดึง index.html ฉบับบนเว็บไม่ได้ (' + e.message + ') — ขึ้นฉบับใหม่ไปตามเดิม') }
  } else if (res.ok === null) console.log('::warning title=ตรวจหน้าเว็บในเบราว์เซอร์ไม่ได้::' + (res.skip || ''));
  res.errs = res.errs.slice(0, 20); res.warn = res.warn.slice(0, 20);
  fs.writeFileSync(path.join(DIR, 'check.json'), JSON.stringify(res));
  quit(0);
})().catch(e => { console.error(e); quit(CI ? 0 : 2) });
