// F2 ตรวจย้อนหลังดัชนีเสี่ยงไฟป่า (scripts/lib/risk.js) กับไฟจริงปีงบ 2569 — รันมือ ไม่อยู่ใน Actions
// ใช้: node scripts/risk_backtest.js [--test 2569] [--out data/risk/backtest_2569.json]
//  1) หน่วยพื้นที่ = ตำบล (ช่อง tm ของจุด "ตำบล|อำเภอ") และแปลงสถานีฯ (ช่อง st) ที่เคยมีจุดใน adata/hdata — จุดเฉพาะในแนวเขตกลุ่มป่า · ไม่รวม ขสป.ดงใหญ่ (กติกา dyAS)
//     ตำแหน่งของหน่วย (ใช้ดึงอากาศ) = ค่าเฉลี่ยพิกัดจุดความร้อนในหน่วย (= ส่วนที่เป็นป่า) ปัดเข้ากริด ERA5 0.25°
//  2) ไฟจริง = หน่วย-วัน (วันที่ไทย) ที่มีจุด ≥1: "all" = adata ทุกดาวเทียม (API ไทย + NASA FIRMS) · "dnp" = hdata (Excel กรมอุทยานฯ SNPP)
//  3) อากาศย้อนหลัง = ERA5 จาก Open-Meteo archive (รายวัน: Tmax, RHmin, ลมสูงสุด, ฝนรวม ≈ ค่าตอนบ่าย) → FWI คำนวณเองด้วย risk.fwiDay
//     (ระบบจริงจะใช้ FWI พยากรณ์ของ TFDRS — ไม่มีคลังย้อนหลัง จึงตรวจด้วย ERA5 = "พยากรณ์สมบูรณ์" ผลจริงจะต่ำกว่านี้)
//     VR (GFS) ไม่มีคลังย้อนหลัง → ตรวจไม่ได้ ไม่ใส่ในโมเดล
//  4) fit สัมประสิทธิ์จากปีงบ 2561–2568 (ความถี่ในอดีตแบบตัดปีตัวเองออก) → ทดสอบปีงบ 2569 ด้วยความถี่จาก 2561–2568 (ไม่เห็นข้อมูลปีทดสอบ)
// แคชอากาศ: RISK_CACHE (ค่าเริ่มต้น <tmp>/fire-risk-era5.json)
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('./lib/risk'), { block } = require('./lib/area');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d };
const TEST = +arg('--test', 2569), OUT = arg('--out', path.join(ROOT, 'data', 'risk', `backtest_${TEST}.json`));
const CACHE = process.env.RISK_CACHE || path.join(os.tmpdir(), 'fire-risk-era5.json');
const SEASON = new Set([11, 0, 1, 2, 3]); // ธ.ค.–เม.ย. (getUTCMonth)
const W0 = '2017-04-01'; // เริ่มคำนวณ FWI ก่อนปีงบ 2561 ครึ่งปี (ให้ DC/DMC ตั้งตัว)

const H = JSON.parse(block('hdata')[1]), A = JSON.parse(block('adata')[1]);
// r[0] = วันนับจาก 1970, r[1] = hhmm เวลาไทย (ตรวจแล้ว: ช่วงที่ดาวเทียมผ่าน ~01:30/13:30) → วันที่ไทย = r[0]
const dy = (ar, st) => /ดงใหญ่/.test(ar) || ((!ar || ar === 'นอกพื้นที่อนุรักษ์') && /ดงใหญ่/.test(st || ''));
// hdata: [day,hhmm,la,lo,pv,am,tm,ar,ld,fu,st,sb] · adata: [day,hhmm,la,lo,sat,cf,pv,am,tm,ar,st,sb,dnp,(firms)]
const recs = [];
for (const r of H.r) recs.push({ src: 'dnp', d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, tm: H.tm[r[6]], ar: H.ar[r[7]], st: H.st[r[10]] });
for (const r of A.r) recs.push({ src: 'all', d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, tm: A.tm[r[8]], ar: A.ar[r[9]], st: A.st[r[10]] });
const use = recs.filter(x => !dy(x.ar || '', x.st || '') && R.fyOf(x.d) >= 2561 && R.fyOf(x.d) <= TEST);
const noSt = s => !s || /^(ไม่มี|-|ไม่ระบุ)/.test(s);

function units(kind) {
  const key = x => kind === 'tm' ? (x.tm || '').trim() : noSt(x.st) ? '' : x.st.trim();
  const U = {}; for (const x of use) { const k = key(x); if (!k) continue; const u = U[k] || (U[k] = { n: 0, la: 0, lo: 0, fire: { all: new Set(), dnp: new Set() } }); u.n++; u.la += x.la; u.lo += x.lo; u.fire[x.src].add(x.d) }
  for (const k in U) { const u = U[k]; u.la /= u.n; u.lo /= u.n; u.g = `${(Math.round(u.la * 4) / 4).toFixed(2)},${(Math.round(u.lo * 4) / 4).toFixed(2)}` }
  return U;
}

