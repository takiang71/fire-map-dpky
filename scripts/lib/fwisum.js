// สรุปดัชนีอันตรายไฟป่า FWI (Canadian FWI System จาก TFDRS กรมป่าไม้) ของกลุ่มป่า — ใช้ในสรุปประจำวัน LINE/Telegram (ผู้ใช้ขอ 14 พ.ย. 69)
// อ่าน data/fwi/index.json ที่ scripts/sync_fwi.js สรุปไว้แล้ว (ค่าเฉลี่ย/ต่ำสุด/สูงสุด/สัดส่วน 5 ระดับ ต่อพื้นที่ จากจุดทุก 0.02° ในแนวเขต)
//   = ตัวเลขชุดเดียวกับตารางในแผงชั้นข้อมูลบนหน้าเว็บ (แถว "กลุ่มป่าฯ" = all รวมดงใหญ่)
// วันที่ใช้ = วันนี้ (เวลาไทย) เป็นต้นไป ≤n วัน — ส่ง 05:30 น. จึงเป็นพยากรณ์วันนี้/พรุ่งนี้ของรอบเมื่อวาน (รอบใหม่ออก ~14:20 น.)
// ไม่มีวันนี้ (ต้นทางหยุด/sync ไม่ได้รัน) หรือรอบเก่ากว่า 3 วัน = null (ไม่แสดง)
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '..', 'data', 'fwi', 'index.json');
const NAME = ['ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก', 'รุนแรงมาก'];
const AREA = { ky: 'อช.เขาใหญ่', tl: 'อช.ทับลาน', ps: 'อช.ปางสีดา', tp: 'อช.ตาพระยา', dy: 'ขสป.ดงใหญ่', ks: 'ขหล.โคกสูง', kc: 'ขหล.เขาฉกรรจ์' };
const r1 = v => Math.round(v * 10) / 10;
function fwiSummary(now = Date.now(), n = 2, file = FILE) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return null }
  const B = (j.bounds && j.bounds.FWI) || [17, 31, 40, 54], cls = v => { let i = 0; while (i < B.length && v >= B[i]) i++; return i };
  const today = new Date(now + 7 * 36e5).toISOString().slice(0, 10);
  if (!j.run || Date.parse(today) - Date.parse(j.run) > 3 * 864e5) return null;
  const days = (j.days || []).filter(d => d.d >= today && d.a && d.a.all && d.a.all.FWI).slice(0, n).map(d => {
    const A = d.a.all, F = A.FWI, sh = F[3] || [], top = Object.keys(AREA).filter(k => d.a[k] && d.a[k].FWI).sort((a, b) => d.a[b].FWI[0] - d.a[a].FWI[0])[0];
    const m = k => A[k] ? r1(A[k][0]) : null;
    return { d: d.d, f: d.f, mean: r1(F[0]), min: r1(F[1]), max: r1(F[2]), c: cls(F[0]), cx: cls(F[2]),
      hi: Math.round(sh.slice(2).reduce((s, v) => s + v, 0) * 1000) / 10, // % พื้นที่ระดับสูงขึ้นไป
      top: top ? { k: top, n: AREA[top], v: r1(d.a[top].FWI[0]), c: cls(d.a[top].FWI[0]) } : null,
      t: m('Temp_noon'), rh: m('Rh_noon'), ws: m('Wsp_noon'), pr: m('Precip_24hr') } });
  return days.length && days[0].d === today ? { run: j.run, b: B, days } : null;
}
module.exports = { fwiSummary, FWN: NAME };
if (require.main === module) console.log(JSON.stringify(fwiSummary(process.env.FWI_NOW ? Date.parse(process.env.FWI_NOW) : Date.now()), null, 1));
