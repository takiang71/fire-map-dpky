#!/usr/bin/env node
// สร้างไทล์ความสูง Terrarium (PNG 256 px, Web Mercator) ของกลุ่มป่าจาก GEM-15 ของ Google (DTM = พื้นดินไม่รวมยอดไม้ 15 ม.)
// ที่มา: https://developers.google.com/earth-engine/datasets/catalog/projects_climate-and-sustainability_assets_gem-15_v1
//   ไฟล์ COG สาธารณะ gs://climate-and-sustainability/gem-15 (storage.googleapis.com) · CC-BY 4.0 "This dataset is produced by Google"
//   ความสูงอ้างอิงจีออยด์ EGM96 เท่ากับ Terrarium (SRTM) ที่เว็บใช้เดิม
// รันมือ (ไม่อยู่ใน workflow): node scripts/build_dem15.js [--out data/dem15] [--cache <โฟลเดอร์>] [--buf 4] [--blend 96] [--q 0.25] [--zmin 10] [--limit N] [--dry]
//   ครั้งแรกดึงแผ่น DTM ~300 MB เก็บใน --cache (ค่าเริ่มต้น <tmp>/gem15, ไม่ commit) ครั้งต่อไปใช้แคช
// ผล: <out>/{z}/{x}/{y}.png ซูม zmin–13 เฉพาะไทล์ที่ห่างแนวเขตพื้นที่อนุรักษ์ (data/geo.json) ไม่เกิน --buf กม. + <out>/index.json
//   ขอบชุดไทล์ ค่อยๆ ผสมกับ Terrarium (AWS) ในระยะ --blend พิกเซลซูม 13 (ไม่เกิดขั้นบันไดตรงรอยต่อ) · พิกเซลที่ GEM-15 ไม่มีค่า (ผิวน้ำ) ใช้ค่า AWS
//   หน้าเว็บ: demURL()/โปรโตคอล dem15:// เลือกไทล์ในชุดนี้ก่อน นอกชุดใช้ AWS → docs/arch/data-sources.md
const fs = require('fs'), path = require('path'), os = require('os');
const { openCOG } = require('./lib/cog');
const { llToUTM } = require('./lib/tiff');
const { readPNG, rgbPNG, terrariumRGB } = require('./lib/png');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] };
const OUT = path.resolve(ROOT, arg('out', 'data/dem15')), CACHE = arg('cache', process.env.GEM15_CACHE || path.join(os.tmpdir(), 'gem15')),
  BUF = +arg('buf', 4), BLEND = +arg('blend', 96), Q = +arg('q', 0.25), ZMIN = +arg('zmin', 10), LIMIT = +arg('limit', 0), DRY = process.argv.includes('--dry'), ZMAX = 13;
const GCS = 'https://storage.googleapis.com/climate-and-sustainability/gem-15/';
const AWS = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';

// ---------- พิกัดไทล์ ----------
const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z };
const x2lon = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;

// ---------- ชุดไทล์ซูม 13: ห่างแนวเขตไม่เกิน BUF กม. ----------
function tileSet() {
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'geo.json'), 'utf8')), rings = [];
  for (const f of G.cons.features) { const g = f.geometry, P = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; for (const p of P) for (const r of p) rings.push(r) }
  let b = [180, 90, -180, -90]; for (const r of rings) for (const [x, y] of r) { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] }
  const kx = 111320 * Math.cos(14 * Math.PI / 180), ky = 110574, d = BUF * 1000;
  // ระยะจากจุดถึงขอบรูป (ม.) และอยู่ในรูปหรือไม่ (นับคู่/คี่ทุกวง)
  function dist(lon, lat) {
    let m = Infinity, inside = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = (r[j][0] - lon) * kx, ay = (r[j][1] - lat) * ky, bx = (r[i][0] - lon) * kx, by = (r[i][1] - lat) * ky;
      if ((ay > 0) !== (by > 0) && 0 < ax + (bx - ax) * (0 - ay) / (by - ay)) inside = !inside;
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      m = Math.min(m, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return inside ? 0 : m;
  }
  const S = new Set(), x0 = Math.floor(lon2x(b[0] - 0.1, ZMAX)), x1 = Math.floor(lon2x(b[2] + 0.1, ZMAX)), y0 = Math.floor(lat2y(b[3] + 0.1, ZMAX)), y1 = Math.floor(lat2y(b[1] - 0.1, ZMAX));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const lo = x2lon(x + .5, ZMAX), la = y2lat(y + .5, ZMAX), hw = (x2lon(x + 1, ZMAX) - x2lon(x, ZMAX)) / 2 * kx, hh = (y2lat(y, ZMAX) - y2lat(y + 1, ZMAX)) / 2 * ky;
    if (dist(lo, la) <= Math.hypot(hw, hh) + d) S.add(x + ',' + y);
  }
  return S;
}

