// A7 (17 พ.ย. 69) line_notify.js กับ LINE API จำลอง (เซิร์ฟเวอร์ในเทสต์ ไม่ต่อเน็ต ไม่ส่งเข้ากลุ่มจริง)
//  · LINE_MODE=all (ไม่ตั้ง) / daily (+TG_INVITE) / โควตาไม่พอ / --validate · log ใน notify.json บอกสาเหตุ (mode/โควตา/ไม่มีจุดใหม่ รวมรอบซ้ำ)
//  · ขนาด carousel กรณีหนักสุด (สรุปประจำวันครบทุกกล่อง + ทุกพื้นที่มีจุด + บรรทัด Telegram) < 48,000 ไบต์
// รันสคริปต์จริงด้วย child_process แบบ async (เซิร์ฟเวอร์จำลองอยู่ใน process ของเทสต์ — execFileSync จะบล็อก event loop)
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process'), { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..'), SCRIPT = path.join(ROOT, 'scripts', 'line_notify.js');
const GROUP = 'Cmockgroup0000000000000000000000';
const INVITE = 'https://t.me/+AbCdEf123_-x';

// เวลาจำลอง: 17 ม.ค. 2570 07:30 น. ไทย (ในช่วงส่งสรุปประจำวัน 07:00–11:00)
const NOW = Date.parse('2027-01-17T07:30:00+07:00');
const thFD = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const today = new Date(NOW + 7 * 36e5).toISOString().slice(0, 10), yday = new Date(NOW + 7 * 36e5 - 864e5).toISOString().slice(0, 10);
const pt = (id, la, lo, agoMin, ar = 'อุทยานแห่งชาติทับลาน') => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] },
  properties: { unique_id: id, full_date: thFD(NOW - agoMin * 6e4), satellite_name: 'NOAA-20', subdistrict_name_th: 'บุพราหมณ์', district_name_th: 'นาดี', province_name_th: 'ปราจีนบุรี', _ar: ar, _st: 'สถานีควบคุมไฟป่าทับลาน' } });

// LINE API จำลอง: quota / consumption / members / push / validate (ตรวจขนาด ≤50,000 ไบต์ + สี #RRGGBB(AA) + uri https)
let Q = { limit: 300, used: 0, members: 3 }, pushes = [], validated = [];
const COL = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
function checkMsg(m) {
  const errs = [], b = Buffer.byteLength(JSON.stringify(m));
  if (m.type === 'flex' && b > 50000) errs.push('flex เกิน 50 KB: ' + b);
  const walk = o => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) {
    if (/color$/i.test(k) && typeof v === 'string' && !COL.test(v)) errs.push('สีผิดรูปแบบ ' + v);
    if (k === 'uri' && !/^https?:\/\//.test(v)) errs.push('uri ผิด ' + v);
    walk(v) } };
  walk(m); return errs;
}
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const J = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) };
    if (req.headers.authorization !== 'Bearer test-token') return J(401, { message: 'Authentication failed' });
    const u = req.url.split('?')[0];
    if (u === '/v2/bot/message/quota') return J(200, { type: 'limited', value: Q.limit });
    if (u === '/v2/bot/message/quota/consumption') return J(200, { totalUsage: Q.used });
    if (u === `/v2/bot/group/${GROUP}/members/count`) return J(200, { count: Q.members });
    if (u === '/v2/bot/message/push' || u === '/v2/bot/message/validate/push') {
      const b = JSON.parse(body), errs = b.messages.flatMap(checkMsg);
      if (errs.length) return J(400, { message: 'invalid', details: errs });
      if (u.endsWith('validate/push')) { validated.push(b); return J(200, {}) }
      if (Q.limit - Q.used < Q.members) return J(429, { message: 'You have reached your monthly limit.' });
      Q.used += Q.members; pushes.push(b); return J(200, {});
    }
    J(404, { message: 'not found' });
  });
});
let BASE, TMP;
test.before(async () => { await new Promise(r => srv.listen(0, '127.0.0.1', r)); BASE = `http://127.0.0.1:${srv.address().port}`; TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'linetest-')) });
test.after(() => { srv.close(); try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (e) { } });

