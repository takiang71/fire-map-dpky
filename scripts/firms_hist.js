// จุดความร้อนย้อนหลังจาก NASA FIRMS ช่วงก่อนที่ API ไทยมีข้อมูล (ผู้ใช้ขอ 11 พ.ย. 69 "ย้อนไปจนถึงปี 61")
// API ไทยตอบว่างทุกวันก่อน 3 ส.ค. 67 → ช่วงปีงบ 2561 (1 ต.ค. 60) ถึง 2 ส.ค. 67 ใช้ FIRMS (ดาวเทียมชุดเดียวกัน VIIRS 375 ม.)
//   SNPP ตั้งแต่ต้นช่วง · NOAA-20 ตั้งแต่ 1 เม.ย. 61 (FIRMS SP เริ่มวันนั้น) · NOAA-21 ตั้งแต่ 1 มี.ค. 66
// ใช้: node scripts/firms_hist.js [--from 2017-10-01] [--to 2024-08-02]   (ต้องมี MAP_KEY: env FIRMS_KEY หรือไฟล์ .firms_key)
//   ดึงทีละ 60 วันต่อดาวเทียม บันทึกทุกช่วง (ดึงต่อจากเดิมได้ถ้าหยุดกลางทาง) → data/hotspots_hist.json (เฉพาะจุดในแนวเขต + พื้นที่เฝ้าระวังพิเศษ)
//   รันครั้งเดียว ข้อมูลช่วงนี้ไม่เปลี่ยนแล้ว · sync_hotspots.js ฝังลง index.html ร่วมกับ adata (คอลัมน์ src = FIRMS)
const fs = require('fs'), path = require('path');
const FM = require('./lib/firms');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'data', 'hotspots_hist.json');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const D0 = FM.dayOf(arg('--from') || '2017-10-01'), D1 = FM.dayOf(arg('--to') || '2024-08-02'), STEP = 60;
const START = { SNPP: D0, NOAA20: FM.dayOf('2018-04-01'), NOAA21: FM.dayOf('2023-03-01') };

const st = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { done: {}, recs: [] };
const save = () => { st.upd = new Date().toISOString(); st.from = FM.isoOf(D0); st.to = FM.isoOf(D1); fs.writeFileSync(OUT + '.tmp', JSON.stringify(st)); fs.renameSync(OUT + '.tmp', OUT) };

(async () => {
  if (!FM.key()) { console.log('ไม่มี MAP_KEY: ตั้ง env FIRMS_KEY หรือสร้างไฟล์ .firms_key'); process.exit(1) }
  for (const s of Object.keys(START)) for (let a = Math.max(D0, START[s]); a <= D1; a += STEP) {
    const b = Math.min(D1, a + STEP - 1), k = `${s}|${a}|${b}`; if (st.done[k]) continue;
    const L = await FM.area(s, a, b, console.log);
    st.recs = st.recs.filter(r => !(r.sat === s && r.d >= a && r.d <= b)).concat(L.map(({ fid, ...r }) => ({ ...r, fid })));
    st.done[k] = L.length; save();
    console.log(`${s} ${FM.isoOf(a)}–${FM.isoOf(b)}: ${L.length} จุด (รวม ${st.recs.length})`);
  }
  st.recs.sort((x, y) => x.d - y.d || x.t - y.t || x.la - y.la); save();
  const by = {}; st.recs.forEach(r => { const x = new Date(r.d * 864e5), fy = x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0), q = fy + ' ' + r.sat + (r.ar ? '' : ' (เฝ้าระวัง)'); by[q] = (by[q] || 0) + 1 });
  console.log('เสร็จ', st.recs.length, 'จุด', by);
})().catch(e => { console.log('ผิดพลาด:', e.message); process.exit(1) });
