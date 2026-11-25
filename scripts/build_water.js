// แหล่งน้ำ (OpenStreetMap ผ่าน Overpass API, ODbL) → data/ftype/water.json สำหรับวงคาดการณ์ MTT (น้ำ = ไฟไม่ลาม) — รันมือ
// ใช้: node scripts/build_water.js [--in <ไฟล์ผล Overpass out geom>]   (ไม่ระบุ = ดึงใหม่ 1 คำขอ)
// กริดเดียวกับ ftype.json (UTM 47N, 50 ม.) ระบายจากกลางเซลล์แบบคู่-คี่ต่อวัตถุ (เกาะ = รู) · ข้ามน้ำชั่วคราว (intermittent/seasonal) เพราะแห้งช่วงไฟป่า
// ลำน้ำที่มีแต่เส้น (ไม่มีรูปพื้นที่) และน้ำแคบกว่า ~50 ม. ไม่ครบ — ไม่ถือเป็นแนวกั้นไฟ
// ผล: {z,x0,y0,px,w,h,n เซลล์,osm วันที่ข้อมูล,r:{แถว:[เริ่ม,ยาว,…]}}
const fs = require('fs'), path = require('path');
const { llToUTM } = require('./lib/tiff');
const D = path.join(__dirname, '..', 'data', 'ftype'), F = JSON.parse(fs.readFileSync(path.join(D, 'ftype.json'), 'utf8'));
const i = process.argv.indexOf('--in');
const Q = '[out:json][timeout:240][bbox:13.2,100.8,15.2,103.4];(way["natural"="water"];relation["natural"="water"];way["landuse"="reservoir"];relation["landuse"="reservoir"];way["waterway"="riverbank"];relation["waterway"="riverbank"];);out geom;';
const dry = t => ['intermittent', 'seasonal'].some(k => t[k] && t[k] !== 'no');

(async () => {
  let j;
  if (i > 0) j = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  else { const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: Q }), signal: AbortSignal.timeout(280000) }); if (!r.ok) throw new Error('Overpass HTTP ' + r.status); j = await r.json() }
  if (j.remark) throw new Error('Overpass: ' + j.remark);
  const { w, h, px, x0, y0, z } = F, g = new Uint8Array(w * h); let used = 0, skip = 0;
  for (const e of j.elements) {
    const ls = e.type === 'way' ? [e.geometry] : (e.members || []).filter(m => m.type === 'way').map(m => m.geometry);
    if (dry(e.tags || {}) || !ls.length || ls.some(l => !l || l.some(p => !p))) { skip++; continue }
    const rows = new Map();
    for (const l of ls) {
      const P = l.map(p => { const [E, N] = llToUTM(p.lon, p.lat, z); return [(E - x0) / px, (y0 - N) / px] });
      for (let k = 1; k < P.length; k++) {
        const [xa, ya] = P[k - 1], [xb, yb] = P[k]; if (ya === yb) continue;
        for (let y = Math.max(0, Math.ceil(Math.min(ya, yb) - .5)), Y = Math.min(h - 1, Math.ceil(Math.max(ya, yb) - .5) - 1); y <= Y; y++) (rows.get(y) || rows.set(y, []).get(y)).push(xa + (y + .5 - ya) / (yb - ya) * (xb - xa));
      }
    }
    if ([...rows.values()].some(x => x.length % 2)) { skip++; continue }   // รูปไม่ปิด = ระบายผิดทั้งแถวได้ จึงไม่ใช้
    for (const [y, xs] of rows) { xs.sort((a, b) => a - b); for (let q = 0; q < xs.length; q += 2) { const a = Math.max(0, Math.ceil(xs[q] - .5)), b = Math.min(w - 1, Math.ceil(xs[q + 1] - .5) - 1); if (b >= a) g.fill(1, y * w + a, y * w + b + 1) } }
    used++;
  }
  const r = {}; let n = 0;
  for (let y = 0; y < h; y++) { const a = []; for (let x = 0; x < w; x++) if (g[y * w + x]) { const s = x; while (x < w && g[y * w + x]) x++; a.push(s, x - s); n += x - s } if (a.length) r[y] = a }
  const o = { src: '© OpenStreetMap contributors (ODbL)', osm: j.osm3s && j.osm3s.timestamp_osm_base, z, x0, y0, px, w, h, n, r };
  fs.writeFileSync(path.join(D, 'water.json'), JSON.stringify(o));
  console.log(`วัตถุ ${j.elements.length} ใช้ ${used} ข้าม ${skip} · น้ำ ${n} เซลล์ (${Math.round(n * px * px / 1600)} ไร่) · ${Math.round(fs.statSync(path.join(D, 'water.json')).size / 1024)} KB`);
})().catch(e => { console.error(e); process.exit(1) });
