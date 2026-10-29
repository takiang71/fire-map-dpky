// แหล่งเชื้อเพลิง (SAVI) รายเดือนจากระบบ "ตามรอยเผา" (tamroypao.hii.or.th) เฉพาะในแนวเขตกลุ่มป่า → ไทล์ภาพ PNG + สถิติไร่
// ใช้: node scripts/sync_fuel.js [--redo]
//  - ต้นทาง: https://tamroypao.hii.or.th/product/SAVI2/<ปี>/SAVI_<กริด>_20M_<YYYYMM>.tif (GeoTIFF รายกริด UTM 20 ม., ~68 MB/ไฟล์)
//    ค่า = SAVI × 10000 (ดัชนีพืชพรรณปรับค่าดิน) · -9999 และ 32767 = ไม่มีข้อมูล (เช่น เมฆ)
//    ระบบตามรอยเผาจัดระดับทุก 1000: 1000 = สูงมาก (Very High) … 10000 = ต่ำมาก (Very Low) — ค่า SAVI ต่ำ (พืชพรรณโปร่ง/แห้ง) = ระดับเชื้อเพลิงสูง
//    หน้านี้ใช้ระดับ 1–10 = floor(ค่า/1000) (ต่ำกว่า 1000 นับเป็น 1, ตั้งแต่ 10000 นับเป็น 10)
//  - ไทล์ data/fuel/<YYYYMM>/<z>/<x>/<y>.png ซูม 8–12 (ซูม 12 ≈ 37 ม./พิกเซล) วาดเฉพาะในพื้นที่อนุรักษ์/พื้นที่รับผิดชอบสถานีฯ
//    ซูม 12 สุ่มค่าจาก 20 ม. ที่กลางพิกเซล · ซูมต่ำกว่าใช้ค่าที่พบบ่อยสุดของ 2×2 พิกเซลจากซูมถัดไป
//  - data/fuel/index.json: months[] = { m, grids, sig, tiles: {z: ["x_y", …]}, s: {"ar|st": [ไร่ ระดับ 1–10]} } (คิดจาก 20 ม. ไม่นับซ้ำส่วนกริดซ้อน)
//  - เก็บไว้ไม่เกิน KEEP เดือนล่าสุด (ไทล์ ~ไม่กี่ MB/เดือน) · ทำซ้ำเมื่อขนาด/เวลาไฟล์ต้นทางเปลี่ยน
const fs = require('fs'), path = require('path');
const { readTiff, utmToLL, llToUTM } = require('./lib/tiff');
const { SRC, GRIDS, RAI, writeSafe, get, listing, ARN, STN, rasterize, gridCenter, owner } = require('./lib/tamroypao');
const { GEO } = require('./lib/area');
const { palettePNG } = require('./lib/png');

const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'fuel'), IDX = path.join(DIR, 'index.json');
const REDO = process.argv.includes('--redo'), KEEP = 6, ZMAX = 12, ZMIN = 8;
// สีตามระบบตามรอยเผา (สูงมาก แดง → ต่ำมาก เขียวเข้ม) ไล่ 10 ระดับ · ลำดับ 0 = โปร่งใส
const PAL = ['#000000', '#e10000', '#e13f00', '#e17d00', '#f0af00', '#ffe100', '#80e150', '#00e100', '#00b400', '#008200', '#005000'];
const lvl = v => v < 0 || v >= 32000 ? 0 : Math.min(10, Math.max(1, Math.floor(v / 1000)));

// กรอบแนวเขต และช่วงไทล์ซูม 12
const BB = [...GEO.cons.features, ...GEO.resp.features].reduce((b, f) => { f.geometry.coordinates.forEach(p => p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) })); return b }, [1e9, 1e9, -1e9, -1e9]);
const lon2t = (lo, z) => (lo + 180) / 360 * 2 ** z, lat2t = (la, z) => (1 - Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)) / Math.PI) / 2 * 2 ** z;
const t2lon = (x, z) => x / 2 ** z * 360 - 180, t2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;

async function scan() {
  const per = {};
  for (const y of listing(await get(SRC + 'SAVI2/')).filter(r => /\/SAVI2\/\d{4}\/$/.test(r.href))) {
    const u = new URL(y.href, SRC).href;
    for (const f of listing(await get(u))) {
      const k = f.href.match(/SAVI_(\w{5})_20M_(\d{6})\.tif$/);
      if (k && GRIDS.includes(k[1])) (per[k[2]] = per[k[2]] || {})[k[1]] = { url: new URL(f.href, u).href, s: f.size, m: f.mod };
    }
  }
  return per;
}

