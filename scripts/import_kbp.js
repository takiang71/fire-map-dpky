// ข้อมูลอุทยานจาก Excel 6 ไฟล์ของกรมอุทยานฯ → ค่าคงที่ `const KBP={…};` ใน index.html (C3, 16 พ.ย. 69 — เขียนแทนสคริปต์เดิมที่อยู่ใน scratchpad แล้วสูญหาย)
// ใช้: node scripts/import_kbp.js <โฟลเดอร์ที่มีไฟล์ทั้ง 6> [--dry]
//  · หาไฟล์จากชื่อ (ไม่สนนามสกุล — ไฟล์ที่พักที่ดาวน์โหลดมาไม่มี .xlsx):
//      ที่พัก            /ที่พัก/                  ชีตแรก หัวตารางแถวที่มี "บ้านพัก" {อุทยานแห่งชาติ, จังหวัด, บ้านพัก, ค่ายพักแรม, รวม, พักได้}
//      ค่าเข้าอุทยาน      /ค่าบริการ(?!.*ยานพาหนะ)/  {อุทยานแห่งชาติ (+ " บริเวณ - …"), ไทยผู้ใหญ่, ไทยเด็ก, ต่างชาติผู้ใหญ่, ต่างชาติเด็ก}
//      ค่ายานพาหนะ       /ยานพาหนะ/                {ยานพาหนะ ทางบก|ทางน้ำ|ทางอากาศ, ประเภท, อัตรา ("ไม่เสียค่าบริการ" = 0), หน่วย} — ใช้เฉพาะทางบก
//      ขีดความสามารถ CC  /รองรับได้|\(CC\)/         {อุทยานแห่งชาติ, บริเวณ, ไป-กลับ คนต่อช่วงเวลา, พักค้างคืน, หมายเหตุ}
//      เสือโคร่ง          /เสือโคร่ง/               {ลำดับ, พื้นที่อนุรักษ์ (หลายพื้นที่คั่นด้วย ,), ต่ำสุด|สูงสุด, จำนวน, หมายเหตุ} · ปีจากชื่อชีต/ไฟล์
//      ช้างป่า            /ช้าง/                    {ประเภท, พื้นที่ป่าอนุรักษ์, ครอบคลุมพื้นที่, จำนวน (เลข หรือ "450-560" หรือว่าง)}
//  · ผลลัพธ์ (ลำดับคีย์ = ลำดับแถวใน Excel):
//      lodge{id:[บ้านพัก, ค่ายพักแรม, รวม, พักได้]} · fee{id:[[บริเวณ ('' = ทั้งอุทยาน), ไทยผู้ใหญ่, ไทยเด็ก, ต่างชาติผู้ใหญ่, ต่างชาติเด็ก]]} · veh[[ประเภท, บาท, หน่วย]]
//      cc{id:[[บริเวณ, ไป-กลับ|null, พักค้างคืน|null]]} · tiger{y, ids, min, max, note} (กลุ่มที่มีพื้นที่ในกลุ่มป่า) · ele{id:[จำนวน "ต่ำ–สูง"|null, พื้นที่ครอบคลุม]}
//      lodgeN = จำนวนอุทยานในไฟล์ที่พัก (แถวที่มีชื่อและตัวเลข — ไม่นับแถวผลรวมท้ายตาราง; เดิมเป็น 128 เพราะนับแถวผลรวม แก้เป็น 127 ตามที่ผู้ใช้สั่ง 17 พ.ย. 69) · eleNat [รวมต่ำ, รวมสูง, จำนวนพื้นที่ที่มีตัวเลข]
//  · --dry = ไม่เขียน index.html · พิมพ์ sha1 ของบรรทัด KBP เดิม/ใหม่ และบอกว่าเท่ากันหรือไม่ · --json <ไฟล์> = เขียนผลเป็น JSON ด้วย (เทสต์)
//  · ตรวจรับ (16 พ.ย. 69): ไฟล์ปัจจุบันใน Downloads → บรรทัด KBP เท่าเดิมทุกไบต์ (ก่อนแก้ lodgeN 128 → 127 ใน 17 พ.ย. 69 ซึ่งต่างกันเฉพาะค่านี้)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { readXlsx } = require('./lib/xlsx');

const ROOT = path.join(__dirname, '..'), H = path.join(ROOT, 'index.html');
const argv = process.argv.slice(2), DIR = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json'), DRY = argv.includes('--dry'), JOUT = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
if (!DIR || !fs.existsSync(DIR)) { console.error('ใช้: node scripts/import_kbp.js <โฟลเดอร์ที่มี Excel 6 ไฟล์> [--dry]'); process.exit(1) }

