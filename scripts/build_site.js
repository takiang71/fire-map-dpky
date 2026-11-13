// สร้างโฟลเดอร์ _site/ สำหรับเผยแพร่ (GitHub Pages) — รันโดย GitHub Actions ทุก ~10 นาที
// ใช้: node scripts/build_site.js
//  - index.html (คัดลอก)
//  - live.json      จุดความร้อน 48 ชม. ล่าสุด เฉพาะในแนวเขตกลุ่มป่า (API ส่งทั้งประเทศ ~2 MB ช่วงพีค → เหลือไม่กี่ KB)
//                   รูปแบบ GeoJSON เดียวกับ API + meta {generated, nation_total, nation_last, sys_update} ให้หน้าเว็บใช้ liveList เดิมได้
//                   + properties._ar (พื้นที่อนุรักษ์) / _st (สถานีฯ) จากแนวเขต KMZ ให้ LINE bot ใช้
//  - summary.json   ยอดสะสมปีงบตามดาวเทียมตัวชี้วัด (adata + live.json ตรรกะเดียวกับ fyNow ในหน้าเว็บ) แยกตามพื้นที่/สถานีฯ — ให้ LINE bot ตอบ "สรุป"
//  - notify.json    สถานะการแจ้งเตือน LINE (สร้างโดย scripts/line_notify.js ขั้นถัดไปใน workflow)
//  - air4thai.json  สถานีวัดฝุ่น Air4Thai (ต้นทางไม่เปิด CORS จึงดึงไว้ให้ที่นี่)
// ถ้าดึงส่วนไหนไม่สำเร็จ จะไม่สร้างไฟล์นั้น หน้าเว็บจะถอยไปดึงจาก API ตรงเอง
const fs = require('fs'), path = require('path');
const { ROOT, H, where, block, watchAt } = require('./lib/area');
const { air4thai } = require('./lib/air4thai');

const OUT = path.join(ROOT, '_site');
const API = process.env.HOTSPOT_API || 'https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/alerts'; // HOTSPOT_API = ทดสอบกับเซิร์ฟเวอร์จำลอง
// เวลา "Last update" ของระบบต้นทาง อยู่ในหน้าแรก (HTML) เป็นเวลาไทย เช่น "Last update : 30/10/2026 - 13h47" → meta.sys_update (ISO) ใน live.json
async function sysUpdate() {
  try { const h = await (await fetch(API.replace(/api\/alerts$/, ''), { signal: AbortSignal.timeout(30e3) })).text(), m = /Last update\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})h(\d{2})/i.exec(h);
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 7, +m[5])).toISOString() : null } catch (e) { return null }
}
const th = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 19); // เวลาไทยรูปแบบที่ API รับ
let WLIVE = null; // จุด 48 ชม. ในพื้นที่เฝ้าระวังเป็นพิเศษ (เติมใน live())

// --- สำรองด้วย NASA FIRMS (ผู้ใช้ขอ 11 พ.ย. 69): API ไทยดึงไม่ได้ / ตอบว่างทั้งประเทศ / ไม่มีดาวเทียมบางดวงใน 48 ชม. ---
// ใช้ไฟล์ CSV 7 วันสาธารณะ (ไม่ต้องใช้ key, ล่าช้ากว่าสแกน ~3 ชม.) เฉพาะดาวเทียมที่ขาด · ไม่เติมจุดที่ API มีอยู่แล้ว (FM.same) · unique_id = "firms|…" คงที่ทุกรอบ
// meta.firms = { sats, n (จุดที่เติมในแนวเขต), box (จุดของดวงนั้นในกรอบกลุ่มป่า 48 ชม. ทั้งในและนอกแนวเขต), why } → หน้าเว็บขึ้นป้าย / health.js แจ้งผู้ดูแล
const FM = require('./lib/firms');
const { featDups } = require('./lib/dedup');
const SNPP_END = Date.UTC(2026, 10, 2, 13); // SNPP หยุดส่งข้อมูลถาวร 2 พ.ย. 2569 20:00 น. ไทย
const SATS = () => Date.now() < SNPP_END ? ['SNPP', 'NOAA20', 'NOAA21'] : ['NOAA20', 'NOAA21'];
const pad2 = n => String(n).padStart(2, '0');
const fmMs = r => Date.UTC(1970, 0, 1 + r.d, Math.floor(r.t / 100) - 7, r.t % 100);
const fRec = f => { const p = f.properties, fd = String(p.full_date || ''), [lo, la] = f.geometry.coordinates;
  return { d: Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 864e5, t: +fd.slice(11, 13) * 100 + +fd.slice(14, 16), la: Math.round(la * 1e5), lo: Math.round(lo * 1e5), sat: satKey(p.satellite_name) } };
