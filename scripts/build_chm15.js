#!/usr/bin/env node
// สร้างไทล์ความสูงเรือนยอด (DSM − DTM) ของ GEM-15 (Google, 15 ม.) เฉพาะในแนวเขตพื้นที่อนุรักษ์ (data/geo.json → cons)
//   + พื้นที่เฝ้าระวังพิเศษ (data/watch.json — ผู้ใช้ขอ 19 พ.ย. 69) ยอดใน index.st แยกชื่อ "พื้นที่เฝ้าระวังพิเศษ …" (หน้าเว็บไม่นับรวมกลุ่มป่า)
// ที่มา: https://developers.google.com/earth-engine/datasets/catalog/projects_climate-and-sustainability_assets_gem-15_v1 · CC-BY 4.0 "This dataset is produced by Google"
//   dsm = ค่าเฉลี่ยผิวบน (ยอดไม้/อาคาร) ในช่อง 15 ม. · dtm = พื้นดิน · ต่างกัน = ความสูงของสิ่งที่อยู่บนพื้น (ในป่า = เรือนยอดเฉลี่ยรวมช่องว่าง)
// รันมือ (ไม่อยู่ใน workflow): node scripts/build_chm15.js [--out data/chm15] [--cache <แคช dtm ของ build_dem15>] [--dsm-cache <โฟลเดอร์>] [--zmin 8] [--limit N] [--dry]
//   แผ่น DSM (5 แบนด์ ~5 MB/แผ่น รวม ~1 GB) ไม่เก็บลงดิสก์ถ้าไม่ใส่ --dsm-cache (อ่านแล้วถอดในหน่วยความจำ ≤--max แผ่น)
// ผล: <out>/{z}/{x}/{y}.png PNG เทา 8 บิต ค่า = ความสูง ม. (ปัดเต็ม, 0–60) · 255 = ไม่มีข้อมูล/นอกแนวเขต + <out>/index.json
//   index: ver (รุ่น ISO → ?v= ของไทล์), rows (ไทล์ซูม 13 ที่มีข้อมูล, รูปแบบเดียวกับ data/dem15), cl (ขอบชั้นความสูง ม.), st {ชื่อพื้นที่: ไร่ต่อชั้น}, nd {ชื่อ: ไร่ที่ไม่มีข้อมูล}
//   หน้าเว็บ: โปรโตคอล chm:// ระบายสีตาม CHC · chAt() อ่านค่าที่จุด → docs/arch/data-sources.md
const fs = require('fs'), path = require('path'), os = require('os');
const { grayPNG } = require('./lib/png');
const { y2lat, consFeatures, watchFeatures, tileSet, maskFn, gemSrc, loadFor, at, pool } = require('./lib/gem15');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] };
const OUT = path.resolve(ROOT, arg('out', 'data/chm15')), CACHE = arg('cache', process.env.GEM15_CACHE || path.join(os.tmpdir(), 'gem15')),
  DSMC = arg('dsm-cache', null), MAX = +arg('max', 40), ZMIN = +arg('zmin', 8), LIMIT = +arg('limit', 0), DRY = process.argv.includes('--dry'), ZMAX = 13;
const CL = [2, 5, 10, 15, 20, 30], HMAX = 60, ND = 255;
const cls = h => { let k = 0; while (k < CL.length && h >= CL[k]) k++; return k };

