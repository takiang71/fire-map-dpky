// F6 (18 พ.ย. 69) สมัครรับแจ้งเตือน Telegram รายพื้นที่ทางแชตส่วนตัว — scripts/lib/tgsubs.js + telegram_notify.js กับ Telegram Bot API จำลอง
//  (เซิร์ฟเวอร์ในเทสต์ ไม่ต่อเน็ต ไม่ส่งข้อความจริง) · สมัคร/เลิก/รายการ/คำสั่งในกลุ่ม/ชื่อสะกดต่าง/DM เฉพาะพื้นที่/บล็อกบอท/ไม่ซ้ำ/offset ข้ามรอบ/getUpdates ล้ม/TG_SUBS=off
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process'), { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..'), SCRIPT = path.join(ROOT, 'scripts', 'telegram_notify.js');
const TS = require('../scripts/lib/tgsubs');
const STN = ['สถานีควบคุมไฟป่าทับลาน', 'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)', 'สถานีควบคุมไฟป่าเขาใหญ่', 'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)', 'สถานีควบคุมไฟป่าวังน้ำเขียว', 'สถานีควบคุมไฟป่าตาพระยา - ปางสีดา', 'สถานีควบคุมไฟป่าดงใหญ่'];
let CAT;
const cat = async () => CAT || (CAT = TS.catalog((await import(pathToFileURL(path.join(ROOT, 'worker', 'line-webhook.mjs')).href)).AREAS, STN));
const R = (c, q) => { const r = TS.resolve(c, q); return r ? r.a ? r.a.id : r.s ? r.s.k : 'all' : null };

