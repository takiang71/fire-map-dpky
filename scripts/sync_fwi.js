// ระบบดัชนีอันตรายไฟป่า (Canadian Forest Fire Weather Index System — FWI System) จากระบบ TFDRS ของกรมป่าไม้ https://fdrs.forest.go.th
// (ผู้ใช้ขอ 14 พ.ย. 69) — TFDRS คำนวณด้วยโค้ด cffdrs-ng ของ Natural Resources Canada จากอากาศเที่ยงวันของแบบจำลอง WRF (สสน.)
// เกณฑ์ 5 ระดับปรับเทียบสำหรับประเทศไทย (window.boundsByIndicator ในหน้าต้นทาง — อ่านใหม่ทุกรอบ)
// ต้นทาง: /forecast/<รอบ>/<รอบ>_<ตัวแปร>.tif (วันของรอบ) และ /forecast/<รอบ>/<รอบ+1|+2>_<ตัวแปร>_forecast.tif (พยากรณ์ 2 วัน)
//   GeoTIFF float32 ไม่บีบอัด EPSG:4326 ~3 กม. (543×699 ครอบไทย+ลาว) ~1.5 MB/ไฟล์ · nodata -9999 · ไม่เปิด CORS หน้าเว็บจึงอ่านจากไฟล์ของเรา
//   ดึงด้วย HTTP Range เฉพาะแถวที่ครอบกรอบ BOX (~0.2 MB/ไฟล์ — ต้นทางตอบ 206) · รอบใหม่ออกวันละครั้ง (~14:30 น. ไทย)
//   (ผู้ใช้ขอ 14 พ.ย. 69 ให้หน้าเว็บระบายสีเฉพาะในแนวเขตพื้นที่อนุรักษ์ + จปร. แล้วให้เลิกเก็บตารางเต็มพื้นที่ไทย+ลาว — เดิม g/<วันที่>.<ตัวแปร>.gz)
// ผล data/fwi/index.json (อยู่ใน main) {v:3,src,upd,run,bounds,vars,box,days:[{d,f (0 = วันของรอบ, 1/2 = พยากรณ์ล่วงหน้า),run,lm,rlm (Last-Modified ของ FWI วันของรอบ — เปลี่ยน = ดึงทั้งรอบใหม่),a:{all|ky|tl|…:{ตัวแปร:[เฉลี่ย,ต่ำสุด,สูงสุด,[สัดส่วน 5 ระดับ]]}}}]}
//   + data/fwi/g/<YYYY-MM-DD>.json (ไม่อยู่ใน main — .gitignore · sync.yml เก็บไว้ที่ branch fwi-grid แบบ commit เดียว force push ไม่สะสมประวัติ, site.yml ดึงมาก่อน build)
//     = กรอบรอบกลุ่มป่า BOX ทุกตัวแปร {d,f,run,x0,y0 (กลางเซลล์มุมบนซ้าย),dx,dy (ติดลบ = แถวเหนือ→ใต้),nx,ny,q:10,v:{ตัวแปร: base64 Int16LE ค่า×10, -32768 = ไม่มีข้อมูล}} ~340 KB
//     (ภาพบนแผนที่ ป๊อปอัป แผงรายละเอียด · 3 ไฟล์เปลี่ยนต่อวัน ถ้า commit ใน main ประวัติจะโต ~370 MB/ปี จึงเก็บที่ branch)
// ใช้: node scripts/sync_fwi.js [--force] [--keep 7]
const fs = require('fs'), path = require('path');
const { GEO } = require('./lib/area');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'data', 'fwi'), GD = path.join(OUT, 'g'), IDX = path.join(OUT, 'index.json');
const SRC = process.env.FDRS_URL || 'https://fdrs.forest.go.th';
const VARS = ['FWI', 'ISI', 'BUI', 'FFMC', 'DMC', 'DC', 'Temp_noon', 'Rh_noon', 'Wsp_noon', 'Precip_24hr'];
const BOX = [100.4, 12.9, 104.0, 15.4]; // กรอบรอบกลุ่มป่า (18 จังหวัดรอบข้าง ครอบพื้นที่อนุรักษ์ + จปร.) ~3 กม./เซลล์ → 131×99 เซลล์ (เผื่อขอบ 1 เซลล์)
const ai = process.argv.indexOf('--keep'), KEEP = ai > 0 ? +process.argv[ai + 1] : 7; // เก็บวันของรอบย้อนหลังกี่วัน
const FORCE = process.argv.includes('--force');
const UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
const LNK = { ky: 'อุทยานแห่งชาติเขาใหญ่', tl: 'อุทยานแห่งชาติทับลาน', ps: 'อุทยานแห่งชาติปางสีดา', tp: 'อุทยานแห่งชาติตาพระยา', dy: 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', ks: 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าโคกสูง', kc: 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าเขาฉกรรจ์' };
const BOUNDS0 = { FWI: [17, 31, 40, 54], DC: [256.1, 334.1, 450.6, 600], DMC: [15.7, 27.9, 53.1, 83.6], BUI: [24.2, 40.7, 73.3, 133.1], FFMC: [87, 90, 93, 98], ISI: [7, 14, 20, 32], Precip_24hr: [5, 10, 25, 50], Temp_noon: [20, 25, 30, 35], Wsp_noon: [5, 10, 15, 20] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const addD = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

async function get(url, range, tries = 3) {
  for (let a = 0; ; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(range ? { Range: 'bytes=' + range } : {}) }, signal: AbortSignal.timeout(90e3) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { b: Buffer.from(await r.arrayBuffer()), part: r.status === 206, lm: r.headers.get('last-modified') };
    } catch (e) { if (a >= tries - 1) throw e; await sleep(2000 * (a + 1)) }
  }
}

