// สรุปพื้นที่เผาไหม้รอบล่าสุด (data/burn จาก sync_burn.js) สำหรับการ์ด LINE → build_site.js เขียนเป็น _site/burn_summary.json
// ตัดดงใหญ่ด้วยกติกาเดียวกับการแจ้งเตือน LINE (ชื่อพื้นที่อนุรักษ์หรือสถานีฯ มีคำว่า "ดงใหญ่")
// "มีจุดความร้อนใกล้" = จุดใน adata (ทุกดาวเทียม) ห่างแถวพิกเซลไม่เกิน 1 กม. วันที่ใน [วันแรกของรอบ − 10, วันสุดท้ายของรอบ] — ตรรกะเดียวกับ bnHot ในหน้าเว็บ
const fs = require('fs'), path = require('path');
const { utmToLL } = require('./tiff');
const { ROOT, block } = require('./area');

const EX = /ดงใหญ่/, RAI = 0.25, R_M = 1000;
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
const fyOf = d => { const t = new Date(d * 864e5); return t.getUTCFullYear() + 543 + (t.getUTCMonth() >= 9 ? 1 : 0) };
const mid = p => Math.floor((day(p.d0) + day(p.d1)) / 2);

// แถวพิกเซลของไฟล์รอบหนึ่ง → [{g, y, x, n, v, a, s}]
function runs(f) {
  const out = [];
  for (const g in f.g) {
    const o = f.g[g], r = o.r; let y = 0, x = 0, le = 0;
    for (let i = 0; i < r.length; i += 6) { if (r[i]) { y += r[i]; x = r[i + 1] } else x = le + r[i + 1]; const n = r[i + 2]; le = x + n; out.push({ G: o, g, y, x, n, v: r[i + 3], a: r[i + 4], s: r[i + 5] }) }
  }
  return out;
}

function burnSummary(dir = path.join(ROOT, 'data', 'burn')) {
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), P = idx.periods || [];
  if (!P.length) return null;
  const ex = (a, s) => EX.test(idx.ar[a] || '') || EX.test(idx.st[s] || ''), file = p => JSON.parse(fs.readFileSync(path.join(dir, 'b4', p.p + '.json'), 'utf8'));
  const L = P[P.length - 1], d0 = day(L.d0) - 10, d1 = day(L.d1);
  // จุดความร้อนในช่วงเวลาของรอบ
  let hot = [];
  try { const j = JSON.parse(block('adata')[1]); hot = j.r.filter(r => r[0] >= d0 && r[0] <= d1).map(r => [r[3] / 1e5, r[2] / 1e5]) } catch (e) {}
  const ar = {}, st = {}; let t = 0, th = 0;
  for (const o of runs(file(L))) {
    if (ex(o.a, o.s)) continue;
    const G = o.G, e0 = G.x0 + o.x * G.px, e1 = e0 + o.n * G.px, n0 = G.y0 - o.y * G.px, n1 = n0 - G.px, z = G.z;
    const c = [utmToLL(e0, n0, z), utmToLL(e1, n0, z), utmToLL(e1, n1, z), utmToLL(e0, n1, z)];
    const lo0 = Math.min(...c.map(q => q[0])), lo1 = Math.max(...c.map(q => q[0])), la0 = Math.min(...c.map(q => q[1])), la1 = Math.max(...c.map(q => q[1])), k = Math.cos(la0 * Math.PI / 180);
    const near = hot.some(([lo, la]) => Math.hypot(Math.max(lo0 - lo, 0, lo - lo1) * 111320 * k, Math.max(la0 - la, 0, la - la1) * 110574) <= R_M);
    const r = o.n * RAI; t += r; if (near) th += r;
    const an = idx.ar[o.a], sn = idx.st[o.s]; ar[an] = (ar[an] || 0) + r; st[sn] = (st[sn] || 0) + r;
  }
  // สะสมทั้งปีงบ (ไม่นับซ้ำพิกเซลที่ไหม้หลายรอบ)
  const F = fyOf(mid(L)), seen = new Set(); let n = 0;
  for (const p of P.filter(p => fyOf(mid(p)) === F)) for (const o of runs(file(p))) {
    if (ex(o.a, o.s)) continue;
    for (let j = 0; j < o.n; j++) { const k = o.g + '|' + (o.y * 8192 + o.x + j); if (!seen.has(k)) { seen.add(k); n++ } }
  }
  const rnd = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]).sort((a, b) => b[1] - a[1]));
  const BNG = ['47PQR', '47PQS', '47PRR', '47PRS', '48PTA', '48PUA'];
  return { generated: new Date().toISOString(), p: L.p, d0: L.d0, d1: L.d1, rai: Math.round(t * 100) / 100, hs: Math.round(th * 100) / 100, radius_m: R_M,
    ar: rnd(ar), st: rnd(st), miss: BNG.filter(g => !L.grids.includes(g)).length, fy: F, fy_rai: n * RAI, fy_periods: P.filter(p => fyOf(mid(p)) === F).length, hotspots: hot.length };
}

module.exports = { burnSummary };
