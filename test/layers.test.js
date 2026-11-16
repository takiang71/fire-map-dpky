// Worker ระบบหลังบ้าน (worker/layers.mjs) กับ KV จำลองในหน่วยความจำ — ไม่ต่อเน็ต
//  · เดิมทดสอบด้วย mockworker.mjs ใน scratchpad (หายไปแล้ว) → ย้ายมาเป็นเทสต์ถาวร 16 พ.ย. 69
//  · ครอบคลุม: GET / · login ผู้ดูแลหลัก/ผู้ใช้ · ชั้นข้อมูล (สร้าง/อ่านตามสิทธิ์) · F1 รายงานผลตรวจสอบ (สิทธิ์ 24 ชม., ตรวจค่า, ดัชนีต่อปีงบ, repair)
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), { pathToFileURL } = require('url');

class KV { // จำลอง Cloudflare KV เท่าที่ Worker ใช้
  constructor() { this.m = new Map() }
  async get(k, o) { const v = this.m.get(k); if (v == null) return null; const t = o && (typeof o === 'string' ? o : o.type); return t === 'json' ? JSON.parse(v) : v }
  async put(k, v) { this.m.set(k, typeof v === 'string' ? v : String(v)) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true } }
}
let W, kv, env;
const api = async (p, { m = 'GET', tok, body, meta } = {}) => {
  const h = {}; if (tok) h.authorization = 'Bearer ' + tok; if (meta) h['x-meta'] = Buffer.from(JSON.stringify(meta)).toString('base64url');
  const r = await W.fetch(new Request('https://x.test' + p, { method: m, headers: h, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { }
  return { s: r.status, j, t };
};
test.before(async () => {
  W = (await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'layers.mjs')).href)).default;
  kv = new KV(); env = { LAYERS: kv, ADMIN_PASS: 'admin-secret-pass' };
});
const fyNow = () => { const d = new Date(Date.now() + 7 * 36e5); return d.getUTCFullYear() + 543 + (d.getUTCMonth() >= 9 ? 1 : 0) };

let ADM, U1, U2;
test('GET / บอกสถานะ kv/admin/rep', async () => { const r = await api('/'); assert.equal(r.s, 200); assert.deepEqual(r.j, { ok: true, app: 'fire-map layers', kv: true, admin: true, rep: true }) });
test('login ผู้ดูแลหลักถูก/ผิด', async () => {
  const bad = await api('/login', { m: 'POST', body: { u: 'admin', p: 'wrong' } }); assert.equal(bad.s, 401);
  const ok = await api('/login', { m: 'POST', body: { u: 'admin', p: 'admin-secret-pass' } }); assert.equal(ok.s, 200); assert.ok(ok.j.token); assert.equal(ok.j.user.a, true); ADM = ok.j.token;
});
test('ผู้ดูแลสร้างกลุ่ม/ผู้ใช้ แล้วผู้ใช้ล็อกอินได้', async () => {
  const g = await api('/groups', { m: 'POST', tok: ADM, body: { n: 'สถานีฯ ทับลาน' } }); assert.equal(g.s, 200);
  for (const [u, d] of [['somchai', 'สมชาย'], ['somying', 'สมหญิง']]) { const r = await api('/users', { m: 'POST', tok: ADM, body: { u, p: 'pass-' + u, d, g: [g.j.group.id] } }); assert.equal(r.s, 200, r.t) }
  U1 = (await api('/login', { m: 'POST', body: { u: 'somchai', p: 'pass-somchai' } })).j.token; U2 = (await api('/login', { m: 'POST', body: { u: 'somying', p: 'pass-somying' } })).j.token;
  assert.ok(U1 && U2);
  assert.equal((await api('/users', { tok: U1 })).s, 403, 'ผู้ใช้ธรรมดาเข้าหน้าผู้ใช้ไม่ได้');
});
test('ชั้นข้อมูล: ผู้ดูแลอัปโหลด · สิทธิ์ login/all', async () => {
  const gj = JSON.stringify({ type: 'FeatureCollection', features: [] });
  const L = await api('/layers', { m: 'POST', tok: ADM, body: gj, meta: { name: 'แปลงทดสอบ', acl: { m: 'login' } } }); assert.equal(L.s, 200, L.t);
  assert.equal((await api('/layers')).j.layers.length, 0, 'ไม่ล็อกอินไม่เห็นชั้น login');
  assert.equal((await api('/layers', { tok: U1 })).j.layers.length, 1);
  assert.equal((await api('/layers/' + L.j.layer.id)).s, 401);
  await api('/layers/' + L.j.layer.id, { m: 'PUT', tok: ADM, body: { acl: { m: 'all' } } });
  assert.equal((await api('/layers/' + L.j.layer.id)).s, 200, 'ตั้ง all แล้วดาวน์โหลดได้โดยไม่ล็อกอิน');
  assert.equal((await api('/layers', { m: 'POST', tok: U1, body: gj })).s, 403, 'ผู้ใช้ธรรมดาอัปโหลดไม่ได้');
});

