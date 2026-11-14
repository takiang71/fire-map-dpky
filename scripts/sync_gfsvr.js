// อัตราการระบายอากาศจาก NOAA GFS โดยตรง (ตัวแปร VRATE ที่ระดับ planetary boundary layer, ตร.ม./วินาที) — ผู้ใช้สั่ง 13 พ.ย. 69 "เปลี่ยนเป็น GFS"
// = แหล่งเดียวกับกรมอุตุนิยมวิทยา (ozone.tmd.go.th "Source: NOAA's GFS products") — ค่ารายวันของกรมอุตุฯ = ค่าเฉลี่ย VRATE ของวัน UTC (07:00–06:00 น. ไทย)
//   ตรวจ 13 พ.ย. 69 จุดกรุงเทพฯ: GFS 1,083 / กรมอุตุฯ 1,088 · ปราจีนบุรี 1,200 / 1,170
// ดึงผ่าน NOMADS grib filter (ตัดเฉพาะกรอบประเทศไทย ~6 KB ต่อชั่วโมงพยากรณ์, simple packing) ชั่วโมง 0–120 ทุกชั่วโมง = 121 ไฟล์ (5 วัน; หลังจากนั้น GFS ออกทุก 3 ชม. จึงไม่ใช้ — ผู้ใช้ขอ 14 พ.ย. 69)
// รอบ GFS ออกวันละ 4 รอบ (00/06/12/18Z) ครบ 120 ชม. ราว 3.5–4 ชม. หลังเวลารอบ · ไม่มีรอบใหม่ = ไม่ดึง
// NOMADS จำกัด ~120 ครั้ง/นาที → เว้น 0.6 วิต่อคำขอ (~2 นาที) · NOMADS ไม่เปิด CORS หน้าเว็บจึงอ่านจากไฟล์นี้
// ผล data/gfs_vr.json {src,cyc,y0,x0,d,nx,ny,q:100,h:[ชั่วโมงพยากรณ์],v:[base64 Uint8 ค่า/100 (สูงสุด 255) แถวใต้→เหนือ]}
// ใช้: node scripts/sync_gfsvr.js [--force] [--cyc YYYYMMDDHH]
const fs = require('fs'), path = require('path');
const { decode } = require('./lib/grib');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'data', 'gfs_vr.json');
const NOM = process.env.GFS_NOMADS || 'https://nomads.ncep.noaa.gov';
const BOX = { top: 21, bottom: 5, left: 97, right: 106 }; // ประเทศไทยทั้งประเทศ (ละติจูด 5.6–20.5, ลองจิจูด 97.3–105.7)
const HRS = Array.from({ length: 121 }, (_, i) => i); // เฉพาะช่วงที่ GFS ออกทุกชั่วโมง (5 วัน) — ผู้ใช้ขอ 14 พ.ย. 69 ให้ทุกวันเป็นรายชั่วโมงเท่ากับ Open-Meteo (หลัง 120 ชม. GFS ออกทุก 3 ชม.)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
const ymd = t => t.toISOString().slice(0, 10).replace(/-/g, '');
async function ok(url) { try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) }); return r.ok } catch (e) { return false } }
async function latest() { // รอบล่าสุดที่มีชั่วโมง 120 แล้ว (ย้อนหลังไม่เกิน 2 วัน)
  let t = Math.floor(Date.now() / 216e5) * 216e5;
  for (let k = 0; k < 8; k++, t -= 216e5) { const d = new Date(t), c = String(d.getUTCHours()).padStart(2, '0');
    if (await ok(`${NOM}/pub/data/nccf/com/gfs/prod/gfs.${ymd(d)}/${c}/atmos/gfs.t${c}z.pgrb2.0p25.f120.idx`)) return d }
  return null;
}
async function grab(d, fh) {
  const c = String(d.getUTCHours()).padStart(2, '0'), f = String(fh).padStart(3, '0');
  const u = `${NOM}/cgi-bin/filter_gfs_0p25.pl?dir=%2Fgfs.${ymd(d)}%2F${c}%2Fatmos&file=gfs.t${c}z.pgrb2.0p25.f${f}&var_VRATE=on&lev_planetary_boundary_layer=on&subregion=&toplat=${BOX.top}&leftlon=${BOX.left}&rightlon=${BOX.right}&bottomlat=${BOX.bottom}`;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60e3) }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const g = decode(Buffer.from(await r.arrayBuffer())).find(m => m.cat === 2 && m.num === 224); if (!g || !g.v) throw new Error('ไม่พบ VRATE ในไฟล์'); return g }
    catch (e) { if (a === 2) throw e; await sleep(3000 * (a + 1)) }
  }
}
(async () => {
  const force = process.argv.includes('--force'), ci = process.argv.indexOf('--cyc');
  const d = ci > 0 ? new Date(Date.UTC(+process.argv[ci + 1].slice(0, 4), +process.argv[ci + 1].slice(4, 6) - 1, +process.argv[ci + 1].slice(6, 8), +process.argv[ci + 1].slice(8, 10))) : await latest();
  if (!d) { console.error('หา GFS รอบล่าสุดไม่ได้ (NOMADS ไม่ตอบ?) — คงไฟล์เดิม'); process.exit(1) }
  const cyc = d.toISOString().slice(0, 13) + 'Z', prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  if (prev && prev.cyc === cyc && !force) return console.log('GFS รอบ', cyc, 'มีอยู่แล้ว ไม่ดึงใหม่');
  console.log('ดึง GFS รอบ', cyc, HRS.length, 'ชั่วโมงพยากรณ์');
  let G = null; const h = [], v = [], miss = [];
  for (const fh of HRS) {
    try { const g = await grab(d, fh);
      if (!G) G = g; else if (g.ni !== G.ni || g.nj !== G.nj || g.la1 !== G.la1 || g.lo1 !== G.lo1) throw new Error('กริดไม่ตรงกับชั่วโมงแรก');
      const b = Buffer.alloc(g.np); for (let i = 0; i < g.np; i++) b[i] = Math.max(0, Math.min(255, Math.round(g.v[i] / 100)));
      h.push(fh); v.push(b.toString('base64')) }
    catch (e) { miss.push(fh + ': ' + e.message) }
    await sleep(600);
  }
  if (miss.length) console.log('ดึงไม่ได้', miss.length, 'ชั่วโมง\n  ' + miss.slice(0, 10).join('\n  '));
  if (!G || miss.length > 8) { console.error('ข้อมูลขาดมากเกินไป — คงไฟล์เดิม'); process.exit(1) }
  const out = { src: 'NOAA NCEP GFS 0.25° (NOMADS) · VRATE planetary boundary layer', cyc, x0: G.lo1, y0: G.la1, d: G.di, dy: G.la2 > G.la1 ? G.dj : -G.dj, nx: G.ni, ny: G.nj, q: 100, h, v, upd: new Date().toISOString() };
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(out)); fs.renameSync(OUT + '.tmp', OUT);
  console.log(`เขียน ${path.relative(ROOT, OUT)} ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB · ${h.length} ชั่วโมง · กริด ${G.ni}×${G.nj}`);
})().catch(e => { console.error(e); process.exit(1) });
