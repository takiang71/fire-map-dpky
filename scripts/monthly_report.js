// F3 รายงานประจำเดือนอัตโนมัติ — workflow sync (วันที่ 1–3 ของเดือน เวลาไทย) สร้างรายงานเดือนก่อน → reports/<ปี พ.ศ.>-<เดือน>.html + .pdf + reports/index.json
// build_site.js คัดลอกโฟลเดอร์ reports/ → _site/reports/ · telegram_notify.js / line_notify.js ส่งลิงก์เมื่อมีรายงานใหม่ (scripts/lib/mrep.js)
// ใช้:
//   node scripts/monthly_report.js --acc            เก็บ FWI รายวัน (data/fwi/index.json วันที่ไม่ใช่พยากรณ์) → data/fwi/daily.json (ต้นทางเก็บแค่ 7 วัน) — sync.yml รันทุกรอบ
//   node scripts/monthly_report.js                  วันที่ 1–3 ของเดือนและยังไม่มีรายงานเดือนก่อน = สร้าง (ไม่ใช่ช่วงนั้น/มีแล้ว = ข้าม)
//   node scripts/monthly_report.js --month 2026-10  สร้าง/สร้างทับเดือนที่ระบุ (ค.ศ.) · --no-pdf = ไม่เปิด Chrome · RM_NOW = จำลองเวลา (ms)
// ตัวเลข (ไม่รวม ขสป.ดงใหญ่ (สบอ.7) ตามค่าเริ่มต้นของหน้าเว็บ — กติกา dyAS):
//   ตัวชี้วัดกรมอุทยานฯ = hdata (Excel) ของปีงบที่มีข้อมูล · ปีงบที่ยังไม่มี Excel = adata ดาวเทียมตัวชี้วัด (SNPP → NOAA-20 ตั้งแต่ 2 พ.ย. 69) แบบเดียวกับ hdFill/fyNow
//   ทุกดาวเทียม = adata · พื้นที่เผาไหม้ = รอบ 7 วันของตามรอยเผา (data/burn/index.json) ที่กึ่งกลางรอบอยู่ในเดือน · ดับไฟ = fxdata (Excel อส.) + รายงานจากหน้างาน F1 (reports.json บนเว็บ)
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { block } = require('./lib/area');
const ROOT = path.join(__dirname, '..'), RD = process.env.RM_DIR || path.join(ROOT, 'reports'), DAILY = path.join(ROOT, 'data', 'fwi', 'daily.json');
const SITE = process.env.SITE_URL || 'https://takiang71.github.io/fire-map-dpky/';
const A0 = process.argv.slice(2), arg = k => { const i = A0.indexOf(k); return i >= 0 ? A0[i + 1] : null };
const NOW = +process.env.RM_NOW || Date.now();
const MTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MTS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const IND_SW = Date.UTC(2026, 10, 2) / 864e5, indSat = d => d < IND_SW ? 'SNPP' : 'NOAA20';
const fyOf = d => { const t = new Date(d * 864e5); return t.getUTCFullYear() + 543 + (t.getUTCMonth() >= 9 ? 1 : 0) };
const iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = v => (+v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }), nf1 = v => (+v || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const dy = (ar, st) => /ดงใหญ่/.test(ar || '') || ((!ar || ar === 'นอกพื้นที่อนุรักษ์') && /ดงใหญ่/.test(st || ''));
const arS = a => String(a || 'นอกพื้นที่อนุรักษ์').replace(/^อุทยานแห่งชาติ/, 'อช.').replace(/^เขตรักษาพันธุ์สัตว์ป่า/, 'ขสป.').replace(/^(เตรียมประกาศเป็น)?เขตห้ามล่าสัตว์ป่า/, 'ขหล.');
const stS = s => !s || s === 'ไม่มี' ? 'ไม่มีสถานีฯ รับผิดชอบ' : String(s).replace(/^สถานีควบคุมไฟป่า/, 'สถานีฯ ');
const dPct = (c, p) => !p ? (c ? 'ใหม่' : '–') : c === p ? 'เท่าเดิม' : `${c > p ? '▲' : '▼'} ${Math.abs(Math.round((c - p) / p * 100))}%`;

// ---------- เก็บ FWI รายวัน ----------
function acc() {
  let I; try { I = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fwi', 'index.json'), 'utf8')) } catch (e) { console.log('ไม่มี data/fwi/index.json — ข้าม'); return }
  let D = { v: 1, src: I.src, note: 'ค่ารายวันของ TFDRS (วันที่ไม่ใช่พยากรณ์) เฉลี่ย/สูงสุดในพื้นที่ — สะสมโดย scripts/monthly_report.js --acc', d: {} };
  try { D = JSON.parse(fs.readFileSync(DAILY, 'utf8')) } catch (e) { }
  let n = 0;
  for (const x of I.days || []) {
    if (x.f !== 0 || !x.a) continue;
    const o = {}; for (const k in x.a) { const v = x.a[k]; if (v && v.FWI) o[k] = { FWI: [v.FWI[0], v.FWI[2]], FFMC: v.FFMC ? [v.FFMC[0], v.FFMC[2]] : null } }
    if (JSON.stringify(D.d[x.d]) !== JSON.stringify(o)) { D.d[x.d] = o; n++ }
  }
  D.d = Object.fromEntries(Object.entries(D.d).sort(([a], [b]) => a < b ? -1 : 1));
  if (n) { fs.writeFileSync(DAILY, JSON.stringify(D)); console.log(`FWI รายวัน: เพิ่ม/แก้ ${n} วัน (รวม ${Object.keys(D.d).length})`) } else console.log('FWI รายวัน: ไม่เปลี่ยน');
}

// ---------- ข้อมูล ----------
function data() {
  const H = JSON.parse(block('hdata')[1]), A = JSON.parse(block('adata')[1]), G = JSON.parse(block('geo')[1]);
  let X = null; try { X = JSON.parse(block('fxdata')[1]) } catch (e) { }
  const hd = H.r.map(r => ({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, ar: H.ar[r[7]], st: H.st[r[10]], tm: H.tm[r[6]], sat: 'SNPP' })).filter(x => !dy(x.ar, x.st));
  const ad = A.r.map(r => ({ d: r[0], la: r[2] / 1e5, lo: r[3] / 1e5, ar: A.ar[r[9]], st: A.st[r[10]], tm: A.tm[r[8]], sat: A.sat[r[4]] })).filter(x => !dy(x.ar, x.st));
  const hdFY = new Set(H.r.map(r => fyOf(r[0])));
  // ตัวชี้วัด: ปีงบที่มี Excel = hdata · ไม่มี = adata ดาวเทียมตัวชี้วัดของวันนั้น
  const ind = (d0, d1) => { const out = []; for (let fy = fyOf(d0); fy <= fyOf(d1); fy++) { const src = hdFY.has(fy) ? hd : ad.filter(x => x.sat === indSat(x.d)); out.push(...src.filter(x => x.d >= d0 && x.d <= d1 && fyOf(x.d) === fy)) } return out };
  const indSrc = fy => hdFY.has(fy) ? 'Excel กรมอุทยานฯ' : 'API ไทย/NASA FIRMS ดาวเทียมตัวชี้วัด (ยังไม่มี Excel ของปีงบนี้)';
  return { hd, ad, G, X, ind, indSrc, aTo: A.to };
}

function svgMap(G, pts, ipts) {
  const W = 760, cons = G.cons.features.filter(f => !/ดงใหญ่/.test(f.properties.name)), all = [];
  const rings = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => p[0]);
  cons.forEach(f => rings(f).forEach(r => r.forEach(c => all.push(c))));
  const lo0 = Math.min(...all.map(c => c[0])), lo1 = Math.max(...all.map(c => c[0])), la0 = Math.min(...all.map(c => c[1])), la1 = Math.max(...all.map(c => c[1]));
  const k = Math.cos((la0 + la1) / 2 * Math.PI / 180), s = (W - 20) / ((lo1 - lo0) * k), Hh = Math.round((la1 - la0) * s + 20);
  const P = c => [10 + (c[0] - lo0) * k * s, 10 + (la1 - c[1]) * s];
  const path = r => { let o = '', last = null; for (const c of r) { const p = P(c); if (last && Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.8) continue; o += (o ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); last = p } return o + 'Z' };
  const COL = ['#2e7d32', '#1565c0', '#6a1b9a', '#ef6c00', '#00838f', '#5d4037', '#ad1457'];
  const poly = cons.map((f, i) => `<path d="${rings(f).map(path).join('')}" fill="${COL[i % COL.length]}" fill-opacity=".08" stroke="${COL[i % COL.length]}" stroke-width="1.2"/>`).join('');
  const lab = cons.map((f, i) => { const r = rings(f).sort((a, b) => b.length - a.length)[0], c = r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]), p = P(c); return `<text x="${p[0].toFixed(0)}" y="${p[1].toFixed(0)}" fill="${COL[i % COL.length]}">${esc(arS(f.properties.name))}</text>` }).join('');
  const dot = (x, r, c, o) => { const p = P([x.lo, x.la]); return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" fill="${c}" ${o || ''}/>` };
  return `<svg viewBox="0 0 ${W} ${Hh}" class="map" role="img" aria-label="แผนที่จุดความร้อน">${poly}${pts.map(x => dot(x, 2.6, '#ff8a00', 'fill-opacity=".85"')).join('')}${ipts.map(x => dot(x, 3.4, '#d32f2f', 'stroke="#fff" stroke-width=".8"')).join('')}<g class="lab">${lab}</g></svg>`;
}
function svgDays(d0, d1, a, b) {
  const n = d1 - d0 + 1, ca = new Array(n).fill(0), cb = new Array(n).fill(0); a.forEach(x => ca[x.d - d0]++); b.forEach(x => cb[x.d - d0]++);
  const mx = Math.max(1, ...ca), W = 760, H = 150, bw = (W - 40) / n;
  let o = `<svg viewBox="0 0 ${W} ${H + 24}" class="bars" role="img" aria-label="จุดความร้อนรายวัน"><line x1="30" y1="${H}" x2="${W - 6}" y2="${H}" stroke="#999"/><text x="26" y="12" text-anchor="end">${mx}</text><text x="26" y="${H}" text-anchor="end">0</text>`;
  for (let i = 0; i < n; i++) {
    const x = 32 + i * bw, h = ca[i] / mx * (H - 10), h2 = cb[i] / mx * (H - 10);
    o += `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#ffb74d"/>`;
    if (cb[i]) o += `<rect x="${x.toFixed(1)}" y="${(H - h2).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h2.toFixed(1)}" fill="#d32f2f"/>`;
    if (i % 5 === 0 || i === n - 1) o += `<text x="${(x + bw / 2).toFixed(1)}" y="${H + 16}" text-anchor="middle">${i + 1}</text>`;
  }
  return o + '</svg>';
}

