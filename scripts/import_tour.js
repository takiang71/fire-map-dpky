// แหล่งท่องเที่ยว 4 อุทยาน (ky tl ps tp) → `tour:[…]` ในค่าคงที่ KB ของ index.html (C3, 16 พ.ย. 69 — เขียนแทนสคริปต์เดิมใน scratchpad ที่สูญหาย)
// ใช้: node scripts/import_tour.js <Excel แหล่งท่องเที่ยวในอุทยานแห่งชาติ.xlsx> <พิกัดแหล่งท่องเที่ยว.kml> [--dry] [--img]
//  · Excel กรมอุทยานฯ (ทั้งประเทศ ~970 แหล่ง) {สังกัด, ชื่ออุทยานแห่งชาติ, ประเภทแหล่งท่องเที่ยว 16 ประเภท, ชื่อแหล่งท่องเที่ยว, Latitude, Longtitude}
//    → ชื่อ ประเภท (KBT) พิกัด (ปัด 5 ตำแหน่ง) · ธง o:'d' — **Excel มาก่อน** (พิกัด Excel แม้ต่างจาก สบอ.1 หลายกิโลเมตร)
//  · KML สบอ.1 (ไฟล์ที่ผู้ใช้ส่งเป็น NetworkLink → สคริปต์ดึง Google My Maps ตาม href ให้เอง) description: NAME_DNP remark TYPE TIME AREA PERSON_DAY สิ่งอำนวยความสะดวก + ภาพ
//    → รายละเอียด {a กิจกรรม, t เวลา, c คน/วัน, r ระยะทาง, f สิ่งอำนวยความสะดวก, i ภาพ} · จับกับ Excel ด้วยชื่อ (ตัดช่องว่าง/จุด, จุดชมทิวทัศน์ = จุดชมวิว, ALIAS) → m:1
//    · จุดที่ไม่มีใน Excel = o:'m' ใช้พิกัด KML ประเภทจาก remark (REM) · อุทยานจาก NAME_DNP (ไม่มี = หาจากพิกัดด้วย where())
//  · รายการเดิมใน index.html ที่ไม่มีทั้งใน Excel และ KML (ช่อง 6 ไม่มี = พิกัดโดยประมาณจาก OSM เขียนมือ) คงไว้ทั้งรายการ · คำอธิบาย (ช่อง 5) เป็นข้อความเขียนมือ → คงตามชื่อ
//  · ภาพ: รหัส i เดิมคงตามชื่อ (ลิงก์ภาพของ My Maps เปลี่ยนทุกครั้งที่ดึง — คำนวณซ้ำไม่ได้) · ภาพใหม่ i = sha1(รหัสภาพ) 10 ตัว, --img ดาวน์โหลดเป็น data/tour/<i>.jpg (fife=w480-rj-l78)
//  · เรียง: ตามลำดับ KBT → จุดที่ไม่มีพิกัดไว้ท้ายกลุ่ม → ชื่อ (localeCompare th) · tour ของ dy ks kc ไม่แตะ
//  · --dry = ไม่เขียน index.html พิมพ์ sha1 ของแต่ละ tour เดิม/ใหม่ + รายการที่ต่าง · --json <ไฟล์> = เขียนผล {ky,tl,ps,tp} เป็น JSON ด้วย (เทสต์)
//  · ตรวจรับ (16 พ.ย. 69): Excel + KML ปัจจุบัน → tour 4 อุทยานเท่าเดิมทุกไบต์
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { readXlsx } = require('./lib/xlsx');
const { where } = require('./lib/area');

const ROOT = path.join(__dirname, '..'), H = path.join(ROOT, 'index.html');
const argv = process.argv.slice(2), F = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json'), DRY = argv.includes('--dry'), IMG = argv.includes('--img');
const JOUT = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const XLS = F.find(f => /\.xlsx$/i.test(f)), KML = F.find(f => /\.km[lz]$/i.test(f));
if (!XLS || !KML) { console.error('ใช้: node scripts/import_tour.js <แหล่งท่องเที่ยว.xlsx> <พิกัดแหล่งท่องเที่ยว.kml> [--dry] [--img]'); process.exit(1) }

