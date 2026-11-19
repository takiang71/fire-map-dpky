// DF แบบรับแจ้งเหตุไฟป่า กรมอุทยานฯ → dnpform.json → แถวการดับไฟในหน้าเว็บ (19 พ.ย. 69) — scripts/lib/dnpform.js · docs/arch/dnp-form.md
//  · ไม่ดาวน์โหลดคอลัมน์ข้อมูลส่วนบุคคล (อีเมล/ผู้กรอก/เบอร์) · แปลงชื่อให้ตรงข้อมูล Excel อส. · กรองเฉพาะกลุ่มป่า · รวมแท็บคำตอบกับแท็บ สบอ.
//  · หน้าเว็บ dfXT: เติมเฉพาะปีงบที่ไม่มีใน Excel · แถว VF ยังอยู่ท้ายสุด
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { grab, load, HTML } = require('./helpers.cjs');
const D = require('../scripts/lib/dnpform');

const HEAD = ['ประทับเวลา', 'ที่อยู่อีเมล', 'วันที่และเวลารับแจ้งเหตุ', 'สำนักบริหารพื้นที่อนุรักษ์', 'พื้นที่เกิดไฟป่า', 'พื้นที่ป่าอนุรักษ์', 'พื้นที่ป่าสงวนแห่งชาติ', 'ตรวจพบไฟจาก', 'จุดที่ตรวจพบไฟ', 'ประเภทกลุ่มไฟ', 'กลุ่มไฟเดิม', 'Zone', 'พิกัด X', 'พิกัด Y', 'ID (Hotspot)', 'จำนวนจุด Hotspot รวม', 'หมู่บ้าน/บริเวณ', 'หมู่ที่', 'ตำบล', 'อำเภอ', 'จังหวัด', 'สถานีฯที่เข้าดับไฟ', 'หน่วยงานที่ร่วมบูรณาการ', 'จำนวนหน่วยงานที่เข้าดับไฟ (หน่วย)', 'จำนวนผู้ปฏิบัติงานทั้งหมด (นาย)', 'สาเหตุการเกิดไฟป่า', 'ชนิดป่า', '14 กลุ่มป่า', 'ผู้กรอกข้อมูล', 'เบอร์โทรศัพท์มือถือ'];
const TABH = HEAD.slice(0, 28).concat(['คำนวนเวลา', 'ระยะเวลาที่เกิดไฟ', 'สถานะของไฟป่า', 'ประมาณพื้นที่ไฟไหม้ (ไร่)', 'วันเวลาที่ดำเนินการเสร็จ', 'ระดับความรุนแรงของไฟ']);
const q = v => '"' + String(v).replace(/"/g, '""') + '"';
const CSV = rows => rows.map(r => r.map(q).join(',')).join('\n');
// gviz จำลอง: อ่าน select/where จาก tq แล้วคืนเฉพาะคอลัมน์ที่ขอ (ตรวจว่าโค้ดไม่ขอคอลัมน์ส่วนบุคคล)
function sheet(H, rows) {
  const asked = [];
  const get = async u => {
    const tq = decodeURIComponent(new URL(u).searchParams.get('tq')); asked.push(tq);
    if (/limit 0/.test(tq)) return CSV([H]);
    const m = /^select (.+?)(?: where (.+))?$/.exec(tq), cols = m[1].split(',').map(c => c.length === 1 ? c.charCodeAt(0) - 65 : (c.charCodeAt(0) - 64) * 26 + c.charCodeAt(1) - 65);
    let R = rows; if (m[2]) { const w = /^(\w+) = '(.*)'$/.exec(m[2]), i = D.col ? cols.length && (w[1].length === 1 ? w[1].charCodeAt(0) - 65 : (w[1].charCodeAt(0) - 64) * 26 + w[1].charCodeAt(1) - 65) : 0; R = rows.filter(r => r[i] === w[2]) }
    return CSV([cols.map(i => H[i])].concat(R.map(r => cols.map(i => r[i] == null ? '' : r[i]))));
  };
  return { get, asked };
}
const row = (o, H = HEAD) => H.map(h => o[h] != null ? o[h] : '');
// แนวเขตจำลอง: ลองจิจูด 101–102.5 = อช.ทับลาน สถานีฯ ทับลาน
const ctx = { where: (lo, la) => lo > 101 && lo < 102.5 && la > 13.5 && la < 15 ? { ar: 'อุทยานแห่งชาติทับลาน', st: 'สถานีควบคุมไฟป่าทับลาน', sb: 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)' } : null, adm: () => ({ t: 'บุพราหมณ์', a: 'นาดี', p: 'ปราจีนบุรี' }), SBP: { 'ปราจีนบุรี': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)' } };
const SBO1 = 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)';
const BASE = { 'ประทับเวลา': '10/12/2026, 9:00:00', 'ที่อยู่อีเมล': 'staff@example.com', 'วันที่และเวลารับแจ้งเหตุ': '9/12/2026, 14:30:00', 'สำนักบริหารพื้นที่อนุรักษ์': SBO1, 'พื้นที่เกิดไฟป่า': 'ป่าอนุรักษ์', 'พื้นที่ป่าอนุรักษ์': 'อุทยานแห่งชาติทับลาน',
  'ตรวจพบไฟจาก': '1. ดาวเทียม (Hotspot)', 'จุดที่ตรวจพบไฟ': 'ตรงกับHotspot', 'ประเภทกลุ่มไฟ': 'กลุ่มไฟใหม่', 'Zone': '47', 'พิกัด X': '812345', 'พิกัด Y': '1561234', 'ID (Hotspot)': 'D_12', 'หมู่บ้าน/บริเวณ': 'ซับใหญ่', 'หมู่ที่': '5',
  'ตำบล': 'บุพราหม', 'อำเภอ': 'นาดี', 'จังหวัด': 'ปราจีนบุรี', 'สถานีฯที่เข้าดับไฟ': 'สถานีควบคุมไฟป่าปราจีนบุรี', 'หน่วยงานที่ร่วมบูรณาการ': 'อบต.บุพราหมณ์', 'จำนวนผู้ปฏิบัติงานทั้งหมด (นาย)': '12', 'สาเหตุการเกิดไฟป่า': 'เก็บหาของป่า', 'ชนิดป่า': 'ป่าเบญจพรรณ',
  'ผู้กรอกข้อมูล': 'นายทดสอบ', 'เบอร์โทรศัพท์มือถือ': '0812345678' };