async function reportsF1() {
  try { const r = await fetch(SITE + 'reports.json', { signal: AbortSignal.timeout(20e3) }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()).reports || [] }
  catch (e) { console.log('reports.json (F1) ดึงไม่ได้:', e.message); return null }
}

function build(m, D, F1) {
  const [y, mo] = m.split('-').map(Number), d0 = Date.UTC(y, mo - 1, 1) / 864e5, d1 = Date.UTC(y, mo, 1) / 864e5 - 1, p0 = Date.UTC(y - 1, mo - 1, 1) / 864e5, p1 = Date.UTC(y - 1, mo, 1) / 864e5 - 1;
  const fy = fyOf(d0), fs0 = Date.UTC(y - (mo >= 10 ? 0 : 1), 9, 1) / 864e5, ps0 = Date.UTC(y - (mo >= 10 ? 1 : 2), 9, 1) / 864e5;
  const id = `${y + 543}-${String(mo).padStart(2, '0')}`, title = `${MTH[mo - 1]} ${y + 543}`;
  const I = D.ind(d0, d1), Ip = D.ind(p0, p1), Ic = D.ind(fs0, d1), Ipc = D.ind(ps0, p1), Al = D.ad.filter(x => x.d >= d0 && x.d <= d1), Alp = D.ad.filter(x => x.d >= p0 && x.d <= p1);
  const partial = D.aTo && D.aTo < iso(d1);
  const cnt = (L, f) => { const o = {}; L.forEach(x => { const k = f(x); o[k] = (o[k] || 0) + 1 }); return o };
  const table = (f, lab) => {
    const a = cnt(I, f), b = cnt(Ip, f), c = cnt(Al, f), e = cnt(Ic, f), g = cnt(Ipc, f), keys = [...new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c), ...Object.keys(e), ...Object.keys(g)])].sort((p, q) => (a[q] || 0) - (a[p] || 0) || (e[q] || 0) - (e[p] || 0) || (c[q] || 0) - (c[p] || 0));
    const row = (k, A, B, C, E, G2, cls) => `<tr${cls ? ' class="' + cls + '"' : ''}><td>${esc(k)}</td><td>${nf(A)}</td><td>${nf(B)}</td><td>${dPct(A, B)}</td><td>${nf(C)}</td><td>${nf(E)}</td><td>${nf(G2)}</td><td>${dPct(E, G2)}</td></tr>`;
    return `<table><thead><tr><th rowspan="2">${lab}</th><th colspan="3">ตัวชี้วัดกรมอุทยานฯ เดือนนี้</th><th rowspan="2">ทุกดาวเทียม<br>เดือนนี้</th><th colspan="3">ตัวชี้วัด สะสมปีงบ (ต.ค.–${MTS[mo - 1]})</th></tr><tr><th>${y + 543}</th><th>${y + 542}</th><th>เทียบ</th><th>${fy}</th><th>${fy - 1}</th><th>เทียบ</th></tr></thead><tbody>`
      + keys.map(k => row(lab === 'สถานีควบคุมไฟป่า' ? stS(k) : arS(k), a[k] || 0, b[k] || 0, c[k] || 0, e[k] || 0, g[k] || 0)).join('')
      + row('รวม', I.length, Ip.length, Al.length, Ic.length, Ipc.length, 'sum') + '</tbody></table>';
  };
  const tmTop = Object.entries(cnt(Al, x => x.tm || '-')).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sats = cnt(Al, x => x.sat);
  // พื้นที่เผาไหม้
  let burn = '<p class="mut">ไม่มีข้อมูลพื้นที่เผาไหม้</p>';
  try {
    const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'burn', 'index.json'), 'utf8')), dd = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
    const P = (B.periods || []).filter(p => { const c = Math.floor((dd(p.d0) + dd(p.d1)) / 2); return c >= d0 && c <= d1 });
    const ar = {}; let t = 0; P.forEach(p => { for (const k in p.ar || {}) { const nm = B.ar[+k] != null ? B.ar[+k] : k; if (!/ดงใหญ่/.test(nm)) { ar[nm] = (ar[nm] || 0) + p.ar[k]; t += p.ar[k] } } });
    const last = (B.periods || []).slice(-1)[0];
    burn = P.length ? `<p>ตามรอยเผา (GISTDA/สสน.) รอบ 7 วัน ${P.length} รอบ (${P.map(p => `${+p.d0.slice(6)}/${+p.d0.slice(4, 6)}–${+p.d1.slice(6)}/${+p.d1.slice(4, 6)}`).join(', ')}) รวม <b>${nf1(t)} ไร่</b> (ผลรวมรายรอบ พิกเซลที่ไหม้ซ้ำนับซ้ำ)</p>`
      + (t ? '<table class="sm"><tbody>' + Object.entries(ar).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(arS(k))}</td><td>${nf1(v)} ไร่</td></tr>`).join('') + '</tbody></table>' : '')
      : `<p class="mut">ยังไม่มีรอบพื้นที่เผาไหม้ที่อยู่ในเดือนนี้ (รอบล่าสุดของต้นทาง ${last ? `${+last.d0.slice(6)} ${MTS[+last.d0.slice(4, 6) - 1]}–${+last.d1.slice(6)} ${MTS[+last.d1.slice(4, 6) - 1]} ${+last.d1.slice(0, 4) + 543}` : '-'})</p>`;
  } catch (e) { }
  // ดับไฟ
  let fx = '';
  if (D.X) {
    const X = D.X, rs = X.r.filter(r => r[0] >= d0 && r[0] <= d1 && !dy(X.ar[r[8]], X.st[r[9]]));
    fx += `<p>บันทึกการดับไฟ (Excel สถิติดับไฟ อส.): <b>${nf(rs.length)} ครั้ง ${nf1(rs.reduce((a, r) => a + (+r[11] || 0), 0))} ไร่</b>${rs.length ? '' : ' <span class="mut">(ข้อมูลรายปีนำเข้าปลายปีงบ — เดือนล่าสุดมักยังไม่มี)</span>'}</p>`;
  }
  if (F1 === null) fx += '<p class="mut">รายงานผลตรวจสอบจากหน้างาน: ดึงข้อมูลไม่ได้ในรอบที่สร้างรายงาน</p>';
  else {
    const RES = { fire: 'พบไฟกำลังไหม้', out: 'ดับแล้ว', none: 'ตรวจแล้วไม่พบไฟ', plan: 'เผาตามแผน (ชิงเผา)' };
    const rs = F1.filter(r => { const t = r.hs && r.hs.t || r.c, d = Math.floor((t + 7 * 36e5) / 864e5); return d >= d0 && d <= d1 && !dy(r.ar, r.st) });
    const c = cnt(rs, r => r.res);
    fx += `<p>รายงานผลตรวจสอบจากหน้างาน (ระบบนี้): <b>${nf(rs.length)} รายการ</b>${rs.length ? ' — ' + Object.entries(c).map(([k, v]) => `${RES[k] || k} ${v}`).join(' · ') + ` · ${nf1(rs.filter(r => r.res !== 'none').reduce((a, r) => a + (+r.rai || 0), 0))} ไร่` : ''}</p>`;
  }
  // FWI
  let fwi = '<p class="mut">ไม่มีข้อมูล FWI รายวันของเดือนนี้ (ระบบเริ่มเก็บค่ารายวัน 9 พ.ย. 2569)</p>';
  try {
    const FD = JSON.parse(fs.readFileSync(DAILY, 'utf8')).d, ks = Object.keys(FD).filter(k => k >= iso(d0) && k <= iso(d1));
    if (ks.length) {
      const v = ks.map(k => FD[k].all && FD[k].all.FWI).filter(Boolean), mean = v.reduce((a, x) => a + x[0], 0) / v.length, mx = Math.max(...v.map(x => x[1])), hi = v.filter(x => x[0] >= 17).length;
      fwi = `<p>ดัชนีอันตรายไฟป่า FWI (TFDRS กรมป่าไม้) เฉลี่ยทั้งพื้นที่ <b>${nf1(mean)}</b> · ค่าสูงสุดรายจุด ${nf1(mx)} · วันที่ค่าเฉลี่ย ≥ 17 <b>${hi}</b> วัน · มีข้อมูล ${ks.length}/${d1 - d0 + 1} วัน</p>`;
    }
  } catch (e) { }
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รายงานสถานการณ์ไฟป่าประจำเดือน ${title}</title>
<style>@font-face{font-family:NT;src:url(../fonts/noto-sans-thai-thai-400.woff2) format('woff2');font-weight:400}@font-face{font-family:NT;src:url(../fonts/noto-sans-thai-thai-600.woff2) format('woff2');font-weight:600}@font-face{font-family:NT;src:url(../fonts/noto-sans-thai-latin-400.woff2) format('woff2');font-weight:400;unicode-range:U+0000-00FF}@font-face{font-family:NT;src:url(../fonts/noto-sans-thai-latin-600.woff2) format('woff2');font-weight:600;unicode-range:U+0000-00FF}
:root{--ink:#1d2433;--mut:#5d6575;--line:#d9dee7;--navy:#1b3a6b;--bg:#fff}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#e6e9ef;--mut:#a9b0bd;--line:#3a4252;--navy:#9cc0ff;--bg:#161a22}}
body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.55 NT,'Noto Sans Thai',Tahoma,sans-serif}main{max-width:800px;margin:0 auto;padding:20px 16px}h1{font-size:20px;margin:0;color:var(--navy)}h2{font-size:15px;margin:18px 0 6px;color:var(--navy);border-bottom:1px solid var(--line);padding-bottom:3px}.sub{color:var(--mut);margin:2px 0 10px}
.kp{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.kp div{border:1px solid var(--line);border-radius:8px;padding:6px 8px}.kp b{display:block;font-size:20px;color:var(--navy)}.kp span{color:var(--mut);font-size:11.5px}
table{width:100%;border-collapse:collapse;margin:4px 0;font-size:12px}th,td{border:1px solid var(--line);padding:3px 6px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:rgba(27,58,107,.08);font-weight:600}tr.sum td{font-weight:600}table.sm{width:auto;min-width:50%}
.mut{color:var(--mut)}svg{width:100%;height:auto;display:block}svg text{font:10px NT,sans-serif;fill:var(--mut)}.map .lab text{font-size:11px;font-weight:600}.lg{font-size:11.5px;color:var(--mut)}.lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin:0 4px 0 10px;vertical-align:-1px}
.ft{margin-top:18px;font-size:11px;color:var(--mut);border-top:1px solid var(--line);padding-top:6px}a{color:var(--navy)}@media(max-width:600px){.kp{grid-template-columns:1fr 1fr}table{font-size:11px}}
@media print{@page{size:A4;margin:12mm}main{padding:0;max-width:none}h2{break-after:avoid}table,svg{break-inside:avoid}body{background:#fff;color:#000}}</style></head><body><main>
<h1>รายงานสถานการณ์ไฟป่าประจำเดือน ${title}</h1>
<div class="sub">กลุ่มป่าดงพญาเย็น-เขาใหญ่ · ส่วนควบคุมและปฏิบัติการไฟป่า สบอ.1 (ปราจีนบุรี) · ไม่รวม ขสป.ดงใหญ่ (สบอ.7) · ปีงบประมาณ ${fy}</div>
${partial ? `<p class="mut">⚠ ข้อมูลจุดความร้อนสะสมถึง ${esc(D.aTo)} (ยังไม่ครบเดือน)</p>` : ''}
<div class="kp"><div><b>${nf(I.length)}</b><span>จุดตัวชี้วัดกรมอุทยานฯ เดือนนี้ (${y + 542}: ${nf(Ip.length)} · ${dPct(I.length, Ip.length)})</span></div><div><b>${nf(Al.length)}</b><span>จุดทุกดาวเทียม (${Object.entries(sats).map(([k, v]) => `${{ SNPP: 'SNPP', NOAA20: 'N20', NOAA21: 'N21' }[k] || k} ${v}`).join(' · ') || '–'})</span></div><div><b>${nf(Ic.length)}</b><span>ตัวชี้วัดสะสมปีงบ ${fy} (ปีก่อนช่วงเดียวกัน ${nf(Ipc.length)})</span></div><div><b>${nf(new Set(Al.map(x => x.d)).size)}</b><span>วันที่พบจุด (ทุกดาวเทียม)</span></div></div>
<h2>แผนที่จุดความร้อน</h2>${svgMap(D.G, Al, I)}<div class="lg"><i style="background:#d32f2f"></i>ตัวชี้วัดกรมอุทยานฯ<i style="background:#ff8a00"></i>ดาวเทียมอื่น/ทุกดวง</div>
<h2>จุดความร้อนรายวัน</h2>${svgDays(d0, d1, Al, I)}<div class="lg"><i style="background:#ffb74d"></i>ทุกดาวเทียม<i style="background:#d32f2f"></i>ตัวชี้วัด · วันที่ของเดือน</div>
<h2>รายพื้นที่อนุรักษ์</h2>${table(x => x.ar || 'นอกพื้นที่อนุรักษ์', 'พื้นที่')}
<h2>รายสถานีควบคุมไฟป่า</h2>${table(x => x.st || 'ไม่มี', 'สถานีควบคุมไฟป่า')}
<h2>ตำบลที่พบจุดมากที่สุด (ทุกดาวเทียม)</h2>${tmTop.length ? '<table class="sm"><tbody>' + tmTop.map(([k, v]) => { const [t, a] = k.split('|'); return `<tr><td>ต.${esc(t)} อ.${esc(a || '-')}</td><td>${v} จุด</td></tr>` }).join('') + '</tbody></table>' : '<p class="mut">ไม่พบจุดความร้อน</p>'}
<h2>พื้นที่เผาไหม้</h2>${burn}
<h2>การดับไฟป่า</h2>${fx}
<h2>สภาพอากาศเชิงไฟ</h2>${fwi}
<div class="ft">ที่มา: ตัวชี้วัด = ${esc(D.indSrc(fy))}${fy - 1 !== fy ? ` · ปีงบ ${fy - 1} = ${esc(D.indSrc(fy - 1))}` : ''} · ทุกดาวเทียม = Land Fire Alerts Thailand (WFSRU/ThaiREN) + NASA FIRMS (VIIRS SNPP/NOAA-20/NOAA-21) · ตัวชี้วัดใช้ Suomi NPP ถึง 1 พ.ย. 2569 และ NOAA-20 ตั้งแต่ 2 พ.ย. 2569<br>
สร้างอัตโนมัติโดยแผนที่สถานการณ์ไฟป่า (${esc(SITE)}) เมื่อ ${new Date(NOW).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })} น. · ตัวเลขอาจเปลี่ยนเมื่อนำเข้า Excel กรมอุทยานฯ ฉบับปรับปรุง</div>
</main></body></html>`;
  return { id, m, title, html, n: { ind: I.length, all: Al.length, indPrev: Ip.length, fy: Ic.length }, partial: !!partial };
}

