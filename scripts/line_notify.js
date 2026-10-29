// แจ้งเตือนจุดความร้อนใหม่ในแนวเขตกลุ่มป่าเข้ากลุ่ม LINE (Messaging API push) — รันต่อจาก build_site.js ใน workflow "site"
// ใช้: LINE_TOKEN=... LINE_GROUP_ID=... node scripts/line_notify.js   ·   --validate = ส่งข้อความตัวอย่างให้ LINE ตรวจรูปแบบ (ไม่ส่งจริง ไม่เสียโควตา)
//   --test-push = ส่งการ์ดแจ้งเตือนทดสอบเข้ากลุ่มจริง 1 ครั้ง (ใช้จุดจริงล่าสุดใน 6 พื้นที่จาก adata ติดป้าย "ทดสอบ" · เสียโควตาเท่าจำนวนสมาชิก) — ไม่แตะ notify.json
//  - ข้อความเป็น Flex carousel 7 ใบ (ภาพรวมทั้งปี + 6 พื้นที่อนุรักษ์) สร้างด้วย carousel() ใน worker/line-webhook.mjs ตัวเดียวกับคำตอบ "สรุป"
//  - ไม่แจ้งเตือนจุดใน ขสป.ดงใหญ่ / พื้นที่รับผิดชอบสถานีฯ ดงใหญ่ (excluded)
//  - อ่าน _site/live.json (จุด 48 ชม. ในแนวเขต) เทียบกับสถานะเดิม notify.json ที่เผยแพร่ไว้บนเว็บ (ไม่ต้อง commit) → ส่งเฉพาะจุดที่ยังไม่เคยแจ้ง
//  - เขียน _site/notify.json ใหม่ให้ deploy ไปพร้อมหน้าเว็บ · ไม่มีสถานะเดิม (ครั้งแรก/อ่านไม่ได้) = บันทึกจุดปัจจุบันว่าแจ้งแล้วโดยไม่ส่ง กันส่งจุดเก่าทั้งชุด
//  - push เข้ากลุ่มนับโควตาตามจำนวนสมาชิก (กลุ่ม 20 คน = 20 ข้อความ/ครั้ง) จึงตรวจโควตาที่เหลือก่อนส่งทุกครั้ง และจำกัดจำนวนครั้งต่อวัน (LINE_MAX_DAY)
//  - ไม่ตั้ง LINE_TOKEN/LINE_GROUP_ID = ข้าม (แต่ยังเขียน notify.json เพื่อเก็บสถานะ)
//  - สรุปประจำวัน: รอบแรกที่ถึงเวลา LINE_DAILY (ค่าเริ่มต้น 07:30 น. ไทย, "off" = ปิด) push การ์ดสรุปแบบเดียวกับคำตอบ "สรุป" วันละครั้ง (st.daily = วันที่ส่งแล้ว)
//    ส่งได้ภายใน 4 ชม. หลังเวลาที่ตั้ง (เลยนั้นข้ามวันนี้) · รอบที่เพิ่งส่งแจ้งเตือนไปจะรอรอบถัดไป (ครั้งละ 1 ข้อความ) · ไม่นับใน LINE_MAX_DAY
//    --daily = ส่งสรุปประจำวันเข้ากลุ่มทันที 1 ครั้ง (ทดสอบ · ไม่แตะ notify.json)
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, '_site');
const SITE = process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/';
const TOKEN = process.env.LINE_TOKEN, GROUP = process.env.LINE_GROUP_ID;
const MAX_DAY = +(process.env.LINE_MAX_DAY || 4);      // ส่งได้ไม่เกินกี่ครั้งต่อวัน
const RESERVE = +(process.env.LINE_RESERVE || 0);      // เก็บโควตาไว้ไม่ใช้ (ข้อความ)
const DAILY = /^\d{1,2}:\d{2}$/.test(process.env.LINE_DAILY || '') ? process.env.LINE_DAILY : /^(off|0|no)$/i.test(process.env.LINE_DAILY || '') ? null : '07:30';
const DAILY_WIN_H = 4;
const MAX_AGE_H = 12;                                 // ไม่แจ้งจุดที่สแกนนานกว่านี้ (API เติมข้อมูลย้อนหลังได้ เช่น 24–27 ต.ค. 69)
const KEEP_H = 72;
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const thMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00'); // full_date เป็นเวลาไทย
const idOf = f => { const p = f.properties, [lo, la] = f.geometry.coordinates; return String(p.unique_id || `${p.full_date}|${la.toFixed(4)}|${lo.toFixed(4)}|${satKey(p.satellite_name)}`) };
const thDate = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);

async function line(p, body) {
  const r = await fetch('https://api.line.me' + p, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20e3),
    headers: { Authorization: 'Bearer ' + TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} HTTP ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
}

