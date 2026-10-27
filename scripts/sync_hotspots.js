// เก็บสะสมจุดความร้อนจริงรายวันจาก Land Fire Alerts Thailand (WFSRU/ThaiREN) เฉพาะในแนวเขตกลุ่มป่า
// ใช้: node scripts/sync_hotspots.js [--from YYYY-MM-DD] [--refetch N]
//  - ครั้งแรกดึงตั้งแต่ 1 ต.ค. 2568 (ต้นปีงบ 2569) ทีละวัน · ครั้งต่อไปดึงเฉพาะวันที่ยังไม่มี + ดึงซ้ำ N วันล่าสุด (ค่าเริ่มต้น 2)
//  - API ส่งทั้งประเทศ (ช่วงพีค ~1 MB/วัน) สคริปต์กรองเหลือเฉพาะจุดในพื้นที่อนุรักษ์/พื้นที่รับผิดชอบ (GEO ใน index.html)
//  - ผลลัพธ์: data/hotspots_api.json + ฝังลง index.html (<script type="application/json" id="adata">)
//    + data/FY2569_SNPP_ทั้งกลุ่มป่า.csv (จุด Suomi NPP ปีงบ 2569 ทั้งหมด พร้อมคอลัมน์ว่าอยู่ในข้อมูลกรมอุทยานฯ หรือไม่)
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const H = path.join(ROOT, 'index.html'), OUT = path.join(ROOT, 'data', 'hotspots_api.json');
const API = 'https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/alerts';
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const FROM = arg('--from') || '2025-10-01', REFETCH = +(arg('--refetch') || 2), CONC = 3;

// บันทึกผลลง data/sync.log ด้วย (ตั้งรันอัตโนมัติผ่าน Task Scheduler จะไม่มีหน้าจอให้ดู) · ตัดให้เหลือ ~200 KB
const LOG = path.join(ROOT, 'data', 'sync.log');
try { if (fs.statSync(LOG).size > 200e3) fs.writeFileSync(LOG, fs.readFileSync(LOG, 'utf8').slice(-100e3)) } catch (e) {}
const stamp = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const log0 = console.log;
console.log = (...a) => { log0(...a); fs.appendFileSync(LOG, `[${stamp()}] ` + a.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') + '\n') };
process.on('uncaughtException', e => { console.log('ผิดพลาด:', e.stack || String(e)); process.exit(1) });
// กันรันซ้อน (เช่น รอบที่พลาดไปมารันพร้อมรอบปกติ) — ล็อกเก่ากว่า 1 ชม. ถือว่าค้าง
const LOCK = path.join(ROOT, 'data', '.sync.lock');
try { if (Date.now() - fs.statSync(LOCK).mtimeMs < 36e5) { console.log('มีการรันอยู่แล้ว ข้ามรอบนี้'); process.exit(0) } } catch (e) {}
fs.writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(LOCK) } catch (e) {} });
// เขียนแบบไฟล์ชั่วคราวแล้วเปลี่ยนชื่อ เพื่อไม่ให้ไฟล์ขาดครึ่งถ้าถูกเปิด/ปิดเครื่องระหว่างเขียน
const writeSafe = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f) };

const { html, block, GEO, where, SBP } = require('./lib/area');
const HDATA = JSON.parse(block('hdata')[1]);

// --- วันที่ (วันตามเวลาไทย นับจาก 1970-01-01 แบบเดียวกับ hdata) ---
const dayOf = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const isoOf = d => new Date(d * 864e5).toISOString().slice(0, 10);
const today = Math.floor((Date.now() + 7 * 36e5) / 864e5);

