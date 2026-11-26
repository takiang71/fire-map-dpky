// lib/chmfilt.js — กรองแถบเส้นความสูงเรือนยอด GEM-15 (26 พ.ย. 69) · ไทล์สังเคราะห์ 3×3 แผ่น
const test = require('node:test'), assert = require('node:assert/strict');
const { destripe, destripeAll, chmStats, pyramid, ND } = require('../scripts/lib/chmfilt');
const grid = fn => { const L = new Map(); for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) { const p = new Uint8Array(65536); for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) p[j * 256 + i] = fn(tx * 256 + i, ty * 256 + j); L.set(tx + ',' + ty, p) } return L };
const get = L => (x, y) => L.get(x + ',' + y) || null;
const tex = (X, Y) => 12 + ((X * 7 + Y * 13) % 5) - 2; /* ป่า ~12 ม. ลายเล็กไม่เป็นเส้น */

test('แถบแนวนอน ±4 ม. ในป่าถูกลบ (คลาดเฉลี่ย <0.5 ม. สูงสุด ≤2 ม. จากถังมัธยฐาน 0.25 ม. + การปัดเศษ)', () => {
  const L = grid((X, Y) => tex(X, Y) + ((Y >> 4) % 2 ? 4 : -4)), o = destripe(get(L), 1, 1);
  let e = 0, s = 0; for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const d = Math.abs(o[j * 256 + i] - tex(256 + i, 256 + j)); e = Math.max(e, d); s += d }
  assert.ok(e <= 2 && s / 65536 < 0.5, 'คลาดสูงสุด ' + e + ' เฉลี่ย ' + (s / 65536).toFixed(2));
});
test('รอยต่อแนวตั้ง (ขั้น 6 ม.) กลายเป็นทางลาดกว้าง ±R — ขั้นระหว่างคอลัมน์ติดกันเหลือ <2.5 ม.', () => {
  const L = grid((X, Y) => tex(X, Y) + (X >= 384 ? 6 : 0)), o = destripe(get(L), 1, 1);
  const col = i => { let s = 0; for (let j = 0; j < 256; j++) s += o[j * 256 + i]; return s / 256 };
  let mx = 0; for (let i = 100; i < 156; i++) mx = Math.max(mx, Math.abs(col(i + 1) - col(i)));
  assert.ok(mx < 2.5, 'ขั้นสูงสุดระหว่างคอลัมน์ (ส่วน ≤T 2 ม. ไม่ถูกกรอง) ' + mx.toFixed(2) + ' ม. (เดิม 6)');
});
test('ที่โล่งจริงในป่า (0 ม. กว้าง 120 พิกเซล) คงเดิม · ป่ารอบข้างไม่เปลี่ยน', () => {
  const clr = (X, Y) => X >= 320 && X < 440 && Y >= 320 && Y < 440, L = grid((X, Y) => clr(X, Y) ? 0 : tex(X, Y)), o = destripe(get(L), 1, 1), c = L.get('1,1');
  let d = 0; for (let k = 0; k < 65536; k++) d = Math.max(d, Math.abs(o[k] - c[k]));
  assert.ok(d <= 2, 'เปลี่ยนสูงสุด ' + d);
});
test('ไม่มีข้อมูล (255) คงเป็น 255 · ไม่มีไทล์ = null · พิกเซล ≤1 ม. ในแถบต่ำไม่ถูกยกขึ้น', () => {
  const L = grid((X, Y) => X < 300 ? ND : X < 500 ? 0 : tex(X, Y) - ((Y >> 4) % 2 ? 4 : 0)), o = destripe(get(L), 1, 1);
  for (let j = 0; j < 256; j++) { assert.equal(o[j * 256 + 10], ND); assert.equal(o[j * 256 + 100], 0) }
  assert.equal(destripe(get(L), 7, 7), null);
});
test('destripeAll ครบทุกแผ่น · chmStats นับไร่ตามชั้น · pyramid เฉลี่ย 2×2', () => {
  const L = grid(() => 3), F = destripeAll(L); assert.equal(F.size, 9);
  const st = chmStats(F, 1, () => new Int8Array(65536), () => 1); assert.deepEqual(st[0], [0, 9 * 65536, 0, 0, 0, 0, 0]);
  const W = []; pyramid(new Map([['0,0', L.get('0,0')]]), 13, 12, (z, x, y, px) => W.push([z, x, y, px[0], px[65535]]));
  assert.deepEqual(W, [[12, 0, 0, 3, ND]]);
});
