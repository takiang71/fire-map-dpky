// กรองแถบเส้นในความสูงเรือนยอด GEM-15 (ผู้ใช้ขอ 26 พ.ย. 69) — แถบแนวนอน/รอยต่อแนวตั้งที่ติดมากับ DSM/DTM ต้นทาง
// วิธี: แถบแนวนอน s_h = มัธยฐานตามแถว ±M ของ (v − เฉลี่ยแนวตั้ง ±R) · รอยแนวตั้ง s_v = มัธยฐานตามคอลัมน์ ±M ของ (v − s_h − เฉลี่ยแนวนอน ±R)
//   (ใช้เฉลี่ยทิศเดียว ไม่ใช่กล่อง: พื้นที่โล่งติดป่าไม่ถูกดึงขึ้นตามค่าเฉลี่ยรอบข้าง) · ค่าใหม่ = v − s_h − s_v (ตัด 0–hmax)
//   มัธยฐานยาว 2M+1 พิกเซล: ลวดลายจริงที่ไม่เป็นเส้นตรงยาว (ต้นไม้ หุบเขา ไร่) ไม่ดึงมัธยฐาน → แทบไม่เปลี่ยน · แถบที่ยาวตลอดหน้าต่างถูกลบ
//   ตัดส่วนเล็ก (|s| ≤ T ม. = 0, เกิน = ลด T) — ค่าประมาณแถบในพื้นที่ไม่มีแถบแกว่ง ±1–2 ม. ถ้าไม่ตัดพื้นที่โล่ง 0–1 ม. จะถูกดันเกิน 2 ม.
//   ค่าต้นทางถูกตัดที่ 0 แล้ว: พื้นที่โล่งในแถบ "ต่ำ" เป็น 0 อยู่แล้ว ถ้ายกขึ้นจะกลายเป็นป่า 2–3 ม. → พิกเซล ≤ lo (1 ม.) ไม่ยกขึ้น (ลดลงได้)
//   ข้อเสีย: ขอบจริงที่เป็นเส้นตรงแนวตะวันออก-ตก/เหนือ-ใต้ยาวเกิน M (แนวแปลงปลูก/ถนนตรง) ถูกเกลี่ยลงบ้าง
// get(x,y) → Uint8Array 65536 (255 = ไม่มีข้อมูล) หรือ null · คืน Uint8Array ไทล์ (x,y) ที่กรองแล้ว
const ND = 255, Q = 4, NB = 60 * 2 * Q + 1, OFF = 60 * Q; /* ถังมัธยฐานละ 0.25 ม. ช่วง −60..60 */
function destripe(get, x, y, o0 = {}) {
  const o = { ...OPT, ...o0 };
  const LO = o.lo == null ? 1 : o.lo, R = o.R || 32, M = o.M || 256, hmax = o.hmax || 60, T = o.T == null ? 1.5 : o.T, sh0 = o.hard ? d => Math.abs(d) > T ? d : 0 : d => d > T ? d - T : d < -T ? d + T : 0, P = R + 2 * M, c = get(x, y); if (!c) return null;
  const W = 256 + 2 * P, v = new Int16Array(W * W).fill(-1);
  const G = Math.ceil(P / 256);
  for (let ty = -G; ty <= G; ty++) for (let tx = -G; tx <= G; tx++) {
    const t = tx || ty ? get(x + tx, y + ty) : c; if (!t) continue;
    for (let j = 0; j < W; j++) {
      const sj = j - P - ty * 256; if (sj < 0 || sj > 255) continue;
      for (let i = 0; i < W; i++) { const si = i - P - tx * 256; if (si < 0 || si > 255) continue; const q = t[sj * 256 + si]; if (q !== ND) v[j * W + i] = q }
    }
  }
  /* ค่าเฉลี่ยตามเส้นเฉพาะพิกเซลที่มีค่า: dir 0 = ตามคอลัมน์ (แนวตั้ง ±R) · 1 = ตามแถว (แนวนอน ±R) · src Float32 (NaN = ไม่มีค่า) → ถัง r = src − เฉลี่ย */
  const lineRes = (src, dir, rows0, rows1, cols0, cols1) => {
    const rb = new Int16Array(W * W).fill(-1);
    for (let a = dir ? rows0 : cols0; a < (dir ? rows1 : cols1); a++) {
      const idx = t => dir ? a * W + t : t * W + a; let s = 0, n = 0;
      for (let t = 0; t < Math.min(W, R); t++) { const q = src[idx(t)]; if (q === q) { s += q; n++ } }
      for (let t = 0; t < W; t++) {
        const tin = t + R, tout = t - R - 1;
        if (tin < W) { const q = src[idx(tin)]; if (q === q) { s += q; n++ } }
        if (tout >= 0) { const q = src[idx(tout)]; if (q === q) { s -= q; n-- } }
        const q = src[idx(t)]; if (q === q && n) rb[idx(t)] = Math.max(0, Math.min(NB - 1, Math.round((q - s / n) * Q) + OFF));
      }
    }
    return rb;
  };
  const fv = new Float32Array(W * W); for (let k = 0; k < W * W; k++) fv[k] = v[k] < 0 ? NaN : v[k];
  /* แถบแนวนอน: r = v − เฉลี่ยแนวตั้ง · มัธยฐานตามแถว */
  const rb = lineRes(fv, 0, 0, W, 0, W);
  /* มัธยฐานเลื่อนตามเส้น: idx(t) = ตำแหน่งในอาร์เรย์ · n ช่อง · คืนค่ามัธยฐาน (ม.) ของหน้าต่าง ±M ที่ตำแหน่ง a..b (NaN = ค่าน้อยเกินไป) */
  const H = new Int32Array(NB), med = (src, idx, n, a, b, out, oidx) => {
    H.fill(0); let cnt = 0, k = 0, lo = 0; /* lo = จำนวนในถัง < k */
    const add = (t, d) => { if (t < 0 || t >= n) return; const q = src[idx(t)]; if (q >= 0) { H[q] += d; cnt += d; if (q < k) lo += d } };
    for (let t = a - M; t <= a + M; t++) add(t, 1);
    for (let p = a; p <= b; p++) {
      if (p > a) { add(p - M - 1, -1); add(p + M, 1) }
      if (cnt >= M) {
        const h = (cnt + 1) >> 1;
        while (lo + H[k] < h) { lo += H[k]; k++ }
        while (lo >= h) { k--; lo -= H[k] }
        out[oidx(p)] = sh0((k - OFF) / Q);
      } else out[oidx(p)] = 0;
    }
  };
  /* แนวนอน: แถว P−M..P+255+M (ต้องใช้ต่อในแนวตั้ง) คอลัมน์กลาง */
  const sh = new Float32Array(W * W);
  for (let j = P - M; j < P + 256 + M; j++) med(rb, t => j * W + t, W, P, P + 255, sh, p => j * W + p);
  if (o.noV) { const out = new Uint8Array(65536).fill(ND); for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const k = (j + P) * W + i + P, q = v[k]; if (q >= 0) out[j * 256 + i] = Math.round(Math.min(hmax, Math.max(0, q - sh[k]))) } return out }
  const f2 = new Float32Array(W * W).fill(NaN);
  for (let j = P - M; j < P + 256 + M; j++) for (let i = P; i < P + 256; i++) { const k = j * W + i; if (v[k] >= 0) f2[k] = v[k] - sh[k] }
  /* แนวตั้ง: r = (v − s_h) − เฉลี่ยแนวนอน · มัธยฐานตามคอลัมน์ (เฉลี่ยแนวนอนทำในช่วงคอลัมน์ที่มี s_h เท่านั้น) */
  const rv = lineRes(f2, 1, P - M, P + 256 + M, 0, W);
  const sv = new Float32Array(W * W);
  for (let i = P; i < P + 256; i++) med(rv, t => t * W + i, W, P, P + 255, sv, p => p * W + i);
  const out = new Uint8Array(65536).fill(ND);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const k = (j + P) * W + i + P, q = v[k]; if (q >= 0) { const d = sh[k] + sv[k]; out[j * 256 + i] = q <= LO && d < 0 ? q : Math.round(Math.min(hmax, Math.max(0, q - d))) } }
  return out;
}
/* ค่าตั้งที่เลือก 26 พ.ย. 69 (ทดลองที่ทับลานใต้ อ.นาดี + รอยต่อเขาใหญ่ตะวันตก): M สั้นกว่านี้กินที่โล่งจริงในป่า · T ต่ำกว่านี้ดันพื้นที่โล่ง 0–1 ม. ขึ้นเกิน 2 ม. */
const OPT = { R: 32, M: 256, T: 2, hard: 1 };
const destripeAll = (lvl, o = OPT) => { const get = (x, y) => lvl.get(x + ',' + y) || null, out = new Map(); for (const k of lvl.keys()) { const [x, y] = k.split(',').map(Number); out.set(k, destripe(get, x, y, o)) } return out };
const CL = [2, 5, 10, 15, 20, 30], cls = h => { let k = 0; while (k < CL.length && h >= CL[k]) k++; return k };
/* ไร่ต่อชั้นต่อพื้นที่ (mask(x,y) → Int ดัชนีพื้นที่ต่อพิกเซล, <0 = นอก) · area(y,j) = ไร่ต่อพิกเซลของแถว */
function chmStats(lvl, nF, mask, area) {
  const st = Array.from({ length: nF }, () => new Array(CL.length + 1).fill(0));
  for (const [k, px] of lvl) { const [x, y] = k.split(',').map(Number), m = mask(x, y); for (let j = 0; j < 256; j++) { const a = area(y, j); for (let i = 0; i < 256; i++) { const q = j * 256 + i, fi = m[q]; if (fi >= 0 && px[q] !== ND) st[fi][cls(px[q])] += a } } }
  return st;
}
/* ซูมต่ำลง: เฉลี่ย 2×2 เฉพาะพิกเซลที่มีค่า (ไม่มีเลย = 255) · write(z,x,y,px) */
function pyramid(lvl, zmax, zmin, write) {
  for (let z = zmax - 1; z >= zmin; z--) {
    const P = new Set(); for (const k of lvl.keys()) { const [x, y] = k.split(',').map(Number); P.add((x >> 1) + ',' + (y >> 1)) }
    const next = new Map();
    for (const k of P) {
      const [x, y] = k.split(',').map(Number), px = new Uint8Array(65536).fill(ND);
      for (let q = 0; q < 4; q++) {
        const c = lvl.get((2 * x + (q & 1)) + ',' + (2 * y + (q >> 1))), ox = (q & 1) * 128, oy = (q >> 1) * 128; if (!c) continue;
        for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
          let s = 0, n = 0; for (const o of [(2 * j) * 256 + 2 * i, (2 * j) * 256 + 2 * i + 1, (2 * j + 1) * 256 + 2 * i, (2 * j + 1) * 256 + 2 * i + 1]) if (c[o] !== ND) { s += c[o]; n++ }
          if (n) px[(oy + j) * 256 + ox + i] = Math.round(s / n);
        }
      }
      next.set(k, px); write(z, x, y, px);
    }
    lvl = next;
  }
}
module.exports = { destripe, destripeAll, chmStats, pyramid, OPT, CL, cls, ND };