// โฟลเดอร์ _site จำลอง + สถานะเดิมใน STATE_DIR (ไม่ใช่ seed: มี sent, burn รอบก่อน, สรุปวันนี้ยังไม่ส่ง)
function setup(name, { live = [pt('a1', 14.20, 102.10, 30), pt('a2', 14.21, 102.11, 30)], state } = {}) {
  const out = path.join(TMP, name, 'site'), sd = path.join(TMP, name, 'state');
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(out, 'live.json'), JSON.stringify({ type: 'FeatureCollection', features: live }));
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ fy: 2570, ind: 'NOAA-20', areas: {} }));
  fs.writeFileSync(path.join(out, 'burn_summary.json'), JSON.stringify({ p: '20270101_20270107', d0: '20270101', d1: '20270107', rai: 12.5, hs: 3, radius_m: 1000, fy: 2570, fy_rai: 40, ar: { 'อุทยานแห่งชาติทับลาน': 12.5 }, areas: {} }));
  fs.writeFileSync(path.join(sd, 'notify.json'), JSON.stringify(state || { sent: {}, days: {}, log: [], burn: '20261225_20261231', daily: yday, updated: new Date(NOW - 3e5).toISOString() }));
  return { out, sd };
}
function run(dirs, env = {}, args = [], now = NOW) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, LINE_TOKEN: 'test-token', LINE_GROUP_ID: GROUP, LINE_API: BASE, LINE_OUT: dirs.out, LINE_NOW: String(now),
      STATE_DIR: dirs.sd, STATE_RAW: '', SITE_URL: BASE + '/site/', LINE_MODE: '', TG_INVITE: '', LINE_DAILY: '', LINE_BURN: '', LINE_MAX_DAY: '', LINE_RESERVE: '', ...env } });
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('error', rej); p.on('close', code => res({ code, out: o }));
  });
}
const readSt = d => JSON.parse(fs.readFileSync(path.join(d.out, 'notify.json'), 'utf8'));
// รอบถัดไป: สถานะที่เขียนออกมาใน _site กลายเป็นสถานะเดิม (เหมือน workflow site บันทึกลง branch state)
const carry = d => fs.copyFileSync(path.join(d.out, 'notify.json'), path.join(d.sd, 'notify.json'));
const isCarousel = m => m.type === 'flex' && m.contents.type === 'carousel';
const hasTg = m => JSON.stringify(m.contents.contents[0]).includes(INVITE);

test('LINE_MODE ไม่ตั้ง (= all): ส่งแจ้งเตือนจุดใหม่ทันที เหมือนเดิม · สรุป/เผาไหม้รอรอบถัดไป', async () => {
  Q = { limit: 300, used: 0, members: 3 }; pushes = [];
  const d = setup('all'), r = await run(d);
  assert.equal(r.code, 0, r.out);
  assert.equal(pushes.length, 1, r.out);
  const m = pushes[0].messages[0];
  assert.ok(isCarousel(m) && /พบจุดความร้อนใหม่ 2 จุด/.test(m.altText), m.altText);
  assert.ok(!JSON.stringify(m).includes('Telegram'), 'โหมด all ไม่มีบรรทัด Telegram');
  const st = readSt(d);
  assert.equal(st.days[today], 1); assert.equal(st.log[0].ok, 1); assert.equal(st.log[0].n, 2);
  assert.equal(st.last.mode, 'all'); assert.equal(st.last.alert, 'ส่งแล้ว');
  // รอบถัดไป 5 นาที: ไม่มีจุดใหม่ → ส่งสรุปประจำวัน (เผาไหม้รอรอบต่อไป)
  carry(d); pushes = [];
  const r2 = await run(d, {}, [], NOW + 3e5); assert.equal(r2.code, 0, r2.out);
  assert.equal(pushes.length, 1); assert.ok(/สรุปประจำวัน/.test(pushes[0].messages[0].altText));
  const s2 = readSt(d); assert.equal(s2.daily, today); assert.equal(s2.last.alert, 'ไม่มีจุดใหม่');
  assert.equal(s2.log.find(l => l.why === 'ไม่มีจุดใหม่').why, 'ไม่มีจุดใหม่');
});