test('dt: วันที่จาก gviz ว/ด/ปี · พ.ศ. → ค.ศ. · พิมพ์ 69 (2069) = พ.ศ. 2569 · ไม่มีเวลา', () => {
  assert.equal(D.dt('9/12/2026, 14:30:00').ms, Date.UTC(2026, 11, 9, 7, 30));
  assert.equal(D.dt('9/12/2569, 14:30:00').ms, Date.UTC(2026, 11, 9, 7, 30));
  assert.equal(D.dt('23/3/2069, 8:00:00').ms, Date.UTC(2026, 2, 23, 1, 0));
  assert.deepEqual(D.dt('9/12/2026'), { ms: Date.UTC(2026, 11, 8, 17), time: false });
  assert.equal(D.dt(''), null);
});

test('ชื่อจากตัวเลือกฟอร์ม → ชุดเดียวกับข้อมูล Excel อส.', () => {
  assert.equal(D.rpOf('1. ดาวเทียม (Hotspot)'), 'ดาวเทียม (Hotspot)');
  assert.equal(D.rpOf('ดาวเทียม NOAA20'), 'ดาวเทียม (Hotspot)');
  assert.equal(D.rpOf('3. จุดเฝ้าระวังไฟป่า'), 'ชุดจุดตรวจ/จุดสกัด/จุดเฝ้าระวังไฟป่า');
  assert.equal(D.rpOf('6. หอดูไฟ'), 'ชุดจุดตรวจ/จุดสกัด/จุดเฝ้าระวังไฟป่า');
  assert.equal(D.rpOf('4. ลาดตระเวน'), 'ชุดลาดตระเวนและเฝ้าระวังไฟป่า');
  assert.equal(D.rpOf('8. อส.อส.'), 'เครือข่ายไฟป่าและหมอกควัน (อส.อส)');
  assert.equal(D.rpOf('9. ประชาชนทั่วไป'), 'ชาวบ้านในพื้นที่');
  assert.deepEqual(D.csOf('ไม่ทราบ'), ['ไม่ทราบสาเหตุ', '']);
  assert.deepEqual(D.csOf('อุบัติเหตุ,ประมาท,เลินเล่อ'), ['อุบัติเหตุ/ประมาท/เลินเล่อ', '']);
  assert.equal(D.csOf('การลักลอบทำไม้')[0], 'ลักลอบทำไม้');
  assert.equal(D.csOf('เกิดจากการฝึกซ้อมยิงปืนด้วยกระสุนจริงของทหารอากาศ (กองบิน 1)')[0], 'ฝึกซ้อมยิงปืนของทหาร');
  assert.equal(D.csOf('เกิดจากไฟไหม้ทางฝั่งกัมพูชาลามเข้ามา')[0], 'ไฟข้ามเขตจากประเทศเพื่อนบ้าน');
  const long = 'ก'.repeat(60); assert.deepEqual(D.csOf(long), ['สาเหตุอื่นๆ', long]);
  assert.equal(D.frOf({ 'พื้นที่เกิดไฟป่า': 'ป่าอนุรักษ์', 'พื้นที่ป่าอนุรักษ์': 'เตรียมการเขตห้ามล่าสัตว์ป่าป่าเขาฉกรรจ์' }), 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)');
  assert.equal(D.frOf({ 'พื้นที่เกิดไฟป่า': 'นอกพื้นที่ป่าฯ' }), 'นอกพื้นที่ป่าอนุรักษ์');
  assert.equal(D.stOf({ 'สถานีฯที่เข้าดับไฟ': 'สถานีควบคุมไฟป่านครนายก' }, '', null), 'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)', 'เปลี่ยนชื่อสถานีฯ ตาม STRN');
  assert.equal(D.stOf({ 'สถานีฯที่เข้าดับไฟ': 'อื่นๆ', 'หน่วยงานที่ร่วมบูรณาการ': 'ไม่มี' }, 'อุทยานแห่งชาติตาพระยา', null), 'อุทยานแห่งชาติตาพระยา', 'อื่นๆ = อุทยานฯ ตามพื้นที่ป่า');
  assert.equal(D.stOf({ 'สถานีฯที่เข้าดับไฟ': 'อื่นๆ', 'หน่วยงานที่ร่วมบูรณาการ': 'สถานีควบคุมไฟป่าวังน้ำเขียว, อบต.' }, 'อุทยานแห่งชาติทับลาน', null), 'สถานีควบคุมไฟป่าวังน้ำเขียว');
});

