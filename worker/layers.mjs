// Cloudflare Worker (ฟรี) ระบบหลังบ้านชั้นข้อมูลของแผนที่ไฟป่า — คู่มือติดตั้ง docs/layers-backend.md
// ตั้งค่าใน Cloudflare: KV binding ชื่อ LAYERS · Secret ADMIN_PASS (รหัสผ่านผู้ดูแลหลัก ชื่อผู้ใช้ admin)
//   ไม่บังคับ: Secret TOKEN_KEY (กุญแจลงชื่อ token — ไม่ตั้ง = ใช้ ADMIN_PASS) · Variable ADMIN_USER (ไม่ตั้ง = admin)
// KV: "meta" = {users:{ชื่อ:{d,s,h,g[],a,x,v,c}}, groups:[{id,n}], layers:[{id,name,desc,color,on,dl,acl,n,kb,upd,by}]}
//     "d:<id>" = GeoJSON ของชั้น (เก็บเป็นข้อความตามที่อัปโหลด ไม่ parse — Worker ฟรีจำกัด CPU 10 ms)
// สิทธิ์ดูชั้น acl.m: all = ทุกคน (ไม่ต้องล็อกอิน) · login = ผู้ที่ล็อกอิน · some = เฉพาะกลุ่ม acl.g / ผู้ใช้ acl.u · ผู้ดูแลเห็นทุกชั้น
// แก้ไขได้เฉพาะผู้ดูแล (a = true หรือผู้ดูแลหลัก)
// F1 (16 พ.ย. 69) รายงานผลตรวจสอบจุดความร้อน/การดับไฟจากหน้างาน — docs/arch/ui-modules.md หัวข้อ "รายงานผลตรวจสอบ"
//     "rep:<ปีงบ>" = [ระเบียน] (ดัชนีต่อปีงบ อ่าน 1 ครั้งต่อรอบ site) · "r:<id>" = สำเนาระเบียนเดี่ยว (ตาข่ายนิรภัย: POST /reports/repair สร้างดัชนีใหม่จากสำเนา)
//     ระเบียน {id,fy,hk,hs:{la,lo,t,sat},res,rai,cs,rp,ta,te,un,pl,moo,note,pos,ar,st,tm,trk,by:{u,d},c,m} — เฟสแรกไม่เก็บภาพ (ผู้ใช้ตัดสิน 16 พ.ย. 69)
//     F7 (18 พ.ย. 69) เส้นทางเดินที่แนบ: ส่ง trk {c:[lon,lat,…] ≤500 จุด, t0,t1,km,up,dn,n} → พิกัดเก็บแยกคีย์ "t:<id>" (ไม่อยู่ในดัชนี rep:<fy> — ดัชนีใหญ่ = JSON.parse เกิน CPU 10 ms)
//       ระเบียนเก็บแค่สรุป trk {m,n,km,up,dn,t0,t1} · GET /reports/<id>/trk อ่านได้ทุกคน (เหมือนรายงาน) · trk:null = ลบ · ผิดรูป = ไม่ใช้ · body ≤ 8 KB + เส้นทาง 16 KB
//     อ่าน = ทุกคน (สาธารณะ) · บันทึก = ผู้ใช้ที่ล็อกอิน · แก้/ลบ = เจ้าของภายใน 24 ชม. หรือผู้ดูแล
// E3 (17 พ.ย. 69): อัปโหลดชั้นไม่เกิน 8 MB (ตอบ 413) · POST /logout-all = ออกจากระบบทุกอุปกรณ์ (เปลี่ยน v ของบัญชีตัวเอง; ผู้ดูแลหลักใช้ meta.rv)
//     "log" = บันทึกการใช้งาน 200 รายการล่าสุด [{t,u,d,a,k,id,n,fy,x}] (ใคร/การกระทำ/ชั้นหรือรายงาน/เวลา — ไม่เก็บรหัสผ่าน/token/เนื้อหาข้อมูล) · GET /log เฉพาะผู้ดูแล
//     KV ไม่มี transaction: สองคำขอพร้อมกันอาจทำให้บันทึกหายบางรายการ (บันทึกเป็นตัวช่วยตรวจสอบ ไม่ใช่หลักฐานครบถ้วน)
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type,x-meta', 'access-control-expose-headers': 'x-upd', 'access-control-max-age': '86400' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
const E = (m, s = 400) => J({ error: m }, s);
const te = new TextEncoder(), td = new TextDecoder();
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const MAXD = 8 * 1024 * 1024; // E3: 8 MB ต่อชั้น (KV รับค่าได้ 25 MiB — เดิมยอม 20 MB) · นับเป็นไบต์ของ body
const USER_RE = /^[a-z0-9_.-]{3,32}$/;
const ITER = 10000; // PBKDF2 — มากกว่านี้เสี่ยงเกิน CPU 10 ms ของ Worker ฟรี (เก็บจำนวนรอบไว้ในบัญชี r.i เผื่อเปลี่ยนภายหลัง)

