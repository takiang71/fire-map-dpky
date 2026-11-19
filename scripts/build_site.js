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

// --- ลดภาระ API ต้นทาง (ผู้ใช้สั่ง 13 พ.ย. 69): ปกติดึงแค่ 12 ชม. ล่าสุด (INC_H) แล้วรวมกับผลรอบก่อน · ดึงเต็ม 48 ชม. ทุก FULL_MIN นาที ---
// 12 ชม. = ช่วงเดียวกับที่ LINE/Telegram แจ้งเตือน (สแกน ≤12 ชม.) → จุดที่มีสิทธิ์แจ้งเตือนอยู่ในคำขอทุกรอบเสมอ ความเร็วแจ้งเตือนเท่าเดิม
// ช่วง 12–48 ชม. มาจากรอบก่อน (อัปเดตทุกครั้งที่ดึงเต็ม) · ฐานข้อมูลสะสม (adata) มาจาก sync_hotspots.js แยกกัน ไม่เกี่ยว
// แคช = STATE_DIR/live_cache.json (site.yml ดึงจาก/เก็บกลับ branch state) {updated, full, feats (ในแนวเขต), W (พื้นที่เฝ้าระวัง), nat: {"ดาวเทียม|full_date": จำนวนทั้งประเทศ}}
// ดึงเต็มทันทีเมื่อ: ไม่มีแคช/แคชเสีย, ดึงเต็มครั้งล่าสุดเกิน FULL_MIN, คำตอบ 12 ชม. ว่างทั้งประเทศ หรือขาดดาวเทียมใดใน SATS() (= พฤติกรรมเดิม → ตัดสินเรื่อง FIRMS เหมือนเดิม)
const STATE_DIR = process.env.STATE_DIR || path.join(ROOT, '.state'), CACHE = path.join(STATE_DIR, 'live_cache.json');
const INC_H = +process.env.LIVE_INC_H || 12, FULL_MIN = +process.env.LIVE_FULL_MIN || 30, EDGE_MIN = 20; // EDGE_MIN = ขอเกินขอบไว้ ให้ตัวตัดจุดซ้ำเห็นรอบดาวเทียมที่ขอบช่วงครบทั้งรอบ
const fdOf = ms => th(ms).replace('T', ' ');
async function apiGet(h) {
  const n = Date.now(), url = `${API}?start_date=${encodeURIComponent(th(n - h * 36e5))}&end_date=${encodeURIComponent(th(n))}&reserved_only=0&protected_only=0`;
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)' }, signal: AbortSignal.timeout(120e3) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), raw = j.features || [], D = featDups(raw); // ตัดคู่แฝดของรอบดาวเทียมที่ API ส่งซ้ำ (scripts/lib/dedup.js)
    return { all: raw.filter((f, i) => !D.has(i)), dup: D.size };
  } catch (e) {
    if (k >= 3) throw e;
    await new Promise(r => setTimeout(r, 5000 * k));
  }
}
// แยกคำตอบ API → จุดในแนวเขต / จุดพื้นที่เฝ้าระวัง / จำนวนทั้งประเทศต่อ "ดาวเทียม|เวลาสแกน"
function split(all, from) {
  const feats = [], W = [], nat = {};
  for (const f of all) {
    const p = f.properties || (f.properties = {}), fd = String(p.full_date || '');
    if (from && fd && fd < from) continue; // ส่วนที่ขอเกินขอบ (EDGE_MIN) ใช้แค่ตัดจุดซ้ำ
    const k = satKey(p.satellite_name) + '|' + fd; nat[k] = (nat[k] || 0) + 1;
    const c = f.geometry && f.geometry.coordinates; if (!c) continue;
    const w = where(c[0], c[1]);
    if (w) { Object.assign(p, { _ar: w.ar, _st: w.st }); feats.push(f) }
    // พื้นที่เฝ้าระวังเป็นพิเศษ (นอกแนวเขตกลุ่มป่า) → watch.json แยกไฟล์ ไม่ปนใน live.json (หน้าเว็บ/LINE/Worker เดิมนับยอดกลุ่มป่าจาก live.json)
    const wa = watchAt(c[0], c[1]);
    if (wa) W.push({ ...f, properties: { ...p, _w: wa } });
  }
  return { feats, W, nat };
}
function readCache() {
  try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); return c && c.full && Array.isArray(c.feats) && Array.isArray(c.W) && c.nat ? c : null } catch (e) { return null }
}
async function apiLive() {
  const now = Date.now(), C = readCache(), from48 = fdOf(now - 48 * 36e5);
  let mode = 'full', why = !C ? 'ไม่มีผลรอบก่อน' : now - Date.parse(C.full) >= FULL_MIN * 6e4 ? `ดึงเต็มครั้งล่าสุดเกิน ${FULL_MIN} นาที` : process.env.LIVE_FULL ? 'สั่ง LIVE_FULL' : '';
  let S, dup;
  if (!why) {
    const cut = fdOf(now - INC_H * 36e5), r = await apiGet(INC_H + EDGE_MIN / 60), I = split(r.all, cut), got = new Set(Object.keys(I.nat).map(k => k.split('|')[0]));
    const miss = SATS().filter(s => !got.has(s));
    if (!r.all.length) why = `คำตอบ ${INC_H} ชม. ว่างทั้งประเทศ`;
    else if (miss.length) why = `คำตอบ ${INC_H} ชม. ไม่มี ${miss.map(s => SATN[s]).join('/')}`;
    else {
      const old = f => { const d = String(f.properties && f.properties.full_date || ''); return d && d >= from48 && d < cut };
      const nat = {}; for (const k in C.nat) { const d = k.slice(k.indexOf('|') + 1); if (d >= from48 && d < cut) nat[k] = C.nat[k] } Object.assign(nat, I.nat);
      S = { feats: C.feats.filter(old).concat(I.feats), W: C.W.filter(old).concat(I.W), nat }; dup = r.dup; mode = 'inc';
    }
  }
  if (!S) { const r = await apiGet(48); S = split(r.all); dup = r.dup }
  const sats = {}; let total = 0, last = '';
  for (const k in S.nat) { const [s, d] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)]; sats[s] = (sats[s] || 0) + S.nat[k]; total += S.nat[k]; if (d > last) last = d }
  // ดึงเต็มแล้วว่าง/ขาดดาวเทียม (API ขัดข้อง หรือหน้าฝนดวงหนึ่งไม่มีจุด) = ไม่ใช้เป็นฐาน → รอบถัดไปดึงเต็มอีก (พฤติกรรมเดิม)
  // ไม่งั้นพอ API กลับมา จะได้แค่ 12 ชม. ล่าสุด จุด 12–48 ชม. หายไปจนกว่าจะครบ FULL_MIN (ตรวจกับ API จำลองแล้ว)
  const full = mode === 'inc' ? C.full : new Date(total && SATS().every(s => sats[s]) ? now : 0).toISOString();
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify({ updated: new Date().toISOString(), full, feats: S.feats, W: S.W, nat: S.nat })) }
  catch (e) { console.log('บันทึก live_cache.json ไม่สำเร็จ:', e.message) }
  console.log(mode === 'inc' ? `API: ดึง ${INC_H} ชม. ล่าสุด แล้วรวมกับผลรอบก่อน (ดึงเต็มล่าสุด ${C.full})` : `API: ดึงเต็ม 48 ชม. (${why || 'ไม่มีผลรอบก่อน'})`);
  WLIVE = S.W;
  return { type: 'FeatureCollection', meta: { generated: new Date().toISOString(), nation_total: total, nation_last: last || null, sys_update: await sysUpdate(), sats, fetch: mode === 'inc' ? { h: INC_H, full: C.full } : { h: 48, why }, ...(dup ? { dup } : {}) }, features: S.feats.sort((a, b) => String(b.properties.full_date).localeCompare(String(a.properties.full_date))) };
}

