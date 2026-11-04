// ถ่ายภาพหน้าจอประกอบคู่มือ (manual/img) ด้วย Chrome headless ผ่าน CDP — ไม่ต้องติดตั้งแพ็กเกจ (Node 22+ มี WebSocket)
// เปิดเซิร์ฟเวอร์ก่อน: node scripts/serve.js (พอร์ต 8000) แล้ว
// node scripts/manual_shots.mjs manual/img scripts/manual_shots.json   (แก้ CH ถ้า Chrome อยู่ที่อื่น)
// เขียน boxes.json (ตำแหน่งองค์ประกอบ) ลงโฟลเดอร์ผลด้วย — ลบทิ้งได้
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const OUT = process.argv[2];
const JOBS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'chp-'));
const port = 9333;
const ch = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const logs = [];
async function connect() {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch { } await sleep(200) }
  throw new Error('no chrome');
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value };
(async () => {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result) } else if (d.method === 'Runtime.exceptionThrown') logs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text) };
  await send('Page.enable'); await send('Runtime.enable');
  const res = {};
  for (const j of JOBS) {
    const mob = j.w < 768;
    await send('Emulation.setDeviceMetricsOverride', { width: j.w, height: j.h, deviceScaleFactor: j.dpr || 1, mobile: mob });
    await send('Emulation.setTouchEmulationEnabled', mob ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (j.url) { await send('Page.navigate', { url: j.url }); await sleep(j.wait || 9000) }
    if (j.js) { try { await ev("(async()=>{"+j.js+"})()") } catch (e) { console.log(j.name, 'js error', e.message) } await sleep(j.after || 3000) }
    let boxes = null;
    if (j.boxes) boxes = await ev(`(()=>{const o={};for(const [k,s] of Object.entries(${JSON.stringify(j.boxes)})){const e=document.querySelector(s);if(!e){o[k]=null;continue}const r=e.getBoundingClientRect();o[k]=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}return o})()`);
    if (j.clipSel) { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(j.clipSel)});const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`); const p = j.pad || 0; j.clip = { x: Math.max(0, r[0] - p), y: Math.max(0, r[1] - p), width: r[2] + 2 * p, height: r[3] + 2 * p } }
    const clip = j.clip ? { ...j.clip, scale: 1 } : undefined;
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: j.q || 72, ...(clip ? { clip } : {}) });
    fs.writeFileSync(path.join(OUT, j.name + '.jpg'), Buffer.from(s.data, 'base64'));
    res[j.name] = { w: j.w, h: j.h, clip: j.clip || null, boxes };
    console.log('ok', j.name);
  }
  fs.writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(res, null, 1));
  if (logs.length) console.log('page errors:', logs.slice(0, 5));
  ch.kill(); process.exit(0);
})().catch(e => { console.error(e); ch.kill(); process.exit(1) });
