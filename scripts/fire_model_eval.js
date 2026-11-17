// F5 ตรวจย้อนหลังโมเดลไฟ (วงรี 6 ชม. ในแผงรายละเอียดจุด) กับพื้นที่เผาไหม้ B4 จริง — รันมือ ไม่อยู่ใน Actions
// ใช้: node scripts/fire_model_eval.js [--fy 2568,2569] [--km 1] [--days 7] [--gap 1] [--hr 6] [--cache <โฟลเดอร์>] [--out <ไฟล์.json>] [--dry = นับคู่/คำขออากาศ ไม่ดึง]
//  1) จุด = adata ทุกดาวเทียม (VIIRS SNPP/NOAA-20/NOAA-21 + NASA FIRMS ที่เติม) ของปีงบที่เลือก ทุกพื้นที่ในแนวเขต (รวมดงใหญ่)
//  2) รอยเผา = data/burn/b4 ทุกรอบที่ช่วง [d0,d1] ทับ [วันพบจุด, วันพบจุด + --days] รวมพิกเซล 20 ม. (ไม่นับซ้ำ)
//     กลุ่มรอย = พิกเซลติดกัน 8 ทิศ ยอมช่องว่าง --gap พิกเซล · คู่ = กลุ่มรอยที่ใกล้จุดที่สุดภายใน --km (วัดถึงขอบพิกเซล)
//     ไร่จริง = จำนวนพิกเซลของกลุ่ม × 0.25 ไร่ · จุดนอกกริด B4 ที่ต้นทางผลิต = ไม่นับ
//  3) โมเดล = calc() ของหน้าเว็บ (ดึงโค้ดจาก index.html ด้วย lib/fmodel.js ไม่เขียนสูตรซ้ำ) ด้วย P แบบเดียวกับ openDetail:
//     hr 6 · เชื้อเพลิง fuelAt(geoAt, ความสูง, ftAt) · ความลาด/ทิศลาด slopeAt (DEM Terrarium ซูม 12 — sl = min(40, ปัด), asp เมื่อ ≥1°)
//     · อากาศ Open-Meteo Historical Forecast (ชุดโมเดลเดียวกับ /v1/forecast ที่หน้าเว็บใช้) ณ เวลาที่พบจุด (สอดแทรกรายชั่วโมง)
//     ต่างจากหน้าเว็บ: ความสูงสำหรับ fuelAt ใช้ DEM (หน้าเว็บใช้ elevation ของ Open-Meteo) · อากาศของช่อง 0.05° (หน้าเว็บใช้พิกัดจุด)
//     + โหมด Lagrangian: huy() + hyAdj() ด้วยลมรายชั่วโมงหลังเวลาพบจุด (WS เหมือนหน้าเว็บ)
//  4) อัตราส่วน = ไร่โมเดล / ไร่จริง · รายจุด และรายไฟ (กลุ่มรอยของจุดทับกัน = ไฟเดียวกัน → จุดแรกสุดเทียบไร่รวมของไฟ)
// ดึง Open-Meteo: รวมพิกัดคำขอละ ≤50 ช่อง ช่วง 14 วัน (= 1 call ต่อพิกัดตามเกณฑ์ ≤2 สัปดาห์) เว้น 7 วิ (<600 call/นาที) · แคชทุกอย่างใน --cache (ไม่ commit)
const fs = require('fs'), os = require('os'), path = require('path');
const { block, GEO } = require('./lib/area');
const { runs } = require('./lib/burnsum');
const { llToUTM } = require('./lib/tiff');
const { readPNG } = require('./lib/png');
const { loadModel } = require('./lib/fmodel');
const ROOT = path.join(__dirname, '..');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d };
const FYS = arg('--fy', '2568,2569').split(',').map(Number), KM = +arg('--km', 1), DAYS = +arg('--days', 7), GAP = +arg('--gap', 1), HR = +arg('--hr', 6);
const CACHE = arg('--cache', process.env.FME_CACHE || path.join(os.tmpdir(), 'fire-model-eval'));
const OUT = arg('--out', path.join(CACHE, `summary_g${GAP}_k${KM}_d${DAYS}.json`));
const WAIT = 7000, CHUNK = 50, RAI = 0.25, PX = 20;
fs.mkdirSync(path.join(CACHE, 'dem'), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
const iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
const fyOf = d => { const t = new Date(d * 864e5); return t.getUTCFullYear() + 543 + (t.getUTCMonth() >= 9 ? 1 : 0) };
const thd = (d, hm) => { const t = new Date(d * 864e5); return `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear() + 543} ${String(hm).padStart(4, '0').replace(/(..)(..)/, '$1:$2')}` };

// ---------- DEM Terrarium (ไทล์ชุดเดียวกับ demTile ของหน้าเว็บ) ----------
const DEMC = {};
function demTile(z, x, y) {
  const k = `${z}_${x}_${y}`;
  return DEMC[k] || (DEMC[k] = (async () => {
    const f = path.join(CACHE, 'dem', k + '.png');
    let buf; try { buf = fs.readFileSync(f) } catch (e) {
      const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('DEM HTTP ' + r.status); buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(f, buf);
    }
    const d = readPNG(buf).rgba, e = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) e[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    return e;
  })());
}

const M = loadModel({ GEO, demTile });
M.setFT(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ftype', 'ftype.json'), 'utf8')));
{ const t = M.calc({ hr: 6, fuel: 0, u: 11, from: 90, rh: 61, T: 32.3, sl: 4, asp: null }); if (Math.abs(t.Rh - 4.7) > 1e-9) throw new Error('ค่าทดสอบ 7.3 ไม่ได้หัวไฟ 4.7 ม./นาที: ' + t.Rh) }

// ---------- รอยเผา B4 ----------
const BD = path.join(ROOT, 'data', 'burn'), BI = JSON.parse(fs.readFileSync(path.join(BD, 'index.json'), 'utf8'));
const PER = BI.periods.map(p => ({ ...p, a: day(p.d0), b: day(p.d1) }));
const FILE = {}, file = p => FILE[p.p] || (FILE[p.p] = JSON.parse(fs.readFileSync(path.join(BD, 'b4', p.p + '.json'), 'utf8')));
// กรอบกริดที่ต้นทางผลิต (x0,y0 จากไฟล์รอบใดก็ได้) → ตรวจว่าจุดอยู่ในพื้นที่ที่ B4 มองเห็น
const GBOX = {};
for (const p of PER) { const f = file(p); for (const g in f.g) if (!GBOX[g]) { const o = f.g[g]; GBOX[g] = { z: o.z, e0: o.x0, e1: o.x0 + 5490 * o.px, n0: o.y0 - 5490 * o.px, n1: o.y0 } } }
const covered = (lo, la) => Object.values(GBOX).some(b => { const [E, N] = llToUTM(lo, la, b.z); return E >= b.e0 && E <= b.e1 && N >= b.n0 && N <= b.n1 });
const pk = (z, ix, iy) => z * 1e10 + iy * 1e5 + ix;   // ix = E/20, iy = N/20 (ขอบบนของพิกเซล) — กริดในโซนเดียวกันใช้ตารางเดียวกัน
const WIN = new Map();
function windowOf(ps) {
  const key = ps.map(p => p.p).join('+');
  if (WIN.has(key)) return WIN.get(key);
  const px = new Map();
  for (const p of ps) for (const o of runs(file(p))) { const G = o.G, iy = Math.round((G.y0 - o.y * G.px) / PX); for (let j = 0; j < o.n; j++) px.set(pk(G.z, Math.round((G.x0 + (o.x + j) * G.px) / PX), iy), 0) }
  // กลุ่มรอย: BFS ระยะ Chebyshev ≤ 1 + GAP
  const R = 1 + GAP, comp = new Map(), C = [];
  for (const k0 of px.keys()) {
    if (comp.has(k0)) continue;
    const id = C.length, list = [k0]; comp.set(k0, id);
    for (let q = 0; q < list.length; q++) { const k = list[q]; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const n = k + dy * 1e5 + dx; if ((dx || dy) && px.has(n) && !comp.has(n)) { comp.set(n, id); list.push(n) } } }
    C.push({ id, n: list.length, px: list });
  }
  // ดัชนีช่อง 1 กม. → พิกเซล
  const cell = new Map();
  for (const [k, id] of comp) { const z = Math.floor(k / 1e10), iy = Math.floor(k % 1e10 / 1e5), ix = k % 1e5, ck = `${z}|${Math.floor(ix * PX / 1000)}|${Math.floor(iy * PX / 1000)}`; (cell.get(ck) || cell.set(ck, []).get(ck)).push(id, ix, iy) }
  const w = { key, C, cell, zones: [...new Set([...px.keys()].map(k => Math.floor(k / 1e10)))] };
  WIN.set(key, w); if (WIN.size > 4) WIN.delete(WIN.keys().next().value); return w;
}
// กลุ่มรอยใกล้สุดภายใน KM → {c, dist, near: Map(กลุ่ม → ระยะ), px: พิกเซลในรัศมี}
function nearest(w, lo, la) {
  let best = null, px = 0; const near = new Map();
  for (const z of w.zones) {
    const [E, N] = llToUTM(lo, la, z), cx = Math.floor(E / 1000), cy = Math.floor(N / 1000), r = Math.ceil(KM) + 1;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const L = w.cell.get(`${z}|${cx + a}|${cy + b}`); if (!L) continue;
      for (let t = 0; t < L.length; t += 3) { const id = L[t], ix = L[t + 1], iy = L[t + 2], e0 = ix * PX, n1 = iy * PX, d = Math.hypot(Math.max(e0 - E, 0, E - e0 - PX), Math.max(n1 - PX - N, 0, N - n1)); if (d > KM * 1000) continue; px++; if (!(near.get(id) <= d)) near.set(id, d); if (!best || d < best.dist) best = { c: w.C[id], dist: d } }
    }
  }
  return best && { ...best, near, px };
}

