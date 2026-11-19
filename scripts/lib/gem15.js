// ตัวช่วยร่วมของ GEM-15 (Google): พิกัดไทล์เมอร์เคเตอร์, แนวเขตพื้นที่อนุรักษ์, ชุดไทล์ซูม 13, เปิดแผ่น COG และสุ่มค่า bilinear
// ใช้กับ scripts/build_dem15.js (ความสูงพื้นดิน DTM) และ scripts/build_chm15.js (ความสูงเรือนยอด DSM−DTM)
const fs = require('fs'), path = require('path');
const { openCOG } = require('./cog');
const { llToUTM } = require('./tiff');

const GCS = 'https://storage.googleapis.com/climate-and-sustainability/gem-15/';
const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z };
const x2lon = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;

// แนวเขตพื้นที่อนุรักษ์ (data/geo.json → cons) เป็น [{name, rings:[[[lon,lat],…],…]}]
function consFeatures(root) {
  const G = JSON.parse(fs.readFileSync(path.join(root, 'data', 'geo.json'), 'utf8'));
  return G.cons.features.map(f => { const g = f.geometry, P = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; return { name: f.properties.name, rings: P.flat() } });
}

// ชุดไทล์ซูม z (Set 'x,y') ที่ห่างแนวเขตไม่เกิน buf กม.
function tileSet(F, buf, z = 13) {
  const rings = F.flatMap(f => f.rings);
  let b = [180, 90, -180, -90]; for (const r of rings) for (const [x, y] of r) { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] }
  const kx = 111320 * Math.cos(14 * Math.PI / 180), ky = 110574, d = buf * 1000;
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
  const S = new Set(), x0 = Math.floor(lon2x(b[0] - 0.1, z)), x1 = Math.floor(lon2x(b[2] + 0.1, z)), y0 = Math.floor(lat2y(b[3] + 0.1, z)), y1 = Math.floor(lat2y(b[1] - 0.1, z));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const lo = x2lon(x + .5, z), la = y2lat(y + .5, z), hw = (x2lon(x + 1, z) - x2lon(x, z)) / 2 * kx, hh = (y2lat(y, z) - y2lat(y + 1, z)) / 2 * ky;
    if (dist(lo, la) <= Math.hypot(hw, hh) + d) S.add(x + ',' + y);
  }
  return S;
}

// หน้ากากแนวเขตของไทล์ (z,x,y) 256×256 แบบ scanline คู่/คี่ → Int8Array: ลำดับพื้นที่ในอาร์เรย์ F หรือ -1 (นอกแนวเขต · ซ้อนกัน = รูปแรก)
function maskFn(F, z = 13) {
  const W = 256 * 2 ** z, rows = new Map();
  F.forEach((f, fi) => f.rings.forEach(r => {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = lon2x(r[j][0], z) * 256, ay = lat2y(r[j][1], z) * 256, bx = lon2x(r[i][0], z) * 256, by = lat2y(r[i][1], z) * 256;
      if (ay === by) continue;
      const e = { fi, ax, ay, bx, by };
      for (let t = Math.floor(Math.min(ay, by) / 256); t <= Math.floor(Math.max(ay, by) / 256); t++) (rows.get(t) || rows.set(t, []).get(t)).push(e);
    }
  }));
  return (x, y) => {
    const m = new Int8Array(65536).fill(-1), E = rows.get(y) || [];
    if (!E.length) return m;
    for (let j = 0; j < 256; j++) {
      const gy = y * 256 + j + .5, X = new Map();
      for (const e of E) if ((e.ay > gy) !== (e.by > gy)) { const gx = e.ax + (gy - e.ay) / (e.by - e.ay) * (e.bx - e.ax); (X.get(e.fi) || X.set(e.fi, []).get(e.fi)).push(gx - x * 256) }
      for (const [fi, L] of [...X].sort((a, b) => a[0] - b[0])) {
        L.sort((a, b) => a - b);
        for (let k = 0; k + 1 < L.length; k += 2) {
          const a = Math.max(0, Math.ceil(L[k] - .5)), b = Math.min(255, Math.floor(L[k + 1] - .5));
          for (let i = a; i <= b; i++) if (m[j * 256 + i] < 0) m[j * 256 + i] = fi;
        }
      }
    }
    return m;
  };
}