// --- ดึงหนึ่งวัน (ลองซ้ำ 3 ครั้ง) ---
async function fetchDay(d) {
  const s = isoOf(d), url = `${API}?start_date=${s}T00:00:00&end_date=${s}T23:59:59&reserved_only=0&protected_only=0`;
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(180e3) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), out = [];
    for (const f of j.features || []) {
      const p = f.properties || {}, [lon, lat] = f.geometry.coordinates, w = where(lon, lat);
      if (!w || !p.full_date) continue;
      out.push({ d: dayOf(p.full_date), t: +p.full_date.slice(11, 13) * 100 + +p.full_date.slice(14, 16), la: Math.round(lat * 1e5), lo: Math.round(lon * 1e5),
        sat: String(p.satellite_name || 'ไม่ระบุ').trim(), cf: String(p.confidence || 'ไม่ระบุ').trim(),
        pv: (p.province_name_th || 'ไม่ระบุ').trim(), am: (p.district_name_th || 'ไม่ระบุ').trim(), tm: (p.subdistrict_name_th || 'ไม่ระบุ').trim(),
        ...w, uid: String(p.unique_id || '') });
    }
    return { n: (j.features || []).length, out };
  } catch (e) {
    if (k >= 3) throw new Error(`${s}: ${e.message}`);
    await new Promise(r => setTimeout(r, 3000 * k));
  }
}

// --- ข้อมูลเดิม ---
let store = { days: {}, recs: [] };
if (fs.existsSync(OUT)) store = JSON.parse(fs.readFileSync(OUT, 'utf8')).raw || store;

