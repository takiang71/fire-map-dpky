// แจ้งเตือนเมื่อระบบเสีย → LINE ถึงผู้ดูแลคนเดียว (LINE_ADMIN_ID) ไม่ใช่เข้ากลุ่ม
// ใช้ใน workflow "site" ต่อจาก line_notify.js:  node scripts/health.js
//   ตรวจ: ดึง API จุดความร้อนไม่ได้/ตอบว่างทั้งประเทศ (เกิน 1 ชม.) · ระบบต้นทางไม่อัปเดต (เกิน 18 ชม.) · sync ไม่ทำงาน (adata เก่ากว่า 14 ชม.)
//         ข้อมูลสะสมค้าง (วันล่าสุดที่ดึงครบเก่ากว่า 2 วัน) · LINE ใช้งานไม่ได้ (ช่อง line ใน notify.json)
//         Telegram ใช้งานไม่ได้ / กลุ่มถูกอัปเกรดเป็น supergroup (ช่อง tg, migrate ใน tg_notify.json — scripts/telegram_notify.js)
//   แจ้งเมื่อเริ่มพบ · ทวนซ้ำทุก 12 ชม. ถ้ายังไม่หาย · แจ้ง "กลับมาปกติ" เมื่อหาย — รวมทุกเรื่องเป็นข้อความเดียวต่อรอบ (push ถึง 1 คน = 1 ข้อความจากโควตา)
//   สถานะเก็บใน _site/health.json (เผยแพร่บน Pages ไม่ commit; รอบถัดไปอ่านจาก URL — แบบเดียวกับ notify.json) ดูสถานะปัจจุบันได้ที่ <เว็บ>/health.json
// ใช้ใน workflow "sync":  node scripts/health.js --site  → ตรวจว่า workflow site ยังทำงาน (notify.json บนเว็บอัปเดตใน 90 นาที)
//   ถ้า cron-job.org/site หยุด การตรวจข้างบนก็หยุดด้วย จึงให้ sync (วันละ 4 รอบ) ตรวจแทน · ไม่มีที่เก็บสถานะ จึงแจ้งทุกรอบ sync จนกว่าจะหาย (≤ 4 ครั้ง/วัน)
// env: LINE_TOKEN, LINE_ADMIN_ID (รหัสผู้ใช้ LINE ของผู้ดูแล — พิมพ์ "รหัสผู้ใช้" คุยกับบอท) · SITE_URL, LINE_API (ทดสอบ) · HEALTH_NOW (มิลลิวินาที จำลองเวลา)
//   ส่งทาง Telegram ด้วย (ไม่บังคับ): TG_TOKEN + TG_ADMIN_ID (รหัสแชตส่วนตัวกับบอท — docs/telegram-bot.md) · TG_API (ทดสอบ)
//   ตั้งไว้ทั้งสองทาง = ส่งทั้งสอง · ส่งได้ทางใดทางหนึ่งถือว่าแจ้งแล้ว (LINE เสียก็ยังรู้ทาง Telegram)
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, '_site');
const SITE = process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/';
const TOKEN = process.env.LINE_TOKEN, ADMIN = (process.env.LINE_ADMIN_ID || '').trim(), API = process.env.LINE_API || 'https://api.line.me';
const TG = (process.env.TG_TOKEN || '').trim(), TADMIN = (process.env.TG_ADMIN_ID || '').trim(), TAPI = process.env.TG_API || 'https://api.telegram.org';
const ACTIONS = 'https://github.com/takiang71/fire-map-dpky/actions';
const H = 36e5, REMIND = 12 * H;
// เรื่องที่ตรวจ: ชื่อ + ต้องเป็นต่อเนื่องนานเท่าไรจึงแจ้ง (กันขัดข้องชั่วคราว)
const CHECKS = { api: ['ดึงจุดความร้อนจาก API ไม่ได้', H], src: ['ระบบต้นทางไม่อัปเดต', 0], sync: ['sync จุดความร้อนไม่ทำงาน', 0], gap: ['ข้อมูลสะสมค้าง', 0], line: ['LINE ใช้งานไม่ได้', H],
  tg: ['Telegram ใช้งานไม่ได้', H], tle: ['ข้อมูลวงโคจรดาวเทียมเก่า', 0], vr: ['ข้อมูลอัตราการระบายอากาศ (GFS) เก่า', 0], cams: ['ข้อมูล PM2.5 แบบจำลอง CAMS เก่า', 0], fwi: ['ข้อมูล FWI/FFMC (TFDRS) เก่า', 0], tgm: ['กลุ่ม Telegram ถูกอัปเกรดเป็น supergroup', 0],
  pages: ['หน้าเว็บ (GitHub Pages) ไม่อัปเดต', 0], ci: ['หน้าเว็บฉบับใหม่ไม่ผ่านการตรวจ', 0],
  cron: ['cron-job.org ไม่ได้สั่งรอบ site ตามเวลา', H],
  // ช่องที่ 3 = ทวนซ้ำทุกเท่าไร (ไม่ใส่ = REMIND 12 ชม.) — เรื่องที่แก้ไม่ได้ทันที เตือนห่าง ๆ (15 พ.ย. 69 ข้อ C1/A6 ของรายงานตรวจ)
  xlsx: ['ยังไม่ได้นำเข้า Excel จุดความร้อนกรมอุทยานฯ ปีงบที่จบแล้ว', 0, 30 * 24 * H], savi: ['แหล่งเชื้อเพลิง SAVI (ตามรอยเผา) ไม่มีเดือนใหม่', 0, 30 * 24 * H],
  b4: ['พื้นที่เผาไหม้ราย 7 วัน (ตามรอยเผา B4) ไม่มีรอบใหม่', 0, 7 * 24 * H] };
