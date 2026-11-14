// สรุป PM2.5 แบบจำลอง CAMS ของกลุ่มป่า — ใช้ในสรุปประจำวัน LINE/Telegram (ผู้ใช้ขอ 14 พ.ย. 69)
// อ่าน data/cams_pm.json ที่ scripts/sync_cams.js เก็บไว้ (ค่าทุก 3 ชม. ที่ 4 อุทยาน = จุดเดียวกับชั้น PM2.5 CAMS บนหน้าเว็บ)
// ต่อวันไทย (00:00–24:00 น. = 8 เวลา 01:00…22:00 น.) → ค่าเฉลี่ย 24 ชม. ต่ออุทยาน (≥6 เวลา) เทียบเกณฑ์กรมควบคุมมลพิษ 2566 (ใช้ค่าเฉลี่ย 24 ชม.)
//   กลุ่มป่า = เฉลี่ยของจุดตารางแบบจำลองที่ไม่ซ้ำกัน (ทับลานกับปางสีดาตกจุดตาราง 0.4° เดียวกัน) · สูงสุด = ค่าราย 3 ชม. สูงสุดของวันทุกจุด
// ไม่มีวันนี้ หรือไฟล์ไม่ได้อัปเดตเกิน 2 วัน = null (ไม่แสดง)
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '..', 'data', 'cams_pm.json');
const TH = [15, 25, 37.5, 75], NAME = ['ดีมาก', 'ดี', 'ปานกลาง', 'เริ่มมีผลกระทบต่อสุขภาพ', 'มีผลกระทบต่อสุขภาพ'];
const lv = v => { let i = 0; while (i < TH.length && v > TH[i]) i++; return i };
const r1 = v => Math.round(v * 10) / 10;
function camsSummary(now = Date.now(), n = 3, file = FILE) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return null }
  if (!j.t || !j.v || !j.pts || now - Date.parse(j.upd) > 2 * 864e5) return null;
  const day0 = Math.floor((now + 7 * 36e5) / 864e5) * 864e5 - 7 * 36e5, P = j.pts;
  const grid = {}; P.forEach((p, i) => { const k = p.length > 4 ? p[3] + ',' + p[4] : 'p' + i; (grid[k] = grid[k] || []).push(i) });
  const days = [];
  for (let d = 0; d < n; d++) {
    const a = day0 + d * 864e5, I = j.t.map((t, i) => t > a && t <= a + 864e5 ? i : -1).filter(i => i >= 0);
    const pm = P.map((p, pi) => { const v = I.map(i => j.v[i][pi]).filter(v => v != null); return v.length >= 6 ? v.reduce((s, x) => s + x, 0) / v.length : null });
    if (pm.every(v => v == null)) break;
    const gm = Object.values(grid).map(ix => pm[ix[0]]).filter(v => v != null), mean = gm.reduce((s, x) => s + x, 0) / gm.length;
    let pk = -1, pt = 0, pp = 0; I.forEach(i => j.v[i].forEach((v, pi) => { if (v != null && v > pk) { pk = v; pt = j.t[i]; pp = pi } }));
    const top = pm.reduce((b, v, i) => v != null && (b < 0 || v > pm[b]) ? i : b, -1);
    days.push({ d: new Date(a + 7 * 36e5).toISOString().slice(0, 10), mean: r1(mean), c: lv(mean), parks: P.map((p, i) => [p[0], pm[i] == null ? null : r1(pm[i])]),
      top: top >= 0 ? { n: P[top][0], v: r1(pm[top]), c: lv(pm[top]) } : null, pk: r1(pk), pkT: pt, pkN: P[pp][0], pc: lv(pk) });
  }
  return days.length && days[0].d === new Date(now + 7 * 36e5).toISOString().slice(0, 10) ? { upd: j.upd, def: j.def, days } : null;
}
module.exports = { camsSummary, PMN: NAME, pmLevel: lv };
if (require.main === module) console.log(JSON.stringify(camsSummary(process.env.CAMS_NOW ? Date.parse(process.env.CAMS_NOW) : Date.now()), null, 1));
