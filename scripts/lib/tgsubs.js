// F6 (18 พ.ย. 69) สมัครรับแจ้งเตือน Telegram รายพื้นที่ทางแชตส่วนตัวกับบอท — ใช้ใน scripts/telegram_notify.js
// telegram_notify.js รันบน Actions (workflow site ~5 นาที) ไม่มี webhook → อ่านคำสั่งใหม่ด้วย getUpdates ทุกรอบ
//   offset (update_id ถัดไป) เก็บใน branch state ไฟล์ tg_subs.json — ห้ามตั้ง webhook (getUpdates จะใช้ไม่ได้ และ --chats เสีย)
// tg_subs.json = { offset, subs: {chat_id: {areas:[รหัส], st:[ชื่อสถานีฯ เต็ม], since}}, seen: {chat_id: [ชนิดห้อง, เวลา]}, gu: สถานะ getUpdates }
//   ไม่เก็บชื่อ/username · อยู่ใน branch state เท่านั้น ไม่ขึ้น Pages (สรุปจำนวนผู้สมัครแบบไม่มีรหัสอยู่ใน tg_notify.json ช่อง subs)
// คำสั่ง (แชตส่วนตัว): /ตาม <พื้นที่…> · /เลิก <พื้นที่…> · /เลิกทั้งหมด · /รายการ · /ช่วย (+ /start /help /รหัส และคำภาษาอังกฤษ)
//   ในกลุ่ม: ตอบว่าใช้ได้เฉพาะแชตส่วนตัว (ยกเว้น /start ที่ใช้ตอนติดตั้งกลุ่ม — ไม่ตอบ)
// ชื่อพื้นที่ยืดหยุ่น: ทับลาน / อช.ทับลาน / อุทยานแห่งชาติทับลาน / tl / thaplan / พิมพ์ผิด 1 ตัว · สถานีฯ ใส่ "สถานี" นำหน้า หรือชื่อที่ไม่ซ้ำพื้นที่ (วังน้ำเขียว, ทับลานใต้)
//   ดงใหญ่ (dy) สมัครได้ — ต่างจากข้อความกลุ่มที่ไม่รวม ขสป.ดงใหญ่
const DY = { id: 'dy', k: 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', s: 'ขสป.ดงใหญ่' };
const EN = { ky: ['khaoyai'], tl: ['thaplan', 'thablan', 'tablan', 'taplan'], ps: ['pangsida', 'pangseeda'], tp: ['taphraya', 'tapraya', 'taphaya'], dy: ['dongyai'], ks: ['khoksung', 'koksung', 'khoksoong'], kc: ['khaochakan', 'khaochakhan'] };
const ALL = ['ทั้งหมด', 'ทุกพื้นที่', 'all'];
const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[\s.\-–—_()（）ฯ"'`’‘“”:]/g, '');
const dir = s => s.replace(/ด้านทิศใต้|ทิศใต้|ด้านใต้/g, 'ใต้');
const ST_P = ['สถานีควบคุมไฟป่า', 'สถานีไฟป่า', 'สถานี', 'สถ'];
const AR_P = ['เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่า', 'อุทยานแห่งชาติ', 'อุทยาน', 'อช', 'เขตรักษาพันธุ์สัตว์ป่า', 'ขสป', 'เขตห้ามล่าสัตว์ป่า', 'ขห'];
const strip = (s, P) => { for (const p of P) if (s.startsWith(p) && s.length > p.length) return [s.slice(p.length), true]; return [s, false] };
const stripAr = s => strip(s, AR_P)[0].replace(/(เตรียมการ|เตรียมประกาศ)$/, '');
const stShort = n => n.replace('สถานีควบคุมไฟป่า', 'สถานีฯ ').replace(' (ด้านทิศใต้)', ' (ใต้)').replace(' - ', '-');
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// รายชื่อที่สมัครได้: AREAS (6 พื้นที่จาก worker/line-webhook.mjs) + ดงใหญ่ · สถานีฯ จากแนวเขตรับผิดชอบ (GEO.resp ใน index.html)
function catalog(AREAS, stations) {
  const areas = [...AREAS, ...(AREAS.some(a => a.id === 'dy') ? [] : [DY])].map(a => ({ id: a.id, k: a.k, s: a.s, keys: [stripAr(norm(a.k)), ...(EN[a.id] || [])] }));
  const st = [...new Set(stations)].filter(n => n && n !== 'ไม่มี').sort((a, b) => a.localeCompare(b, 'th')).map(n => ({ k: n, s: stShort(n), keys: [dir(strip(norm(n), ST_P)[0])] }));
  return { areas, st };
}
// ชื่อเดียว → {a: area} | {s: station} | {all: 1} | null
function resolve(cat, q) {
  const n = norm(q);
  if (!n) return null;
  if (ALL.includes(n)) return { all: 1 };
  const code = cat.areas.find(a => a.id === n);
  if (code) return { a: code };
  const [sn, isSt] = strip(n, ST_P);
  const fz = (L, s) => {   /* ตรงทุกตัว → ขึ้นต้นด้วย (≥3 ตัว, ไม่กำกวม) → พิมพ์ผิด 1 ตัว (≥4 ตัว, ไม่กำกวม) */
    let r = L.filter(x => x.keys.includes(s)); if (r.length === 1) return r[0];
    if (s.length >= 3) { r = L.filter(x => x.keys.some(k => k.startsWith(s))); if (r.length === 1) return r[0] }
    if (s.length >= 4) { r = L.filter(x => x.keys.some(k => lev(k, s) <= 1)); if (r.length === 1) return r[0] }
    return null;
  };
  if (isSt) { const s = fz(cat.st, dir(sn)); return s ? { s } : null }
  const d = dir(n), ar = stripAr(d);
  const ea = cat.areas.find(a => a.keys.includes(ar)); if (ea) return { a: ea };
  const es = cat.st.find(s => s.keys.includes(d)); if (es) return { s: es };
  const a = fz(cat.areas, ar); if (a) return { a };
  const s = fz(cat.st, d); return s ? { s } : null;
}
// ข้อความหลายชื่อ (คั่นด้วยจุลภาค/บรรทัด/"และ"/เว้นวรรค) → {areas:[id], st:[ชื่อเต็ม], all, bad:[คำที่ไม่รู้จัก]}
// ในแต่ละท่อน จับคำยาวสุดก่อน: "อช. ทับลาน" = 1 ชื่อ · "ทับลาน เขาใหญ่" = 2 ชื่อ · "สถานี ทับลาน ใต้" = สถานีฯ ทับลาน (ด้านทิศใต้)
function parseList(cat, text) {
  const R = { areas: [], st: [], all: 0, bad: [] };
  for (const piece of String(text || '').split(/[,，、;\n]+|\s+และ\s*|\s*\+\s*/)) {
    const w = piece.trim().split(/\s+/).filter(Boolean); let i = 0, junk = [];
    while (i < w.length) {
      let hit = null, j = w.length;
      for (; j > i; j--) { hit = resolve(cat, w.slice(i, j).join(' ')); if (hit) break }
      if (!hit) { junk.push(w[i]); i++; continue }
      if (junk.length) { R.bad.push(junk.join(' ')); junk = [] }
      if (hit.all) R.all = 1; else if (hit.a) { if (!R.areas.includes(hit.a.id)) R.areas.push(hit.a.id) } else if (!R.st.includes(hit.s.k)) R.st.push(hit.s.k);
      i = j;
    }
    if (junk.length) R.bad.push(junk.join(' '));
  }
  return R;
}

// คำสั่ง: คำยาวก่อน (เลิกทั้งหมด ก่อน เลิก) · มี / นำหน้าไม่ต้องเว้นวรรคก็ได้ (/ตามทับลาน) · ไม่มี / ต้องเว้นวรรคหรือจบข้อความ · ตัด @ชื่อบอท
const VERBS = [['stopall', ['เลิกทั้งหมด', 'ยกเลิกทั้งหมด', 'หยุดทั้งหมด', 'stop', 'unsuball']], ['unfollow', ['เลิกติดตาม', 'ยกเลิก', 'เลิก', 'unfollow', 'unsub']],
  ['follow', ['ติดตาม', 'ตาม', 'follow', 'sub', 'subscribe']], ['list', ['รายการ', 'list', 'mylist']], ['help', ['ช่วยเหลือ', 'ช่วย', 'วิธีใช้', 'help', 'start']], ['id', ['รหัส', 'id', 'chatid']]];
const VL = VERBS.flatMap(([c, L]) => L.map(v => [v, c])).sort((a, b) => b[0].length - a[0].length);
function parseCmd(text) {
  const t = String(text || '').trim().normalize('NFC'), slash = t.startsWith('/'), b = slash ? t.slice(1) : t, lb = b.toLowerCase();
  for (const [v, cmd] of VL) {
    if (!lb.startsWith(v)) continue;
    let rest = b.slice(v.length);
    const at = rest.match(/^@\w+/); if (at) rest = rest.slice(at[0].length);
    if (!slash && rest && !/^\s/.test(rest)) continue;
    if (slash && rest && /^[a-z0-9_]/i.test(rest) && /^[a-z]/i.test(v)) continue;   /* /stopwatch ≠ /stop */
    return { cmd, arg: rest.trim(), slash, start: v === 'start' };
  }
  return null;
}

const listNames = (cat, sub) => [...cat.areas.filter(a => (sub.areas || []).includes(a.id)).map(a => a.s), ...cat.st.filter(s => (sub.st || []).includes(s.k)).map(s => s.s)];
const choices = cat => [
  'พื้นที่อนุรักษ์ (พิมพ์ชื่อหรือรหัส):', ...cat.areas.map(a => `  ${a.id}  ${a.s}`),
  'สถานีควบคุมไฟป่า (พิมพ์ "สถานี" นำหน้า):', ...cat.st.map(s => `  ${s.s}`),
  '"ทั้งหมด" = ทุกพื้นที่อนุรักษ์'];
const HOWTO = 'ระบบตรวจคำสั่งและจุดใหม่ทุก ~5 นาที — คำตอบอาจมาช้า 5–10 นาที';
function helpText(cat) {
  return ['🔔 แจ้งเตือนจุดความร้อนรายพื้นที่ (ส่งถึงคุณคนเดียว)', 'กลุ่มป่าดงพญาเย็น-เขาใหญ่', '',
    '/ตาม ทับลาน — รับแจ้งเตือนเฉพาะพื้นที่ (หลายพื้นที่คั่นด้วยจุลภาค เช่น /ตาม ทับลาน, สถานีวังน้ำเขียว)',
    '/เลิก ทับลาน — เลิกติดตามพื้นที่นั้น', '/เลิกทั้งหมด — หยุดรับทั้งหมด', '/รายการ — ดูพื้นที่ที่ติดตามอยู่', '/ช่วย — ข้อความนี้', '',
    ...choices(cat), '', 'ส่งเมื่อพบจุดใหม่ (สแกนไม่เกิน 12 ชม.) ในพื้นที่ที่ติดตาม รูปแบบเดียวกับข้อความกลุ่ม · ' + HOWTO].join('\n');
}
const nowList = (cat, sub) => { const L = listNames(cat, sub || {}); return L.length ? `ตอนนี้ติดตาม ${L.length} รายการ: ${L.join(', ')}` : 'ตอนนี้ไม่ได้ติดตามพื้นที่ใด' };

// ประมวลผลชุด update จาก getUpdates → แก้ db (offset/subs/seen) แล้วคืนข้อความตอบ [{chat_id, text, reply_to_message_id?}]
function processUpdates(db, updates, cat, now = Date.now()) {
  db.subs = db.subs || {}; db.seen = db.seen || {}; db.offset = db.offset || 0;
  const out = [], grpDone = new Set(), stats = { cmd: 0, grp: 0, kicked: 0 };
  const say = (chat, text, mid) => out.push({ chat_id: chat, text, ...(mid ? { reply_to_message_id: mid } : {}) });
  for (const u of updates || []) {
    if (typeof u.update_id === 'number') db.offset = Math.max(db.offset, u.update_id + 1);
    const cm = u.my_chat_member, m = u.message, cp = u.channel_post, c = (m || cm || cp || {}).chat;
    if (!c) continue;
    const id = String(c.id); db.seen[id] = [c.type, now];
    // ผู้ใช้บล็อกบอท / ลบแชต → เลิกการสมัคร
    if (cm && c.type === 'private') { if (cm.new_chat_member && /kicked|left/.test(cm.new_chat_member.status) && db.subs[id]) { delete db.subs[id]; stats.kicked++ } continue }
    if (!m || (m.from && m.from.is_bot)) continue;
    const p = parseCmd(m.text || m.caption || '');
    if (c.type !== 'private') {
      if (!p || !p.slash || p.start || grpDone.has(id)) continue;
      grpDone.add(id); stats.grp++;
      say(id, p.cmd === 'id' ? `รหัสห้องนี้ (TG_CHAT_ID) = ${id}` : 'ℹ️ คำสั่งติดตามรายพื้นที่ใช้ได้เฉพาะแชตส่วนตัวกับบอท — แตะชื่อบอทแล้วกด "ส่งข้อความ"/Start แล้วพิมพ์ /ตาม ทับลาน\nกลุ่มนี้ได้รับแจ้งเตือนทุกพื้นที่ตามปกติ (ไม่รวม ขสป.ดงใหญ่)', m.message_id);
      continue;
    }
    stats.cmd++;
    if (!p) { say(id, `ไม่เข้าใจคำสั่ง — พิมพ์ /ช่วย ดูวิธีใช้\nตัวอย่าง: /ตาม ทับลาน`); continue }
    let { cmd, arg } = p;
    // ลิงก์ t.me/<บอท>?start=tl-ky = สมัครทันที (payload ใช้ได้แค่ A-Z 0-9 _ -)
    if (p.start && arg) { cmd = 'follow'; arg = arg.replace(/[-_]/g, ' ') }
    const sub = db.subs[id];
    if (cmd === 'help') { say(id, helpText(cat)); continue }
    if (cmd === 'id') { say(id, `รหัสแชตนี้ = ${id}\n(ผู้ดูแลระบบใช้ตั้ง TG_ADMIN_ID — ไม่ต้องทำอะไรถ้าไม่ใช่ผู้ดูแล)`); continue }
    if (cmd === 'list') { say(id, sub ? `📋 ${nowList(cat, sub)}\n(ติดตามตั้งแต่ ${String(sub.since).slice(0, 10)})\n\n/เลิก <ชื่อ> เลิกบางพื้นที่ · /เลิกทั้งหมด หยุดรับ` : 'ยังไม่ได้ติดตามพื้นที่ใด — พิมพ์ /ตาม ทับลาน (ดูรายชื่อด้วย /ช่วย)'); continue }
    if (cmd === 'stopall' || (cmd === 'unfollow' && ALL.includes(norm(arg)))) {
      if (sub) delete db.subs[id];
      say(id, sub ? '🔕 เลิกติดตามทั้งหมดแล้ว — จะไม่ได้รับข้อความส่วนตัวอีก (กลุ่มยังได้รับตามปกติ)\nพิมพ์ /ตาม <พื้นที่> เพื่อเริ่มใหม่' : 'ยังไม่ได้ติดตามพื้นที่ใดอยู่แล้ว');
      continue;
    }
    if (!arg) { say(id, `${cmd === 'follow' ? 'ระบุพื้นที่ที่จะติดตาม เช่น /ตาม ทับลาน' : 'ระบุพื้นที่ที่จะเลิก เช่น /เลิก ทับลาน'}\n\n${choices(cat).join('\n')}`); continue }
    const L = parseList(cat, arg);
    if (L.all) for (const a of cat.areas) if (!L.areas.includes(a.id)) L.areas.push(a.id);
    const nm = (ids, sts) => listNames(cat, { areas: ids, st: sts });
    const bad = L.bad.length ? `\n❓ ไม่รู้จัก: ${L.bad.join(', ')} — ดูรายชื่อด้วย /ช่วย` : '';
    if (cmd === 'follow') {
      if (!L.areas.length && !L.st.length) { say(id, `❓ ไม่รู้จักชื่อพื้นที่: ${L.bad.join(', ') || arg}\n\n${choices(cat).join('\n')}`); continue }
      const s = db.subs[id] || (db.subs[id] = { areas: [], st: [], since: new Date(now).toISOString() });
      const na = L.areas.filter(x => !s.areas.includes(x)), ns = L.st.filter(x => !s.st.includes(x));
      s.areas.push(...na); s.st.push(...ns);
      const had = nm(L.areas.filter(x => !na.includes(x)), L.st.filter(x => !ns.includes(x)));
      say(id, [na.length || ns.length ? `✅ ติดตามแล้ว: ${nm(na, ns).join(', ')}` : 'ติดตามอยู่แล้ว', ...(had.length && (na.length || ns.length) ? [`(ติดตามอยู่แล้ว: ${had.join(', ')})`] : [])].join('\n') + bad +
        `\n\n${nowList(cat, s)}\nจะได้รับข้อความเมื่อพบจุดความร้อนใหม่ในพื้นที่เหล่านี้${L.areas.includes('dy') ? ' (รวม ขสป.ดงใหญ่ ซึ่งข้อความกลุ่มไม่รวม)' : ''}\n${HOWTO}`);
    } else {
      if (!sub) { say(id, 'ยังไม่ได้ติดตามพื้นที่ใด'); continue }
      if (!L.areas.length && !L.st.length) { say(id, `❓ ไม่รู้จักชื่อพื้นที่: ${L.bad.join(', ') || arg}\n${nowList(cat, sub)}`); continue }
      const ra = L.areas.filter(x => sub.areas.includes(x)), rs = L.st.filter(x => sub.st.includes(x));
      sub.areas = sub.areas.filter(x => !ra.includes(x)); sub.st = sub.st.filter(x => !rs.includes(x));
      if (!sub.areas.length && !sub.st.length) delete db.subs[id];
      const miss = nm(L.areas.filter(x => !ra.includes(x)), L.st.filter(x => !rs.includes(x)));
      say(id, [ra.length || rs.length ? `🔕 เลิกติดตาม: ${nm(ra, rs).join(', ')}` : 'ไม่ได้ติดตามพื้นที่นี้อยู่', ...(miss.length && (ra.length || rs.length) ? [`(ไม่ได้ติดตามอยู่: ${miss.join(', ')})`] : [])].join('\n') + bad + `\n\n${nowList(cat, db.subs[id])}`);
    }
  }
  return { replies: out, stats };
}

// จุดใหม่ของแต่ละผู้สมัคร (พื้นที่อนุรักษ์ _ar หรือสถานีฯ _st ตรงกับที่สมัคร — จุดเดียวกันไม่ซ้ำ) → [{chat, pts, names}]
function targets(db, pts, cat) {
  const out = [];
  for (const [chat, s] of Object.entries(db.subs || {})) {
    const ks = new Set(cat.areas.filter(a => (s.areas || []).includes(a.id)).map(a => a.k)), ss = new Set(s.st || []);
    const P = pts.filter(f => ks.has(f.properties._ar) || ss.has(f.properties._st));
    if (P.length) out.push({ chat, pts: P, names: listNames(cat, s) });
  }
  return out;
}
// สรุปสาธารณะ (tg_notify.json บน Pages): จำนวนผู้สมัคร/ต่อพื้นที่ ไม่มีรหัสแชต
function pub(db, cat) {
  const S = Object.values(db.subs || {}), a = {};
  for (const x of cat.areas) { const n = S.filter(s => (s.areas || []).includes(x.id)).length; if (n) a[x.id] = n }
  const st = S.reduce((n, s) => n + ((s.st || []).length ? 1 : 0), 0);
  return { n: S.length, a, ...(st ? { st } : {}) };
}
// ล้างประวัติห้องที่เห็น (ใช้กับ --chats) เก่ากว่า keepD วัน
const pruneSeen = (db, now, keepD = 3) => { for (const k in db.seen || {}) if (now - db.seen[k][1] > keepD * 864e5) delete db.seen[k] };
// ตัวจำกัดอัตรา: ≥ 1000/rate ms ระหว่างข้อความ (เพดาน Bot API ~30 ข้อความ/วินาที รวมทุกแชต — ใช้ 25)
function limiter(rate = 25, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  const gap = 1000 / rate; let last = -Infinity;
  return async () => { const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now() };
}

module.exports = { catalog, resolve, parseList, parseCmd, processUpdates, targets, pub, pruneSeen, limiter, helpText, listNames, norm, DY };