const PARK = { ky: 'เขาใหญ่', tl: 'ทับลาน', ps: 'ปางสีดา', tp: 'ตาพระยา' };
/* ประเภทกรมอุทยานฯ 16 ประเภท → รหัส KBT (ลำดับ = ลำดับกลุ่มในการ์ด) */
const KBT = { wf: 'น้ำตก', vp: 'จุดชมวิว', cl: 'หน้าผา', pk: 'ภูเขา / ดอย', ge: 'ธรณีสัณฐาน', cv: 'ถ้ำ', lk: 'แม่น้ำ / ลำคลอง / ทะเลสาบ', rp: 'แก่ง', fo: 'ชมพรรณไม้ / ป่าไม้', tw: 'สัตว์ป่า', tr: 'เส้นทางศึกษาธรรมชาติ', hs: 'ศิลปวัฒนธรรม / โบราณสถาน', rs: 'จุดพักผ่อนในเขตบริการ', hp: 'น้ำพุร้อน / บ่อน้ำแร่', bc: 'ทะเล / ชายหาด', is: 'เกาะ / ปะการัง' };
const ORD = Object.keys(KBT), typeOf = s => ORD.find(k => KBT[k] === s.replace(/\s*\/\s*/g, ' / '));
/* remark ของ สบอ.1 → ประเภท (จุดที่ไม่มีใน Excel) · [รหัส, true] = remark บอกลักษณะเฉพาะกว่าประเภท จึงใช้เป็นกิจกรรม (a) เมื่อ TYPE ว่าง */
const REM = { 'น้ำตก': ['wf'], 'ชมวิว': ['vp'], 'อ่างเก็บน้ำ': ['lk'], 'แก่ง': ['rp'], 'ธรณี': ['ge'], 'ป่า': ['fo'], 'หอดูสัตว์': ['tw'], 'โป่ง': ['tw'], 'ทุ่งหญ้า': ['tw', true],
  'เส้นทางศึกษาธรรมชาติ': ['tr'], 'สักการบูชา': ['hs'], 'แหล่งโบราณคดี': ['hs'], 'ลานกางเต็นท์': ['rs'], 'ศูนย์บริการนักท่องเที่ยว': ['rs'] };
/* ชื่อใน KML ที่ต่างจากชื่อที่ใช้ (Excel หรือชื่อแสดงของจุด สบอ.1) — จับด้วย key() ไม่ได้ */
const ALIAS = {
  'หาดชมตะวัน': 'หาดชมตะวัน (ลำปลายมาศ)', 'จุดชมวิวผาตรอมใจ': 'จุดชมทิวทัศน์ผาตรอมใจ (เขาเขียว)', 'น้ำตกตระคร้อ': 'น้ำตกตะคร้อ', 'ป่าสลักได': 'ป่าสลัดได',
  'หน่วยพิทักษ์อุทยานฯ ตย.4 (กลางดง)': 'กลางดง', 'หอดูสัตว์คลองปลากั้ง': 'หอดูสัตว์คลองปลากั้ง (ขญ4)',
  'เส้นทางศึกษาธรรมชาติศูนย์บริการนักท่องเที่ยว - น้ำตกกองแก้ว 1.2 กม.': 'เส้นทางศึกษาธรรมชาติศูนย์บริการนักท่องเที่ยว - น้ำตกกองแก้ว',
  'เส้นทางศึกษาธรรมชาติน้ำตกผากล้วยไม้ น้ำตกเหวสุวัต 3 กม.': 'เส้นทางศึกษาธรรมชาติผากล้วยไม้ - น้ำตกเหวสุวัต',
  'เส้นทางศึกษาธรรมชาติ กม. 33 - หอดูสัตว์หนองผักชี 4.2 กม.': 'เส้นทางศึกษาธรรมชาติ กม.33 - หอดูสัตว์หนองผักชี',
  'ลานกางเต็นท์ ปด. ๕ (ห้วยน้ำเย็น)': 'ลานกางเต็นท์ ปด.5 (ห้วยน้ำเย็น)', 'ศูนย์บริการนักท่องเที่ยวอช.เขาใหญ่': 'ศูนย์บริการนักท่องเที่ยว อช.เขาใหญ่',
  'ปางสีดา|ศูนย์บริการนักท่องเที่ยว': 'ศูนย์บริการนักท่องเที่ยว อช.ปางสีดา',
};
/* คำสะกดผิดในข้อความของ KML */
const TYPO = [[/ระบบน้าใช้/g, 'ระบบน้ำใช้']];
const cl = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const key = s => cl(s).replace(/จุดชมทิวทัศน์/g, 'จุดชมวิว').replace(/[\s.]/g, '');
const r5 = v => +(+v).toFixed(5);
const sha10 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