// หน้าแรก: วันล่าสุด + เกณฑ์ 5 ระดับ
async function meta() {
  const r = await get(SRC + '/index.php');
  const h = r ? r.b.toString('utf8') : '';
  const m = h.match(/latestOutputDate\s*=\s*"(\d{4}-\d{2}-\d{2})"/), b = h.match(/boundsByIndicator\s*=\s*(\{[^;]*?\})\s*;/);
  let bounds = null; try { bounds = b && JSON.parse(b[1]) } catch (e) { }
  return { run: m && m[1], bounds };
}

// อ่านเฉพาะแถว/คอลัมน์ที่ครอบ BOX (+1 เซลล์) ของ GeoTIFF float32 ไม่บีบอัด (แถบละหลายแถว) → {x0,y0 (กลางเซลล์มุมบนซ้าย),dx,dy,nx,ny,a:Float32Array}
async function grid(url) {
  const H = await get(url, '0-65535'); if (!H) return null;
  const b = H.b, le = b[0] === 0x49;
  const u16 = o => le ? b.readUInt16LE(o) : b.readUInt16BE(o), u32 = o => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  if (u16(2) !== 42) throw new Error('ไม่ใช่ TIFF');
  const ifd = u32(4), n = u16(ifd), T = {}, SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };
  if (ifd + 2 + n * 12 > b.length) throw new Error('ส่วนหัว TIFF ยาวเกิน');
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), typ = u16(e + 2), cnt = u32(e + 4), sz = (SZ[typ] || 1) * cnt, off = sz <= 4 ? e + 8 : u32(e + 8);
    if (off + sz > b.length) throw new Error('ส่วนหัว TIFF ยาวเกิน (แท็ก ' + tag + ')');
    if (typ === 2) { T[tag] = b.toString('latin1', off, off + cnt - 1); continue }
    const v = new Array(cnt); for (let k = 0; k < cnt; k++) { const o = off + k * SZ[typ]; v[k] = typ === 3 ? u16(o) : typ === 4 ? u32(o) : typ === 12 ? (le ? b.readDoubleLE(o) : b.readDoubleBE(o)) : b[o] }
    T[tag] = v;
  }
  const w = T[256][0], h = T[257][0], rps = (T[278] || [h])[0], offs = T[273], cnts = T[279];
  if (T[258][0] !== 32 || T[259][0] !== 1 || (T[339] || [1])[0] !== 3 || (T[277] || [1])[0] !== 1 || T[322]) throw new Error('รูปแบบ TIFF ไม่ตรงที่คาด (ต้องเป็น float32 ไม่บีบอัด แบบแถบ)');
  const sc = T[33550], tie = T[33922]; if (!sc || !tie) throw new Error('ไม่มีพิกัด GeoTIFF');
  const nod = T[42113] != null ? +T[42113] : -9999, X0 = tie[3] - tie[0] * sc[0], Y0 = tie[4] + tie[1] * sc[1];
  if (offs.length * rps < h) throw new Error('ไฟล์ TIFF ไม่ครบ');
  const gx0 = X0 + .5 * sc[0], gy0 = Y0 - .5 * sc[1]; // กลางเซลล์มุมบนซ้ายของทั้งไฟล์
  const c0 = Math.max(0, Math.floor((BOX[0] - gx0) / sc[0])), c1 = Math.min(w, Math.ceil((BOX[2] - gx0) / sc[0]) + 1);
  const r0 = Math.max(0, Math.floor((gy0 - BOX[3]) / sc[1])), r1 = Math.min(h, Math.ceil((gy0 - BOX[1]) / sc[1]) + 1);
  if (c1 <= c0 || r1 <= r0) throw new Error('กรอบไม่ทับข้อมูล');
  const s0 = Math.floor(r0 / rps), s1 = Math.floor((r1 - 1) / rps);
  let contig = true; for (let s = s0; s < s1; s++) if (offs[s + 1] !== offs[s] + cnts[s]) contig = false;
  let D, base;
  if (contig) { const R = await get(url, `${offs[s0]}-${offs[s1] + cnts[s1] - 1}`); D = R.b; base = R.part ? offs[s0] : 0 }
  else { D = (await get(url)).b; base = 0 }
  const nx = c1 - c0, ny = r1 - r0, a = new Float32Array(nx * ny), rd = o => le ? D.readFloatLE(o) : D.readFloatBE(o);
  for (let r = r0; r < r1; r++) {
    const s = Math.floor(r / rps), ro = offs[s] - base + (r - s * rps) * w * 4;
    if (ro < 0 || ro + c1 * 4 > D.length) throw new Error('ไฟล์ TIFF ไม่ครบ');
    for (let c = c0; c < c1; c++) { const v = rd(ro + c * 4); a[(r - r0) * nx + c - c0] = !(v > nod + 0.5) || !isFinite(v) ? NaN : v }
  }
  return { x0: gx0 + c0 * sc[0], y0: gy0 - r0 * sc[1], dx: sc[0], dy: -sc[1], nx, ny, a, lm: H.lm };
}

