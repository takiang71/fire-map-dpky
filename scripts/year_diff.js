// หาสาเหตุที่รอยเผา B4 รอบจุดความร้อนต่างกันระหว่างปีงบ 2568 กับ 2569 (25 พ.ย. 69) — รันมือ อ่านอย่างเดียว
// ใช้: node scripts/year_diff.js   · รอบ B4 ปี 2568 ยาว 15 วัน, ปี 2569 ยาว 7 วัน → เทียบโดยรวมรอบ 7 วันเป็นคู่ (14 วัน)
// ใช้จุดทุกจุด (รวมที่ไม่พบรอย = 0 ไร่) จึงไม่มีอคติจากการคัดเฉพาะคู่ที่พบรอย · ช่วง ม.ค.–เม.ย. ทั้งสองปี
const fs = require('fs'), path = require('path');
const { block } = require('./lib/area'), { runs } = require('./lib/burnsum'), { llToUTM } = require('./lib/tiff');
const BD = path.join(__dirname, '..', 'data', 'burn'), day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
const PER = JSON.parse(fs.readFileSync(path.join(BD, 'index.json'), 'utf8')).periods.map(p => ({ a: day(p.d0), b: day(p.d1), f: p.p })).sort((x, y) => x.a - y.a);
for (const p of PER) { // ช่อง 1 กม. → พิกเซล (E,N กลางพิกเซล)
  p.c = new Map();
  for (const o of runs(JSON.parse(fs.readFileSync(path.join(BD, 'b4', p.f + '.json'), 'utf8')))) for (let j = 0; j < o.n; j++) {
    const E = o.G.x0 + (o.x + j + .5) * o.G.px, N = o.G.y0 - (o.y + .5) * o.G.px, k = o.G.z + '|' + Math.floor(E / 1000) + '|' + Math.floor(N / 1000); (p.c.get(k) || p.c.set(k, []).get(k)).push(E, N);
  }
}
const PAIR = []; for (let i = 0; i < PER.length; i++) { const p = PER[i], n = PER[i + 1]; if (p.b - p.a < 10 && n && n.b - n.a < 10 && n.a - p.b === 1) { PAIR.push({ a: p.a, b: n.b, m: [p, n] }); i++ } else PAIR.push({ a: p.a, b: p.b, m: [p] }) }
const rai = (lo, la, ps, km) => { const s = new Set(); for (const z of [47, 48]) { const [E, N] = llToUTM(lo, la, z), x = Math.floor(E / 1000), y = Math.floor(N / 1000), R = Math.ceil(km); for (const p of ps) for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const L = p.c.get(`${z}|${x + a}|${y + b}`); if (L) for (let t = 0; t < L.length; t += 2) if (Math.hypot(L[t] - E, L[t + 1] - N) <= km * 1000) s.add(z + '|' + L[t] + '|' + L[t + 1]) } } return s.size * .25 };
const win = (D, d, n, set) => { const o = set.filter(p => p.a <= d + n && p.b >= d); return o.flatMap(p => p.m || [p]) };
const full = d => PER.some(p => p.a <= d && p.b >= d);
const fyOf = d => { const t = new Date(d * 864e5); return t.getUTCFullYear() + 543 + (t.getUTCMonth() >= 9 ? 1 : 0) }, mo = d => new Date(d * 864e5).getUTCMonth() + 1;
const q = (a, p = .5) => { a = [...a].sort((x, y) => x - y); if (!a.length) return NaN; const k = (a.length - 1) * p, i = Math.floor(k); return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (k - i) }, f = v => Number.isFinite(v) ? v.toFixed(1) : '–';
const A = JSON.parse(block('adata')[1]);
const H = A.r.map(r => ({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, ar: A.ar[r[9]] || '', fy: fyOf(r[0]), m: mo(r[0]) })).filter(h => (h.fy === 2568 || h.fy === 2569) && h.m <= 4 && full(h.d) && full(h.d + 7));
for (const h of H) { const w = win(0, h.d, 7, PER); h.span = w.length ? Math.max(...w.map(p => p.b)) - Math.min(...w.map(p => p.a)) + 1 : 0; h.r = rai(h.lo, h.la, w, 1); h.rp = rai(h.lo, h.la, win(0, h.d, 7, PAIR), 1) }
const row = (t, X) => [2568, 2569].map(y => X.filter(h => h.fy === y)).reduce((s, Y) => s + ` | n ${Y.length} ช่วงวัน ${f(q(Y.map(h => h.span)))} พบรอย ${f(100 * Y.filter(h => h.r > 0).length / Y.length)}% มัธยฐาน ${f(q(Y.map(h => h.r)))} → รอบคู่ ${f(q(Y.map(h => h.rp)))} (พบ ${f(100 * Y.filter(h => h.rp > 0).length / Y.length)}%)`, t);
console.log('ไร่รอย B4 ในรัศมี 1 กม. (ม.ค.–เม.ย. รวมจุดที่ไม่พบรอย) · 2568 | 2569');
console.log(row('ทั้งหมด', H)); console.log(row('ไม่รวมทับลาน', H.filter(h => !/ทับลาน/.test(h.ar)))); console.log(row('ทับลาน', H.filter(h => /ทับลาน/.test(h.ar)))); console.log(row('ทับลาน ไม่รวม ก.พ.', H.filter(h => /ทับลาน/.test(h.ar) && h.m !== 2)));
for (const m of [1, 2, 3, 4]) console.log(row('เดือน ' + m, H.filter(h => h.m === m)));
for (const a of [...new Set(H.map(h => h.ar))]) if (H.filter(h => h.ar === a).length > 60) console.log(row(a, H.filter(h => h.ar === a)));
// ความหนาแน่นจุด: จุดใกล้เคียง ≤1 กม. ≤3 วัน (ไฟใหญ่/หลายรอบ)
for (const h of H) h.nb = H.filter(g => g !== h && Math.abs(g.d - h.d) <= 3 && Math.hypot((g.lo - h.lo) * 108000, (g.la - h.la) * 110574) <= 1000).length;
console.log('\nแยกตามจุดความร้อนข้างเคียง (≤1 กม. ≤3 วัน)'); for (const [t, a, b] of [['0', 0, 0], ['1–3', 1, 3], ['4–9', 4, 9], ['≥10', 10, 1e9]]) console.log(row(t, H.filter(h => h.nb >= a && h.nb <= b)));
{ const X = y => H.filter(h => h.fy === y), S = y => { const D = new Map(); X(y).forEach(h => D.set(h.d, (D.get(h.d) || 0) + 1)); return [...D.values()].sort((a, b) => b - a) }; for (const y of [2568, 2569]) console.log(y, 'จุดจาก 5 วันสูงสุด', S(y).slice(0, 5).reduce((a, b) => a + b, 0), '/', X(y).length) }
// ข้อมูลดับไฟ อส.: พื้นที่เสียหายที่รายงาน เทียบรอย B4 รัศมี 1 กม. ณ พิกัดไฟเดียวกัน
const F = JSON.parse(block('fxdata')[1]), Z = F.r.map(r => ({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, ar: F.ar[r[8]] || '', rai: r[11], fy: fyOf(r[0]), m: mo(r[0]) }));
console.log('\nการดับไฟ อส. (พื้นที่เสียหายที่รายงาน)');
for (const y of [2564, 2565, 2566, 2567, 2568, 2569]) { const X = Z.filter(z => z.fy === y); console.log(` ${y} n ${X.length} มัธยฐาน ${f(q(X.map(z => z.rai)))} P75 ${f(q(X.map(z => z.rai), .75))} สูงสุด ${f(Math.max(...X.map(z => z.rai)))} รวม ${f(X.reduce((a, z) => a + z.rai, 0))}`) }
for (const y of [2568, 2569]) { const X = Z.filter(z => z.fy === y && z.la > 13 && z.m <= 4 && full(z.d) && full(z.d + 7)); X.forEach(z => { z.b = rai(z.lo, z.la, win(0, z.d, 7, PER), 1); z.bp = rai(z.lo, z.la, win(0, z.d, 7, PAIR), 1) });
  const P = X.filter(z => z.rai > 0); console.log(` ${y} เทียบ B4: n ${P.length} · อส. มัธยฐาน ${f(q(P.map(z => z.rai)))} ไร่ · B4 1 กม. ${f(q(P.map(z => z.b)))} (รอบคู่ ${f(q(P.map(z => z.bp)))}) · พบรอย ${f(100 * P.filter(z => z.b > 0).length / P.length)}% · ทั้งปีผลรวม อส. ${f(P.reduce((a, z) => a + z.rai, 0))} B4 ${f(P.reduce((a, z) => a + z.b, 0))}`);
  for (const [t, a, b] of [['≤5 ไร่', 0, 5], ['5–20', 5.01, 20], ['>20', 20.01, 1e9]]) { const G = P.filter(z => z.rai >= a && z.rai <= b); console.log(`    อส. ${t}: n ${G.length} พบรอย ${f(100 * G.filter(z => z.b > 0).length / G.length)}% B4 มัธยฐาน ${f(q(G.map(z => z.b)))}`) } }