test('ชื่อพื้นที่สะกดต่างกันได้: ชื่อ/อช./ชื่อเต็ม/รหัส/อังกฤษ/พิมพ์ผิด 1 ตัว/สถานีฯ', async () => {
  const c = await cat();
  for (const q of ['ทับลาน', 'อช.ทับลาน', 'อช. ทับลาน', 'อุทยานแห่งชาติทับลาน', 'tl', 'TL', 'thaplan', 'ทับลาณ']) assert.equal(R(c, q), 'tl', q);
  assert.equal(R(c, 'ดงใหญ่'), 'dy', 'ดงใหญ่สมัครได้'); assert.equal(R(c, 'ขสป.ดงใหญ่'), 'dy');
  assert.equal(R(c, 'ขห.โคกสูง'), 'ks'); assert.equal(R(c, 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)'), 'kc');
  assert.equal(R(c, 'ตาพระยา'), 'tp'); assert.equal(R(c, 'ปางสีดา'), 'ps'); assert.equal(R(c, 'ky'), 'ky');
  assert.equal(R(c, 'สถานีฯ ทับลาน'), 'สถานีควบคุมไฟป่าทับลาน', 'มีคำว่าสถานี = สถานีฯ ไม่ใช่ อช.');
  assert.equal(R(c, 'สถานีดงใหญ่'), 'สถานีควบคุมไฟป่าดงใหญ่');
  assert.equal(R(c, 'ทับลานใต้'), 'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)');
  assert.equal(R(c, 'สถานีเขาใหญ่ ด้านทิศใต้'), 'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)');
  assert.equal(R(c, 'วังน้ำเขียว'), 'สถานีควบคุมไฟป่าวังน้ำเขียว', 'ชื่อที่มีแต่สถานีฯ ไม่ต้องใส่ "สถานี"');
  assert.equal(R(c, 'ตาพระยา-ปางสีดา'), 'สถานีควบคุมไฟป่าตาพระยา - ปางสีดา');
  assert.equal(R(c, 'ทั้งหมด'), 'all');
  assert.equal(R(c, 'เขา'), null, 'กำกวม (เขาใหญ่/เขาฉกรรจ์)'); assert.equal(R(c, 'หมูเด้ง'), null);
  assert.deepEqual(TS.parseList(c, 'ทับลาน เขาใหญ่'), { areas: ['tl', 'ky'], st: [], all: 0, bad: [] });
  assert.deepEqual(TS.parseList(c, 'อช. ทับลาน, สถานี วังน้ำเขียว'), { areas: ['tl'], st: ['สถานีควบคุมไฟป่าวังน้ำเขียว'], all: 0, bad: [] });
  assert.deepEqual(TS.parseList(c, 'tl ky dy tl'), { areas: ['tl', 'ky', 'dy'], st: [], all: 0, bad: [] }, 'ซ้ำนับครั้งเดียว');
  assert.deepEqual(TS.parseList(c, 'ทับลาน และ ปางสีดา หมูเด้ง'), { areas: ['tl', 'ps'], st: [], all: 0, bad: ['หมูเด้ง'] });
});

test('แยกคำสั่ง: / ไม่บังคับเว้นวรรค · ไม่มี / ต้องเว้นวรรค · @ชื่อบอท · เลิกทั้งหมด ก่อน เลิก', () => {
  const P = t => { const p = TS.parseCmd(t); return p && [p.cmd, p.arg] };
  assert.deepEqual(P('/ตาม ทับลาน'), ['follow', 'ทับลาน']); assert.deepEqual(P('/ตามทับลาน'), ['follow', 'ทับลาน']);
  assert.deepEqual(P('ตาม ทับลาน'), ['follow', 'ทับลาน']); assert.equal(P('ตามนั้นครับ'), null);
  assert.deepEqual(P('/ตาม@mock_bot tl'), ['follow', 'tl']); assert.deepEqual(P('/ติดตาม ky'), ['follow', 'ky']);
  assert.deepEqual(P('/เลิกทั้งหมด'), ['stopall', '']); assert.deepEqual(P('/เลิก ทับลาน'), ['unfollow', 'ทับลาน']);
  assert.deepEqual(P('/รายการ'), ['list', '']); assert.deepEqual(P('/ช่วย'), ['help', '']); assert.deepEqual(P('/LIST'), ['list', '']);
  assert.deepEqual(P('/start'), ['help', '']); assert.equal(TS.parseCmd('/start tl').start, true);
  assert.deepEqual(P('/รหัส'), ['id', '']); assert.equal(P('/stopwatch'), null); assert.equal(P('สวัสดี'), null);
});

test('processUpdates: ไม่เก็บชื่อ/username · /start <payload> สมัครทันที · กลุ่มตอบครั้งเดียว · บล็อกบอท (my_chat_member) ลบการสมัคร', async () => {
  const c = await cat(), db = {}, from = { id: 9, is_bot: false, first_name: 'สมชาย', username: 'somchai_x' };
  const pm = (id, uid, text) => ({ update_id: uid, message: { message_id: uid, from: { ...from, id }, chat: { id, type: 'private', first_name: 'สมชาย', username: 'somchai_x' }, date: 1, text } });
  const gm = (uid, text) => ({ update_id: uid, message: { message_id: uid, from, chat: { id: -100777, type: 'supergroup', title: 'กลุ่มลับ' }, date: 1, text } });
  const r = TS.processUpdates(db, [pm(5, 1, '/start tl-ky'), gm(2, '/ตาม ทับลาน'), gm(3, '/รายการ'), gm(4, '/start@mock_bot'), pm(6, 5, '/ตาม ทับลาน'), { update_id: 6, my_chat_member: { chat: { id: 6, type: 'private' }, new_chat_member: { status: 'kicked' } } }], c, 1000);
  assert.equal(db.offset, 7);
  assert.deepEqual(db.subs['5'].areas, ['tl', 'ky']);
  assert.equal(db.subs['6'], undefined, 'บล็อกบอทหลังสมัคร = ลบ');
  assert.equal(r.replies.filter(x => x.chat_id === '-100777').length, 1, 'กลุ่ม: ตอบครั้งเดียว ไม่ตอบ /start');
  assert.match(r.replies.find(x => x.chat_id === '-100777').text, /เฉพาะแชตส่วนตัว/);
  assert.equal(r.stats.kicked, 1);
  const j = JSON.stringify(db);
  assert.ok(!/สมชาย|somchai|กลุ่มลับ/.test(j), 'ไม่เก็บชื่อ/username/ชื่อกลุ่ม: ' + j);
  assert.deepEqual(TS.pub(db, c), { n: 1, a: { ky: 1, tl: 1 } });
});

test('limiter: ≤25 ข้อความ/วินาที (ห่าง ≥40 มิลลิวินาที)', async () => {
  const lim = TS.limiter(25), t0 = Date.now();
  for (let i = 0; i < 11; i++) await lim();
  assert.ok(Date.now() - t0 >= 380, 'ใช้เวลา ' + (Date.now() - t0));
});

// ---------- telegram_notify.js กับ Bot API จำลอง ----------
const TOKEN = 'TEST:mock', GROUP = '-1009990001';
const NOW = Date.parse('2027-01-17T14:00:00+07:00');   // นอกช่วงสรุปประจำวัน (และตั้ง TG_DAILY=off อีกชั้น)
const thFD = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const TL = 'อุทยานแห่งชาติทับลาน', KY = 'อุทยานแห่งชาติเขาใหญ่', DYK = 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', OUTA = 'นอกพื้นที่อนุรักษ์';
const pt = (id, la, lo, at, ar, st, sat = 'NOAA-20') => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] },
  properties: { ...(id ? { unique_id: id } : {}), full_date: thFD(at), satellite_name: sat, subdistrict_name_th: 'ต', district_name_th: 'อ', province_name_th: 'จ', _ar: ar, _st: st } });

