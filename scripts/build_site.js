// สร้างโฟลเดอร์ _site/ สำหรับเผยแพร่ (GitHub Pages) — รันโดย GitHub Actions ทุก ~10 นาที
// ใช้: node scripts/build_site.js
//  - index.html (คัดลอก)
//  - live.json      จุดความร้อน 48 ชม. ล่าสุด เฉพาะในแนวเขตกลุ่มป่า (API ส่งทั้งประเทศ ~2 MB ช่วงพีค → เหลือไม่กี่ KB)
//                   รูปแบบ GeoJSON เดียวกับ API + meta {generated, nation_total, nation_last} ให้หน้าเว็บใช้ liveList เดิมได้
//                   + properties._ar (พื้นที่อนุรักษ์) / _st (สถานีฯ) จากแนวเขต KMZ ให้ LINE bot ใช้
//  - summary.json   ยอดสะสมปีงบตามดาวเทียมตัวชี้วัด (adata + live.json ตรรกะเดียวกับ fyNow ในหน้าเว็บ) แยกตามพื้นที่/สถานีฯ — ให้ LINE bot ตอบ "สรุป"
//  - notify.json    สถานะการแจ้งเตือน LINE (สร้างโดย scripts/line_notify.js ขั้นถัดไปใน workflow)
//  - air4thai.json  สถานีวัดฝุ่น Air4Thai (ต้นทางไม่เปิด CORS จึงดึงไว้ให้ที่นี่)
// ถ้าดึงส่วนไหนไม่สำเร็จ จะไม่สร้างไฟล์นั้น หน้าเว็บจะถอยไปดึงจาก API ตรงเอง
const fs = require('fs'), path = require('path');
const { ROOT, H, where, block } = require('./lib/area');
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
    const keep = all.filter(f => {
      const w = f.geometry && where(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      if (w) Object.assign(f.properties || (f.properties = {}), { _ar: w.ar, _st: w.st });
      return !!w;
    });
    const last = all.reduce((m, f) => (f.properties && f.properties.full_date > m ? f.properties.full_date : m), '');
    return { type: 'FeatureCollection', meta: { generated: new Date().toISOString(), nation_total: all.length, nation_last: last || null }, features: keep };
  } catch (e) {
    if (k >= 3) throw e;
    await new Promise(r => setTimeout(r, 5000 * k));
  }
}

// --- ยอดสะสมปีงบ: ดาวเทียมตัวชี้วัด SNPP ก่อน 2 พ.ย. 2569 แล้ว NOAA-20 (IND_SW / indSat ในหน้าเว็บ) ---
const IND_SW = Date.UTC(2026, 10, 2) / 864e5, indSat = d => d < IND_SW ? 'SNPP' : 'NOAA20', SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const hKey = (d, t, la, lo) => d + '|' + t + '|' + Math.round(la * 1e3) + '|' + Math.round(lo * 1e3);
// areas: แยกตามพื้นที่อนุรักษ์ (จุดนอกพื้นที่อนุรักษ์ใช้คีย์ "นอกพื้นที่อนุรักษ์|สถานีฯ") → fy = สะสมปีงบนี้, prv = ปีงบก่อนช่วงเดียวกัน, pfull = ปีงบก่อนทั้งปี,
//   m/pm = รายเดือน ต.ค.–ก.ย. ของปีนี้/ปีก่อน · ปีงบก่อนใช้ hdata (จุดกรมอุทยานฯ) เหมือนแท็บ "เทียบปีงบก่อน" ในหน้าเว็บ
function summary(L) {
  const m = block('adata'); if (!m) return null;
  const j = JSON.parse(m[1]), to = j.to ? Date.UTC(+j.to.slice(0, 4), +j.to.slice(5, 7) - 1, +j.to.slice(8, 10)) / 864e5 : -1;
  const T = Math.floor((Date.now() + 7 * 36e5) / 864e5), x = new Date(T * 864e5), F = x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0), s = Date.UTC(F - 544, 9, 1) / 864e5, sp = Date.UTC(F - 545, 9, 1) / 864e5;
  const mi = d => (new Date(d * 864e5).getUTCMonth() + 3) % 12, key = (a, b) => a && a !== 'นอกพื้นที่อนุรักษ์' ? a : 'นอกพื้นที่อนุรักษ์|' + (b || 'ไม่มี');
  const seen = new Set(), ar = {}, st = {}, areas = {}, A = k => areas[k] || (areas[k] = { fy: 0, prv: 0, pfull: 0, m: Array(12).fill(0), pm: Array(12).fill(0) });
  const add = (d, a, b) => { ar[a] = (ar[a] || 0) + 1; st[b] = (st[b] || 0) + 1; const o = A(key(a, b)); o.fy++; o.m[mi(d)]++ };
  for (const r of j.r) { const d = r[0]; if (d >= s && d <= T && satKey(j.sat[r[4]]) === indSat(d)) { seen.add(hKey(d, r[1], r[2] / 1e5, r[3] / 1e5)); add(d, j.ar[r[9]], j.st[r[10]]) } }
  for (const f of (L ? L.features : [])) {
    const p = f.properties, fd = String(p.full_date || ''), d = Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 864e5, t = +fd.slice(11, 13) * 100 + +fd.slice(14, 16), [lo, la] = f.geometry.coordinates, k = hKey(d, t, la, lo);
    if (d > to && d >= s && d <= T && satKey(p.satellite_name) === indSat(d) && !seen.has(k)) { seen.add(k); add(d, p._ar, p._st) }
  }
  const h = JSON.parse(block('hdata')[1]);
  for (const r of h.r) { const d = r[0]; if (d >= sp && d < s) { const o = A(key(h.ar[r[7]], h.st[r[10]])); o.pfull++; o.pm[mi(d)]++; if (d - sp <= T - s) o.prv++ } }
  return { generated: new Date().toISOString(), fy: F, ind: SATN[indSat(T)], adata_to: j.to, day: T - s, total: seen.size, ar, st, areas };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(H, path.join(OUT, 'index.html'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  let ok = true, L = null;
  try {
    L = await live();
    fs.writeFileSync(path.join(OUT, 'live.json'), JSON.stringify(L));
    console.log(`live.json: ในแนวเขต ${L.features.length} จาก ${L.meta.nation_total} จุดทั้งประเทศ · สแกนล่าสุด ${L.meta.nation_last}`);
  } catch (e) { ok = false; console.log('live.json ไม่สำเร็จ:', e.message) }
  try {
    const S = summary(L);
    if (S) { fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(S)); console.log(`summary.json: ปีงบ ${S.fy} ${S.ind} ${S.total} จุด`) }
  } catch (e) { console.log('summary.json ไม่สำเร็จ:', e.message) }
  try {
    const b = await air4thai();
    JSON.parse(b); // ตรวจว่าเป็น JSON จริง
    fs.writeFileSync(path.join(OUT, 'air4thai.json'), b);
    console.log('air4thai.json:', (b.length / 1024).toFixed(0), 'KB');
  } catch (e) { console.log('air4thai.json ไม่สำเร็จ:', e.message) }
  if (!ok) process.exitCode = 1;
})();
