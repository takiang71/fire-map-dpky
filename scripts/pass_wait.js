// รอข้อมูลรอบดาวเทียมที่เพิ่งผ่านกลุ่มป่า (ผู้ใช้สั่ง 13 พ.ย. 69 "ทำวิธีนี้ต่อเลย" — ให้แจ้งเตือนเร็วที่สุด)
// รันใน site.yml ก่อน build_site.js:
//   - ปกติ cron-job.org สั่งรอบ site ทุก 5 นาที → จุดที่ต้นทางเพิ่งเผยแพร่รอได้ถึง 5 นาทีกว่าจะถึงรอบถัดไป
//   - ช่วงที่ข้อมูลรอบดาวเทียมกำลังจะเข้า (WIN0–WIN1 นาทีหลังดาวเทียมผ่านกลุ่มป่า, คำนวณจาก data/tle.json ด้วย lib/orbit.js)
//     และข้อมูลรอบนั้นยังไม่เข้า → ถาม API ทุก POLL วินาที (เฉพาะช่วงเวลาของรอบนั้น คำตอบเล็ก) ไม่เกิน WAIT นาทีต่อรอบ site
//     ทันทีที่เห็นจุดของรอบนั้น (ดาวเทียมเดียวกัน ±NEAR นาทีจากเวลาผ่าน — จุดในกลุ่มป่าอยู่ในช่วงนี้เสมอ) → จบ ให้ build_site/line_notify/telegram_notify ทำงานต่อทันที
//   - ระหว่างรอ cron-job.org สั่งรอบถัดไปไว้ (คิวของ concurrency group "pages") รอบนั้นเริ่มต่อทันทีที่รอบนี้จบ → ช่วงข้อมูลเข้าแทบจะมีคนเฝ้าตลอด
//   - นอกช่วง / ข้อมูลรอบนั้นเข้าแล้ว (ดูจาก .state/live_cache.json ของ build_site) = ไม่รอ ไม่ถาม API เพิ่ม
// บันทึกความล่าช้าจริงของต้นทางต่อรอบ (สแกน → เห็นข้อมูล) ใน .state/pass_lag.json ไว้ปรับช่วงรอภายหลัง
// ไม่ว่าเกิดอะไรขึ้น exit 0 (ห้ามทำให้รอบ site ล้ม)
// ทดสอบ: PASS_NOW=<ms> จำลองเวลาเริ่ม · HOTSPOT_API · STATE_DIR · PASS_POLL / PASS_WAIT / PASS_WIN0 / PASS_WIN1 / PASS_OFF=1 ปิด
const fs = require('fs'), path = require('path');
const ORB = require('./lib/orbit');
const ROOT = path.join(__dirname, '..');
const API = process.env.HOTSPOT_API || 'https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/alerts';
const STATE_DIR = process.env.STATE_DIR || path.join(ROOT, '.state');
const POLL = (+process.env.PASS_POLL || 45) * 1e3, WAIT = (+process.env.PASS_WAIT || 4) * 6e4;
const WIN0 = (+process.env.PASS_WIN0 || 8) * 6e4, WIN1 = (+process.env.PASS_WIN1 || 90) * 6e4, NEAR = 3 * 6e4;
const T0 = +process.env.PASS_NOW || Date.now(), START = Date.now(), now = () => T0 + (Date.now() - START);
const th = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 19);
const hm = ms => th(ms).slice(11, 16);
const fdMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00');
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const readJ = f => { try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf8')) } catch (e) { return null } };
const got = (p, list) => list.some(([s, ms]) => s === p.k && Math.abs(ms - p.t) <= NEAR);

function lagLog(p, seen, how) {
  const L = readJ('pass_lag.json') || { log: [] };
  if (L.log.some(x => x.k === p.k && Math.abs(x.t - p.t) < 6e4)) return;
  L.log.unshift({ k: p.k, t: p.t, seen, lag: Math.round((seen - p.t) / 6e4), how, ang: Math.round(p.ang) });
  L.log = L.log.slice(0, 200); L.updated = new Date().toISOString();
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, 'pass_lag.json'), JSON.stringify(L)) } catch (e) { }
}

