// Worker ระบบหลังบ้าน (worker/layers.mjs) กับ KV จำลองในหน่วยความจำ — ไม่ต่อเน็ต
//  · เดิมทดสอบด้วย mockworker.mjs ใน scratchpad (หายไปแล้ว) → ย้ายมาเป็นเทสต์ถาวร 16 พ.ย. 69
//  · ครอบคลุม: GET / · login ผู้ดูแลหลัก/ผู้ใช้ · ชั้นข้อมูล (สร้าง/อ่านตามสิทธิ์) · F1 รายงานผลตรวจสอบ (สิทธิ์ 24 ชม., ตรวจค่า, ดัชนีต่อปีงบ, repair)
//  · F7 (18 พ.ย. 69): แนบเส้นทางกับรายงาน (trk → คีย์ t:<id> แยกจากดัชนี, GET /reports/<id>/trk สาธารณะ, ≤500 จุด, ลบ/แก้/ลบรายงานแล้วคีย์ตาม, body 8 KB + 16 KB)
//  · E3 (17 พ.ย. 69): อัปโหลดเกิน 8 MB = 413 (นับไบต์ ไม่ใช่ตัวอักษร) · ออกจากระบบทุกอุปกรณ์ (ผู้ใช้/ผู้ดูแลหลัก) · บันทึกการใช้งาน (ครบการกระทำ, ไม่มีรหัสผ่าน/token, 200 รายการ, ผู้ใช้ทั่วไปอ่านไม่ได้)
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
test('GET / บอกสถานะ kv/admin/rep/log', async () => { const r = await api('/'); assert.equal(r.s, 200); assert.deepEqual(r.j, { ok: true, app: 'fire-map layers', kv: true, admin: true, rep: true, log: true, trk: true, fd: 2, max_mb: 8, sys: 1, db: false, cf: false }) });
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
// ---- FD บันทึกการดับไฟป่า (เมนูไฟป่าที่ตรวจพบ 18 พ.ย. 69): ไม่ผูกจุด · ปีงบจาก tn · แก้ข้ามปีงบ = ย้ายดัชนี ----
test('reports fd: tn/ag/crew/kd · ปีงบตามเวลารับแจ้ง · แก้วันที่ข้ามปีงบย้ายดัชนี', async () => {
  const tn = Date.UTC(2026, 8, 29, 7, 30); // 29 ก.ย. 69 = ปีงบ 2569
  const r = await api('/reports', { m: 'POST', tok: U1, body: { kd: 'fd', res: 'out', tn, ag: 'สถานีควบคุมไฟป่าทับลาน', crew: '12', rai: 4, rp: 3, ta: '14:50', te: '17:10', pos: [101.98, 14.26, 8] } });
  assert.equal(r.s, 200, r.t); const x = r.j.report;
  assert.equal(x.fy, 2569); assert.equal(x.tn, tn); assert.equal(x.ag, 'สถานีควบคุมไฟป่าทับลาน'); assert.equal(x.crew, 12); assert.equal(x.kd, 'fd'); assert.equal(x.hs, null);
  assert.equal(JSON.parse(kv.m.get('rep:2569')).filter(y => y.id === x.id).length, 1);
  const bad = await api('/reports', { m: 'POST', tok: U1, body: { kd: 'zz', res: 'out', tn: -5, crew: 1e6, ag: 'ก'.repeat(300) } });
  assert.equal(bad.s, 200); assert.equal(bad.j.report.kd, null); assert.equal(bad.j.report.tn, null); assert.equal(bad.j.report.crew, null); assert.equal(bad.j.report.ag.length, 120);
  assert.equal(bad.j.report.fy, fyNow(), 'tn ผิดรูป = ปีงบตามเวลาบันทึก');
  await api('/reports/' + bad.j.report.id + '?fy=' + bad.j.report.fy, { m: 'DELETE', tok: U1 });
  const e = await api('/reports/' + x.id + '?fy=2569', { m: 'PUT', tok: U1, body: { tn: Date.UTC(2026, 9, 2, 3, 0), crew: null } });
  assert.equal(e.s, 200, e.t); assert.equal(e.j.report.fy, 2570); assert.equal(e.j.report.crew, null);
  assert.equal(JSON.parse(kv.m.get('rep:2569')).some(y => y.id === x.id), false, 'ออกจากดัชนีปีงบเดิม');
  assert.equal(JSON.parse(kv.m.get('rep:2570')).filter(y => y.id === x.id).length, 1, 'อยู่ดัชนีปีงบใหม่');
  assert.equal(JSON.parse(kv.m.get('r:' + x.id)).fy, 2570);
  assert.equal((await api('/reports/' + x.id + '?fy=2570', { m: 'DELETE', tok: U1 })).s, 200);
});
test('reports fd: csx/rn/rt · เบอร์โทรไม่ออกใน GET สาธารณะ (เห็นเฉพาะเจ้าของ/ผู้ดูแล)', async () => {
  const r = await api('/reports', { m: 'POST', tok: U1, body: { kd: 'fd', res: 'out', tn: Date.now() - 36e5, csx: 'ฟ้าผ่า', rn: 'สมชาย ใจดี', rt: '081-234 5678', rai: 2 } });
  assert.equal(r.s, 200, r.t); const x = r.j.report; assert.equal(x.csx, 'ฟ้าผ่า'); assert.equal(x.rn, 'สมชาย ใจดี'); assert.equal(x.rt, '0812345678');
  const pub = (await api('/reports?fy=' + x.fy)).j.reports.find(y => y.id === x.id); assert.equal(pub.rn, 'สมชาย ใจดี'); assert.ok(!('rt' in pub), 'ไม่ล็อกอิน = ไม่เห็นเบอร์');
  assert.ok(!('rt' in (await api('/reports?fy=' + x.fy, { tok: U2 })).j.reports.find(y => y.id === x.id)), 'ผู้ใช้อื่นไม่เห็นเบอร์');
  assert.equal((await api('/reports?fy=' + x.fy, { tok: U1 })).j.reports.find(y => y.id === x.id).rt, '0812345678', 'เจ้าของเห็น');
  assert.equal((await api('/reports?fy=' + x.fy, { tok: ADM })).j.reports.find(y => y.id === x.id).rt, '0812345678', 'ผู้ดูแลเห็น');
  assert.equal((await api('/reports/' + x.id + '?fy=' + x.fy, { m: 'PUT', tok: U1, body: { rt: '12345' } })).j.report.rt, '', 'เบอร์ผิดรูป = ว่าง');
  assert.equal((await api('/reports/' + x.id + '?fy=' + x.fy, { m: 'DELETE', tok: U1 })).s, 200);
});
// ---- F7 เส้นทางที่แนบกับรายงาน ----
const TRK = n => { const c = []; for (let i = 0; i < n; i++) c.push(+(101.98 + i * 1e-4).toFixed(5), +(14.26 + Math.sin(i / 7) * 1e-3).toFixed(5)); return { c, t0: Date.UTC(2026, 10, 15, 6, 0), t1: Date.UTC(2026, 10, 15, 7, 12), km: 5.234, up: 120, dn: 98, n: n * 4 } };
test('reports trk: แนบ 500 จุด → พิกัดอยู่คีย์ t:<id> ดัชนีเก็บแค่สรุป · อ่านได้โดยไม่ล็อกอิน', async () => {
  const r = await api('/reports', { m: 'POST', tok: U1, body: { res: 'out', hs: HS, rai: 2, note: 'ก'.repeat(900), trk: TRK(500) } });
  assert.equal(r.s, 200, r.t); const x = r.j.report;
  assert.deepEqual(x.trk, { m: 500, n: 2000, km: 5.234, up: 120, dn: 98, t0: Date.UTC(2026, 10, 15, 6, 0), t1: Date.UTC(2026, 10, 15, 7, 12) });
  assert.ok(kv.m.has('t:' + x.id)); assert.ok(!kv.m.get('rep:2570').includes('"c":['), 'ดัชนีไม่มีพิกัดเส้นทาง');
  assert.deepEqual(JSON.parse(kv.m.get('r:' + x.id)).trk, x.trk, 'สำเนา r:<id> มีสรุป (repair สร้างคืนได้)');
  const g = await api('/reports/' + x.id + '/trk'); assert.equal(g.s, 200); assert.equal(g.j.trk.c.length, 1000); assert.equal(g.j.trk.c[0], 101.98); assert.equal(g.j.trk.km, 5.234);
  assert.equal((await api('/reports/ffffffffffffffff/trk')).s, 404); assert.equal((await api('/reports/..%2Fmeta/trk')).s, 404);
  // แก้: แทนที่ด้วยเส้นใหม่ / ลบด้วย null / ไม่ส่ง trk = คงเดิม
  const p1 = await api('/reports/' + x.id + '?fy=2570', { m: 'PUT', tok: U1, body: { rai: 3 } }); assert.equal(p1.j.report.trk.m, 500, 'ไม่ส่ง trk = คงเดิม');
  const p2 = await api('/reports/' + x.id + '?fy=2570', { m: 'PUT', tok: U1, body: { trk: TRK(20) } }); assert.equal(p2.j.report.trk.m, 20); assert.equal((await api('/reports/' + x.id + '/trk')).j.trk.c.length, 40);
  const p3 = await api('/reports/' + x.id + '?fy=2570', { m: 'PUT', tok: U1, body: { trk: null } }); assert.equal(p3.j.report.trk, null); assert.ok(!kv.m.has('t:' + x.id));
  await api('/reports/' + x.id + '?fy=2570', { m: 'PUT', tok: U1, body: { trk: TRK(3) } }); assert.ok(kv.m.has('t:' + x.id));
  assert.equal((await api('/reports/' + x.id + '?fy=2570', { m: 'DELETE', tok: U1 })).s, 200); assert.ok(!kv.m.has('t:' + x.id), 'ลบรายงาน = ลบเส้นทาง');
});
test('reports trk: เกิน 500 จุด/พิกัดผิด/รูปผิด = ไม่เก็บ · body เกิน 8 KB นอกเส้นทาง = 413 · รวมเกิน 24 KB = 413', async () => {
  for (const bad of [TRK(501), { c: [101, 14, 999, 14] }, { c: [101, 14, 101.1] }, { c: 'x' }, 5]) {
    const r = await api('/reports', { m: 'POST', tok: U1, body: { res: 'none', trk: bad } }); assert.equal(r.s, 200, r.t); assert.equal(r.j.report.trk, null); assert.ok(!kv.m.has('t:' + r.j.report.id));
    await api('/reports/' + r.j.report.id + '?fy=' + r.j.report.fy, { m: 'DELETE', tok: U1 });
  }
  assert.equal((await api('/reports', { m: 'POST', tok: U1, body: { res: 'none', note: 'x'.repeat(9000), trk: TRK(10) } })).s, 413, 'ส่วนที่ไม่ใช่เส้นทางยังจำกัด 8 KB');
  assert.equal((await api('/reports', { m: 'POST', tok: U1, body: { res: 'none', trk: { c: Array(4000).fill(101.12345) } } })).s, 413);
  assert.equal((await api('/reports', { m: 'POST', tok: U1, body: 'null' })).s, 400);
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

// ---- E3 หลังบ้าน: จำกัดขนาด · ออกจากระบบทุกอุปกรณ์ · บันทึกการใช้งาน ----
const SECRETS = () => ['admin-secret-pass', 'pass-somchai', 'pass-somying', 'new-pass-1234', 'reset-pass-999', 'wrong-pass-' + 'x', ADM, U1, U2].filter(Boolean);
test('E3 อัปโหลดเกิน 8 MB = 413 ข้อความไทย (นับไบต์: ไทย 2.9 ล้านตัว = 8.7 MB) · ต่ำกว่าเพดานผ่าน', async () => {
  const fc = name => JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [101, 14] }, properties: { name } }] });
  const big = fc('ก'.repeat(2.9e6)); assert.ok(big.length < 8 * 1048576 && Buffer.byteLength(big) > 8 * 1048576, 'ตัวอักษรไม่เกิน แต่ไบต์เกิน');
  const r = await api('/layers', { m: 'POST', tok: ADM, body: big, meta: { name: 'ใหญ่' } });
  assert.equal(r.s, 413); assert.match(r.j.error, /ไฟล์ใหญ่เกิน 8 MB \(ขนาด 8\.3 MB\)/);
  const L0 = (await api('/layers', { tok: ADM })).j.layers.length;
  const ascii = fc('x'.repeat(8 * 1048576)); assert.equal((await api('/layers', { m: 'POST', tok: ADM, body: ascii })).s, 413, 'ASCII เกิน 8 MB');
  assert.equal((await api('/layers', { tok: ADM })).j.layers.length, L0, 'ไม่ถูกบันทึก');
  const ok = await api('/layers', { m: 'POST', tok: ADM, body: fc('ข'.repeat(2.5e6)), meta: { name: 'เกือบเต็ม 7.2 MB' } });
  assert.equal(ok.s, 200, ok.t); assert.equal(ok.j.layer.kb > 2400, true);
  // แทนที่ข้อมูลชั้นเดิม (PUT /layers/<id>/data) ใช้เพดานเดียวกัน
  assert.equal((await api('/layers/' + ok.j.layer.id + '/data', { m: 'PUT', tok: ADM, body: big })).s, 413);
  assert.equal((await api('/layers/' + ok.j.layer.id + '/data', { m: 'PUT', tok: ADM, body: fc('เล็ก') })).s, 200);
  assert.equal((await api('/layers/' + ok.j.layer.id, { m: 'DELETE', tok: ADM })).s, 200);
});
test('E3 Content-Length เกินเพดาน = 413 ก่อนอ่าน body', async () => {
  const req = new Request('https://x.test/layers', { method: 'POST', headers: { authorization: 'Bearer ' + ADM }, body: '{"type":"FeatureCollection","features":[]}' });
  const h = new Headers(req.headers); h.set('content-length', String(9 * 1048576));
  const fake = { method: 'POST', url: req.url, headers: h, arrayBuffer: () => { throw new Error('ไม่ควรอ่าน body') }, text: req.text.bind(req), json: req.json.bind(req) };
  const r = await W.fetch(fake, env); assert.equal(r.status, 413); assert.match((await r.json()).error, /เกิน 8 MB \(ขนาด 9\.0 MB\)/);
});
test('E3 ออกจากระบบทุกอุปกรณ์: token ทุกใบของบัญชีนั้นใช้ไม่ได้ · บัญชีอื่นไม่กระทบ · เข้าสู่ระบบใหม่ได้', async () => {
  const lg = async () => (await api('/login', { m: 'POST', body: { u: 'somchai', p: 'pass-somchai' } })).j.token;
  const S = (await api('/login', { m: 'POST', body: { u: 'somying', p: 'pass-somying' } })).j.token;
  const A = await lg(), B = await lg(); /* 2 อุปกรณ์ */
  assert.equal((await api('/me', { tok: A })).j.user.u, 'somchai'); assert.equal((await api('/me', { tok: B })).j.user.u, 'somchai');
  assert.equal((await api('/logout-all', { m: 'POST' })).s, 401, 'ไม่ล็อกอิน = 401');
  const r = await api('/logout-all', { m: 'POST', tok: A }); assert.equal(r.s, 200); assert.deepEqual(r.j, { ok: true });
  assert.equal((await api('/me', { tok: A })).j.user, null, 'เครื่องนี้ออกด้วย'); assert.equal((await api('/me', { tok: B })).j.user, null, 'อุปกรณ์อื่นออก');
  assert.equal((await api('/me', { tok: U1 })).j.user, null, 'token เก่าก่อนหน้าก็ใช้ไม่ได้');
  assert.equal((await api('/reports', { m: 'POST', tok: B, body: { res: 'none' } })).s, 401, 'token เดิมบันทึกรายงานไม่ได้');
  U2 = (await api('/login', { m: 'POST', body: { u: 'somying', p: 'pass-somying' } })).j.token; /* token เดิมของ somying ใช้ไม่ได้แล้วจากเทสต์ปิด/เปิดใช้งาน */
  assert.equal((await api('/me', { tok: S })).j.user.u, 'somying', 'บัญชีอื่นไม่กระทบ');
  U1 = await lg(); assert.equal((await api('/me', { tok: U1 })).j.user.u, 'somchai', 'เข้าสู่ระบบใหม่ได้');
});
test('E3 ออกจากระบบทุกอุปกรณ์: ผู้ดูแลหลัก (meta.rv) — token เดิมใช้ไม่ได้ รหัสผ่านเดิมยังเข้าได้', async () => {
  const old = ADM; assert.equal((await api('/logout-all', { m: 'POST', tok: old })).s, 200);
  assert.equal((await api('/me', { tok: old })).j.user, null); assert.equal((await api('/users', { tok: old })).s, 401);
  const n = await api('/login', { m: 'POST', body: { u: 'admin', p: 'admin-secret-pass' } }); assert.equal(n.s, 200); ADM = n.j.token;
  assert.equal((await api('/me', { tok: ADM })).j.user.root, true); assert.notEqual(ADM, old);
});
test('E3 บันทึกการใช้งาน: เปลี่ยนรหัส/ตั้งรหัสใหม่/ล็อก ลงบันทึกโดยไม่มีรหัสผ่าน', async () => {
  assert.equal((await api('/users', { m: 'POST', tok: ADM, body: { u: 'lockme', p: 'pass-lockme', d: 'ทดสอบล็อก' } })).s, 200);
  const T = (await api('/login', { m: 'POST', body: { u: 'lockme', p: 'pass-lockme' } })).j.token;
  assert.equal((await api('/password', { m: 'POST', tok: T, body: { old: 'pass-lockme', p: 'new-pass-1234' } })).s, 200);
  assert.equal((await api('/users/lockme', { m: 'PUT', tok: ADM, body: { p: 'reset-pass-999', x: true } })).s, 200);
  for (let i = 0; i < 8; i++) await api('/login', { m: 'POST', body: { u: 'lockme', p: 'wrong-pass-x' } });
  for (let i = 0; i < 8; i++) await api('/login', { m: 'POST', body: { u: 'wrong-pass-x', p: 'y' } }); // ชื่อที่ไม่มีจริง (เช่น พิมพ์รหัสผ่านผิดช่อง) ไม่ลงบันทึก
  const L = (await api('/log', { tok: ADM })).j.log;
  assert.ok(L.find(e => e.a === 'password' && e.u === 'lockme'));
  const ue = L.find(e => e.a === 'user-edit' && e.id === 'lockme'); assert.ok(ue && /ตั้งรหัสผ่านใหม่/.test(ue.x) && /ปิดใช้งาน/.test(ue.x), JSON.stringify(ue));
  assert.equal(L.filter(e => e.a === 'lock').length, 1); assert.equal(L.find(e => e.a === 'lock').u, 'lockme');
  assert.ok(!JSON.stringify(L).includes('wrong-pass-x'));
});
test('E3 บันทึกการใช้งาน: ครอบ /layers /reports ผู้ใช้ กลุ่ม login · ไม่มีรหัสผ่าน/token/เนื้อหารายงาน', async () => {
  const r = await api('/log', { tok: ADM }); assert.equal(r.s, 200); assert.equal(r.j.max, 200);
  const L = r.j.log, acts = new Set(L.map(e => e.a));
  for (const a of ['login', 'logout-all', 'password', 'lock', 'layer-add', 'layer-edit', 'layer-data', 'layer-del', 'rep-add', 'rep-edit', 'rep-del', 'rep-repair', 'user-add', 'user-edit', 'group-add'])
    assert.ok(acts.has(a), 'ไม่มีการกระทำ ' + a + ' ใน ' + [...acts]);
  for (const e of L) {
    assert.ok(e.t > 0 && typeof e.u === 'string' && typeof e.a === 'string');
    assert.deepEqual(Object.keys(e).filter(k => !['t', 'u', 'd', 'a', 'k', 'id', 'n', 'fy', 'x'].includes(k)), [], 'ช่องเกิน: ' + JSON.stringify(e));
  }
  assert.ok(L[0].t >= L[L.length - 1].t, 'ใหม่สุดก่อน');
  const ra = L.find(e => e.a === 'rep-add'); assert.equal(ra.k, 'report'); assert.ok(ra.fy >= 2569); assert.equal(ra.u, ra.u.toLowerCase());
  assert.ok(L.find(e => e.a === 'rep-edit' && e.u === 'admin'), 'ผู้ดูแลแก้รายงานของคนอื่นลงชื่อผู้ดูแล');
  const la = L.find(e => e.a === 'layer-add' && e.n === 'แปลงทดสอบ'); assert.ok(la && la.k === 'layer' && la.u === 'admin');
  const s = JSON.stringify(L) + kv.m.get('log');
  for (const x of SECRETS()) assert.ok(!s.includes(x), 'บันทึกมีข้อมูลลับ: ' + x.slice(0, 12));
  assert.ok(!/Bearer|"p":|"h":|"s":|token/i.test(s), 'ไม่มี token/แฮชรหัสผ่าน');
  assert.ok(!s.includes('ตรวจแล้วเป็นควันจากเผาไร่นอกเขต'), 'ไม่เก็บเนื้อหารายงาน (note)');
});
test('E3 บันทึกการใช้งาน: ผู้ใช้ทั่วไปอ่านไม่ได้ (403) · ไม่ล็อกอิน 401 · ผู้ดูแลที่ไม่ใช่ admin อ่านได้', async () => {
  assert.equal((await api('/log', { tok: U1 })).s, 403);
  assert.equal((await api('/log')).s, 401);
  assert.equal((await api('/users', { m: 'POST', tok: ADM, body: { u: 'boss', p: 'pass-boss-01', d: 'หัวหน้า', a: true } })).s, 200);
  const B = (await api('/login', { m: 'POST', body: { u: 'boss', p: 'pass-boss-01' } })).j.token;
  const r = await api('/log', { tok: B }); assert.equal(r.s, 200); assert.ok(r.j.log.length > 0);
});
test('E3 บันทึกการใช้งานเก็บ 200 รายการล่าสุด', async () => {
  const g = (await api('/groups', { m: 'POST', tok: ADM, body: { n: 'กลุ่มนับ' } })).j.group;
  for (let i = 0; i < 210; i++) await api('/groups/' + g.id, { m: 'PUT', tok: ADM, body: { n: 'กลุ่มนับ ' + i } });
  const L = (await api('/log', { tok: ADM })).j.log;
  assert.equal(L.length, 200); assert.equal(L[0].n, 'กลุ่มนับ 209'); assert.equal(L[0].x, 'เดิม กลุ่มนับ 208'); assert.equal(L[199].n, 'กลุ่มนับ 10');
});
test('E3 บันทึกล้มเหลวไม่ทำให้คำสั่งหลักล้ม', async () => {
  const p0 = kv.put.bind(kv); kv.put = (k, v, o) => k === 'log' ? Promise.reject(new Error('KV write limit')) : p0(k, v, o);
  try { const r = await api('/groups', { m: 'POST', tok: ADM, body: { n: 'ระหว่าง KV เต็ม' } }); assert.equal(r.s, 200) } finally { kv.put = p0 }
});
