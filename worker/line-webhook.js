// Cloudflare Worker (ฟรี) รับ webhook ของ LINE bot แล้วตอบกลับในกลุ่ม — ข้อความตอบกลับ (reply) ไม่นับโควตา
// งานหนัก (ดึง API ทั้งประเทศ กรองแนวเขต แจ้งเตือน push) อยู่บน GitHub Actions (scripts/line_notify.js) เพราะ Worker ฟรีจำกัด CPU 10 ms
// ที่นี่อ่านแค่ไฟล์เล็กที่เว็บเผยแพร่ไว้: live.json (จุด 48 ชม. ในแนวเขต) + summary.json (ยอดสะสมปีงบ) + notify.json (สถานะแจ้งเตือน)
// ตั้งค่าใน Cloudflare: Secrets LINE_SECRET (Channel secret), LINE_TOKEN (Channel access token) · Variable SITE_URL (ไม่ใส่ = เว็บหลัก)
// คำสั่งในกลุ่ม: "สรุป" · "ช่วยเหลือ" · "รหัสกลุ่ม" (ใช้ตอนติดตั้ง) — บอทจะตอบเฉพาะข้อความที่ขึ้นต้นด้วยคำสั่ง ไม่ตอบแชตทั่วไป
const SITE0 = 'https://takiang71.github.io/fire-map-dpky/';
const SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const short = s => String(s || '').replace(/^อุทยานแห่งชาติ/, 'อช.').replace(/^เขตรักษาพันธุ์สัตว์ป่า/, 'ขสป.').replace(/^เขตห้ามล่าสัตว์ป่า/, 'ขห.').replace(/^สถานีควบคุมไฟป่า/, 'สถานีฯ ');
const thMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00');
const tTh = ms => new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }) + ' น.';
const top = (o, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${short(k)} ${v}`);

async function verify(secret, body, sig) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...mac)) === sig;
}
const getJ = async (site, f) => { try { const r = await fetch(site + f + '?t=' + Date.now(), { cf: { cacheTtl: 0 } }); return r.ok ? await r.json() : null } catch (e) { return null } };

export async function summaryText(site, now = Date.now()) {
  const [live, sum] = await Promise.all([getJ(site, 'live.json'), getJ(site, 'summary.json')]);
  const L = ['📊 สรุปจุดความร้อน กลุ่มป่าดงพญาเย็น-เขาใหญ่', ''];
  if (live) {
    const pts = (live.features || []).filter(f => now - thMs(f.properties.full_date) < 24 * 36e5), bs = {}, ba = {};
    pts.forEach(f => { const p = f.properties, k = satKey(p.satellite_name); bs[k] = (bs[k] || 0) + 1; const a = p._ar || 'ไม่ระบุ'; ba[a] = (ba[a] || 0) + 1 });
    L.push(`จุดใน 24 ชม.: ${pts.length} จุด` + (pts.length ? ' (' + Object.entries(bs).map(([k, v]) => `${SATN[k] || k} ${v}`).join(' · ') + ')' : ''));
    if (pts.length) L.push(...top(ba));
    const last = pts.reduce((m, f) => Math.max(m, thMs(f.properties.full_date)), 0);
    if (last) L.push(`ล่าสุด ${tTh(last)}`);
    const age = now - Date.parse(live.meta && live.meta.generated);
    L.push(`(ข้อมูลอัปเดต ${tTh(Date.parse(live.meta.generated))}${age > 3 * 36e5 ? ' — ค่อนข้างเก่า เปิดแผนที่เพื่อดูล่าสุด' : ''})`);
  } else L.push('อ่านข้อมูลจุด 24 ชม. ไม่ได้ — เปิดแผนที่เพื่อดูล่าสุด');
  if (sum) {
    L.push('', `สะสมปีงบ ${sum.fy} (ตัวชี้วัด ${sum.ind}): ${sum.total} จุด`);
    if (sum.total) L.push('แยกตามสถานีฯ:', ...top(sum.st, 8));
  }
  L.push('', `แผนที่: ${site}`);
  return L.join('\n');
}

const HELP = ['🤖 บอทแจ้งเตือนจุดความร้อน กลุ่มป่าดงพญาเย็น-เขาใหญ่', '',
  '• แจ้งเตือนอัตโนมัติเมื่อพบจุดความร้อนใหม่ในแนวเขตกลุ่มป่า (ทุกดาวเทียม VIIRS)',
  '• พิมพ์ "สรุป" — จุดใน 24 ชม. และยอดสะสมปีงบ',
  '• พิมพ์ "ช่วยเหลือ" — ข้อความนี้',
  '', 'การแจ้งเตือนอัตโนมัติใช้โควตาข้อความฟรีของ LINE ตามจำนวนสมาชิกกลุ่ม ถ้าโควตาเดือนนี้หมด บอทจะหยุดแจ้งเตือนเอง แต่ยังตอบ "สรุป" ได้ตลอด'].join('\n');

async function reply(env, token, text) {
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.LINE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken: token, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  });
  if (!r.ok) console.log('reply', r.status, await r.text());
}

export async function handle(env, ev) {
  const site = env.SITE_URL || SITE0, src = ev.source || {};
  if (ev.type === 'join') return reply(env, ev.replyToken, HELP + (src.groupId ? `\n\nรหัสกลุ่มนี้ (ใช้ตั้งค่า LINE_GROUP_ID):\n${src.groupId}` : ''));
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const t = ev.message.text.trim();
  if (/^(สรุป|summary)/i.test(t)) return reply(env, ev.replyToken, await summaryText(site));
  if (/^(ช่วยเหลือ|วิธีใช้|help)/i.test(t)) return reply(env, ev.replyToken, HELP);
  if (/^(รหัสกลุ่ม|groupid)/i.test(t)) return reply(env, ev.replyToken, src.groupId ? `รหัสกลุ่มนี้:\n${src.groupId}` : `ไม่ใช่กลุ่ม (${src.type}) — เชิญบอทเข้ากลุ่มแล้วพิมพ์ใหม่`);
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== 'POST') return new Response('LINE webhook: สถานการณ์ไฟป่า กลุ่มป่าดงพญาเย็น-เขาใหญ่ — ทำงานอยู่', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const body = await req.text();
    if (!env.LINE_SECRET || !(await verify(env.LINE_SECRET, body, req.headers.get('x-line-signature') || ''))) return new Response('bad signature', { status: 401 });
    const evs = (JSON.parse(body).events || []);
    ctx.waitUntil(Promise.all(evs.map(ev => handle(env, ev).catch(e => console.log('event', e.message)))));
    return new Response('ok'); // ตอบ LINE ทันที (ปุ่ม Verify ใน LINE Developers ส่ง events ว่าง)
  },
};
