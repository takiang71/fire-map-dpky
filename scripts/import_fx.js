// นำเข้าข้อมูลการดับไฟป่า (สถิติดับไฟรวม อส. ปีงบ 2564–2568 ไฟล์ที่ผู้ใช้ตัดเฉพาะกลุ่มป่า) → ฝังเป็น <script id="fxdata"> ใน index.html
// ใช้: node scripts/import_fx.js "<ไฟล์ .xlsx>"   (ไม่แก้ไฟล์ Excel ต้นฉบับ)
// คอลัมน์: ลำดับที่ ปีงบประมาณ วัน เดือน ปี เวลารับแจ้งเหตุ รับแจ้งเหตุจาก พื้นที่ป่า สถานที่ หมู่ที่ ตำบล อำเภอ จังหวัด E N เข้าดับไฟ เสร็จสิ้น พื้นที่เสียหาย(ไร่) สาเหตุการเกิด ดำเนินการโดย ผู้รายงาน
// · พิกัด UTM ไม่มีคอลัมน์โซน: E > 500,000 = โซน 47 (ฝั่งตะวันตกของ 102°E) ไม่งั้น = โซน 48 (ตรวจแล้วตรงกับตำบลที่รายงาน)
// · พิกัดที่ตัวเลขขาด/เกิน 1 หลัก: ลองตัด/แทรกตัวเลข 1 หลัก รับเฉพาะเมื่อผลอยู่ในตำบลที่รายงาน (admin.json) และทุกค่าที่ผ่านห่างกันไม่เกิน 1.5 กม. → xy=1 · แก้ไม่ได้ = xy=2 (ไม่แสดงบนแผนที่ แต่นับในสถิติ)
// · วันที่ใช้คอลัมน์ วัน/เดือน/ปี (ช่องเวลารับแจ้งเหตุบางแถวมีแต่เวลา) · เวลาเข้าดับไฟ/เสร็จสิ้นใช้เฉพาะส่วนเวลา (ส่วนวันที่ในต้นฉบับไม่ตรงกับวันเกิดเหตุ)
// · ไม่เก็บชื่อผู้รายงาน
const fs = require('fs'), path = require('path');
const { readXlsx } = require('./lib/xlsx');
const { utmToLL } = require('./lib/tiff');
const { H, where, SBP } = require('./lib/area');
const { admIndex } = require('./lib/burnsum');

const file = process.argv[2];
if (!file) { console.error('ใช้: node scripts/import_fx.js <ไฟล์ .xlsx>'); process.exit(1) }
const sheet = readXlsx(file)[0], head = sheet.rows[0].map(h => String(h || '').trim());
const C = (n, x) => { const i = head.findIndex(h => x ? h === n : h.startsWith(n)); if (i < 0) throw new Error('ไม่พบคอลัมน์ ' + n); return i };
const K = { seq: C('ลำดับ'), fy: C('ปีงบ'), d: C('วัน'), m: C('เดือน'), y: C('ปี', 1), tr: C('เวลารับแจ้ง'), rp: C('รับแจ้งเหตุจาก'), fr: C('พื้นที่ป่า'), pl: C('สถานที่'), moo: C('หมู่'), tm: C('ตำบล'), am: C('อำเภอ'), pv: C('จังหวัด'), E: C('E'), N: C('N'), ts: C('เข้าดับไฟ'), te: C('เสร็จสิ้น'), rai: C('พื้นที่เสียหาย'), cs: C('สาเหตุ'), st: C('ดำเนินการโดย') };
const MO = { 'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'พฤษถาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12 };
const cl = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim(), blank = v => !v || v === 'undefined' || v === '-';

// ---- ชื่อพื้นที่การปกครอง: เทียบกับ admin.json (กรมการปกครอง) แก้คำสะกดผิด ----
const ADM = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'admin.json'), 'utf8')), TMS = ADM.tm.features.map(f => f.properties);
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] };
const best = (s, L) => { let b = null, bd = 9; for (const x of L) { const d = lev(s, x); if (d < bd) { bd = d; b = x } } return bd <= 2 ? b : null };
const fixes = new Map();
function admName(tm, am, pv) {
  if (/^เมือง$/.test(am)) am = 'เมือง' + pv;
  // อำเภอผิด: ตำบลชื่อนี้มีในจังหวัดอำเภอเดียว → ใช้อำเภอนั้น ไม่งั้นเทียบชื่ออำเภอที่ใกล้เคียง
  const amL = [...new Set(TMS.filter(t => t.p === pv).map(t => t.a))], one = [...new Set(TMS.filter(t => t.p === pv && t.t === tm).map(t => t.a))];
  const a2 = amL.includes(am) ? am : one.length === 1 ? one[0] : best(am, amL) || am;
  const tmL = TMS.filter(t => t.p === pv && t.a === a2).map(t => t.t), t2 = tmL.includes(tm) ? tm : best(tm, tmL) || tm;
  if (t2 !== tm || a2 !== am) fixes.set(`${tm}|${am}|${pv} → ${t2}|${a2}`, (fixes.get(`${tm}|${am}|${pv} → ${t2}|${a2}`) || 0) + 1);
  return [t2, a2, pv];
}
const adm = admIndex();

