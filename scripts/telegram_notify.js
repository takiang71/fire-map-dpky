// แจ้งเตือนจุดความร้อนใหม่ในแนวเขตกลุ่มป่าทาง Telegram — คู่ขนานกับ LINE (scripts/line_notify.js) รันต่อกันใน workflow "site"
// ใช้: TG_TOKEN=... TG_CHAT_ID=... node scripts/telegram_notify.js   (คู่มือ docs/telegram-bot.md)
//  - กติกาเดียวกับ LINE: จุดใหม่ใน live.json ที่สแกนไม่เกิน 12 ชม. · ไม่รวม ขสป.ดงใหญ่/สถานีฯ ดงใหญ่ (excluded) · 1 ข้อความต่อรอบรวมทุกจุด
//  - สถานะแยกจาก LINE: _site/tg_notify.json (เผยแพร่บน Pages ไม่ commit; รอบถัดไปอ่านกลับจาก URL) — ระบบหนึ่งเสียอีกระบบยังทำงาน
//    ไม่มีสถานะเดิม (ครั้งแรก/อ่านไม่ได้) = บันทึกจุดปัจจุบันว่าแจ้งแล้วโดยไม่ส่ง กันส่งจุดเก่าทั้งชุด
//  - Telegram ไม่มีโควตารายเดือน (bot ส่งเข้ากลุ่มได้ ~20 ข้อความ/นาที) จึงไม่จำกัดครั้งต่อวัน และไม่ต้องรอรอบถัดไปเหมือน LINE
//  - ข้อความเป็นตัวอักษร HTML (Telegram ไม่มีการ์ดแบบ Flex) + ปุ่มลิงก์ใต้ข้อความ (inline keyboard) · แตะเวลาของจุด = เปิด Google Maps
//  - TG_CHAT_ID ใส่ได้หลายห้อง คั่นด้วยจุลภาค (กลุ่ม/supergroup = เลขติดลบ, channel = -100… หรือ @ชื่อช่อง) · กลุ่มที่ถูกอัปเกรดเป็น supergroup
//    Telegram ตอบรหัสใหม่มา → ส่งซ้ำที่รหัสใหม่ทันทีและบันทึกไว้ใน tg_notify.json ช่อง tg.migrate (ต้องแก้ TG_CHAT_ID เอง)
//  - สรุปประจำวัน TG_DAILY (เวลาไทย HH:MM ค่าเริ่มต้น 07:30, "off" = ปิด) วันละครั้ง ภายใน 4 ชม. หลังเวลาที่ตั้ง
//  - พื้นที่เผาไหม้รอบใหม่ (burn_summary.json) ≥ 1 ไร่ → ส่ง 1 ข้อความ (รอบแรก/ไม่มีรอยเผา/เก่ากว่า 30 วัน = จำไว้ไม่ส่ง) · TG_BURN=off = ปิด
//  - ทดสอบ: --preview พิมพ์ข้อความทุกแบบออกจอ (ไม่ส่ง ไม่ต้องมี token) · --test-push / --daily / --burn ส่งเข้าห้องจริง 1 ครั้ง (ไม่แตะ tg_notify.json)
//    --chats = แสดงรหัสห้องที่บอทอยู่ (จาก getUpdates — เชิญบอทเข้ากลุ่มแล้วพิมพ์อะไรก็ได้ในกลุ่มก่อน) · TG_API = เปลี่ยนปลายทาง (เซิร์ฟเวอร์จำลอง)
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, '_site');
const SITE = process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/';
// TG_CHAT_ID: เก็บเฉพาะส่วนที่เป็นรหัสห้อง (ตัวเลข/@ชื่อช่อง) — กันวางทั้งบรรทัดจาก log "TG_CHAT_ID = -100… (supergroup) ชื่อกลุ่ม" (3 พ.ย. 69)
const IDS = (process.env.TG_CHAT_ID || '').replace(/["'`]/g, ' ').split(/[\s,;]+/).filter(Boolean), isId = x => /^-?\d{5,}$|^@\w{4,}$/.test(x);
const TOKEN = (process.env.TG_TOKEN || '').trim(), CHATS = [...new Set(IDS.filter(isId))], BADID = IDS.filter(x => !isId(x));
const API = process.env.TG_API || 'https://api.telegram.org';
const DAILY = /^\d{1,2}:\d{2}$/.test(process.env.TG_DAILY || '') ? process.env.TG_DAILY : /^(off|0|no)$/i.test(process.env.TG_DAILY || '') ? null : '07:30';
const DAILY_WIN_H = 4, BURN = !/^(off|0|no)$/i.test(process.env.TG_BURN || '');
const MAX_AGE_H = 12, KEEP_H = 72, MAXLEN = 3900;     // Telegram รับข้อความไม่เกิน 4,096 ตัวอักษร
const SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const thMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00');
const idOf = f => { const p = f.properties, [lo, la] = f.geometry.coordinates; return String(p.unique_id || `${p.full_date}|${la.toFixed(4)}|${lo.toFixed(4)}|${satKey(p.satellite_name)}`) };
const thDate = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);
const hm = ms => new Date(ms + 7 * 36e5).toISOString().slice(11, 16);
const dTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const dateTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = v => Math.round(v).toLocaleString('en-US'), rai = v => v > 0 && v < 1 ? '<1' : nf(v);
const OUTA = 'นอกพื้นที่อนุรักษ์';
const dPct = (c, p) => !p ? (c ? '▲ ใหม่' : '–') : c === p ? '= เท่าเดิม' : `${c > p ? '▲' : '▼'} ${Math.abs(Math.round((c - p) / p * 100))}%`;

async function tg(method, body = {}) {
  const r = await fetch(`${API}/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20e3) });
  const j = await r.json().catch(() => ({ ok: false, description: 'HTTP ' + r.status }));
  if (!j.ok) { const e = new Error(`${method} ${j.error_code || r.status} ${j.description || ''}`.trim()); e.p = j.parameters || {}; throw e }
  return j.result;
}
// กลุ่มที่ถูกอัปเกรดเป็น supergroup: รหัสเดิม → รหัสใหม่ (จำไว้ใน tg_notify.json ช่อง migrate จนกว่าจะแก้ TG_CHAT_ID)
const MIG = {};
let sendErr = false;
async function sendTo(chat, m) {
  const id = MIG[chat] || chat;
  try { return await tg('sendMessage', { chat_id: id, ...m }) }
  catch (e) {
    if (e.p.migrate_to_chat_id) { MIG[chat] = String(e.p.migrate_to_chat_id); return tg('sendMessage', { chat_id: e.p.migrate_to_chat_id, ...m }) }
    if (e.p.retry_after && e.p.retry_after <= 30) { await new Promise(r => setTimeout(r, e.p.retry_after * 1e3)); return tg('sendMessage', { chat_id: id, ...m }) }
    throw e;
  }
}
// ส่งถึงทุกห้องใน TG_CHAT_ID → ห้องที่ส่งได้ (ส่งไม่ได้เลยสักห้อง = throw) · มีห้องที่ส่งไม่ได้ = ตรวจการตั้งค่าใหม่ท้ายรอบ
async function send(m) {
  let ok = 0; const err = [];
  for (const c of CHATS) try { await sendTo(c, m); ok++ } catch (e) { err.push(`${c}: ${e.message}`) }
  if (err.length) sendErr = true;
  if (!ok) throw new Error(err.join(' | '));
  return { ok, ...(err.length ? { err: err.join(' | ').slice(0, 300) } : {}) };
}
const kb = rows => ({ inline_keyboard: rows.map(r => r.map(([text, url]) => ({ text, url }))) });
const msgOf = (text, rows, o = {}) => ({ text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: kb(rows), ...o });

(async () => {
  const now = +process.env.TG_NOW || Date.now(), today = thDate(now);   // TG_NOW = จำลองเวลา (มิลลิวินาที) ตอนทดสอบ
  const { excluded, EX, AREAS, stShort, burnLab } = await import(pathToFileURL(path.join(ROOT, 'worker', 'line-webhook.mjs')).href);
  let live, sum = null, bsum = null;
  try { live = JSON.parse(fs.readFileSync(path.join(OUT, 'live.json'), 'utf8')) } catch (e) { console.log('ไม่มี live.json — ข้าม'); return }
  try { sum = JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8')) } catch (e) { }
  try { bsum = JSON.parse(fs.readFileSync(path.join(OUT, 'burn_summary.json'), 'utf8')) } catch (e) { }

  // --- ตัวสร้างข้อความ ---
  const arS = k => (AREAS.find(a => a.k === k) || {}).s || (k && k !== OUTA ? k : 'นอกเขตอนุรักษ์');
  const gm = f => { const [lo, la] = f.geometry.coordinates; return `https://maps.google.com/?q=${la.toFixed(5)},${lo.toFixed(5)}` };
  const ptLine = (f, ar = false) => { const p = f.properties, t = thMs(p.full_date);
    return `• <a href="${gm(f)}">${hm(t)} น. ${dTh(t)}</a> ${esc(SATN[satKey(p.satellite_name)] || p.satellite_name)}${ar ? ' · ' + esc(arS(p._ar)) : ''} · ต.${esc(p.subdistrict_name_th || '-')} อ.${esc(p.district_name_th || '-')} จ.${esc(p.province_name_th || '-')}${p._st ? ' · ' + esc(stShort(p._st)) : ''}` };
  // ปุ่มแผนที่ของชุดจุด (ลิงก์ตรงแบบเดียวกับการ์ด LINE): 1 จุด = เปิดจุดนั้น, หลายจุด = ซูมกรอบ
  const mapBtn = L => { const c = L.map(f => f.geometry.coordinates), r = v => v.toFixed(4);
    if (c.length === 1) return ['📍 ดูจุดนี้บนแผนที่', `${SITE}?hs=${c[0][1].toFixed(5)},${c[0][0].toFixed(5)}`];
    const x = c.map(p => p[0]), y = c.map(p => p[1]); return [`📍 ดู ${c.length} จุดบนแผนที่`, `${SITE}?bb=${r(Math.min(...x))},${r(Math.min(...y))},${r(Math.max(...x))},${r(Math.max(...y))}`] };
  // ยอดสะสมจาก summary.json (ไม่รวมดงใหญ่ — ชุดเดียวกับการ์ด LINE) · ปีก่อน = ทั้งปีงบ (pfull)
  const A = Object.entries(sum && sum.areas || {}).filter(([k]) => !EX.test(k));
  const tot = pick => A.filter(([k]) => pick(k)).reduce((o, [, v]) => { o.fy += v.fy; o.pfull += v.pfull; for (const l of ['pv', 'am', 'tm']) for (const k in v[l] || {}) o[l][k] = (o[l][k] || 0) + v[l][k]; return o }, { fy: 0, pfull: 0, pv: {}, am: {}, tm: {} });
  const all = tot(() => true), fy = sum ? sum.fy : '';
  const pts = live.features.filter(f => f.geometry && f.properties && f.properties.full_date && !excluded(f.properties));
  const h24 = pts.filter(f => now - thMs(f.properties.full_date) < 24 * 36e5);
  const groups = L => [...AREAS.map(a => [a.s, L.filter(f => f.properties._ar === a.k)]), ['นอกเขตอนุรักษ์', L.filter(f => !AREAS.some(a => a.k === f.properties._ar))]].filter(g => g[1].length);
  const top1 = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1])[0];
  const tops = (o, u = '') => [['จ.', top1(o.pv), k => k], ['อ.', top1(o.am), k => k.split('|')[0]], ['ต.', top1(o.tm), k => k.split('|')[0]]].filter(x => x[1]).map(([p, [k, v], f]) => `${p}${esc(f(k))} ${u ? rai(v) + u : v}`).join(' · ');
  const fyLine = () => sum ? `📈 สะสมปีงบ ${fy}: <b>${all.fy}</b> จุด (${dPct(all.fy, all.pfull)} เทียบทั้งปีงบ ${fy - 1}: ${all.pfull})` : '';
  const NOTE = '<i>ไม่รวม ขสป.ดงใหญ่ · แตะเวลาเพื่อเปิด Google Maps</i>';
  // ข้อความยาวเกิน → ลดจำนวนจุดที่แสดงต่อพื้นที่ลง
  const fit = f => { let t; for (const per of [20, 10, 5, 3, 1, 0]) { t = f(per); if (t.length <= MAXLEN) break } return t };
  const list = (L, per, ar) => [...L.slice(0, per).map(f => ptLine(f, ar)), ...(L.length > per ? [`  …และอีก ${L.length - per} จุด`] : [])];
  const byNew = L => L.slice().sort((a, b) => thMs(b.properties.full_date) - thMs(a.properties.full_date));

  const alertMsg = (fresh, test = false) => {
    const G = groups(fresh).sort((a, b) => b[1].length - a[1].length);
    const text = fit(per => [
      `${test ? '🧪 <b>ทดสอบ</b> · ' : ''}🔥 <b>พบจุดความร้อนใหม่ ${fresh.length} จุด</b>`,
      `กลุ่มป่าดงพญาเย็น-เขาใหญ่ · ${dateTh(now)} ${hm(now)} น.`,
      ...G.flatMap(([n, L]) => ['', `🌲 <b>${esc(n)}</b> ${L.length} จุด`, ...list(byNew(L), per)]),
      '', ...[fyLine(), `🕐 จุดใน 24 ชม.: ${h24.length} จุด`].filter(Boolean), NOTE,
    ].join('\n'));
    return msgOf(text, [[mapBtn(fresh), ['🗺️ แผนที่ไฟป่า', SITE]]]);
  };
  const dailyMsg = () => {
    const rows = [...AREAS.map(a => [a.s, tot(k => k === a.k)]), ['นอกเขตอนุรักษ์', tot(k => k.startsWith(OUTA))]].filter(([, v], i) => i < AREAS.length || v.fy || v.pfull);
    const text = fit(per => [
      `📋 <b>สรุปประจำวัน ${dateTh(now)}</b>`,
      'สถานการณ์ไฟป่า กลุ่มป่าดงพญาเย็น-เขาใหญ่ · สบอ.1 (ปราจีนบุรี)', '',
      `🕐 จุดใน 24 ชม.: <b>${h24.length}</b> จุด`, ...[fyLine()].filter(Boolean),
      ...(sum && sum.ind ? [`🛰 ดาวเทียมตัวชี้วัด: ${esc(sum.ind)}`] : []),
      ...(sum ? ['', `<b>รายพื้นที่</b> (สะสมปีงบ ${fy} / ทั้งปีงบ ${fy - 1})`, ...rows.map(([n, v]) => `• ${esc(n)}: <b>${v.fy}</b> / ${v.pfull}  ${dPct(v.fy, v.pfull)}`)] : []),
      ...(all.fy ? [`📍 พบมากสุด: ${tops(all)}`] : []),
      ...(h24.length ? ['', '<b>จุดใน 24 ชม.</b>', `<blockquote expandable>${list(byNew(h24), per * 2, true).join('\n')}</blockquote>`] : []),
      '<i>ไม่รวม ขสป.ดงใหญ่ · ปีก่อนไม่รวมจุดจัดการเชื้อเพลิง/ไม่พบไฟ</i>',
    ].join('\n'));
    return msgOf(text, [[['🗺️ เปิดแผนที่ไฟป่า', SITE]]]);
  };
  const burnMsg = (bs, test = false) => {
    const P = bs.rai ? Math.round(bs.hs / bs.rai * 100) : 0;
    const rows = [...AREAS.map(a => [a.s, (bs.areas || {})[a.k]]), ['นอกเขตอนุรักษ์', bs.ar && bs.ar[OUTA] ? { rai: bs.ar[OUTA] } : null]].filter(r => r[1] && r[1].rai > 0).sort((a, b) => b[1].rai - a[1].rai);
    const text = [
      `${test ? '🧪 <b>ทดสอบ</b> · ' : ''}🔥 <b>พื้นที่เผาไหม้ รอบ ${esc(burnLab(bs))}</b>`,
      'ระบบตามรอยเผา (สสน.) · กลุ่มป่าดงพญาเย็น-เขาใหญ่', '',
      `รอบนี้ <b>${nf(bs.rai)}</b> ไร่${bs.rai >= 63 ? ` (${(bs.rai / 625).toFixed(1)} ตร.กม.)` : ''}`,
      `มีจุดความร้อนใกล้ (≤${bs.radius_m / 1000} กม.) ${P}% · ไม่พบจุดความร้อน ${nf(bs.rai - bs.hs)} ไร่`,
      `สะสมปีงบ ${bs.fy}: ${nf(bs.fy_rai)} ไร่`,
      ...(bs.pv && bs.rai ? [`📍 ไหม้มากสุด: ${tops(bs, ' ไร่')}`] : []),
      '', '<b>รายพื้นที่ (ไร่)</b>',
      ...(rows.length ? rows.map(([n, v]) => `• ${esc(n)}: <b>${rai(v.rai)}</b>${v.hs != null ? ` · มีจุดความร้อนใกล้ ${v.rai ? Math.round(v.hs / v.rai * 100) : 0}%` : ''}${v.tm && top1(v.tm) ? ` · มากสุด ต.${esc(top1(v.tm)[0].split('|')[0])}` : ''}`) : ['ไม่พบรอยเผาไหม้ในพื้นที่อนุรักษ์รอบนี้']),
      ...(bs.miss ? ['', '⚠ รอบนี้ต้นทางไม่มีภาพบางส่วนของพื้นที่ (เมฆมาก) ตัวเลขจริงอาจมากกว่านี้'] : []),
      '<i>ภาพดาวเทียม 20 ม. ออกหลังสิ้นรอบ ~9 วัน · ไม่รวม ขสป.ดงใหญ่</i>',
    ].join('\n');
    return msgOf(text, [[['🗺️ เปิดแผนที่ไฟป่า', SITE]]], { disable_notification: true });
  };

  // --- โหมดทดสอบ ---
  const A0 = process.argv;
  if (A0.includes('--preview')) {
    const ex = pts.slice(-3).length ? pts.slice(-3) : live.features.slice(0, 3);
    for (const [n, m] of [['แจ้งเตือน', ex.length ? alertMsg(ex) : null], ['สรุปประจำวัน', dailyMsg()], ['พื้นที่เผาไหม้', bsum ? burnMsg(bsum) : null]]) if (m) console.log(`===== ${n} (${m.text.length} ตัวอักษร) =====\n${m.text}\n[ปุ่ม] ${m.reply_markup.inline_keyboard.flat().map(b => b.text + ' → ' + b.url).join('  |  ')}\n`);
    return;
  }
  if (A0.includes('--chats')) {
    if (!TOKEN) { console.log('ต้องตั้ง TG_TOKEN'); process.exitCode = 1; return }
    const me = await tg('getMe'), U = await tg('getUpdates', { allowed_updates: ['message', 'channel_post', 'my_chat_member'] }), C = {};
    for (const u of U) { const c = (u.message || u.channel_post || u.my_chat_member || {}).chat; if (c) C[c.id] = c }
    console.log(`บอท @${me.username} · พบ ${Object.keys(C).length} ห้อง (จากข้อความ 24 ชม. ล่าสุดที่บอทเห็น)`);
    for (const c of Object.values(C)) console.log(`  TG_CHAT_ID = ${c.id}   (${c.type}) ${c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || ''}${c.username ? ' @' + c.username : ''}`);
    if (!Object.keys(C).length) console.log('ไม่พบห้อง — เชิญบอทเข้ากลุ่ม (หรือตั้งเป็นผู้ดูแล channel) แล้วพิมพ์ /start@' + me.username + ' ในกลุ่ม จากนั้นรันใหม่');
    return;
  }
  const testMode = ['--test-push', '--daily', '--burn'].find(a => A0.includes(a));
  if (testMode) {
    if (!TOKEN || !CHATS.length) { console.log('ต้องตั้ง TG_TOKEN และ TG_CHAT_ID'); process.exitCode = 1; return }
    let m;
    if (testMode === '--daily') m = dailyMsg();
    else if (testMode === '--burn') { if (!bsum) { console.log('ไม่มี _site/burn_summary.json — รัน node scripts/build_site.js ก่อน'); process.exitCode = 1; return } m = burnMsg(bsum, true) }
    else {   // จุดจริงล่าสุด 5 จุดจาก adata (แบบเดียวกับ line_notify.js --test-push)
      const { block } = require('./lib/area'), j = JSON.parse(block('adata')[1]), iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
      const ex = j.r.map(r => { const [tb, am] = String(j.tm[r[8]]).split('|'); return { type: 'Feature', geometry: { type: 'Point', coordinates: [r[3] / 1e5, r[2] / 1e5] },
        properties: { full_date: `${iso(r[0])} ${String(r[1]).padStart(4, '0').replace(/(..)$/, ':$1')}:00`, satellite_name: j.sat[r[4]], subdistrict_name_th: tb, district_name_th: am || j.am[r[7]], province_name_th: j.pv[r[6]], _ar: j.ar[r[9]], _st: j.st[r[10]] } } })
        .filter(f => !excluded(f.properties) && f.properties._ar !== OUTA).slice(-5);
      m = alertMsg(ex, true);
    }
    const r = await send(m);
    console.log(`ส่ง${{ '--daily': 'สรุปประจำวัน', '--burn': 'พื้นที่เผาไหม้', '--test-push': 'แจ้งเตือนทดสอบ' }[testMode]}แล้ว ${r.ok}/${CHATS.length} ห้อง${r.err ? ' · ไม่สำเร็จ: ' + r.err : ''}${Object.keys(MIG).length ? ' · ⚠ กลุ่มถูกอัปเกรด แก้ TG_CHAT_ID เป็น ' + JSON.stringify(MIG) : ''}`);
    return;
  }

  // --- รอบปกติ ---
  let st = null;
  try {
    const r = await fetch(SITE + 'tg_notify.json?t=' + now, { signal: AbortSignal.timeout(20e3) });
    if (r.ok) st = await r.json(); else console.log('ยังไม่มี tg_notify.json บนเว็บ (HTTP ' + r.status + ')');
  } catch (e) { console.log('อ่าน tg_notify.json ไม่ได้:', e.message) }
  const seed = !st || !st.sent, on = !!(TOKEN && CHATS.length);
  st = seed ? { sent: {}, log: [] } : st;
  for (const k in st.migrate || {}) if (CHATS.includes(k)) MIG[k] = st.migrate[k];
  const mig0 = Object.keys(MIG).length;
  const log =rec => { st.log = [{ t: new Date(now).toISOString(), ...rec }, ...(st.log || [])].slice(0, 50); console.log('Telegram:', JSON.stringify(rec)) };
  const off = `ยังไม่ตั้ง ${!TOKEN ? 'TG_TOKEN ' : ''}${!CHATS.length ? 'TG_CHAT_ID' : ''}`.trim();

  const all48 = live.features.filter(f => f.geometry && f.properties && f.properties.full_date);
  const fresh = pts.filter(f => !(idOf(f) in st.sent) && now - thMs(f.properties.full_date) < MAX_AGE_H * 36e5)
    .sort((a, b) => thMs(a.properties.full_date) - thMs(b.properties.full_date));
  all48.forEach(f => { if (!(idOf(f) in st.sent)) st.sent[idOf(f)] = now });
  if (seed) log({ why: 'เริ่มเก็บสถานะ (ไม่ส่ง)', n: all48.length });
  else if (fresh.length) {
    if (!on) log({ why: off, n: fresh.length });
    else try { log({ ok: 1, n: fresh.length, ...await send(alertMsg(fresh)) }) } catch (e) { log({ why: 'ส่งไม่สำเร็จ: ' + e.message.slice(0, 300), n: fresh.length }) }
  } else console.log('Telegram: ไม่มีจุดใหม่');

  // สรุปประจำวัน (ส่งไม่สำเร็จ = ลองรอบถัดไปภายในช่วงเวลา)
  const tmin = (() => { const d = new Date(now + 7 * 36e5); return d.getUTCHours() * 60 + d.getUTCMinutes() })();
  const d0 = DAILY && DAILY.split(':').reduce((h, m) => +h * 60 + +m);
  if (DAILY && !seed && on && st.daily !== today && tmin >= d0 && tmin < d0 + DAILY_WIN_H * 60)
    try { log({ daily: 1, ok: 1, ...await send(dailyMsg()) }); st.daily = today } catch (e) { log({ daily: 1, why: 'ส่งไม่สำเร็จ: ' + e.message.slice(0, 300) }) }

  // พื้นที่เผาไหม้รอบใหม่
  if (BURN && bsum && bsum.p) {
    const nw = !st.burn || bsum.p > st.burn, old = now - (Date.UTC(+bsum.d1.slice(0, 4), +bsum.d1.slice(4, 6) - 1, +bsum.d1.slice(6, 8)) + 864e5) > 30 * 864e5;
    if (seed || !st.burn) st.burn = bsum.p;
    else if (!nw) { }
    else if (bsum.rai < 1 || old) { st.burn = bsum.p; log({ burn: bsum.p, why: bsum.rai < 1 ? 'รอบใหม่ไม่มีรอยเผาไหม้ (ไม่ส่ง)' : 'รอบเก่ากว่า 30 วัน (ไม่ส่ง)' }) }
    else if (!on) { st.burn = bsum.p; log({ burn: bsum.p, why: off }) }
    else try { log({ burn: bsum.p, ok: 1, rai: bsum.rai, ...await send(burnMsg(bsum)) }); st.burn = bsum.p } catch (e) { log({ burn: bsum.p, why: 'ส่งไม่สำเร็จ: ' + e.message.slice(0, 300) }) }
  }

  // ตรวจการตั้งค่าทุกชั่วโมง และทันทีเมื่อส่งไม่สำเร็จ/กลุ่มเพิ่งถูกอัปเกรด (ไม่ส่งข้อความ): token ใช้ได้ไหม บอทยังอยู่ในห้องไหม
  //  → ช่อง tg (scripts/health.js อ่าน ok:0 และ migrate ไปแจ้งผู้ดูแล)
  if (Object.keys(MIG).length) st.migrate = MIG; else delete st.migrate;
  if (!on) st.tg = { off: 1, why: off, at: new Date(now).toISOString() };
  else if (!st.tg || !st.tg.ok || now - Date.parse(st.tg.at) > 36e5 || sendErr || Object.keys(MIG).length > mig0) {
    try {
      const me = await tg('getMe'), chats = [], bad = [];
      for (const c of CHATS) { const id = MIG[c] || c;
        try { const ch = await tg('getChat', { chat_id: id }); let n = null; try { n = await tg('getChatMemberCount', { chat_id: id }) } catch (e) { } chats.push({ id, type: ch.type, title: ch.title || ch.username || ch.first_name || '', members: n }) }
        catch (e) { chats.push({ id, why: e.message.slice(0, 120) }); bad.push(`${id}: ${e.message.slice(0, 120)}`) } }
      st.tg = { ok: bad.length ? 0 : 1, bot: me.username, chats, ...(bad.length ? { why: bad.join(' | ') } : {}), ...(BADID.length ? { ignored: BADID.length } : {}), at: new Date(now).toISOString() };
    } catch (e) { st.tg = { ok: 0, why: e.message.slice(0, 200), at: new Date(now).toISOString() } }
  }
  for (const k in st.sent) if (now - st.sent[k] > KEEP_H * 36e5) delete st.sent[k];
  st.updated = new Date(now).toISOString();
  if (fs.existsSync(OUT)) fs.writeFileSync(path.join(OUT, 'tg_notify.json'), JSON.stringify(st));
})();
