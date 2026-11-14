// PM2.5 แบบจำลอง CAMS (Copernicus Atmosphere Monitoring Service, ECMWF) ที่ 4 อุทยาน — ใช้ในสรุปประจำวัน LINE/Telegram (ผู้ใช้ขอ 14 พ.ย. 69)
// แหล่งเดียวกับชั้น "PM2.5 แบบจำลอง CAMS" บนหน้าเว็บ: WMS สาธารณะของ ECMWF ชั้น composition_pm2p5 (CAMS global ~0.4°) ไม่ต้องใช้คีย์
//   ค่าที่จุด = GetFeatureInfo (จุดตารางแบบจำลองใกล้สุด) จุดเดียวกับ CMPT ใน index.html · ทุก 3 ชม.
// ดึงวันไทยตั้งแต่วันนี้ไปข้างหน้า ≤4 วัน (เท่าที่ WMS มี — รอบ 00UTC พยากรณ์ถึง +5 วัน) 4 จุด × ≤32 เวลา ≈ 15 วินาที
// ผล data/cams_pm.json {src,upd,def (เวลาเริ่มต้นของ WMS ≈ รอบล่าสุด),pts:[[ชื่อ,lon,lat,glon,glat]],t:[ms UTC],v:[[ค่าต่อจุด]]} เขียนเฉพาะเมื่อค่าเปลี่ยน
// ใช้: node scripts/sync_cams.js
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'cams_pm.json');
const W = process.env.CAMS_WMS || 'https://eccharts.ecmwf.int/wms/?token=public', L = 'composition_pm2p5';
const PTS = [['เขาใหญ่', 101.4, 14.42], ['ทับลาน', 102.05, 14.15], ['ปางสีดา', 102.2, 13.95], ['ตาพระยา', 102.65, 14.15]]; // = CMPT ใน index.html
const DAYS = 4, UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u, json) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45e3) }); if (!r.ok) throw new Error('HTTP ' + r.status); return json ? await r.json() : await r.text() }
    catch (e) { if (a === 2) throw e; await sleep(2000 * (a + 1)) }
  }
}
const ts = t => new Date(t).toISOString().slice(0, 19) + 'Z';
(async () => {
  const x = await get(`${W}&service=WMS&version=1.3.0&request=GetCapabilities&layers=${L}`), i = x.indexOf('<Name>' + L + '</Name>');
  const m = i < 0 ? null : x.slice(i).match(/<Dimension([^>]*name="time"[^>]*)>([^<]*)</);
  if (!m) throw new Error('ไม่พบมิติเวลาของ ' + L + ' ใน GetCapabilities');
  const [a, b, st] = m[2].trim().split('/'), step = (+(st.match(/PT(\d+)H/) || [0, 3])[1]) * 36e5, t1 = Date.parse(b);
  const day0 = Math.floor((Date.now() + 7 * 36e5) / 864e5) * 864e5 - 7 * 36e5; // 00:00 น. วันนี้ (เวลาไทย) เป็น UTC
  const T = []; for (let t = Date.parse(a); t <= t1; t += step) if (t > day0 && t <= day0 + DAYS * 864e5) T.push(t);
  if (!T.length) throw new Error('WMS ไม่มีเวลาของวันนี้เป็นต้นไป (' + m[2] + ')');
  const V = T.map(() => PTS.map(() => null)), G = PTS.map(() => null), jobs = [];
  T.forEach((t, ti) => PTS.forEach((p, pi) => jobs.push([ti, pi])));
  let k = 0, bad = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { // พร้อมกัน 4 คำขอ (ECMWF ตอบ 0.4–0.8 วิ)
    while (k < jobs.length) { const [ti, pi] = jobs[k++], [, lo, la] = PTS[pi];
      const u = `${W}&service=WMS&request=GetFeatureInfo&version=1.3.0&layers=${L}&query_layers=${L}&crs=EPSG:4326&bbox=${(la - .01).toFixed(4)},${(lo - .01).toFixed(4)},${(la + .01).toFixed(4)},${(lo + .01).toFixed(4)}&width=3&height=3&i=1&j=1&info_format=application/json&time=${ts(T[ti])}`;
      try { const p = ((await get(u, true)).Probes || [])[0], v = p && p.Value ? +p.Value.Data : NaN;
        if (isFinite(v)) { V[ti][pi] = Math.round(v * 10) / 10; if (!G[pi]) G[pi] = [+p['Grid point longitude'], +p['Grid point latitude']] } else bad++ }
      catch (e) { bad++ } }
  }));
  if (bad > jobs.length * .2) throw new Error(`อ่านค่าไม่ได้ ${bad}/${jobs.length} คำขอ — คงไฟล์เดิม`);
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const o = { src: 'Copernicus CAMS global (ECMWF WMS composition_pm2p5)', upd: new Date().toISOString(), def: (m[1].match(/default="([^"]*)"/) || [])[1] || null, pts: PTS.map((p, i) => [...p, ...(G[i] || [])]), t: T, v: V };
  if (prev && JSON.stringify([prev.t, prev.v, prev.pts]) === JSON.stringify([o.t, o.v, o.pts])) return console.log('PM2.5 CAMS ค่าเดิม ไม่เขียนไฟล์');
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(o)); fs.renameSync(OUT + '.tmp', OUT);
  console.log(`PM2.5 CAMS ${T.length} เวลา (${ts(T[0])} – ${ts(T[T.length - 1])}) × ${PTS.length} จุด · อ่านไม่ได้ ${bad}`);
})().catch(e => { console.error('sync_cams:', e.message); process.exit(1) });
