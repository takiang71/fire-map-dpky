// ชั้นชนิดป่า (กรมป่าไม้ "โครงการจัดทำข้อมูลสภาพพื้นที่ป่าไม้และชนิดป่า ปี พ.ศ. 2568") → data/ftype/ftype.json
// รันมือ: node scripts/build_ftype.js [--shp <ไฟล์ .shp ไม่ต้องใส่นามสกุล>]
//
// กรมป่าไม้เผยแพร่ shapefile แค่ "ป่า/ไม่ใช่ป่า" (fcode 10/90) ส่วนชนิดป่ามีเป็นภาพแผนที่รายจังหวัดในรายงานฉบับสมบูรณ์ (ภาพผนวก)
// จึงประกอบจากสองส่วน:
//  1) ภาพแผนที่ชนิดป่ารายจังหวัด data/ftype/src/<จังหวัด>.tiff (หน้าในรายงาน 1191×1684 px) → ตั้งพิกัดจากเส้นกริด UTM ในภาพ
//     (ตำแหน่งเส้นกริดวัดจากภาพ — ตรงกับค่า UTM ที่ขอบแผนที่ คลาดไม่เกิน ~120 ม.) แล้วแยกสีตามคำอธิบายสัญลักษณ์ของแต่ละภาพ
//  2) shapefile ป่าไม้ 2568 (fcode 10) ทำเป็นราสเตอร์ 100 ม. → ขอบป่าคมตามข้อมูลจริง ภาพแผนที่ใช้บอกแค่ "ป่าตรงนี้เป็นชนิดไหน"
// ส่วนที่ภาพบอกไม่ได้ (ใต้ป้ายชื่ออำเภอ ขอบภาพ จังหวัดที่ไม่มีภาพ) เติมด้วยชนิดที่ใกล้สุด: 1 = ผืนป่าเดียวกัน (เดินผ่านเซลล์ป่า), 2 = ข้ามผืน
// ภาพหยาบ 90–290 ม./px (นครราชสีมา/บุรีรัมย์หยาบสุด) — พอจำแนกพื้นที่และเลือกเชื้อเพลิงให้โมเดลไฟ ไม่ใช่ตัวเลขพื้นที่ทางการ
//
// ผล: { z:47, x0,y0 (มุมซ้ายบน UTM), px:100, w,h, cn[], col[], r: แถวละ run-length [ยาว,ค่า,…]
//       (ค่า = ชนิด | ระดับการเติม<<4 | 128 ถ้าอยู่ในแนวเขต cons/resp · 0 = ไม่ใช่ป่า — กริดครอบป่านอกแนวเขตด้วย ใช้กับโมเดลไฟ/ป๊อปอัป),
//       ar[], st[], s:{"ar|st":[ไร่ต่อชนิด]}, e:[ไร่เติมผืนเดียวกัน, ไร่เติมข้ามผืน] }
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), { execFileSync } = require('child_process');
const { lzw, utmToLL, llToUTM } = require('./lib/tiff');
const { ROOT, GEO } = require('./lib/area');
const { ARN, STN, rasterize, writeSafe } = require('./lib/tamroypao');

const SRC = path.join(ROOT, 'data', 'ftype', 'src'), OUT = path.join(ROOT, 'data', 'ftype', 'ftype.json'), PX = 100, RAI = PX * PX / 1600;
// ชนิดป่าและสีตามคำอธิบายสัญลักษณ์ในรายงาน (index 1 = แหล่งน้ำ ใช้แยกสีเท่านั้น ไม่ลงผล)
const CL = [null, ['แหล่งน้ำ', 0, 168, 230], ['ป่าดิบชื้น', 38, 115, 0], ['ป่าดิบแล้ง', 56, 168, 0], ['ป่าดิบเขา', 76, 230, 0], ['ป่าบึงน้ำจืด', 255, 85, 0],
  ['ป่าเบญจพรรณ', 168, 112, 0], ['ป่าเต็งรัง', 230, 152, 0], ['ป่าไผ่', 255, 211, 127], ['สวนป่าสัก', 230, 230, 0], ['สวนป่าอื่น ๆ', 245, 122, 182],
  ['ป่าที่ฟื้นฟูตามธรรมชาติ', 68, 79, 137], ['ป่าทุ่ง', 255, 255, 115], ['สังคมพืชลานหิน', 194, 158, 215]];
