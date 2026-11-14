// ตารางค่า PM2.5 แบบจำลอง CAMS global (Copernicus/ECMWF ~0.4°) รอบประเทศไทย — ผู้ใช้ขอ 14 พ.ย. 69 "ทำตารางค่า + สีเกณฑ์ไทย"
// (เดิมหน้าเว็บใช้ภาพสีจาก WMS ของ ECMWF ซึ่งระบายตามสีของ CAMS และแปลงเป็นเกณฑ์ไทยไม่ได้ · เฟรม 00UTC ของ WMS เป็นพยากรณ์รอบก่อน)
// แหล่ง: Open-Meteo Air Quality API domains=cams_global (ไม่ต้องใช้คีย์) — ตรวจ 14 พ.ย. 69: ค่าเท่ากับ GetFeatureInfo ของ ECMWF WMS ทุกจุด (r 1.00 ทุกเวลาตั้งแต่ 03UTC)
//   และเวลา 00UTC = ค่าตั้งต้นของรอบใหม่ (ตรงกับภาพ PM2.5 CAMS ของ LFA Thailand r 0.87) · Open-Meteo คืนค่าช่องตารางใกล้สุด จึงขอที่จุดตาราง 0.4° พอดี
// กรอบ ลองจิจูด 92.0–109.6 ละติจูด 5.2–23.6 (ไทย เมียนมา ลาว กัมพูชา เวียดนามใต้ — ต้นทางควันข้ามแดน) = 45×47 = 2,115 จุด · ทุก 3 ชม. ตั้งแต่ 00UTC เมื่อวานถึงสิ้นพยากรณ์ (~5 วัน)
// โควตา Open-Meteo นับต่อจุด → ดึงเฉพาะเมื่อมีรอบแบบจำลองใหม่ (static/meta.json last_run_initialisation_time · CAMS global วันละ 2 รอบ 00/12UTC) ≈ 4,200 ต่อวัน (จำกัดฟรี 10,000/วัน 5,000/ชม.)
//   ขอทีละ PER จุด เว้น GAP วินาที (จำกัด 600 ต่อนาที)
// ผล data/cams_grid.json {src,run,upd,x0,y0,d,nx,ny,t0,dt,q:10,v:[base64 Uint16LE ค่า×10 แถวใต้→เหนือ ต่อเวลา; 65535 = ไม่มีข้อมูล]}
// ใช้: node scripts/sync_cams.js [--force]
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'cams_grid.json');
const API = process.env.OM_AQ || 'https://air-quality-api.open-meteo.com';
const X0 = 92.0, Y0 = 5.2, D = 0.4, NX = 45, NY = 47, PER = 100, GAP = 11e3, Q = 10, NUL = 65535;
const UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90e3) });
      if (r.status === 429) throw new Error('HTTP 429 (โควตา)'); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)); return await r.json() }
    catch (e) { if (a === 3) throw e; await sleep(15e3 * (a + 1)) }
  }
}
(async () => {
  const force = process.argv.includes('--force');
  const meta = await get(API + '/data/cams_global/static/meta.json'), run = new Date(meta.last_run_initialisation_time * 1e3).toISOString().slice(0, 13) + 'Z';
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  if (prev && prev.run === run && !force) return console.log('CAMS รอบ', run, 'มีอยู่แล้ว ไม่ดึงใหม่');
  const P = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) P.push([+(X0 + i * D).toFixed(1), +(Y0 + j * D).toFixed(1)]);
  let T = null; const V = [];
  for (let k = 0; k < P.length; k += PER) {
    const B = P.slice(k, k + PER);
    const j = await get(`${API}/v1/air-quality?latitude=${B.map(p => p[1]).join(',')}&longitude=${B.map(p => p[0]).join(',')}&hourly=pm2_5&past_days=1&forecast_days=6&timezone=GMT&domains=cams_global&cell_selection=nearest`);
    const A = Array.isArray(j) ? j : [j];
    if (A.length !== B.length) throw new Error(`ได้ ${A.length} จุดจาก ${B.length}`);
    for (const x of A) {
      const t = x.hourly.time.map(s => Date.parse(s + 'Z')), I = t.map((v, i) => v % 108e5 === 0 ? i : -1).filter(i => i >= 0); // ทุก 3 ชม. (00,03,…UTC)
      if (!T) T = I.map(i => t[i]); else if (I.length !== T.length || t[I[0]] !== T[0]) throw new Error('เวลาของแต่ละจุดไม่ตรงกัน');
      V.push(I.map(i => x.hourly.pm2_5[i]));
    }
    process.stdout.write(`\r${Math.min(k + PER, P.length)}/${P.length} จุด`);
    if (k + PER < P.length) await sleep(GAP);
  }
  console.log();
  // ตัดเวลาท้ายที่ไม่มีค่าเลย (เกินสิ้นพยากรณ์)
  let n = T.length; while (n > 0 && V.every(r => r[n - 1] == null)) n--;
  if (n < 16) throw new Error('ข้อมูลน้อยผิดปกติ (' + n + ' เวลา) — คงไฟล์เดิม');
  const miss = V.reduce((s, r) => s + r.slice(0, n).filter(v => v == null).length, 0);
  if (miss > P.length * n * .05) throw new Error(`ค่าว่าง ${miss} จาก ${P.length * n} — คงไฟล์เดิม`);
  const v = []; for (let k = 0; k < n; k++) { const b = Buffer.alloc(P.length * 2); V.forEach((r, p) => b.writeUInt16LE(r[k] == null ? NUL : Math.min(NUL - 1, Math.round(r[k] * Q)), p * 2)); v.push(b.toString('base64')) }
  const o = { src: 'Copernicus CAMS global ผ่าน Open-Meteo Air Quality API (cams_global)', run, upd: new Date().toISOString(), x0: X0, y0: Y0, d: D, nx: NX, ny: NY, t0: T[0], dt: 108e5, q: Q, v };
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(o)); fs.renameSync(OUT + '.tmp', OUT);
  console.log(`CAMS รอบ ${run} · ${n} เวลา (${new Date(T[0]).toISOString().slice(0, 13)}Z – ${new Date(T[n - 1]).toISOString().slice(0, 13)}Z) × ${P.length} จุด · ค่าว่าง ${miss} · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})().catch(e => { console.error('\nsync_cams:', e.message); process.exit(1) });