function fmFeat(r) {
  const nm = v => v && v !== 'ไม่ระบุ' ? v : null;
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [r.lo / 1e5, r.la / 1e5] }, properties: {
    confidence: r.cf, full_date: `${new Date(r.d * 864e5).toISOString().slice(0, 10)} ${pad2(Math.floor(r.t / 100))}:${pad2(r.t % 100)}:00`, satellite_name: r.sat,
    province_name_th: nm(r.pv), district_name_th: nm(r.am), subdistrict_name_th: nm(r.tm), protected_area_name_th: r.ar && r.ar !== 'นอกพื้นที่อนุรักษ์' ? r.ar : null,
    unique_id: r.uid, _ar: r.ar, _st: r.st, _src: 'firms' } };
}
async function live() {
  let L = null, err = null;
  try { L = await apiLive() } catch (e) { err = e.message; console.log('API ไทยดึงไม่สำเร็จ:', err) }
  const need = SATS().filter(s => !(L && L.meta.sats[s]));
  if (!need.length) return L;
  const why = err ? 'API ดึงไม่สำเร็จ: ' + err : !L.meta.nation_total ? 'API ตอบว่างทั้งประเทศ' : `API ไม่มีดาวเทียม ${need.map(s => SATN[s]).join('/')} ใน 48 ชม.`;
  const since = Date.now() - 48 * 36e5, stat = { since, n: {} };
  let R;
  try { R = await FM.recent(need, stat) } catch (e) {
    console.log('NASA FIRMS ไม่สำเร็จ:', e.message);
    if (!L) throw new Error(err);
    L.meta.firms = { sats: need, n: 0, why, err: e.message }; return L;
  }
  if (!L) { L = { type: 'FeatureCollection', meta: { generated: new Date().toISOString(), nation_total: 0, nation_last: null, sys_update: await sysUpdate(), sats: {} }, features: [] }; WLIVE = [] }
  const ex = L.features.concat(WLIVE).map(fRec);
  let n = 0;
  for (const r of R) {
    const t = fmMs(r); if (t < since || t > Date.now() + 6e5 || ex.some(e => FM.same(e, r))) continue;
    ex.push(r); const f = fmFeat(r);
    if (r.ar) { L.features.push(f); n++ }
    if (r.wa) WLIVE.push({ ...f, properties: { ...f.properties, _w: r.wa } });
  }
  L.meta.firms = { sats: need, n, box: stat.n, why };
  console.log(`${why} → เติมจาก NASA FIRMS ${n} จุดในแนวเขต (${need.join('/')} ในกรอบกลุ่มป่า 48 ชม.: ${need.map(s => s + ' ' + (stat.n[s] || 0)).join(', ')})`);
  return L;
}

