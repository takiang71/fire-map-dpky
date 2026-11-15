// การเชื่อมต่อในหน้าเว็บ (ดึงโค้ดจริงจาก index.html): fetchT (A2 — เวลารอสูงสุด) · dbg/__LOG (A3) · slowMsg · สคริปต์ตรวจเบราว์เซอร์รุ่นเก่า (D8)
// fetch จำลอง: ไม่ต่อเน็ต — 'hang' = ไม่ตอบจนกว่า signal จะยกเลิก · 'down' = เครือข่ายล่ม · อื่นๆ = ตอบทันที
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load, HTML } = require('./helpers.cjs');
// timer ของ AbortSignal.timeout ใน Node เป็นแบบ unref (ไม่ค้ำ event loop) → ระหว่างรอให้มี timer ปกติค้ำไว้ ไม่งั้น Node บางรุ่นจบ process ก่อนครบเวลา (เบราว์เซอร์ไม่มีปัญหานี้)
const alive = p => { const k = setInterval(() => { }, 20); return p.finally(() => clearInterval(k)) };

const SRC = [
  grab(/const DBG=[^\n]*/), grab(/const dbg=[^\n]*/), grab(/const FTO=[^\n]*/),
  grab(/function fetchT\(u,opt,ms\)\{[\s\S]*?throw e\}\)\}/), grab(/const slowMsg=[^\n]*/),
].join('\n');
function env({ search = '', noTimeout = false } = {}) {
  const calls = [], warns = [];
  const AS = noTimeout ? { any: undefined } : AbortSignal;
  const fetch = (u, o) => { calls.push({ u, o }); if (u.startsWith('down')) return Promise.reject(new TypeError('Failed to fetch'));
    if (u !== 'hang') return Promise.resolve({ ok: true, u });
    return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(o.signal.reason || new DOMException('aborted', 'AbortError')))) };
  const window = { AbortSignal: noTimeout ? {} : AbortSignal };
  const W = load(SRC + '\nwindow.__LOG=window.__LOG;', ['dbg', 'FTO', 'fetchT', 'slowMsg', 'DBG'],
    { window, location: { search }, fetch, AbortSignal: AS, AbortController, DOMException, console: { warn: (...a) => warns.push(a) } });
  return Object.assign(W, { calls, warns, log: () => window.__LOG });
}

test('fetchT: ตอบทันที = ส่ง Response ต่อ · ใส่ signal เสมอ และไม่แก้ opt เดิม', async () => {
  const W = env(), opt = { cache: 'no-store' };
  const r = await W.fetchT('ok', opt, 1000);
  assert.equal(r.u, 'ok');
  assert.equal(W.calls[0].o.cache, 'no-store');
  assert.ok(W.calls[0].o.signal, 'มี signal');
  assert.deepEqual(opt, { cache: 'no-store' }, 'opt ของผู้เรียกไม่ถูกแก้');
  assert.deepEqual(W.log(), []);
});

test('fetchT: ไม่ตอบ → TimeoutError ตามเวลาที่กำหนด + บันทึกลง __LOG (ตัด query string)', async () => {
  const W = env(), t0 = Date.now();
  await assert.rejects(alive(W.fetchT('hang', {}, 150)), e => e.name === 'TimeoutError');
  assert.ok(Date.now() - t0 < 2000);
  const L = W.log();
  assert.equal(L.length, 1);
  assert.equal(L[0].tag, 'fetch hang');
  assert.equal(L[0].name, 'TimeoutError');
  assert.equal(W.slowMsg(Object.assign(new Error('x'), { name: 'TimeoutError' }), 'เดิม'), 'ต้นทางตอบช้า ลองใหม่');
  assert.equal(W.slowMsg(new TypeError('Failed to fetch'), 'เดิม'), 'เดิม');
});

test('fetchT: เบราว์เซอร์ไม่มี AbortSignal.timeout → ใช้ AbortController แทน แต่ยังได้ TimeoutError', async () => {
  const W = env({ noTimeout: true });
  await assert.rejects(alive(W.fetchT('hang', {}, 100)), e => e.name === 'TimeoutError' && /0.1 วินาที/.test(e.message));
  assert.equal(W.log()[0].name, 'TimeoutError');
});

test('fetchT: signal ของผู้เรียกยกเลิกได้ (ไม่บันทึกเป็นข้อผิดพลาด) · เครือข่ายล่ม = โยน error เดิม + บันทึก', async () => {
  const W = env(), ac = new AbortController();
  const p = W.fetchT('hang', { signal: ac.signal }, 5000); ac.abort();
  await assert.rejects(p, e => e.name === 'AbortError');
  assert.equal(W.log().length, 0, 'ผู้ใช้ยกเลิกเอง ไม่ใช่ข้อผิดพลาด');
  await assert.rejects(W.fetchT('down?x=1', {}), e => e instanceof TypeError);
  assert.deepEqual(W.log().map(x => [x.tag, x.name]), [['fetch down', 'TypeError']]);
  assert.equal(W.FTO.main, 20000, 'ค่าเริ่มต้น 20 วิ');
});

test('dbg: เก็บแค่ 200 รายการล่าสุด · console.warn เฉพาะ ?debug=1 · ค่าไม่ใช่ Error ก็เก็บได้', () => {
  const W = env();
  for (let i = 0; i < 250; i++) W.dbg('t' + i, new Error('e' + i));
  const L = W.log();
  assert.equal(L.length, 200);
  assert.deepEqual([L[0].tag, L[199].tag, L[199].msg], ['t50', 't249', 'e249']);
  W.dbg('สตริง', 'ข้อความ'); W.dbg('ว่าง', null);
  assert.deepEqual(W.log().slice(-2).map(x => x.msg), ['ข้อความ', 'null']);
  assert.equal(W.warns.length, 0);
  const D = env({ search: '?a=1&debug=1' }); D.dbg('x', new Error('y'));
  assert.equal(D.DBG, true); assert.equal(D.warns.length, 1);
  assert.equal(env({ search: '?debug=10' }).DBG, false);
});

test('ทุกการเรียกเครือข่ายในหน้าเว็บผ่าน fetchT (fetch( ตรงเหลือแห่งเดียวในตัว fetchT)', () => {
  const app = HTML.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
  const at = [...app.matchAll(/(?<![\w$.])fetch\(/g)].map(m => m.index), f = app.indexOf('function fetchT(');
  assert.equal(at.length, 1, 'พบ fetch( ' + at.length + ' แห่ง');
  assert.ok(at[0] > f && at[0] < f + 600, 'fetch( ที่เหลืออยู่ใน fetchT');
});

test('D8: สคริปต์ตรวจเบราว์เซอร์เก่าเป็นสคริปต์แรกสุด เขียนแบบ ES5 และตรวจครบทุกความสามารถที่แอปใช้', () => {
  const first = HTML.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
  assert.match(first, /เบราว์เซอร์รุ่นเก่า/);
  const code = first.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  for (const [k, re] of [['=>', /=>/], ['let/const', /\b(let|const|class)\s/], ['template', /`/], ['?.', /\?\./], ['??', /\?\?/], ['spread', /\.\.\./]])
    assert.doesNotMatch(code, re, 'ใช้ ' + k + ' ไม่ได้ในสคริปต์ ES5');
  for (const k of ['a?.b', 'a??1', '(?<=x)y', '.at(-1)', 'DecompressionStream', 'structuredClone']) assert.ok(first.includes(k), 'ไม่ได้ตรวจ ' + k);
  new Function(first);
});