// ---------- แหล่ง GEM-15 (แผ่น 1°×1° ตั้งชื่อ w<ลองจิจูด>s<ละติจูด> ตามมุมล่างซ้าย) ----------
const SRC = {};
function src(lon, lat) {
  const a = Math.floor(lon), b = Math.floor(lat), k = `w${a}s${b}`;
  return SRC[k] || (SRC[k] = openCOG(`${GCS}p${Math.floor(b / 10) * 10}_p${Math.floor(a / 10) * 10}/${k}/dtm/zall/mosaic.tif`, { cache: CACHE, key: 'dtm_' + k }).catch(e => { console.warn('ไม่มีแผ่น', k, e.message); return null }));
}
// ความสูงแบบ bilinear ที่ (lon,lat) จากแผ่นที่โหลดไว้แล้ว (L = Map 'tx,ty' → Float32Array) · ค่า NaN ข้ามแล้วถ่วงน้ำหนักที่เหลือ
function sample(c, L, lon, lat) {
  const [E, N] = llToUTM(lon, lat, c.zone), fx = (E - c.e0) / c.px - .5, fy = (c.n0 - N) / c.py - .5, ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
  let s = 0, w = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const X = ix + i, Y = iy + j, t = L.get(Math.floor(X / c.tw) + ',' + Math.floor(Y / c.th)); if (!t) continue;
    const v = t[((Y % c.th) * c.tw + (X % c.tw)) * c.spp]; if (!Number.isFinite(v)) continue;
    const k = (i ? ax : 1 - ax) * (j ? ay : 1 - ay); s += v * k; w += k;
  }
  return w > 1e-6 ? s / w : NaN;
}
const need = (c, lon, lat, out) => { const [E, N] = llToUTM(lon, lat, c.zone), X = Math.floor((E - c.e0) / c.px), Y = Math.floor((c.n0 - N) / c.py); for (const dx of [-20, 0, 20]) for (const dy of [-20, 0, 20]) { const tx = Math.floor((X + dx) / c.tw), ty = Math.floor((Y + dy) / c.th); if (tx >= 0 && ty >= 0 && tx < c.ntx && ty < c.nty) out.add(tx + ',' + ty) } };

// ---------- Terrarium (AWS) สำหรับเติม/ผสมขอบ ----------
async function aws(z, x, y) {
  const f = path.join(CACHE, 'aws', `${z}_${x}_${y}.png`);
  let buf; try { buf = fs.readFileSync(f) } catch (e) {
    for (let k = 0; ; k++) {
      try { const r = await fetch(`${AWS}${z}/${x}/${y}.png`, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error('HTTP ' + r.status); buf = Buffer.from(await r.arrayBuffer()); break }
      catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 2000 * (k + 1))) }
    }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
  }
  const d = readPNG(buf).rgba, e = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) e[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  return e;
}

// ---------- ไทล์ซูม 13 ----------
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
async function tile13(x, y, S, st) {
  const z = ZMAX, e = new Float32Array(65536), lon = i => x2lon(x + (i + .5) / 256, z), lat = j => y2lat(y + (j + .5) / 256, z);
  // แผ่นต้นทางที่ต้องใช้ (ทุกพิกเซลอาจอยู่คนละแผ่น 1° → จัดกลุ่มตามแผ่น)
  const per = new Map();
  for (let j = 0; j < 256; j += 15) for (let i = 0; i < 256; i += 15) for (const [jj, ii] of [[j, i], [Math.min(j + 15, 255), Math.min(i + 15, 255)], [j, Math.min(i + 15, 255)], [Math.min(j + 15, 255), i]]) {
    const lo = lon(ii), la = lat(jj), c = await src(lo, la); if (!c) continue;
    const k = Math.floor(lo) + ',' + Math.floor(la); if (!per.has(k)) per.set(k, { c, n: new Set(), L: new Map() }); need(c, lo, la, per.get(k).n);
  }
  for (const p of per.values()) await Promise.all([...p.n].map(async k => { const [tx, ty] = k.split(',').map(Number); const t = await p.c.tile(tx, ty); if (t) p.L.set(k, t) }));
  let nan = 0;
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const lo = lon(i), la = lat(j), p = per.get(Math.floor(lo) + ',' + Math.floor(la));
    const v = p ? sample(p.c, p.L, lo, la) : NaN; e[j * 256 + i] = v; if (!Number.isFinite(v)) nan++;
  }
  // น้ำหนัก GEM-15: ระยะ (พิกเซล) ถึงไทล์เพื่อนบ้านที่ไม่อยู่ในชุด
  const out = []; for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if ((dx || dy) && !S.has((x + dx) + ',' + (y + dy))) out.push([dx, dy]);
  const wgt = (i, j) => { let m = Infinity; for (const [dx, dy] of out) { const ex = dx < 0 ? i + .5 : dx > 0 ? 255.5 - i : 0, ey = dy < 0 ? j + .5 : dy > 0 ? 255.5 - j : 0; m = Math.min(m, dx && dy ? Math.hypot(ex, ey) : dx ? ex : ey) } return smooth(m / BLEND) };
  const edge = out.length > 0 && BLEND > 0, A = nan || edge ? await aws(z, x, y) : null;
  if (A) for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const k = j * 256 + i, w = edge ? wgt(i, j) : 1, v = e[k];
    e[k] = Number.isFinite(v) ? w * v + (1 - w) * A[k] : A[k];
  }
  st.nan += nan; if (A) st.aws++;
  return e;
}

