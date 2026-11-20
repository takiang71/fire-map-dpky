// พิมพ์แผนที่ (บล็อก lz-pm): pmOpen รอแผนที่หลักโหลดสไตล์เสร็จก่อนคัดลอกสไตล์ (20 พ.ย. 69 — เดิมกดก่อนโหลดเสร็จ = หน้าพิมพ์ว่าง + unhandledrejection เงียบ)
// โค้ดจริงจาก index.html: pmMainOk / PMW / pmOpen (pmOpen0 = ตัวเปิดหน้าพิมพ์เดิม จำลองในเทสต์)
const test = require('node:test'), assert = require('node:assert/strict');
const { grab, load } = require('./helpers.cjs');
const SRC = grab(/const pmMainOk=[\s\S]*?\nasync function pmOpen0\(\)\{/).replace(/\nasync function pmOpen0\(\)\{$/, '');

function env({ ready = () => true, open = async () => { } } = {}) {
  const toasts = [], logs = [], calls = [];
  let t = 0;
  const map = { getSource: k => (k === 'dem' && ready(t) ? {} : undefined), getStyle: () => { if (!ready(t)) throw new TypeError('Cannot convert undefined or null to object'); return { layers: [] } } };
  const W = load(SRC, ['pmOpen', 'pmMainOk'], {
    map, toast: m => toasts.push(m), dbg: (k, e) => logs.push(k + ':' + e.message),
    setTimeout: (f, ms) => { t += ms; Promise.resolve().then(f) },
    pmOpen0: async () => { calls.push(t); return open(t) }
  });
  return { ...W, toasts, logs, calls };
}

test('pmOpen: แผนที่หลักพร้อม = เปิดทันที ไม่มี toast', async () => {
  const E = env();
  await E.pmOpen();
  assert.deepEqual(E.calls, [0]); assert.deepEqual(E.toasts, []);
});

test('pmOpen: สไตล์ยังไม่โหลด (getStyle โยน) = แจ้งว่ากำลังรอ แล้วเปิดเมื่อพร้อม · กดซ้ำระหว่างรอไม่เปิดซ้ำ', async () => {
  const E = env({ ready: t => t >= 1500 });
  assert.equal(E.pmMainOk(), false, 'getStyle โยน error = ยังไม่พร้อม (ไม่หลุดออกไป)');
  const p = E.pmOpen(), q = E.pmOpen();
  await Promise.all([p, q]);
  assert.equal(E.calls.length, 1, 'เปิดครั้งเดียว'); assert.ok(E.calls[0] >= 1500);
  assert.equal(E.toasts.length, 1); assert.match(E.toasts[0], /กำลังรอแผนที่หลักโหลดเสร็จ/);
  await E.pmOpen(); assert.equal(E.calls.length, 2, 'หลังรอเสร็จกดใหม่ได้');
});

test('pmOpen: รอเกิน 20 วิ = บอกให้กดใหม่ ไม่เปิดหน้าพิมพ์ว่าง · error ตอนเปิด = toast + dbg (ไม่เงียบ)', async () => {
  const E = env({ ready: () => false });
  await E.pmOpen();
  assert.deepEqual(E.calls, []);
  assert.match(E.toasts.at(-1), /^แผนที่หลักยังโหลดไม่เสร็จ — รอสักครู่แล้วกดพิมพ์แผนที่อีกครั้ง$/);
  const F = env({ open: async () => { throw new Error('x') } });
  await F.pmOpen();
  assert.deepEqual(F.toasts, ['เปิดหน้าพิมพ์แผนที่ไม่สำเร็จ: x']); assert.deepEqual(F.logs, ['pmOpen:x']);
});