// ภาพรายจังหวัด: โซน UTM, ค่า UTM ของเส้นกริดเส้นแรก + ระยะห่าง, ตำแหน่ง px ของเส้นกริดแนวตั้ง (vl) และแนวนอน (hl) จากบนลงล่าง,
// al = ชนิดที่มีในคำอธิบายสัญลักษณ์ของภาพนั้น (จำกัดไว้ กันขอบตัวอักษร/เส้นเขตถูกอ่านเป็นชนิดที่ไม่มีในภาพ)
const MAPS = {
  'ปราจีนบุรี': { z: 47, E0: 740000, N0: 1598000, d: 18000, vl: [346.5, 465, 584, 703, 822, 940], hl: [381.5, 500, 619, 738, 856.5, 975], al: [1, 3, 4, 6, 7, 9, 11, 12, 13] },
  'นครนายก': { z: 47, E0: 710000, N0: 1600000, d: 10000, vl: [325, 433, 540.5, 648.5, 756, 864, 972], hl: [415.5, 523.5, 631, 739, 847, 955], al: [1, 3, 4, 6, 11, 12, 13] },
  'สระบุรี': { z: 47, E0: 665000, N0: 1685000, d: 15000, vl: [328, 416, 503, 591, 678.5, 766, 853.5, 941], hl: [316.5, 404, 491.5, 579, 666.5, 754, 842, 929, 1017], al: [1, 3, 6, 8, 9, 11] },
  'นครราชสีมา': { z: 47, E0: 740000, N0: 1760000, d: 30000, vl: [312, 415, 518, 621, 724, 827, 930], hl: [333, 436.5, 539.5, 642.5, 746, 849, 952, 1055], al: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  'สระแก้ว': { z: 48, E0: 160000, N0: 1580000, d: 20000, vl: [281.5, 399, 517, 635, 753, 871, 989], hl: [318, 435.5, 553.5, 671, 789, 907, 1025], al: [1, 2, 3, 6, 7, 8, 9, 10, 11, 13] },
  'บุรีรัมย์': { z: 48, E0: 200000, N0: 1724000, d: 34000, vl: [331, 456, 580.5, 705, 830, 955], hl: [433, 557, 682, 807, 932, 1056], al: [1, 3, 5, 6, 7, 9, 11] },
};
const FR = [255, 308, 1008, 1063]; // กรอบแผนที่ในภาพ (ด้านใน)

// อ่าน TIFF RGB 8 บิต (ภาพหน้าในรายงาน: LZW, strip, ช่องสลับ) → Buffer w*h*3
function rgbTiff(f) {
  const b = fs.readFileSync(f), u16 = o => b.readUInt16LE(o), u32 = o => b.readUInt32LE(o), ifd = u32(4), T = {};
  for (let i = 0; i < u16(ifd); i++) { const e = ifd + 2 + i * 12, tag = u16(e), typ = u16(e + 2), n = u32(e + 4), sz = typ === 3 ? 2 : 4, off = n * sz <= 4 ? e + 8 : u32(e + 8); T[tag] = Array.from({ length: n }, (_, k) => typ === 3 ? u16(off + k * 2) : u32(off + k * 4)) }
  const w = T[256][0], h = T[257][0], ch = T[277][0], rps = (T[278] || [h])[0], out = Buffer.alloc(w * h * 3);
  if (T[258][0] !== 8 || ch < 3) throw new Error(f + ': ต้องเป็น RGB 8 บิต');
  T[273].forEach((o, s) => {
    let d = b.subarray(o, o + T[279][s]); d = T[259][0] === 5 ? lzw(d) : T[259][0] === 8 ? zlib.inflateSync(d) : d;
    for (let r = 0; r < Math.min(rps, h - s * rps); r++) for (let x = 0; x < w; x++) { const i = r * w * ch + x * ch, j = ((s * rps + r) * w + x) * 3; out[j] = d[i]; out[j + 1] = d[i + 1]; out[j + 2] = d[i + 2] }
  });
  return { w, h, d: out };
}
// ถดถอยเชิงเส้น ตำแหน่ง px ของเส้นกริด → ค่า UTM
const fit = (ps, v0, st) => { const n = ps.length, ys = ps.map((_, i) => v0 + i * st), mx = ps.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; ps.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2 }); const b = sxy / sxx; return { a: my - b * mx, b } };
// แยกสี: ใกล้สีในคำอธิบายสัญลักษณ์ (ไม่เกิน 45 ต่อช่อง) · ตัดสีเทา/ขาว/ดำ · ตัดเส้นบาง (ชนิดเดียวกันใน 5×5 น้อยกว่า 7 px;
// ป่าดิบชื้นต้องหนากว่า 16 px เพราะเส้นเขตสีดำทับป่าดิบแล้งให้สีใกล้ป่าดิบชื้น)
function classify(img, al) {
  const { w, d } = img, c = new Uint8Array(w * img.h), o = new Uint8Array(w * img.h);
  for (let y = FR[1] - 1; y <= FR[3] + 1; y++) for (let x = FR[0] - 1; x <= FR[2] + 1; x++) {
    const i = (y * w + x) * 3, r = d[i], g = d[i + 1], b = d[i + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) < 40) continue;
    let best = 0, bd = 45 * 45 * 3; for (const k of al) { const e = (r - CL[k][1]) ** 2 + (g - CL[k][2]) ** 2 + (b - CL[k][3]) ** 2; if (e < bd) { bd = e; best = k } } c[y * w + x] = best;
  }
  for (let y = FR[1]; y <= FR[3]; y++) for (let x = FR[0]; x <= FR[2]; x++) {
    const v = c[y * w + x]; if (v < 2) { o[y * w + x] = v; continue }
    let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (c[(y + dy) * w + x + dx] === v) n++;
    o[y * w + x] = n < (v === 2 ? 16 : 7) ? 0 : v;
  }
  return o;
}
// ชนิดป่าที่พิกัด UTM47 จากภาพหนึ่ง: พิกเซลตรงตัว หรือค้นรอบๆ ไม่เกิน ~1.2 กม. (ป้ายชื่ออำเภอ) เอาชนิดที่พบมากสุดในวงแรกที่เจอ · -1 = นอกกรอบภาพ
function look(m, E, N) {
  if (m.z !== 47) [E, N] = llToUTM(...utmToLL(E, N, 47), m.z);
  const x = Math.floor((E - m.fx.a) / m.fx.b), y = Math.floor((N - m.fy.a) / m.fy.b), W = m.img.w;
  if (x < FR[0] || x > FR[2] || y < FR[1] || y > FR[3]) return -1;
  const v = m.c[y * W + x]; if (v > 1) return v;
  for (let r = 1, R = Math.round(1200 / m.fx.b) + 2; r <= R; r++) {
    const cnt = {}; let any = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const xx = x + dx, yy = y + dy;
      if (xx < FR[0] || xx > FR[2] || yy < FR[1] || yy > FR[3]) continue; const u = m.c[yy * W + xx]; if (u > 1) { cnt[u] = (cnt[u] || 0) + 1; any = 1 }
    }
    if (any) return +Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  }
  return 0;
}
// shapefile ป่าไม้ (ไม่ระบุ → แตก Forest_*.rar ในโฟลเดอร์ data/ข้อมูลโครงการ… ด้วย tar.exe ของ Windows ซึ่งอ่าน RAR ได้)
function shpPath() {
  const a = process.argv.indexOf('--shp'); if (a > 0) return process.argv[a + 1];
  const dir = fs.readdirSync(path.join(ROOT, 'data')).map(d => path.join(ROOT, 'data', d)).find(d => fs.statSync(d).isDirectory() && fs.readdirSync(d).some(f => /^Forest_.*\.rar$/i.test(f)));
  if (!dir) throw new Error('ไม่พบ shapefile ป่าไม้ — ใส่ --shp <ไฟล์> หรือวางโฟลเดอร์ที่มี Forest_*.rar ไว้ใน data/');
  const rar = path.join(dir, fs.readdirSync(dir).find(f => /^Forest_.*\.rar$/i.test(f))), tmp = path.join(os.tmpdir(), 'ftype_shp');
  let shp = fs.existsSync(tmp) && fs.readdirSync(tmp).find(f => /\.shp$/i.test(f));
  if (!shp) { fs.mkdirSync(tmp, { recursive: true }); console.log('แตกไฟล์', path.basename(rar), '→', tmp); execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', rar, '-C', tmp]); shp = fs.readdirSync(tmp).find(f => /\.shp$/i.test(f)) }
  return path.join(tmp, shp.replace(/\.shp$/i, ''));
}
// ราสเตอร์ป่าไม้ (fcode 10) บนกริด t — scanline แบบคู่-คี่ ทุกวงของแปลง (วงใน = รู) · shapefile เป็น UTM 47N อยู่แล้ว
function forestMask(F, t, mask) {
  const shx = fs.readFileSync(F + '.shx'), fd = fs.openSync(F + '.shp', 'r'), dbf = fs.readFileSync(F + '.dbf'), hl = dbf.readUInt16LE(8), rl = dbf.readUInt16LE(10);
  const n = (shx.length - 100) / 8, hdr = Buffer.alloc(44), X1 = t.x0 + t.w * PX, Y0 = t.y0 - t.h * PX; let used = 0;
  for (let i = 0; i < n; i++) {
    if (dbf.toString('latin1', hl + i * rl + 1, hl + i * rl + 3).trim() !== '10') continue;
    const off = shx.readInt32BE(100 + i * 8) * 2, len = shx.readInt32BE(104 + i * 8) * 2; fs.readSync(fd, hdr, 0, 44, off);
    const bb = [12, 20, 28, 36].map(o => hdr.readDoubleLE(o)); if (bb[0] > X1 || bb[2] < t.x0 || bb[1] > t.y0 || bb[3] < Y0) continue;
    const r = Buffer.alloc(len + 8); fs.readSync(fd, r, 0, len + 8, off); used++;
    const np = r.readInt32LE(44), nt = r.readInt32LE(48), parts = [], base = 52 + np * 4; for (let k = 0; k < np; k++) parts.push(r.readInt32LE(52 + k * 4)); parts.push(nt);
    const rings = []; for (let k = 0; k < np; k++) { const a = []; for (let j = parts[k]; j < parts[k + 1]; j++) a.push([(r.readDoubleLE(base + j * 16) - t.x0) / PX, (t.y0 - r.readDoubleLE(base + j * 16 + 8)) / PX]); rings.push(a) }
    for (let y = Math.max(0, Math.floor((t.y0 - bb[3]) / PX)); y <= Math.min(t.h - 1, Math.ceil((t.y0 - bb[1]) / PX)); y++) {
      const c = y + 0.5, xs = [];
      for (const q of rings) for (let a = 0, b = q.length - 1; a < q.length; b = a++) if ((q[a][1] > c) !== (q[b][1] > c)) xs.push(q[a][0] + (c - q[a][1]) * (q[b][0] - q[a][0]) / (q[b][1] - q[a][1]));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(t.w - 1, Math.floor(xs[k + 1] - 0.5)); if (b >= a) mask.fill(1, y * t.w + a, y * t.w + b + 1) }
    }
  }
  fs.closeSync(fd); return used;
}
// เติมชนิดที่ใกล้สุดด้วย BFS 8 ทิศ: inF = เดินได้เฉพาะเซลล์ป่า (ผืนเดียวกัน) · ไม่จำกัด = ข้ามผืน
function fillNearest(g, est, w, h, mark, inF) {
  const q = new Int32Array(w * h), own = new Uint8Array(w * h), seen = new Uint8Array(w * h); let a = 0, b = 0;
  for (let k = 0; k < w * h; k++) if (g[k] && g[k] !== 255) { q[b++] = k; seen[k] = 1; own[k] = g[k] }
  while (a < b) {
    const k = q[a++], x = k % w;
    for (const d of [-1, 1, -w, w, -w - 1, -w + 1, w - 1, w + 1]) {
      const n = k + d; if (n < 0 || n >= w * h || Math.abs(n % w - x) > 1 || seen[n] || (inF && g[n] !== 255)) continue;
      seen[n] = 1; own[n] = own[k]; if (g[n] === 255) { g[n] = own[k]; est[n] = mark } q[b++] = n;
    }
  }
}

