// SYS ภาพรวมระบบสำหรับผู้ดูแล (20 พ.ย. 69 — docs/layers-backend.md หัวข้อ SYS)
//  · worker/layers.mjs กับ KV จำลอง + D1 จำลองด้วย node:sqlite (SQL จริง) — ไม่ต่อเน็ต
//  · POST /hit นับผู้เข้าชม (ไม่มี DB = 204 เฉยๆ, บอต/ขนาดเกินไม่นับ) · GET /sys (ผู้ดูแลเท่านั้น) · GET/PUT /flags · สวิตช์ login/rep มีผลจริง · สมาชิกที่ใช้งานล่าสุด
//  · cfStats กับ GraphQL จำลอง (ชุดหนึ่งผิดพลาด ชุดอื่นยังได้) · scripts/lib/flags.js (ตั้งตัวแปรแจ้งเตือนเป็น off)
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), { pathToFileURL } = require('url'), { DatabaseSync } = require('node:sqlite');

class KV {
  constructor() { this.m = new Map() }
  async get(k, o) { const v = this.m.get(k); if (v == null) return null; const t = o && (typeof o === 'string' ? o : o.type); return t === 'json' ? JSON.parse(v) : v }
  async put(k, v) { this.m.set(k, typeof v === 'string' ? v : String(v)) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true } }
}
class D1 { // เท่าที่ Worker ใช้: prepare().bind().run()/all() · batch()
  constructor() { this.db = new DatabaseSync(':memory:'); this.writes = 0 }
  prepare(sql) {
    const self = this, st = { sql, args: [], bind(...a) { return { ...st, args: a } },
      async run() { return self.ex(this.sql, this.args) }, async all() { return self.ex(this.sql, this.args) } };
    return st;
  }
  ex(sql, args) {
    const p = this.db.prepare(sql);
    if (/^\s*select/i.test(sql)) return { results: p.all(...args).map(r => ({ ...r })), meta: {} };
    const r = p.run(...args); this.writes += r.changes; return { results: [], meta: { changes: r.changes } };
  }
  async batch(L) { const out = []; for (const s of L) out.push(this.ex(s.sql, s.args)); return out }
}
let W, kv, db, env, ADM, U1;
const api = async (p, { m = 'GET', tok, body, ua, e = env } = {}) => {
  const h = {}; if (tok) h.authorization = 'Bearer ' + tok; if (ua) h['user-agent'] = ua;
  const r = await W.fetch(new Request('https://x.test' + p, { method: m, headers: h, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), e);
  const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { }
  return { s: r.status, j, t };
};
const thDay = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);
test.before(async () => {
  W = (await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'layers.mjs')).href)).default;
  kv = new KV(); db = new D1(); env = { LAYERS: kv, ADMIN_PASS: 'admin-secret-pass', DB: db };
  ADM = (await api('/login', { m: 'POST', body: { u: 'admin', p: 'admin-secret-pass' } })).j.token;
  assert.equal((await api('/users', { m: 'POST', tok: ADM, body: { u: 'somchai', p: 'pass-somchai', d: 'สมชาย' } })).s, 200);
  U1 = (await api('/login', { m: 'POST', body: { u: 'somchai', p: 'pass-somchai' } })).j.token;
});

