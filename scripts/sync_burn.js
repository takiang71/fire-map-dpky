// เก็บพื้นที่เผาไหม้จากระบบ "ตามรอยเผา" (tamroypao.hii.or.th, สสน. + ม.เกษตรศาสตร์) เฉพาะในแนวเขตกลุ่มป่า
// ใช้: node scripts/sync_burn.js [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--redo] [--only b4|c]
//  - ต้นทาง: https://tamroypao.hii.or.th/product/<ผลิตภัณฑ์>/<ปี>/[<เดือน>/]BURNSCAR_<กริด>_20M_<ช่วง>_<ผลิตภัณฑ์>.tif
//    GeoTIFF รายกริด Sentinel-2 (~110×110 กม., UTM, 20 ม./พิกเซล, LZW, int16)
//    ชุด b4 = B4 ราย 7 วัน: แบนด์ 1 = จำนวนครั้งที่ตรวจพบรอยเผาไหม้ในรอบ (แบนด์ 2 = จำนวนภาพที่ผ่าน)
//      ปี 2025 รอบละ 15 วัน, ตั้งแต่ 2026 รอบละ 7 วัน · ออกช้ากว่าวันสุดท้ายของรอบ ~9 วัน · มีตั้งแต่ 1 ม.ค. 2025
//    ชุด c = แยกประเภทพื้นที่: B2F/B2A รายเดือน (YYYYMM) และ B3F/B3A รายฤดูฝุ่น ธ.ค.–เม.ย. (YYYY12_YYYY+104)
//      F: 6000 = ป่าไม้ตามกฎหมาย · A: 1101 ข้าว, 1203 อ้อย, 1202 ข้าวโพด, 1201 พืชผสม (ป่ากับเกษตรไม่ซ้อนกัน) → ค่า 1–5 ตาม CLS
//      มีตั้งแต่ ธ.ค. 2023 (บางเดือนช่วงฤดูฝนไม่มี)
//  - กริดที่ทับแนวเขต: 47PQR 47PQS 47PRR 47PRS 48PTA 48PTB 48PUA — กริดซ้อนกันตามขอบ จึงให้แต่ละพิกเซลเป็นของกริดที่ศูนย์กลางใกล้ที่สุด (ไม่นับซ้ำ)
//  - เก็บเฉพาะพิกเซลเผาไหม้ที่อยู่ในพื้นที่อนุรักษ์/พื้นที่รับผิดชอบสถานีฯ (GEO ใน index.html เหมือนจุดความร้อน)
//  - ผลลัพธ์: data/burn/index.json (periods = b4, cls = c: รายการรอบ + พื้นที่ไร่ แยกพื้นที่อนุรักษ์/สถานีฯ/ประเภท)
//    และ data/burn/<b4|c>/<รอบ>.json แถวพิกเซลแบบ run-length ต่อกริด: r = [dy, dx, ยาว, ค่า, ar, st, …]
//    (dy = แถวห่างจากรันก่อน, dx = คอลัมน์ห่างจากท้ายรันก่อนถ้าแถวเดียวกัน ไม่งั้นนับจาก 0,
//    ค่า = b4: จำนวนครั้งที่ตรวจพบ (สูงสุด 9) / c: ประเภท 1–5 ตาม CLS, ar/st = ลำดับใน index.json ar[]/st[] — หน้าเว็บใช้คิดพื้นที่แบบไม่นับซ้ำ และตัดดงใหญ่ตามปุ่ม)
//  - รอบที่ประมวลผลแล้วจะทำซ้ำเมื่อขนาด/เวลาไฟล์ต้นทางเปลี่ยน หรือมีกริดเพิ่ม
const fs = require('fs'), path = require('path');
const { readTiff, utmToLL, llToUTM } = require('./lib/tiff');
const { GEO } = require('./lib/area');