// ---------- ซูมต่ำลง: เฉลี่ย 2×2 จากไทล์ลูก (ลูกที่ไม่อยู่ในชุดใช้ค่า AWS ซูมเดียวกับแม่) ----------
async function parentTile(z, x, y, kids) {
  const e = new Float32Array(65536); let A = null;
  for (let q = 0; q < 4; q++) {
    const cx = 2 * x + (q & 1), cy = 2 * y + (q >> 1), c = kids.get(cx + ',' + cy), ox = (q & 1) * 128, oy = (q >> 1) * 128;
    if (!c && !A) A = await aws(z, x, y);
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
      const k = (oy + j) * 256 + ox + i;
      e[k] = c ? (c[(2 * j) * 256 + 2 * i] + c[(2 * j) * 256 + 2 * i + 1] + c[(2 * j + 1) * 256 + 2 * i] + c[(2 * j + 1) * 256 + 2 * i + 1]) / 4 : A[k];
    }
  }
  return e;
}

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } })) }

(async () => {
  const t0 = Date.now(), S = tileSet();
  let L = [...S].map(k => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  console.log(`ไทล์ซูม 13 ในชุด ${L.length} แผ่น (ห่างแนวเขต ≤${BUF} กม.)`);
  if (LIMIT) L = L.slice(Math.floor(L.length / 2), Math.floor(L.length / 2) + LIMIT);
  if (DRY) return;
  const st = { nan: 0, aws: 0, bytes: {}, n: {} }, write = (z, x, y, e) => {
    const b = rgbPNG(256, 256, terrariumRGB(e, Q)), f = path.join(OUT, String(z), String(x), y + '.png');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); st.bytes[z] = (st.bytes[z] || 0) + b.length; st.n[z] = (st.n[z] || 0) + 1;
  };
  if (fs.existsSync(OUT) && !LIMIT) fs.rmSync(OUT, { recursive: true });
  let lvl = new Map(), done = 0, row = null;
  await pool(L, 6, async ([x, y]) => {
    const e = await tile13(x, y, S, st); lvl.set(x + ',' + y, e); write(ZMAX, x, y, e);
    if (++done % 50 === 0) console.log(`  ซูม 13: ${done}/${L.length} · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
    if (row !== y) { row = y; if (done % 200 === 0) for (const p of Object.values(SRC)) { const c = await p; c && c.drop() } }
  });
  const ix = { v: 1, src: 'GEM-15 v1 DTM (Google, CC-BY 4.0)', built: new Date().toISOString().slice(0, 10), q: Q, buf: BUF, blend: BLEND, zmin: ZMIN, zmax: ZMAX, rows: {} };
  for (const [x, y] of L) (ix.rows[y] = ix.rows[y] || []).push(x);
  for (const y in ix.rows) { const X = ix.rows[y].sort((a, b) => a - b), R = []; for (const x of X) { if (R.length && R[R.length - 1] === x - 1) R[R.length - 1] = x; else R.push(x, x) } ix.rows[y] = R }
  for (let z = ZMAX - 1; z >= ZMIN; z--) {
    const P = new Map(); for (const k of lvl.keys()) { const [x, y] = k.split(',').map(Number); P.set((x >> 1) + ',' + (y >> 1), 1) }
    const next = new Map();
    await pool([...P.keys()], 6, async k => { const [x, y] = k.split(',').map(Number), e = await parentTile(z, x, y, lvl); next.set(k, e); write(z, x, y, e) });
    lvl = next;
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(ix));
  const kb = n => (n / 1024).toFixed(0);
  for (const z of Object.keys(st.n)) console.log(`ซูม ${z}: ${st.n[z]} แผ่น ${kb(st.bytes[z])} KB (เฉลี่ย ${kb(st.bytes[z] / st.n[z])} KB)`);
  console.log(`รวม ${(Object.values(st.bytes).reduce((a, b) => a + b, 0) / 1048576).toFixed(1)} MB · พิกเซลไม่มีค่า (ใช้ AWS) ${st.nan} · ไทล์ที่ใช้ AWS ${st.aws} · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
})().catch(e => { console.error(e); process.exit(1) });