// ---- พิกัด ----
const zoneOf = E => E > 500000 ? 47 : 48;
const okE = E => E >= 150000 && E <= 880000, okN = N => N >= 1450000 && N <= 1700000;
const ll = (E, N) => { const [lo, la] = utmToLL(E, N, zoneOf(E)); return [lo, la] };
const variants = v => { const s = String(Math.round(v)), o = new Set(); for (let i = 0; i < s.length; i++) o.add(+(s.slice(0, i) + s.slice(i + 1))); for (let i = 0; i <= s.length; i++) for (let d = 0; d <= 9; d++) o.add(+(s.slice(0, i) + d + s.slice(i))); return [...o] };
function fixXY(E, N, tm, am, pv) {
  const Es = okE(E) ? [E] : variants(E).filter(okE), Ns = okN(N) ? [N] : variants(N).filter(okN), hit = [];
  for (const e of Es) for (const n of Ns) { const [lo, la] = ll(e, n), a = adm && adm(lo, la); if (a && a.t === tm && a.p === pv) hit.push([lo, la, e, n]) }
  if (!hit.length) return null;
  const k = Math.cos(hit[0][1] * Math.PI / 180), span = Math.max(...hit.flatMap(a => hit.map(b => Math.hypot((a[0] - b[0]) * 111.32 * k, (a[1] - b[1]) * 110.57))));
  if (span > 1.5) return null;
  return [hit.reduce((s, h) => s + h[0], 0) / hit.length, hit.reduce((s, h) => s + h[1], 0) / hit.length, hit.map(h => h[2] + '/' + h[3])];
}

// ---- สาเหตุ / ช่องทางรับแจ้ง (รวมคำที่เขียนต่างกัน) ----
function cause(v) {
  v = cl(v); let d = '';
  const m = v.match(/^มาจากสาเหตุอื่นๆ\s*(.*)$/); if (m) { d = m[1].trim(); v = /ลักลอบจุด/.test(d) ? 'ลักลอบจุด' : 'สาเหตุอื่นๆ'; if (v === 'ลักลอบจุด') d = '' }
  if (/^อุบัติเหตุ/.test(v)) v = 'อุบัติเหตุ/ประมาท/เลินเล่อ';
  if (/^คึกคะนอง/.test(v)) v = 'คึกคะนอง/จุดเล่น';
  return [v || 'ไม่ระบุ', d];
}
function report(v) {
  v = cl(v).replace(/เเ/g, 'แ');
  if (/ผู้นำชุมชน/.test(v)) return 'ผู้นำชุมชน (กำนัน ผู้ใหญ่บ้าน)';
  if (/^ชุดจุดตรวจจุดสกัด/.test(v)) return 'ชุดจุดตรวจ/จุดสกัด/จุดเฝ้าระวังไฟป่า';
  if (/1362/.test(v)) return 'สายด่วนพิทักษ์ป่า 1362';
  if (/warroom/i.test(v)) return 'ศูนย์สั่งการฯ ไฟป่าและหมอกควัน (War room)';
  if (/Hotspot/i.test(v)) return 'แจ้งเตือนจุดความร้อน (Hotspot)';
  return v || 'ไม่ระบุ';
}
const forest = v => { v = cl(v); if (blank(v)) return 'ไม่ระบุ'; return v.replace(/^เขตอุทยานแห่งชาติทับลาน ปี 2524$/, 'อุทยานแห่งชาติทับลาน (แนวเขตปี 2524)') };
const frac = v => typeof v === 'number' ? Math.round((v % 1) * 1440) : -1, hhmm = m => m < 0 ? -1 : Math.floor(m / 60) % 24 * 100 + m % 60;