// --- ยอดสะสมปีงบ: ดาวเทียมตัวชี้วัด SNPP ก่อน 2 พ.ย. 2569 แล้ว NOAA-20 (IND_SW / indSat ในหน้าเว็บ) ---
const IND_SW = Date.UTC(2026, 10, 2) / 864e5, indSat = d => d < IND_SW ? 'SNPP' : 'NOAA20', SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const hKey = (d, t, la, lo) => d + '|' + t + '|' + Math.round(la * 1e3) + '|' + Math.round(lo * 1e3);
// areas: แยกตามพื้นที่อนุรักษ์ (จุดนอกพื้นที่อนุรักษ์ใช้คีย์ "นอกพื้นที่อนุรักษ์|สถานีฯ") → fy = สะสมปีงบนี้, prv = ปีงบก่อนช่วงเดียวกัน, pfull = ปีงบก่อนทั้งปี,
//   m/pm = รายเดือน ต.ค.–ก.ย. ของปีนี้/ปีก่อน · w/pw = รายสัปดาห์ (ช่องที่ i = วันที่ 7i–7i+6 นับจาก 1 ต.ค., 53 ช่อง) ปีนี้/ปีก่อนทั้งปี · sn/psn = นับตามสถานีฯ ปีนี้/ปีก่อนช่วงเดียวกัน (F4 แดชบอร์ด ?dash, 17 พ.ย. 69) · pv/am/tm = นับสะสมปีงบนี้ตามจังหวัด / "อำเภอ|จังหวัด" / "ตำบล|อำเภอ|จังหวัด" (การ์ดสูงสุดใน LINE) · ปีงบก่อนใช้ hdata (จุดกรมอุทยานฯ) ไม่รวมจุดที่จัดการเชื้อเพลิง/ตรวจสอบแล้วไม่พบไฟ เหมือนแท็บ "เทียบปีงบก่อน" ในหน้าเว็บ (fuOK)
function summary(L) {
  const m = block('adata'); if (!m) return null;
  const j = JSON.parse(m[1]), to = j.to ? Date.UTC(+j.to.slice(0, 4), +j.to.slice(5, 7) - 1, +j.to.slice(8, 10)) / 864e5 : -1;
  const T = Math.floor((Date.now() + 7 * 36e5) / 864e5), x = new Date(T * 864e5), F = x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0), s = Date.UTC(F - 544, 9, 1) / 864e5, sp = Date.UTC(F - 545, 9, 1) / 864e5;
  const mi = d => (new Date(d * 864e5).getUTCMonth() + 3) % 12, key = (a, b) => a && a !== 'นอกพื้นที่อนุรักษ์' ? a : 'นอกพื้นที่อนุรักษ์|' + (b || 'ไม่มี');
  const seen = new Set(), ar = {}, st = {}, areas = {}, A = k => areas[k] || (areas[k] = { fy: 0, prv: 0, pfull: 0, m: Array(12).fill(0), pm: Array(12).fill(0), w: Array(53).fill(0), pw: Array(53).fill(0), sn: {}, psn: {}, pv: {}, am: {}, tm: {} }), inc = (o, k) => { o[k] = (o[k] || 0) + 1 };
  const add = (d, a, b, pv, am, tb) => { ar[a] = (ar[a] || 0) + 1; st[b] = (st[b] || 0) + 1; const o = A(key(a, b)); o.fy++; o.m[mi(d)]++; o.w[Math.min(52, Math.floor((d - s) / 7))]++; inc(o.sn, b || 'ไม่มี'); pv = pv || 'ไม่ระบุ'; inc(o.pv, pv); if (am) inc(o.am, am + '|' + pv); if (tb && am) inc(o.tm, tb + '|' + am + '|' + pv) };
  for (const r of j.r) { const d = r[0]; if (d >= s && d <= T && satKey(j.sat[r[4]]) === indSat(d)) { seen.add(hKey(d, r[1], r[2] / 1e5, r[3] / 1e5)); add(d, j.ar[r[9]], j.st[r[10]], j.pv[r[6]], j.am[r[7]], String(j.tm[r[8]]).split('|')[0]) } }
  for (const f of (L ? L.features : [])) {
    const p = f.properties, fd = String(p.full_date || ''), d = Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 864e5, t = +fd.slice(11, 13) * 100 + +fd.slice(14, 16), [lo, la] = f.geometry.coordinates, k = hKey(d, t, la, lo);
    if (d > to && d >= s && d <= T && satKey(p.satellite_name) === indSat(d) && !seen.has(k)) { seen.add(k); add(d, p._ar, p._st, p.province_name_th, p.district_name_th, p.subdistrict_name_th) }
  }
  const h = JSON.parse(block('hdata')[1]);
  for (const r of h.r) { const d = r[0]; if (d >= sp && d < s && h.fu[r[9]] === 'ไม่มี') { const o = A(key(h.ar[r[7]], h.st[r[10]])); o.pfull++; o.pm[mi(d)]++; o.pw[Math.min(52, Math.floor((d - sp) / 7))]++; if (d - sp <= T - s) { o.prv++; inc(o.psn, h.st[r[10]] || 'ไม่มี') } } }
  return { generated: new Date().toISOString(), fy: F, ind: SATN[indSat(T)], adata_to: j.to, day: T - s, total: seen.size, ar, st, areas };
}

