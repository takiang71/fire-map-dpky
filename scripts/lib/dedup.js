// ตัดระเบียนซ้ำของ API จุดความร้อนไทย (Land Fire Alerts Thailand) — ใช้ใน sync_hotspots.js และ build_site.js (หน้าเว็บมีสำเนาเดียวกันชื่อ apiDups ใน index.html)
// ปัญหา (ตรวจ 11 พ.ย. 69 เทียบ NASA FIRMS): ช่วงประมาณ พ.ย. 68 – 4 มี.ค. 69 API ส่ง "ทั้งรอบดาวเทียม" มาสองชุด
//   ทุกจุดในรอบมีคู่แฝด unique_id ต่างกัน ตำแหน่งเหลื่อมกันคงที่ทั้งรอบ ~10–250 หน่วย (1e-5° ≈ 1.1 ม.) เวลาเท่ากันหรือต่าง 1–3 นาที
//   รอบปกติ (ตั้งแต่ 9 มี.ค. 69) มีจุดที่ห่างกัน <250 หน่วยแค่ 3–26% ของรอบ (จุดข้างเคียงจริงที่ขอบแนวสแกน) แต่รอบที่ซ้ำมี 90–100%
// วิธี: แบ่งรอบดาวเทียม (ดวงเดียวกัน จุดเวลาห่างกันไม่เกิน 6 นาทีต่อเนื่อง) → สัดส่วนจุดที่มีคู่ <TW ภายใน ±DT นาที
//   รอบซ้ำ = สัดส่วน ≥ RATIO และ (รอบมี ≥ MINN จุด หรือทั้งชุดข้อมูลเป็นแบบซ้ำ — รอบเล็กตัดสินจากรอบเดียวไม่ได้)
//   ในรอบซ้ำจับคู่ใกล้สุดก่อนแบบหนึ่งต่อหนึ่ง (<PAIR, ±DT นาที) ทิ้งระเบียนเวลาเร็วกว่า เวลาเท่ากันทิ้งระเบียนที่มาก่อนในคำตอบ
//   (เลือกแบบนี้เพราะตำแหน่งที่เหลือใกล้ FIRMS ที่สุด: เฉลี่ย 42 หน่วย)
// ผลกับวันที่มีคู่ใกล้กันในแนวเขต 66 วัน: API เกิน FIRMS 125 → 5 จุด, ตัดจุดจริงพลาด 2 จุด (เกณฑ์เดิม <150 หน่วย/1–3 นาที เหลือเกิน 62 จุด)
const O = { TW: 250, DT: 3, PAIR: 450, RATIO: 0.6, MINN: 30, ALLN: 20, GAP: 6 };

// P = [{s: ดาวเทียม, m: เวลาเป็นนาที (นับต่อเนื่อง), la, lo: หน่วย 1e-5°}] ตามลำดับในคำตอบ API → Set ของดัชนีที่ควรทิ้ง
function apiDups(P, o = O) {
  const drop = new Set(), G = {}, passes = [];
  P.forEach((p, i) => (G[p.s] = G[p.s] || []).push({ ...p, i }));
  for (const s in G) {
    const L = G[s].sort((a, b) => a.m - b.m || a.i - b.i); let cur = [L[0]];
    for (let k = 1; k < L.length; k++) if (L[k].m - L[k - 1].m <= o.GAP) cur.push(L[k]); else { passes.push(cur); cur = [L[k]] }
    passes.push(cur);
  }
  // ตารางช่องละ PAIR หน่วย → หาเพื่อนบ้านเฉพาะ 3×3 ช่อง (ช่วงพีค 48 ชม. ทั้งประเทศ ~30,000 จุด)
  const grid = ps => { const g = new Map(); for (const p of ps) { const k = Math.floor(p.la / o.PAIR) + ',' + Math.floor(p.lo / o.PAIR); (g.get(k) || g.set(k, []).get(k)).push(p) } return g };
  const around = (g, p, f) => { const y = Math.floor(p.la / o.PAIR), x = Math.floor(p.lo / o.PAIR); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const c of g.get((y + i) + ',' + (x + j)) || []) if (c !== p && Math.abs(c.m - p.m) <= o.DT) f(c, Math.hypot(c.la - p.la, c.lo - p.lo)) };
  let tw = 0;
  const st = passes.map(ps => { const g = grid(ps); let n = 0; for (const a of ps) { let t = false; around(g, a, (c, dd) => { if (dd < o.TW) t = true }); if (t) n++ } tw += n; return { ps, g, r: n / ps.length } });
  const allDup = P.length >= o.ALLN && tw / P.length >= o.RATIO;
  for (const { ps, g, r } of st) {
    if (!(r >= o.RATIO && (ps.length >= o.MINN || allDup))) continue;
    const Q = [];
    for (const A of ps) around(g, A, (B, dd) => { if (A.i < B.i && dd < o.PAIR) Q.push([dd, A, B]) });
    const used = new Set();
    for (const [, A, B] of Q.sort((x, y) => x[0] - y[0] || x[1].i - y[1].i || x[2].i - y[2].i)) {
      if (used.has(A) || used.has(B)) continue; used.add(A); used.add(B);
      drop.add((A.m !== B.m ? A.m < B.m : A.i < B.i) ? A.i : B.i);
    }
  }
  return drop;
}

// ฟีเจอร์ GeoJSON ของ API (full_date เวลาไทย "YYYY-MM-DD HH:MM:SS") → Set ของดัชนีที่ควรทิ้ง
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
function featDups(F) {
  const P = [], ix = [];
  F.forEach((f, i) => {
    const p = f && f.properties, c = f && f.geometry && f.geometry.coordinates, fd = String(p && p.full_date || '');
    if (!c || fd.length < 16) return;
    P.push({ s: satKey(p.satellite_name), m: Date.UTC(+fd.slice(0, 4), +fd.slice(5, 7) - 1, +fd.slice(8, 10)) / 6e4 + +fd.slice(11, 13) * 60 + +fd.slice(14, 16), la: c[1] * 1e5, lo: c[0] * 1e5 }); ix.push(i);
  });
  return new Set([...apiDups(P)].map(k => ix[k]));
}

module.exports = { apiDups, featDups, O };