async function pwHash(p, salt, it = ITER) {
  const k = await crypto.subtle.importKey('raw', te.encode(p), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, k, 256));
}
const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return !r };
async function hmac(env, s) {
  const k = await crypto.subtle.importKey('raw', te.encode(env.TOKEN_KEY || 'tok:' + env.ADMIN_PASS), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, te.encode(s)));
}
async function sha(s, n = 10) { return b64u(await crypto.subtle.digest('SHA-256', te.encode(s))).slice(0, n) } // n = 10: รุ่นรหัสใน token
const rid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''); // ตัวอักษร a-f0-9 เท่านั้น (หน้าเว็บใช้รหัสชั้นในชื่อเลเยอร์)

async function getMeta(env) {
  const m = await env.LAYERS.get('meta', { type: 'json' });
  return Object.assign({ users: {}, groups: [], layers: [] }, m || {});
}
const putMeta = (env, m) => env.LAYERS.put('meta', JSON.stringify(m));
const rootV = (env, M) => sha(M.rv ? env.ADMIN_PASS + '|' + M.rv : env.ADMIN_PASS);
// บันทึกการใช้งาน (E3) — รับเฉพาะช่องที่กำหนด ตัดความยาว · ไม่ให้ความล้มเหลวของบันทึกทำให้คำสั่งหลักล้ม
const LOG_MAX = 200, LOGK = ['k', 'id', 'n', 'fy', 'x'];
async function audit(env, U, a, o = {}) {
  try {
    const L = await env.LAYERS.get('log', { type: 'json' }) || [], e = { t: Date.now(), u: U ? String(U.u) : '', d: U ? txt(U.d, 80) : '', a };
    for (const k of LOGK) if (o[k] != null && o[k] !== '') e[k] = typeof o[k] === 'number' ? o[k] : txt(o[k], 160);
    L.unshift(e); await env.LAYERS.put('log', JSON.stringify(L.slice(0, LOG_MAX)));
  } catch (e) { }
}