// --- พื้นที่เฝ้าระวังเป็นพิเศษ (ผู้ใช้ขอ 6 พ.ย. 69: โรงเรียนนายร้อยพระจุลจอมเกล้า) → watch.json ---
// จุดสะสมนับ "ทุกดาวเทียม" ตามแบบไฟล์ข้อมูลย้อนหลังที่ผู้ใช้ส่ง (มีทั้ง S/N20/N21 ในปีเดียวกัน) — ไม่ใช่ดาวเทียมตัวชี้วัดแบบยอดกลุ่มป่า
// ปีงบที่ไฟล์ย้อนหลัง (wdata, import_watch.js) ครอบคลุม ใช้ไฟล์นั้น · ปีงบหลังจากนั้นใช้ API (wadata จาก sync_hotspots.js) + จุด 48 ชม. ที่ยังไม่อยู่ใน wadata
// --- F1 (16 พ.ย. 69) รายงานผลตรวจสอบจากหน้างาน: ดึงจาก Worker fire-layers (worker/layers.mjs GET /reports?fy=) ปีงบนี้ + ปีงบก่อน → _site/reports.json ---
// ให้คนไม่ล็อกอินเห็นสถานะจุด/แถวในแท็บการดับไฟ และ line_notify/telegram_notify แจ้ง "ตรวจสอบแล้ว" · Worker ล่ม = ใช้สำเนารอบก่อนใน STATE_DIR/reports.json (site.yml เก็บที่ branch state)
// พื้นที่อนุรักษ์/สถานีฯ ตรวจซ้ำด้วย where() จากพิกัดจุด (หน้าเว็บส่งมาแล้ว แต่ยึดแนวเขต KMZ ฝั่งนี้เป็นหลัก)
const LAYERS_API = process.env.LAYERS_API || 'https://fire-layers.takiang71.workers.dev';
const fyOfMs = ms => { const d = new Date(ms + 7 * 36e5); return d.getUTCFullYear() + 543 + (d.getUTCMonth() >= 9 ? 1 : 0) };
async function reports() {
  const fy = fyOfMs(Date.now()), fys = [fy - 1, fy], REP = path.join(STATE_DIR, 'reports.json');
  let prev = null; try { prev = JSON.parse(fs.readFileSync(REP, 'utf8')) } catch (e) { }
  let all = [], src = 'worker';
  try {
    for (const y of fys) {
      const r = await fetch(`${LAYERS_API.replace(/\/$/, '')}/reports?fy=${y}`, { signal: AbortSignal.timeout(20e3) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); if (!Array.isArray(j.reports)) throw new Error('รูปแบบไม่ถูกต้อง');
      all = all.concat(j.reports);
    }
  } catch (e) {
    if (!prev) throw e;
    console.log('Worker reports ดึงไม่ได้:', e.message, '→ ใช้สำเนารอบก่อน'); all = prev.reports || []; src = 'state';
  }
  for (const r of all) { const p = r.hs ? [r.hs.lo, r.hs.la] : r.pos ? [r.pos[0], r.pos[1]] : null; if (!p) continue; const w = where(p[0], p[1]); r.ar = w ? w.ar : 'นอกพื้นที่อนุรักษ์'; r.st = w ? w.st : 'ไม่มี' }
  all.sort((a, b) => a.c - b.c);
  const R = { generated: new Date().toISOString(), src, fys, reports: all };
  if (src === 'worker') try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(REP, JSON.stringify(R)) } catch (e) { }
  return R;
}

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