async function era5(grids) {
  let C = {}; try { C = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch (e) { }
  const [, b1] = R.fyDays(TEST), end = new Date(b1 * 864e5).toISOString().slice(0, 10);
  const need = grids.filter(g => !C[g] || C[g].end < end);
  for (let i = 0; i < need.length; i += 6) {
    const gs = need.slice(i, i + 6), la = gs.map(g => g.split(',')[0]).join(','), lo = gs.map(g => g.split(',')[1]).join(',');
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}&start_date=${W0}&end_date=${end}&daily=temperature_2m_max,relative_humidity_2m_min,wind_speed_10m_max,precipitation_sum&timezone=Asia%2FBangkok`;
    let j; for (let t = 0; t < 4 && !j; t++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(120e3) }); if (r.status === 429) { console.log('  429 รอ 65 วิ'); await new Promise(s => setTimeout(s, 65e3)); continue } if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)); j = await r.json() } catch (e) { console.log('  ลองใหม่', e.message); await new Promise(s => setTimeout(s, 5e3 * (t + 1))) } }
    if (!j) throw new Error('ดึง ERA5 ไม่ได้');
    (Array.isArray(j) ? j : [j]).forEach((x, k) => { const d = x.daily; C[gs[k]] = { end, t0: d.time[0], t: d.temperature_2m_max, h: d.relative_humidity_2m_min, w: d.wind_speed_10m_max, p: d.precipitation_sum } });
    fs.writeFileSync(CACHE, JSON.stringify(C)); console.log(`  ERA5 ${Math.min(i + 6, need.length)}/${need.length} กริด`);
  }
  const F = {};
  for (const g of grids) {
    const c = C[g], la = +g.split(',')[0], d0 = Date.parse(c.t0 + 'T00:00Z') / 864e5, out = {}; let prev = null;
    for (let i = 0; i < c.t.length; i++) {
      if (c.t[i] == null || c.h[i] == null) { prev = null; continue }
      const day = d0 + i, m = new Date(day * 864e5).getUTCMonth() + 1;
      prev = R.fwiDay(prev, { t: c.t[i], h: c.h[i], w: c.w[i] || 0, p: c.p[i] || 0 }, la, m); out[day] = prev;
    }
    F[g] = out;
  }
  return F;
}

function rows(U, F, fys, climOf, src) {
  const X = [], y = [], meta = [], names = Object.keys(U);
  for (const fy of fys) {
    const cl = climOf(fy), [a, b] = R.fyDays(fy);
    for (const k of names) {
      const u = U[k], f = u.fire[src], Fw = F[u.g];
      for (let d = a; d <= b; d++) {
        const w = Fw[d]; if (!w) continue;
        const rec = f.has(d - 1) || f.has(d - 2) || f.has(d - 3);
        X.push(R.feats(cl.u[k][R.dekad(d)], w.fwi, rec)); y.push(f.has(d) ? 1 : 0); meta.push({ k, d, s: SEASON.has(new Date(d * 864e5).getUTCMonth()) });
      }
    }
  }
  return { X, y, meta };
}

const MODELS = { M0: { n: 'ความถี่ในอดีตอย่างเดียว', c: [0, 1] }, M1: { n: 'ความถี่ในอดีต + FWI', c: [0, 1, 2] }, M2: { n: 'ความถี่ในอดีต + FWI + จุด 3 วันก่อน', c: [0, 1, 2, 3] }, MF: { n: 'FWI อย่างเดียว', c: [0, 2] }, MR: { n: 'จุด 3 วันก่อนอย่างเดียว', c: [0, 3] } };
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] };
const r3 = v => +(+v).toPrecision(3);

function evaluate(kind, U, F, src) {
  const names = Object.keys(U), TR = []; for (let y = 2561; y < TEST; y++) TR.push(y);
  const fire = Object.fromEntries(names.map(k => [k, U[k].fire[src]]));
  const clim = {}, climOf = fy => clim[fy] || (clim[fy] = R.climBuild(fire, names, fy === TEST ? TR : TR.filter(y => y !== fy)));
  const tr = rows(U, F, TR, climOf, src), te = rows(U, F, [TEST], climOf, src);
  const res = { kind, src, units: names.length, train: { n: tr.y.length, fire: tr.y.reduce((a, b) => a + b, 0) }, test: { n: te.y.length, fire: te.y.reduce((a, b) => a + b, 0) }, models: {} };
  for (const [m, def] of Object.entries(MODELS)) {
    const b = R.fitLogit(tr.X, tr.y, def.c), pt = te.X.map(x => R.prob(x, b)), ptr = tr.X.map(x => R.prob(x, b));
    const si = te.meta.map((x, i) => x.s ? i : -1).filter(i => i >= 0);
    const trs = tr.meta.map((x, i) => x.s ? ptr[i] : -1).filter(v => v >= 0);
    // เกณฑ์ระดับจากปีที่ใช้ fit (ฤดูไฟ ธ.ค.–เม.ย.): ควอนไทล์ 50/75/90/97% → ระดับ 5 = 3% ของหน่วย-วันในฤดูที่เสี่ยงสุด
    const LV = [0.5, 0.75, 0.9, 0.97].map(p => r3(q(trs, p)));
    const lv = pt.map(p => R.level(p, LV));
    const TOPK = names.length >= 30 ? 10 : 2, byDay = {}; te.meta.forEach((x, i) => { (byDay[x.d] = byDay[x.d] || []).push(i) });
    let hit = 0, tot = 0, hitS = 0, totS = 0;
    for (const d in byDay) { const ix = byDay[d].slice().sort((a, b) => pt[b] - pt[a]), top = new Set(ix.slice(0, TOPK)); for (const i of ix) if (te.y[i]) { tot++; if (top.has(i)) hit++; if (te.meta[i].s) { totS++; if (top.has(i)) hitS++ } } }
    res.models[m] = {
      n: def.n, b: b.map(r3), LV,
      auc: r3(R.auc(pt, te.y)), aucSeason: r3(R.auc(si.map(i => pt[i]), si.map(i => te.y[i]))), aucTrain: r3(R.auc(ptr, tr.y)),
      brier: (o => ({ bs: r3(o.bs), bss: r3(o.bss) }))(R.brier(pt, te.y)),
      cm: R.confusion(lv, te.y, 4), cmSeason: R.confusion(si.map(i => lv[i]), si.map(i => te.y[i]), 4),
      top10: { k: TOPK, hit, tot, rate: tot ? r3(hit / tot) : null, season: totS ? r3(hitS / totS) : null }
    };
  }
  return res;
}

(async () => {
  console.log(`ระเบียนที่ใช้ ${use.length} (ไม่รวมดงใหญ่, ปีงบ 2561–${TEST})`);
  const UT = units('tm'), US = units('st');
  console.log(`หน่วย: ตำบล ${Object.keys(UT).length} · แปลงสถานีฯ ${Object.keys(US).length}`);
  const grids = [...new Set([...Object.values(UT), ...Object.values(US)].map(u => u.g))];
  console.log(`กริด ERA5 ${grids.length} จุด`);
  const F = await era5(grids);
  const out = { generated: new Date().toISOString(), test: TEST, note: 'ERA5 (Open-Meteo archive) Tmax/RHmin/ลมสูงสุด/ฝนรวมรายวัน → FWI ด้วย risk.fwiDay · fit ปีงบ 2561–' + (TEST - 1) + ' ทดสอบปีงบ ' + TEST, res: [] };
  for (const [kind, U] of [['ตำบล', UT], ['แปลงสถานีฯ', US]]) for (const src of ['all', 'dnp']) {
    const r = evaluate(kind, U, F, src); out.res.push(r);
    console.log(`\n## ${kind} · ไฟจริง=${src === 'all' ? 'ทุกดาวเทียม (adata)' : 'กรมอุทยานฯ (hdata)'} · หน่วย ${r.units} · fit ${r.train.n}/${r.train.fire} · ทดสอบ ${r.test.n} หน่วย-วัน มีไฟ ${r.test.fire}`);
    for (const [m, x] of Object.entries(r.models)) console.log(`${m} ${x.n}: AUC ${x.auc} (ฤดูไฟ ${x.aucSeason}, ปีที่ fit ${x.aucTrain}) · BSS ${x.brier.bss} · ${x.top10.k} อันดับ ${x.top10.hit}/${x.top10.tot} (${x.top10.rate}) · b=${x.b.join(',')} · LV=${x.LV.join(',')} · ≥สูง: TP ${x.cm.tp} FP ${x.cm.fp} FN ${x.cm.fn} TN ${x.cm.tn} POD ${x.cm.pod.toFixed(2)} FAR ${x.cm.far.toFixed(2)}`);
  }
  out.units = { tm: Object.fromEntries(Object.entries(UT).map(([k, u]) => [k, [+u.la.toFixed(4), +u.lo.toFixed(4), u.n]])), st: Object.fromEntries(Object.entries(US).map(([k, u]) => [k, [+u.la.toFixed(4), +u.lo.toFixed(4), u.n]])) };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('\nบันทึก', path.relative(ROOT, OUT));
})().catch(e => { console.error(e); process.exit(1) });