(async () => {
  const t0 = Date.now(), F = [...consFeatures(ROOT), ...watchFeatures(ROOT)], mask = maskFn(F, ZMAX);
  let L = [...tileSet(F, 0.05, ZMAX)].map(k => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  console.log(`ไทล์ซูม 13 ที่แตะแนวเขต ${L.length} แผ่น`);
  if (LIMIT) L = L.slice(Math.floor(L.length / 2), Math.floor(L.length / 2) + LIMIT);
  if (DRY) return;
  const dtm = gemSrc('dtm', { cache: CACHE, max: MAX }), dsm = gemSrc('dsm', { cache: DSMC, max: MAX });
  const st = F.map(() => new Array(CL.length + 1).fill(0)), nd = F.map(() => 0), S = { bytes: {}, n: {} };
  const write = (z, x, y, px) => {
    const b = grayPNG(256, 256, px), f = path.join(OUT, String(z), String(x), y + '.png');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); S.bytes[z] = (S.bytes[z] || 0) + b.length; S.n[z] = (S.n[z] || 0) + 1;
  };
  if (fs.existsSync(OUT) && !LIMIT) fs.rmSync(OUT, { recursive: true });
  let lvl = new Map(), done = 0;
  await pool(L, 4, async ([x, y]) => {
    const m = mask(x, y); let any = false; for (let i = 0; i < 65536 && !any; i++) any = m[i] >= 0;
    if (++done % 50 === 0) console.log(`  ซูม 13: ${done}/${L.length} · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
    if (!any) return;
    const use = (i, j) => m[j * 256 + i] >= 0, [pt, ps] = await Promise.all([loadFor(dtm, ZMAX, x, y, use), loadFor(dsm, ZMAX, x, y, use)]);
    const px = new Uint8Array(65536).fill(ND);
    for (let j = 0; j < 256; j++) {
      const la = y2lat(y + (j + .5) / 256, ZMAX), a = (40075016.686 * Math.cos(la * Math.PI / 180) / (256 * 2 ** ZMAX)) ** 2 / 1600;
      for (let i = 0; i < 256; i++) {
        const k = j * 256 + i, fi = m[k]; if (fi < 0) continue;
        const t = at(pt, ZMAX, x, y, i, j), s = at(ps, ZMAX, x, y, i, j);
        if (!Number.isFinite(t) || !Number.isFinite(s)) { nd[fi] += a; continue }
        const h = Math.min(HMAX, Math.max(0, s - t)); px[k] = Math.round(h); st[fi][cls(h)] += a;
      }
    }
    lvl.set(x + ',' + y, px); write(ZMAX, x, y, px);
  });
  const W = [...lvl.keys()].map(k => k.split(',').map(Number));
  const ix = { v: 1, src: 'GEM-15 v1 DSM−DTM (Google, CC-BY 4.0)', built: new Date().toISOString().slice(0, 10), ver: new Date().toISOString(), /* ver = รุ่นไทล์ (หน้าเว็บต่อท้าย ?v= กันแคชไทล์เก่า) */ zmin: ZMIN, zmax: ZMAX, hmax: HMAX, cl: CL, rows: {}, st: {}, nd: {} };
  for (const [x, y] of W) (ix.rows[y] = ix.rows[y] || []).push(x);
  for (const y in ix.rows) { const X = ix.rows[y].sort((a, b) => a - b), R = []; for (const x of X) { if (R.length && R[R.length - 1] === x - 1) R[R.length - 1] = x; else R.push(x, x) } ix.rows[y] = R }
  F.forEach((f, i) => { if (st[i].some(v => v)) { ix.st[f.name] = st[i].map(v => Math.round(v)); ix.nd[f.name] = Math.round(nd[i]) } });
  // ซูมต่ำลง: เฉลี่ย 2×2 เฉพาะพิกเซลที่มีค่า (ไม่มีเลย = 255)
  for (let z = ZMAX - 1; z >= ZMIN; z--) {
    const P = new Set(); for (const k of lvl.keys()) { const [x, y] = k.split(',').map(Number); P.add((x >> 1) + ',' + (y >> 1)) }
    const next = new Map();
    for (const k of P) {
      const [x, y] = k.split(',').map(Number), px = new Uint8Array(65536).fill(ND);
      for (let q = 0; q < 4; q++) {
        const c = lvl.get((2 * x + (q & 1)) + ',' + (2 * y + (q >> 1))), ox = (q & 1) * 128, oy = (q >> 1) * 128; if (!c) continue;
        for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
          let s = 0, n = 0; for (const o of [(2 * j) * 256 + 2 * i, (2 * j) * 256 + 2 * i + 1, (2 * j + 1) * 256 + 2 * i, (2 * j + 1) * 256 + 2 * i + 1]) if (c[o] !== ND) { s += c[o]; n++ }
          if (n) px[(oy + j) * 256 + ox + i] = Math.round(s / n);
        }
      }
      next.set(k, px); write(z, x, y, px);
    }
    lvl = next;
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(ix));
  const kb = n => (n / 1024).toFixed(0), tot = Object.entries(ix.st).filter(([n]) => !/^พื้นที่เฝ้าระวังพิเศษ /.test(n)).map(([, v]) => v).flat().reduce((a, b) => a + b, 0);
  for (const z of Object.keys(S.n)) console.log(`ซูม ${z}: ${S.n[z]} แผ่น ${kb(S.bytes[z])} KB (เฉลี่ย ${kb(S.bytes[z] / S.n[z])} KB)`);
  for (const [n, v] of Object.entries(ix.st)) { const s = v.reduce((a, b) => a + b, 0); console.log(`  ${n}: ${Math.round(s).toLocaleString()} ไร่ · ${v.map(x => Math.round(x / s * 100) + '%').join(' ')} · ไม่มีข้อมูล ${ix.nd[n].toLocaleString()} ไร่`) }
  console.log(`รวม ${(Object.values(S.bytes).reduce((a, b) => a + b, 0) / 1048576).toFixed(1)} MB · ในแนวเขต (ไม่รวมพื้นที่เฝ้าระวังพิเศษ) มีค่า ${Math.round(tot).toLocaleString()} ไร่ · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
})().catch(e => { console.error(e); process.exit(1) });