// Bot API จำลอง: getUpdates (ยืนยัน update < offset แล้วลบ เหมือนของจริง) · sendMessage (บล็อก = 403) · getMe/getChat/getChatMemberCount
let Q = [], sent = [], calls = [], blocked = new Set(), guFail = 0;
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const J = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) };
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)/);
    if (!m || decodeURIComponent(m[1]) !== TOKEN) return J(401, { ok: false, error_code: 401, description: 'Unauthorized' });
    const b = body ? JSON.parse(body) : {}; calls.push([m[2], b]);
    if (m[2] === 'getMe') return J(200, { ok: true, result: { id: 1, is_bot: true, username: 'mock_bot' } });
    if (m[2] === 'getUpdates') {
      if (guFail) return J(409, { ok: false, error_code: 409, description: 'Conflict: can\'t use getUpdates method while webhook is active' });
      if (b.offset) Q = Q.filter(u => u.update_id >= b.offset);
      return J(200, { ok: true, result: Q.slice(0, b.limit || 100) });
    }
    if (m[2] === 'sendMessage') {
      if (blocked.has(String(b.chat_id))) return J(403, { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' });
      sent.push(b); return J(200, { ok: true, result: { message_id: sent.length } });
    }
    if (m[2] === 'getChat') return J(200, { ok: true, result: { id: b.chat_id, type: 'supergroup', title: 'ทดสอบ' } });
    if (m[2] === 'getChatMemberCount') return J(200, { ok: true, result: 3 });
    J(404, { ok: false, error_code: 404, description: 'Not Found' });
  });
});
let BASE, TMP;
test.before(async () => { await new Promise(r => srv.listen(0, '127.0.0.1', r)); BASE = `http://127.0.0.1:${srv.address().port}`; TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tgsubs-')) });
test.after(() => { srv.close(); try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (e) { } });

let UID = 0;
const pm = (id, text) => ({ update_id: ++UID, message: { message_id: UID, from: { id, is_bot: false, first_name: 'ผู้ทดสอบ', username: 'tester_u' }, chat: { id, type: 'private', first_name: 'ผู้ทดสอบ', username: 'tester_u' }, date: 1, text } });
const gm = (id, text) => ({ update_id: ++UID, message: { message_id: UID, from: { id: 5, is_bot: false, first_name: 'ผู้ทดสอบ' }, chat: { id, type: 'group', title: 'ห้องทดสอบลับ' }, date: 1, text } });
function setup(name, live, { seed = false } = {}) {
  const out = path.join(TMP, name, 'site'), sd = path.join(TMP, name, 'state');
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(out, 'live.json'), JSON.stringify({ type: 'FeatureCollection', features: live }));
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ fy: 2570, ind: 'NOAA-20', areas: {} }));
  if (!seed) fs.writeFileSync(path.join(sd, 'tg_notify.json'), JSON.stringify({ sent: {}, log: [], tg: { ok: 1, at: new Date(NOW).toISOString() }, updated: new Date(NOW - 3e5).toISOString() }));
  return { out, sd };
}
function run(d, now = NOW, env = {}) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [SCRIPT], { env: { ...process.env, TG_TOKEN: TOKEN, TG_CHAT_ID: GROUP, TG_API: BASE, NOTIFY_DIR: d.out, TG_NOW: String(now),
      STATE_DIR: d.sd, STATE_RAW: '', SITE_URL: 'https://example.test/', TG_DAILY: 'off', TG_BURN: 'off', TG_REP: 'off', TG_MREP: 'off', TG_SUBS: '', ...env } });
    let o = ''; p.stdout.on('data', x => o += x); p.stderr.on('data', x => o += x);
    p.on('error', rej); p.on('close', code => res({ code, out: o }));
  });
}
// รอบถัดไป: tg_notify.json ที่เขียนออก _site กลายเป็นสถานะเดิม (site.yml save/load state) · tg_subs.json อยู่ใน STATE_DIR อยู่แล้ว
const carry = d => fs.copyFileSync(path.join(d.out, 'tg_notify.json'), path.join(d.sd, 'tg_notify.json'));
const subsOf = d => JSON.parse(fs.readFileSync(path.join(d.sd, 'tg_subs.json'), 'utf8'));
const tnOf = d => JSON.parse(fs.readFileSync(path.join(d.out, 'tg_notify.json'), 'utf8'));
const to = id => sent.filter(m => String(m.chat_id) === String(id));
const ALR = /พบจุดความร้อนใหม่ \d+ จุด/, alerts = id => to(id).filter(m => ALR.test(m.text));
const nPts = m => +m.text.match(/พบจุดความร้อนใหม่ (\d+) จุด/)[1];
const getUp = () => calls.filter(c => c[0] === 'getUpdates');