// ---------- อากาศ Open-Meteo Historical Forecast ----------
const WXF = path.join(CACHE, 'wx.json');
let WX = {}; try { WX = JSON.parse(fs.readFileSync(WXF, 'utf8')) } catch (e) { }
const cellOf = (lo, la) => [(Math.round(la * 20) / 20).toFixed(2), (Math.round(lo * 20) / 20).toFixed(2)];
async function fetchWx(need) {   // need: Map(วันที่ → Set('la,lo')) · รวมเป็นช่วง 13 วัน (+1 วันท้ายสำหรับ 48 ชม.) = 14 วัน/คำขอ = 1 call ต่อพิกัด
  const B = new Map();
  for (const [d, set] of need) for (const c of set) if (!WX[d + '|' + c]) { const n = day(d.replace(/-/g, '')), k = Math.floor(n / 13), o = B.get(k) || B.set(k, { d0: k * 13, m: new Map() }).get(k); (o.m.get(c) || o.m.set(c, []).get(c)).push(n) }
  let calls = 0;
  for (const { d0, m } of B.values()) {
    const all = [...m.keys()];
    for (let i = 0; i < all.length; i += CHUNK) {
      const cs = all.slice(i, i + CHUNK), la = cs.map(c => c.split(',')[0]).join(','), lo = cs.map(c => c.split(',')[1]).join(',');
      const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&start_date=${iso(d0)}&end_date=${iso(d0 + 13)}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=Asia%2FBangkok`;
      for (let t = 0; ; t++) {
        const r = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch(e => ({ ok: false, status: e.message }));
        if (r.ok) {
          let j = await r.json(); j = Array.isArray(j) ? j : [j];
          j.forEach((x, k) => { const h = x.hourly; for (const n of m.get(cs[k])) { const o = (n - d0) * 24, sl = a => a.slice(o, o + 48); WX[iso(n) + '|' + cs[k]] = { t: sl(h.temperature_2m), rh: sl(h.relative_humidity_2m), ws: sl(h.wind_speed_10m), wd: sl(h.wind_direction_10m) } } });
          break;
        }
        if (t >= 3) throw new Error(`Open-Meteo ${r.status} (${iso(d0)})`);
        console.error(`  Open-Meteo ${r.status} — รอ 65 วิ แล้วลองใหม่`); await sleep(65000);
      }
      calls += cs.length; fs.writeFileSync(WXF, JSON.stringify(WX)); process.stderr.write(`  อากาศ ${iso(d0)}…${iso(d0 + 13)} ${cs.length} ช่อง (รวม ${calls} call)
`);
      await sleep(WAIT);
    }
  }
  return calls;
}
// ค่า ณ เวลา hh:mm (สอดแทรกเชิงเส้น · ทิศลมแบบเวกเตอร์หนึ่งหน่วย)
function wxAt(w, hm) {
  const x = Math.floor(hm / 100) + hm % 100 / 60, i = Math.floor(x), f = x - i, L = (a) => a[i] == null || a[i + 1] == null ? null : a[i] * (1 - f) + a[i + 1] * f;
  const r = Math.PI / 180, sx = Math.sin(w.wd[i] * r) * (1 - f) + Math.sin(w.wd[i + 1] * r) * f, cy = Math.cos(w.wd[i] * r) * (1 - f) + Math.cos(w.wd[i + 1] * r) * f;
  return { T: L(w.t), rh: L(w.rh), u: L(w.ws), from: (Math.atan2(sx, cy) / r + 360) % 360, WS: { u: w.ws.slice(i), d: w.wd.slice(i) } };
}

// ---------- สถิติ ----------
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = (s.length - 1) * p, i = Math.floor(k); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (k - i) };
const r3 = v => v == null ? null : +v.toPrecision(3);
const stat = rs => { const l = rs.map(Math.log); return { n: rs.length, p10: r3(q(rs, .1)), p25: r3(q(rs, .25)), med: r3(q(rs, .5)), p75: r3(q(rs, .75)), p90: r3(q(rs, .9)), gm: rs.length && rs.every(x => x > 0) ? r3(Math.exp(l.reduce((a, b) => a + b, 0) / l.length)) : null, in2: rs.length ? r3(rs.filter(x => x >= .5 && x <= 2).length / rs.length) : null, over: rs.length ? r3(rs.filter(x => x > 1).length / rs.length) : null } };

(async () => {
  const A = JSON.parse(block('adata')[1]), b4a = Math.min(...PER.map(p => p.a)), b4b = Math.max(...PER.map(p => p.b));
  const H = A.r.filter(r => FYS.includes(fyOf(r[0]))).map(r => ({ d: r[0], hm: r[1], la: r[2] / 1e5, lo: r[3] / 1e5, sat: A.sat[r[4]] + (r[13] ? ' (FIRMS)' : ''), ar: A.ar[r[9]] || '', st: A.st[r[10]] || '' }));
  const cnt = { all: H.length, noB4time: 0, noCover: 0, noScar: 0, pair: 0, noWx: 0 };
  const P = [];
  for (const h of H) {
    if (h.d < b4a || h.d + DAYS > b4b) { cnt.noB4time++; continue }   // ไม่มีรอบ B4 ครอบช่วง [d, d+DAYS] ครบ
    if (!covered(h.lo, h.la)) { cnt.noCover++; continue }
    const ps = PER.filter(p => p.a <= h.d + DAYS && p.b >= h.d); if (!ps.length) { cnt.noB4time++; continue }
    const w = windowOf(ps), m = nearest(w, h.lo, h.la);
    if (!m) { cnt.noScar++; continue }
    const nc = [...m.near.keys()].map(i => w.C[i]);
    P.push({ ...h, win: w.key, comp: m.c, dist: m.dist, rai: m.c.n * RAI, big: Math.max(...nc.map(c => c.n)) * RAI, all: nc.reduce((a, c) => a + c.n, 0) * RAI, r1: m.px * RAI, nc: nc.length, ncs: nc });
  }
  cnt.pair = P.length;
  console.error(`จุด ${cnt.all} · คู่กับรอยเผา ${cnt.pair} · ไม่พบรอย ${cnt.noScar} · นอกช่วงเวลา B4 ${cnt.noB4time} · นอกกริด B4 ${cnt.noCover}`);

  // อากาศ
  const need = new Map();
  for (const p of P) { p.wd = iso(p.d); p.cell = cellOf(p.lo, p.la).join(','); (need.get(p.wd) || need.set(p.wd, new Set()).get(p.wd)).add(p.cell) }
  if (process.argv.includes('--dry')) { let n = 0; for (const [, v] of need) n += v.size; console.log(`คู่ ${P.length} · วัน ${need.size} · พิกัด-วัน ${n} (ยังไม่มีในแคช ${[...need].reduce((a, [d, v]) => a + [...v].filter(c => !WX[d + '|' + c]).length, 0)}) `); return }
  const calls = await fetchWx(need);

  // โมเดลรายจุด
  for (const p of P) {
    const w = WX[p.wd + '|' + p.cell], x = w && wxAt(w, p.hm);
    if (!x || x.T == null || x.rh == null || x.u == null || isNaN(x.from)) { p.skip = 1; cnt.noWx++; continue }
    const s = await M.slopeAt(p.lo, p.la), g = M.geoAt(p.lo, p.la), ft = M.ftAt(p.lo, p.la), fu = M.fuelAt(g, s.el, ft);
    const prm = { sm: 'g', hr: HR, fuel: fu.i, u: x.u, from: x.from, rh: x.rh, T: x.T, sl: Math.min(40, Math.round(s.s)), asp: s.s >= 1 ? s.asp : null };
    const r = M.calc(prm);
    M.setP({ ...prm, sm: 'l' }, x.WS); const Hy = M.huy(r), ry = M.hyAdj(r, Hy);
    Object.assign(p, { T: x.T, rh: x.rh, u: x.u, from: x.from, sl: s.s, asp: s.asp, el: s.el, ft: ft ? ft.n : '', fuel: fu.i, fuelN: M.FUEL[fu.i].n, why: fu.why, E: r.E, Rh: r.Rh, m: r.rai, mh: ry.rai, ratio: r.rai / p.rai, ratioH: ry.rai / p.rai });
  }
  const OK = P.filter(p => !p.skip);

  // รายไฟ: กลุ่มรอยของจุดทับกัน (มีพิกเซลร่วม) และวันห่างกัน ≤ FDAY = ไฟเดียวกัน (กันรอยไหม้ซ้ำที่เดิมคนละปีถูกรวม)
  const FDAY = 14; OK.sort((a, b) => a.d - b.d || a.hm - b.hm);
  const par = OK.map((_, i) => i), fd = i => par[i] === i ? i : (par[i] = fd(par[i])), own = new Map();
  OK.forEach((p, i) => { for (const k of p.comp.px) { const j = own.get(k); if (j != null && p.d - OK[j].d <= FDAY) par[fd(i)] = fd(j); own.set(k, i) } });
  const FG = new Map(); OK.forEach((p, i) => { const r = fd(i); (FG.get(r) || FG.set(r, []).get(r)).push(p) });
  const fires = [...FG.values()].map(ms => {
    ms.sort((a, b) => a.d - b.d || a.hm - b.hm); const u = new Set(); ms.forEach(p => p.comp.px.forEach(k => u.add(k)));
    const f = ms[0], rai = u.size * RAI, u2 = new Set(); ms.forEach(p => { p.nf = ms.length; p.ncs.forEach(c => c.px.forEach(k => u2.add(k))) });
    const all = u2.size * RAI;
    return { first: f, n: ms.length, days: ms[ms.length - 1].d - f.d, rai, all, m: f.m, mh: f.mh, ratio: f.m / rai, ratioH: f.mh / rai, ratioAll: f.m / all, fuelN: f.fuelN, day: f.hm >= 600 && f.hm < 1800 };
  });

  const by = (xs, key, val) => { const o = {}; for (const x of xs) (o[key(x)] = o[key(x)] || []).push(val(x)); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, stat(v)])) };
  const isDay = p => p.hm >= 600 && p.hm < 1800;
  const ex = f => { const p = f.first; return { t: thd(p.d, p.hm), la: +p.la.toFixed(5), lo: +p.lo.toFixed(5), sat: p.sat, ar: p.ar, ft: p.ft || '(ไม่มีชนิดป่า)', fuel: p.fuelN, why: p.why, u: r3(p.u), from: Math.round(p.from), rh: r3(p.rh), T: r3(p.T), sl: r3(p.sl), E: r3(p.E), Rh: r3(p.Rh), m: Math.round(p.m), mh: Math.round(p.mh), real: f.rai, realAll: f.all, big: p.big, r1: p.r1, ratio: r3(f.ratio), n: f.n, days: f.days } };
  // ความไวต่อความชื้นจาก FFMC (ขั้น B ยังไม่ทำ — ไม่มีคลัง FFMC ของ TFDRS ช่วงนี้): ลม/ลาด/เชื้อเพลิงเท่าเดิม Rh ∝ η_M → พื้นที่ ∝ Rh² (L/B ไม่ขึ้นกับความชื้น)
  // m = 147.2·(101 − FFMC)/(59.5 + FFMC) (Van Wagner 1987) · Rh ต่ำสุด 0.05 ม./นาที ตาม calc
  const fsc = (p, m) => { const e0 = M.eta(p.E); if (!(e0 > 0)) return 1; const R = Math.max(.05, p.Rh * M.eta(m) / e0); return (R / p.Rh) ** 2 };   /* η เดิม 0 (ชื้นเกินจุดดับ) = ไม่รู้อัตราก่อนตัดขั้นต่ำ → คงเดิม */
  const ffmc = Object.fromEntries([75, 80, 85, 88, 90, 92].map(F => { const m = 147.2 * (101 - F) / (59.5 + F); return [F, { m: r3(m), hs: stat(OK.map(p => p.ratio * fsc(p, m))).med, r1: stat(OK.map(p => p.m * fsc(p, m) / p.r1)).med, fireAll: stat(fires.map(f => f.ratioAll * fsc(f.first, m))).med, rai: stat(OK.map(p => p.m * fsc(p, m))).med }] }));
  // ตัวอย่างคลาดมาก: รายไฟ ไม่ซ้ำเหตุการณ์ (วันเดียวกันห่าง < 3 กม. = เหตุการณ์เดียว)
  const LR = f => Math.abs(Math.log(f.ratio)), uniq = (xs, n) => { const o = []; for (const f of xs) { if (o.some(g => g.first.d === f.first.d && Math.hypot((g.first.lo - f.first.lo) * 108000, (g.first.la - f.first.la) * 110574) < 3000)) continue; o.push(f); if (o.length >= n) break } return o.map(ex) };
  const worst = uniq([...fires].sort((a, b) => LR(b) - LR(a)), 5), under = uniq([...fires].sort((a, b) => a.ratio - b.ratio), 3);
  const S = {
    generated: new Date().toISOString(), params: { fy: FYS, km: KM, days: DAYS, gap: GAP, hr: HR, b4: [iso(b4a), iso(b4b)], wx: 'Open-Meteo Historical Forecast (best_match) ช่อง 0.05°', openMeteoCalls: calls },
    counts: { ...cnt, used: OK.length, fires: fires.length },
    hotspot: { g: stat(OK.map(p => p.ratio)), l: stat(OK.map(p => p.ratioH)) },
    fire: { g: stat(fires.map(f => f.ratio)), l: stat(fires.map(f => f.ratioH)), single: stat(fires.filter(f => f.n === 1).map(f => f.ratio)), singleDay: stat(fires.filter(f => f.n === 1 && f.day).map(f => f.ratio)), multi: stat(fires.filter(f => f.n > 1).map(f => f.ratio)), all: stat(fires.map(f => f.ratioAll)), raiAll: stat(fires.map(f => f.all)) },
    alt: { big: stat(OK.map(p => p.m / p.big)), all: stat(OK.map(p => p.m / p.all)), r1: stat(OK.map(p => p.m / p.r1)), one: OK.filter(p => p.comp.n === 1).length, raiBig: stat(OK.map(p => p.big)), raiAll: stat(OK.map(p => p.all)), raiR1: stat(OK.map(p => p.r1)), nc: stat(OK.map(p => p.nc)) },
    raiModel: { hotspot: stat(OK.map(p => p.m)), fire: stat(fires.map(f => f.m)) }, raiReal: { hotspot: stat(OK.map(p => p.rai)), fire: stat(fires.map(f => f.rai)) },
    byFuel: by(OK, p => p.fuelN, p => p.ratio), byFuelR1: by(OK, p => p.fuelN, p => p.m / p.r1), byFuelAll: by(fires, f => f.fuelN, f => f.ratioAll), byDayNightR1: by(OK, p => isDay(p) ? 'กลางวัน' : 'กลางคืน', p => p.m / p.r1), byFuelFire: by(fires, f => f.fuelN, f => f.ratio),
    raiByFuel: { model: by(OK, p => p.fuelN, p => p.m), real: by(OK, p => p.fuelN, p => p.rai) },
    byDayNight: by(OK, p => isDay(p) ? 'กลางวัน' : 'กลางคืน', p => p.ratio), byDayNightFire: by(fires, f => f.day ? 'กลางวัน' : 'กลางคืน', f => f.ratio),
    byFY: by(OK, p => fyOf(p.d), p => p.ratio), byFYFire: by(fires, f => fyOf(f.first.d), f => f.ratio),
    wx: { T: stat(OK.map(p => p.T)), rh: stat(OK.map(p => p.rh)), u: stat(OK.map(p => p.u)), E: stat(OK.map(p => p.E)), Rh: stat(OK.map(p => p.Rh)), dist: stat(OK.map(p => p.dist)) },
    firesByN: by(fires, f => f.n === 1 ? '1 จุด' : f.n <= 3 ? '2–3 จุด' : '≥4 จุด', f => f.rai),
    ffmc, worst, under,
  };
  fs.writeFileSync(OUT, JSON.stringify(S, null, 1));
  const csv = ['date,hhmm,lat,lon,sat,area,ft,fuel,T,rh,wind_kmh,wind_from,slope,emc,ros_head,model_rai,model_huy_rai,real_rai,dist_m,ratio,ratio_huy,fire_n'];
  for (const p of OK) csv.push([iso(p.d), p.hm, p.la, p.lo, p.sat, `"${p.ar}"`, p.ft, p.fuelN, p.T, p.rh, p.u, Math.round(p.from), p.sl.toFixed(1), p.E.toFixed(1), p.Rh.toFixed(2), p.m.toFixed(1), p.mh.toFixed(1), p.rai, Math.round(p.dist), p.ratio.toFixed(3), p.ratioH.toFixed(3), p.nf].join(','));
  fs.writeFileSync(OUT.replace(/\.json$/, '.csv'), '﻿' + csv.join('\n'));
  const L = (t, x) => console.log(`${t.padEnd(34)} n ${String(x.n).padStart(4)} · มัธยฐาน ${x.med} · P10 ${x.p10} · P90 ${x.p90} · โมเดลมากกว่า ${Math.round(x.over * 100)}% · อยู่ใน ×0.5–2 ${Math.round(x.in2 * 100)}%`);
  console.log(`จุด ${cnt.all} · คู่ ${OK.length} (ไฟ ${fires.length}) · ไม่พบรอย ≤${KM} กม. ${cnt.noScar} · นอกช่วง B4 ${cnt.noB4time} · Open-Meteo ${calls} call · gap ${GAP}`);
  console.log('อัตราส่วน = ไร่โมเดล 6 ชม. / ไร่รอยเผา');
  L('รายจุด: กลุ่มรอยที่ใกล้สุด', S.hotspot.g); L('รายจุด: Lagrangian (hyAdj)', S.hotspot.l); L('รายจุด: กลุ่มรอยใหญ่สุด ≤1 กม.', S.alt.big); L('รายจุด: พิกเซลเผาในรัศมี 1 กม.', S.alt.r1);
  L('รายไฟ: กลุ่มรอยของไฟ', S.fire.g); L('รายไฟ: ทุกกลุ่มรอย ≤1 กม.', S.fire.all);
  for (const k in S.byFuelR1) L('เชื้อเพลิง (รัศมี 1 กม.): ' + k, S.byFuelR1[k]);
  console.log('ไร่โมเดล มัธยฐาน', S.raiModel.hotspot.med, '· ไร่จริง (ใกล้สุด/รัศมี 1 กม./ไฟ ≤1 กม.)', S.raiReal.hotspot.med, S.alt.raiR1.med, S.fire.raiAll.med);
  console.log('ผลเต็ม:', OUT);
})().catch(e => { console.error(e); process.exit(1) });
