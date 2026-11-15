// ทางสำรอง FWI/FFMC เมื่อเครื่องผู้ดูแลไม่ได้ดึง TFDRS (A5 ขั้น 2 ของ docs/review-2569-11-15.md — 15 พ.ย. 69)
// TFDRS (fdrs.forest.go.th) ไม่อนุญาตเครื่อง GitHub → ปกติดึงจากเครื่องผู้ดูแล (scripts/fwi_local.js) · ถ้าเครื่องปิดจนรอบใน data/fwi/index.json
// เก่ากว่า 2 วัน (เวลาไทย) สรุปประจำวัน LINE/Telegram จะไม่มี FWI → สคริปต์นี้ดึง "ค่าของวัน" จาก LFA (Land Fire Alerts Thailand, ThaiREN)
//   https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/raster/fdrs_<fwi|ffmc>/value?lat=&lon=
//   = API สาธารณะ (CORS *) ที่แสดงชั้น FDRS ของ TFDRS บนแผนที่ LFA — ไม่ใช่การเลี่ยงการกันบอตของ TFDRS (กติกาข้อ 10 ของ CLAUDE.md)
//   ไม่มีพยากรณ์ล่วงหน้า/อากาศเที่ยงวัน → สรุปประจำวันติดป้าย "ค่าของวัน ไม่มีพยากรณ์"
// จุดตัวอย่างทุก 0.1° ในแต่ละพื้นที่อนุรักษ์ (ห่างกว่า sync_fwi ที่ 0.02° เพื่อลดคำขอ: ~60 จุด × 2 ค่า) · สรุปรูปแบบเดียวกับ index.json days[].a
//   → data/fwi/lfa.json { v, src, d (วันที่ของค่า เวลาไทย), upd (updated_at ของ LFA), at, step, n, a: { all|ky|tl|…: { FWI|FFMC: [เฉลี่ย, ต่ำสุด, สูงสุด, สัดส่วน 5 ระดับ] } } }
// ใช้: node scripts/fwi_lfa.js [--force]   (--force = ดึงแม้รอบ TFDRS ยังไม่เก่า) · workflow wx รันทุกรอบ (ไม่เข้าเงื่อนไข = จบทันที ไม่ต่อเน็ต)
'use strict';
const fs = require('fs'), path = require('path');
const { GEO } = require('./lib/area');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'fwi'), OUT = path.join(DIR, 'lfa.json');
const API = process.env.LFA_API || 'https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/raster/';
const FORCE = process.argv.includes('--force'), STEP = 0.1, VARS = { FWI: 'fdrs_fwi', FFMC: 'fdrs_ffmc' };
const LNK = { ky: 'อุทยานแห่งชาติเขาใหญ่', tl: 'อุทยานแห่งชาติทับลาน', ps: 'อุทยานแห่งชาติปางสีดา', tp: 'อุทยานแห่งชาติตาพระยา', dy: 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', ks: 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าโคกสูง', kc: 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าเขาฉกรรจ์' };
const BOUNDS0 = { FWI: [17, 31, 40, 54], FFMC: [87, 90, 93, 98] };
const thDate = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);
const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return null } };
const cat = (v, b) => v < b[0] ? 0 : v < b[1] ? 1 : v < b[2] ? 2 : v < b[3] ? 3 : 4;
const r1 = x => Math.round(x * 10) / 10;

// รอบ TFDRS ใน index.json เก่ากว่า 2 วัน (เวลาไทย) = เกณฑ์เดียวกับ health fwi (lag ≥ 2)
function stale(idx, now = Date.now()) { return !idx || !idx.run || (Date.parse(thDate(now)) - Date.parse(idx.run)) / 864e5 >= 2 }

