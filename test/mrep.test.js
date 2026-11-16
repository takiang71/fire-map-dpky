// F3 scripts/lib/mrep.js — เมื่อไรต้องแจ้งลิงก์รายงานประจำเดือน + ข้อความ Telegram (HTML) / LINE (ข้อความธรรมดา)
//  · ไม่มีสถานะ = จำรายงานล่าสุดโดยไม่ส่ง · มีเดือนใหม่กว่าที่แจ้งแล้ว = ส่ง (เลือกเดือนล่าสุด) · เดือนเดิม = ไม่ส่ง · สร้างเกิน 7 วัน = จำโดยไม่ส่ง · ไม่มีรายการ = ไม่ทำอะไร
const test = require('node:test'), assert = require('node:assert/strict');
const MR = require('../scripts/lib/mrep');
const now = Date.UTC(2026, 11, 1, 2), ix = { list: [{ id: '2569-10', t: 'ตุลาคม 2569', html: '2569-10.html', pdf: '2569-10.pdf', gen: '2026-11-16T07:00:00Z', n: { ind: 0, all: 0, indPrev: 0, fy: 0 } }, { id: '2569-11', t: 'พฤศจิกายน 2569', html: '2569-11.html', pdf: '2569-11.pdf', gen: '2026-11-30T23:30:00Z', n: { ind: 12, all: 30, indPrev: 8, fy: 12 } }] };

test('pending: เริ่มเก็บ / เดือนใหม่ / เดือนเดิม / เก่าเกิน 7 วัน / ว่าง', () => {
  assert.deepEqual([MR.pending(ix, null, now).seed, MR.pending(ix, null, now).latest.id], [true, '2569-11']);
  assert.equal(MR.pending(ix, '2569-10', now).r.id, '2569-11');
  assert.equal(MR.pending(ix, '2569-11', now).r, null);
  const old = MR.pending(ix, '2569-10', now + 8 * 864e5); assert.equal(old.r, null); assert.equal(old.seed, true);
  assert.deepEqual(MR.pending({ list: [] }, '2569-10', now), { r: null, seed: false, latest: null });
  assert.equal(MR.pending(null, null, now).latest, null);
});
test('text: ลิงก์ PDF + ตัวเลขเทียบปีก่อน · LINE ไม่มีแท็ก HTML', () => {
  const r = ix.list[1], h = MR.text(r, { site: 'https://x/', html: true }), l = MR.text(r, { site: 'https://x/', html: false });
  assert.match(h, /<b>รายงานสถานการณ์ไฟป่าประจำเดือน พฤศจิกายน 2569<\/b>/); assert.match(h, /href="https:\/\/x\/reports\/2569-11\.pdf"/); assert.match(h, /ปีก่อน 8 ▲ 50%/);
  assert.doesNotMatch(l, /<[a-z]/); assert.match(l, /https:\/\/x\/reports\/2569-11\.pdf/);
});
