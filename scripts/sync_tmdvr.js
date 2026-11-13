// อัตราการระบายอากาศรายวัน 77 จังหวัด จากกรมอุตุนิยมวิทยา (ศูนย์โอโซนและรังสี https://ozone.tmd.go.th/Daily_VR.html) — ผู้ใช้ขอ 13 พ.ย. 69
// ต้นทางเผยแพร่เป็น "ภาพกราฟแท่ง" พยากรณ์ 10 วัน (GFS 00Z) จังหวัดละ 1 ภาพ วันละครั้ง ~13:45 น. · ไม่มีไฟล์ตัวเลขและไม่เปิด CORS
// จึงดาวน์โหลดภาพแล้ว "อ่านความสูงแท่งจากพิกเซล" (เทียบมาตราส่วนกับเส้นประเกณฑ์ 2,000/4,000/8,000/16,000 ที่อยู่ในภาพ) → data/tmd_vr.json
// ความละเอียด ~47 ตร.ม./วินาทีต่อพิกเซล (ตรวจกับตัวเลขบนกราฟกรุงเทพฯ 13 พ.ย. 69: คลาดเคลื่อน ≤25)
// ใช้: node scripts/sync_tmdvr.js [--dry]   (sync.yml เรียกทุกรอบ; เขียนไฟล์เฉพาะเมื่อข้อมูลเปลี่ยน)
const fs = require('fs'), path = require('path');
const { decodePNG } = require('./lib/png');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'data', 'tmd_vr.json');
const BASE = process.env.TMDVR_BASE || 'https://ozone.tmd.go.th/PM2.5/weather/Metgram/output/VR_daily/';
const UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
// รหัสภาพ (สถานีตรวจอากาศของจังหวัด) → ชื่อจังหวัดตาม data/prov.json — จากหน้า wi_daily_bottomframe.html
const ST = [[455301, 'กรุงเทพมหานคร'], [411000, 'นนทบุรี'], [419301, 'ปทุมธานี'], [429301, 'สมุทรปราการ'], [451301, 'นครปฐม'], [474000, 'สมุทรสาคร'],
  [327501, 'เชียงใหม่'], [303201, 'เชียงราย'], [300201, 'แม่ฮ่องสอน'], [310201, 'พะเยา'], [331201, 'น่าน'], [329201, 'ลำพูน'], [328201, 'ลำปาง'], [330201, 'แพร่'],
  [376201, 'ตาก'], [351201, 'อุตรดิตถ์'], [373201, 'สุโขทัย'], [378201, 'พิษณุโลก'], [380201, 'กำแพงเพชร'], [386301, 'พิจิตร'], [379201, 'เพชรบูรณ์'],
  [407501, 'อุบลราชธานี'], [381201, 'ขอนแก่น'], [363201, 'บึงกาฬ'], [352201, 'หนองคาย'], [353201, 'เลย'], [357201, 'นครพนม'], [354201, 'อุดรธานี'],
  [360201, 'หนองบัวลำภู'], [356201, 'สกลนคร'], [383201, 'มุกดาหาร'], [388401, 'กาฬสินธุ์'], [387401, 'มหาสารคาม'], [405201, 'ร้อยเอ็ด'], [391201, 'อำนาจเจริญ'],
  [403201, 'ชัยภูมิ'], [406201, 'ยโสธร'], [436201, 'บุรีรัมย์'], [409301, 'ศรีสะเกษ'], [431201, 'นครราชสีมา'], [432201, 'สุรินทร์'],
  [400201, 'นครสวรรค์'], [410201, 'อุทัยธานี'], [402301, 'ชัยนาท'], [414000, 'อ่างทอง'], [415301, 'พระนครศรีอยุธยา'], [416000, 'สิงห์บุรี'], [417201, 'นครนายก'],
  [418000, 'สระบุรี'], [424301, 'ราชบุรี'], [425201, 'สุพรรณบุรี'], [426201, 'ลพบุรี'], [438201, 'สมุทรสงคราม'], [450201, 'กาญจนบุรี'],
  [423301, 'ฉะเชิงเทรา'], [459201, 'ชลบุรี'], [478201, 'ระยอง'], [430201, 'ปราจีนบุรี'], [440401, 'สระแก้ว'], [480201, 'จันทบุรี'], [501201, 'ตราด'],
  [568501, 'สงขลา'], [564201, 'ภูเก็ต'], [465201, 'เพชรบุรี'], [500201, 'ประจวบคีรีขันธ์'], [517201, 'ชุมพร'], [532201, 'ระนอง'], [551201, 'สุราษฎร์ธานี'],
  [561201, 'พังงา'], [552201, 'นครศรีธรรมราช'], [566202, 'กระบี่'], [560301, 'พัทลุง'], [567201, 'ตรัง'], [580201, 'ปัตตานี'], [570201, 'สตูล'], [581301, 'ยะลา'], [583201, 'นราธิวาส']];