(async () => {
  if (process.env.PASS_OFF) return console.log('pass_wait: ปิดอยู่ (PASS_OFF)');
  let tle; try { tle = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tle.json'), 'utf8')) } catch (e) { return console.log('pass_wait: ไม่มี data/tle.json — ข้าม') }
  const t = now(), P = ORB.next(tle, t - WIN1, WIN1 / 36e5).filter(p => t >= p.t + WIN0 && t <= p.t + WIN1);
  if (!P.length) { const n = ORB.next(tle, t, 24)[0]; return console.log(`pass_wait: ไม่อยู่ในช่วงรอข้อมูล` + (n ? ` · รอบถัดไป ${ORB.label(n, t)} น. (รอตั้งแต่ ${hm(n.t + WIN0)} น.)` : '')) }
  // ข้อมูลรอบนั้นเข้าแล้วหรือยัง — จาก live_cache.json ที่ build_site รอบก่อนเก็บไว้ (จำนวนทั้งประเทศต่อ "ดาวเทียม|เวลาสแกน")
  const C = readJ('live_cache.json'), seen = C && C.nat ? Object.keys(C.nat).map(k => [k.slice(0, k.indexOf('|')), fdMs(k.slice(k.indexOf('|') + 1))]) : [];
  let wait = P.filter(p => !got(p, seen));
  for (const p of P) if (!wait.includes(p)) lagLog(p, Date.parse(C.updated) || t, 'cache'); // เข้าแล้วระหว่างรอบปกติ = เวลาที่เห็นเป็นค่าสูงสุด
  if (!wait.length) return console.log(`pass_wait: ข้อมูลรอบ ${P.map(p => ORB.label(p, t)).join(', ')} เข้าแล้ว — ไม่ต้องรอ`);
  const end = Math.min(t + WAIT, Math.max(...wait.map(p => p.t + WIN1)));
  console.log(`pass_wait: รอข้อมูลรอบ ${wait.map(p => ORB.label(p, t) + ` (มุม ${Math.round(p.ang)}°)`).join(', ')} น. · ถาม API ทุก ${POLL / 1e3} วิ ถึง ${hm(end)} น.`);
  for (let k = 0; ; k++) {
    const q = now(), from = Math.min(...wait.map(p => p.t)) - NEAR;
    try {
      const url = `${API}?start_date=${encodeURIComponent(th(from))}&end_date=${encodeURIComponent(th(q))}&reserved_only=0&protected_only=0`;
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)' }, signal: AbortSignal.timeout(30e3) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const F = ((await r.json()).features || []).map(f => [satKey(f.properties && f.properties.satellite_name), fdMs(f.properties && f.properties.full_date)]);
      const done = wait.filter(p => got(p, F));
      for (const p of done) { lagLog(p, q, k ? 'poll' : 'first'); console.log(`pass_wait: ข้อมูลรอบ ${ORB.label(p, q)} น. เข้าแล้ว (ช้ากว่าสแกน ${Math.round((q - p.t) / 6e4)} นาที, ${F.filter(x => x[0] === p.k && Math.abs(x[1] - p.t) <= NEAR).length} จุดทั้งประเทศ) → สร้างเว็บและแจ้งเตือนต่อ`) }
      if (done.length) return; // รอบใดรอบหนึ่งเข้า = ไปแจ้งเตือนทันที (รอบที่ยังไม่เข้าให้รอบ site ถัดไปรอต่อ)
    } catch (e) { console.log('pass_wait: ถาม API ไม่สำเร็จ:', e.message) }
    if (now() + POLL > end) return console.log(`pass_wait: ยังไม่เข้า — ให้รอบ site ถัดไปรอต่อ`);
    await new Promise(r => setTimeout(r, POLL));
  }
})().catch(e => console.log('pass_wait: ผิดพลาด', e.message));