(async () => {
  const todo = [];
  for (let d = dayOf(FROM); d <= today; d++) if (!(d in store.days) || d > today - REFETCH) todo.push(d);
  console.log(`ดึง ${todo.length} วัน (${todo.length ? isoOf(todo[0]) + ' → ' + isoOf(todo[todo.length - 1]) : '-'})`);
  const got = {}, fail = [], empty = [];
  let i = 0, done = 0, nat = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < todo.length) {
      const d = todo[i++];
      // ทั้งประเทศ 0 จุด = API ขัดข้องบ่อยกว่าไม่มีไฟจริง (เคยตอบว่างย้อนหลังหลายวัน 27 ต.ค. 69) → คงข้อมูลเดิมไว้ ไม่บันทึกว่าเสร็จ รอบหน้าดึงใหม่
      try { const r = await fetchDay(d); if (r.n) got[d] = r.out; else empty.push(isoOf(d)); nat += r.n } catch (e) { fail.push(e.message) }
      if (++done % 20 === 0 || done === todo.length) console.log(`  ${done}/${todo.length} วัน · ทั้งประเทศ ${nat} จุด`);
    }
  }));
  // แทนที่ข้อมูลของวันที่ดึงสำเร็จ (จุดอาจมีวันที่ข้ามไปวันก่อน/หลังเล็กน้อย จึงกันซ้ำด้วย unique_id)
  const fetched = new Set(Object.keys(got).map(Number));
  const byId = new Map(store.recs.filter(r => !fetched.has(r.d)).map(r => [r.uid || `${r.d}|${r.t}|${r.la}|${r.lo}|${r.sat}`, r]));
  for (const d of fetched) {
    for (const r of got[d]) byId.set(r.uid || `${r.d}|${r.t}|${r.la}|${r.lo}|${r.sat}`, r);
    if (d < today) store.days[d] = got[d].length; // วันนี้ยังไม่ครบ ไม่บันทึกว่าเสร็จ
  }
  store.recs = [...byId.values()].sort((a, b) => a.d - b.d || a.t - b.t || a.la - b.la);

  // จับคู่กับข้อมูลกรมอุทยานฯ (Excel): วันเดียวกัน เวลาต่างไม่เกิน 10 นาที ห่างไม่เกิน ~400 ม.
  const hd = HDATA.r.filter(a => a[0] >= dayOf(FROM));
  const mins = t => Math.floor(t / 100) * 60 + t % 100;
  // จับคู่แบบหนึ่งต่อหนึ่ง (จุดใกล้สุดก่อน) เฉพาะ Suomi NPP — พิกเซล VIIRS ห่างกันแค่ ~375 ม. จึงห้ามจุดเดียวจับหลายจุด
  const pairs = [];
  store.recs.forEach((r, ri) => { r.dnp = 0; if (r.sat !== 'SNPP') return; hd.forEach((a, ai) => { if (a[0] === r.d && Math.abs(mins(a[1]) - mins(r.t)) <= 10) { const dd = Math.hypot(a[2] - r.la, a[3] - r.lo); if (dd < 400) pairs.push([dd, ri, ai]) } }) });
  const usedR = new Set(), usedA = new Set();
  for (const [, ri, ai] of pairs.sort((x, y) => x[0] - y[0])) if (!usedR.has(ri) && !usedA.has(ai)) { usedR.add(ri); usedA.add(ai); store.recs[ri].dnp = 1 }
  if (hd.length > usedA.size) console.log('จุดของกรมอุทยานฯ ที่ไม่พบใน API', hd.length - usedA.size, 'จุด');

  // เข้ารหัส dictionary แบบ hdata (เล็กพอจะฝังในหน้าเว็บ)
  const K = ['sat', 'cf', 'pv', 'am', 'tm', 'ar', 'st', 'sb'], D = Object.fromEntries(K.map(k => [k, []]));
  const ix = (k, v) => { let n = D[k].indexOf(v); if (n < 0) { n = D[k].length; D[k].push(v) } return n };
  const last = Math.max(-1, ...Object.keys(store.days).map(Number));
  const enc = {
    v: 1, upd: new Date().toISOString(), from: FROM, to: last >= 0 ? isoOf(last) : null, ...D,
    r: store.recs.map(r => [r.d, r.t, r.la, r.lo, ix('sat', r.sat), ix('cf', r.cf), ix('pv', r.pv), ix('am', r.am), ix('tm', r.tm + '|' + r.am), ix('ar', r.ar), ix('st', r.st), ix('sb', SBP[r.pv] || r.sb), r.dnp]),
  };
  writeSafe(OUT, JSON.stringify({ enc, raw: store }));
  const s = JSON.stringify(enc);
  let h = fs.readFileSync(H, 'utf8');
  if (block('adata')) h = h.replace(/(<script type="application\/json" id="adata">)[\s\S]*?(<\/script>)/, (_, a, b) => a + s + b);
  else h = h.replace(/(<script type="application\/json" id="hdata">[\s\S]*?<\/script>)/, m => m + '\n<script type="application/json" id="adata">' + s + '</script>');
  writeSafe(H, h);

  // CSV ปีงบ 2569 เฉพาะ Suomi NPP (ทั้งพื้นที่กลุ่มป่า)
  const f69 = store.recs.filter(r => r.d >= dayOf('2025-10-01') && r.d <= dayOf('2026-09-30') && r.sat === 'SNPP');
  const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const csv = ['วันที่,เวลา,ดาวเทียม,ความเชื่อมั่น,ละติจูด,ลองจิจูด,ตำบล,อำเภอ,จังหวัด,พื้นที่อนุรักษ์,สถานีควบคุมไฟป่า,สำนักบริหารพื้นที่อนุรักษ์,อยู่ในข้อมูลกรมอุทยานฯ (ป่าคงสภาพ)']
    .concat(f69.map(r => [isoOf(r.d), String(r.t).padStart(4, '0').replace(/(..)$/, ':$1'), 'Suomi NPP', r.cf, (r.la / 1e5).toFixed(5), (r.lo / 1e5).toFixed(5), r.tm, r.am, r.pv, r.ar, r.st, SBP[r.pv] || r.sb, r.dnp ? 'ใช่' : 'ไม่ใช่'].map(q).join(',')));
  fs.writeFileSync(path.join(ROOT, 'data', 'FY2569_SNPP_ทั้งกลุ่มป่า.csv'), '﻿' + csv.join('\r\n'));

  const cnt = {}; store.recs.forEach(r => { const k = (r.d >= dayOf('2026-10-01') ? '2570' : '2569') + ' ' + r.sat; cnt[k] = (cnt[k] || 0) + 1 });
  console.log('ในแนวเขต', store.recs.length, 'จุด', cnt, '· ฝังใน index.html', (s.length / 1024).toFixed(1), 'KB');
  console.log('ปีงบ 2569 SNPP', f69.length, 'จุด · ตรงกับข้อมูลกรมอุทยานฯ', f69.filter(r => r.dnp).length, 'จาก', hd.filter(a => a[0] <= dayOf('2026-09-30')).length);
  if (empty.length) console.log('API ตอบว่างทั้งประเทศ', empty.length, 'วัน (คงข้อมูลเดิม รอบหน้าดึงใหม่):', empty.join(', '));
  if (fail.length) { console.log('ดึงไม่สำเร็จ', fail.length, 'วัน (รันใหม่จะลองวันเหล่านี้อีก):', fail.slice(0, 5)); process.exitCode = 1 }
})();