test('telegram_notify: สมัคร → DM เฉพาะพื้นที่ (ดงใหญ่ได้) · กลุ่มไม่รวมดงใหญ่ · เลิก/รายการ/บล็อกบอท · offset ต่อเนื่อง · ไม่ซ้ำ', async () => {
  Q = []; sent = []; calls = []; blocked = new Set(); guFail = 0;
  const A = 7001, B = 7002, C = 7003, D = 7004, E = 7005, F = 7006, G = -1007770001;
  const p1 = pt('p1', 14.20, 102.10, NOW - 30 * 6e4, TL, 'สถานีควบคุมไฟป่าทับลาน');
  const p2 = pt('p2', 14.40, 101.40, NOW - 30 * 6e4, KY, 'สถานีควบคุมไฟป่าเขาใหญ่');
  const p3 = pt('p3', 14.80, 102.30, NOW - 30 * 6e4, DYK, 'สถานีควบคุมไฟป่าดงใหญ่');
  const p4 = pt('p4', 14.25, 102.15, NOW - 20 * 36e5, TL, 'สถานีควบคุมไฟป่าทับลาน');   /* เก่า 20 ชม. ไม่แจ้ง */
  const p5 = pt('p5', 14.35, 101.90, NOW - 40 * 6e4, OUTA, 'สถานีควบคุมไฟป่าวังน้ำเขียว');
  const d = setup('main', [p1, p2, p3, p4, p5]);
  Q.push(pm(A, '/ตาม ทับลาน'), pm(B, '/ตาม อช. เขาใหญ่, สถานีวังน้ำเขียว'), pm(C, '/ตาม tl ดงใหญ่'), gm(G, '/ตาม ทับลาน'), gm(G, '/start@mock_bot'), gm(G, '/รายการ'),
    pm(D, 'ตาม ทับลาณ'), pm(E, 'สวัสดี'), pm(F, '/ตาม หมูเด้ง'));
  const r = await run(d); assert.equal(r.code, 0, r.out);
  // กลุ่ม: กติกาเดิม (ไม่รวมดงใหญ่ ไม่รวมจุดเก่า)
  assert.equal(alerts(GROUP).length, 1, r.out); assert.equal(nPts(alerts(GROUP)[0]), 3);
  assert.ok(!/ตามที่คุณติดตาม/.test(alerts(GROUP)[0].text));
  // คำตอบยืนยันทุกคำสั่ง
  assert.match(to(A).find(m => !ALR.test(m.text)).text, /✅ ติดตามแล้ว: อช\.ทับลาน/);
  assert.match(to(B)[0].text, /✅ ติดตามแล้ว: อช\.เขาใหญ่, สถานีฯ วังน้ำเขียว/);
  assert.match(to(C)[0].text, /ขสป\.ดงใหญ่ ซึ่งข้อความกลุ่มไม่รวม/);
  assert.match(to(D)[0].text, /✅ ติดตามแล้ว: อช\.ทับลาน/, 'สะกดผิด 1 ตัว ไม่มี /');
  assert.match(to(E)[0].text, /ไม่เข้าใจคำสั่ง/); assert.match(to(F)[0].text, /ไม่รู้จักชื่อพื้นที่: หมูเด้ง/);
  assert.equal(to(G).length, 1, 'กลุ่ม: ตอบครั้งเดียว'); assert.match(to(G)[0].text, /เฉพาะแชตส่วนตัว/);
  assert.equal(to(G)[0].reply_parameters.message_id, 4);
  // DM เฉพาะพื้นที่ที่สมัคร
  assert.deepEqual([A, B, C, D, E, F].map(x => alerts(x).length), [1, 1, 1, 1, 0, 0]);
  assert.equal(nPts(alerts(A)[0]), 1); assert.match(alerts(A)[0].text, /ตามที่คุณติดตาม: อช\.ทับลาน/);
  assert.equal(nPts(alerts(B)[0]), 2, 'เขาใหญ่ + จุดนอกเขตในความรับผิดชอบสถานีฯ วังน้ำเขียว');
  assert.equal(nPts(alerts(C)[0]), 2); assert.match(alerts(C)[0].text, /🌲 <b>ขสป\.ดงใหญ่<\/b> 1 จุด/);
  assert.match(alerts(C)[0].text, /\/เลิกทั้งหมด หยุดรับ/);
  // สถานะ: offset · ไม่มีชื่อ · ไม่ขึ้น _site
  let db = subsOf(d);
  assert.equal(db.offset, UID + 1);
  assert.deepEqual(Object.keys(db.subs).sort(), [A, B, C, D].map(String));
  assert.ok(!/ผู้ทดสอบ|tester_u|ห้องทดสอบลับ/.test(JSON.stringify(db)), 'ไม่เก็บชื่อ/username');
  assert.ok(!fs.existsSync(path.join(d.out, 'tg_subs.json')), 'tg_subs.json ไม่อยู่ใน _site (Pages)');
  let tn = tnOf(d);
  assert.equal(tn.subs.n, 4); assert.equal(tn.subs.gu.ok, 1);
  assert.ok(!JSON.stringify(tn).includes(String(A)), 'tg_notify.json (สาธารณะ) ไม่มีรหัสแชตผู้สมัคร');

  // รอบ 2 (+5 นาที): /รายการ /เลิก /เลิกทั้งหมด · D บล็อกบอท · จุดใหม่ p6 ทับลาน + p1 ซ้ำ + p1 จาก FIRMS (ห่าง ~70 ม. ไม่มี unique_id)
  carry(d); sent = []; calls = []; blocked = new Set([String(D)]);
  const N2 = NOW + 3e5, p6 = pt('p6', 14.22, 102.30, N2 - 10 * 6e4, TL, 'สถานีควบคุมไฟป่าทับลาน');
  const p1f = pt(null, 14.2006, 102.1004, NOW - 29 * 6e4, TL, 'สถานีควบคุมไฟป่าทับลาน', 'N20');
  fs.writeFileSync(path.join(d.out, 'live.json'), JSON.stringify({ type: 'FeatureCollection', features: [p1, p1f, p2, p3, p5, p6] }));
  const u0 = UID;
  Q.push(pm(A, '/รายการ'), pm(B, '/เลิก เขาใหญ่'), pm(C, '/เลิกทั้งหมด'));
  const r2 = await run(d, N2); assert.equal(r2.code, 0, r2.out);
  assert.equal(getUp()[0][1].offset, u0 + 1, 'offset ต่อจากรอบก่อน');
  assert.equal(nPts(alerts(GROUP)[0]), 1, 'กลุ่ม: p6 เท่านั้น (p1/FIRMS ไม่ซ้ำ)');
  assert.equal(alerts(A).length, 1); assert.equal(nPts(alerts(A)[0]), 1, 'A: p6 เท่านั้น');
  assert.match(to(A)[0].text, /ตอนนี้ติดตาม 1 รายการ: อช\.ทับลาน/);
  assert.match(to(B)[0].text, /🔕 เลิกติดตาม: อช\.เขาใหญ่/); assert.match(to(B)[0].text, /สถานีฯ วังน้ำเขียว/);
  assert.equal(alerts(B).length, 0); assert.match(to(C)[0].text, /เลิกติดตามทั้งหมดแล้ว/); assert.equal(alerts(C).length, 0);
  assert.equal(to(D).length, 0);
  db = subsOf(d); tn = tnOf(d);
  assert.deepEqual(Object.keys(db.subs).sort(), [A, B].map(String), 'C เลิก · D บล็อกบอท (403) = ลบ');
  assert.equal(tn.log.find(l => l.subs).blocked, 1);

  // รอบ 3: ไม่มีคำสั่ง/จุดใหม่ → ไม่ส่งอะไร offset เดิม
  carry(d); sent = []; calls = [];
  const r3 = await run(d, N2 + 3e5); assert.equal(r3.code, 0, r3.out);
  assert.equal(sent.length, 0); assert.equal(getUp()[0][1].offset, UID + 1);

  // รอบ 4–5: getUpdates ล้ม (409 webhook) → gu.ok 0 + since คงเดิม · DM ตามการสมัครเดิมยังส่ง · health `tgs`
  carry(d); sent = []; guFail = 1;
  const N4 = N2 + 6e5, p7 = pt('p7', 14.23, 102.35, N4 - 5 * 6e4, TL, 'สถานีควบคุมไฟป่าทับลาน');
  fs.writeFileSync(path.join(d.out, 'live.json'), JSON.stringify({ type: 'FeatureCollection', features: [p6, p7] }));
  const r4 = await run(d, N4); assert.equal(r4.code, 0, r4.out);
  assert.equal(alerts(A).length, 1, 'getUpdates ล้มแต่ยัง DM'); assert.equal(subsOf(d).offset, UID + 1, 'offset ไม่เปลี่ยน');
  tn = tnOf(d); assert.equal(tn.subs.gu.ok, 0); assert.match(tn.subs.gu.why, /webhook/);
  carry(d); sent = [];
  await run(d, N4 + 70 * 6e4);
  tn = tnOf(d); assert.equal(tn.subs.gu.since, new Date(N4).toISOString(), 'since = เวลาที่เริ่มล้ม');
  const H = require('../scripts/health'); delete require.cache[require.resolve('../scripts/lib/state')];   /* chkTgs รับเวลาเป็นพารามิเตอร์ (ไม่พึ่ง HEALTH_NOW ของ health.test.js) */
  assert.match(H.chkTgs(tn, N4 + 70 * 6e4), /webhook.*ล้มตั้งแต่.*1\.2 ชม\./);
  assert.equal(H.CHECKS.tgs[1], 36e5, 'แจ้งเมื่อต่อเนื่อง 1 ชม.');
  assert.equal(H.chkTgs({ subs: { gu: { ok: 1 } } }), null); assert.equal(H.chkTgs({ subs: { off: 1 } }), null);
  // กลับมาปกติ
  carry(d); guFail = 0; await run(d, N4 + 75 * 6e4);
  assert.equal(tnOf(d).subs.gu.ok, 1);
});

