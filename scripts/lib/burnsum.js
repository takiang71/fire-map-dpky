// สรุปพื้นที่เผาไหม้รอบล่าสุด (data/burn จาก sync_burn.js) สำหรับการ์ด LINE → build_site.js เขียนเป็น _site/burn_summary.json
// ตัดดงใหญ่ด้วยกติกาเดียวกับการแจ้งเตือน LINE (ชื่อพื้นที่อนุรักษ์หรือสถานีฯ มีคำว่า "ดงใหญ่")
// "มีจุดความร้อนใกล้" = จุดใน adata (ทุกดาวเทียม) ห่างแถวพิกเซลไม่เกิน 1 กม. วันที่ใน [วันแรกของรอบ − 10, วันสุดท้ายของรอบ] — ตรรกะเดียวกับ bnHot ในหน้าเว็บ
// ชื่อ จังหวัด/อำเภอ/ตำบล จากกลางแถวพิกเซลใน data/admin.json (scripts/build_admin.js) · ไม่มีไฟล์ = ไม่มีส่วนนี้
// areas[ชื่อพื้นที่อนุรักษ์] = { rai, hs, fy (สะสมปีงบไม่นับซ้ำ), m[12] (ไร่รายเดือน ต.ค.–ก.ย. รวมรายรอบ), st {สถานีฯ: ไร่}, tm {"ตำบล|อำเภอ|จังหวัด": ไร่} }
const fs = require('fs'), path = require('path');
const { utmToLL } = require('./tiff');
const { ROOT, block } = require('./area');

const EX = /ดงใหญ่/, RAI = 0.25, R_M = 1000;
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
const fyOf = d => { const t = new Date(d * 864e5); return t.getUTCFullYear() + 543 + (t.getUTCMonth() >= 9 ? 1 : 0) };
const mid = p => Math.floor((day(p.d0) + day(p.d1)) / 2), moOf = d => (new Date(d * 864e5).getUTCMonth() + 3) % 12; // ต.ค. = 0
const r2 = v => Math.round(v * 100) / 100, add = (o, k, v) => { o[k] = (o[k] || 0) + v };
const sortObj = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]).sort((a, b) => b[1] - a[1]));

// แถวพิกเซลของไฟล์รอบหนึ่ง → [{G, g, y, x, n, v, a, s}]
function runs(f) {
  const out = [];
  for (const g in f.g) {
    const o = f.g[g], r = o.r; let y = 0, x = 0, le = 0;
    for (let i = 0; i < r.length; i += 6) { if (r[i]) { y += r[i]; x = r[i + 1] } else x = le + r[i + 1]; const n = r[i + 2]; le = x + n; out.push({ G: o, g, y, x, n, v: r[i + 3], a: r[i + 4], s: r[i + 5] }) }
  }
  return out;
}
// มุมทั้ง 4 ของแถวพิกเซล (ลองจิจูด, ละติจูด)
const corners = o => { const G = o.G, e0 = G.x0 + o.x * G.px, e1 = e0 + o.n * G.px, n0 = G.y0 - o.y * G.px, n1 = n0 - G.px; return [utmToLL(e0, n0, G.z), utmToLL(e1, n0, G.z), utmToLL(e1, n1, G.z), utmToLL(e0, n1, G.z)] };

// ตำบลจากแนวเขต (กรองกรอบก่อน)
function admIndex() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'admin.json'), 'utf8')), polys = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const T = j.tm.features.map(f => { const b = [1e9, 1e9, -1e9, -1e9]; polys(f.geometry).forEach(p => p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) })); return { p: f.properties, P: polys(f.geometry), b } });
    const inside = (q, r) => { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) if ((r[i][1] > q[1]) !== (r[k][1] > q[1]) && q[0] < (r[k][0] - r[i][0]) * (q[1] - r[i][1]) / (r[k][1] - r[i][1]) + r[i][0]) c = !c; return c };
    let last = null;
    return (lo, la) => {
      const hit = t => lo >= t.b[0] && lo <= t.b[2] && la >= t.b[1] && la <= t.b[3] && t.P.some(p => inside([lo, la], p[0]) && !p.slice(1).some(r => inside([lo, la], r)));
      if (last && hit(last)) return last.p;   // แถวติดกันมักอยู่ตำบลเดียวกัน
      const t = T.find(hit); if (t) last = t; return t ? t.p : null;
    };
  } catch (e) { return null }
}

