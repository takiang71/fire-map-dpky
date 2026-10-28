// แจ้งเตือนจุดความร้อนใหม่ในแนวเขตกลุ่มป่าเข้ากลุ่ม LINE (Messaging API push) — รันต่อจาก build_site.js ใน workflow "site"
// ใช้: LINE_TOKEN=... LINE_GROUP_ID=... node scripts/line_notify.js
//  - อ่าน _site/live.json (จุด 48 ชม. ในแนวเขต) เทียบกับสถานะเดิม notify.json ที่เผยแพร่ไว้บนเว็บ (ไม่ต้อง commit) → ส่งเฉพาะจุดที่ยังไม่เคยแจ้ง
//  - เขียน _site/notify.json ใหม่ให้ deploy ไปพร้อมหน้าเว็บ · ไม่มีสถานะเดิม (ครั้งแรก/อ่านไม่ได้) = บันทึกจุดปัจจุบันว่าแจ้งแล้วโดยไม่ส่ง กันส่งจุดเก่าทั้งชุด
//  - push เข้ากลุ่มนับโควตาตามจำนวนสมาชิก (กลุ่ม 20 คน = 20 ข้อความ/ครั้ง) จึงตรวจโควตาที่เหลือก่อนส่งทุกครั้ง และจำกัดจำนวนครั้งต่อวัน (LINE_MAX_DAY)
//  - ไม่ตั้ง LINE_TOKEN/LINE_GROUP_ID = ข้าม (แต่ยังเขียน notify.json เพื่อเก็บสถานะ)
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, '_site');
const SITE = process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/';
const TOKEN = process.env.LINE_TOKEN, GROUP = process.env.LINE_GROUP_ID;
const MAX_DAY = +(process.env.LINE_MAX_DAY || 4);      // ส่งได้ไม่เกินกี่ครั้งต่อวัน
const RESERVE = +(process.env.LINE_RESERVE || 0);      // เก็บโควตาไว้ไม่ใช้ (ข้อความ)
const MAX_AGE_H = 12;                                  // ไม่แจ้งจุดที่สแกนนานกว่านี้ (API เติมข้อมูลย้อนหลังได้ เช่น 24–27 ต.ค. 69)
const KEEP_H = 72, LIST = 10;
const SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const thMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00'); // full_date เป็นเวลาไทย
const idOf = f => { const p = f.properties, [lo, la] = f.geometry.coordinates; return String(p.unique_id || `${p.full_date}|${la.toFixed(4)}|${lo.toFixed(4)}|${satKey(p.satellite_name)}`) };
const short = s => String(s || '').replace(/^อุทยานแห่งชาติ/, 'อช.').replace(/^เขตรักษาพันธุ์สัตว์ป่า/, 'ขสป.').replace(/^เขตห้ามล่าสัตว์ป่า/, 'ขห.').replace(/^สถานีควบคุมไฟป่า/, 'สถานีฯ ');
const thDate = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);
const hm = ms => new Date(ms + 7 * 36e5).toISOString().slice(11, 16);
const dTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });

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

function message(pts, now, q) {
  const L = [`🔥 พบจุดความร้อนใหม่ ${pts.length} จุด`, 'กลุ่มป่าดงพญาเย็น-เขาใหญ่', ''];
  pts.slice(0, LIST).forEach(f => {
    const p = f.properties, [lo, la] = f.geometry.coordinates, t = thMs(p.full_date);
    L.push(`• ${hm(t)} น. ${dTh(t)} · ${SATN[satKey(p.satellite_name)] || p.satellite_name}`);
    L.push(`  ต.${p.subdistrict_name_th || '-'} อ.${p.district_name_th || '-'} จ.${p.province_name_th || '-'}`);
    L.push(`  ${short(p._ar)}${p._st && p._st !== 'ไม่มี' ? ' · ' + short(p._st) : ''}`);
    L.push(`  https://maps.google.com/?q=${la.toFixed(5)},${lo.toFixed(5)}`);
  });
  if (pts.length > LIST) L.push(`…และอีก ${pts.length - LIST} จุด`);
  L.push('', `แผนที่: ${SITE}`, 'เวลา = เวลาที่ดาวเทียมสแกน · พิมพ์ "สรุป" ในกลุ่มเพื่อดูภาพรวม');
  if (q && isFinite(q.left)) L.push(`(โควตาแจ้งเตือนเดือนนี้เหลือราว ${Math.max(0, Math.floor((q.left - q.members) / q.members))} ครั้ง)`);
  return L.join('\n');
}

(async () => {
  const now = Date.now(), today = thDate(now);
  let live;
  try { live = JSON.parse(fs.readFileSync(path.join(OUT, 'live.json'), 'utf8')) } catch (e) { console.log('ไม่มี live.json — ข้าม'); return }

  // สถานะเดิมจากเว็บ (cache-bust เพราะ Pages แคช ~10 นาที)
  let st = null;
  try {
    const r = await fetch(SITE + 'notify.json?t=' + now, { signal: AbortSignal.timeout(20e3) });
    if (r.ok) st = await r.json(); else console.log('ยังไม่มี notify.json บนเว็บ (HTTP ' + r.status + ')');
  } catch (e) { console.log('อ่าน notify.json ไม่ได้:', e.message) }
  const seed = !st || !st.sent;
  st = seed ? { sent: {}, days: {}, log: [] } : st;

  const pts = live.features.filter(f => f.geometry && f.properties && f.properties.full_date);
  const fresh = pts.filter(f => !(idOf(f) in st.sent) && now - thMs(f.properties.full_date) < MAX_AGE_H * 36e5)
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
      await line('/v2/bot/message/push', { to: GROUP, messages: [{ type: 'text', text: message(fresh, now, q) }] });
      st.days[today] = (st.days[today] || 0) + 1;
      rec = { ok: 1, n: fresh.length, members: q.members, left: q.left };
    }
  } catch (e) { rec = { why: 'ส่งไม่สำเร็จ: ' + e.message, n: fresh.length } }

  if (rec) { st.log = [{ t: new Date(now).toISOString(), ...rec }, ...(st.log || [])].slice(0, 50); console.log('LINE:', JSON.stringify(rec)) }
  else console.log('LINE: ไม่มีจุดใหม่');
  for (const k in st.sent) if (now - st.sent[k] > KEEP_H * 36e5) delete st.sent[k];
  for (const d in st.days) if (d < thDate(now - 7 * 864e5)) delete st.days[d];
  st.updated = new Date(now).toISOString();
  fs.writeFileSync(path.join(OUT, 'notify.json'), JSON.stringify(st));
})();
