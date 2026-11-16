// นำเข้าข้อมูลที่ต้องทำด้วยมือทั้งโฟลเดอร์ (C3, 16 พ.ย. 69) — ตารางชุดข้อมูลทั้งหมดอยู่ใน docs/arch/data-update.md
// ใช้: node scripts/import_all.js <โฟลเดอร์ที่มีไฟล์ใหม่> [--dry] [--hdata] [--no-check]
//  · ดูไฟล์ทีละไฟล์ (ไม่ไล่โฟลเดอร์ย่อย) แยกชนิดจากหัวคอลัมน์ Excel / ไฟล์ใน zip แล้วเรียกตัวนำเข้าที่ตรงกัน:
//      Excel สถิติดับไฟรวม อส. (มีคอลัมน์ เข้าดับไฟ + เสร็จสิ้น)                → scripts/import_fx.js <ไฟล์>          (บล็อก fxdata)
//      Excel จุดความร้อนกรมอุทยานฯ (ปีงบประมาณ ว/ด/ป เวลา LAT LONG …)        → scripts/excel_to_hdata.js <ไฟล์> + sync_hotspots.js
//                                                                               **ต้องใส่ --hdata** (กติกาข้อ 3: ห้ามแก้ hdata ก่อนผู้ใช้อนุญาต)
//      .zip ที่มี .shp + .dbf (หน่วยพิทักษ์/จุดสกัด/ฐาน)                       → scripts/import_rangers.js <ไฟล์>     (data/ranger.json, data/fbase.json)
//      Excel อุทยาน 6 ไฟล์ (ที่พัก/ค่าบริการ/CC/เสือโคร่ง/ช้าง — ไฟล์ที่พักอาจไม่มีนามสกุล)        → scripts/import_kbp.js <โฟลเดอร์> ครั้งเดียว (ค่าคงที่ KBP)
//      Excel แหล่งท่องเที่ยวในอุทยานแห่งชาติ + KML สบอ.1 (ชื่อมี "ท่องเที่ยว")              → scripts/import_tour.js <xlsx> <kml> (tour ใน KB; ต้องมีทั้งคู่)
//      .kmz/.kml อื่น (พื้นที่เฝ้าระวัง จปร. ต้องระบุ --id/--name) → พิมพ์คำสั่ง import_watch.js ให้รันเอง ไม่รันอัตโนมัติ
//  · หลังนำเข้า (ไม่ใช่ --dry): node --test test/ แล้ว node scripts/check_site.js (ข้ามด้วย --no-check) — ไม่ผ่าน = จบด้วยรหัส 1
//  · ไม่ commit ให้ — ตรวจผลแล้ว git add/commit เอง (ดูขั้นตอนใน data-update.md)
//  · --dry = แสดงแผนอย่างเดียว ไม่แก้ไฟล์
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { readXlsx, unzip } = require('./lib/xlsx');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2), DIR = argv.find(a => !a.startsWith('--'));
const DRY = argv.includes('--dry'), HDATA = argv.includes('--hdata'), NOCHK = argv.includes('--no-check');
if (!DIR || !fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) { console.error('ใช้: node scripts/import_all.js <โฟลเดอร์> [--dry] [--hdata] [--no-check]'); process.exit(1) }

const KBP = /ที่พัก|อัตราค่าบริการ|รองรับได้|\(CC\)|เสือโคร่ง|ช้างป่า/;
// ชนิดของไฟล์ → {k: รหัส, s: สคริปต์ (ไม่มี = ไม่รันอัตโนมัติ), why: ข้อความ}
function kind(f) {
  const ext = path.extname(f).toLowerCase(), base = path.basename(f);
  if (ext === '.xlsx' || (!ext && KBP.test(base))) {
    let head = [];
    try { const sh = readXlsx(f)[0]; head = ((sh && sh.rows[0]) || []).map(h => String(h == null ? '' : h).trim()) } catch (e) { return { k: '?', why: 'อ่าน Excel ไม่ได้: ' + e.message } }
    const has = n => head.some(h => h.startsWith(n));
    if (has('เข้าดับไฟ') && has('เสร็จสิ้น') && has('ลำดับ')) return { k: 'fx', s: 'import_fx.js', why: 'Excel สถิติดับไฟรวม อส. → บล็อก fxdata' };
    if (head[0] === 'ปีงบประมาณ' && head[1] === 'ว/ด/ป' && head[3] === 'LAT' && head[4] === 'LONG') return { k: 'hdata', s: 'excel_to_hdata.js', why: 'Excel จุดความร้อนกรมอุทยานฯ → บล็อก hdata' };
    if (has('ประเภทแหล่งท่องเที่ยว') || (has('Latitude') && has('ชื่ออุทยานแห่งชาติ'))) return { k: 'tour', s: 'import_tour.js', why: 'Excel แหล่งท่องเที่ยวในอุทยานแห่งชาติ → tour ใน KB (คู่กับ KML สบอ.1)' };
    if (KBP.test(base)) return { k: 'kbp', s: 'import_kbp.js', why: 'Excel ข้อมูลอุทยาน → ค่าคงที่ KBP (รันครั้งเดียวทั้งโฟลเดอร์)' };
    return { k: '?', why: 'ไม่รู้จักรูปแบบคอลัมน์: ' + head.slice(0, 6).join(' | ') };
  }
  if (ext === '.zip') {
    try {
      const Z = unzip(fs.readFileSync(f)), dk = Object.keys(Z).find(x => x.toLowerCase().endsWith('.dbf'));
      if (!dk || !Object.keys(Z).some(x => x.toLowerCase().endsWith('.shp'))) return { k: '?', why: 'zip ไม่มี shapefile' };
      const dbf = Z[dk], F = []; for (let o = 32; o + 32 <= dbf.length && dbf[o] !== 0x0d; o += 32) F.push(dbf.slice(o, o + 11).toString('latin1').replace(/\0.*$/, ''));
      /* ฟิลด์ที่ import_rangers.js ใช้: station_na = หน่วยพิทักษ์/จุดสกัด/ฐานเฉพาะกิจ · ban = ฐานป้องกันรักษาป่า */
      if (F.includes('station_na') || F.includes('ban')) return { k: 'ranger', s: 'import_rangers.js', why: 'shapefile ' + (F.includes('ban') ? 'ฐานป้องกันรักษาป่า → data/fbase.json' : 'หน่วยพิทักษ์/จุดสกัด/ฐานเฉพาะกิจ → data/ranger.json') };
      return { k: '?', why: 'shapefile ที่ไม่รู้จัก (ฟิลด์: ' + F.slice(0, 6).join(', ') + ')' };
    } catch (e) { return { k: '?', why: 'อ่าน zip ไม่ได้: ' + e.message } }
  }
  if (ext === '.kml' || ext === '.kmz') {
    if (/ท่องเที่ยว/.test(base)) return { k: 'tourkml', why: 'KML สบอ.1 พิกัดแหล่งท่องเที่ยว (NetworkLink → ดึง Google My Maps) ใช้คู่กับ Excel แหล่งท่องเที่ยว' };
    return { k: 'kmz', why: 'KMZ/KML — ถ้าเป็นพื้นที่เฝ้าระวังเป็นพิเศษ รันเอง: node scripts/import_watch.js <แนวเขต.kmz> <จุดความร้อน.kmz> --id <รหัส> --name "<ชื่อ>" --short <ชื่อย่อ> · แนวเขตป่า: วางใน data/kmz แล้ว node scripts/kmz_to_geojson.js' };
  }
  return null;
}

