// ทดลองลดอิทธิพลลมของโมเดลไฟ (วงรี calc) นอกเว็บ — รันมือหลัง fire_model_eval.js (อ่าน CSV รายคู่) ไม่แก้ค่าใดในหน้าเว็บ
// ใช้: node scripts/wind_exp.js <summary_*.csv>
// ทุกแบบแปลงลมก่อนเข้า calc โดยคงลม 11 กม./ชม. ไว้ที่ 11 → ค่าทดสอบ 7.3 (หัวไฟ 4.7 · 1,999 ไร่) ไม่เปลี่ยน
// เทียบกับพิกเซลเผา B4 ในรัศมี 1 กม. 7 วัน (เพดาน ~1,960 ไร่ และรวมไฟข้างเคียง) · เลือกบนปีงบ 2568 ทดสอบบนปีงบ 2569 · ช่วงเชื่อมั่นสุ่มซ้ำตามวัน (จุดวันเดียวกันไม่อิสระ)
const fs = require('fs'), { loadModel } = require('./lib/fmodel');
const M = loadModel({}), [h, ...L] = fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '').trim().split('\n').map(l => l.split(','));
const R = L.map(c => Object.fromEntries(h.map((k, i) => [k, c[i]]))).map(r => ({ d: r.date, fy: +r.date.slice(0, 4) + 543 + (+r.date.slice(5, 7) >= 10 ? 1 : 0), mo: r.date.slice(5, 7), day: +r.hhmm >= 600 && +r.hhmm < 1800, u: +r.wind_kmh, fuelN: r.fuel, m0: +r.model_rai, y: +r.real_px_1km,
  p: { hr: 6, fuel: M.FUEL.findIndex(f => f.n === r.fuel), u: +r.wind_kmh, from: +r.wind_from, T: +r.T, rh: +r.rh, sl: Math.min(40, Math.round(+r.slope)), asp: +r.slope >= 1 ? +r.asp : null } }));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y), k = (s.length - 1) * p, i = Math.floor(k); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (k - i) };
const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; for (let i = 0; i < o.length;) { let j = i; while (j < o.length && o[j][0] === o[i][0]) j++; for (let k = i; k < j; k++) r[o[k][1]] = (i + j - 1) / 2; i = j } return r };
const cor = (a, b) => { const x = rank(a), y = rank(b), n = x.length, m = (n - 1) / 2; let c = 0, s = 0, t = 0; for (let i = 0; i < n; i++) { c += (x[i] - m) * (y[i] - m); s += (x[i] - m) ** 2; t += (y[i] - m) ** 2 } return c / Math.sqrt(s * t) };
const f = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '–';
const mod = (X, t) => X.map(r => M.calc({ ...r.p, u: t(r.u) }).rai);
const V = { 'เดิม': u => u, 'จำกัดลม ≤11': u => Math.min(u, 11), 'ยกกำลัง 0.75': u => 11 * (u / 11) ** .75, 'ยกกำลัง 0.5': u => 11 * (u / 11) ** .5, 'ยกกำลัง 0.25': u => 11 * (u / 11) ** .25, 'ลมคงที่ 11': () => 11 };
for (const k in V) { const t = M.calc({ hr: 6, fuel: 0, u: V[k](11), from: 90, rh: 61, T: 32.3, sl: 4, asp: null }); if (Math.abs(t.Rh - 4.7) > 1e-9) throw new Error(k + ' ค่าทดสอบเปลี่ยน') }
{ const m = mod(R, V['เดิม']); console.log('ตรวจตัวเอง: คำนวณซ้ำ ÷ ค่าใน CSV', f(q(m.map((v, i) => v / R[i].m0), .1), 3), '–', f(q(m.map((v, i) => v / R[i].m0), .9), 3)) }
const sets = { 2568: R.filter(r => r.fy === 2568), 2569: R.filter(r => r.fy === 2569) };
for (const s in sets) {
  const X = sets[s]; console.log(`\nปีงบ ${s} (${X.length} คู่, ${new Set(X.map(r => r.d)).size} วัน)`);
  for (const k in V) { const m = mod(X, V[k]), a = m.map((v, i) => Math.log10(v / X[i].y)), md = q(a, .5); console.log(`  ${k.padEnd(14)} เกินมัธยฐาน ${f(10 ** md, 1)}× · P10–P90 ${f(10 ** q(a, .1), 1)}–${f(10 ** q(a, .9), 0)} · ×0.5–2 ${f(100 * a.filter(v => Math.abs(v) <= Math.log10(2)).length / a.length, 0)}% · กระจาย(MAD log10) ${f(q(a.map(v => Math.abs(v - md)), .5))} · สหสัมพันธ์อันดับ ${f(cor(m, X.map(r => r.y)))}`) }
}
const G = { 'ทั้งหมด': () => 1, 'กลางวัน': r => r.day, 'กลางคืน': r => !r.day }; for (const n of M.FUEL.map(x => x.n)) G[n] = r => r.fuelN === n; for (const m of [...new Set(R.map(r => r.mo))].sort()) G['เดือน ' + m] = r => r.mo === m;
console.log('\nสหสัมพันธ์อันดับ ลม–ไร่จริง (แยกกลุ่มเพื่อกันผลของฤดู/เวลา/ชนิดป่า) · ช่วง 95% สุ่มซ้ำรายวัน');
let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
for (const k in G) { const X = R.filter(G[k]); if (X.length < 30) continue; const D = new Map(); X.forEach(r => (D.get(r.d) || D.set(r.d, []).get(r.d)).push(r)); const ds = [...D.values()], b = [];
  for (let i = 0; i < 400; i++) { const Y = []; for (let j = 0; j < ds.length; j++) Y.push(...ds[Math.floor(rnd() * ds.length)]); const c = cor(Y.map(r => r.u), Y.map(r => r.y)); if (Number.isFinite(c)) b.push(c) }
  console.log(`  ${k.padEnd(14)} n ${X.length} (${ds.length} วัน) ρ ${f(cor(X.map(r => r.u), X.map(r => r.y)))} [${f(q(b, .025))}, ${f(q(b, .975))}]`) }
console.log('\nช่วงขนาดที่พบจริง P25–P75 (สร้างจาก 2568 → ตรวจ 2569 ควรครอบ ~50%) และกลับกัน');
for (const [a, b] of [[2568, 2569], [2569, 2568]]) for (const [n, key] of [['รวม', () => ''], ['กลางวัน/คืน', r => r.day ? 'วัน' : 'คืน'], ['ลม', r => r.u < 5 ? '<5' : r.u < 10 ? '5-10' : r.u < 15 ? '10-15' : '15+']]) {
  const T = {}; sets[a].forEach(r => (T[key(r)] = T[key(r)] || []).push(r.y)); const Y = sets[b].filter(r => T[key(r)]), c = Y.filter(r => r.y >= q(T[key(r)], .25) && r.y <= q(T[key(r)], .75)).length;
  console.log(`  ${a}→${b} แยก${n}: ครอบ ${f(100 * c / Y.length, 0)}% ของ ${Y.length} ·`, Object.entries(T).map(([k, v]) => `${k || 'ทั้งหมด'} ${f(q(v, .25), 0)}–${f(q(v, .75), 0)} (n ${v.length})`).join(' · ')) }