// ตรวจข้ามผลิตภัณฑ์: ชุดรายเดือน/รายฤดู (data/burn/c) ณ ไฟ อส. เดียวกัน — เฉพาะรอบที่ครอบวันเกิดไฟ
{
  const C = JSON.parse(fs.readFileSync(path.join(BD, 'index.json'), 'utf8')).cls.filter(p => p.d0 && p.d1).map(p => ({ a: day(p.d0), b: day(p.d1), f: p.p, t: p.t || p.n || '' }));
  console.log('\nชุดรายเดือน/ฤดู:', C.filter(p => p.b > day('20241001')).map(p => p.f + (p.t ? '(' + p.t + ')' : '')).join(' '));
  for (const p of C) { p.c = new Map(); const fn = path.join(BD, 'c', p.f + '.json'); if (!fs.existsSync(fn)) continue; for (const o of runs(JSON.parse(fs.readFileSync(fn, 'utf8')))) for (let j = 0; j < o.n; j++) { const E = o.G.x0 + (o.x + j + .5) * o.G.px, N = o.G.y0 - (o.y + .5) * o.G.px, k = o.G.z + '|' + Math.floor(E / 1000) + '|' + Math.floor(N / 1000); (p.c.get(k) || p.c.set(k, []).get(k)).push(E, N) } }
  const season = C.filter(p => p.b - p.a > 60), B = { 2568: ['20241201', '20250430'], 2569: ['20251201', '20260430'] };
  for (const y of [2568, 2569]) {
    const s = season.filter(p => p.a <= day(B[y][0]) + 45 && p.b >= day(B[y][1]) - 45), m = C.filter(p => p.b - p.a <= 60), X = Z.filter(z => z.fy === y && z.la > 13 && z.m <= 4 && z.rai > 0 && full(z.d) && full(z.d + 7));
    for (const [t, sel] of [['ฤดู', () => s], ['เดือน', z => m.filter(p => p.a <= z.d + 7 && p.b >= z.d)], ['B4 ทั้ง ธ.ค.–เม.ย.', () => PER.filter(p => p.b >= day(B[y][0]) && p.a <= day(B[y][1]))]]) {
      const W = X.map(z => [z, sel(z)]).filter(([, w]) => w.length), v = W.map(([z, w]) => [z, rai(z.lo, z.la, w, 1)]); if (!v.length) { console.log(` ${y} ${t}: ไม่มีรอบ`); continue }
      const b = v.filter(([z]) => z.rai > 20); console.log(` ${y} ${t}: n ${v.length} พบรอย ${f(100 * v.filter(x => x[1] > 0).length / v.length)}% มัธยฐาน ${f(q(v.map(x => x[1])))} ไร่ · อส.>20 ไร่ n ${b.length} พบ ${f(100 * b.filter(x => x[1] > 0).length / b.length)}% มัธยฐาน ${f(q(b.map(x => x[1])))}`);
    }
  }
}
// ความล่าช้า: ขยายหน้าต่างหลังวันพบจุด · ฐานเทียบก่อนเกิดไฟ = หน้าต่างยาวเท่ากันที่จบก่อนวันพบ (รอยเก่า/รอยข้างเคียงที่บังเอิญอยู่แล้ว)
console.log('\nหน้าต่างหลังวันพบจุด (จุด ม.ค.–เม.ย. ทุกจุด · รัศมี 1 กม.) และฐานเทียบก่อนวันพบ');
for (const n of [7, 14, 21, 30, 45]) console.log(` +${n} วัน`, [2568, 2569].map(y => { const X = H.filter(h => h.fy === y && full(h.d - n) && full(h.d + n)), a = X.map(h => rai(h.lo, h.la, win(0, h.d, n, PER), 1)), b = X.map(h => rai(h.lo, h.la, PER.filter(p => p.b >= h.d - n && p.b < h.d), 1)); return `${y} n ${X.length} พบ ${f(100 * a.filter(v => v > 0).length / a.length)}% มัธยฐาน ${f(q(a))} (ก่อนวันพบ ${f(100 * b.filter(v => v > 0).length / b.length)}%)` }).join(' | '));