// ค่าที่จุด (ประมาณเชิงเส้นสองทาง; เพื่อนบ้านที่ไม่มีข้อมูลไม่นับ) — ตรรกะเดียวกับหน้าเว็บ (fwAt)
function at(G, a, lo, la) {
  const fx = (lo - G.x0) / G.dx, fy = (la - G.y0) / G.dy; if (fx < 0 || fy < 0 || fx > G.nx - 1 || fy > G.ny - 1) return null;
  const i = Math.min(G.nx - 2, Math.floor(fx)), j = Math.min(G.ny - 2, Math.floor(fy)), p = fx - i, q = fy - j;
  let s = 0, w = 0; for (const [di, dj, ww] of [[0, 0, (1 - p) * (1 - q)], [1, 0, p * (1 - q)], [0, 1, (1 - p) * q], [1, 1, p * q]]) { const v = a[(j + dj) * G.nx + i + di]; if (!isNaN(v) && ww > 0) { s += v * ww; w += ww } }
  return w > 0.25 ? s / w : null;
}
const cat = (v, b) => v < b[0] ? 0 : v < b[1] ? 1 : v < b[2] ? 2 : v < b[3] ? 3 : 4;

// จุดตัวอย่างทุก 0.02° ในแต่ละพื้นที่อนุรักษ์ (แนวเขต KMZ) — all = ทั้งกลุ่มป่า
const inside = (q, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > q[1]) !== (r[j][1] > q[1]) && q[0] < (r[j][0] - r[i][0]) * (q[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c };
const inFeat = (q, f) => f.geometry.coordinates.some(p => inside(q, p[0]) && !p.slice(1).some(r => inside(q, r)));
function samples() {
  const A = { all: [] };
  for (const [k, nm] of Object.entries(LNK)) {
    const f = GEO.cons.features.find(f => f.properties.name === nm); if (!f) continue;
    const bb = [1e9, 1e9, -1e9, -1e9]; f.geometry.coordinates.forEach(p => p[0].forEach(([x, y]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y) }));
    const P = []; for (let x = Math.ceil(bb[0] / .02) * .02; x <= bb[2]; x += .02) for (let y = Math.ceil(bb[1] / .02) * .02; y <= bb[3]; y += .02) if (inFeat([x, y], f)) P.push([x, y]);
    if (!P.length) P.push([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]);
    A[k] = P; A.all.push(...P);
  }
  return A;
}
function stats(G, V, bounds, A) {
  const out = {};
  for (const [k, P] of Object.entries(A)) {
    const o = {};
    for (const v of VARS) {
      const a = V[v]; if (!a) continue; let s = 0, n = 0, lo = Infinity, hi = -Infinity; const c = [0, 0, 0, 0, 0], b = bounds[v];
      for (const [x, y] of P) { const z = at(G, a, x, y); if (z == null) continue; s += z; n++; if (z < lo) lo = z; if (z > hi) hi = z; if (b) c[cat(z, b)]++ }
      if (!n) continue; const r1 = x => Math.round(x * 10) / 10;
      o[v] = [r1(s / n), r1(lo), r1(hi)]; if (b) o[v].push(c.map(x => Math.round(x / n * 1000) / 1000));
    }
    out[k] = o;
  }
  return out;
}