test('LINE_MODE=daily + TG_INVITE: ไม่ส่งจุดใหม่ (log บอก mode) · ส่งสรุปประจำวันมีบรรทัด Telegram · รอบถัดไปส่งการ์ดเผาไหม้', async () => {
  Q = { limit: 300, used: 0, members: 3 }; pushes = [];
  const d = setup('daily'), env = { LINE_MODE: 'daily', TG_INVITE: INVITE };
  const r = await run(d, env); assert.equal(r.code, 0, r.out);
  assert.equal(pushes.length, 1, 'push เดียว = สรุปประจำวัน');
  const m = pushes[0].messages[0];
  assert.ok(/สรุปประจำวัน/.test(m.altText), m.altText);
  assert.ok(hasTg(m), 'ใบ 1 มีลิงก์เชิญ Telegram');
  assert.ok(JSON.stringify(m.contents.contents[0]).includes('แจ้งเตือนจุดใหม่ทันทีดูที่ Telegram'));
  assert.ok(JSON.stringify(m.contents.contents[0]).includes('LINE ส่งได้อีก'), 'ท้ายการ์ดเขียนส่งได้อีก แทนแจ้งเตือนได้อีก');
  let st = readSt(d);
  const a = st.log.find(l => l.mode === 'daily' && l.n === 2);
  assert.ok(a && /LINE_MODE=daily/.test(a.why), JSON.stringify(st.log));
  assert.ok(Object.keys(st.sent).length >= 2, 'จุดถูกจำว่าเห็นแล้ว (สลับกลับเป็น all จะไม่ส่งย้อนหลัง)');
  assert.equal(st.days[today] || 0, 0, 'แจ้งเตือนไม่ถูกนับ'); assert.equal(st.daily, today);
  assert.equal(st.last.mode, 'daily'); assert.match(st.last.alert, /LINE_MODE=daily/); assert.equal(st.last.daily, 'ส่งแล้ว');
  // รอบถัดไป: การ์ดเผาไหม้รอบใหม่
  carry(d); pushes = [];
  const r2 = await run(d, env, [], NOW + 3e5); assert.equal(r2.code, 0, r2.out);
  assert.equal(pushes.length, 1, pushes.map(p => p.messages.map(m => m.altText || m.text).join(' | ')).join(' || ') + r2.out); assert.ok(/พื้นที่เผาไหม้/.test(pushes[0].messages[0].altText));
  st = readSt(d); assert.equal(st.burn, '20270101_20270107'); assert.equal(st.last.burn, 'ส่งแล้ว');
  // ไม่มีจุดใหม่ 2 รอบติดกัน → log รายการเดียว x = 2
  carry(d); pushes = []; await run(d, env, [], NOW + 6e5);
  carry(d); await run(d, env, [], NOW + 9e5);
  st = readSt(d); assert.equal(pushes.length, 0);
  assert.equal(st.log[0].why, 'ไม่มีจุดใหม่'); assert.equal(st.log[0].x, 2); assert.equal(st.log[0].t0, new Date(NOW + 6e5).toISOString());
  /* รายการ "ไม่มีจุดใหม่" ของรอบ +5 นาที อยู่ใต้รายการเผาไหม้ (ส่งแล้ว) จึงไม่ถูกรวม = 2 รายการ ไม่ใช่ 3 */
  assert.equal(st.log.filter(l => l.why === 'ไม่มีจุดใหม่').length, 2);
  // จุดใหม่ในโหมด daily → ไม่ส่ง
  fs.writeFileSync(path.join(d.out, 'live.json'), JSON.stringify({ type: 'FeatureCollection', features: [pt('a3', 14.3, 102.2, 10)] }));
  carry(d); await run(d, env, [], NOW + 12e5);
  assert.equal(pushes.length, 0, 'โหมด daily ไม่ส่งจุดใหม่'); assert.equal(readSt(d).log[0].mode, 'daily');
});