test('GET / บอก sys/db/cf', async () => {
  const r = await api('/'); assert.equal(r.j.sys, 1); assert.equal(r.j.db, true); assert.equal(r.j.cf, false);
});
test('POST /hit: นับรายชั่วโมง 1 แถว/ครั้ง · บอต/ขนาดเกิน/ไม่มี DB ไม่นับ · ไม่อ่าน KV', async () => {
  const w0 = db.writes, kvGet = kv.get; let kvn = 0; kv.get = async (...a) => { kvn++; return kvGet.apply(kv, a) };
  try {
    for (const b of [{ d: 'm', n: 1, f: 1, s: 'ln', l: 1 }, { d: 'd', n: 0, s: 'tg' }, { d: 'm', n: 1, a: 1, s: 'fb' }, 'ไม่ใช่ JSON']) assert.equal((await api('/hit', { m: 'POST', body: b })).s, 204);
    assert.equal(kvn, 0, '/hit ต้องไม่อ่าน KV');
  } finally { kv.get = kvGet }
  assert.equal(db.writes - w0, 4, 'เขียน 1 แถวต่อครั้ง (upsert)');
  assert.equal((await api('/hit', { m: 'POST', body: { d: 'm' }, ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).s, 204);
  assert.equal((await api('/hit', { m: 'POST', body: { d: 'm', x: 'ก'.repeat(400) } })).s, 204);
  assert.equal(db.writes - w0, 4, 'บอต/ขนาดเกิน ไม่นับ');
  const r = db.db.prepare('SELECT * FROM hit').all();
  assert.equal(r.length, 1); const h = r[0];
  assert.equal(h.day, thDay(Date.now())); assert.equal(h.pv, 4); assert.equal(h.uv, 2); assert.equal(h.nu, 1); assert.equal(h.mob, 2);
  assert.equal(h.app, 1); assert.equal(h.ln, 1); assert.equal(h.tg, 1); assert.equal(h.fb, 1); assert.equal(h.ot, 0); assert.equal(h.dl, 1);
  // ไม่ผูก D1 = 204 เฉยๆ ไม่ error
  assert.equal((await api('/hit', { m: 'POST', body: { d: 'm' }, e: { LAYERS: kv, ADMIN_PASS: 'x' } })).s, 204);
});
test('GET /sys: ผู้ดูแลเท่านั้น · ผู้เข้าชม/สมาชิก/ชั้น/รายงาน/บันทึก', async () => {
  assert.equal((await api('/sys')).s, 401); assert.equal((await api('/sys', { tok: U1 })).s, 403);
  await api('/me', { tok: U1 });
  const r = await api('/sys', { tok: ADM }); assert.equal(r.s, 200, r.t); const S = r.j;
  assert.equal(S.users.n, 1); assert.equal(S.db, true); assert.equal(S.cf, false); assert.ok(!S.cfq);
  assert.equal(S.visits.today, thDay(Date.now())); assert.equal(S.visits.days.at(-1).pv, 4); assert.equal(S.visits.days.at(-1).uv, 2); assert.equal(S.visits.hours.length, 1); assert.equal(S.visits.months[0].pv, 4);
  assert.deepEqual(S.seen.map(x => x.u).sort(), ['admin', 'somchai'], 'บันทึกตอน login และ /me'); assert.equal(S.seen.find(x => x.u === 'somchai').d, 'สมชาย');
  assert.equal(S.seen.find(x => x.u === 'somchai').n, 1, '/me ภายใน 1 ชม. หลัง login ไม่นับซ้ำ');
  assert.equal(S.flags.login, true); assert.equal(S.flags.rep, true); assert.ok(S.noff.includes('TG_SUBS'));
  assert.ok(S.log.n >= 2); assert.ok(S.kv.meta > 0); assert.equal(S.reports.n, 0);
  // ผู้ใช้ที่ถูกลบหายจากรายการ seen
  await api('/users', { m: 'POST', tok: ADM, body: { u: 'tmpuser', p: 'pass-tmpuser' } }); await api('/login', { m: 'POST', body: { u: 'tmpuser', p: 'pass-tmpuser' } });
  await api('/users/tmpuser', { m: 'DELETE', tok: ADM });
  assert.ok(!(await api('/sys', { tok: ADM })).j.seen.some(x => x.u === 'tmpuser'));
  // ไม่ผูก D1 = ไม่มี visits แต่ส่วนอื่นได้
  const e2 = { LAYERS: kv, ADMIN_PASS: 'admin-secret-pass' }, r2 = await api('/sys', { tok: ADM, e: e2 }); assert.equal(r2.s, 200); assert.equal(r2.j.db, false); assert.ok(!r2.j.visits);
});
test('flags: อ่านได้ทุกคน · แก้ได้เฉพาะผู้ดูแล · ตรวจค่า · ลงบันทึก · ส่งไปกับ GET /layers', async () => {
  const d = await api('/flags'); assert.equal(d.s, 200); assert.deepEqual(d.j.flags, { ann: null, login: true, rep: true, hl: [], lnd: false, off: [], upd: 0 });
  assert.equal((await api('/flags', { m: 'PUT', body: { rep: false } })).s, 401);
  assert.equal((await api('/flags', { m: 'PUT', tok: U1, body: { rep: false } })).s, 403);
  const r = await api('/flags', { m: 'PUT', tok: ADM, body: { ann: { t: '  <b>ปิดปรับปรุง</b> 22:00 น.  ', lv: 'zzz' }, hl: ['risk', 'bad key!', 'risk', 'pm'], off: ['TG_SUBS', 'LINE_TOKEN', 'LINE_DAILY'], lnd: 1 } });
  assert.equal(r.s, 200, r.t); const F = r.j.flags;
  assert.equal(F.ann.t, '<b>ปิดปรับปรุง</b> 22:00 น.'); assert.equal(F.ann.lv, 'info', 'ระดับผิด = info'); assert.ok(/^[a-f0-9]{8}$/.test(F.ann.id));
  assert.deepEqual(F.hl, ['risk', 'pm']); assert.deepEqual(F.off, ['LINE_DAILY', 'TG_SUBS'], 'เฉพาะชื่อที่อนุญาต เรียงตาม NOFF'); assert.equal(F.lnd, true); assert.ok(F.upd > 0);
  const id = F.ann.id; assert.equal((await api('/flags', { m: 'PUT', tok: ADM, body: { ann: { t: '<b>ปิดปรับปรุง</b> 22:00 น.', lv: 'warn' } } })).j.flags.ann.id, id, 'ข้อความเดิม = id เดิม (ผู้ที่กดปิดประกาศไม่เห็นซ้ำ)');
  assert.notEqual((await api('/flags', { m: 'PUT', tok: ADM, body: { ann: { t: 'ข้อความใหม่' } } })).j.flags.ann.id, id);
  assert.deepEqual((await api('/layers')).j.flags.hl, ['risk', 'pm']);
  // ประกาศหมดอายุ = ไม่ส่ง
  await api('/flags', { m: 'PUT', tok: ADM, body: { ann: { t: 'หมดอายุแล้ว', until: Date.now() - 1000 } } }); assert.equal((await api('/flags')).j.flags.ann, null);
  await api('/flags', { m: 'PUT', tok: ADM, body: { ann: null } }); assert.equal((await api('/flags')).j.flags.ann, null);
  const lg = (await api('/log', { tok: ADM })).j.log.filter(e => e.a === 'flags'); assert.ok(lg.length >= 3); assert.equal(lg.at(-1).k, 'sys'); assert.match(lg.at(-1).x, /ประกาศ/);
  // ไม่เปลี่ยนอะไร = ไม่ลงบันทึก
  const n0 = (await api('/log', { tok: ADM })).j.log.length; await api('/flags', { m: 'PUT', tok: ADM, body: { rep: true } }); assert.equal((await api('/log', { tok: ADM })).j.log.length, n0);
});
test('flags rep/login มีผลจริง (ผู้ดูแลยังทำได้)', async () => {
  await api('/flags', { m: 'PUT', tok: ADM, body: { rep: false, login: false } });
  const p = await api('/reports', { m: 'POST', tok: U1, body: { res: 'none' } }); assert.equal(p.s, 403); assert.match(p.j.error, /ปิดรับ/);
  assert.equal((await api('/reports', { m: 'POST', tok: ADM, body: { res: 'none' } })).s, 200, 'ผู้ดูแลบันทึกได้');
  assert.equal((await api('/reports')).s, 200, 'อ่านรายงานได้ตามเดิม');
  const l = await api('/login', { m: 'POST', body: { u: 'somchai', p: 'pass-somchai' } }); assert.equal(l.s, 403); assert.match(l.j.error, /ปิดการเข้าสู่ระบบ/);
  assert.equal((await api('/login', { m: 'POST', body: { u: 'somchai', p: 'wrong-pass' } })).s, 401, 'รหัสผิดยังตอบ 401 เหมือนเดิม');
  assert.equal((await api('/login', { m: 'POST', body: { u: 'admin', p: 'admin-secret-pass' } })).s, 200, 'ผู้ดูแลหลักเข้าได้');
  await api('/flags', { m: 'PUT', tok: ADM, body: { rep: true, login: true } });
  assert.equal((await api('/login', { m: 'POST', body: { u: 'somchai', p: 'pass-somchai' } })).s, 200);
  assert.equal((await api('/sys', { tok: ADM })).j.reports.n, 1);
});
test('cfStats: รวมยอด Worker/KV/D1 · ชุดที่ผิดพลาดไม่ทำให้ชุดอื่นหาย', async () => {
  const of = globalThis.fetch, seenQ = []; globalThis.fetch = async (u, o) => {
    const b = JSON.parse(o.body), q = b.query; seenQ.push(q); assert.equal(o.headers.authorization, 'Bearer tok123'); assert.equal(b.variables.a, 'acc1');
    const R = x => new Response(JSON.stringify({ data: { viewer: { accounts: [{ x }] } } }));
    if (/workersInvocationsAdaptive/.test(q)) return R([{ sum: { requests: 10, errors: 1, subrequests: 3 }, dimensions: { scriptName: 'fire-layers' } }, { sum: { requests: 5, errors: 0, subrequests: 0 }, dimensions: { scriptName: 'fire-layers' } }, { sum: { requests: 40, errors: 0, subrequests: 9 }, dimensions: { scriptName: 'fire-line' } }]);
    if (/kvOperations/.test(q)) return R([{ sum: { requests: 120 }, dimensions: { actionType: 'read' } }, { sum: { requests: 7 }, dimensions: { actionType: 'write' } }]);
    if (/kvStorage/.test(q)) return R([{ max: { keyCount: 10, byteCount: 1000 }, dimensions: { namespaceId: 'a', date: '2026-11-18' } }, { max: { keyCount: 12, byteCount: 1500 }, dimensions: { namespaceId: 'a', date: '2026-11-19' } }, { max: { keyCount: 3, byteCount: 100 }, dimensions: { namespaceId: 'b', date: '2026-11-19' } }]);
    if (/d1Analytics/.test(q)) return R([{ sum: { rowsRead: 50, rowsWritten: 8, readQueries: 5, writeQueries: 8 }, dimensions: { databaseId: 'x' } }]);
    return new Response(JSON.stringify({ errors: [{ message: 'unknown field d1StorageAdaptiveGroups' }] }));
  };
  try {
    const e = { ...env, CF_API_TOKEN: ' tok123 ', CF_ACCOUNT_ID: 'acc1' }, r = await api('/sys', { tok: ADM, e }), C = r.j.cfq;
    assert.equal(r.j.cf, true); assert.equal(seenQ.length, 5);
    assert.deepEqual(C.w, [{ s: 'fire-line', r: 40, e: 0, sub: 9 }, { s: 'fire-layers', r: 15, e: 1, sub: 3 }]);
    assert.deepEqual(C.kv, { read: 120, write: 7, delete: 0, list: 0 }); assert.deepEqual(C.ks, { keys: 15, bytes: 1600 }, 'วันล่าสุดของแต่ละ namespace'); assert.deepEqual(C.d1, { rr: 50, rw: 8 });
    assert.ok(!C.ds); assert.match(C.err.ds, /unknown field/);
    assert.equal((await api('/', { e })).j.cf, true);
  } finally { globalThis.fetch = of }
});
test('scripts/lib/flags.js: ตั้งตัวแปรแจ้งเตือนเป็น off · LINE_MODE=daily · ไฟล์ไม่มี/เสีย = ไม่แตะ', () => {
  const F = require('../scripts/lib/flags'), fs = require('fs'), os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flags-')), f = path.join(dir, 'flags.json');
  const E = { LINE_BURN: '', TG_SUBS: '', LINE_MODE: '' };
  assert.deepEqual(F.applyEnv(f, E), [], 'ไม่มีไฟล์'); assert.deepEqual(E, { LINE_BURN: '', TG_SUBS: '', LINE_MODE: '' });
  fs.writeFileSync(f, '{เสีย'); assert.deepEqual(F.applyEnv(f, E), []);
  fs.writeFileSync(f, JSON.stringify({ flags: { off: ['TG_SUBS', 'LINE_BURN', 'LINE_TOKEN', 'PATH'], lnd: true } }));
  const ch = F.applyEnv(f, E);
  assert.equal(E.TG_SUBS, 'off'); assert.equal(E.LINE_BURN, 'off'); assert.equal(E.LINE_MODE, 'daily'); assert.ok(!('LINE_TOKEN' in E) && !('PATH' in E), 'ชื่ออื่นไม่แตะ');
  assert.deepEqual(ch.sort(), ['LINE_BURN', 'LINE_MODE', 'TG_SUBS']);
  // NOFF ตรงกับ Worker
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'layers.mjs'), 'utf8'), m = src.match(/const NOFF = (\[[^\]]+\])/);
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), F.NOFF);
});