// ---- F1 รายงานผลตรวจสอบ ----
const HS = { la: 14.26532, lo: 101.98765, t: Date.UTC(2026, 10, 15, 6, 30), sat: 'NOAA20' }; // 15 พ.ย. 69 13:30 น. = ปีงบ 2570
let R1;
test('reports: ไม่ล็อกอินบันทึกไม่ได้ แต่อ่านได้', async () => {
  assert.equal((await api('/reports', { m: 'POST', body: { res: 'none' } })).s, 401);
  const r = await api('/reports?fy=2570'); assert.equal(r.s, 200); assert.deepEqual(r.j, { fy: 2570, reports: [] });
});
test('reports: บันทึกแล้วได้ id/fy/by และคีย์สำเนา r:<id>', async () => {
  const r = await api('/reports', { m: 'POST', tok: U1, body: { res: 'none', hk: '20772|1330|14265|101988', hs: HS, rai: 0, cs: 1, rp: 8, ta: '14:05', te: '', un: 'สถานีฯ ทับลาน + อส.อส', note: 'ตรวจแล้วเป็นควันจากเผาไร่นอกเขต', pos: [101.9870, 14.2650, 12.4], ar: 'อุทยานแห่งชาติทับลาน', st: 'สถานีควบคุมไฟป่าทับลาน', tm: 'บุพราหมณ์|นาดี|ปราจีนบุรี' } });
  assert.equal(r.s, 200, r.t); R1 = r.j.report;
  assert.match(R1.id, /^[0-9a-f]{16}$/); assert.equal(R1.fy, 2570); assert.deepEqual(R1.by, { u: 'somchai', d: 'สมชาย' });
  assert.equal(R1.ta, '14:05'); assert.equal(R1.te, null); assert.deepEqual(R1.pos, [101.987, 14.265, 12]); assert.equal(R1.cs, 1);
  assert.ok(kv.m.has('r:' + R1.id)); assert.equal((await api('/reports?fy=2570')).j.reports.length, 1);
  assert.equal((await api('/reports')).j.fy, fyNow(), 'ไม่ระบุ fy = ปีงบปัจจุบัน');
});
test('reports: ค่าผิดรูปถูกตัด/ไม่ใช้ · res ผิด = 400 · ใหญ่เกิน = 413', async () => {
  assert.equal((await api('/reports', { m: 'POST', tok: U1, body: { res: 'maybe' } })).s, 400);
  assert.equal((await api('/reports', { m: 'POST', tok: U1, body: { res: 'fire', note: 'x'.repeat(9000) } })).s, 413);
  const r = await api('/reports', { m: 'POST', tok: U2, body: { res: 'fire', hs: { la: 999, lo: 1, t: 1 }, rai: -5, cs: 'abc', ta: '25:00', un: 'ก'.repeat(300), pos: [1], note: 'x'.repeat(1500) } });
  assert.equal(r.s, 200); const x = r.j.report;
  assert.equal(x.hs, null, 'ละติจูดผิด = ไม่เก็บจุด'); assert.equal(x.rai, 0); assert.equal(x.cs, null); assert.equal(x.ta, null); assert.equal(x.un.length, 200); assert.equal(x.pos, null); assert.equal(x.note.length, 1000);
  assert.equal(x.fy, fyNow(), 'ไม่มีจุด = ปีงบของเวลาบันทึก');
  assert.equal((await api('/reports/' + x.id + '?fy=' + x.fy, { m: 'DELETE', tok: U2 })).s, 200);
});
test('reports: เจ้าของแก้ได้ · คนอื่นแก้ไม่ได้ · fy ผิดปี = 404', async () => {
  assert.equal((await api('/reports/' + R1.id + '?fy=2570', { m: 'PUT', tok: U2, body: { rai: 3 } })).s, 403);
  assert.equal((await api('/reports/' + R1.id + '?fy=2569', { m: 'PUT', tok: U1, body: { rai: 3 } })).s, 404);
  const r = await api('/reports/' + R1.id + '?fy=2570', { m: 'PUT', tok: U1, body: { res: 'out', rai: 3.456, te: '15:40' } });
  assert.equal(r.s, 200, r.t); assert.equal(r.j.report.res, 'out'); assert.equal(r.j.report.rai, 3.46); assert.equal(r.j.report.te, '15:40'); assert.ok(r.j.report.m >= r.j.report.c);
  assert.equal(JSON.parse(kv.m.get('r:' + R1.id)).res, 'out', 'สำเนา r:<id> อัปเดตตาม');
});
test('reports: เกิน 24 ชม. เจ้าของแก้/ลบไม่ได้ ผู้ดูแลได้', async () => {
  const L = JSON.parse(kv.m.get('rep:2570')); L[0].c -= 25 * 36e5; kv.m.set('rep:2570', JSON.stringify(L));
  const r = await api('/reports/' + R1.id + '?fy=2570', { m: 'PUT', tok: U1, body: { rai: 9 } }); assert.equal(r.s, 403); assert.match(r.j.error, /24 ชม/);
  assert.equal((await api('/reports/' + R1.id + '?fy=2570', { m: 'DELETE', tok: U1 })).s, 403);
  const a = await api('/reports/' + R1.id + '?fy=2570', { m: 'PUT', tok: ADM, body: { rai: 9 } }); assert.equal(a.s, 200); assert.equal(a.j.report.rai, 9); assert.deepEqual(a.j.report.ed, { u: 'admin', d: 'ผู้ดูแลหลัก' });
});
test('reports: บัญชีที่ถูกปิดใช้งานบันทึกไม่ได้', async () => {
  await api('/users/somying', { m: 'PUT', tok: ADM, body: { x: true } });
  assert.equal((await api('/reports', { m: 'POST', tok: U2, body: { res: 'none' } })).s, 401);
  await api('/users/somying', { m: 'PUT', tok: ADM, body: { x: false } });
});
test('reports: ดัชนีแยกปีงบ · ลบแล้วหายทั้งดัชนีและสำเนา', async () => {
  const r = await api('/reports', { m: 'POST', tok: U1, body: { res: 'plan', hs: { ...HS, t: Date.UTC(2026, 8, 20, 3) }, rai: 50 } }); // 20 ก.ย. 69 = ปีงบ 2569
  assert.equal(r.j.report.fy, 2569); assert.equal((await api('/reports?fy=2569')).j.reports.length, 1); assert.equal((await api('/reports?fy=2570')).j.reports.length, 1);
  assert.equal((await api('/reports/' + r.j.report.id + '?fy=2569', { m: 'DELETE', tok: U1 })).s, 200);
  assert.equal((await api('/reports?fy=2569')).j.reports.length, 0); assert.ok(!kv.m.has('r:' + r.j.report.id));
});
test('reports: repair สร้างดัชนีใหม่จากสำเนา (ผู้ดูแลเท่านั้น)', async () => {
  const r2 = (await api('/reports', { m: 'POST', tok: U1, body: { res: 'fire', hs: HS, rai: 12 } })).j.report;
  kv.m.set('rep:2570', '[]'); // จำลองดัชนีหายจากการเขียนชนกัน
  assert.equal((await api('/reports/repair?fy=2570', { m: 'POST', tok: U1 })).s, 403);
  const r = await api('/reports/repair?fy=2570', { m: 'POST', tok: ADM }); assert.equal(r.s, 200); assert.equal(r.j.n, 2);
  const ids = (await api('/reports?fy=2570')).j.reports.map(x => x.id); assert.deepEqual(ids, [R1.id, r2.id], 'เรียงตามเวลาสร้าง');
});
test('reports: GET อ่าน KV แค่ meta + ดัชนี (ไม่ไล่อ่านสำเนา)', async () => {
  const g0 = kv.get.bind(kv); let n = 0; kv.get = (...a) => { n++; return g0(...a) };
  await api('/reports?fy=2570'); kv.get = g0;
  assert.equal(n, 2);
});