test('LINE_MODE=daily ไม่ตั้ง TG_INVITE / TG_INVITE ผิด = ไม่มีบรรทัด Telegram · all + TG_INVITE ก็ไม่มี', async () => {
  for (const [nm, env] of [['d-noinv', { LINE_MODE: 'daily' }], ['d-bad', { LINE_MODE: 'DAILY', TG_INVITE: 'https://evil.example/t.me/x' }], ['all-inv', { LINE_MODE: 'all', TG_INVITE: INVITE }]]) {
    Q = { limit: 300, used: 0, members: 3 }; pushes = [];
    const d = setup(nm, { live: [] }), r = await run(d, env); assert.equal(r.code, 0, r.out);
    assert.equal(pushes.length, 1, nm + ' ส่งสรุปประจำวัน');
    assert.ok(!JSON.stringify(pushes[0]).includes('Telegram'), nm);
    if (nm === 'd-bad') { assert.match(r.out, /TG_INVITE ไม่ใช่ลิงก์/); assert.equal(readSt(d).last.mode, 'daily', 'DAILY ตัวใหญ่ก็ได้') }
  }
});

test('โควตาไม่พอ: ไม่ push เลย · log บอกเหลือ/ต้องใช้ ทั้งแจ้งเตือน สรุป และเผาไหม้', async () => {
  Q = { limit: 300, used: 299, members: 3 }; pushes = [];
  const d = setup('quota'), r = await run(d); assert.equal(r.code, 0, r.out);
  assert.equal(pushes.length, 0);
  const st = readSt(d), w = st.log.filter(l => l.quota === 1);
  assert.equal(w.length, 3, JSON.stringify(st.log));
  for (const l of w) assert.match(l.why, /โควตาไม่พอ \(เหลือ 1 ข้อความ · ส่ง 1 ครั้งใช้ 3 = จำนวนสมาชิก\)/);
  assert.ok(w.some(l => l.daily) && w.some(l => l.burn) && w.some(l => l.n === 2));
  assert.equal(st.daily, today, 'โควตาไม่พอ = ข้ามสรุปทั้งวัน'); assert.equal(st.burn, '20270101_20270107', 'ข้ามรอบเผาไหม้นี้');
  assert.match(st.last.alert, /โควตาไม่พอ/);
  // โหมด daily โควตาไม่พอ: แจ้งเตือนเป็นเหตุ mode ไม่ใช่โควตา
  const d2 = setup('quota-d'); await run(d2, { LINE_MODE: 'daily' });
  const s2 = readSt(d2); assert.equal(pushes.length, 0);
  assert.match(s2.last.alert, /LINE_MODE=daily/); assert.match(s2.last.daily, /โควตาไม่พอ/);
});

test('--validate: ทุกแบบรวมสรุปประจำวันโหมด daily + ลิงก์ Telegram ผ่านตัวตรวจจำลอง (ไม่ push)', async () => {
  Q = { limit: 300, used: 0, members: 3 }; pushes = []; validated = [];
  const d = setup('val'), r = await run(d, {}, ['--validate']);
  assert.equal(r.code, 0, r.out); assert.equal(pushes.length, 0);
  assert.match(r.out, /สรุปประจำวัน \(LINE_MODE=daily \+ ลิงก์ Telegram\) : รูปแบบถูกต้อง/);
  assert.ok(validated.length >= 5, r.out);
  assert.ok(validated.some(b => JSON.stringify(b).includes('https://t.me/+ExampleInvite0')));
});

