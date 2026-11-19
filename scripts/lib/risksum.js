// F2 ดัชนีเสี่ยงไฟป่าล่วงหน้า (ดัชนีของระบบนี้ ไม่ใช่ค่าทางการ) — คำนวณวันนี้/พรุ่งนี้ต่อตำบลและแปลงสถานีฯ ด้วยโมเดล M2 ใน lib/risk.js (ผู้ใช้อนุมัติ 16 พ.ย. 69)
// build_site.js เขียนผลเป็น _site/risk.json (หน้าเว็บชั้น rk-* + ตาราง 10 อันดับ) · telegram_notify/line_notify ใช้ riskLine() ในสรุปประจำวัน
//  ตัวแปร: ความถี่ในอดีต (adata ทุกดาวเทียม ปีงบ 2561 – ปีงบก่อน) · FWI ของ TFDRS วันนั้น (ตาราง data/fwi/g/<วันที่>.json ที่จุดกลางหน่วย; ไม่มีตาราง = ค่าเฉลี่ยกลุ่มป่าใน data/fwi/index.json)
//          · จุดความร้อนในหน่วยภายใน 3 วันก่อน (adata + live.json)
//  หน่วย: ตำบล ("ตำบล|อำเภอ" ของจุด) ที่เคยมีจุดในแนวเขต + แปลงสถานีฯ ปัจจุบัน (geo.resp) · ไม่รวม ขสป.ดงใหญ่ (dyAS) · ตำแหน่ง = ค่าเฉลี่ยพิกัดจุดในหน่วย (ส่วนที่เป็นป่า)
const fs = require('fs'), path = require('path');
const R = require('./risk'), { ROOT, block, GEO, where, WATCH } = require('./area');
const WA_PRE = 'พื้นที่เฝ้าระวังพิเศษ '; // ป้ายเดียวกับ tamroypao.WA_PRE
const DY = /ดงใหญ่/, dy = (ar, st) => DY.test(ar || '') || ((!ar || ar === 'นอกพื้นที่อนุรักษ์') && DY.test(st || ''));
const iso = d => new Date(d * 864e5).toISOString().slice(0, 10), dayOf = s => Date.parse(s.slice(0, 10) + 'T00:00Z') / 864e5;
const r4 = v => Math.round(v * 1e4) / 1e4, r1 = v => v == null ? null : Math.round(v * 10) / 10;
const stNorm = s => String(s || '').replace(/\s*\(พื้นที่รอง\)/, '').trim();

// จุดย้อนหลัง (adata) + live.json → [{d, la, lo, tm, st}]
function points(liveFeats) {
  const A = JSON.parse(block('adata')[1]), out = [];
  for (const r of A.r) { const ar = A.ar[r[9]], st = A.st[r[10]]; if (!dy(ar, st)) out.push({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, tm: A.tm[r[8]], st }) }
  for (const f of liveFeats || []) {
    const p = f.properties || {}, c = f.geometry && f.geometry.coordinates; if (!c || !p.full_date) continue;
    const w = where(c[0], c[1]) || {}; if (dy(w.ar, w.st)) continue;
    out.push({ d: dayOf(String(p.full_date)), la: c[1], lo: c[0], tm: p.subdistrict_name_th ? `${p.subdistrict_name_th}|${p.district_name_th || ''}` : '', st: w.st || '', live: 1 });
  }
  // พื้นที่เฝ้าระวังพิเศษ (ผู้ใช้ขอ 19 พ.ย. 69): จุดจากไฟล์ (wdata ทุกดาวเทียม ปีงบ 2561–) + API (wadata) → หน่วยชนิด wa ของตัวเอง (ไม่ปนตำบล/สถานีฯ)
  try { const W = JSON.parse(block('wdata')[1]); for (const r of W.r) { const a = W.areas[r[9]]; if (a) out.push({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, wa: WA_PRE + a.n }) } } catch (e) { }
  try { const W = JSON.parse(block('wadata')[1]); for (const r of W.r) { const a = WATCH.find(x => x.id === W.ids[r[7]]); if (a) out.push({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, wa: WA_PRE + a.n }) } } catch (e) { }
  return out;
}
// หน่วย + วันที่มีจุด (ไม่นับซ้ำจุดเดียวกันจาก live ที่อยู่ใน adata แล้ว — นับเป็นวัน)
function units(P) {
  const ST = new Set(GEO.resp.features.map(f => stNorm(f.properties.station)).filter(s => !DY.test(s)));
  const mk = () => ({});
  const U = { tm: mk(), st: mk(), wa: mk() };
  for (const x of P) for (const [kind, k] of x.wa ? [['wa', x.wa]] : [['tm', (x.tm || '').trim()], ['st', stNorm(x.st)]]) {
    if (!k || /^ไม่ระบุ/.test(k) || (kind === 'st' && !ST.has(k))) continue;
    const u = U[kind][k] || (U[kind][k] = { n: 0, la: 0, lo: 0, fire: new Set() });
    if (!x.live) { u.n++; u.la += x.la; u.lo += x.lo }
    u.fire.add(x.d);
  }
  for (const kind in U) for (const k in U[kind]) { const u = U[kind][k]; if (!u.n) { delete U[kind][k]; continue } u.la /= u.n; u.lo /= u.n }
  return U;
}
// ตาราง FWI ของ TFDRS (base64 Int16LE ×q, -32768 = ไม่มีข้อมูล) → ค่าที่จุด (เซลล์ใกล้สุด; ไม่มีข้อมูล = เฉลี่ย 3×3)
function grid(dir, d) {
  let G; try { G = JSON.parse(fs.readFileSync(path.join(dir, 'g', d + '.json'), 'utf8')) } catch (e) { return null }
  if (!G.v || !G.v.FWI) return null;
  const b = Buffer.from(G.v.FWI, 'base64'), a = new Int16Array(b.buffer, b.byteOffset, b.length >> 1), q = G.q || 10;
  const at = (i, j) => i < 0 || j < 0 || i >= G.nx || j >= G.ny ? null : (v => v === -32768 ? null : v / q)(a[j * G.nx + i]);
  return { run: G.run, f: G.f, val(lo, la) {
    const i = Math.round((lo - G.x0) / G.dx), j = Math.round((la - G.y0) / G.dy), v = at(i, j); if (v != null) return v;
    const n = []; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const w = at(i + di, j + dj); if (w != null) n.push(w) }
    return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null;
  } };
}