const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'burn'), IDX = path.join(DIR, 'index.json');
const SRC = 'https://tamroypao.hii.or.th/product/';
const GRIDS = ['47PQR', '47PQS', '47PRR', '47PRS', '48PTA', '48PTB', '48PUA'];
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const FROM = (arg('--from') || '').replace(/-/g, ''), TO = (arg('--to') || '9999').replace(/-/g, ''), REDO = process.argv.includes('--redo'), ONLY = arg('--only');
const writeSafe = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f) };
const RAI = 400 / 1600;   // 20×20 ม. = 0.25 ไร่
// ประเภทพื้นที่ของชุด c (ลำดับ = ค่าในไฟล์ เริ่ม 1)
const CLS = ['ป่าไม้', 'ข้าว', 'อ้อย', 'ข้าวโพด', 'พืชผสม'], ACODE = { 1101: 2, 1203: 3, 1202: 4, 1201: 5 };
const SETS = {
  b4: { idx: 'periods', prods: ['B4'], from: '20250101', re: /BURNSCAR_(\w{5})_20M_(\d{8})_(\d{8})_(B4)\.tif$/, val: () => v => v > 0 ? Math.min(v, 9) : 0 },
  c: { idx: 'cls', prods: ['B2F', 'B2A', 'B3F', 'B3A'], from: '202312', re: /BURNSCAR_(\w{5})_20M_(\d{6})(?:_(\d{6}))?_(B[23][FA])\.tif$/,
    val: p => /F$/.test(p) ? v => v === 6000 ? 1 : 0 : v => ACODE[v] || 0 },
};

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
// หน้าสารบัญของ Tomcat → [{href, size(ไบต์โดยประมาณ), mod}]
function listing(h) {
  return h.split(/<tr/i).slice(1).map(r => {
    const a = r.match(/href="([^"]+)"/), t = r.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const s = t.match(/([\d.]+) (KiB|MiB|B)\b/), m = t.match(/\w{3}, \d+ \w{3} \d{4} [\d:]+ GMT/);
    return a && { href: a[1], size: s ? Math.round(+s[1] * { B: 1, KiB: 1024, MiB: 1048576 }[s[2]]) : 0, mod: m ? m[0] : '' };
  }).filter(Boolean);
}

// --- รายการไฟล์ต้นทาง จัดกลุ่มตามรอบ: per[รอบ][กริด] = [{url, s, m, prod}] (ชุด c มีไฟล์ป่า + เกษตร) ---
// โฟลเดอร์ปี → (B4 มีโฟลเดอร์เดือนอีกชั้น) → ไฟล์
async function scan(S) {
  const per = {}, from = FROM || S.from;
  const walk = async (u, depth) => {
    for (const f of listing(await get(u))) {
      const url = new URL(f.href, u).href;
      if (/\/\d{2}(\d{2})?\/$/.test(f.href)) { if (url.length > u.length && depth < 2) await walk(url, depth + 1); continue }
      const k = f.href.match(S.re);
      if (!k || !GRIDS.includes(k[1]) || k[2] < from.slice(0, k[2].length) || k[2] > TO.slice(0, k[2].length)) continue;
      const p = k[3] ? k[2] + '_' + k[3] : k[2];
      ((per[p] = per[p] || {})[k[1]] = per[p][k[1]] || []).push({ url, s: f.size, m: f.mod, prod: k[4] });
    }
  };
  for (const pr of S.prods) await walk(SRC + pr + '/', 0);
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

// ช่วงวันที่ของรอบ (YYYYMMDD) — b4: เริ่ม_สิ้นสุด · c: YYYYMM หรือ YYYYMM_YYYYMM
const lastDay = ym => ym + String(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(4, 6), 0)).getUTCDate());
const span = p => p.length === 17 ? [p.slice(0, 8), p.slice(9)] : p.length === 6 ? [p + '01', lastDay(p)] : [p.slice(0, 6) + '01', lastDay(p.slice(7))];