// จุดตัวอย่างในแต่ละพื้นที่ (จุดกึ่งกลางกรอบถ้าพื้นที่เล็กกว่าช่อง) · all = ทุกพื้นที่รวมกัน
const inside = (q, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > q[1]) !== (r[j][1] > q[1]) && q[0] < (r[j][0] - r[i][0]) * (q[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c };
const inFeat = (q, f) => f.geometry.coordinates.some(p => inside(q, p[0]) && !p.slice(1).some(r => inside(q, r)));
function samples(step = STEP) {
  const A = { all: [] };
  for (const [k, nm] of Object.entries(LNK)) {
    const f = GEO.cons.features.find(f => f.properties.name === nm); if (!f) continue;
    const bb = [1e9, 1e9, -1e9, -1e9]; f.geometry.coordinates.forEach(p => p[0].forEach(([x, y]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y) }));
    const P = []; for (let x = Math.ceil(bb[0] / step) * step; x <= bb[2]; x += step) for (let y = Math.ceil(bb[1] / step) * step; y <= bb[3]; y += step) if (inFeat([x, y], f)) P.push([r1(x * 100) / 100, r1(y * 100) / 100]);
    if (!P.length) P.push([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]);
    A[k] = P; A.all.push(...P);
  }
  return A;
}
// V = { FWI: Map("lon,lat" → ค่า), … } → สรุปต่อพื้นที่แบบ sync_fwi.stats
function summarize(A, V, bounds = BOUNDS0) {
  const out = {};
  for (const [k, P] of Object.entries(A)) {
    const o = {};
    for (const v of Object.keys(V)) {
      let s = 0, n = 0, lo = Infinity, hi = -Infinity; const c = [0, 0, 0, 0, 0], b = bounds[v];
      for (const [x, y] of P) { const z = V[v].get(x + ',' + y); if (z == null || !isFinite(z)) continue; s += z; n++; if (z < lo) lo = z; if (z > hi) hi = z; if (b) c[cat(z, b)]++ }
      if (!n) continue;
      o[v] = [r1(s / n), r1(lo), r1(hi)]; if (b) o[v].push(c.map(x => Math.round(x / n * 1000) / 1000));
    }
    out[k] = o;
  }
  return out;
}
async function value(layer, lon, lat) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${API}${layer}/value?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(20e3) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); return { v: typeof j.value === 'number' ? j.value : null, u: j.updated_at };
    } catch (e) { if (a === 2) throw e; await new Promise(r => setTimeout(r, 2000 * (a + 1))) }
  }
}

async function main() {
  const idx = readJ(path.join(DIR, 'index.json')), now = Date.now();
  if (!FORCE && !stale(idx, now)) { console.log(`รอบ TFDRS ${idx.run} ยังไม่เก่ากว่า 2 วัน — ไม่ดึง LFA`); return }
  const A = samples(), pts = A.all, bounds = { ...BOUNDS0, ...((idx && idx.bounds) || {}) };
  // ตรวจวันของค่าที่ LFA มีก่อน (คำขอเดียว) — ตรงกับ lfa.json เดิม = จบ
  const p0 = await value(VARS.FWI, pts[0][0], pts[0][1]), upd = p0.u ? new Date(p0.u * 1000).toISOString() : null, d = upd ? thDate(Date.parse(upd)) : thDate(now);
  const old = readJ(OUT);
  if (!FORCE && old && old.upd === upd) { console.log(`LFA ยังเป็นค่าของ ${d} (${upd}) — มีใน lfa.json แล้ว`); return }
  const V = {}; let fail = 0;
  for (const [k, layer] of Object.entries(VARS)) {
    V[k] = new Map();
    for (let i = 0; i < pts.length; i += 4) await Promise.all(pts.slice(i, i + 4).map(async ([x, y]) => {
      try { const r = await value(layer, x, y); if (r.v != null) V[k].set(x + ',' + y, r.v) } catch (e) { fail++ }
    }));
  }
  if (!V.FWI.size) throw new Error(`LFA ไม่ตอบค่า FWI เลย (${fail} คำขอล้ม)`);
  const a = summarize(A, V, bounds);
  fs.writeFileSync(OUT, JSON.stringify({ v: 1, src: 'Land Fire Alerts Thailand (wildlandfire.thairen.net.th) ชั้น FDRS — ค่าของ TFDRS กรมป่าไม้', d, upd, at: new Date(now).toISOString(), step: STEP, n: pts.length, fail, a }));
  console.log(`บันทึก data/fwi/lfa.json ค่าของ ${d}: FWI กลุ่มป่า เฉลี่ย ${a.all.FWI[0]} สูงสุด ${a.all.FWI[2]} · FFMC ${a.all.FFMC ? a.all.FFMC[0] : '-'} · ${pts.length} จุด${fail ? ` (ล้ม ${fail} คำขอ)` : ''}`);
}
module.exports = { stale, samples, summarize, LNK };
if (require.main === module) main().catch(e => { console.error('ผิดพลาด:', e.message); process.exit(1) });