async function day(run, d, f) { // ดึงทั้ง 10 ตัวแปรของวัน d ในรอบ run
  const V = {}; let G = null, lm = null;
  for (const v of VARS) {
    const u = `${SRC}/forecast/${run}/${d}_${v}${f ? '_forecast' : ''}.tif`, g = await grid(u);
    if (!g) { if (v === 'FWI') return null; console.log('  ไม่มี', v, d); continue }
    if (G && (g.nx !== G.nx || g.ny !== G.ny || Math.abs(g.x0 - G.x0) > 1e-6 || Math.abs(g.y0 - G.y0) > 1e-6)) throw new Error('กริดของ ' + v + ' ไม่ตรงกับ FWI');
    G = G || g; V[v] = g.a; if (v === 'FWI') lm = g.lm; await sleep(250);
  }
  return { G, V, lm };
}
const i16 = a => { const q = Buffer.alloc(a.length * 2); for (let i = 0; i < a.length; i++) q.writeInt16LE(isNaN(a[i]) ? -32768 : Math.max(-32767, Math.min(32767, Math.round(a[i] * 10))), i * 2); return q };
function enc(G, V) { // กรอบ BOX ทุกตัวแปร
  const r = x => +x.toFixed(6), v = {};
  for (const [k, a] of Object.entries(V)) v[k] = i16(a).toString('base64');
  return { x0: r(G.x0), y0: r(G.y0), dx: r(G.dx), dy: r(G.dy), nx: G.nx, ny: G.ny, q: 10, v };
}
const has0 = d => fs.existsSync(path.join(GD, d + '.json'));
const wr = (p, o) => { fs.writeFileSync(p + '.tmp', JSON.stringify(o)); fs.renameSync(p + '.tmp', p) };