// ---- แปลงทุกแถว ----
const DIC = { pv: [], am: [], tm: [], ar: [], st: [], sb: [], cs: [], rp: [], fr: [] }, id = (k, v) => { v = cl(v) || 'ไม่ระบุ'; let i = DIC[k].indexOf(v); if (i < 0) { i = DIC[k].length; DIC[k].push(v) } return i };
const out = [], log = { fixed: [], none: [], mis: 0, outside: 0 };
for (const r of sheet.rows.slice(1)) {
  if (!r || r[K.seq] == null) continue;
  const y = +cl(r[K.y]) - 543, m = MO[cl(r[K.m])], d = +r[K.d];
  if (!y || !m || !d) { console.warn('ข้ามแถว วันที่ไม่ครบ', r[K.seq]); continue }
  const day = Math.round(Date.UTC(y, m - 1, d) / 864e5), fy = y + 543 + (m >= 10 ? 1 : 0);
  if (fy !== +r[K.fy]) console.warn('ปีงบไม่ตรงกับวันที่', r[K.seq], r[K.fy], fy);
  let [tm, am, pv] = admName(cl(r[K.tm]), cl(r[K.am]), cl(r[K.pv]));
  const E = +r[K.E], N = +r[K.N];
  // ตำบลที่รายงานไม่มีในจังหวัดนั้น แต่พิกัดตกในตำบลชื่อเดียวกัน (เช่น เนินหอม อ.เมือง "นครราชสีมา") → ใช้ชื่อตามพิกัด
  if (okE(E) && okN(N) && !TMS.some(t => t.t === tm && t.p === pv)) { const a = adm && adm(...ll(E, N)); if (a && a.t === tm) { fixes.set(`${tm}|${am}|${pv} → ${a.t}|${a.a}|${a.p} (ตามพิกัด)`, 1); am = a.a; pv = a.p } }
  let lo = 0, la = 0, xy = 0;
  if (okE(E) && okN(N)) { [lo, la] = ll(E, N); const a = adm && adm(lo, la); if (a && (a.t !== tm || a.p !== pv)) log.mis++ }
  else { const f = fixXY(E, N, tm, am, pv); if (f) { [lo, la] = f; xy = 1; log.fixed.push(`#${r[K.seq]} ${E}/${N} → ${f[2].join(' หรือ ')} (ต.${tm} อ.${am} จ.${pv})`) } else { xy = 2; log.none.push(`#${r[K.seq]} ${E}/${N} (ต.${tm} อ.${am} จ.${pv})`) } }
  const w = xy < 2 ? where(lo, la) : null; if (xy < 2 && !w) log.outside++;
  const st = cl(r[K.st]) || 'ไม่ระบุ', [cs, cd] = cause(r[K.cs]);
  const t0 = frac(r[K.tr]), ts = frac(r[K.ts]), te = frac(r[K.te]);
  out.push([day, hhmm(t0), Math.round(la * 1e5), Math.round(lo * 1e5), xy,
    id('pv', pv), id('am', am + '|' + pv), id('tm', tm + '|' + am + '|' + pv), id('ar', w ? w.ar : xy === 2 ? 'ไม่ทราบ (พิกัดใช้ไม่ได้)' : 'นอกพื้นที่อนุรักษ์'), id('st', st), id('sb', SBP[pv] || (w && w.sb) || 'ไม่ระบุ'),
    +r[K.rai] || 0, id('cs', cs), id('rp', report(r[K.rp])), id('fr', forest(r[K.fr])), hhmm(ts), hhmm(te),
    Math.round(E) || 0, Math.round(N) || 0, cl(r[K.moo]).replace(/^(undefined|-)$/, ''), blank(cl(r[K.pl])) ? '' : cl(r[K.pl]), cd, +r[K.seq]]);
}
out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const J = { src: path.basename(file), upd: new Date().toISOString().slice(0, 10), q: { fixed: log.fixed.length, none: log.none.length, mis: log.mis, out: log.outside }, ...DIC, r: out };
const txt = JSON.stringify(J).split('</').join('<\\/');
let html = fs.readFileSync(H, 'utf8');
const tag = '<script type="application/json" id="fxdata">', re = /<script type="application\/json" id="fxdata">[\s\S]*?<\/script>\n?/;
if (re.test(html)) html = html.replace(re, () => tag + txt + '</script>\n');
else { const a = html.indexOf('<script type="application/json" id="adata">'), e = html.indexOf('</script>', a) + 10; html = html.slice(0, e) + tag + txt + '</script>\n' + html.slice(e) }
fs.writeFileSync(H, html);
const byFy = {}; out.forEach(r => { const [y, m] = new Date(r[0] * 864e5).toISOString().slice(0, 7).split('-').map(Number); const f = y + 543 + (m >= 10 ? 1 : 0); byFy[f] = (byFy[f] || 0) + 1 });
console.log(`นำเข้า ${out.length} ครั้ง`, byFy, `· ไร่รวม ${out.reduce((s, r) => s + r[11], 0)}`);
console.log(`พิกัดแก้อัตโนมัติ ${log.fixed.length}:\n  ` + log.fixed.join('\n  '));
console.log(`พิกัดใช้ไม่ได้ (ไม่แสดงบนแผนที่) ${log.none.length}:\n  ` + log.none.join('\n  '));
console.log(`พิกัดอยู่คนละตำบลกับที่รายงาน ${log.mis} · อยู่นอกแนวเขตพื้นที่อนุรักษ์/พื้นที่รับผิดชอบ ${log.outside}`);
console.log('แก้ชื่อพื้นที่:\n  ' + [...fixes].map(([k, n]) => k + ' ×' + n).join('\n  '));