test('STRN ชุดเดียวกับ index.html และ import_fx.js', () => {
  const a = load(grab(/(const STRN=\{[^}]*\};)/), ['STRN']).STRN;
  const b = load(grab(/(const STRN = \{[^}]*\};)/, fs.readFileSync(path.join(__dirname, '..', 'scripts', 'import_fx.js'), 'utf8')), ['STRN']).STRN;
  assert.deepEqual(D.STRN, a); assert.deepEqual(D.STRN, b);
});

test('dnpForm: ไม่ขอคอลัมน์ส่วนบุคคล · กรองกลุ่มป่า · รวมแท็บ สบอ. (ไร่/เวลาเสร็จ) · แถวที่ศูนย์ฯ เพิ่มเอง', async () => {
  const raw = [row(BASE),
    row({ ...BASE, 'ประทับเวลา': '11/12/2026, 9:00:00', 'พิกัด X': '650000', 'พิกัด Y': '1600000', 'Zone': '47', 'พื้นที่ป่าอนุรักษ์': 'อุทยานแห่งชาติเขาสิบห้าชั้น', 'สถานีฯที่เข้าดับไฟ': 'สถานีควบคุมไฟป่าเขาสิบห้าชั้น' }),  /* นอกกลุ่มป่า */
    row({ ...BASE, 'ประทับเวลา': '12/12/2026, 9:00:00', 'สำนักบริหารพื้นที่อนุรักษ์': 'สำนักบริหารพื้นที่อนุรักษ์ที่ 2 (ศรีราชา)' })];  /* สบอ. อื่น (gviz where ตัดออก) */
  const tab = [row({ ...BASE, 'ประมาณพื้นที่ไฟไหม้ (ไร่)': '125 ไร่', 'วันเวลาที่ดำเนินการเสร็จ': '9/12/2026, 18:10:00', 'สถานะของไฟป่า': 'ดำเนินการเรียบร้อย', 'ระดับความรุนแรงของไฟ': 'ควบคุมได้' }, TABH),
    row({ ...BASE, 'ประทับเวลา': '13/12/2026, 9:00:00', 'วันที่และเวลารับแจ้งเหตุ': '13/12/2026, 7:00:00', 'ประมาณพื้นที่ไฟไหม้ (ไร่)': '3' }, TABH)];
  const A = sheet(HEAD, raw), B = sheet(TABH, tab);
  const get = u => (new URL(u).searchParams.get('gid') === 'R' ? A : B).get(u);
  const J = await D.dnpForm(get, ctx, [{ k: 'สบอ.1', id: 'x', raw: 'R', tab: 'T', sbo: SBO1 }]);
  for (const [S, H] of [[A, HEAD], [B, TABH]]) for (const tq of S.asked.filter(t => !/limit 0/.test(t))) {
    const cols = tq.replace(/^select /, '').split(' where ')[0].split(',');
    for (const h of ['ที่อยู่อีเมล', 'ผู้กรอกข้อมูล', 'เบอร์โทรศัพท์มือถือ']) { const i = H.indexOf(h); if (i >= 0) assert.ok(!cols.includes(D.col(i)), 'ขอคอลัมน์ ' + h) }
    assert.equal(cols.length, H.filter(h => !D.PRIV.test(h)).length, 'ขอครบทุกคอลัมน์ที่ไม่ใช่ข้อมูลส่วนบุคคล');
  }
  assert.ok(A.asked.some(t => / where D = 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 \(ปราจีนบุรี\)'$/.test(t)), 'แท็บคำตอบกรองเฉพาะ สบอ. ของตาราง');
  assert.ok(!JSON.stringify(J).includes('example.com') && !JSON.stringify(J).includes('0812345678') && !JSON.stringify(J).includes('นายทดสอบ'), 'ไม่มีข้อมูลส่วนบุคคลในผล');
  assert.deepEqual(J.sheets, [{ k: 'สบอ.1', raw: 2, tab: 2, n: 2 }]);
  const [r, r2] = J.rows;
  assert.equal(r.d, Math.floor(Date.UTC(2026, 11, 9) / 864e5)); assert.equal(r.t, 1430); assert.equal(r.fy, 2570);
  assert.equal(r.st, 'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)'); assert.equal(r.ar, 'อุทยานแห่งชาติทับลาน'); assert.equal(r.fr, 'อุทยานแห่งชาติทับลาน');
  assert.equal(r.rai, 125); assert.equal(r.te, 1810); assert.equal(r.du, 220); assert.equal(r.hs, 0); assert.equal(r.rp, 'ดาวเทียม (Hotspot)'); assert.equal(r.cs, 'เก็บหาของป่า');
  assert.equal(r.tm, 'บุพราหมณ์', 'ตำบลตามพิกัด (admin.json) แทนคำที่พิมพ์'); assert.equal(r.op, '12 คน · อบต.บุพราหมณ์'); assert.equal(r.sev, 'ควบคุมได้'); assert.equal(r.hid, 'D_12'); assert.equal(r.src, 'สบอ.1');
  assert.equal(r2.t, 700); assert.equal(r2.rai, 3, 'แถวที่มีเฉพาะในแท็บ สบอ. ยังนับ');
});

test('dnpForm: แท็บ สบอ. อ่านไม่ได้ = ใช้แท็บคำตอบ (ไม่มีไร่) · ทั้งสองแท็บอ่านไม่ได้ = err', async () => {
  const A = sheet(HEAD, [row(BASE)]);
  const get = u => new URL(u).searchParams.get('gid') === 'R' ? A.get(u) : Promise.reject(new Error('HTTP 401'));
  const J = await D.dnpForm(get, ctx, [{ k: 'สบอ.1', id: 'x', raw: 'R', tab: 'T', sbo: SBO1 }]);
  assert.equal(J.rows.length, 1); assert.equal(J.rows[0].rai, 0); assert.match(J.sheets[0].err, /HTTP 401/);
  const K = await D.dnpForm(() => Promise.reject(new Error('ปิดการแชร์')), ctx, [{ k: 'สบอ.1', id: 'x', raw: 'R', tab: 'T', sbo: SBO1 }]);
  assert.equal(K.rows.length, 0); assert.equal(K.sheets[0].raw, 0); assert.match(K.sheets[0].err, /ปิดการแชร์/);
  await assert.rejects(D.readTab(async () => CSV([['ชื่อ', 'อีเมล']]), 'x', '1'), /ไม่ใช่แบบรับแจ้งเหตุ/);
});

test('dnpForm: วันที่รับแจ้งผิดรูป/อยู่หลังเวลาส่ง = ใช้เวลาส่ง (bad) · พิกัดใช้ไม่ได้แต่พื้นที่ป่าในกลุ่มป่า = เก็บ (xy 2)', () => {
  const r = D.rowOf({ ...BASE, 'วันที่และเวลารับแจ้งเหตุ': '9/12/2027, 14:30:00' }, SBO1, ctx);
  assert.equal(r.bad, 1); assert.equal(r.t, 900);
  const x = D.rowOf({ ...BASE, 'พิกัด X': '12', 'พิกัด Y': '' }, SBO1, ctx);
  assert.equal(x.xy, 2); assert.equal(x.ar, 'ไม่ทราบ (พิกัดใช้ไม่ได้)'); assert.equal(x.tm, 'บุพราหม', 'ไม่มีพิกัด = ตำบลตามที่กรอก');
  assert.equal(D.rowOf({ ...BASE, 'พิกัด X': '12', 'พื้นที่ป่าอนุรักษ์': 'อุทยานแห่งชาติแก่งกระจาน', 'สถานีฯที่เข้าดับไฟ': 'อื่นๆ' }, SBO1, ctx), null);
});

test('หน้าเว็บ dfXT: เติมเฉพาะปีงบที่ไม่มีใน Excel · ชื่อเข้า dictionary · แถว VF ต่อท้ายสุด', () => {
  const src = grab(/(function dfXT\(\)\{[\s\S]*?)\n\/\* ที่มาในป๊อปอัป/);
  const XD = { pv: ['ปราจีนบุรี'], am: [], tm: [], ar: [], st: ['สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)'], sb: [], cs: [], rp: [], fr: [] };
  const XT = [{ i: 0, fy: 2569 }, { i: 1, fy: 2569, vf: {} }];
  let vfCalled = 0;
  const env = { XT, XD, DNF: { L: [{ d: Math.floor(Date.UTC(2026, 11, 9) / 864e5), fy: 2570, t: 1430, la: 14.1, lo: 101.9, xy: 0, pv: 'ปราจีนบุรี', am: 'นาดี', tm: 'บุพราหมณ์', ar: 'อุทยานแห่งชาติทับลาน', st: 'สถานีควบคุมไฟป่าปราจีนบุรี', sb: SBO1, rai: 125, cs: 'เก็บหาของป่า', rp: 'ดาวเทียม (Hotspot)', fr: 'อุทยานแห่งชาติทับลาน', te: 1810, du: 220, hs: 0 },
    { d: Math.floor(Date.UTC(2026, 2, 1) / 864e5), fy: 2569, t: 800, pv: 'ปราจีนบุรี', rai: 9 }], fys: null, n: 0 },
    ymd: d => { const x = new Date(d * 864e5); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()] }, hm2m: t => t == null || t < 0 ? -1 : Math.floor(t / 100) * 60 + t % 100,
    STRN: D.STRN, vfXT: () => { vfCalled++; XT.push({ i: XT.length, vf: {} }) }, srcUpd: () => {}, dbg: () => {} };
  const F = load(src, ['dfXT'], env);
  F.dfXT();
  assert.equal(XT.length, 3, 'Excel 1 + DF 1 (ปีงบ 2569 ข้าม) + VF 1');
  const r = XT[1]; assert.ok(r.df); assert.ok(XT[2].vf, 'VF ท้ายสุด');
  assert.equal(r.fy, 2570); assert.equal(r.rai, 125); assert.equal(r.du, 220); assert.equal(r.ra, null); assert.equal(r.sz, 4); assert.equal(r.dk, 2); assert.equal(r.hs, 0);
  assert.equal(XD.st[r.st], 'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)'); assert.equal(r.st, 0, 'ชื่อที่มีแล้วใช้ดัชนีเดิม');
  assert.equal(XD.tm[r.tm], 'บุพราหมณ์|นาดี|ปราจีนบุรี');
  F.dfXT(); assert.equal(XT.length, 3, 'เรียกซ้ำไม่เพิ่มแถวซ้ำ'); assert.equal(vfCalled, 2);
});

test('ฟอร์มบันทึกการดับไฟของเว็บซ่อนแล้ว (ผู้ใช้เลือก 19 พ.ย. 69) · มีตัวโหลด dnpform.json', () => {
  assert.ok(!/id="fd-add"/.test(HTML), 'ไม่มีปุ่มบันทึกการดับไฟป่าในการ์ด');
  assert.ok(!/id=\\?"vf-fd\\?"/.test(HTML), 'ไม่มีปุ่มบันทึกการดับไฟในแผงรายละเอียดจุด');
  assert.ok(!/q\.get\('fd'\)==='new'/.test(HTML), 'ลิงก์ ?fd=new เปิดการ์ดอย่างเดียว ไม่เปิดฟอร์ม');
  assert.match(HTML, /fetchT\(u\+'\?t='\+Date\.now\(\),\{cache:'no-store'\},FTO\.main\)/);
  assert.match(HTML, /setTimeout\(\(\)=>dfLoad\(true\),1500\)/);
});
