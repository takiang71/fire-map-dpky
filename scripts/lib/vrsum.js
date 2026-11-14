// สรุปอัตราการระบายอากาศของกลุ่มป่าจาก data/gfs_vr.json (NOAA GFS VRATE) — ใช้ในสรุปประจำวัน LINE/Telegram (ผู้ใช้ขอ 14 พ.ย. 69)
// วิธีเดียวกับหน้าเว็บ (gvDays/gvAreas/gvMean ใน index.html):
//   วัน = วัน UTC (07:00–06:00 น. ไทย) แบบกรมอุตุฯ · ตัดวันที่ข้อมูลครอบ <12 ชม.
//   ค่าของกลุ่มป่า = ค่าเฉลี่ยของจุดทุก 0.05° ภายในแนวเขตพื้นที่อนุรักษ์ (bilinear จากตาราง 0.25°)
//   mean = เฉลี่ยทั้งวัน (ตัวเลขแบบที่กรมอุตุฯ รายงาน) · max = สูงสุดของวัน (แต่ละจุดเอาค่าสูงสุดของค่ารายชั่วโมงที่จุดนั้น แล้วเฉลี่ยพื้นที่ = ตาราง "สูงสุดของวัน" บนเว็บ — 14 พ.ย. 69 เลิกใช้สูงสุดรายช่องตาราง เพราะช่องข้างเคียงสูงสุดคนละชั่วโมงทำให้สูงเกินจริง)
//   a/z/hrs = ช่วงชั่วโมงแรก–สุดท้ายที่ค่าเฉลี่ยทั้งกลุ่มป่ารายชั่วโมง ≥2,000 · pk/pkT = ชั่วโมงที่ค่าเฉลี่ยทั้งกลุ่มป่าสูงสุด
// สรุปประจำวันส่ง 05:30 น. → ใช้วันที่ยังเหลือเกินครึ่งวัน (เริ่ม 07:00 น. วันนี้เป็นต้นไป)
const fs = require('fs'), path = require('path');
const { where } = require('./area');
const FILE = path.join(__dirname, '..', '..', 'data', 'gfs_vr.json');
const CAT = [[16000, 'ดีที่สุด'], [8000, 'ดีมาก'], [4000, 'ดี'], [2000, 'อ่อน'], [0, 'ไม่ดี']];
const vrLevel = v => CAT.find(c => v >= c[0])[1];
let PTS = null;
function points() { // จุดทุก 0.05° ในแนวเขตพื้นที่อนุรักษ์ (เหมือน gvAreas 'กลุ่มป่าฯ')
  if (PTS) return PTS; PTS = [];
  for (let i = Math.ceil(100.9 / .05); i * .05 <= 103.2 + 1e-9; i++) for (let j = Math.ceil(13.8 / .05); j * .05 <= 14.7 + 1e-9; j++) {
    const x = i * .05, y = j * .05, w = where(x, y); if (w && w.ar !== 'นอกพื้นที่อนุรักษ์') PTS.push([x, y]) }
  return PTS;
}
function vrSummary(now = Date.now(), n = 5, file = FILE) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return null }
  const NN = j.nx * j.ny, c0 = Date.parse(j.cyc.replace('Z', ':00Z')), V = j.v.map(s => Buffer.from(s, 'base64')), t = j.h.map(h => c0 + h * 36e5), q = j.q || 100;
  // น้ำหนัก bilinear ของแต่ละจุดในกลุ่มป่า
  const W = points().map(([x, y]) => { const fx = (x - j.x0) / j.d, fy = (y - j.y0) / j.dy; if (fx < 0 || fy < 0 || fx > j.nx - 1 || fy > j.ny - 1) return null;
    const i = Math.min(j.nx - 2, Math.floor(fx)), k = Math.min(j.ny - 2, Math.floor(fy)), a = fx - i, b = fy - k, p = k * j.nx + i;
    return [[p, (1 - a) * (1 - b)], [p + 1, a * (1 - b)], [p + j.nx, (1 - a) * b], [p + j.nx + 1, a * b]] }).filter(Boolean);
  if (!W.length) return null;
  const at = (f, w) => w.reduce((u, [p, c]) => u + f[p] * c, 0);
  const area = f => W.reduce((s, w) => s + at(f, w), 0) / W.length;
  const S = V.map(a => area(a) * q); // ค่าเฉลี่ยทั้งกลุ่มป่ารายชั่วโมง
  const sz = k => k < t.length - 1 ? t[k + 1] - t[k] : t[k] - t[k - 1], D = {};
  t.forEach((ms, k) => { const d = new Date(ms).toISOString().slice(0, 10); (D[d] = D[d] || []).push(k) });
  const days = Object.keys(D).sort().map(d => ({ d, k: D[d], st: Date.parse(d) }))
    .filter(x => x.k.length >= 4 && x.k.reduce((a, k) => a + sz(k), 0) >= 432e5 && x.st + 432e5 > now).slice(0, n)
    .map(x => { const mean = new Float64Array(NN);
      for (const k of x.k) { const a = V[k]; for (let p = 0; p < NN; p++) mean[p] += a[p] }
      for (let p = 0; p < NN; p++) mean[p] /= x.k.length;
      const mx = W.reduce((s, w) => s + Math.max(...x.k.map(k => at(V[k], w))), 0) / W.length;
      const ok = x.k.filter(k => S[k] >= 2000), pk = x.k.reduce((a, k) => S[k] > S[a] ? k : a, x.k[0]);
      return { d: x.d, st: x.st, part: t[x.k[0]] > x.st || t[x.k[x.k.length - 1]] + sz(x.k[x.k.length - 1]) < x.st + 864e5,
        mean: Math.round(area(mean) * q / 10) * 10, max: Math.round(mx * q / 10) * 10,
        a: ok.length ? t[ok[0]] : null, z: ok.length ? t[ok[ok.length - 1]] : null, hrs: Math.round(ok.reduce((s, k) => s + sz(k), 0) / 36e5),
        pk: Math.round(S[pk] / 10) * 10, pkT: t[pk] } });
  return days.length ? { cyc: j.cyc, days } : null;
}
module.exports = { vrSummary, vrLevel };
if (require.main === module) console.log(JSON.stringify(vrSummary(process.env.VR_NOW ? Date.parse(process.env.VR_NOW) : Date.now()), null, 1));
