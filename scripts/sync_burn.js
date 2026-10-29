// เก็บพื้นที่เผาไหม้ราย 7 วัน (B4) จากระบบ "ตามรอยเผา" (tamroypao.hii.or.th, สสน. + ม.เกษตรศาสตร์) เฉพาะในแนวเขตกลุ่มป่า
// ใช้: node scripts/sync_burn.js [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--redo]
//  - ต้นทาง: https://tamroypao.hii.or.th/product/B4/<ปี>/<เดือน>/BURNSCAR_<กริด>_20M_<เริ่ม>_<สิ้นสุด>_B4.tif
//    GeoTIFF รายกริด Sentinel-2 (~110×110 กม., UTM, 20 ม./พิกเซล, LZW) แบนด์ 1 = จำนวนครั้งที่ตรวจพบรอยเผาไหม้ในรอบ, แบนด์ 2 = จำนวนภาพที่ผ่าน
//    ปี 2025 รอบละ 15 วัน, ตั้งแต่ 2026 รอบละ 7 วัน · ออกช้ากว่าวันสุดท้ายของรอบ ~9 วัน
//  - กริดที่ทับแนวเขต: 47PQR 47PQS 47PRR 47PRS 48PTA 48PTB 48PUA — กริดซ้อนกันตามขอบ จึงให้แต่ละพิกเซลเป็นของกริดที่ศูนย์กลางใกล้ที่สุด (ไม่นับซ้ำ)
//  - เก็บเฉพาะพิกเซลเผาไหม้ที่อยู่ในพื้นที่อนุรักษ์/พื้นที่รับผิดชอบสถานีฯ (GEO ใน index.html เหมือนจุดความร้อน)
//  - ผลลัพธ์: data/burn/index.json (รายการรอบ + พื้นที่ไร่ แยกพื้นที่อนุรักษ์/สถานีฯ) และ data/burn/b4/<เริ่ม>_<สิ้นสุด>.json
//    แถวพิกเซลแบบ run-length ต่อกริด: r = [dy, dx, ยาว, ค่า, ar, st, …] (dy = แถวห่างจากรันก่อน, dx = คอลัมน์ห่างจากท้ายรันก่อนถ้าแถวเดียวกัน ไม่งั้นนับจาก 0,
//    ค่า = จำนวนครั้งที่ตรวจพบ (สูงสุด 9), ar/st = ลำดับใน index.json ar[]/st[] — หน้าเว็บใช้คิดพื้นที่สะสมแบบไม่นับซ้ำ และตัดดงใหญ่ตามปุ่ม)
//  - รอบที่ประมวลผลแล้วจะทำซ้ำเมื่อขนาด/เวลาไฟล์ต้นทางเปลี่ยน หรือมีกริดเพิ่ม
const fs = require('fs'), path = require('path');
const { readTiff, utmToLL, llToUTM } = require('./lib/tiff');
const { GEO } = require('./lib/area');

const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'burn'), IDX = path.join(DIR, 'index.json');
const SRC = 'https://tamroypao.hii.or.th/product/B4/';
const GRIDS = ['47PQR', '47PQS', '47PRR', '47PRS', '48PTA', '48PTB', '48PUA'];
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const FROM = (arg('--from') || '2025-01-01').replace(/-/g, ''), TO = (arg('--to') || '9999').replace(/-/g, ''), REDO = process.argv.includes('--redo');
const writeSafe = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f) };
const RAI = 400 / 1600;   // 20×20 ม. = 0.25 ไร่

async function get(url, bin) {
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { signal: AbortSignal.timeout(bin ? 300e3 : 60e3) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return bin ? Buffer.from(await r.arrayBuffer()) : await r.text();
  } catch (e) {
    if (k >= 3) throw new Error(url.split('/').pop() + ': ' + e.message);
    await new Promise(r => setTimeout(r, 5000 * k));
  }
}
// หน้าสารบัญของ Tomcat → [{name, size(ไบต์โดยประมาณ), mod}]
function listing(h) {
  return h.split(/<tr/i).slice(1).map(r => {
    const a = r.match(/href="([^"]+)"/), t = r.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const s = t.match(/([\d.]+) (KiB|MiB|B)\b/), m = t.match(/\w{3}, \d+ \w{3} \d{4} [\d:]+ GMT/);
    return a && { href: a[1], size: s ? Math.round(+s[1] * { B: 1, KiB: 1024, MiB: 1048576 }[s[2]]) : 0, mod: m ? m[0] : '' };
  }).filter(Boolean);
}