const files = fs.readdirSync(DIR).map(f => path.join(DIR, f)).filter(f => fs.statSync(f).isFile() && !path.basename(f).startsWith('~$'));
const plan = files.map(f => ({ f, ...(kind(f) || {}) })).filter(p => p.k);
if (!plan.length) { console.log('ไม่พบไฟล์ที่รู้จักใน', DIR); process.exit(0) }
console.log(`ไฟล์ใน ${DIR}:`);
for (const p of plan) console.log(`  ${p.s || p.k === 'tourkml' ? (p.k === 'hdata' && !HDATA ? '⏸' : '▶') : '·'} ${path.basename(p.f)} — ${p.why}${p.k === 'hdata' && !HDATA ? ' — ข้าม: ต้องได้รับอนุญาตจากผู้ใช้ แล้วรันใหม่ด้วย --hdata' : ''}`);
const dup = ['fx', 'hdata', 'tour', 'tourkml'].filter(k => plan.filter(p => p.k === k).length > 1);
if (dup.length) { console.error(`มีไฟล์ชนิดเดียวกันมากกว่า 1 ไฟล์ (${dup.join(', ')}) — ตัวนำเข้าแทนข้อมูลทั้งก้อน ให้เหลือไฟล์ล่าสุดไฟล์เดียว`); process.exit(1) }
const tk = plan.find(p => p.k === 'tourkml'), tx = plan.find(p => p.k === 'tour');
if (!!tk !== !!tx) { console.error('แหล่งท่องเที่ยวต้องมีทั้ง Excel แหล่งท่องเที่ยวในอุทยานแห่งชาติ และ KML สบอ.1 ในโฟลเดอร์เดียวกัน'); process.exit(1) }
/* งานที่จะรัน: [สคริปต์, อาร์กิวเมนต์, ข้อความ] — KBP ครั้งเดียวทั้งโฟลเดอร์ · tour = Excel + KML */
const run = [];
for (const p of plan) {
  if (!p.s || (p.k === 'hdata' && !HDATA)) continue;
  if (p.k === 'kbp') { if (!run.some(r => r[0] === p.s)) run.push([p.s, [DIR], 'ข้อมูลอุทยาน 6 ไฟล์ → KBP']); continue }
  if (p.k === 'tour') { run.push([p.s, [p.f, tk.f], p.why]); continue }
  run.push([p.s, [p.f], p.why]);
  if (p.k === 'hdata') run.push(['sync_hotspots.js', [], 'จับคู่ dnp ของ adata กับ hdata ใหม่']);
}
if (DRY) { console.log(`--dry: จะรัน ${run.length} ตัวนำเข้า${run.length && !NOCHK ? ' + node --test test/ + check_site' : ''}`); process.exit(0) }

const sh = (args, label) => { console.log(`\n=== ${label}: node ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`); const r = cp.spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }); return r.status === 0 };
let ok = true;
for (const [s, a, why] of run) ok = sh([path.join('scripts', s), ...a], why) && ok;
if (run.length && !NOCHK) {
  ok = sh(['--test', 'test/'], 'ชุดทดสอบหน่วย') && ok;
  if (ok) ok = sh([path.join('scripts', 'check_site.js')], 'ตรวจหน้าเว็บ (~3 นาที)') && ok;
}
console.log(ok ? `\n✅ นำเข้า ${run.length} ไฟล์เสร็จ — ตรวจ git diff แล้ว commit เอง` : '\n❌ มีขั้นที่ไม่ผ่าน — ดูข้อความด้านบน (ไฟล์ที่แก้ไปแล้วยังอยู่ ใช้ git diff / git checkout เพื่อตรวจ/ย้อน)');
process.exit(ok ? 0 : 1);