/* พื้นที่ในกลุ่มป่า: รหัสแท็บ KB → ชื่อในไฟล์ (อุทยานแห่งชาติ 4 แห่ง + เขตรักษาพันธุ์สัตว์ป่าดงใหญ่) */
const PARK = { ky: 'เขาใหญ่', tl: 'ทับลาน', ps: 'ปางสีดา', tp: 'ตาพระยา' }, WSR = { dy: 'ดงใหญ่' };
const idOf = (n, M = PARK) => Object.keys(M).find(k => M[k] === n);
const cl = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const num = v => typeof v === 'number' ? v : null;

const files = fs.readdirSync(DIR).filter(f => !f.startsWith('~$') && fs.statSync(path.join(DIR, f)).isFile());
function pick(re, label) {
  const L = files.filter(f => re.test(f) && /(\.xlsx)?$/i.test(f) && !/\.(csv|kml|kmz|jpg|png|pdf)$/i.test(f));
  if (L.length !== 1) throw new Error(`ไฟล์${label}: ` + (L.length ? `พบ ${L.length} ไฟล์ (${L.join(', ')}) — ให้เหลือไฟล์เดียว` : `ไม่พบใน ${DIR} (ชื่อต้องตรง ${re})`));
  const W = readXlsx(path.join(DIR, L[0])); console.log(`  ${label}: ${L[0]}`); return { f: L[0], W, rows: W[0].rows };
}

function build() {
  const K = {};
  // ---- ที่พัก ----
  const lo = pick(/ที่พัก/, 'ที่พัก'), h0 = lo.rows.findIndex(r => r && r.some(c => /บ้านพัก/.test(cl(c))));
  if (h0 < 0) throw new Error('ไฟล์ที่พัก: ไม่พบหัวตาราง "บ้านพัก"');
  const LR = lo.rows.slice(h0 + 1).filter(r => r && typeof r[2] === 'number');
  K.lodge = {}; for (const r of LR) { const id = idOf(cl(r[0])); if (id) K.lodge[id] = [r[2], r[3], r[4], r[5]] }
  // ---- ค่าเข้าอุทยาน ----
  const fe = pick(/ค่าบริการ(?!.*ยานพาหนะ)/, 'ค่าเข้าอุทยาน');
  K.fee = {};
  for (const r of fe.rows.slice(1)) {
    const n = cl(r && r[0]); if (!n) continue;
    const id = Object.keys(PARK).find(k => n === PARK[k] || n.startsWith(PARK[k] + ' ')); if (!id) continue;
    const sub = n === PARK[id] ? '' : n.slice(PARK[id].length).replace(/^\s*(บริเวณ)?\s*-?\s*/, '');
    (K.fee[id] = K.fee[id] || []).push([sub, r[1], r[2], r[3], r[4]]);
  }
  // ---- ค่ายานพาหนะ (ทางบก อัตราเดียวทุกอุทยาน) ----
  const ve = pick(/ยานพาหนะ/, 'ค่ายานพาหนะ');
  K.veh = ve.rows.slice(1).filter(r => r && cl(r[0]) === 'ทางบก').map(r => [cl(r[1]), num(r[2]) ?? 0, cl(r[3])]);
  // ---- ขีดความสามารถรองรับ (CC) ----
  const cc = pick(/รองรับได้|\(CC\)/, 'ขีดความสามารถ (CC)');
  K.cc = {};
  for (const r of cc.rows.slice(1)) { const id = idOf(cl(r && r[0])); if (id) (K.cc[id] = K.cc[id] || []).push([cl(r[1]), num(r[2]), num(r[3])]) }
  // ---- เสือโคร่ง: แถวกลุ่มที่มีพื้นที่ในกลุ่มป่า (ต่ำสุด/สูงสุด) ----
  const ti = pick(/เสือโคร่ง/, 'เสือโคร่ง'), ALL = { ...PARK, ...WSR };
  const nm = (ti.W[0].name || '') + ' ' + ti.f, y = (nm.match(/25\d\d/) || [''])[0];
  const area = s => cl(s).split(/\s*,\s*|\s+(?=อุทยานแห่งชาติ|เขตรักษาพันธุ์สัตว์ป่า|เขตห้ามล่าสัตว์ป่า)/).map(x => x.replace(/^(อุทยานแห่งชาติ|เขตรักษาพันธุ์สัตว์ป่า|เขตห้ามล่าสัตว์ป่า)/, '').trim()).filter(Boolean);
  const TR = ti.rows.slice(1).filter(r => r && area(r[1]).some(a => Object.values(ALL).includes(a)));
  if (!TR.length) throw new Error('ไฟล์เสือโคร่ง: ไม่พบแถวของพื้นที่ในกลุ่มป่า');
  const ids = area(TR[0][1]).map(a => idOf(a, ALL)).filter(Boolean), v = k => { const r = TR.find(r => cl(r[2]) === k); return r ? r[3] : null };
  K.tiger = { y, ids, min: v('ต่ำสุด'), max: v('สูงสุด'), note: cl(TR[0][4]) };
  // ---- ช้างป่า ----
  const el = pick(/ช้าง/, 'ช้างป่า'), rng = c => typeof c === 'number' ? [c, c] : (m => m ? [+m[1].replace(/,/g, ''), +m[2].replace(/,/g, '')] : null)(cl(c).match(/^(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)$/));
  const cnt = c => c == null || cl(c) === '' ? null : typeof c === 'number' ? String(c) : cl(c).replace(/\s*-\s*/, '–');
  K.ele = {};
  for (const r of el.rows.slice(1)) {
    if (!r) continue; const t = cl(r[0]), n = cl(r[1]);
    const id = t === 'อุทยานแห่งชาติ' ? idOf(n) : t === 'เขตรักษาพันธุ์สัตว์ป่า' ? idOf(n, WSR) : null;
    if (id) K.ele[id] = [cnt(r[3]), cl(r[2]).replace(/[\s/]+$/, '')];
  }
  K.lodgeN = LR.filter(r => cl(r[0])).length;
  const E = el.rows.slice(1).map(r => r && rng(r[3])).filter(Boolean);
  K.eleNat = [E.reduce((s, e) => s + e[0], 0), E.reduce((s, e) => s + e[1], 0), E.length];
  for (const k of ['lodge', 'fee', 'cc', 'ele']) if (!Object.keys(K[k]).length) throw new Error(`ไม่พบข้อมูลพื้นที่ในกลุ่มป่าใน ${k}`);
  return K;
}