// --- B1 เฟส 1 (16 พ.ย. 69): แยกข้อมูลฝังออกจาก _site/index.html (index.html ใน repo ไม่เปลี่ยน — ดับเบิลคลิกเปิดได้เหมือนเดิม) ---
// บล็อก <script type="application/json" id="geo|hdata|adata|wdata|wadata|fxdata"> (~1 MB) → _site/data/emb/<id>.<sha8>.json (ชื่อเปลี่ยนเมื่อข้อมูลเปลี่ยน
// → เบราว์เซอร์ใช้แคชได้ทุกครั้งที่ข้อมูลเดิม) · ที่ตำแหน่งบล็อกแรกใส่ดัชนี <script id="emb">{id:url}</script> + ตัวโหลด
// สคริปต์แอปที่อยู่หลังจุดนั้น (<script> ไม่มี attribute) เปลี่ยนเป็น type="text/x-emb-app" (ยังไม่รัน) → ตัวโหลดเรียก embGet ครบทุกชุด
// แล้วสร้าง <script> ใหม่ตามลำดับเดิม = โค้ดเดิมที่อ่าน textContent ตอนโหลดทำงานได้โดยไม่ต้องแก้ · HTML โครง (แผง/การ์ด) วาดก่อนข้อมูลมา
const EMB_IDS = ['geo', 'hdata', 'adata', 'wdata', 'wadata', 'fxdata'];
const EMB_LOADER = `/* B1 เฟส 1: รอข้อมูลฝังครบ (embGet — ไฟล์ data/emb/*.json) แล้วรันสคริปต์แอปตามลำดับเดิม · สร้างโดย scripts/build_site.js */
(()=>{const ix=JSON.parse(document.getElementById('emb').textContent),t0=performance.now();
 /* รอ HTML ทั้งหน้า parse เสร็จด้วย — เน็ตช้า ข้อมูลอาจมาครบก่อน แล้วสคริปต์แอปท้ายไฟล์ยังอ่านไม่ครบ (พบตอนวัด Fast 3G 16 พ.ย. 69: SyntaxError) */
 const dom=()=>document.readyState==='loading'?new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true})):0;
 Promise.all([...Object.keys(ix).map(embGet),dom()]).then(()=>{window.__EMB_MS=Math.round(performance.now()-t0);
  for(const s of [...document.querySelectorAll('script[type="text/x-emb-app"]')]){const n=document.createElement('script');n.textContent=s.textContent;s.replaceWith(n)}},
  e=>{try{dbg('embGet',e)}catch(_){}fail('โหลดข้อมูลไม่สำเร็จ ('+(e&&e.message||e)+') — ลองรีโหลดหน้า')})})();`;