async function run(key) {
  const S = SETS[key];
  fs.mkdirSync(path.join(DIR, key), { recursive: true });
  let idx = { v: 1, src: 'ตามรอยเผา (tamroypao.hii.or.th)', ar: ARN, st: STN, cn: CLS, periods: [], cls: [] };
  try { const o = JSON.parse(fs.readFileSync(IDX, 'utf8')); idx = { ...idx, periods: o.periods || [], cls: o.cls || [] } } catch (e) {}
  const per = await scan(S), old = Object.fromEntries(idx[S.idx].map(p => [p.p, p]));
  const sig = o => Object.keys(o).sort().map(g => o[g].map(f => `${g}:${f.s}:${f.m}`).sort().join('|')).join('|');
  const todo = Object.keys(per).sort().filter(p => REDO || !old[p] || old[p].sig !== sig(per[p]));
  console.log(`ตามรอยเผา ${key}: ${Object.keys(per).length} รอบ · ต้องประมวลผล ${todo.length} รอบ`);
  if (!todo.length) return;
  // วนทีละกริด (สร้างแนวเขตครั้งเดียวต่อกริด) แล้วค่อยรวมผลรายรอบ
  const res = Object.fromEntries(todo.map(p => [p, { g: {}, ar: new Float64Array(ARN.length), st: new Float64Array(STN.length), c: new Float64Array(CLS.length + 1), n: 0 }]));
  const cen = Object.fromEntries(GRIDS.map(g => [g, gridCenter(g)]));
  for (const g of GRIDS) {
    const ps = todo.filter(p => per[p][g]);
    if (!ps.length) continue;
    let M = null, t0 = Date.now();
    for (const p of ps) {
      let t = null, vals = null;
      for (const f of per[p][g]) {
        const u = readTiff(await get(f.url, true)), b = u.band(0), V = S.val(f.prod);
        if (u.epsg < 32601 || u.epsg > 32660) throw new Error(g + ': ไม่ใช่ UTM เหนือ (EPSG ' + u.epsg + ')');
        if (t && (u.w !== t.w || u.x0 !== t.x0 || u.y0 !== t.y0)) throw new Error(g + ' ' + p + ': ไฟล์ในกริดเดียวกันขนาดไม่ตรงกัน');
        t = t || u; vals = vals || new Uint8Array(u.w * u.h);
        for (let i = 0; i < b.length; i++) { const v = V(b[i]); if (v) vals[i] = v }
      }
      const zone = t.epsg - 32600;
      if (!M || M.w !== t.w || M.x0 !== t.x0 || M.y0 !== t.y0) M = { ...rasterize(t, zone), w: t.w, x0: t.x0, y0: t.y0 };
      const gs = Object.keys(per[p]).map(k => [k, cen[k]]), R = res[p], r = [];
      let ly = 0, le = 0;
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x, c = vals[i];
        if (!c || !(M.ar[i] || M.st[i])) continue;
        const [lon, lat] = utmToLL(t.x0 + (x + 0.5) * t.px[0], t.y0 - (y + 0.5) * t.px[1], zone);
        if (owner(lon, lat, gs) !== g) continue;
        const a = M.ar[i], s = M.st[i];
        R.ar[a] += RAI; R.st[s] += RAI; R.c[c] += RAI; R.n++;
        // ต่อรันเดิมถ้าเป็นพิกเซลถัดไปที่ค่า/พื้นที่อนุรักษ์/สถานีฯ เดียวกัน
        const n = r.length;
        if (n && y === ly && x === le && r[n - 3] === c && r[n - 2] === a && r[n - 1] === s) { r[n - 4]++; le++; continue }
        r.push(y - ly, y === ly && n ? x - le : x, 1, c, a, s); ly = y; le = x + 1;
      }
      if (r.length) R.g[g] = { z: zone, x0: t.x0, y0: t.y0, px: t.px[0], r };
      console.log(`  ${g} ${p}: ${(r.length / 6) | 0} รัน`);
    }
    console.log(`${g}: ${ps.length} รอบ ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
  }
  for (const p of todo) {
    const R = res[p], rnd = a => Object.fromEntries([...a].map((v, i) => [i, Math.round(v)]).filter(([, v]) => v > 0)), [d0, d1] = span(p);
    writeSafe(path.join(DIR, key, p + '.json'), JSON.stringify({ p, g: R.g }));
    old[p] = { p, d0, d1, grids: Object.keys(per[p]).sort(), sig: sig(per[p]), rai: Math.round(R.n * RAI), ar: rnd(R.ar), st: rnd(R.st), ...(key === 'c' ? { c: rnd(R.c) } : {}) };
  }
  // อ่าน index ใหม่ก่อนเขียน (อีกชุดอาจเพิ่งเขียนไป) แล้วแทนเฉพาะรายการของชุดนี้
  try { const o = JSON.parse(fs.readFileSync(IDX, 'utf8')); idx.periods = o.periods || idx.periods; idx.cls = o.cls || idx.cls } catch (e) {}
  idx[S.idx] = Object.values(old).sort((a, b) => a.p < b.p ? -1 : 1);
  idx.upd = new Date().toISOString();
  writeSafe(IDX, JSON.stringify(idx));
  const L = idx[S.idx], kb = L.reduce((s, p) => s + fs.statSync(path.join(DIR, key, p.p + '.json')).size, 0) / 1024;
  console.log(`บันทึก ${todo.length} รอบ · รวม ${L.length} รอบ ${kb.toFixed(0)} KB · ล่าสุด ${L.at(-1).p} = ${L.at(-1).rai.toLocaleString()} ไร่`);
}

(async () => { for (const k of Object.keys(SETS)) if (!ONLY || ONLY === k) await run(k) })().catch(e => { console.error('ผิดพลาด:', e.stack || e); process.exit(1) });
