// สรุป PM2.5 แบบจำลอง CAMS ของกลุ่มป่า — ใช้ในสรุปประจำวัน LINE/Telegram (ผู้ใช้ขอ 14 พ.ย. 69)
// อ่านตารางค่า data/cams_grid.json (scripts/sync_cams.js: CAMS global 0.4° ทุก 3 ชม. จาก Open-Meteo) — วิธีเดียวกับตารางในแผงชั้นข้อมูลบนหน้าเว็บ (cmAreas/cmDayF ใน index.html)
//   วันไทย 00:00–24:00 น. = 8 เวลา (01:00, 04:00 … 22:00 น.) → ค่าเฉลี่ย 24 ชม. เทียบเกณฑ์กรมควบคุมมลพิษ 2566 (≤15 ดีมาก / ≤25 ดี / ≤37.5 ปานกลาง / ≤75 เริ่มมีผลกระทบ / >75 มีผลกระทบ)
//   ค่าของพื้นที่ = ค่าเฉลี่ยของจุดทุก 0.05° ภายในแนวเขต (bilinear จากตาราง 0.4°) · กลุ่มป่า = ทุกพื้นที่อนุรักษ์ (รวมดงใหญ่) เหมือนแถว "กลุ่มป่าฯ" บนเว็บ
//   pk/pkT/pkN = ค่าเฉลี่ยรายอุทยานราย 3 ชม. ที่สูงสุดของวัน
// ไม่มีวันนี้ หรือตารางไม่ได้อัปเดตเกิน 2 วัน = null (ไม่แสดง)
const fs = require('fs'), path = require('path');
const { where } = require('./area');
const FILE = path.join(__dirname, '..', '..', 'data', 'cams_grid.json');
const TH = [15, 25, 37.5, 75], NAME = ['ดีมาก', 'ดี', 'ปานกลาง', 'เริ่มมีผลกระทบต่อสุขภาพ', 'มีผลกระทบต่อสุขภาพ'];
const PARKS = [['เขาใหญ่', 'อุทยานแห่งชาติเขาใหญ่'], ['ทับลาน', 'อุทยานแห่งชาติทับลาน'], ['ปางสีดา', 'อุทยานแห่งชาติปางสีดา'], ['ตาพระยา', 'อุทยานแห่งชาติตาพระยา']];
const lv = v => { let i = 0; while (i < TH.length && v > TH[i]) i++; return i };
const r1 = v => Math.round(v * 10) / 10;
let AP = null;
function areaPts() { // [กลุ่มป่า, ...4 อุทยาน] จุดทุก 0.05°
  if (AP) return AP; AP = [[], ...PARKS.map(() => [])];
  for (let i = Math.ceil(100.9 / .05); i * .05 <= 103.2 + 1e-9; i++) for (let j = Math.ceil(13.8 / .05); j * .05 <= 14.7 + 1e-9; j++) {
    const x = i * .05, y = j * .05, w = where(x, y); if (!w || w.ar === 'นอกพื้นที่อนุรักษ์') continue;
    AP[0].push([x, y]); const k = PARKS.findIndex(p => p[1] === w.ar); if (k >= 0) AP[k + 1].push([x, y]) }
  return AP;
}
function camsSummary(now = Date.now(), n = 3, file = FILE) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return null }
  if (!j.v || now - Date.parse(j.upd) > 2 * 864e5) return null;
  const V = j.v.map(s => { const b = Buffer.from(s, 'base64'), a = new Float32Array(b.length / 2); for (let i = 0; i < a.length; i++) { const u = b.readUInt16LE(i * 2); a[i] = u === 65535 ? NaN : u / j.q } return a });
  const W = areaPts().map(P => P.map(([x, y]) => { const fx = (x - j.x0) / j.d, fy = (y - j.y0) / j.d; if (fx < 0 || fy < 0 || fx > j.nx - 1 || fy > j.ny - 1) return null;
    const i = Math.min(j.nx - 2, Math.floor(fx)), k = Math.min(j.ny - 2, Math.floor(fy)), a = fx - i, b = fy - k, p = k * j.nx + i;
    return [[p, (1 - a) * (1 - b)], [p + 1, a * (1 - b)], [p + j.nx, (1 - a) * b], [p + j.nx + 1, a * b]] }).filter(Boolean));
  const at = (f, w) => w.reduce((u, [p, c]) => u + f[p] * c, 0);
  const mean = (f, A) => { let s = 0, c = 0; for (const w of A) { const v = at(f, w); if (isFinite(v)) { s += v; c++ } } return c ? s / c : null };
  const day0 = Math.floor((now + 7 * 36e5) / 864e5) * 864e5 - 7 * 36e5, days = [];
  for (let d = 0; d < n; d++) {
    const a = day0 + d * 864e5, K = V.map((f, k) => j.t0 + k * j.dt).map((t, k) => t > a && t <= a + 864e5 ? k : -1).filter(k => k >= 0);
    if (K.length < 6) break;
    const S = K.map(k => W.map(A => mean(V[k], A))); // [เวลา][พื้นที่]
    const avg = i => { const x = S.map(r => r[i]).filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null };
    const all = avg(0); if (all == null) break;
    const parks = PARKS.map((p, i) => [p[0], avg(i + 1) == null ? null : r1(avg(i + 1))]);
    let pk = -1, pkT = 0, pkN = ''; S.forEach((r, ki) => r.slice(1).forEach((v, i) => { if (v != null && v > pk) { pk = v; pkT = j.t0 + K[ki] * j.dt; pkN = PARKS[i][0] } }));
    const top = parks.filter(p => p[1] != null).sort((x, y) => y[1] - x[1])[0];
    days.push({ d: new Date(a + 7 * 36e5).toISOString().slice(0, 10), mean: r1(all), c: lv(all), parks, top: top ? { n: top[0], v: top[1], c: lv(top[1]) } : null, pk: r1(pk), pkT, pkN, pc: lv(pk) });
  }
  return days.length && days[0].d === new Date(now + 7 * 36e5).toISOString().slice(0, 10) ? { upd: j.upd, run: j.run, days } : null;
}
module.exports = { camsSummary, PMN: NAME, pmLevel: lv };
if (require.main === module) { const R = camsSummary(process.env.CAMS_NOW ? Date.parse(process.env.CAMS_NOW) : Date.now()); console.log(R && R.days.map(d => [d.d, d.mean, d.parks.map(p => p.join(' ')).join(', '), 'pk', d.pk, new Date(d.pkT + 7 * 36e5).toISOString().slice(11, 16), d.pkN].join(' | ')).join('\n')) }