/* now (ms) · live = features ของ live.json · fwiDir = data/fwi · nd = จำนวนวัน (วันนี้, พรุ่งนี้) */
function riskDays({ now = Date.now(), live = [], fwiDir = path.join(ROOT, 'data', 'fwi'), nd = 2 } = {}) {
  const today = Math.floor((now + 7 * 36e5) / 864e5), fyNow = R.fyOf(today), fys = [];
  for (let y = 2561; y < fyNow; y++) fys.push(y);
  const P = points(live), U = units(P);
  const clim = {}; for (const kind of ['tm', 'st', 'wa']) { const names = Object.keys(U[kind]); clim[kind] = R.climBuild(Object.fromEntries(names.map(k => [k, U[kind][k].fire])), names, fys) }
  let IX = null; try { IX = JSON.parse(fs.readFileSync(path.join(fwiDir, 'index.json'), 'utf8')) } catch (e) { }
  const days = [];
  for (let i = 0; i < nd; i++) {
    const d = today + i, ds = iso(d), G = grid(fwiDir, ds), ix = IX && (IX.days || []).find(x => x.d === ds), mean = ix && ix.a && ix.a.all && ix.a.all.FWI ? ix.a.all.FWI[0] : null;
    if (!G && mean == null) continue;
    const day = { d: ds, lead: i, src: G ? 'grid' : 'mean', run: G ? G.run : ix.run, f: G ? G.f : ix.f };
    for (const kind of ['tm', 'st', 'wa']) {
      const M = R.M[kind === 'wa' ? 'st' : kind]; /* wa = รูปแปลงเหมือนสถานีฯ → ใช้ค่าสัมประสิทธิ์ชุด st */
      day[kind] = Object.entries(U[kind]).map(([k, u]) => {
        const fw = G ? G.val(u.lo, u.la) : null, fwi = fw != null ? fw : mean, rec = u.fire.has(d - 1) || u.fire.has(d - 2) || u.fire.has(d - 3);
        const p = R.prob(R.feats(clim[kind].u[k][R.dekad(d)], fwi, rec), M.b);
        return [k, +u.la.toFixed(4), +u.lo.toFixed(4), R.level(p, M.LV), r4(p), r1(fwi), rec ? 1 : 0, r4(clim[kind].u[k][R.dekad(d)])];
      }).sort((a, b) => b[4] - a[4]);
    }
    days.push(day);
  }
  return { generated: new Date(now).toISOString(), model: R.M.v, note: 'ดัชนีเสี่ยงไฟป่าของระบบนี้ ไม่ใช่ค่าทางการ', LVN: R.LVN, cols: ['หน่วย', 'lat', 'lon', 'ระดับ 1–5', 'ความน่าจะเป็น', 'FWI', 'มีจุดใน 3 วันก่อน', 'ความถี่ในอดีต'], fys: [fys[0], fys[fys.length - 1]], days };
}

// บรรทัดสรุปประจำวัน: ตำบลระดับสูงมาก/สูงของวันนี้ (≤ max ชื่อ)
function riskLine(J, now = Date.now(), max = 5) {
  if (!J || !J.days || !J.days.length) return null;
  const today = new Date(now + 7 * 36e5).toISOString().slice(0, 10), D = J.days.find(x => x.d === today) || J.days[0], T = D.tm || [];
  const n5 = T.filter(x => x[3] === 5).length, n4 = T.filter(x => x[3] === 4).length, hi = T.filter(x => x[3] >= 4);
  const nm = x => { const [t, a] = x[0].split('|'); return `ต.${t}${a ? ' อ.' + a : ''}` };
  const lab = D.d === today ? 'วันนี้' : D.d;
  if (!hi.length) return { lab, n5, n4, text: `พื้นที่เสี่ยงไฟป่า${lab} (ดัชนีของระบบ ไม่ใช่ค่าทางการ): ไม่มีตำบลระดับสูงขึ้นไป · สูงสุด ${T[0] ? nm(T[0]) + ' (' + J.LVN[T[0][3] - 1] + ')' : '-'}` };
  return { lab, n5, n4, text: `พื้นที่เสี่ยงไฟป่า${lab} (ดัชนีของระบบ ไม่ใช่ค่าทางการ): สูงมาก ${n5} · สูง ${n4} ตำบล — ${hi.slice(0, max).map(nm).join(', ')}${hi.length > max ? ` และอีก ${hi.length - max}` : ''}` };
}
module.exports = { riskDays, riskLine, points, units, grid };