// ---- tour เดิมใน index.html (ตำแหน่ง + ค่า) ----
let html = fs.readFileSync(H, 'utf8');
function tours() {
  const k0 = html.indexOf('const KB=['), out = {}; if (k0 < 0) throw new Error('ไม่พบ const KB=[');
  const ids = [...html.slice(k0, k0 + 400000).matchAll(/\bid:'(\w+)'/g)].map(m => [m[1], k0 + m.index]);
  for (const [id, at] of ids) {
    const p = html.indexOf('tour:[', at); if (p < 0) continue;
    const nx = ids.find(x => x[1] > at); if (nx && p > nx[1]) continue;
    let d = 0, i = p + 5, q = null;
    for (; i < html.length; i++) { const c = html[i]; if (q) { if (c === '\\') { i++; continue } if (c === q) q = null; continue } if (c === "'" || c === '"') { q = c; continue } if (c === '[') d++; else if (c === ']' && !--d) break }
    out[id] = { s: p + 5, e: i + 1, v: Function('return ' + html.slice(p + 5, i + 1))() };
  }
  return out;
}

// ---- KML: ไฟล์ NetworkLink → ดึงตาม href ----
async function kmlText(f) {
  let t = fs.readFileSync(f, 'utf8');
  const nl = t.match(/<NetworkLink>[\s\S]*?<href>(?:<!\[CDATA\[)?([^<\]]+)/);
  if (nl && !/<Placemark>/.test(t)) { console.log('  KML เป็น NetworkLink → ดึง', nl[1]); const r = await fetch(nl[1], { signal: AbortSignal.timeout(60e3) }); if (!r.ok) throw new Error('ดึง KML ไม่ได้ HTTP ' + r.status); t = await r.text() }
  return t;
}
function parseKml(t) {
  return [...t.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map(m => {
    const b = m[1], nm = cl((b.match(/<name>([\s\S]*?)<\/name>/) || [])[1]).replace(/^<!\[CDATA\[|\]\]>$/g, ''), d = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '', f = {};
    d.replace(/<img[^>]*>/g, '').split(/<br\s*\/?>/).forEach(x => { x = cl(x); const mm = x.match(/^(NAME_DNP|NAME|remark|TYPE|TIME|AREA|PERSON_TIM|PERSON_DAY)\b ?(.*)$/); if (mm) f[mm[1]] = cl(mm[2]); else if (/^สิ่งอำนวยความสะดวก\s*:/.test(x)) f.fac = x.replace(/^สิ่งอำนวยความสะดวก\s*:\s*/, '') });
    const img = (b.match(/<Data name="gx_media_links">\s*<value>(?:<!\[CDATA\[)?([^<\]\s]+)/) || [])[1] || null;
    const co = ((b.match(/<coordinates>\s*([^<]*?)\s*<\/coordinates>/) || [])[1] || '').split(',').map(Number);
    return { nm, ...f, img, lo: co[0], la: co[1] };
  });
}

(async () => {
  console.log('อ่าน', XLS, '+', KML);
  const T = tours();
  for (const id of Object.keys(PARK)) if (!T[id]) throw new Error('ไม่พบ tour ของ ' + id);
  const W = readXlsx(XLS)[0].rows, h = W[0].map(cl), col = n => { const i = h.findIndex(x => x.startsWith(n)); if (i < 0) throw new Error('Excel ไม่มีคอลัมน์ ' + n); return i };
  const C = { p: col('ชื่ออุทยาน'), t: col('ประเภท'), n: col('ชื่อแหล่ง'), la: col('Latitude'), lo: col('Long') };
  const KM = parseKml(await kmlText(KML));
  console.log(`  Excel ${W.length - 1} แหล่ง · KML ${KM.length} จุด`);
  const old = Object.fromEntries(Object.keys(PARK).map(id => [id, new Map(T[id].v.map(x => [x[0], x]))]));
  const parkOf = m => { const n = (m.NAME_DNP || '').replace(/^อุทยานแห่งชาติ/, ''); let id = Object.keys(PARK).find(k => PARK[k] === n); if (!id && !m.NAME_DNP && m.lo) { const w = where(m.lo, m.la); id = w && Object.keys(PARK).find(k => w.ar === 'อุทยานแห่งชาติ' + PARK[k]) } return id };
  const warn = [], used = new Set(), res = {};
  for (const id of Object.keys(PARK)) {
    const L = [];
    // 1) Excel
    for (const r of W.slice(1)) {
      if (!r || cl(r[C.p]) !== PARK[id]) continue;
      const n = cl(r[C.n]), ty = typeOf(cl(r[C.t])); if (!ty) { warn.push(`${id} ${n}: ไม่รู้จักประเภท "${cl(r[C.t])}"`); continue }
      L.push({ n, ty, lo: r5(r[C.lo]), la: r5(r[C.la]), x: { o: 'd' } });
    }
    // 2) KML ของอุทยานนี้: จับกับ Excel ด้วยชื่อ ไม่งั้นเป็นจุด สบอ.1 (o:'m')
    for (const [j, m] of KM.entries()) {
      if (parkOf(m) !== id) continue; used.add(j);
      const nm = ALIAS[PARK[id] + '|' + m.nm] || ALIAS[m.nm] || m.nm, e = L.find(o => o.x.o === 'd' && key(o.n) === key(nm));
      const x = {}, a = m.TYPE || '', rm = m.remark || '';
      if (a && a !== rm) x.a = a; else if (!a && REM[rm] && REM[rm][1]) x.a = rm;
      if (m.TIME) x.t = m.TIME.replace(/\s*[-–]\s*/g, '–');
      const c = (m.PERSON_DAY || '').replace(/,/g, ''); if (c && c !== '0') x.c = c;
      if (/^ระยะทาง/.test(m.AREA || '')) x.r = m.AREA;
      if (m.fac) x.f = TYPO.reduce((s, [re, b]) => s.replace(re, b), m.fac.replace(/\s*,\s*/g, ', '));
      if (m.img) x.img = m.img;
      if (e) { Object.assign(e.x, x, { o: 'd', m: 1 }); e.kn = m.nm }
      else {
        const ty = (REM[rm] || [])[0] || (Object.keys(REM).find(k => nm.startsWith(k)) ? REM[Object.keys(REM).find(k => nm.startsWith(k))][0] : null);
        if (!ty) { warn.push(`${id} ${m.nm}: ไม่รู้ประเภท (remark "${rm}") — เพิ่มใน REM`); continue }
        L.push({ n: nm, ty, lo: r5(m.lo), la: r5(m.la), x: { ...x, o: 'm' }, kn: m.nm });
      }
    }
    // 3) รายการเดิมที่เขียนมือ (ไม่มีช่อง 6) และคำอธิบาย/ภาพเดิม
    const O = old[id];
    for (const [n, x] of O) if (x.length < 6 && !L.some(o => o.n === n)) L.push({ n, ty: x[1], lo: x[2], la: x[3], d: x[4], keep: x });
    for (const [n, x] of O) if (x.length >= 6 && !L.some(o => o.n === n)) warn.push(`${id} ${n}: เดิมมีข้อมูล ${x[5].o === 'd' ? 'Excel' : 'สบอ.1'} แต่ไม่พบในไฟล์ใหม่ — ตัดออก`);
    const imgs = [];
    for (const o of L) {
      if (o.keep) continue;
      const p = O.get(o.n); o.d = p ? p[4] : '';
      if (o.x.img) { const pi = p && p[5] && p[5].i, u = o.x.img, i = pi || sha10(u.split('/*/')[1] ? u.split('/*/')[1].split('?')[0] : u); if (!pi) imgs.push([i, u, o.n]); o.x.i = i; delete o.x.img }
      const K = {}; for (const k of ['a', 't', 'c', 'r', 'f', 'i', 'o', 'm']) if (o.x[k] !== undefined) K[k] = o.x[k]; o.x = K;
      if (!p) warn.push(`${id} ${o.n}: แหล่งใหม่ (${o.x.o === 'd' ? 'Excel' : 'สบอ.1'}) — คำอธิบายว่าง`);
    }
    L.sort((a, b) => ORD.indexOf(a.ty) - ORD.indexOf(b.ty) || (a.lo == null) - (b.lo == null) || a.n.localeCompare(b.n, 'th'));
    res[id] = { L: L.map(o => o.keep || [o.n, o.ty, o.lo, o.la, o.d, o.x]), imgs };
  }
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.L]))));
  KM.forEach((m, j) => { if (!used.has(j)) warn.push(`KML ${m.nm}: ไม่อยู่ใน 4 อุทยาน (NAME_DNP "${m.NAME_DNP || ''}") — ข้าม`) });

  const lit = v => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
    : Array.isArray(v) ? '[' + v.map(lit).join(',') + ']' : '{' + Object.keys(v).map(k => lit(k) + ':' + lit(v[k])).join(',') + '}';
  const sh = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
  let same = true;
  for (const id of Object.keys(PARK).sort((a, b) => T[b].s - T[a].s)) {   /* แทนจากท้ายไฟล์ขึ้นมา ตำแหน่งที่เหลือจึงไม่เลื่อน */
    const o = html.slice(T[id].s, T[id].e), n = lit(res[id].L), eq = o === n; same = same && eq;
    console.log(`${id}: ${res[id].L.length} แหล่ง (Excel ${res[id].L.filter(x => x[5] && x[5].o === 'd').length} · สบอ.1 อย่างเดียว ${res[id].L.filter(x => x[5] && x[5].o === 'm').length} · เขียนมือ ${res[id].L.filter(x => x.length < 6).length}) sha1 เดิม ${sh(o)} ใหม่ ${sh(n)}${eq ? ' = เท่าเดิม' : ' ≠ เปลี่ยน'}`);
    if (!eq) { const ov = T[id].v.map(lit), nv = res[id].L.map(lit); ov.filter(x => !nv.includes(x)).forEach(x => console.log('   - ' + x)); nv.filter(x => !ov.includes(x)).forEach(x => console.log('   + ' + x)) }
    if (!DRY) html = html.slice(0, T[id].s) + n + html.slice(T[id].e);
  }
  if (warn.length) console.log('หมายเหตุ:\n  ' + warn.join('\n  '));
  const IM = Object.values(res).flatMap(r => r.imgs).filter(([i]) => !fs.existsSync(path.join(ROOT, 'data', 'tour', i + '.jpg')));
  if (IM.length) {
    console.log(`ภาพใหม่ ${IM.length} ภาพ` + (IMG ? ' → ดาวน์โหลด data/tour/' : ' (รันซ้ำด้วย --img เพื่อดาวน์โหลด)'));
    if (IMG && !DRY) for (const [i, u, n] of IM) { const r = await fetch(u.replace(/([?&])fife=[^&]*/, '$1fife=w480-rj-l78'), { signal: AbortSignal.timeout(60e3) }); if (!r.ok) { console.log(`   ${n}: HTTP ${r.status}`); continue } fs.writeFileSync(path.join(ROOT, 'data', 'tour', i + '.jpg'), Buffer.from(await r.arrayBuffer())); console.log(`   ${i}.jpg ${n}`) }
  }
  console.log(same ? 'tour ทั้ง 4 อุทยานเท่าเดิมทุกไบต์' : 'tour เปลี่ยน');
  if (DRY) console.log('--dry: ไม่เขียน index.html'); else if (!same) { fs.writeFileSync(H, html); console.log('เขียน index.html แล้ว') }
})().catch(e => { console.error('ผิดพลาด:', e.message); process.exit(1) });