(async () => {
  fs.mkdirSync(GD, { recursive: true });
  // ไฟล์รูปแบบเดิม (กรอบ BOX ใน data/fwi/<วันที่>.json — v1) ไม่ใช้แล้ว
  for (const f of fs.readdirSync(OUT)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const M = await meta(); let run = M.run;
  if (!run) { // หน้าแรกอ่านไม่ได้ → ไล่หาวันล่าสุดที่มีไฟล์ FWI (ย้อนหลัง 4 วัน)
    const t = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
    for (let k = 0; k < 5 && !run; k++) { const d = addD(t, -k); if (await get(`${SRC}/forecast/${d}/${d}_FWI.tif`, '0-15')) run = d }
  }
  if (!run) { console.error('หาวันล่าสุดของ TFDRS ไม่ได้ — คงข้อมูลเดิม'); process.exit(1) }
  const bounds = { ...BOUNDS0, ...(M.bounds || {}) };
  const prev = fs.existsSync(IDX) ? JSON.parse(fs.readFileSync(IDX, 'utf8')) : null;
  const has = d => prev && prev.days.find(x => x.d === d);
  const ok = !!prev && prev.v >= 2; // v2 = ไฟล์กรอบเดียวกัน (+ ตารางเต็มพื้นที่ที่เลิกเก็บแล้ว) ใช้ต่อได้
  const A = samples();
  // วันที่ต้องมี: วันของรอบย้อนหลัง KEEP วัน (ถึง run) + พยากรณ์ run+1, run+2
  const want = []; for (let k = KEEP - 1; k >= 0; k--) want.push({ d: addD(run, -k), f: 0, run: addD(run, -k) });
  want.push({ d: addD(run, 1), f: 1, run }, { d: addD(run, 2), f: 2, run });
  const days = []; let ch = false;
  // วันของรอบล่าสุด: ต้นทางอาจคำนวณใหม่ในวันเดียวกัน → เทียบ Last-Modified
  let lmRun = null; try { const h = await fetch(`${SRC}/forecast/${run}/${run}_FWI.tif`, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) }); lmRun = h.ok ? h.headers.get('last-modified') : null } catch (e) { }
  for (const w of want) {
    const o = has(w.d), file = path.join(GD, w.d + '.json');
    const same = o && o.f === w.f && o.run === w.run && ok && has0(w.d) && (w.run !== run || !lmRun || o.rlm === lmRun);
    if (same && !FORCE) { days.push(o); continue }
    let R; try { R = await day(w.run, w.d, w.f) } catch (e) { console.log('  ดึง', w.d, 'ไม่ได้:', e.message); R = undefined }
    if (!R) { if (o && has0(w.d)) days.push(o); else if (R === null) console.log('  ไม่มีข้อมูลวัน', w.d, w.f ? '(พยากรณ์)' : ''); continue }
    wr(file, { d: w.d, f: w.f, run: w.run, ...enc(R.G, R.V) });
    days.push({ d: w.d, f: w.f, run: w.run, lm: R.lm, ...(w.run === run && lmRun ? { rlm: lmRun } : {}), a: stats(R.G, R.V, bounds, A) }); ch = true;
    const s = days[days.length - 1].a.all.FWI; console.log(`  ${w.d}${w.f ? ' (พยากรณ์ +' + w.f + ')' : ''} FWI กลุ่มป่า เฉลี่ย ${s && s[0]} สูงสุด ${s && s[2]}`);
  }
  if (!days.length) { console.error('ไม่ได้ข้อมูลเลย — คงข้อมูลเดิม'); process.exit(1) }
  // ลบไฟล์วันที่ไม่ใช้แล้ว + ตารางเต็มพื้นที่รูปแบบเดิม (<วันที่>.<ตัวแปร>.gz — เลิกเก็บ 14 พ.ย. 69)
  const keep = new Set(days.map(x => x.d + '.json'));
  for (const f of fs.readdirSync(GD)) if (!keep.has(f)) { fs.unlinkSync(path.join(GD, f)); ch = true }
  if (!ch && prev && prev.v === 3 && prev.run === run && JSON.stringify(prev.bounds) === JSON.stringify(bounds)) return console.log('TFDRS รอบ', run, 'มีอยู่แล้ว ไม่มีอะไรเปลี่ยน');
  days.sort((a, b) => a.d < b.d ? -1 : 1);
  wr(IDX, { v: 3, src: SRC, upd: new Date().toISOString(), run, bounds, vars: VARS, box: BOX, keep: KEEP, days });
  console.log(`เขียน data/fwi รอบ ${run} · ${days.length} วัน (${days.filter(x => x.f).length} วันพยากรณ์)`);
})().catch(e => { console.error(e); process.exit(1) });