(() => {
  const t0 = Date.now();
  // กริด 100 ม. ครอบแนวเขต cons+resp (UTM 47N)
  const bb = [1e9, 1e9, -1e9, -1e9];
  [...GEO.cons.features, ...GEO.resp.features].forEach(f => f.geometry.coordinates.forEach(p => p[0].forEach(([x, y]) => { const [E, N] = llToUTM(x, y, 47); bb[0] = Math.min(bb[0], E); bb[1] = Math.min(bb[1], N); bb[2] = Math.max(bb[2], E); bb[3] = Math.max(bb[3], N) })));
  const x0 = Math.floor(bb[0] / PX) * PX, y0 = Math.ceil(bb[3] / PX) * PX, w = Math.ceil((bb[2] - x0) / PX), h = Math.ceil((y0 - bb[1]) / PX), t = { w, h, x0, y0, px: [PX, PX] };
  const M = Object.entries(MAPS).map(([n, m]) => {
    const f = path.join(SRC, n + '.tiff'); if (!fs.existsSync(f)) { console.log('ไม่มีภาพ', n, '— ข้าม'); return null }
    m.n = n; m.img = rgbTiff(f); m.fx = fit(m.vl, m.E0, m.d); m.fy = fit(m.hl, m.N0, -m.d); m.c = classify(m.img, m.al); return m;
  }).filter(Boolean);
  console.log('ภาพ', M.map(m => `${m.n} ${m.fx.b.toFixed(0)} ม./px`).join(' · '));
  const shp = shpPath(), g = new Uint8Array(w * h);
  console.log('ป่าไม้ 2568:', forestMask(shp, t, g), 'แปลงทับกรอบ ·', w, '×', h, 'เซลล์');
  let known = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; if (!g[k]) continue; const E = x0 + (i + 0.5) * PX, N = y0 - (j + 0.5) * PX;
    let v = 0; for (const m of M) { const c = look(m, E, N); if (c > 1) { v = c; break } } g[k] = v || 255; if (v) known++;
  }
  const est = new Uint8Array(w * h), cnt = mk => est.reduce((s, e) => s + (e === mk), 0);
  fillNearest(g, est, w, h, 1, true); fillNearest(g, est, w, h, 2, false);
  const e = [cnt(1) * RAI, cnt(2) * RAI].map(Math.round);
  console.log(`ชนิดจากภาพ ${Math.round(known * RAI).toLocaleString()} ไร่ · เติมผืนเดียวกัน ${e[0].toLocaleString()} · ข้ามผืน ${e[1].toLocaleString()} ไร่`);
  // สถิติไร่ต่อชนิด แยกพื้นที่อนุรักษ์|สถานีฯ (ตรรกะเดียวกับ sync_burn/sync_fuel)
  const { ar, st } = rasterize(t, 47), s = {}, r = [];
  for (let k = 0; k < w * h; k++) if (g[k] && (ar[k] || st[k])) { const key = ar[k] + '|' + st[k], a = s[key] || (s[key] = Array(CL.length).fill(0)); a[g[k]] += RAI }
  for (const key in s) s[key] = s[key].map(v => Math.round(v));
  const val = k => g[k] ? g[k] | est[k] << 4 | (ar[k] || st[k] ? 128 : 0) : 0;
  for (let j = 0; j < h; j++) {
    const row = []; let i = 0;
    while (i < w) { const v = val(j * w + i); let n = 1; while (i + n < w && val(j * w + i + n) === v) n++; row.push(n, v); i += n }
    if (row.length === 2 && row[1] === 0) row.length = 0; r.push(row);
  }
  const hex = c => '#' + c.slice(1).map(v => v.toString(16).padStart(2, '0')).join('');
  const J = { v: 1, src: 'กรมป่าไม้ โครงการจัดทำข้อมูลสภาพพื้นที่ป่าไม้และชนิดป่า ปี พ.ศ. 2568', z: 47, x0, y0, px: PX, w, h,
    cn: CL.map(c => c ? c[0] : ''), col: CL.map(c => c ? hex(c) : ''), ar: ARN, st: STN, s, e, maps: M.map(m => m.n), r };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); writeSafe(OUT, JSON.stringify(J));
  const tot = Array(CL.length).fill(0); Object.values(s).forEach(a => a.forEach((v, i) => tot[i] += v));
  console.log(tot.map((v, i) => [v, i]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).map(([v, i]) => CL[i][0] + ' ' + v.toLocaleString()).join(', '), '(ไร่ ในแนวเขต)');
  console.log(path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(0), 'KB ·', ((Date.now() - t0) / 1000).toFixed(0), 'วิ');
})();