// โควตาที่เหลือพอส่งเข้ากลุ่ม 1 ครั้งไหม (ส่ง 1 ครั้ง = จำนวนสมาชิก)
async function quotaOk() {
  const [q, u, m] = await Promise.all([line('/v2/bot/message/quota'), line('/v2/bot/message/quota/consumption'), line(`/v2/bot/group/${GROUP}/members/count`)]);
  if (q.type === 'none') return { ok: true, left: Infinity, members: m.count };
  const left = q.value - u.totalUsage - RESERVE;
  return { ok: left >= m.count, left, members: m.count, limit: q.value, used: u.totalUsage };
}


(async () => {
  const now = Date.now(), today = thDate(now);
  const { carousel, excluded } = await import(pathToFileURL(path.join(ROOT, 'worker', 'line-webhook.mjs')).href);
  let live, sum = null;
  try { live = JSON.parse(fs.readFileSync(path.join(OUT, 'live.json'), 'utf8')) } catch (e) { console.log('ไม่มี live.json — ข้าม'); return }
  try { sum = JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8')) } catch (e) { }
  const msg = (fresh, q, daily = false) => carousel({ live, sum, fresh, site: SITE, now, daily, quotaLeft: q && isFinite(q.left) ? Math.max(0, Math.floor((q.left - q.members) / q.members)) : null });
  if (process.argv.includes('--validate')) {
    const ex = live.features.slice(0, 3);
    for (const [n, m] of [['แจ้งเตือน', msg(ex, null)], ['สรุป', msg(null, null)], ['สรุปประจำวัน', msg(null, null, true)]]) {
      try { await line('/v2/bot/message/validate/push', { messages: [m] }); console.log(n, ': รูปแบบถูกต้อง', JSON.stringify(m).length, 'ไบต์') } catch (e) { console.log(n, ': ไม่ผ่าน', e.message); process.exitCode = 1 }
    }
    return;
  }
  if (process.argv.includes('--test-push')) {
    if (!TOKEN || !GROUP) { console.log('ต้องตั้ง LINE_TOKEN และ LINE_GROUP_ID'); process.exitCode = 1; return }
    const { block } = require('./lib/area'), j = JSON.parse(block('adata')[1]), iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
    const ex = j.r.map(r => { const [tb, am] = String(j.tm[r[8]]).split('|'); return { type: 'Feature', geometry: { type: 'Point', coordinates: [r[3] / 1e5, r[2] / 1e5] },
      properties: { full_date: `${iso(r[0])} ${String(r[1]).padStart(4, '0').replace(/(..)$/, ':$1')}:00`, satellite_name: j.sat[r[4]], subdistrict_name_th: tb, district_name_th: am || j.am[r[7]], province_name_th: j.pv[r[6]], _ar: j.ar[r[9]], _st: j.st[r[10]] } } })
      .filter(f => !excluded(f.properties) && f.properties._ar !== 'นอกพื้นที่อนุรักษ์').slice(-5);
    const q = await quotaOk();
    if (!q.ok) { console.log('โควตาไม่พอ:', JSON.stringify(q)); process.exitCode = 1; return }
    await line('/v2/bot/message/push', { to: GROUP, messages: [carousel({ live, sum, fresh: ex, site: SITE, now, test: true, quotaLeft: Math.max(0, Math.floor((q.left - q.members) / q.members)) })] });
    console.log(`ส่งการ์ดทดสอบแล้ว (${ex.length} จุดตัวอย่าง · สมาชิก ${q.members} คน · โควตาเหลือ ${q.left - q.members})`);
    return;
  }
  if (process.argv.includes('--daily')) {
    if (!TOKEN || !GROUP) { console.log('ต้องตั้ง LINE_TOKEN และ LINE_GROUP_ID'); process.exitCode = 1; return }
    const q = await quotaOk();
    if (!q.ok) { console.log('โควตาไม่พอ:', JSON.stringify(q)); process.exitCode = 1; return }
    await line('/v2/bot/message/push', { to: GROUP, messages: [msg(null, q, true)] });
    console.log(`ส่งสรุปประจำวันแล้ว (สมาชิก ${q.members} คน · โควตาเหลือ ${q.left - q.members})`);
    return;
  }

  // สถานะเดิมจากเว็บ (cache-bust เพราะ Pages แคช ~10 นาที)
  let st = null;
  try {
    const r = await fetch(SITE + 'notify.json?t=' + now, { signal: AbortSignal.timeout(20e3) });
    if (r.ok) st = await r.json(); else console.log('ยังไม่มี notify.json บนเว็บ (HTTP ' + r.status + ')');
  } catch (e) { console.log('อ่าน notify.json ไม่ได้:', e.message) }
  const seed = !st || !st.sent;
  st = seed ? { sent: {}, days: {}, log: [] } : st;

  const pts = live.features.filter(f => f.geometry && f.properties && f.properties.full_date);
  const fresh = pts.filter(f => !(idOf(f) in st.sent) && !excluded(f.properties) && now - thMs(f.properties.full_date) < MAX_AGE_H * 36e5)
    .sort((a, b) => thMs(a.properties.full_date) - thMs(b.properties.full_date));
  pts.forEach(f => { if (!(idOf(f) in st.sent)) st.sent[idOf(f)] = now });

  let rec = null;
  if (seed) rec = { why: 'เริ่มเก็บสถานะ (ไม่ส่ง)', n: pts.length };
  else if (!fresh.length) rec = null;
  else if (!TOKEN || !GROUP) rec = { why: 'ยังไม่ตั้ง LINE_TOKEN/LINE_GROUP_ID', n: fresh.length };
  else if ((st.days[today] || 0) >= MAX_DAY) rec = { why: `ครบ ${MAX_DAY} ครั้งของวันนี้แล้ว`, n: fresh.length };
  else try {
    const q = await quotaOk();
    if (!q.ok) rec = { why: `โควตาไม่พอ (เหลือ ${q.left} ต้องใช้ ${q.members})`, n: fresh.length };
    else {
      await line('/v2/bot/message/push', { to: GROUP, messages: [msg(fresh, q)] });
      st.days[today] = (st.days[today] || 0) + 1;
      rec = { ok: 1, n: fresh.length, members: q.members, left: q.left };
    }
  } catch (e) { rec = { why: 'ส่งไม่สำเร็จ: ' + e.message, n: fresh.length } }

  // สรุปประจำวัน (ข้ามรอบที่เพิ่งส่งแจ้งเตือน · โควตาไม่พอ = ข้ามทั้งวัน · ส่งไม่สำเร็จ = ลองรอบถัดไป)
  let drec = null;
  const tmin = (() => { const d = new Date(now + 7 * 36e5); return d.getUTCHours() * 60 + d.getUTCMinutes() })();
  const d0 = DAILY && DAILY.split(':').reduce((h, m) => +h * 60 + +m);
  if (DAILY && !seed && TOKEN && GROUP && st.daily !== today && tmin >= d0 && tmin < d0 + DAILY_WIN_H * 60 && !(rec && rec.ok)) try {
    const q = await quotaOk();
    if (!q.ok) { drec = { daily: 1, why: `โควตาไม่พอ (เหลือ ${q.left} ต้องใช้ ${q.members})` }; st.daily = today }
    else {
      await line('/v2/bot/message/push', { to: GROUP, messages: [msg(null, q, true)] });
      st.daily = today;
      drec = { daily: 1, ok: 1, members: q.members, left: q.left };
    }
  } catch (e) { drec = { daily: 1, why: 'ส่งไม่สำเร็จ: ' + e.message } }

  // ตรวจการตั้งค่าทุกชั่วโมง (ไม่ส่งข้อความ ไม่เสียโควตา): token ใช้ได้ไหม บอทอยู่ในกลุ่มไหม โควตาเหลือเท่าไร → ดูได้ที่ notify.json ช่อง line
  if (!TOKEN || !GROUP) st.line = { ok: 0, why: `ยังไม่ตั้ง ${!TOKEN ? 'LINE_TOKEN ' : ''}${!GROUP ? 'LINE_GROUP_ID' : ''}`.trim(), at: new Date(now).toISOString() };
  else if (!st.line || !st.line.ok || now - Date.parse(st.line.at) > 36e5) {
    try { const q = await quotaOk(); st.line = { ok: 1, members: q.members, limit: q.limit ?? null, used: q.used ?? null, left: isFinite(q.left) ? q.left : null, pushes_left: isFinite(q.left) ? Math.max(0, Math.floor(q.left / q.members)) : null, at: new Date(now).toISOString() } }
    catch (e) { st.line = { ok: 0, why: e.message.slice(0, 200), at: new Date(now).toISOString() } }
  }
  if (rec) { st.log = [{ t: new Date(now).toISOString(), ...rec }, ...(st.log || [])].slice(0, 50); console.log('LINE:', JSON.stringify(rec)) }
  else console.log('LINE: ไม่มีจุดใหม่');
  if (drec) { st.log = [{ t: new Date(now).toISOString(), ...drec }, ...(st.log || [])].slice(0, 50); console.log('LINE สรุปประจำวัน:', JSON.stringify(drec)) }
  for (const k in st.sent) if (now - st.sent[k] > KEEP_H * 36e5) delete st.sent[k];
  for (const d in st.days) if (d < thDate(now - 7 * 864e5)) delete st.days[d];
  st.updated = new Date(now).toISOString();
  fs.writeFileSync(path.join(OUT, 'notify.json'), JSON.stringify(st));
})();