async function month(m, files) {
  const t0 = Date.now(), gs = Object.keys(files).sort(), cen = gs.map(g => gridCenter(g));
  // ผืนภาพซูม 12 ครอบแนวเขต: ลำดับกริดเจ้าของต่อพิกเซล (กริดที่ศูนย์กลางใกล้สุด) แล้วเติมระดับทีละกริด
  const tx0 = Math.floor(lon2t(BB[0], ZMAX)), tx1 = Math.floor(lon2t(BB[2], ZMAX)), ty0 = Math.floor(lat2t(BB[3], ZMAX)), ty1 = Math.floor(lat2t(BB[1], ZMAX));
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256, cv = new Uint8Array(W * H), own = new Uint8Array(W * H);
  const LON = Float64Array.from({ length: W }, (_, i) => t2lon(tx0 + (i + .5) / 256, ZMAX)), LAT = Float64Array.from({ length: H }, (_, j) => t2lat(ty0 + (j + .5) / 256, ZMAX));
  const gl = gs.map((g, i) => [i, cen[i]]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) own[j * W + i] = owner(LON[i], LAT[j], gl);
  const S = {};
  for (const [gi, g] of gs.entries()) {
    const t = readTiff(await get(files[g].url, true)), zone = t.epsg - 32600, b = t.band(0), M = rasterize(t, zone), gg = gs.map(k => [k, cen[gs.indexOf(k)]]);
    // สถิติไร่จากพิกเซล 20 ม. (เฉพาะส่วนที่กริดนี้เป็นเจ้าของ)
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const i = y * t.w + x, a = M.ar[i], s = M.st[i];
      if (!(a || s)) continue;
      const l = lvl(b[i]); if (!l) continue;
      const [lo, la] = utmToLL(t.x0 + (x + .5) * t.px[0], t.y0 - (y + .5) * t.px[1], zone);
      if (owner(lo, la, gg) !== g) continue;
      (S[a + '|' + s] = S[a + '|' + s] || new Array(10).fill(0))[l - 1] += RAI;
    }
    // พิกเซลซูม 12 ที่กริดนี้เป็นเจ้าของ → ค่าจากพิกเซล 20 ม. ที่ตรงกลาง
    let n = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; if (own[k] !== gi) continue;
      const [E, N] = llToUTM(LON[i], LAT[j], zone), x = Math.floor((E - t.x0) / t.px[0]), y = Math.floor((t.y0 - N) / t.px[1]);
      if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
      const q = y * t.w + x; if (!(M.ar[q] || M.st[q])) continue;
      const l = lvl(b[q]); if (l) { cv[k] = l; n++ }
    }
    console.log(`  ${m} ${g}: ${n.toLocaleString()} พิกเซลบนไทล์`);
  }
  // เขียนไทล์ทุกซูม (ซูมต่ำ = ค่าที่พบบ่อยสุดของ 2×2)
  const out = path.join(DIR, m); fs.rmSync(out, { recursive: true, force: true });
  const tiles = {}, A = PAL.map((_, i) => i ? 255 : 0);
  let L = { z: ZMAX, x0: tx0, y0: ty0, W, H, px: cv }, bytes = 0;
  for (; ;) {
    const nx = L.W / 256, ny = L.H / 256, list = tiles[L.z] = [];
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
      const p = new Uint8Array(65536); let any = false;
      for (let y = 0; y < 256; y++) { const r = L.px.subarray((ty * 256 + y) * L.W + tx * 256, (ty * 256 + y) * L.W + tx * 256 + 256); p.set(r, y * 256); if (!any && r.some(v => v)) any = true }
      if (!any) continue;
      const d = path.join(out, String(L.z), String(L.x0 + tx)); fs.mkdirSync(d, { recursive: true });
      const png = palettePNG(256, 256, p, PAL, A); fs.writeFileSync(path.join(d, (L.y0 + ty) + '.png'), png); bytes += png.length;
      list.push((L.x0 + tx) + '_' + (L.y0 + ty));
    }
    if (L.z === ZMIN) break;
    // ซูมถัดลง: จัดให้ตรงขอบไทล์ (ต้นทางอาจเริ่มที่ไทล์เลขคี่)
    const x0 = L.x0 >> 1, y0 = L.y0 >> 1, ox = (L.x0 - x0 * 2) * 256, oy = (L.y0 - y0 * 2) * 256;
    const W2 = (((L.x0 + nx - 1) >> 1) - x0 + 1) * 256, H2 = (((L.y0 + ny - 1) >> 1) - y0 + 1) * 256, px = new Uint8Array(W2 * H2), c = new Uint8Array(11);
    for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
      c.fill(0); let best = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = i * 2 + dx - ox, sy = j * 2 + dy - oy; if (sx < 0 || sy < 0 || sx >= L.W || sy >= L.H) continue;
        const v = L.px[sy * L.W + sx]; if (v && ++c[v] > c[best]) best = v;
      }
      px[j * W2 + i] = best;
    }
    L = { z: L.z - 1, x0, y0, W: W2, H: H2, px };
  }
  console.log(`${m}: ${Object.values(tiles).reduce((s, l) => s + l.length, 0)} ไทล์ ${(bytes / 1048576).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
  return { tiles, s: Object.fromEntries(Object.entries(S).map(([k, a]) => [k, a.map(Math.round)])) };
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let idx = { months: [] };
  try { idx = JSON.parse(fs.readFileSync(IDX, 'utf8')) } catch (e) {}
  const per = await scan(), old = Object.fromEntries((idx.months || []).map(x => [x.m, x]));
  const sig = o => Object.keys(o).sort().map(g => `${g}:${o[g].s}:${o[g].m}`).join('|');
  const ms = Object.keys(per).sort().slice(-KEEP), todo = ms.filter(m => REDO || !old[m] || old[m].sig !== sig(per[m]));
  console.log(`ตามรอยเผา SAVI: ${Object.keys(per).length} เดือน · เก็บ ${ms.length} · ต้องประมวลผล ${todo.length}`);
  for (const m of todo) old[m] = { m, grids: Object.keys(per[m]).sort(), sig: sig(per[m]), ...(await month(m, per[m])) };
  // ลบเดือนที่เกิน KEEP
  for (const m of Object.keys(old)) if (!ms.includes(m)) { delete old[m]; fs.rmSync(path.join(DIR, m), { recursive: true, force: true }) }
  if (!todo.length && Object.keys(old).length === (idx.months || []).length) return;
  writeSafe(IDX, JSON.stringify({ v: 1, src: 'ตามรอยเผา (tamroypao.hii.or.th) SAVI', zmin: ZMIN, zmax: ZMAX, pal: PAL, ar: ARN, st: STN, upd: new Date().toISOString(), months: Object.values(old).sort((a, b) => a.m < b.m ? -1 : 1) }));
  console.log('บันทึก data/fuel/index.json');
})().catch(e => { console.error('ผิดพลาด:', e.stack || e); process.exit(1) });
