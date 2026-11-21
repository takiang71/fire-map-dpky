// สร้างภาพสำหรับแชร์ลิงก์ (D2 ของ docs/review-2569-11-15.md — 16 พ.ย. 69) — รันมือครั้งเดียว/เมื่ออยากเปลี่ยนภาพ ไม่อยู่ใน workflow
//  - img/og.jpg 1200×630 = แผนที่กลุ่มป่าจาก mapSnap() ของหน้าเว็บ (มุมมองทั้งกลุ่มป่า) + แถบชื่อ — og:image/twitter:image
//  - img/apple-touch-icon.png 180×180 และ img/icon-32.png / icon-192.png / icon-512.png จาก img/icon.svg · img/icon-maskable-512.png จาก icon-maskable.svg (manifest)
//  - เพิ่ม ONLY_ICONS=1 = สร้างเฉพาะไอคอน ไม่ทำ og.jpg
// ใช้: node scripts/make_og.js   (ต้องมี Chrome · เปิดหน้าเว็บจากโฟลเดอร์ repo ผ่านเซิร์ฟเวอร์ชั่วคราวในสคริปต์ · ต่อเน็ตเพื่อโหลดไทล์)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process'), CHP = require('./lib/chprof');
const ROOT = path.join(__dirname, '..'), IMG = path.join(ROOT, 'img');
const CH = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TY = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
(async () => {
  if (!CH) throw new Error('ไม่พบ Chrome (ตั้งตัวแปร CHROME)');
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end() } r.writeHead(200, { 'Content-Type': TY[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r) });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  CHP.sweep('og-');
  const port = 9500 + Math.floor(Math.random() * 300), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
  const ch = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let wsu; for (let i = 0; i < 75 && !wsu; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) wsu = p.webSocketDebuggerUrl } catch (e) { } if (!wsu) await sleep(200) }
  const ws = new WebSocket(wsu); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d); pend.delete(d.id) } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value };
  await send('Page.enable'); await send('Runtime.enable');
  const base = `http://127.0.0.1:${srv.address().port}/`;
  // ไอคอน PNG จาก SVG
  // icon-maskable = พื้นแดงเต็มกรอบ เปลวไฟอยู่ใน safe zone 70% (Android ตัดเป็นวงกลม/สี่เหลี่ยมมนเอง) — ไอคอนแอปจาก manifest (D1)
  for (const [f, n, svg] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-32.png', 32], ['icon-512.png', 512], ['icon-maskable-512.png', 512, 'icon-maskable.svg']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: n, height: n, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: base + 'img/' + (svg || 'icon.svg') }); await sleep(800);
    await ev(`(()=>{const s=document.documentElement;s.setAttribute('width','${n}');s.setAttribute('height','${n}');s.style.display='block'})()`); await sleep(200);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: n, height: n, scale: 1 } });
    fs.writeFileSync(path.join(IMG, f), Buffer.from(data, 'base64')); console.log(f, n + '×' + n);
  }
  // แผนที่ทั้งกลุ่มป่า 1200×630 แล้ววาดแถบชื่อทับ
  if (process.env.ONLY_ICONS === '1') { ws.close(); srv.close(); await CHP.close(ch, prof); process.exit(0) }
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + 'index.html' });
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(`typeof map!=='undefined'&&!!map&&map.isStyleLoaded&&map.isStyleLoaded()`)) break }
  await sleep(5000);
  const url = await ev(`(async()=>{const u=await mapSnap([],null);const im=new Image();im.src=u;await im.decode();
    const c=document.createElement('canvas');c.width=1200;c.height=630;const x=c.getContext('2d');
    const k=Math.max(1200/im.width,630/im.height),w=im.width*k,h=im.height*k;x.drawImage(im,(1200-w)/2,(630-h)/2,w,h);
    const g=x.createLinearGradient(0,380,0,630);g.addColorStop(0,'rgba(15,23,42,0)');g.addColorStop(1,'rgba(15,23,42,.88)');x.fillStyle=g;x.fillRect(0,380,1200,250);
    await document.fonts.load('800 60px "Noto Sans Thai"');await document.fonts.load('600 30px "Noto Sans Thai"');
    x.font='800 72px "Noto Sans Thai",sans-serif';x.fillStyle='#FF5A36';x.fillText('Fire',56,500);const fw=x.measureText('Fire').width;x.fillStyle='#fff';x.fillText('Map',56+fw,500);
    x.font='800 40px "Noto Sans Thai",sans-serif';x.fillText('สถานการณ์ไฟป่า กลุ่มป่าดงพญาเย็น-เขาใหญ่',56,560);
    x.font='600 24px "Noto Sans Thai",sans-serif';x.fillStyle='#fde68a';x.fillText('จุดความร้อนดาวเทียม · ยอดสะสมปีงบ · พื้นที่เผาไหม้ · FWI · PM2.5 — สบอ.1 (ปราจีนบุรี)',56,602);
    const ic=new Image();ic.src='img/icon.svg';await ic.decode();x.drawImage(ic,1200-56-84,630-56-84,84,84);
    return c.toDataURL('image/jpeg',.86)})()`);
  fs.writeFileSync(path.join(IMG, 'og.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('og.jpg', (fs.statSync(path.join(IMG, 'og.jpg')).size / 1024).toFixed(0), 'KB');
  ws.close(); srv.close(); await CHP.close(ch, prof); process.exit(0);
})().catch(e => { console.error('ผิดพลาด:', e.message); process.exit(1) });