// ตัวเปิดแผ่น GEM-15 ชนิด kind ('dtm' | 'dsm') ตามพิกัด (แผ่น 1°×1° ชื่อ w<ลองจิจูด>s<ละติจูด> ตามมุมล่างซ้าย)
function gemSrc(kind, opt = {}) {
  const SRC = {};
  const src = (lon, lat) => {
    const a = Math.floor(lon), b = Math.floor(lat), k = `w${a}s${b}`;
    return SRC[k] || (SRC[k] = openCOG(`${GCS}p${Math.floor(b / 10) * 10}_p${Math.floor(a / 10) * 10}/${k}/${kind}/zall/mosaic.tif`, { cache: opt.cache, key: kind + '_' + k, max: opt.max }).catch(e => { console.warn('ไม่มีแผ่น', kind, k, e.message); return null }));
  };
  src.all = () => Object.values(SRC);
  return src;
}

// ค่าแบบ bilinear ที่ (lon,lat) แบนด์ 0 จากแผ่นที่โหลดแล้ว (L = Map 'tx,ty' → Float32Array) · NaN ข้ามแล้วถ่วงน้ำหนักที่เหลือ
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
// แผ่นต้นทางที่ต้องใช้รอบจุด (±20 px ≈ 300 ม. — สุ่มจุดห่าง ≤15 px ซูม 13 จึงไม่ตกแผ่น)
const need = (c, lon, lat, out) => { const [E, N] = llToUTM(lon, lat, c.zone), X = Math.floor((E - c.e0) / c.px), Y = Math.floor((c.n0 - N) / c.py); for (const dx of [-20, 0, 20]) for (const dy of [-20, 0, 20]) { const tx = Math.floor((X + dx) / c.tw), ty = Math.floor((Y + dy) / c.th); if (tx >= 0 && ty >= 0 && tx < c.ntx && ty < c.nty) out.add(tx + ',' + ty) } };

// โหลดแผ่นที่ไทล์ (z,x,y) ต้องใช้ → Map 'lon,lat' (ทศนิยมตัด) → {c, L} · use(i,j) = พิกเซลนี้ต้องใช้ไหม (ไม่ส่ง = ทุกพิกเซล)
async function loadFor(src, z, x, y, use) {
  const per = new Map(), lon = i => x2lon(x + (i + .5) / 256, z), lat = j => y2lat(y + (j + .5) / 256, z), N = new Map();
  for (let j = 0; j < 256; j += 15) for (let i = 0; i < 256; i += 15) for (const [jj, ii] of [[j, i], [Math.min(j + 15, 255), Math.min(i + 15, 255)], [j, Math.min(i + 15, 255)], [Math.min(j + 15, 255), i]]) {
    if (use && !use(ii, jj)) continue;
    const lo = lon(ii), la = lat(jj), c = await src(lo, la); if (!c) continue;
    const k = Math.floor(lo) + ',' + Math.floor(la); if (!per.has(k)) { per.set(k, { c, L: new Map() }); N.set(k, new Set()) } need(c, lo, la, N.get(k));
  }
  for (const [k, p] of per) await Promise.all([...N.get(k)].map(async q => { const [tx, ty] = q.split(',').map(Number); const t = await p.c.tile(tx, ty); if (t) p.L.set(q, t) }));
  return per;
}
// ค่าที่พิกเซล (i,j) ของไทล์ (z,x,y) จาก per ของ loadFor
function at(per, z, x, y, i, j) {
  const lo = x2lon(x + (i + .5) / 256, z), la = y2lat(y + (j + .5) / 256, z), p = per.get(Math.floor(lo) + ',' + Math.floor(la));
  return p ? sample(p.c, p.L, lo, la) : NaN;
}

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } })) }

module.exports = { GCS, lon2x, lat2y, x2lon, y2lat, consFeatures, tileSet, maskFn, gemSrc, sample, need, loadFor, at, pool };
