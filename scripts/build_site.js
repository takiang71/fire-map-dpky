// สร้างโฟลเดอร์ _site/ สำหรับเผยแพร่ (GitHub Pages) — รันโดย GitHub Actions ทุก ~10 นาที
// ใช้: node scripts/build_site.js
//  - index.html (คัดลอก)
//  - live.json      จุดความร้อน 48 ชม. ล่าสุด เฉพาะในแนวเขตกลุ่มป่า (API ส่งทั้งประเทศ ~2 MB ช่วงพีค → เหลือไม่กี่ KB)
//                   รูปแบบ GeoJSON เดียวกับ API + meta {generated, nation_total, nation_last} ให้หน้าเว็บใช้ liveList เดิมได้
//  - air4thai.json  สถานีวัดฝุ่น Air4Thai (ต้นทางไม่เปิด CORS จึงดึงไว้ให้ที่นี่)
// ถ้าดึงส่วนไหนไม่สำเร็จ จะไม่สร้างไฟล์นั้น หน้าเว็บจะถอยไปดึงจาก API ตรงเอง
const fs = require('fs'), path = require('path');
const { ROOT, H, where } = require('./lib/area');
const { air4thai } = require('./lib/air4thai');

const OUT = path.join(ROOT, '_site');
const API = 'https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/alerts';
const th = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 19); // เวลาไทยรูปแบบที่ API รับ

async function live() {
  const n = Date.now(), url = `${API}?start_date=${encodeURIComponent(th(n - 48 * 36e5))}&end_date=${encodeURIComponent(th(n))}&reserved_only=0&protected_only=0`;
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(120e3) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), all = j.features || [];
    const keep = all.filter(f => f.geometry && where(f.geometry.coordinates[0], f.geometry.coordinates[1]));
    const last = all.reduce((m, f) => (f.properties && f.properties.full_date > m ? f.properties.full_date : m), '');
    return { type: 'FeatureCollection', meta: { generated: new Date().toISOString(), nation_total: all.length, nation_last: last || null }, features: keep };
  } catch (e) {
    if (k >= 3) throw e;
    await new Promise(r => setTimeout(r, 5000 * k));
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(H, path.join(OUT, 'index.html'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  let ok = true;
  try {
    const L = await live();
    fs.writeFileSync(path.join(OUT, 'live.json'), JSON.stringify(L));
    console.log(`live.json: ในแนวเขต ${L.features.length} จาก ${L.meta.nation_total} จุดทั้งประเทศ · สแกนล่าสุด ${L.meta.nation_last}`);
  } catch (e) { ok = false; console.log('live.json ไม่สำเร็จ:', e.message) }
  try {
    const b = await air4thai();
    JSON.parse(b); // ตรวจว่าเป็น JSON จริง
    fs.writeFileSync(path.join(OUT, 'air4thai.json'), b);
    console.log('air4thai.json:', (b.length / 1024).toFixed(0), 'KB');
  } catch (e) { console.log('air4thai.json ไม่สำเร็จ:', e.message) }
  if (!ok) process.exitCode = 1;
})();