function splitEmb(html, outDir) {
  const crypto = require('crypto'), dir = path.join(outDir, 'data', 'emb'), ix = {};
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  // ไล่แท็ก <script> ระดับบนสุด (เนื้อหาสคริปต์จบที่ </script> แรก — ตามกติกา HTML) เพื่อไม่แตะสตริง "<script>" ในโค้ด
  const tags = []; let i = 0;
  for (; ;) {
    const a = html.indexOf('<script', i); if (a < 0) break;
    const gt = html.indexOf('>', a), e = html.indexOf('</script>', gt);
    tags.push({ a, gt, e, attr: html.slice(a + 7, gt) }); i = e + 9;
  }
  let first = -1, out = '', last = 0;
  for (const t of tags) {
    const m = /^\s+type="application\/json"\s+id="(\w+)"\s*$/.exec(t.attr);
    if (m && EMB_IDS.includes(m[1])) {
      const body = html.slice(t.gt + 1, t.e), h = crypto.createHash('sha1').update(body).digest('hex').slice(0, 8), f = `${m[1]}.${h}.json`;
      fs.writeFileSync(path.join(dir, f), body); ix[m[1]] = 'data/emb/' + f;
      out += html.slice(last, t.a); if (first < 0) { first = out.length; out += '\u0000EMB\u0000' } last = t.e + 9;
      // ตัดขึ้นบรรทัดหลังบล็อก
      if (html[last] === '\n') last++;
      continue;
    }
    if (first >= 0 && t.attr === '') { out += html.slice(last, t.a) + '<script type="text/x-emb-app">'; last = t.gt + 1; continue }
  }
  out += html.slice(last);
  if (first < 0) return { html, ix };
  const head = `<script type="application/json" id="emb">${JSON.stringify(ix)}</script>\n<script>${EMB_LOADER}</script>\n`;
  return { html: out.split('\u0000EMB\u0000').join(head), ix };
}