function burnSummary(dir = path.join(ROOT, 'data', 'burn')) {
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), P = idx.periods || [];
  if (!P.length) return null;
  const ex = (a, s) => EX.test(idx.ar[a] || '') || EX.test(idx.st[s] || ''), file = p => JSON.parse(fs.readFileSync(path.join(dir, 'b4', p.p + '.json'), 'utf8'));
  const L = P[P.length - 1], d0 = day(L.d0) - 10, d1 = day(L.d1), adm = admIndex();
  // จุดความร้อนในช่วงเวลาของรอบ
  let hot = [];
  try { const j = JSON.parse(block('adata')[1]); hot = j.r.filter(r => r[0] >= d0 && r[0] <= d1).map(r => [r[3] / 1e5, r[2] / 1e5]) } catch (e) {}
  const A = {}, area = n => A[n] = A[n] || { rai: 0, hs: 0, fy: 0, m: Array(12).fill(0), st: {}, tm: {} };
  const ar = {}, st = {}, pv = {}, am = {}, tm = {}; let t = 0, th = 0;
  for (const o of runs(file(L))) {
    if (ex(o.a, o.s)) continue;
    const c = corners(o), lo0 = Math.min(...c.map(q => q[0])), lo1 = Math.max(...c.map(q => q[0])), la0 = Math.min(...c.map(q => q[1])), la1 = Math.max(...c.map(q => q[1])), k = Math.cos(la0 * Math.PI / 180);
    const near = hot.some(([lo, la]) => Math.hypot(Math.max(lo0 - lo, 0, lo - lo1) * 111320 * k, Math.max(la0 - la, 0, la - la1) * 110574) <= R_M);
    const r = o.n * RAI, an = idx.ar[o.a], sn = idx.st[o.s], X = area(an);
    t += r; if (near) th += r; add(ar, an, r); add(st, sn, r);
    X.rai += r; if (near) X.hs += r; add(X.st, sn, r);
    const a = adm && adm((lo0 + lo1) / 2, (la0 + la1) / 2);
    if (a) { add(pv, a.p, r); add(am, a.a + '|' + a.p, r); add(tm, a.t + '|' + a.a + '|' + a.p, r); add(X.tm, a.t + '|' + a.a + '|' + a.p, r) }
  }
  // สะสมทั้งปีงบ (ไม่นับซ้ำพิกเซลที่ไหม้หลายรอบ) + รายเดือนต่อพื้นที่อนุรักษ์ (ผลรวมรายรอบ)
  const F = fyOf(mid(L)), FP = P.filter(p => fyOf(mid(p)) === F), seen = new Set(), M = Array(12).fill(0); let n = 0;
  for (const p of FP) {
    const mo = moOf(mid(p));
    for (const o of runs(file(p))) {
      if (ex(o.a, o.s)) continue;
      const X = area(idx.ar[o.a]); X.m[mo] += o.n * RAI; M[mo] += o.n * RAI;
      for (let j = 0; j < o.n; j++) { const k = o.g + '|' + (o.y * 8192 + o.x + j); if (!seen.has(k)) { seen.add(k); n++; X.fy += RAI } }
    }
  }
  const areas = Object.fromEntries(Object.entries(A).map(([k, X]) => [k, { rai: r2(X.rai), hs: r2(X.hs), fy: r2(X.fy), m: X.m.map(Math.round), st: sortObj(X.st), tm: Object.fromEntries(Object.entries(sortObj(X.tm)).slice(0, 5)) }]));
  const top = o => Object.fromEntries(Object.entries(sortObj(o)).slice(0, 10));
  const BNG = ['47PQR', '47PQS', '47PRR', '47PRS', '48PTA', '48PUA'];
  return { generated: new Date().toISOString(), p: L.p, d0: L.d0, d1: L.d1, rai: r2(t), hs: r2(th), radius_m: R_M,
    ar: sortObj(ar), st: sortObj(st), pv: top(pv), am: top(am), tm: top(tm), areas, m: M.map(Math.round),
    miss: BNG.filter(g => !L.grids.includes(g)).length, fy: F, fy_rai: n * RAI, fy_periods: FP.length, hotspots: hot.length };
}

module.exports = { burnSummary };
