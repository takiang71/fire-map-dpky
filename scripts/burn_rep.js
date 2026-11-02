// พื้นที่เผาซ้ำซาก: รวมรอยเผาไหม้ทุกรอบที่ sync_burn เก็บไว้ (b4 ราย 7 วัน + c แยกประเภทรายเดือน/รายฤดู) เป็นรายปีงบ แล้วนับว่าแต่ละพิกเซล 20 ม. ไหม้กี่ปีงบ
// ใช้: node scripts/burn_rep.js (sync_burn.js เรียกต่อท้ายให้เองทุกรอบ)
//  - ปีงบของรอบ = ปีงบของวันกลางรอบ (เหมือน bnFY ในหน้าเว็บ) · ปีงบ 2567 มีแค่ชุด c (ข้อมูลเริ่ม ธ.ค. 66) · b4 เริ่ม ม.ค. 68
//  - ผลลัพธ์ data/burn/rep.json: { fy: [ปีงบ…], n: 8, g: {กริด: {z, x0, y0, px, r: [dy, dx, ยาว, mask, b4, ar, st, cl, …]}} }
//    mask = บิตของปีงบที่ไหม้ (บิต i = fy[i]) · b4 = บิตของปีงบที่พบในชุดราย 7 วันด้วย (หน้าเว็บแยกให้เห็นว่ายอดรายปีมาจากชุดไหน — ชั้นพื้นที่เผาไหม้สะสมปีงบใช้ราย 7 วันอย่างเดียว) · cl = ประเภทพื้นที่จากชุด c รอบล่าสุดที่พบ (1 ป่าไม้, 2–5 เกษตร, 0 = ไม่ทราบ — พบเฉพาะใน b4)
//    run-length แบบเดียวกับไฟล์รายรอบ (dy = แถวห่างจากรันก่อน, dx = คอลัมน์ห่างจากท้ายรันก่อนถ้าแถวเดียวกัน ไม่งั้นนับจาก 0)
//  - index.json ช่อง rep = { sig, fy, upd } ให้หน้าเว็บรู้ว่ามีไฟล์และใช้ sig กันแคชเก่า
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'data', 'burn'), IDX = path.join(DIR, 'index.json');
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
const fyOf = p => { const x = new Date(Math.floor((day(p.d0) + day(p.d1)) / 2) * 864e5); return x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0) };
const writeSafe = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f) };

function build() {
  const I = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  const L = [...(I.periods || []).map(p => ({ ...p, dir: 'b4' })), ...(I.cls || []).map(p => ({ ...p, dir: 'c' }))].map(p => ({ ...p, F: fyOf(p) }));
  const fy = [...new Set(L.map(p => p.F))].sort();
  // c ก่อน b4 และเรียงตามเวลา เพื่อให้ cl เป็นประเภทของรอบล่าสุด
  L.sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'c' ? -1 : 1) || (a.d0 < b.d0 ? -1 : 1));
  const G = {};
  for (const p of L) {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, p.dir, p.p + '.json'), 'utf8')), bit = 1 << fy.indexOf(p.F), C = p.dir === 'c';
    for (const g in f.g) {
      const o = f.g[g], P = G[g] || (G[g] = { z: o.z, x0: o.x0, y0: o.y0, px: o.px, m: new Map() }), r = o.r;
      if (P.x0 !== o.x0 || P.y0 !== o.y0 || P.px !== o.px) throw new Error(g + ' ' + p.p + ': ตารางพิกเซลไม่ตรงกับรอบอื่น');
      let y = 0, x = 0, le = 0;
      for (let i = 0; i < r.length; i += 6) {
        if (r[i]) { y += r[i]; x = r[i + 1] } else x = le + r[i + 1];
        const n = r[i + 2], v = r[i + 3], a = r[i + 4], s = r[i + 5]; le = x + n;
        for (let j = 0; j < n; j++) {
          const k = y * 8192 + x + j, q = P.m.get(k);
          if (q) { q[0] |= bit; if (C) q[3] = v; else q[4] |= bit } else P.m.set(k, [bit, a, s, C ? v : 0, C ? 0 : bit]);
        }
      }
    }
  }
  const out = { fy, n: 8, g: {} }, cnt = {};
  for (const g in G) {
    const P = G[g], r = [];
    let ly = 0, le = 0;
    for (const k of [...P.m.keys()].sort((a, b) => a - b)) {
      const [m, a, s, c, b4] = P.m.get(k), y = Math.floor(k / 8192), x = k % 8192, n = r.length;
      let b = 0; for (let t = m; t; t >>= 1) b += t & 1; cnt[b] = (cnt[b] || 0) + 1;
      if (n && y === ly && x === le && r[n - 5] === m && r[n - 4] === b4 && r[n - 3] === a && r[n - 2] === s && r[n - 1] === c) { r[n - 6]++; le++; continue }
      r.push(y - ly, y === ly && n ? x - le : x, 1, m, b4, a, s, c); ly = y; le = x + 1;
    }
    out.g[g] = { z: P.z, x0: P.x0, y0: P.y0, px: P.px, r };
  }
  const s = JSON.stringify(out);
  writeSafe(path.join(DIR, 'rep.json'), s);
  // sig = ขนาด + ผลรวมอักขระแบบง่าย (เปลี่ยนเมื่อเนื้อหาเปลี่ยน)
  let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const I2 = JSON.parse(fs.readFileSync(IDX, 'utf8')), sig = s.length + ':' + h.toString(36);
  if (!I2.rep || I2.rep.sig !== sig) { I2.rep = { fy, sig, upd: new Date().toISOString() }; writeSafe(IDX, JSON.stringify(I2)) } // ไม่เปลี่ยน = ไม่แตะ index (กัน commit ทุกรอบ sync)
  const rai = Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k + ' ปี', Math.round(v * 0.25).toLocaleString()]));
  console.log(`พื้นที่เผาซ้ำซาก: ปีงบ ${fy.join(', ')} · ${(s.length / 1024).toFixed(0)} KB · ไร่ตามจำนวนปีที่ไหม้`, rai);
}

module.exports = { build };
if (require.main === module) build();