// --- รายการไฟล์ต้นทาง จัดกลุ่มตามรอบ ---
async function scan() {
  const per = {}, years = listing(await get(SRC)).map(r => r.href).filter(h => /\/B4\/\d{4}\/$/.test(h));
  for (const y of years) {
    const months = listing(await get(new URL(y, SRC).href)).map(r => r.href).filter(h => /\/\d{2}\/$/.test(h));
    for (const m of months) for (const f of listing(await get(new URL(m, SRC).href))) {
      const k = f.href.match(/BURNSCAR_(\w{5})_20M_(\d{8})_(\d{8})_B4\.tif$/);
      if (!k || !GRIDS.includes(k[1]) || k[2] < FROM || k[2] > TO) continue;
      const p = k[2] + '_' + k[3];
      (per[p] = per[p] || {})[k[1]] = { url: new URL(f.href, SRC).href, s: f.size, m: f.mod };
    }
  }
  return per;
}

// --- แนวเขตบนกริดพิกเซลของแต่ละกริด: ป้ายพื้นที่อนุรักษ์ + ป้ายสถานีฯ (สถานีหลักทับ "พื้นที่รอง" ตามกติกา where()) ---
const AR = { 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าโคกสูง': 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมการ)', 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าเขาฉกรรจ์': 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)' };
const CONS = GEO.cons.features, ARN = ['นอกพื้นที่อนุรักษ์', ...CONS.map(f => AR[f.properties.name] || f.properties.name)];
const stName = f => f.properties.station.replace(/\s*\(พื้นที่รอง\)/, '').trim();
const STN = ['ไม่มี', ...new Set(GEO.resp.features.map(stName))];
function rasterize(t, zone) {
  const W = t.w, H = t.h, ar = new Uint8Array(W * H), st = new Uint8Array(W * H);
  const fill = (f, lab, v) => f.geometry.coordinates.forEach(poly => {
    const rings = poly.map(r => r.map(([x, y]) => { const [E, N] = llToUTM(x, y, zone); return [(E - t.x0) / t.px[0], (t.y0 - N) / t.px[1]] }));
    let y0 = Infinity, y1 = -Infinity; rings[0].forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) });
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
      const c = y + 0.5, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if ((r[i][1] > c) !== (r[j][1] > c)) xs.push(r[i][0] + (c - r[i][1]) * (r[j][0] - r[i][0]) / (r[j][1] - r[i][1]));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        if (b >= a) lab.fill(v, y * W + a, y * W + b + 1);
      }
    }
  });
  CONS.forEach((f, i) => fill(f, ar, i + 1));
  const R = GEO.resp.features, sec = f => /พื้นที่รอง/.test(f.properties.station);
  [...R.filter(sec), ...R.filter(f => !sec(f))].forEach(f => fill(f, st, STN.indexOf(stName(f))));
  return { ar, st };
}

// ศูนย์กลางกริด (ลองจิจูด, ละติจูด) จากชื่อ — ใช้ตัดสินว่าพิกเซลในส่วนที่กริดซ้อนกันเป็นของกริดใด
const ROW = 'ABCDEFGHJKLMNPQRSTUV', COLS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
function gridCenter(g) {
  const z = +g.slice(0, 2), col = COLS[(z - 1) % 3].indexOf(g[3]) + 1, ri = ROW.indexOf(g[4]);
  // แถว 100 กม. ที่ใกล้ละติจูด ~14° (ประเทศไทย) — ตัวอักษรแถววนทุก 2,000 กม.
  const r = ((ri - (z % 2 ? 0 : 5)) % 20 + 20) % 20, top = (r + 1) * 1e5;
  return utmToLL(col * 1e5 + 54900, top - 54900, z);
}
const owner = (lon, lat, gs) => { let b = null, bd = Infinity; const c = Math.cos(lat * Math.PI / 180); for (const [g, [x, y]] of gs) { const d = ((lon - x) * c) ** 2 + (lat - y) ** 2; if (d < bd) { bd = d; b = g } } return b };