async function apiLive() {
  const n = Date.now(), url = `${API}?start_date=${encodeURIComponent(th(n - 48 * 36e5))}&end_date=${encodeURIComponent(th(n))}&reserved_only=0&protected_only=0`;
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(120e3) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), raw = j.features || [], D = featDups(raw), all = raw.filter((f, i) => !D.has(i)); // ตัดคู่แฝดของรอบดาวเทียมที่ API ส่งซ้ำ (scripts/lib/dedup.js)
    const keep = [];
    WLIVE = [];
    for (const f of all) {
      const w = f.geometry && where(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      if (w) { Object.assign(f.properties || (f.properties = {}), { _ar: w.ar, _st: w.st }); keep.push(f) }
      // พื้นที่เฝ้าระวังเป็นพิเศษ (นอกแนวเขตกลุ่มป่า) → watch.json แยกไฟล์ ไม่ปนใน live.json (หน้าเว็บ/LINE/Worker เดิมนับยอดกลุ่มป่าจาก live.json)
      const wa = f.geometry && watchAt(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      if (wa) WLIVE.push({ ...f, properties: { ...f.properties, _w: wa } });
    }
    const last = all.reduce((m, f) => (f.properties && f.properties.full_date > m ? f.properties.full_date : m), ''), sats = {};
    for (const f of all) { const k = satKey(f.properties && f.properties.satellite_name); sats[k] = (sats[k] || 0) + 1 } // จุดทั้งประเทศต่อดาวเทียม (หาดวงที่ขาด)
    return { type: 'FeatureCollection', meta: { generated: new Date().toISOString(), nation_total: all.length, nation_last: last || null, sys_update: await sysUpdate(), sats, ...(D.size ? { dup: D.size } : {}) }, features: keep };
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
//   m/pm = รายเดือน ต.ค.–ก.ย. ของปีนี้/ปีก่อน · pv/am/tm = นับสะสมปีงบนี้ตามจังหวัด / "อำเภอ|จังหวัด" / "ตำบล|อำเภอ|จังหวัด" (การ์ดสูงสุดใน LINE) · ปีงบก่อนใช้ hdata (จุดกรมอุทยานฯ) ไม่รวมจุดที่จัดการเชื้อเพลิง/ตรวจสอบแล้วไม่พบไฟ เหมือนแท็บ "เทียบปีงบก่อน" ในหน้าเว็บ (fuOK)
function summary(L) {
  const m = block('adata'); if (!m) return null;
  const j = JSON.parse(m[1]), to = j.to ? Date.UTC(+j.to.slice(0, 4), +j.to.slice(5, 7) - 1, +j.to.slice(8, 10)) / 864e5 : -1;
  const T = Math.floor((Date.now() + 7 * 36e5) / 864e5), x = new Date(T * 864e5), F = x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0), s = Date.UTC(F - 544, 9, 1) / 864e5, sp = Date.UTC(F - 545, 9, 1) / 864e5;
  const mi = d => (new Date(d * 864e5).getUTCMonth() + 3) % 12, key = (a, b) => a && a !== 'นอกพื้นที่อนุรักษ์' ? a : 'นอกพื้นที่อนุรักษ์|' + (b || 'ไม่มี');
  const seen = new Set(), ar = {}, st = {}, areas = {}, A = k => areas[k] || (areas[k] = { fy: 0, prv: 0, pfull: 0, m: Array(12).fill(0), pm: Array(12).fill(0), pv: {}, am: {}, tm: {} }), inc = (o, k) => { o[k] = (o[k] || 0) + 1 };
  const add = (d, a, b, pv, am, tb) => { ar[a] = (ar[a] || 0) + 1; st[b] = (st[b] || 0) + 1; const o = A(key(a, b)); o.fy++; o.m[mi(d)]++; pv = pv || 'ไม่ระบุ'; inc(o.pv, pv); if (am) inc(o.am, am + '|' + pv); if (tb && am) inc(o.tm, tb + '|' + am + '|' + pv) };
  for (const r of j.r) { const d = r[0]; if (d >= s && d <= T && satKey(j.sat[r[4]]) === indSat(d)) { seen.add(hKey(d, r[1], r[2] / 1e5, r[3] / 1e5)); add(d, j.ar[r[9]], j.st[r[10]], j.pv[r[6]], j.am[r[7]], String(j.tm[r[8]]).split('|')[0]) } }
  for (const f of (L ? L.features : [])) {
    const p = f.properties, fd = String(p.full_date || ''), d = Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 864e5, t = +fd.slice(11, 13) * 100 + +fd.slice(14, 16), [lo, la] = f.geometry.coordinates, k = hKey(d, t, la, lo);
    if (d > to && d >= s && d <= T && satKey(p.satellite_name) === indSat(d) && !seen.has(k)) { seen.add(k); add(d, p._ar, p._st, p.province_name_th, p.district_name_th, p.subdistrict_name_th) }
  }
  const h = JSON.parse(block('hdata')[1]);
  for (const r of h.r) { const d = r[0]; if (d >= sp && d < s && h.fu[r[9]] === 'ไม่มี') { const o = A(key(h.ar[r[7]], h.st[r[10]])); o.pfull++; o.pm[mi(d)]++; if (d - sp <= T - s) o.prv++ } }
  return { generated: new Date().toISOString(), fy: F, ind: SATN[indSat(T)], adata_to: j.to, day: T - s, total: seen.size, ar, st, areas };
}

// --- พื้นที่เฝ้าระวังเป็นพิเศษ (ผู้ใช้ขอ 6 พ.ย. 69: โรงเรียนนายร้อยพระจุลจอมเกล้า) → watch.json ---
// จุดสะสมนับ "ทุกดาวเทียม" ตามแบบไฟล์ข้อมูลย้อนหลังที่ผู้ใช้ส่ง (มีทั้ง S/N20/N21 ในปีเดียวกัน) — ไม่ใช่ดาวเทียมตัวชี้วัดแบบยอดกลุ่มป่า
// ปีงบที่ไฟล์ย้อนหลัง (wdata, import_watch.js) ครอบคลุม ใช้ไฟล์นั้น · ปีงบหลังจากนั้นใช้ API (wadata จาก sync_hotspots.js) + จุด 48 ชม. ที่ยังไม่อยู่ใน wadata
function watchSum(W) {
  const wd = block('wdata'); if (!wd) return null;
  const Hh = JSON.parse(wd[1].split('<\\/').join('</')), wa = block('wadata'), A = wa ? JSON.parse(wa[1]) : { r: [], ids: [], sat: [], tm: [], to: null };
  const T = Math.floor((Date.now() + 7 * 36e5) / 864e5), x = new Date(T * 864e5), F = x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0);
  const fyOf = d => { const y = new Date(d * 864e5); return y.getUTCFullYear() + 543 + (y.getUTCMonth() >= 9 ? 1 : 0) }, s = Date.UTC(F - 544, 9, 1) / 864e5, sp = Date.UTC(F - 545, 9, 1) / 864e5;
  const mi = d => (new Date(d * 864e5).getUTCMonth() + 3) % 12, hmax = Math.max(0, ...Hh.r.map(r => fyOf(r[0])));
  const to = A.to ? Date.UTC(+A.to.slice(0, 4), +A.to.slice(5, 7) - 1, +A.to.slice(8, 10)) / 864e5 : -1, now = Date.now();
  const HSN = { S: 'SNPP', N20: 'NOAA20', N21: 'NOAA21' };
  return { generated: new Date().toISOString(), fy: F, hist_to: hmax, api_to: A.to, areas: Hh.areas.map((a, ai) => {
    const o = { id: a.id, n: a.n, s: a.s, rai: a.rai, bb: a.bb, fy: 0, prv: 0, pfull: 0, m: Array(12).fill(0), pm: Array(12).fill(0), sat: {}, tm: {}, h24: 0, h48: 0, last: null };
    const seen = new Set(), cur = (d, t, la, lo, sat, tm) => { const k = hKey(d, t, la, lo); if (seen.has(k)) return; seen.add(k); o.fy++; o.m[mi(d)]++; const sk = satKey(sat); o.sat[sk] = (o.sat[sk] || 0) + 1; if (tm) o.tm[tm] = (o.tm[tm] || 0) + 1 };
    const prev = d => { o.pfull++; o.pm[mi(d)]++; if (d - sp <= T - s) o.prv++ };
    // ปีงบนี้ (ปกติอยู่หลังช่วงไฟล์ย้อนหลัง) — ถ้าไฟล์ย้อนหลังครอบปีงบนี้ ใช้ไฟล์
    if (F <= hmax) for (const r of Hh.r) { if (r[9] === ai && r[0] >= s && r[0] <= T) cur(r[0], r[1], r[2] / 1e5, r[3] / 1e5, HSN[Hh.sat[r[4]]] || Hh.sat[r[4]], Hh.tm[r[5]]) }
    else {
      for (const r of A.r) if (A.ids[r[7]] === a.id && r[0] >= s && r[0] <= T) cur(r[0], r[1], r[2] / 1e5, r[3] / 1e5, A.sat[r[4]], A.tm[r[6]]);
      for (const f of W || []) { const p = f.properties; if (p._w !== a.id) continue; const fd = String(p.full_date || ''), d = Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 864e5, [lo, la] = f.geometry.coordinates;
        if (d > to && d >= s) cur(d, +fd.slice(11, 13) * 100 + +fd.slice(14, 16), la, lo, p.satellite_name, [p.subdistrict_name_th, p.district_name_th, p.province_name_th].join('|')) }
    }
    if (F - 1 <= hmax) { for (const r of Hh.r) if (r[9] === ai && r[0] >= sp && r[0] < s) prev(r[0]) }
    else for (const r of A.r) if (A.ids[r[7]] === a.id && r[0] >= sp && r[0] < s) prev(r[0]);
    for (const f of W || []) { const p = f.properties; if (p._w !== a.id) continue; const t = Date.parse(String(p.full_date).replace(' ', 'T') + '+07:00'); if (now - t < 24 * 36e5) o.h24++; if (now - t < 48 * 36e5) o.h48++; if (!o.last || t > o.last.t) o.last = { t, sat: p.satellite_name, tm: [p.subdistrict_name_th, p.district_name_th, p.province_name_th].join('|') } }
    if (!o.last) { const L = A.r.filter(r => A.ids[r[7]] === a.id).sort((p, q) => q[0] - p[0] || q[1] - p[1])[0]; if (L) o.last = { t: Date.UTC(1970, 0, 1 + L[0], Math.floor(L[1] / 100) - 7, L[1] % 100), sat: A.sat[L[4]], tm: A.tm[L[6]] } }
    o.src = { cur: F <= hmax ? 'hist' : 'api', prev: F - 1 <= hmax ? 'hist' : 'api' };
    return o;
  }) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(H, path.join(OUT, 'index.html'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  // คู่มือการใช้งาน (manual/index.html + ภาพประกอบ) — ปุ่ม #bMan ในหน้าเว็บเปิดหน้านี้
  if (fs.existsSync(path.join(ROOT, 'manual'))) fs.cpSync(path.join(ROOT, 'manual'), path.join(OUT, 'manual'), { recursive: true });
  // พื้นที่เผาไหม้ (scripts/sync_burn.js), แหล่งเชื้อเพลิง (scripts/sync_fuel.js) และภาพแหล่งท่องเที่ยว (data/tour) — หน้าเว็บอ่านจาก data/ ทางเดียวกับตอนเปิดผ่าน serve.js
  for (const d of ['burn', 'fuel', 'tour']) if (fs.existsSync(path.join(ROOT, 'data', d))) fs.cpSync(path.join(ROOT, 'data', d), path.join(OUT, 'data', d), { recursive: true });
  // แนวเขตอำเภอ/ตำบล (scripts/build_admin.js) — หน้าเว็บโหลดเมื่อใช้
  if (fs.existsSync(path.join(ROOT, 'data', 'admin.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'admin.json'), path.join(OUT, 'data', 'admin.json'));
  // นักท่องเที่ยวและเงินรายได้อุทยานแห่งชาติ (scripts/sync_tourism.js) — การ์ดในหน้าความสำคัญ
  if (fs.existsSync(path.join(ROOT, 'data', 'tourism.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'tourism.json'), path.join(OUT, 'data', 'tourism.json'));
  // หน่วยพิทักษ์ จุดสกัด ฐานเฉพาะกิจ + ฐานป้องกันรักษาป่า (scripts/import_rangers.js)
  // วงโคจร NOAA-20/21 (scripts/sync_tle.js) — กล่องนับถอยหลังดาวเทียมรอบถัดไป + ชั้นวงโคจร
  for (const f of ['ranger.json', 'fbase.json', 'tle.json']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
  if (fs.existsSync(path.join(ROOT, 'data', 'prov.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'prov.json'), path.join(OUT, 'data', 'prov.json'));
  // ชนิดป่า (scripts/build_ftype.js)
  if (fs.existsSync(path.join(ROOT, 'data', 'ftype', 'ftype.json'))) { fs.mkdirSync(path.join(OUT, 'data', 'ftype'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'data', 'ftype', 'ftype.json'), path.join(OUT, 'data', 'ftype', 'ftype.json')) }
  // สรุปพื้นที่เผาไหม้รอบล่าสุดสำหรับการ์ด LINE (line_notify.js และคำสั่ง "เผาไหม้" ของ Worker)
  try { const B = require('./lib/burnsum').burnSummary(); if (B) { fs.writeFileSync(path.join(OUT, 'burn_summary.json'), JSON.stringify(B)); console.log(`burn_summary.json: รอบ ${B.p} ${B.rai} ไร่ · มีจุดความร้อนใกล้ ${B.hs} ไร่`) } }
  catch (e) { console.log('burn_summary.json ไม่สำเร็จ:', e.message) }
  let ok = true, L = null;
  try {
    L = await live();
    fs.writeFileSync(path.join(OUT, 'live.json'), JSON.stringify(L));
    console.log(`live.json: ในแนวเขต ${L.features.length} จาก ${L.meta.nation_total} จุดทั้งประเทศ · สแกนล่าสุด ${L.meta.nation_last}`);
  } catch (e) { ok = false; console.log('live.json ไม่สำเร็จ:', e.message) }
  try {
    const WS = watchSum(WLIVE);
    if (WS) { fs.writeFileSync(path.join(OUT, 'watch.json'), JSON.stringify({ type: 'FeatureCollection', meta: { generated: new Date().toISOString(), ok: !!WLIVE }, features: WLIVE || [], sum: WS }));
      console.log('watch.json:', WS.areas.map(a => `${a.s} 48 ชม. ${(WLIVE || []).filter(f => f.properties._w === a.id).length} จุด · ปีงบ ${WS.fy} ${a.fy} จุด (ปีก่อน ${a.pfull})`).join(' · ')) }
  } catch (e) { console.log('watch.json ไม่สำเร็จ:', e.message) }
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