test('telegram_notify: TG_SUBS=off ไม่เรียก getUpdates ไม่ DM · รอบแรก (seed) ตอบคำสั่งแต่ไม่ DM · tg_subs.json เสีย = ข้ามไม่เขียนทับ', async () => {
  Q = []; sent = []; calls = []; blocked = new Set(); guFail = 0;
  const p1 = pt('q1', 14.20, 102.10, NOW - 30 * 6e4, TL, 'สถานีควบคุมไฟป่าทับลาน');
  const d = setup('off', [p1]);
  fs.writeFileSync(path.join(d.sd, 'tg_subs.json'), JSON.stringify({ offset: 5, subs: { 8001: { areas: ['tl'], st: [], since: '2027-01-01' } } }));
  Q.push(pm(8002, '/ตาม ทับลาน'));
  const r = await run(d, NOW, { TG_SUBS: 'off' }); assert.equal(r.code, 0, r.out);
  assert.equal(getUp().length, 0); assert.equal(to(8001).length, 0); assert.equal(alerts(GROUP).length, 1, 'กลุ่มยังส่ง');
  assert.equal(tnOf(d).subs.off, 1);

  sent = []; calls = [];
  const s = setup('seed', [p1], { seed: true });
  fs.writeFileSync(path.join(s.sd, 'tg_subs.json'), JSON.stringify({ offset: 0, subs: { 8001: { areas: ['tl'], st: [], since: '2027-01-01' } } }));
  const r2 = await run(s); assert.equal(r2.code, 0, r2.out);
  assert.equal(sent.filter(m => ALR.test(m.text)).length, 0, 'seed: ไม่ส่งจุดเก่า');
  assert.match(to(8002)[0].text, /ติดตามแล้ว/, 'แต่ยังตอบคำสั่ง');

  sent = []; calls = [];
  const b = setup('bad', [p1]);
  fs.writeFileSync(path.join(b.sd, 'tg_subs.json'), '{เสีย');
  const r3 = await run(b); assert.equal(r3.code, 0, r3.out);
  assert.equal(getUp().length, 0, 'ไม่อ่านคำสั่ง (offset หาย = ยืนยันผิด)');
  assert.equal(fs.readFileSync(path.join(b.sd, 'tg_subs.json'), 'utf8'), '{เสีย', 'ไม่เขียนทับ');
  assert.match(tnOf(b).log[0].why, /อ่านการสมัครไม่ได้/);
});