function findChrome() {
  return [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
}
function pdf(htmlFile, out) {
  const CH = findChrome(); if (!CH) return Promise.resolve('ไม่พบ Chrome');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-'));
  const fl = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer', `--user-data-dir=${prof}`, '--virtual-time-budget=8000', '--run-all-compositor-stages-before-draw', `--print-to-pdf=${out}`];
  if (process.platform === 'linux') fl.push('--no-sandbox', '--disable-dev-shm-usage');
  return new Promise(res => {
    const ch = spawn(CH, [...fl, 'file:///' + htmlFile.replace(/\\/g, '/').replace(/^\//, '')], { stdio: 'ignore' }), t = setTimeout(() => { try { ch.kill() } catch (e) { } }, 90e3);
    ch.on('exit', () => { clearTimeout(t); try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch (e) { } res(fs.existsSync(out) && fs.statSync(out).size > 1000 ? '' : 'Chrome ไม่ได้สร้าง PDF') });
  });
}

(async () => {
  if (A0.includes('--acc')) return acc();
  const th = new Date(NOW + 7 * 36e5), prev = new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth() - 1, 1));
  let m = arg('--month');
  if (!m) {
    m = prev.toISOString().slice(0, 7);
    const id = `${+m.slice(0, 4) + 543}-${m.slice(5)}`;
    if (th.getUTCDate() > 3) { console.log('ไม่ใช่วันที่ 1–3 ของเดือน — ข้าม (สร้างเองได้ด้วย --month YYYY-MM)'); return }
    if (fs.existsSync(path.join(RD, id + '.html'))) { console.log(`มีรายงาน ${id} แล้ว — ข้าม`); return }
  }
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('--month ต้องเป็น YYYY-MM (ค.ศ.)');
  const R = build(m, data(), await reportsF1());
  fs.mkdirSync(RD, { recursive: true });
  const hf = path.join(RD, R.id + '.html'), pf = path.join(RD, R.id + '.pdf');
  fs.writeFileSync(hf, R.html);
  let perr = A0.includes('--no-pdf') ? 'ข้าม (--no-pdf)' : await pdf(hf, pf);
  if (perr) console.log('PDF:', perr);
  let ix = { v: 1, list: [] }; try { ix = JSON.parse(fs.readFileSync(path.join(RD, 'index.json'), 'utf8')) } catch (e) { }
  ix.list = ix.list.filter(x => x.id !== R.id).concat([{ id: R.id, m: R.m, t: R.title, html: R.id + '.html', pdf: fs.existsSync(pf) ? R.id + '.pdf' : null, n: R.n, partial: R.partial || undefined, gen: new Date(NOW).toISOString() }]).sort((a, b) => a.id < b.id ? 1 : -1);
  ix.upd = new Date(NOW).toISOString();
  fs.writeFileSync(path.join(RD, 'index.json'), JSON.stringify(ix, null, 1));
  console.log(`รายงาน ${R.title}: ตัวชี้วัด ${R.n.ind} (ปีก่อน ${R.n.indPrev}) · ทุกดาวเทียม ${R.n.all} · สะสมปีงบ ${R.n.fy} → reports/${R.id}.html${fs.existsSync(pf) ? ' + .pdf' : ''}`);
})().catch(e => { console.error(e); process.exit(1) });
