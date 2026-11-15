// สรุปดัชนีอันตรายไฟป่า FWI (Canadian FWI System จาก TFDRS กรมป่าไม้) ของกลุ่มป่า — ใช้ในสรุปประจำวัน LINE/Telegram (ผู้ใช้ขอ 14 พ.ย. 69)
// อ่าน data/fwi/index.json ที่ scripts/sync_fwi.js สรุปไว้แล้ว (ค่าเฉลี่ย/ต่ำสุด/สูงสุด/สัดส่วน 5 ระดับ ต่อพื้นที่ จากจุดทุก 0.02° ในแนวเขต)
//   = ตัวเลขชุดเดียวกับตารางในแผงชั้นข้อมูลบนหน้าเว็บ (แถว "กลุ่มป่าฯ" = all รวมดงใหญ่)
// วันที่ใช้ = วันนี้ (เวลาไทย) เป็นต้นไป ≤n วัน — ส่ง 05:30 น. จึงเป็นพยากรณ์วันนี้/พรุ่งนี้ของรอบเมื่อวาน (รอบใหม่ออก ~14:20 น.)
// ไม่มีวันนี้ (ต้นทางหยุด/sync ไม่ได้รัน) หรือรอบเก่ากว่า 3 วัน = ใช้ค่าของวันจาก LFA (data/fwi/lfa.json) ถ้ามี ไม่งั้น null (ไม่แสดง)
// ffmc = ดัชนีการติดไฟ FFMC (Fine Fuel Moisture Code) ค่าเฉลี่ย/สูงสุด + ระดับตามเกณฑ์ FFMC ของ TFDRS (ผู้ใช้ขอ 15 พ.ย. 69 แสดงคู่กับ FWI)
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '..', 'data', 'fwi', 'index.json');
const NAME = ['ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก', 'รุนแรงมาก'];
const AREA = { ky: 'อช.เขาใหญ่', tl: 'อช.ทับลาน', ps: 'อช.ปางสีดา', tp: 'อช.ตาพระยา', dy: 'ขสป.ดงใหญ่', ks: 'ขหล.โคกสูง', kc: 'ขหล.เขาฉกรรจ์' };
const r1 = v => Math.round(v * 10) / 10;
// ทางสำรอง (A5, 15 พ.ย. 69): index.json ใช้ไม่ได้ (เครื่องผู้ดูแลปิดจนรอบเก่า) แต่มี data/fwi/lfa.json ค่าของวันนี้ (scripts/fwi_lfa.js จาก LFA)
//   → วันนี้วันเดียว ติดธง lfa:1 (ผู้แสดงผลเขียน "ค่าของวัน ไม่มีพยากรณ์") · ไม่มีอากาศเที่ยงวัน (t/rh/ws/pr = null)
const lv = (v, b) => { let i = 0; while (i < b.length && v >= b[i]) i++; return i };
function sumDay(d, a, B, BF) {
  const A = a.all, F = A.FWI, sh = F[3] || [], cls = v => lv(v, B), top = Object.keys(AREA).filter(k => a[k] && a[k].FWI).sort((x, y) => a[y].FWI[0] - a[x].FWI[0])[0];
  const m = k => A[k] ? r1(A[k][0]) : null;
  return { d: d.d, f: d.f, mean: r1(F[0]), min: r1(F[1]), max: r1(F[2]), c: cls(F[0]), cx: cls(F[2]),
    hi: Math.round(sh.slice(2).reduce((s, v) => s + v, 0) * 1000) / 10, // % พื้นที่ระดับสูงขึ้นไป
    top: top ? { k: top, n: AREA[top], v: r1(a[top].FWI[0]), c: cls(a[top].FWI[0]) } : null,
    ffmc: A.FFMC ? { mean: r1(A.FFMC[0]), max: r1(A.FFMC[2]), c: lv(A.FFMC[0], BF), cx: lv(A.FFMC[2], BF) } : null,
    t: m('Temp_noon'), rh: m('Rh_noon'), ws: m('Wsp_noon'), pr: m('Precip_24hr') };
}
function fwiSummary(now = Date.now(), n = 2, file = FILE, lfaFile = path.join(path.dirname(file), 'lfa.json')) {
  let j = null; try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { }
  const B = (j && j.bounds && j.bounds.FWI) || [17, 31, 40, 54], BF = (j && j.bounds && j.bounds.FFMC) || [87, 90, 93, 98];
  const today = new Date(now + 7 * 36e5).toISOString().slice(0, 10);
  if (j && j.run && Date.parse(today) - Date.parse(j.run) <= 3 * 864e5) {
    const days = (j.days || []).filter(d => d.d >= today && d.a && d.a.all && d.a.all.FWI).slice(0, n).map(d => sumDay(d, d.a, B, BF));
    if (days.length && days[0].d === today) return { run: j.run, b: B, days };
  }
  let L; try { L = JSON.parse(fs.readFileSync(lfaFile, 'utf8')) } catch (e) { return null }
  if (!L || L.d !== today || !L.a || !L.a.all || !L.a.all.FWI) return null;
  return { run: L.d, lfa: 1, upd: L.upd, b: B, days: [sumDay({ d: L.d, f: 0 }, L.a, B, BF)] };
}
module.exports = { fwiSummary, FWN: NAME };
if (require.main === module) console.log(JSON.stringify(fwiSummary(process.env.FWI_NOW ? Date.parse(process.env.FWI_NOW) : Date.now()), null, 1));
