// แนวเขตอำเภอ/ตำบล (OCHA HDX COD-AB Thailand, กรมการปกครอง 2565) เฉพาะรอบกลุ่มป่า → data/admin.json (หน้าเว็บโหลดเมื่อใช้)
// ใช้: node scripts/build_admin.js   (รันครั้งเดียว/เมื่ออยากอัปเดต — ไม่ได้อยู่ใน workflow)
//      node scripts/build_admin.js --prov [tol]  → data/prov.json แนวเขตจังหวัด (admin1) ทั้งประเทศ {p: ชื่อจังหวัด} ลดจุด tol องศา (ค่าเริ่มต้น TOLP)
//  - ไฟล์ต้นทาง tha_admin_boundaries.geojson.zip (~437 MB) ไม่ดาวน์โหลดทั้งก้อน: อ่านสารบัญ zip ท้ายไฟล์ด้วย HTTP Range แล้วดึงเฉพาะ tha_admin2/3.geojson
//    แตก (inflate) แบบสตรีม อ่านทีละบรรทัด (ไฟล์เป็นบรรทัดละ 1 พื้นที่) — admin3 แตกแล้ว ~700 MB เกินขนาดสตริงของ JSON.parse ทั้งก้อน
//  - เก็บเฉพาะพื้นที่ที่ทับกรอบ BOX (แนวเขตกลุ่มป่า + ~60 กม. เผื่อพื้นที่ใต้ลม/กลุ่มควัน) · ลดจุด Douglas–Peucker ~90 ม. (พอสำหรับบอกชื่อพื้นที่และแสดงที่ซูม ≤13) · พิกัด 4 ตำแหน่ง (~11 ม.)
//  - ผล: { am: FeatureCollection {a: อำเภอ, p: จังหวัด}, tm: FeatureCollection {t: ตำบล, a, p}, src, valid_on }
const fs = require('fs'), path = require('path'), zlib = require('zlib'), readline = require('readline'), { Readable } = require('stream');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'data', 'admin.json');
const URL0 = 'https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/89a09f13-7b83-458a-9531-4f2418613065/download/tha_admin_boundaries.geojson.zip';
const BOX = [100.55, 13.1, 103.8, 15.15], TOL = 0.0008, Q = 1e4;
const TOLP = 0.0012; // จังหวัดทั้งประเทศ ~130 ม. — ไฟล์เล็กพอโหลดบนเว็บ (เส้นจังหวัดดูที่ซูม ≤12)

async function range(url, a, b) { const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } }); if (r.status !== 206) throw new Error('ต้นทางไม่รองรับ Range (HTTP ' + r.status + ')'); return r }
async function members(url) {
  const r = await fetch(url, { method: 'HEAD' }), len = +r.headers.get('content-length');
  const t = Buffer.from(await (await range(url, len - 65536, len - 1)).arrayBuffer()), e = t.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  const n = t.readUInt16LE(e + 10), cs = t.readUInt32LE(e + 12), M = {};
  for (let i = 0, p = e - cs; i < n; i++) {
    const fl = t.readUInt16LE(p + 28), xl = t.readUInt16LE(p + 30), cl = t.readUInt16LE(p + 32);
    M[t.toString('utf8', p + 46, p + 46 + fl)] = { csz: t.readUInt32LE(p + 20), off: t.readUInt32LE(p + 42), method: t.readUInt16LE(p + 10) };
    p += 46 + fl + xl + cl;
  }
  return M;
}
// Douglas–Peucker บนวงแหวน (เก็บจุดแรก/สุดท้าย)
function dp(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]) }
  }
  return pts.filter((_, i) => keep[i]);
}
// วงแหวนปิด (จุดแรก = จุดสุดท้าย) แบ่งครึ่งที่จุดไกลสุดก่อน ไม่งั้น DP เห็นเส้นฐานยาว 0 แล้วตัดทิ้งหมด
const dpRing = (r, tol) => { let k = 0, md = -1; r.forEach(([x, y], i) => { const d = (x - r[0][0]) ** 2 + (y - r[0][1]) ** 2; if (d > md) { md = d; k = i } }); return [...dp(r.slice(0, k + 1), tol), ...dp(r.slice(k), tol).slice(1)] };
const ring = (r, tol) => { const s = dpRing(r, tol).map(([x, y]) => [Math.round(x * Q) / Q, Math.round(y * Q) / Q]); return s.length >= 4 ? s : null };
function geom(g, tol) {
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => ring(r, tol)).filter(Boolean)).filter(p => p.length);
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
const hit = g => { let b = [1e9, 1e9, -1e9, -1e9]; (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(p => p[0].forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] })); return b[0] <= BOX[2] && b[2] >= BOX[0] && b[1] <= BOX[3] && b[3] >= BOX[1] };

async function layer(url, M, name, props, tol = TOL, all = false) {
  const m = M[name]; if (!m || m.method !== 8) throw new Error(name + ': ไม่พบในไฟล์ zip หรือไม่ใช่ deflate');
  const h = Buffer.from(await (await range(url, m.off, m.off + 29)).arrayBuffer()), start = m.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  const res = await range(url, start, start + m.csz - 1), rl = readline.createInterface({ input: Readable.fromWeb(res.body).pipe(zlib.createInflateRaw()), crlfDelay: Infinity });
  const out = []; let n = 0, valid = '';
  for await (let line of rl) {
    line = line.trim().replace(/,$/, ''); if (!line.startsWith('{ "type": "Feature"')) continue; n++;
    const f = JSON.parse(line); if (!f.geometry || (!all && !hit(f.geometry))) continue;
    valid = f.properties.valid_on || valid;
    out.push({ type: 'Feature', properties: props(f.properties), geometry: geom(f.geometry, tol) });
  }
  console.log(`${name}: ${n} พื้นที่ทั้งประเทศ → เก็บ ${out.length}`);
  return { fc: { type: 'FeatureCollection', features: out }, valid };
}

(async () => {
  const M = await members(URL0), pi = process.argv.indexOf('--prov');
  if (pi > 0) {
    const tol = +process.argv[pi + 1] || TOLP, pv = await layer(URL0, M, 'tha_admin1.geojson', p => ({ p: p.adm1_name1 }), tol, true), O = path.join(ROOT, 'data', 'prov.json');
    const s = JSON.stringify({ src: 'OCHA HDX COD-AB Thailand (cod-ab-tha)', valid_on: pv.valid, tol, pv: pv.fc });
    fs.writeFileSync(O, s); console.log(`บันทึก ${path.relative(ROOT, O)} ${(s.length / 1024).toFixed(0)} KB (gzip ~${(zlib.gzipSync(s).length / 1024).toFixed(0)} KB) · จุด ${(s.match(/\],\[/g) || []).length}`);
    return;
  }
  const am = await layer(URL0, M, 'tha_admin2.geojson', p => ({ a: p.adm2_name1, p: p.adm1_name1 }));
  const tm = await layer(URL0, M, 'tha_admin3.geojson', p => ({ t: p.adm3_name1, a: p.adm2_name1, p: p.adm1_name1 }));
  const s = JSON.stringify({ src: 'OCHA HDX COD-AB Thailand (cod-ab-tha)', valid_on: tm.valid || am.valid, box: BOX, am: am.fc, tm: tm.fc });
  fs.writeFileSync(OUT, s);
  console.log(`บันทึก ${path.relative(ROOT, OUT)} ${(s.length / 1024).toFixed(0)} KB`);
})().catch(e => { console.error('ผิดพลาด:', e.stack || e); process.exit(1) });