// --- D1 (16 พ.ย. 69): PWA — sw.js ฉบับเผยแพร่ = รุ่น (sha ของ build: index.html + manifest + แม่แบบ sw.js + รายการไฟล์) + รายการ app shell ที่ precache
// deploy ที่ index.html/ข้อมูลฝังเปลี่ยน = sw.js เปลี่ยน → เบราว์เซอร์ติดตั้งรุ่นใหม่ ลบแคช shell เก่า · sw.js ใน repo = รุ่น 'dev' (ไม่ precache, เครือข่ายก่อน)
function pwaFiles(html, ix) {
  const crypto = require('crypto'), tpl = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), man = fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8');
  const lib = [...html.matchAll(/(?:src|href)="(https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/maplibre-gl\/[^"]+)"/g)].map(m => m[1]);
  const fonts = fs.existsSync(path.join(ROOT, 'fonts')) ? fs.readdirSync(path.join(ROOT, 'fonts')).filter(f => f.endsWith('.woff2')).sort().map(f => 'fonts/' + f) : [];
  const shell = ['index.html', 'manifest.webmanifest', 'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png', ...fonts, ...Object.values(ix), ...lib];
  const ver = crypto.createHash('sha1').update(html).update(man).update(tpl).update(shell.join('|')).digest('hex').slice(0, 12);
  const a = "'dev'/*__SW_VERSION__*/", b = '/*__SW_SHELL__*/', c = "''/*__SW_CSP__*/";
  if (!tpl.includes(a) || !tpl.includes(b) || !tpl.includes(c)) throw new Error('sw.js ไม่มีตำแหน่งแทนรุ่น/รายการ shell/CSP');
  // E2: CSP แบบรายงานอย่างเดียว (scripts/lib/csp.js) ที่ service worker ใส่ให้หน้าแรก
  const csp = require('./lib/csp').policy(html);
  return { ver, shell, csp, sw: tpl.split(a).join(`'${ver}'`).split(b).join(shell.map(s => JSON.stringify(s)).join(',')).split(c).join(JSON.stringify(csp)) };
}