(async () => {
  fs.mkdirSync(path.join(DIR, 'b4'), { recursive: true });
  let idx = { v: 1, src: 'ตามรอยเผา (tamroypao.hii.or.th) B4', ar: ARN, st: STN, periods: [] };
  try { idx = { ...idx, periods: JSON.parse(fs.readFileSync(IDX, 'utf8')).periods || [] } } catch (e) {}
  const per = await scan(), old = Object.fromEntries(idx.periods.map(p => [p.p, p]));
  const sig = o => Object.keys(o).sort().map(g => `${g}:${o[g].s}:${o[g].m}`).join('|');
  const todo = Object.keys(per).sort().filter(p => REDO || !old[p] || old[p].sig !== sig(per[p]));
  console.log(`ตามรอยเผา B4: ${Object.keys(per).length} รอบ · ต้องประมวลผล ${todo.length} รอบ`);
  if (!todo.length) return;
  // วนทีละกริด (สร้างแนวเขตครั้งเดียวต่อกริด) แล้วค่อยรวมผลรายรอบ
  const res = Object.fromEntries(todo.map(p => [p, { g: {}, ar: new Float64Array(ARN.length), st: new Float64Array(STN.length), n: 0 }]));
  const cen = Object.fromEntries(GRIDS.map(g => [g, gridCenter(g)]));
  for (const g of GRIDS) {
    const ps = todo.filter(p => per[p][g]);
    if (!ps.length) continue;
    let M = null, t0 = Date.now();
    for (const p of ps) {
      const t = readTiff(await get(per[p][g].url, true)), zone = t.epsg - 32600;
      if (t.epsg < 32601 || t.epsg > 32660) throw new Error(g + ': ไม่ใช่ UTM เหนือ (EPSG ' + t.epsg + ')');
      if (!M || M.w !== t.w || M.x0 !== t.x0 || M.y0 !== t.y0) M = { ...rasterize(t, zone), w: t.w, x0: t.x0, y0: t.y0 };
      const b = t.band(0), gs = Object.keys(per[p]).map(k => [k, cen[k]]), R = res[p], r = [];
      let ly = 0, le = 0;
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x, v = b[i];
        if (v <= 0 || !(M.ar[i] || M.st[i])) continue;
        const [lon, lat] = utmToLL(t.x0 + (x + 0.5) * t.px[0], t.y0 - (y + 0.5) * t.px[1], zone);
        if (owner(lon, lat, gs) !== g) continue;
        R.ar[M.ar[i]] += RAI; R.st[M.st[i]] += RAI; R.n++;
        // ต่อรันเดิมถ้าเป็นพิกเซลถัดไปที่ค่า/พื้นที่อนุรักษ์/สถานีฯ เดียวกัน
        const n = r.length;
        const c = Math.min(v, 9), a = M.ar[i], s = M.st[i];
        if (n && y === ly && x === le && r[n - 3] === c && r[n - 2] === a && r[n - 1] === s) { r[n - 4]++; le++; continue }
        r.push(y - ly, y === ly && n ? x - le : x, 1, c, a, s); ly = y; le = x + 1;
      }
      if (r.length) R.g[g] = { z: zone, x0: t.x0, y0: t.y0, px: t.px[0], r };
      console.log(`  ${g} ${p}: ${(r.length / 6) | 0} รัน`);
    }
    console.log(`${g}: ${ps.length} รอบ ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
  }
  for (const p of todo) {
    const R = res[p], rnd = a => Object.fromEntries([...a].map((v, i) => [i, Math.round(v)]).filter(([, v]) => v > 0));
    writeSafe(path.join(DIR, 'b4', p + '.json'), JSON.stringify({ p, g: R.g }));
    old[p] = { p, d0: p.slice(0, 8), d1: p.slice(9), grids: Object.keys(per[p]).sort(), sig: sig(per[p]), rai: Math.round(R.n * RAI), ar: rnd(R.ar), st: rnd(R.st) };
  }
  idx.periods = Object.values(old).sort((a, b) => a.p < b.p ? -1 : 1);
  idx.upd = new Date().toISOString();
  writeSafe(IDX, JSON.stringify(idx));
  const kb = idx.periods.reduce((s, p) => s + fs.statSync(path.join(DIR, 'b4', p.p + '.json')).size, 0) / 1024;
  console.log(`บันทึก ${todo.length} รอบ · รวม ${idx.periods.length} รอบ ${kb.toFixed(0)} KB · ล่าสุด ${idx.periods.at(-1).p} = ${idx.periods.at(-1).rai.toLocaleString()} ไร่`);
})().catch(e => { console.error('ผิดพลาด:', e.stack || e); process.exit(1) });