// ผู้ใช้จาก token: {u, d, a, g[]} หรือ null · v = รุ่นรหัสผ่าน (เปลี่ยนรหัส/ปิดบัญชี = token เก่าใช้ไม่ได้)
async function who(req, env, M) {
  const h = req.headers.get('authorization') || '', t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [p, s] = t.split('.');
  if (!p || !s || !same(s, await hmac(env, p))) return null;
  let o; try { o = JSON.parse(td.decode(ub64(p))) } catch { return null }
  if (!o.exp || o.exp < Date.now()) return null;
  const AU = env.ADMIN_USER || 'admin';
  if (o.u === AU) return o.v === await rootV(env, M) ? { u: AU, d: 'ผู้ดูแลหลัก', a: true, g: [], root: true } : null;
  const r = M.users[o.u];
  if (!r || r.x || r.v !== o.v) return null;
  return { u: o.u, d: r.d || o.u, a: !!r.a, g: r.g || [] };
}
const canSee = (L, U) => U && U.a || L.acl.m === 'all' || U && (L.acl.m === 'login' || (L.acl.g || []).some(g => U.g.includes(g)) || (L.acl.u || []).includes(U.u));
const pubL = (L, U) => { const o = { id: L.id, name: L.name, desc: L.desc || '', color: L.color, on: !!L.on, dl: L.dl !== false, n: L.n || 0, kb: L.kb || 0, upd: L.upd, typ: L.typ || '' }; if (U && U.a) { o.acl = L.acl; o.by = L.by } return o };
const pubU = (k, r) => ({ u: k, d: r.d || '', g: r.g || [], a: !!r.a, x: !!r.x, c: r.c || 0, last: r.last || 0 });
function cleanAcl(a, M) {
  a = a || {}; const m = ['all', 'login', 'some'].includes(a.m) ? a.m : 'login';
  const gs = new Set(M.groups.map(g => g.id));
  return { m, g: (a.g || []).filter(g => gs.has(g)), u: (a.u || []).filter(u => M.users[u]) };
}
const txt = (s, n) => String(s == null ? '' : s).slice(0, n);
const COLOR = /^#[0-9a-f]{6}$/i;
function applyLayer(L, b, M) {
  if (b.name != null) L.name = txt(b.name, 120) || 'ชั้นข้อมูล';
  if (b.desc != null) L.desc = txt(b.desc, 2000);
  if (b.color != null && COLOR.test(b.color)) L.color = b.color;
  if (b.on != null) L.on = !!b.on;
  if (b.dl != null) L.dl = !!b.dl;
  if (b.acl != null) L.acl = cleanAcl(b.acl, M);
  if (b.n != null) L.n = Math.max(0, b.n | 0);
  if (b.typ != null) L.typ = txt(b.typ, 40);
}
function metaHdr(req) { const h = req.headers.get('x-meta'); if (!h) return {}; try { return JSON.parse(td.decode(ub64(h))) } catch { return {} } }
const tooBig = n => Object.assign(new Error(`ไฟล์ใหญ่เกิน 8 MB (ขนาด ${(n / 1048576).toFixed(1)} MB) — ลดจำนวนวัตถุ/จุดของเส้น หรือแบ่งเป็นหลายชั้น`), { s: 413 });
async function readData(req) {
  const cl = +req.headers.get('content-length'); if (cl > MAXD) throw tooBig(cl); // ตัดก่อนอ่าน body
  const ab = await req.arrayBuffer(); if (ab.byteLength > MAXD) throw tooBig(ab.byteLength);
  const t = td.decode(ab);
  if (!/^\s*\{/.test(t) || !/"FeatureCollection"/.test(t.slice(0, 2000))) throw Object.assign(new Error('ข้อมูลต้องเป็น GeoJSON FeatureCollection'), { s: 400 });
  return t;
}


// ---- F1 รายงานผลตรวจสอบจากหน้างาน ----
const RES = ['fire', 'none', 'out', 'plan']; // พบไฟกำลังไหม้ · ไม่พบไฟ · ดับแล้ว · เผาตามแผน (ชิงเผา)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/, REP_EDIT_MS = 24 * 36e5, REP_MAX = 8 * 1024;
const fyOfMs = ms => { const d = new Date(ms + 7 * 36e5); return d.getUTCFullYear() + 543 + (d.getUTCMonth() >= 9 ? 1 : 0) }; // ปีงบไทย (ต.ค. = ปีถัดไป)
const num = (v, lo, hi, dp) => { v = +v; if (!isFinite(v) || v < lo || v > hi) return null; return dp == null ? v : +v.toFixed(dp) };
const idx = (v, hi) => v == null || v === '' ? null : (Number.isInteger(+v) && +v >= 0 && +v <= hi ? +v : null);
const repKey = fy => 'rep:' + fy;
const TRK_MAX = 16 * 1024, TRK_PTS = 500; // F7: ส่วนเส้นทางของ body (ตัวอักษร) · จำนวนจุดสูงสุด (หน้าเว็บย่อด้วย Douglas-Peucker ก่อนส่ง)
// เส้นทางที่แนบ → {c (พิกัดปัด 5 ตำแหน่ง ≈1 ม.), s (สรุปในระเบียน)} · ผิดรูป/เกิน 500 จุด = null (ไม่ใช้ ตามกติกาค่าผิดรูปของ applyRep)
function trkClean(t) {
  if (!t || !Array.isArray(t.c) || t.c.length < 4 || t.c.length > TRK_PTS * 2 || t.c.length % 2) return null;
  const c = []; for (let i = 0; i < t.c.length; i += 2) { const lo = num(t.c[i], -180, 180, 5), la = num(t.c[i + 1], -90, 90, 5); if (lo == null || la == null) return null; c.push(lo, la) }
  const t0 = num(t.t0, 0, 4e12, 0), t1 = num(t.t1, 0, 4e12, 0);
  return { c, s: { m: c.length / 2, n: num(t.n, 0, 1e7, 0) ?? c.length / 2, km: num(t.km, 0, 1e4, 3), up: num(t.up, 0, 1e5, 0), dn: num(t.dn, 0, 1e5, 0), t0, t1: t0 != null && t1 != null && t1 >= t0 ? t1 : null } };
}
// อ่าน body รายงาน: ≤ 8 KB ไม่นับเส้นทาง (เดิม) + เส้นทาง ≤ 16 KB
async function repBody(req) {
  const t = await req.text(); if (t.length > REP_MAX + TRK_MAX) throw Object.assign(new Error('ข้อมูลรายงานใหญ่เกิน 8 KB (+ เส้นทาง 16 KB)'), { s: 413 });
  let b; try { b = JSON.parse(t) } catch { throw Object.assign(new Error('ข้อมูลไม่ใช่ JSON'), { s: 400 }) }
  if (!b || typeof b !== 'object') throw Object.assign(new Error('ข้อมูลไม่ใช่ JSON'), { s: 400 });
  const tl = b.trk ? JSON.stringify(b.trk).length : 0;
  if (t.length - tl > REP_MAX) throw Object.assign(new Error('ข้อมูลรายงานใหญ่เกิน 8 KB'), { s: 413 });
  return b;
}
// บันทึก/ลบเส้นทางของระเบียน r ตาม b.trk (undefined = ไม่แตะ) — เรียกก่อนเขียน r:<id>/ดัชนี
async function repTrk(env, r, b) {
  if (b.trk === undefined) return;
  const k = b.trk === null ? null : trkClean(b.trk);
  if (k) { await env.LAYERS.put('t:' + r.id, JSON.stringify({ c: k.c, ...k.s })); r.trk = k.s }
  else { if (r.trk) await env.LAYERS.delete('t:' + r.id); r.trk = null }
}
async function getRep(env, fy) { return await env.LAYERS.get(repKey(fy), { type: 'json' }) || [] }
async function putRep(env, fy, L) { await env.LAYERS.put(repKey(fy), JSON.stringify(L)) }
// ค่าที่รับจากฟอร์ม (สร้างและแก้ใช้ตัวเดียวกัน) — ค่าผิดรูป = ไม่ใช้/ตัด ไม่ปฏิเสธทั้งระเบียน ยกเว้น res
function applyRep(r, b) {
  if (b.res != null) { if (!RES.includes(b.res)) throw Object.assign(new Error('ผลการตรวจสอบไม่ถูกต้อง'), { s: 400 }); r.res = b.res }
  if (b.hk !== undefined) r.hk = b.hk == null ? null : txt(b.hk, 60);
  if (b.hs !== undefined) { const h = b.hs || {}, la = num(h.la, -90, 90, 5), lo = num(h.lo, -180, 180, 5), t = num(h.t, 0, 4e12, 0); r.hs = la != null && lo != null && t != null ? { la, lo, t, sat: txt(h.sat, 20) } : null }
  if (b.rai !== undefined) r.rai = num(b.rai, 0, 1e5, 2) ?? 0;
  if (b.cs !== undefined) r.cs = idx(b.cs, 99);
  if (b.rp !== undefined) r.rp = idx(b.rp, 99);
  if (b.ta !== undefined) r.ta = HHMM.test(b.ta || '') ? b.ta : null;
  if (b.te !== undefined) r.te = HHMM.test(b.te || '') ? b.te : null;
  for (const [k, n] of [['un', 200], ['pl', 200], ['moo', 20], ['note', 1000], ['ar', 120], ['st', 120], ['tm', 160]]) if (b[k] !== undefined) r[k] = txt(b[k], n);
  if (b.pos !== undefined) { const p = Array.isArray(b.pos) ? b.pos : [], lo = num(p[0], -180, 180, 6), la = num(p[1], -90, 90, 6); r.pos = lo != null && la != null ? [lo, la, num(p[2], 0, 1e6, 0) ?? 0] : null }
}
const repOwn = (r, U, now) => !!U && (U.a || (r.by && r.by.u === U.u && now - r.c < REP_EDIT_MS));
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url), P = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean), m = req.method;
    if (!P.length) return J({ ok: true, app: 'fire-map layers', kv: !!env.LAYERS, admin: !!env.ADMIN_PASS, rep: true, log: true, trk: true, max_mb: MAXD / 1048576 });
    if (!env.LAYERS) return E('ยังไม่ได้ผูก KV ชื่อ LAYERS กับ Worker นี้', 500);
    if (!env.ADMIN_PASS) return E('ยังไม่ได้ตั้ง Secret ADMIN_PASS', 500);
    try {
      const M = await getMeta(env), U = await who(req, env, M), AU = env.ADMIN_USER || 'admin';
      const body = async () => { try { return await req.json() } catch { return {} } };
      const adm = () => { if (!U || !U.a) throw Object.assign(new Error(U ? 'ต้องเป็นผู้ดูแล' : 'กรุณาเข้าสู่ระบบ'), { s: U ? 403 : 401 }) };
      const [r0, r1, r2] = P;

      if (r0 === 'login' && m === 'POST') {
        const b = await body(), u = String(b.u || '').trim().toLowerCase(), p = String(b.p || '');
        const fk = 'f:' + u.slice(0, 40), f = await env.LAYERS.get(fk, { type: 'json' }) || { n: 0 };
        if (f.n >= 8) return E('ใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาที', 429);
        let ok = null;
        if (u === AU) { if (same(await sha(p, 99), await sha(env.ADMIN_PASS, 99))) ok = { u, v: await rootV(env, M), d: 'ผู้ดูแลหลัก', a: true, g: [], root: true } }
        else { const r = M.users[u]; if (r && !r.x && same(await pwHash(p, ub64(r.s), r.i || ITER), r.h)) ok = { u, v: r.v, d: r.d || u, a: !!r.a, g: r.g || [] } }
        if (!ok) { await env.LAYERS.put(fk, JSON.stringify({ n: f.n + 1 }), { expirationTtl: 900 });
          if (f.n + 1 === 8 && (u === AU || M.users[u])) await audit(env, { u, d: (M.users[u] || {}).d || '' }, 'lock', { k: 'auth', x: 'ใส่รหัสผิด 8 ครั้ง ล็อก 15 นาที' }); // บันทึกเฉพาะชื่อที่มีจริง (กันรหัสผ่านที่พิมพ์ผิดช่องลงบันทึก)
          return E('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401) }
        await audit(env, ok, 'login', { k: 'auth' });
        const pay = b64u(te.encode(JSON.stringify({ u, v: ok.v, exp: Date.now() + 30 * 864e5 })));
        return J({ token: pay + '.' + await hmac(env, pay), user: { u, d: ok.d, a: ok.a, g: ok.g, root: !!ok.root } });
      }
      if (r0 === 'me' && m === 'GET') return J({ user: U && { u: U.u, d: U.d, a: U.a, g: U.g, root: !!U.root } });
      if (r0 === 'logout-all' && m === 'POST') { // E3 ออกจากระบบทุกอุปกรณ์ (รวมเครื่องนี้) — token ทุกใบของบัญชีนี้ใช้ไม่ได้ทันที
        if (!U) return E('กรุณาเข้าสู่ระบบ', 401);
        if (U.root) M.rv = rid(); else M.users[U.u].v = rid();
        await putMeta(env, M); await audit(env, U, 'logout-all', { k: 'auth' }); return J({ ok: true });
      }
      if (r0 === 'log' && m === 'GET') { adm(); return J({ log: await env.LAYERS.get('log', { type: 'json' }) || [], max: LOG_MAX }) }
      if (r0 === 'password' && m === 'POST') { // เปลี่ยนรหัสผ่านตัวเอง (ผู้ดูแลหลักเปลี่ยนที่ Secret ADMIN_PASS)
        if (!U) return E('กรุณาเข้าสู่ระบบ', 401); if (U.root) return E('ผู้ดูแลหลักเปลี่ยนรหัสผ่านที่ Secret ADMIN_PASS ใน Cloudflare');
        const b = await body(), r = M.users[U.u];
        if (!same(await pwHash(String(b.old || ''), ub64(r.s), r.i || ITER), r.h)) return E('รหัสผ่านเดิมไม่ถูกต้อง', 401);
        if (String(b.p || '').length < 8) return E('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');
        const s = crypto.getRandomValues(new Uint8Array(16)); r.s = b64u(s); r.h = await pwHash(String(b.p), s); r.i = ITER; r.v = rid(); await putMeta(env, M);
        await audit(env, U, 'password', { k: 'auth' }); return J({ ok: true });
      }

      if (r0 === 'layers') {
        if (!r1 && m === 'GET') return J({ layers: M.layers.filter(L => canSee(L, U)).map(L => pubL(L, U)), groups: U && U.a ? M.groups : undefined });
        if (!r1 && m === 'POST') { // body = GeoJSON, x-meta = ข้อมูลชั้น (base64url JSON)
          adm(); const d = await readData(req), b = metaHdr(req), L = { id: rid(), name: 'ชั้นข้อมูล', color: '#e8741c', on: false, dl: true, acl: { m: 'login', g: [], u: [] } };
          applyLayer(L, b, M); L.kb = Math.round(d.length / 1024); L.upd = Date.now(); L.by = U.u;
          await env.LAYERS.put('d:' + L.id, d); M.layers.push(L); await putMeta(env, M);
          await audit(env, U, 'layer-add', { k: 'layer', id: L.id, n: L.name, x: L.kb + ' KB' }); return J({ layer: pubL(L, U) });
        }
        const L = M.layers.find(x => x.id === r1);
        if (!L) return E('ไม่พบชั้นข้อมูล', 404);
        if (!r2 && m === 'GET') {
          if (!canSee(L, U)) return E(U ? 'ไม่มีสิทธิ์ดูชั้นนี้' : 'กรุณาเข้าสู่ระบบ', U ? 403 : 401);
          const s = await env.LAYERS.get('d:' + L.id, { type: 'stream' });
          if (!s) return E('ไม่พบข้อมูลของชั้น', 404);
          return new Response(s, { headers: { 'content-type': 'application/geo+json; charset=utf-8', 'cache-control': 'no-store', 'x-upd': String(L.upd), ...CORS } });
        }
        adm();
        if (!r2 && m === 'PUT') { applyLayer(L, await body(), M); L.upd = Date.now(); await putMeta(env, M); await audit(env, U, 'layer-edit', { k: 'layer', id: L.id, n: L.name }); return J({ layer: pubL(L, U) }) }
        if (r2 === 'data' && m === 'PUT') {
          const d = await readData(req); applyLayer(L, metaHdr(req), M); L.kb = Math.round(d.length / 1024); L.upd = Date.now(); L.by = U.u;
          await env.LAYERS.put('d:' + L.id, d); await putMeta(env, M); await audit(env, U, 'layer-data', { k: 'layer', id: L.id, n: L.name, x: L.kb + ' KB' }); return J({ layer: pubL(L, U) });
        }
        if (!r2 && m === 'DELETE') { M.layers = M.layers.filter(x => x !== L); await putMeta(env, M); await env.LAYERS.delete('d:' + L.id); await audit(env, U, 'layer-del', { k: 'layer', id: L.id, n: L.name }); return J({ ok: true }) }
      }

      if (r0 === 'users') {
        adm();
        if (!r1 && m === 'GET') return J({ users: Object.entries(M.users).map(([k, r]) => pubU(k, r)).sort((a, b) => a.u.localeCompare(b.u)), groups: M.groups, root: AU });
        if (!r1 && m === 'POST') {
          const b = await body(), u = String(b.u || '').trim().toLowerCase();
          if (!USER_RE.test(u)) return E('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 _ . - ยาว 3–32 ตัว');
          if (u === AU || M.users[u]) return E('มีชื่อผู้ใช้นี้แล้ว', 409);
          if (String(b.p || '').length < 8) return E('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
          const s = crypto.getRandomValues(new Uint8Array(16)), gs = new Set(M.groups.map(g => g.id));
          M.users[u] = { d: txt(b.d, 80), s: b64u(s), h: await pwHash(String(b.p), s), i: ITER, g: (b.g || []).filter(g => gs.has(g)), a: !!b.a, x: false, v: rid(), c: Date.now() };
          await putMeta(env, M); await audit(env, U, 'user-add', { k: 'user', id: u, n: M.users[u].d, x: M.users[u].a ? 'ผู้ดูแล' : '' }); return J({ user: pubU(u, M.users[u]) });
        }
        const r = M.users[r1]; if (!r) return E('ไม่พบผู้ใช้', 404);
        if (m === 'PUT') {
          const b = await body(), gs = new Set(M.groups.map(g => g.id)), ch = [];
          if (b.d != null && txt(b.d, 80) !== (r.d || '')) { r.d = txt(b.d, 80); ch.push('ชื่อที่แสดง') }
          if (b.g != null) { const g = b.g.filter(g => gs.has(g)); if (g.join() !== (r.g || []).join()) ch.push('กลุ่ม'); r.g = g }
          if (b.a != null && !!b.a !== !!r.a) { r.a = !!b.a; ch.push(r.a ? 'ให้สิทธิ์ผู้ดูแล' : 'ถอนสิทธิ์ผู้ดูแล') }
          if (b.x != null && !!b.x !== !!r.x) { r.x = !!b.x; r.v = rid(); ch.push(r.x ? 'ปิดใช้งาน' : 'เปิดใช้งาน') }
          if (b.p) { if (String(b.p).length < 8) return E('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'); const s = crypto.getRandomValues(new Uint8Array(16)); r.s = b64u(s); r.h = await pwHash(String(b.p), s); r.i = ITER; r.v = rid(); ch.push('ตั้งรหัสผ่านใหม่') }
          await putMeta(env, M); await audit(env, U, 'user-edit', { k: 'user', id: r1, n: r.d, x: ch.join(' · ') }); return J({ user: pubU(r1, r) });
        }
        if (m === 'DELETE') { const dn = r.d; delete M.users[r1]; M.layers.forEach(L => { L.acl.u = (L.acl.u || []).filter(u => u !== r1) }); await putMeta(env, M); await audit(env, U, 'user-del', { k: 'user', id: r1, n: dn }); return J({ ok: true }) }
      }

      if (r0 === 'groups') {
        adm();
        if (!r1 && m === 'GET') return J({ groups: M.groups });
        if (!r1 && m === 'POST') { const b = await body(), n = txt(b.n, 80).trim(); if (!n) return E('กรุณาใส่ชื่อกลุ่ม'); const g = { id: rid().slice(0, 8), n }; M.groups.push(g); await putMeta(env, M); await audit(env, U, 'group-add', { k: 'group', id: g.id, n }); return J({ group: g }) }
        const g = M.groups.find(x => x.id === r1); if (!g) return E('ไม่พบกลุ่ม', 404);
        if (m === 'PUT') { const b = await body(), o = g.n; if (b.n) g.n = txt(b.n, 80).trim() || g.n; await putMeta(env, M); await audit(env, U, 'group-edit', { k: 'group', id: g.id, n: g.n, x: o !== g.n ? 'เดิม ' + o : '' }); return J({ group: g }) }
        if (m === 'DELETE') {
          M.groups = M.groups.filter(x => x !== g);
          Object.values(M.users).forEach(r => { r.g = (r.g || []).filter(x => x !== g.id) });
          M.layers.forEach(L => { L.acl.g = (L.acl.g || []).filter(x => x !== g.id) });
          await putMeta(env, M); await audit(env, U, 'group-del', { k: 'group', id: g.id, n: g.n }); return J({ ok: true });
        }
      }
      if (r0 === 'reports') {
        const now = Date.now();
        if (!r1 && m === 'GET') { const fy = +url.searchParams.get('fy') || fyOfMs(now); return J({ fy, reports: await getRep(env, fy) }) }
        if (r1 && P[2] === 'trk' && m === 'GET') { const t = /^[a-f0-9]{1,32}$/.test(r1) ? await env.LAYERS.get('t:' + r1, { type: 'json' }) : null; return t ? J({ id: r1, trk: t }) : E('ไม่พบเส้นทางของรายงานนี้', 404) }
        if (!U) return E('กรุณาเข้าสู่ระบบ', 401);
        if (!r1 && m === 'POST') {
          const b = await repBody(req);
          if (!RES.includes(b.res)) return E('กรุณาเลือกผลการตรวจสอบ');
          const r = { id: rid(), hk: null, hs: null, res: b.res, rai: 0, cs: null, rp: null, ta: null, te: null, un: '', pl: '', moo: '', note: '', pos: null, ar: '', st: '', tm: '', by: { u: U.u, d: U.d }, c: now, m: now };
          applyRep(r, b); r.fy = fyOfMs(r.hs ? r.hs.t : now); r.trk = null; await repTrk(env, r, b);
          const L = await getRep(env, r.fy); L.push(r);
          await env.LAYERS.put('r:' + r.id, JSON.stringify(r)); await putRep(env, r.fy, L);
          await audit(env, U, 'rep-add', { k: 'report', id: r.id, fy: r.fy, n: r.tm || r.ar, x: r.res }); return J({ report: r });
        }
        if (r1 === 'repair' && m === 'POST') { // ผู้ดูแล: สร้างดัชนี rep:<fy> ใหม่จากสำเนา r:<id> (กรณีเขียนชนกัน)
          adm(); const fy = +url.searchParams.get('fy') || fyOfMs(now), L = [];
          let cur; do { const l = await env.LAYERS.list({ prefix: 'r:', cursor: cur }); for (const k of l.keys) { const r = await env.LAYERS.get(k.name, { type: 'json' }); if (r && r.fy === fy) L.push(r) } cur = l.list_complete ? null : l.cursor } while (cur);
          L.sort((a, b) => a.c - b.c); await putRep(env, fy, L); await audit(env, U, 'rep-repair', { k: 'report', fy, x: L.length + ' รายการ' }); return J({ fy, n: L.length });
        }
        const fy = +url.searchParams.get('fy') || fyOfMs(now), L = await getRep(env, fy), r = L.find(x => x.id === r1);
        if (!r) return E('ไม่พบรายงาน (ระบุ ?fy= ให้ตรงปีงบ)', 404);
        if (!repOwn(r, U, now)) return E(r.by && r.by.u === U.u ? 'แก้ไขได้ภายใน 24 ชม. หลังบันทึก (ติดต่อผู้ดูแล)' : 'แก้ไขได้เฉพาะเจ้าของรายงานหรือผู้ดูแล', 403);
        if (m === 'PUT') {
          const b = await repBody(req);
          applyRep(r, b); await repTrk(env, r, b); r.m = now; r.ed = { u: U.u, d: U.d };
          await env.LAYERS.put('r:' + r.id, JSON.stringify(r)); await putRep(env, fy, L); await audit(env, U, 'rep-edit', { k: 'report', id: r.id, fy, n: r.tm || r.ar, x: r.res }); return J({ report: r });
        }
        if (m === 'DELETE') { await putRep(env, fy, L.filter(x => x !== r)); await env.LAYERS.delete('r:' + r.id); if (r.trk) await env.LAYERS.delete('t:' + r.id); await audit(env, U, 'rep-del', { k: 'report', id: r.id, fy, n: r.tm || r.ar, x: r.res }); return J({ ok: true }) }
      }
      return E('ไม่พบคำสั่ง', 404);
    } catch (e) { return E(e.message || String(e), e.s || 500) }
  },
};