module.exports = { summary, watchSum, splitEmb, EMB_IDS, pwaFiles };
if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  { const src = fs.readFileSync(H, 'utf8'), r = splitEmb(src, OUT);
    fs.writeFileSync(path.join(OUT, 'index.html'), r.html);
    console.log(`index.html: ${(Buffer.byteLength(src) / 1048576).toFixed(2)} → ${(Buffer.byteLength(r.html) / 1048576).toFixed(2)} MB · ข้อมูลฝังแยก ${Object.keys(r.ix).length} ไฟล์ (data/emb/)`);
    const P = pwaFiles(r.html, r.ix); fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(OUT, 'manifest.webmanifest')); fs.writeFileSync(path.join(OUT, 'sw.js'), P.sw);
    console.log(`sw.js: รุ่น ${P.ver} · app shell ${P.shell.length} ไฟล์`) }
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  // ไอคอน/ภาพแชร์ลิงก์ (D2), ฟอนต์ Noto Sans Thai (B3) และรายงานประจำเดือน (F3 — scripts/monthly_report.js สร้างใน sync.yml วันที่ 1 แล้ว commit ลง reports/; reports/*.html อ้างฟอนต์ ../fonts)
  for (const d of ['img', 'fonts', 'reports']) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true });
  // คู่มือการใช้งาน (manual/index.html + ภาพประกอบ) — ปุ่ม #bMan ในหน้าเว็บเปิดหน้านี้
  if (fs.existsSync(path.join(ROOT, 'manual'))) fs.cpSync(path.join(ROOT, 'manual'), path.join(OUT, 'manual'), { recursive: true });
  // พื้นที่เผาไหม้ (scripts/sync_burn.js), แหล่งเชื้อเพลิง (scripts/sync_fuel.js), ภาพแหล่งท่องเที่ยว (data/tour) และดัชนีอันตรายไฟป่า TFDRS (scripts/sync_fwi.js) — หน้าเว็บอ่านจาก data/ ทางเดียวกับตอนเปิดผ่าน serve.js
  // ไทล์ความสูง GEM-15 (scripts/build_dem15.js รันมือ ~36 MB) — หน้าเว็บเลือกผ่าน demURL/dem15://
  for (const d of ['burn', 'fuel', 'tour', 'fwi', 'dem15']) if (fs.existsSync(path.join(ROOT, 'data', d))) fs.cpSync(path.join(ROOT, 'data', d), path.join(OUT, 'data', d), { recursive: true });
  // แนวเขตอำเภอ/ตำบล (scripts/build_admin.js) — หน้าเว็บโหลดเมื่อใช้
  if (fs.existsSync(path.join(ROOT, 'data', 'admin.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'admin.json'), path.join(OUT, 'data', 'admin.json'));
  // นักท่องเที่ยวและเงินรายได้อุทยานแห่งชาติ (scripts/sync_tourism.js) — การ์ดในหน้าความสำคัญ
  if (fs.existsSync(path.join(ROOT, 'data', 'tourism.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'tourism.json'), path.join(OUT, 'data', 'tourism.json'));
  // หน่วยพิทักษ์ จุดสกัด ฐานเฉพาะกิจ + ฐานป้องกันรักษาป่า (scripts/import_rangers.js)
  // วงโคจร NOAA-20/21 (scripts/sync_tle.js) — กล่องนับถอยหลังดาวเทียมรอบถัดไป + ชั้นวงโคจร
  for (const f of ['ranger.json', 'fbase.json', 'tle.json', 'gfs_vr.json', 'cams_grid.json']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
  // C5 ความครบถ้วนของ API เทียบ NASA FIRMS รายเดือน (scripts/firms_audit.js --from YYYY-MM ใน sync.yml) → คัดลอกทุกเดือน + firms_audit.json = เดือนล่าสุด (#p-src ในหน้าเว็บ)
  { const L = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^firms_audit_\d{6}\.json$/.test(f)).sort();
    for (const f of L) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
    if (L.length) fs.copyFileSync(path.join(ROOT, 'data', L.at(-1)), path.join(OUT, 'data', 'firms_audit.json')) }
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
  // F8 ข้อมูลเปิด: จุดความร้อนรายปีงบ (ทุกดาวเทียม + ช่องตัวชี้วัด) _site/open/hotspots_fy<ปีงบ>.csv + open/index.json — scripts/lib/opendata.js, คำอธิบาย docs/api.md
  try {
    const X = require('./lib/opendata').write(OUT, { A: JSON.parse(block('adata')[1]), H: JSON.parse(block('hdata')[1]), live: L ? L.features : [], site: 'https://takiang71.github.io/fire-map-dpky/' });
    console.log(`open/: ${X.files.length} ไฟล์ CSV (ปีงบ ${X.files[0] && X.files[0].fy}–${X.fy_now}) · ปีงบ ${X.fy_now} ${(X.files.find(x => x.fy === X.fy_now) || {}).rows || 0} จุด`);
  } catch (e) { console.log('open/ ไม่สำเร็จ:', e.message) }
  // F4 แดชบอร์ด ?dash: FWI / อัตราระบายอากาศ / PM2.5 วันนี้ — ค่าชุดเดียวกับสรุปประจำวัน LINE/Telegram (lib/fwisum, vrsum, camssum) → _site/wx_today.json
  try {
    const sf = f => { try { return f() } catch (e) { return null } }, now = Date.now();
    const W = { generated: new Date(now).toISOString(), fwi: sf(() => require('./lib/fwisum').fwiSummary(now)), vr: sf(() => require('./lib/vrsum').vrSummary(now)), pm: sf(() => require('./lib/camssum').camsSummary(now)) };
    fs.writeFileSync(path.join(OUT, 'wx_today.json'), JSON.stringify(W));
    console.log('wx_today.json:', ['fwi', 'vr', 'pm'].map(k => k + (W[k] ? ' ' + W[k].days.length + ' วัน' : ' ไม่มี')).join(' · '));
  } catch (e) { console.log('wx_today.json ไม่สำเร็จ:', e.message) }
  try {
    const R = await reports();
    if (R) { fs.writeFileSync(path.join(OUT, 'reports.json'), JSON.stringify(R)); console.log(`reports.json: ${R.reports.length} รายงาน (ปีงบ ${R.fys.join('/')}) จาก${R.src === 'worker' ? 'เซิร์ฟเวอร์' : 'สำเนารอบก่อน'}`) }
  } catch (e) { console.log('reports.json ไม่สำเร็จ:', e.message) }
  // F2 ดัชนีเสี่ยงไฟป่าล่วงหน้า (ดัชนีของระบบนี้ ไม่ใช่ค่าทางการ) วันนี้/พรุ่งนี้ ต่อตำบล/แปลงสถานีฯ — scripts/lib/risksum.js (โมเดล M2) · FWI จากตาราง TFDRS ที่ขั้น load fwi grids วางไว้ใน data/fwi/g
  try {
    const K = require('./lib/risksum').riskDays({ live: L ? L.features : [] });
    fs.writeFileSync(path.join(OUT, 'risk.json'), JSON.stringify(K));
    console.log('risk.json:', K.days.map(d => `${d.d} (${d.src === 'grid' ? 'ตาราง FWI' : 'FWI เฉลี่ย'}) สูงขึ้นไป ${d.tm.filter(x => x[3] >= 4).length}/${d.tm.length} ตำบล`).join(' · ') || 'ไม่มีข้อมูล FWI');
  } catch (e) { console.log('risk.json ไม่สำเร็จ:', e.message) }
  try {
    const b = await air4thai();
    JSON.parse(b); // ตรวจว่าเป็น JSON จริง
    fs.writeFileSync(path.join(OUT, 'air4thai.json'), b);
    console.log('air4thai.json:', (b.length / 1024).toFixed(0), 'KB');
  } catch (e) { console.log('air4thai.json ไม่สำเร็จ:', e.message) }
  if (!ok) process.exitCode = 1;
})();