// รูปแบบเดียวกับค่าคงที่เดิม: JS literal ใช้ ' ไม่มีช่องว่าง
const lit = v => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
  : Array.isArray(v) ? '[' + v.map(lit).join(',') + ']' : '{' + Object.keys(v).map(k => lit(k) + ':' + lit(v[k])).join(',') + '}';

console.log('อ่านไฟล์จาก', DIR);
const K = build(), line = 'const KBP=' + lit(K) + ';';
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(K));
let html = fs.readFileSync(H, 'utf8');
const a = html.indexOf('\nconst KBP='), e = a < 0 ? -1 : html.indexOf('\n', a + 1);
if (a < 0 || html.indexOf('\nconst KBP=', a + 1) >= 0) throw new Error('index.html: ต้องมีบรรทัด const KBP= บรรทัดเดียว');
const old = html.slice(a + 1, e), sh = s => crypto.createHash('sha1').update(s).digest('hex');
console.log(`ที่พัก ${Object.entries(K.lodge).map(([k, v]) => k + ' ' + v.join('/')).join(' · ')} · lodgeN ${K.lodgeN}`);
console.log(`ค่าเข้า ${Object.keys(K.fee).join(' ')} · ยานพาหนะ ${K.veh.length} ประเภท · CC ${Object.entries(K.cc).map(([k, v]) => k + ' ' + v.length + ' บริเวณ').join(' ')}`);
console.log(`เสือโคร่ง ${K.tiger.y}: ${K.tiger.ids.join('+')} ${K.tiger.min}–${K.tiger.max} ตัว · ช้างป่า ${Object.entries(K.ele).map(([k, v]) => k + ' ' + (v[0] || '-')).join(' ')} · ทั้งประเทศ ${K.eleNat[0]}–${K.eleNat[1]} (${K.eleNat[2]} พื้นที่)`);
console.log(`sha1 KBP เดิม ${sh(old)}\nsha1 KBP ใหม่ ${sh(line)} → ${old === line ? 'เท่าเดิมทุกไบต์' : 'เปลี่ยน'}`);
if (DRY) console.log('--dry: ไม่เขียน index.html');
else if (old !== line) { html = html.slice(0, a + 1) + line + html.slice(e); fs.writeFileSync(H, html); console.log('เขียน index.html แล้ว') }
