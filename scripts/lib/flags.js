// SYS (20 พ.ย. 69) สวิตช์ฟังก์ชันจากหลังบ้าน (Worker fire-layers GET /flags — docs/layers-backend.md หัวข้อ SYS)
//  · build_site.js ดึงแล้วเขียน _site/flags.json (ดึงไม่ได้ = ใช้ฉบับบนเว็บรอบก่อน)
//  · line_notify.js / telegram_notify.js เรียก applyEnv() ก่อนอ่านตัวแปร → ตัวแปรใน NOFF ที่ผู้ดูแลปิด = "off" · lnd = LINE_MODE=daily (ประหยัดโควตา)
//  · ปิดได้อย่างเดียว: ตัวแปร Actions ที่ตั้ง off ไว้แล้วยังคง off · ไฟล์ไม่มี/เสีย = ไม่แตะอะไร (ทำงานตามตัวแปร Actions เดิม)
const fs = require('fs'), path = require('path');
const NOFF = ['LINE_DAILY', 'LINE_BURN', 'LINE_REP', 'LINE_MREP', 'TG_DAILY', 'TG_BURN', 'TG_REP', 'TG_MREP', 'TG_SUBS']; // ต้องตรงกับ worker/layers.mjs (test/sys.test.js ตรวจ)
const FILE = process.env.FLAGS_FILE || path.join(__dirname, '..', '..', '_site', 'flags.json');

function read(file = FILE) { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && j.flags || null } catch (e) { return null } }

// คืนรายชื่อตัวแปรที่ตั้งให้ (สำหรับ log)
function applyEnv(file = FILE, env = process.env) {
  const f = read(file), ch = [];
  if (!f) return ch;
  for (const k of NOFF) if ((f.off || []).includes(k) && env[k] !== 'off') { env[k] = 'off'; ch.push(k) }
  if (f.lnd && String(env.LINE_MODE || '').toLowerCase() !== 'daily') { env.LINE_MODE = 'daily'; ch.push('LINE_MODE') }
  return ch;
}

// build_site.js: Worker → ฉบับบนเว็บรอบก่อน → null
async function fetchFlags({ api, site, timeout = 15e3 }) {
  const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(timeout) }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); if (!j || !j.flags) throw new Error('ไม่มี flags'); return j.flags };
  try { return { flags: await get(api.replace(/\/$/, '') + '/flags'), src: 'worker', at: new Date().toISOString() } }
  catch (e) {
    try { const r = await fetch(site.replace(/\/?$/, '/') + 'flags.json?t=' + Date.now(), { signal: AbortSignal.timeout(timeout) }); const j = r.ok ? await r.json() : null; if (j && j.flags) return { ...j, src: 'pages', why: String(e.message || e).slice(0, 120) } } catch (e2) { }
    return null;
  }
}

module.exports = { NOFF, FILE, read, applyEnv, fetchFlags };