const now = +process.env.HEALTH_NOW || Date.now();
const thTime = ms => { const d = new Date(ms + 7 * H); return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} น.` };
const hrs = ms => (ms / H).toFixed(ms < 10 * H ? 1 : 0);
const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return null } };
const THM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thM = m => THM[+m.slice(4, 6) - 1] + ' ' + String(+m.slice(0, 4) + 543).slice(2), thD8 = v => (+v.slice(6, 8)) + ' ' + thM(v);
const fyOf = t => { const d = new Date(t + 7 * H), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; return y + 543 + (m >= 10 ? 1 : 0) };
// C1: ปีงบล่าสุดใน hdata (Excel กรมอุทยานฯ) < ปีงบปัจจุบัน−1 ตั้งแต่ 1 ธ.ค. → เตือนนำเข้า (หน้าเว็บเติมจาก API ให้ระหว่างนี้ — hdFill)
function chkXlsx(fys, t = now) {
  if (!fys || !fys.length) return 'อ่านปีงบใน hdata (index.html) ไม่ได้';
  const F = fyOf(t), last = Math.max(...fys), dec1 = Date.UTC(F - 544, 11, 1) - 7 * H;
  if (last >= F - 1 || t < dec1) return null;
  return `ข้อมูลกรมอุทยานฯ ในเว็บถึงปีงบ ${last} — นำเข้า Excel ปีงบ ${F - 1}: node scripts/excel_to_hdata.js <ไฟล์.xlsx> แล้ว node scripts/sync_hotspots.js (ขั้นตอนใน docs/arch/data-update.md) · ระหว่างนี้การ์ด/สถิติปีงบ ${last + 1}${F - 1 > last + 1 ? '–' + (F - 1) : ''} ใช้จุดจาก API`;
}
// A6: SAVI เดือนล่าสุด (บนเว็บหรือที่ต้นทางมี) จบเกิน 90 วัน · ต้นทางมีเดือนใหม่กว่าบนเว็บ = sync_fuel ไม่ทำงาน
function chkSavi(fu, t = now) {
  if (!fu) return 'อ่าน data/fuel/index.json ไม่ได้';
  const web = ((fu.months || []).at(-1) || {}).m, src = fu.srcLatest, m = [web, src].filter(Boolean).sort().at(-1);
  if (!m) return 'data/fuel/index.json ไม่มีเดือนข้อมูล';
  const ck = fu.checked ? ` · sync ตรวจต้นทางล่าสุด ${fu.checked}` : ' · ยังไม่มีวันที่ตรวจต้นทาง (checked)';
  if (src && web && src > web) return `ต้นทางมีเดือน ${thM(src)} แล้วแต่เว็บยังเป็น ${thM(web)} — ดูขั้น sync_fuel ใน workflow sync${ck}`;
  const age = Math.floor((t - Date.UTC(+m.slice(0, 4), +m.slice(4, 6), 1)) / 864e5);
  return age > 90 ? `ตามรอยเผา (สสน.) ยังไม่เผยแพร่ SAVI เดือนใหม่ตั้งแต่ ${thM(m)} (${age} วัน) — เว็บแสดงค่าของเดือนนั้นพร้อมป้ายอายุข้อมูล${ck}` : null;
}
// A6: พื้นที่เผาไหม้ B4 รอบล่าสุดจบเกิน 21 วัน (ปกติออกสัปดาห์ละครั้ง) · ต้นทางมีรอบใหม่กว่าบนเว็บ = sync_burn ไม่ทำงาน
function chkB4(bn, t = now) {
  if (!bn) return 'อ่าน data/burn/index.json ไม่ได้';
  const L = (bn.periods || []).at(-1), src = bn.srcLatest && bn.srcLatest.b4;
  if (!L) return 'data/burn/index.json ไม่มีรอบ B4';
  const ck = bn.checked ? ` · sync ตรวจต้นทางล่าสุด ${bn.checked}` : '';
  if (src && src > L.p) return `ต้นทางมีรอบ ${thD8(src.slice(0, 8))}–${thD8(src.slice(9))} แล้วแต่เว็บยังเป็นรอบ ${thD8(L.d0)}–${thD8(L.d1)} — ดูขั้น sync_burn ใน workflow sync${ck}`;
  const age = Math.floor((t - Date.UTC(+L.d1.slice(0, 4), +L.d1.slice(4, 6) - 1, +L.d1.slice(6, 8) + 1)) / 864e5);
  return age > 21 ? `ตามรอยเผา (สสน.) ยังไม่ออกภาพรอบใหม่หลัง ${thD8(L.d1)} (${age} วัน)${ck}` : null;
}
const hdFys = () => { try { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/id="hdata">([\s\S]*?)<\/script>/)[1]); return [...new Set(j.r.map(r => fyOf(r[0] * 864e5)))] } catch (e) { return null } };
const { loadState } = require('./lib/state');
const getJ = async f => { try { const r = await fetch(SITE + f + '?t=' + now, { signal: AbortSignal.timeout(20e3) }); return r.ok ? await r.json() : null } catch (e) { return null } };

async function line(p, body) {
  const r = await fetch(API + p, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20e3), headers: { Authorization: 'Bearer ' + TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${p} HTTP ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : {};
}
async function tgSend(text) {
  const r = await fetch(`${TAPI}/bot${TG}/sendMessage`, { method: 'POST', signal: AbortSignal.timeout(20e3), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: TADMIN, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } }) });
  const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(`Telegram ${j.error_code || r.status} ${j.description || ''}`);
}
// ส่งข้อความถึงผู้ดูแลทาง Telegram และ/หรือ LINE (ตรวจโควตาก่อน) → true = ส่งได้อย่างน้อยหนึ่งทาง · to = { line, tg } เลือกทาง (ข้อความยืนยันการตั้งค่า)
async function send(text, to = { line: 1, tg: 1 }) {
  let sent = false, err = null;
  if (to.tg && TG && TADMIN) try { await tgSend(text); sent = true } catch (e) { console.log('Telegram ส่งไม่สำเร็จ:', e.message); err = e }
  if (to.line) {
    if (!TOKEN || !ADMIN) console.log('ยังไม่ตั้ง', !TOKEN ? 'LINE_TOKEN' : 'LINE_ADMIN_ID', '— ไม่ส่งทาง LINE' + (sent ? '' : ':\n' + text));
    else try {
      const [q, u] = await Promise.all([line('/v2/bot/message/quota'), line('/v2/bot/message/quota/consumption')]);
      if (q.type !== 'none' && q.value - u.totalUsage < 1) console.log('โควตา LINE หมด — ไม่ส่งทาง LINE');
      else { await line('/v2/bot/message/push', { to: ADMIN, messages: [{ type: 'text', text: text.slice(0, 4900) }] }); sent = true }
    } catch (e) { console.log('LINE ส่งไม่สำเร็จ:', e.message); err = e }
  }
  if (!sent && err) throw err;
  return sent;
}

// ปัญหาที่พบตอนนี้ { key: ข้อความ }
function problems(pg) {
  const P = {}, live = readJ(path.join(OUT, 'live.json')), nt = readJ(path.join(OUT, 'notify.json'));
  if (!live) P.api = 'สร้าง live.json ไม่ได้ (API ไม่ตอบหรือผิดพลาด)';
  else if (!live.meta || !live.meta.nation_total) P.api = live.meta && live.meta.firms ? `${live.meta.firms.why} — ${live.meta.firms.err ? 'NASA FIRMS ก็ดึงไม่ได้' : `ใช้จุดจาก NASA FIRMS แทน (${live.meta.firms.n} จุดในแนวเขต, ล่าช้า ~3 ชม.)`}` : 'API ตอบว่างทั้งประเทศ (48 ชม. ไม่มีจุดเลย = น่าจะขัดข้อง)';
  // API มีข้อมูลแต่ขาดบางดาวเทียม — แจ้งเฉพาะเมื่อ NASA FIRMS พบจุดของดวงนั้นในกรอบกลุ่มป่า (ไม่งั้นอาจแค่ไม่มีไฟ เช่น หน้าฝน)
  else if (live.meta.firms && Object.values(live.meta.firms.box || {}).some(v => v > 0)) P.api = `${live.meta.firms.why} แต่ NASA FIRMS พบ (${Object.entries(live.meta.firms.box).map(([s, v]) => s + ' ' + v).join(', ')} จุดในกรอบกลุ่มป่า) — เติมจาก FIRMS ${live.meta.firms.n} จุดในแนวเขต`;
  const su = live && live.meta && live.meta.sys_update && Date.parse(live.meta.sys_update);
  if (su && now - su > 18 * H) P.src = `Land Fire Alerts อัปเดตล่าสุด ${thTime(su)} (${hrs(now - su)} ชม.)`;
  let a = null; try { a = JSON.parse(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/id="adata">([\s\S]*?)<\/script>/)[1]) } catch (e) { }
  if (!a) P.sync = 'อ่านข้อมูลสะสม (adata) ใน index.html ไม่ได้';
  else {
    const up = Date.parse(a.upd);
    if (now - up > 14 * H) P.sync = `อัปเดตล่าสุด ${thTime(up)} (${hrs(now - up)} ชม.) — ดู workflow sync`;
    const today = Math.floor((now + 7 * H) / 864e5), to = a.to ? Date.parse(a.to) / 864e5 : 0;
    if (today - to > 2) P.gap = `ดึงครบถึง ${a.to || '-'} (ขาด ${today - to - 1} วัน) — API อาจตอบว่างย้อนหลัง`;
  }
  // อัตราการระบายอากาศ NOAA GFS (scripts/sync_gfsvr.js ใน sync.yml) — ผู้ใช้ขอ 14 พ.ย. 69 · ปกติรอบ GFS ที่ใช้อายุไม่เกิน ~17 ชม. (sync 4 รอบ/วัน, รอบ GFS ครบ 120 ชม. ~4 ชม. หลังเวลารอบ)
  // เกิน 30 ชม. = sync_gfsvr ล้มติดกันหลายรอบหรือ NOMADS ล่ม → พยากรณ์บนเว็บ/สรุปประจำวันเหลือน้อยวันและเริ่มเก่า
  try { const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gfs_vr.json'), 'utf8')), c = Date.parse(String(g.cyc).replace('Z', ':00Z'));
    if (!isFinite(c)) P.vr = 'data/gfs_vr.json ไม่มีเวลารอบ GFS'; else if (now - c > 30 * H) P.vr = `รอบ GFS ที่ใช้อยู่ ${thTime(c)} (${hrs(now - c)} ชม.) พยากรณ์เหลือถึง ${thTime(c + 120 * H)} — ดูขั้น sync_gfsvr ใน workflow sync (NOMADS อาจล่ม)` } catch (e) { P.vr = 'อ่าน data/gfs_vr.json ไม่ได้' }
  // ตารางค่า PM2.5 แบบจำลอง CAMS (scripts/sync_cams.js ใน sync.yml, Open-Meteo) — ผู้ใช้ขอ 14 พ.ย. 69 · ดึงเมื่อมีรอบใหม่ (00/12UTC) ปกติรอบที่ใช้อายุไม่เกิน ~23 ชม.
  // เกิน 42 ชม. = sync_cams ล้มหลายรอบติดกัน (Open-Meteo ล่ม/โควตาเต็ม) → ชั้นบนเว็บเริ่มขาดวันข้างหน้า และสรุปประจำวันไม่มีส่วน PM2.5 เมื่อเกิน 2 วัน
  try { const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cams_grid.json'), 'utf8')), u = Date.parse(String(c.run).replace('Z', ':00Z'));
    if (!isFinite(u)) P.cams = 'data/cams_grid.json ไม่มีเวลารอบแบบจำลอง'; else if (now - u > 42 * H) P.cams = `รอบ CAMS ที่ใช้อยู่ ${thTime(u)} (${hrs(now - u)} ชม.) — ดูขั้น sync_cams ใน workflow wx (Open-Meteo อาจล่มหรือโควตาเต็ม — annotation ของ run บอกสาเหตุ)` } catch (e) { P.cams = 'อ่าน data/cams_grid.json ไม่ได้' }
  // FWI/FFMC จาก TFDRS (scripts/sync_fwi.js ใน workflow wx) — ต้นทางออกวันละครั้ง ~14:20 น. · รอบเก่ากว่าเมื่อวาน (เวลาไทย) หลัง 18:00 น. หรือเก่ากว่า 2 วัน = ดึงไม่ได้
  // 15 พ.ย. 69 พบต้นทางตอบ 403 กับเครื่อง GitHub Actions (ข้อมูลเดิมมาจากการรันในเครื่อง) — สรุปประจำวันจะไม่มี FWI เมื่อรอบเก่ากว่า 3 วัน
  try { const fw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fwi', 'index.json'), 'utf8')), th = new Date(now + 7 * H), td = th.toISOString().slice(0, 10), lag = (Date.parse(td) - Date.parse(fw.run)) / 864e5;
    if (!fw.run) P.fwi = 'data/fwi/index.json ไม่มีวันของรอบ'; else if (lag >= 2 || (lag >= 1 && th.getUTCHours() >= 18)) P.fwi = `รอบ TFDRS ที่ใช้อยู่ ${fw.run} (${lag} วัน) — TFDRS ไม่อนุญาตเครื่อง GitHub (หยุดดึงอัตโนมัติไว้ 15 พ.ย. 69) ดึงจากเครื่องผู้ดูแลด้วย Task Scheduler "fire-map FWI" (scripts/fwi_local.js) — เครื่องปิด/ไม่ได้ล็อกอิน? ดู .fwi-local/fwi_local.log หรือรัน node scripts/fwi_local.js เอง${(() => { const l = readJ(path.join(ROOT, 'data', 'fwi', 'lfa.json')), s = readJ(path.join(ROOT, 'data', 'fwi', 'local_status.json')); return (s && s.at ? ` · เครื่องผู้ดูแลดึงล่าสุด ${thTime(Date.parse(s.at))} ${s.ok ? 'สำเร็จ' : 'ล้มเหลว: ' + String(s.msg || '').slice(0, 80)}` : '') + (l && l.d === td ? ` · สรุปประจำวันใช้ค่าของวันจาก LFA แทนแล้ว (FWI เฉลี่ย ${l.a && l.a.all && l.a.all.FWI ? l.a.all.FWI[0].toFixed(1) : '-'})` : lag >= 2 ? ' · ยังไม่มีค่าของวันจาก LFA (scripts/fwi_lfa.js ใน workflow wx)' : '') })()}` } catch (e) { P.fwi = 'อ่าน data/fwi/index.json ไม่ได้' }
  // วงโคจร NOAA-20/21 (scripts/sync_tle.js ใน sync.yml) — เก่ากว่า 4 วัน เวลานับถอยหลัง/สรุปประจำวันเริ่มคลาดเคลื่อน
  try { const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tle.json'), 'utf8')), ep = Object.values(tl.sats || {}).map(x => Date.parse(x.ep)).filter(isFinite);
    if (!ep.length) P.tle = 'data/tle.json ไม่มีข้อมูลดาวเทียม'; else if (now - Math.min(...ep) > 4 * 24 * H) P.tle = `ค่าวงโคจรล่าสุด ${thTime(Math.min(...ep))} (${Math.round((now - Math.min(...ep)) / 864e5)} วัน) — ดูขั้น sync_tle ใน workflow sync` } catch (e) { P.tle = 'อ่าน data/tle.json ไม่ได้' }
  { const m = chkXlsx(hdFys()); if (m) P.xlsx = m }
  { const m = chkSavi(readJ(path.join(ROOT, 'data', 'fuel', 'index.json'))); if (m) P.savi = m }
  { const m = chkB4(readJ(path.join(ROOT, 'data', 'burn', 'index.json'))); if (m) P.b4 = m }
  if (nt && nt.line && nt.line.ok === 0 && TOKEN) P.line = nt.line.why || 'ตรวจโควตา/กลุ่มไม่ผ่าน';
  const tn = readJ(path.join(OUT, 'tg_notify.json'));
  if (tn && tn.tg && tn.tg.ok === 0) P.tg = tn.tg.why || 'ตรวจบอท/ห้องไม่ผ่าน';
  if (tn && tn.migrate && Object.keys(tn.migrate).length) P.tgm = 'แก้ GitHub Variable TG_CHAT_ID: ' + Object.entries(tn.migrate).map(([a, b]) => `${a} → ${b}`).join(', ') + ' (ระหว่างนี้ระบบส่งไปที่รหัสใหม่ให้เอง)';
  // Pages ค้างทั้งที่ deploy สำเร็จ (6 พ.ย. 69) — หน้าเว็บถอยไปดึง API ตรงได้ แต่ live.json/summary.json บนเว็บ (Worker LINE ใช้) จะเก่า
  const pu = pg && pg.meta && Date.parse(pg.meta.generated);
  if (pu && now - pu > H) P.pages = `live.json บนเว็บสร้างเมื่อ ${thTime(pu)} (${hrs(now - pu)} ชม.) ทั้งที่ workflow site รันปกติ — deploy ขึ้นสำเร็จแต่ Pages ไม่เปลี่ยน`;
  // ผลตรวจหน้าเว็บก่อน deploy (scripts/check_site.js --ci)
  const ck = readJ(path.join(OUT, 'check.json'));
  if (ck && ck.ok === false) P.ci = `${String(ck.errs && ck.errs[0] || '').split(' | ')[0].slice(0, 220)}${ck.errs && ck.errs.length > 1 ? ` (+อีก ${ck.errs.length - 1})` : ''} — ${ck.fallback ? 'หน้าเว็บยังใช้ฉบับก่อนหน้า ข้อมูลจุดความร้อนยังอัปเดตตามปกติ' : 'ดึงฉบับก่อนหน้าไม่ได้ ฉบับใหม่ขึ้นเว็บไปแล้ว'} · ดู log ขั้น check site`;
  return P;
}

module.exports = { CHECKS, problems, chkXlsx, chkSavi, chkB4, hdFys, now };
if (require.main === module) (async () => {
  if (process.argv.includes('--site')) {
    const nt = await loadState('notify.json', SITE, now), up = nt && Date.parse(nt.updated);
    if (up && now - up <= 90 * 60e3) { console.log('site ปกติ (notify.json อัปเดต', thTime(up) + ')'); return }
    const msg = `⚠️ ระบบแผนที่ไฟป่า: หน้าเว็บ/การแจ้งเตือนไม่อัปเดต\n• ${up ? `notify.json อัปเดตล่าสุด ${thTime(up)} (${hrs(now - up)} ชม.)` : 'อ่าน notify.json บนเว็บไม่ได้'}\nตรวจ workflow site และงาน cron-job.org "fire-map site"\n${ACTIONS}`;
    try { console.log(await send(msg) ? 'ส่งแล้ว' : 'ไม่ได้ส่ง') } catch (e) { console.log('ส่งไม่สำเร็จ:', e.message) }
    return;
  }

  const st = (await loadState('health.json', SITE, now)) || { checks: {}, log: [] };
  st.checks = st.checks || {};
  const P = problems(await getJ('live.json')), bad = [], ok = [];
  // ใครสั่งรอบนี้ (site.yml ส่ง RUN_BY = inputs.by, RUN_EV = github.event_name): watchdog = ตัวสำรองบน Cloudflare ต้องสั่งแทน cron-job.org
  // หายเมื่อมีรอบที่ cron-job.org สั่ง (workflow_dispatch ไม่มี by) · รอบที่ GitHub ตั้งเวลา/push/sync สั่ง ยังบอกไม่ได้ จึงคงสถานะเดิม
  const BY = process.env.RUN_BY || '', EV = process.env.RUN_EV || '';
  if (BY === 'watchdog') P.cron = 'ตัวสำรองบน Cloudflare (worker/watchdog.mjs) ต้องสั่งรอบ site แทน — งาน "fire-map site" ที่ console.cron-job.org อาจหยุด ถูกปิด หรือ token หมดอายุ (ดู HISTORY ของงาน)';
  else if (st.checks.cron && !(EV === 'workflow_dispatch' && !BY)) P.cron = st.checks.cron.msg;
  // ตั้ง/เปลี่ยน LINE_ADMIN_ID / TG_ADMIN_ID → ส่งข้อความยืนยันทางนั้น 1 ครั้ง (health.json เป็นสาธารณะ จึงเก็บแค่แฮชของรหัส)
  const hash = v => v && require('crypto').createHash('sha256').update(v).digest('hex').slice(0, 12), aid = hash(ADMIN), tid = hash(TADMIN);
  const hello = () => { const n = Object.keys(P).length; return `✅ ตั้งค่าแจ้งเตือนผู้ดูแลเรียบร้อย\nบอทจะส่งข้อความถึงคุณคนเดียวเมื่อระบบแผนที่ไฟป่าเสีย (API/sync/ระบบต้นทาง/LINE/Telegram/หน้าเว็บหยุด) และเมื่อกลับมาปกติ\nสถานะตอนนี้: ${n ? `มีปัญหา ${n} เรื่อง (จะแจ้งแยก)` : 'ปกติ'}` };
  if (aid && st.admin !== aid && TOKEN) try {
    if (await send(hello(), { line: 1 })) { st.admin = aid; console.log('ส่งข้อความยืนยันผู้ดูแลแล้ว') }
  } catch (e) { console.log('ส่งข้อความยืนยันไม่สำเร็จ:', e.message) }
  if (tid && st.tadmin !== tid && TG) try {
    if (await send(hello(), { tg: 1 })) { st.tadmin = tid; console.log('ส่งข้อความยืนยันผู้ดูแลทาง Telegram แล้ว') }
  } catch (e) { console.log('ส่งข้อความยืนยันทาง Telegram ไม่สำเร็จ:', e.message) }
  for (const [k, m] of Object.entries(P)) {
    const c = st.checks[k] = { since: now, ...st.checks[k], msg: m };
    if (now - c.since >= CHECKS[k][1] && (!c.alerted || now - c.alerted >= (CHECKS[k][2] || REMIND))) bad.push(k);
  }
  for (const k of Object.keys(st.checks)) if (!(k in P)) { if (st.checks[k].alerted) ok.push(k); else delete st.checks[k] }

  if (bad.length || ok.length) {
    const L = [];
    if (bad.length) L.push('⚠️ ระบบแผนที่ไฟป่า: พบปัญหา', ...bad.map(k => `• ${CHECKS[k][0]}: ${st.checks[k].msg}${st.checks[k].alerted ? ` (ยังไม่หาย ตั้งแต่ ${thTime(st.checks[k].since)})` : ''}`));
    if (ok.length) L.push(...(bad.length ? [''] : []), '✅ กลับมาปกติแล้ว', ...ok.map(k => `• ${CHECKS[k][0]} (เริ่ม ${thTime(st.checks[k].since)})`));
    L.push('', `ตรวจที่ GitHub Actions: ${ACTIONS}`); // ไม่ใส่ลิงก์ health.json — LINE แสดงตัวอย่างลิงก์เป็น JSON ดิบ (ผู้ใช้ให้เอาออก 1 พ.ย. 69)
    let sent = false;
    try { sent = await send(L.join('\n')) } catch (e) { console.log('ส่งไม่สำเร็จ:', e.message) }
    if (sent) { bad.forEach(k => st.checks[k].alerted = now); ok.forEach(k => delete st.checks[k]) }
    st.log = [{ t: new Date(now).toISOString(), bad, ok, sent: sent ? 1 : 0 }, ...(st.log || [])].slice(0, 30);
    console.log(sent ? 'ส่งแจ้งเตือนผู้ดูแลแล้ว' : 'ยังไม่ได้ส่ง', JSON.stringify({ bad, ok }));
  } else console.log(Object.keys(P).length ? 'มีปัญหา (แจ้งแล้วหรือรอครบเวลา): ' + Object.entries(P).map(([k, m]) => `${k}: ${m}`).join(' · ') : 'ระบบปกติ');
  st.ok = !Object.keys(P).length; st.updated = new Date(now).toISOString();
  if (fs.existsSync(OUT)) fs.writeFileSync(path.join(OUT, 'health.json'), JSON.stringify(st));
})();