const REF = [[2000, [255, 165, 0]], [4000, [0, 128, 0]], [8000, [0, 0, 255]], [16000, [0, 0, 139]]]; // สีเส้นประเกณฑ์ในกราฟ (matplotlib orange/green/blue/darkblue)

// อ่านกราฟ: กรอบแกน = เส้นดำ · y ของค่า 0 = เส้นแกนล่าง · มาตราส่วนจากเส้นประเกณฑ์ · แท่ง = ช่วงสีที่ไม่ใช่สีขาวชิดแกนล่าง
function readChart(buf) {
  const { w, h, d } = decodePNG(buf), P = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]] };
  const eq = (a, b, t = 6) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t, dark = p => p[0] + p[1] + p[2] < 120, white = p => p[0] > 248 && p[1] > 248 && p[2] > 248;
  const mx = Math.floor(w / 2), rows = []; for (let y = 0; y < h; y++) if (dark(P(mx, y))) { let n = 0; for (let x = 0; x < w; x += 4) if (dark(P(x, y))) n++; if (n > w / 8) rows.push(y) }
  if (rows.length < 2) throw new Error('ไม่พบกรอบแกน');
  const y0 = rows[rows.length - 1], yT = rows.filter(y => y < y0 - 50)[0]; // แกนล่าง / แกนบน (เส้นแบ่งหัวกราฟอาจมีมากกว่า 1 — ใช้เส้นที่อยู่ใต้สุดที่ยังห่างแกนล่าง)
  const cy = Math.round((y0 + (yT ?? 0)) / 2), cols = []; for (let x = 0; x < w; x++) if (dark(P(x, cy))) { let n = 0; for (let y = yT ?? 0; y <= y0; y += 3) if (dark(P(x, y))) n++; if (n > (y0 - (yT ?? 0)) / 4) cols.push(x) }
  const x0 = cols[0], x1 = cols.filter(x => x > x0 + 100)[0]; if (x0 == null || x1 == null) throw new Error('ไม่พบแกนซ้าย/ขวา');
  // มาตราส่วน: เส้นประแต่ละสีที่ยาวเกิน 30% ของความกว้างแกน
  const ref = [];
  for (const [v, c] of REF) { let best = null; for (let y = (yT ?? 0) + 1; y < y0; y++) { let n = 0; for (let x = x0 + 1; x < x1; x++) if (eq(P(x, y), c, 4)) n++; if (n > (x1 - x0) * .3 && (!best || n > best[1])) best = [y, n] } if (best) ref.push([v, best[0]]) }
  if (!ref.length) throw new Error('ไม่พบเส้นประเกณฑ์สำหรับเทียบมาตราส่วน');
  const k = ref.reduce((s, [v, y]) => s + v * (y0 - y), 0) / ref.reduce((s, [v]) => s + v * v, 0); // พิกเซลต่อ ตร.ม./วินาที (ผ่านจุด 0 ที่แกนล่าง)
  // แท่ง: แถวเหนือแกนล่าง 2 พิกเซล หาช่วงที่ไม่ใช่สีขาว
  const yb = y0 - 2, runs = []; let s = -1;
  for (let x = x0 + 1; x <= x1; x++) { const on = x < x1 && !white(P(x, yb)) && !dark(P(x, yb)); if (on && s < 0) s = x; if (!on && s >= 0) { if (x - s >= 8) runs.push([s, x - 1]); s = -1 } }
  const bars = runs.map(([a, b]) => { const cx = Math.round((a + b) / 2), col = P(cx, yb); let top = yb;
    /* แถวที่เป็นแท่ง = มีพิกเซลสีแท่ง ≥10% ของความกว้าง (แถวที่เส้นประพาดผ่าน ช่องว่างระหว่างขีดยังเห็นสีแท่ง) */
    const fr = y => { let n = 0; for (let x = a + 1; x < b; x++) if (eq(P(x, y), col, 14)) n++; return n / Math.max(1, b - a - 1) };
    for (let y = yb - 1; y > (yT ?? 0); y--) { if (fr(y) >= .1) { top = y; continue } break }
    return { cx, v: (y0 - top) / k } });
  return { bars, x0, x1, y0, k, ref: ref.map(r => r[0]) };
}
// วางแท่งลงช่อง 10 วัน: ระยะห่างแท่งจากแท่งที่พบ (แท่งค่าต่ำมากอาจไม่เห็น = null)
function toDays(R, n = 10) {
  const B = R.bars; if (!B.length) return Array(n).fill(null);
  let dx = (R.x1 - R.x0) / n; if (B.length >= 2) { const ds = B.slice(1).map((b, i) => b.cx - B[i].cx), m = Math.min(...ds); dx = ds.map(x => x / Math.max(1, Math.round(x / m))).reduce((a, b) => a + b) / ds.length }
  // แท่งแรกอยู่ช่องไหน: ให้ทุกแท่งลงช่อง 0..n-1 และสอดคล้องกับระยะจากขอบซ้าย
  const off = Math.round((B[0].cx - R.x0 - dx / 2) / dx), out = Array(n).fill(null);
  for (const b of B) { const i = off + Math.round((b.cx - B[0].cx) / dx); if (i >= 0 && i < n) out[i] = Math.round(b.v / 10) * 10 }
  return out;
}
const thDate = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);
async function get(id) {
  const r = await fetch(BASE + `daily_VR_${id}.png?v=${Date.now()}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60e3) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || ''; if (!/image\/png/.test(ct)) throw new Error('ไม่ใช่ภาพ PNG (' + ct + ')');
  return { buf: Buffer.from(await r.arrayBuffer()), lm: Date.parse(r.headers.get('last-modified') || '') || null };
}
if (require.main === module) (async () => {
  const dry = process.argv.includes('--dry'), p = {}, err = [], lms = [];
  let i = 0; const work = async () => { while (i < ST.length) { const [id, nm] = ST[i++];
    try { const { buf, lm } = await get(id), R = readChart(buf); p[nm] = { id, lm, v: toDays(R) }; if (lm) lms.push(lm) }
    catch (e) { err.push(`${nm} (${id}): ${e.message}`) } } };
  await Promise.all([work(), work(), work(), work()]);
  const ok = Object.keys(p).length; console.log(`อ่านได้ ${ok}/${ST.length} จังหวัด` + (err.length ? '\n  ' + err.join('\n  ') : ''));
  if (ok < ST.length / 2) { console.error('อ่านได้น้อยเกินไป — คงไฟล์เดิม'); process.exit(1) }
  // วันแรกของกราฟ = วันที่ (เวลาไทย) ที่ภาพถูกสร้าง (GFS รอบ 00Z ของวันนั้น) · ใช้ค่าที่พบมากสุด
  const cnt = {}; for (const [, o] of Object.entries(p)) if (o.lm) { const d = thDate(o.lm); cnt[d] = (cnt[d] || 0) + 1 }
  const d0 = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0]; if (!d0) { console.error('ไม่ทราบวันที่ของกราฟ'); process.exit(1) }
  const P = {}; for (const [, nm] of ST) if (p[nm]) { const o = p[nm], dd = o.lm ? thDate(o.lm) : d0, sh = Math.round((Date.parse(dd) - Date.parse(d0)) / 864e5); // ภาพจังหวัดที่อัปเดตไม่พร้อมกัน เลื่อนให้ตรงวัน
    P[nm] = { id: o.id, v: sh ? o.v.map((_, j) => o.v[j - sh] ?? null) : o.v } }
  const out = { src: 'กรมอุตุนิยมวิทยา ศูนย์โอโซนและรังสี (GFS)', url: 'https://ozone.tmd.go.th/Daily_VR.html', d0, n: 10, lm: new Date(Math.max(...lms)).toISOString(), p: P, err: err.length ? err : undefined };
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null, same = prev && JSON.stringify({ ...prev, upd: 0 }) === JSON.stringify({ ...out, upd: 0 });
  const nk = P['นครนายก'], pj = P['ปราจีนบุรี']; console.log(`วันแรก ${d0} · นครนายก ${nk && nk.v.join(',')} · ปราจีนบุรี ${pj && pj.v.join(',')}`);
  if (dry) return console.log('--dry ไม่เขียนไฟล์');
  if (same) return console.log('ข้อมูลเดิม ไม่เขียนไฟล์');
  out.upd = new Date().toISOString(); fs.writeFileSync(OUT + '.tmp', JSON.stringify(out)); fs.renameSync(OUT + '.tmp', OUT); console.log('เขียน', path.relative(ROOT, OUT));
})().catch(e => { console.error(e); process.exit(1) });
module.exports = { readChart, toDays };