// ขนาดกรณีหนักสุด: สรุปประจำวันมีทุกกล่อง (ดาวเทียม/VR/FWI+FFMC/เสี่ยง/PM2.5) · ทุกพื้นที่มีจุด 24 ชม. 12 จุด ชื่อตำบลยาว · ตารางพื้นที่/จังหวัด/อำเภอ/ตำบลครบ · ลิงก์เชิญยาวสุดที่ยอม (200 ตัว)
test('carousel กรณีหนักสุด + บรรทัด Telegram < 48,000 ไบต์ (ตัวกันลดจุดต่อการ์ด)', async () => {
  const W = await import(pathToFileURL(path.join(ROOT, 'worker', 'line-webhook.mjs')).href);
  const now = NOW, long = 'บ้านราษฎร์เสิงสางนาดี' /* 21 ตัว = ชื่อยาวสุดจริงใน summary.json */, feats = [];
  W.AREAS.forEach((a, i) => { for (let k = 0; k < 12; k++) { const f = pt(`h${i}-${k}`, 14 + i * .1 + k * .001, 102 + k * .001, 60 + k); Object.assign(f.properties, { _ar: a.k, subdistrict_name_th: long, district_name_th: long, satellite_name: 'NOAA-21' }); feats.push(f) } });
  const big = n => Object.fromEntries([...Array(n).keys()].map(i => [`${long}${i}|${long}|${long}`, 100 - i]));
  const ar = v => ({ fy: 999, prv: 888, pfull: 1777, m: Array(12).fill(99), pm: Array(12).fill(88), pv: { [long]: 9 }, am: { [`${long}|${long}`]: 9 }, tm: big(1) });
  const areas = Object.fromEntries([...W.AREAS.map(a => [a.k, ar()]), ['นอกพื้นที่อนุรักษ์|สถานีควบคุมไฟป่าทับลาน', ar()]]);
  const sum = { fy: 2570, ind: 'NOAA-20', areas };
  const day = i => new Date(now + i * 864e5 + 7 * 36e5).toISOString().slice(0, 10);
  const orb = [0, 1, 2, 3].map(i => ({ t: now + (i + 1) * 5 * 36e5, n: 'NOAA-21', day: i % 2 === 0 }));
  const vr = { days: [0, 1, 2, 3, 4].map(i => ({ d: day(i), st: now + i * 864e5, max: 12345, mean: 2345, a: now, z: now + 6 * 36e5 })) };
  const fwi = { days: [0, 1].map(i => ({ d: day(i), c: 4, mean: 33.3, max: 55.5, cx: 4, hi: 88, top: { n: 'อช.' + long, v: 55.5 }, t: 36, rh: 22, ws: 18, pr: 0, ffmc: { mean: 92.2, c: 4, max: 96.6, cx: 4 } })) };
  const pm = { days: [0, 1, 2].map(i => ({ d: day(i), c: 4, mean: 88.8, pk: 155, pkT: now, pkN: 'อช.' + long, parks: W.AREAS.map(a => [a.s, 77.7]) })) };
  const risk = { text: 'พื้นที่เสี่ยงสูงมาก 12 ช่อง: ' + long + ' · ' + long + ' (ดัชนีของระบบ ไม่ใช่ค่าทางการ)', n5: 12, n4: 30 };
  const site = 'https://takiang71.github.io/fire-map-dpky/', tg = 'https://t.me/+' + 'A'.repeat(186);
  assert.ok(W.TGRE.test(tg) && tg.length === 200);
  const o = { live: { features: feats }, sum, fresh: null, site, now, daily: true, orb, vr, fwi, pm, risk, quotaLeft: 99 };
  const per = m => { const c = m.contents.contents[1].body.contents.filter(x => x.action && /maps\.google/.test(x.action.uri)).length; return c };
  const base = W.carousel({ ...o, mode: 'all' }), withTg = W.carousel({ ...o, mode: 'daily', tg });
  const bB = W.bytes(base), bT = W.bytes(withTg);
  console.log(`  หนักสุด สรุปประจำวัน: ไม่มีบรรทัด Telegram ${bB} ไบต์ (${per(base)} จุด/การ์ด) · มีบรรทัด Telegram ${bT} ไบต์ (${per(withTg)} จุด/การ์ด) · เพิ่ม ${bT - bB} ไบต์`);
  assert.ok(bT < 48000 && bB < 48000, `${bB} / ${bT}`);
  assert.ok(hasTgAny(withTg, tg));
  // แจ้งเตือน (โหมด all ไม่มีบรรทัด Telegram เสมอ แม้ส่ง tg มา)
  const al = W.carousel({ ...o, daily: false, orb: null, vr: null, fwi: null, pm: null, risk: null, fresh: feats, mode: 'all', tg });
  assert.ok(W.bytes(al) < 48000); assert.ok(!JSON.stringify(al).includes('t.me'));
});
const hasTgAny = (m, tg) => JSON.stringify(m.contents.contents[0]).includes(tg);
