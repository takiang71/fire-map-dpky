// C4 คุณภาพพิกัดข้อมูลดับไฟ (16 พ.ย. 69)
//  · หน้าเว็บ xqRows()/xqDist() (ดึงจาก index.html) กับ fxdata + data/admin.json จริง: นับสาเหตุตรงกับคำเตือนของ import_fx.js (q.fixed/none/mis/out)
//  · ธง ck (คอลัมน์ "ตรวจแล้ว") และแถวจากระบบรายงาน (vf) ไม่ถูกส่งออก · ระยะห่างจากตำบลที่รายงาน
//  · import_fx.js อ่านคอลัมน์ "ตรวจแล้ว": ไฟล์ .xlsx สร้างในเทสต์ (3 แถวจาก fxdata จริง) → แถวที่ติดธงไม่นับคำเตือน + r[24] = 1
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { ROOT, grab, load, xlsx } = require('./helpers.cjs');

const ADM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'admin.json'), 'utf8'));
ADM.tm.features.forEach(f => { const b = [1e9, 1e9, -1e9, -1e9]; (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(p => p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) })); f.bb = b });
const FX = JSON.parse(grab(/<script type="application\/json" id="fxdata">([\s\S]*?)<\/script>/));
const src = [/const inside=\(q,r\)=>\{[^\n]*\};/, /const admPolys=[^\n]*;/, /const admAt=[^\n]*\};/, /function xqDist\([\s\S]*?\n(?=function xqRows)/, /function xqRows\(\)[\s\S]*?\n(?=async function xqCSV)/].map(re => grab(re)).join('\n');
const env = (XT, XD = FX) => load(src, ['xqRows', 'xqDist'], { ADM, XT, XD });
const xt = r => r.map((a, i) => ({ i, d: a[0], la: a[2] / 1e5, lo: a[3] / 1e5, xy: a[4], tm: a[7], ar: a[8], seq: a[22], ck: a[24] === 1 }));
const cnt = (L, re) => L.filter(o => o.why.some(w => re.test(w))).length;
const L0 = env(xt(FX.r)).xqRows();

test('xqRows: สาเหตุตรงกับคำเตือนของ import_fx.js (fixed/none/mis/out) และเรียงตามลำดับในต้นฉบับ', () => {
  const L = L0;
  assert.equal(cnt(L, /^xy=1/), FX.q.fixed);
  assert.equal(cnt(L, /^xy=2/), FX.q.none);
  assert.equal(cnt(L, /^คนละตำบล$/), FX.q.mis, 'คนละตำบล (พิกัดอยู่ในตำบลอื่นของข้อมูลแนวเขต)');
  assert.equal(cnt(L, /^นอกแนวเขต$/), FX.q.out);
  for (let i = 1; i < L.length; i++) assert.ok(L[i].r.seq >= L[i - 1].r.seq, 'เรียงตามลำดับในต้นฉบับ');
  for (const o of L.filter(o => o.why.includes('คนละตำบล'))) assert.ok(o.d > 0, `#${o.r.seq} คนละตำบลต้องห่าง > 0 กม.`);
  for (const o of L.filter(o => o.r.xy === 2)) assert.equal(o.d, null, 'พิกัดใช้ไม่ได้ ไม่มีระยะ');
  assert.ok(L.filter(o => o.why.join() === 'นอกแนวเขต').every(o => o.d === 0), 'นอกแนวเขตอย่างเดียว = อยู่ในตำบลที่รายงาน ระยะ 0');
  console.log(`  แถวที่ควรตรวจ ${L.length} แถว (fixed ${FX.q.fixed} · none ${FX.q.none} · mis ${FX.q.mis} · out ${FX.q.out} · นอกขอบเขตข้อมูลตำบล ${cnt(L, /นอกขอบเขตข้อมูลตำบล/)})`);
  // ธงตรวจแล้ว / แถวจากระบบรายงาน ไม่ส่งออก
  const T = xt(FX.r), s0 = L[0].r.seq; T.find(r => r.seq === s0).ck = true; T.push({ ...T.find(r => r.seq === L[1].r.seq), vf: 1, seq: 99999 });
  const L2 = env(T).xqRows(); assert.equal(L2.length, L.length - 1); assert.ok(!L2.some(o => o.r.seq === s0 || o.r.vf));
});

test('xqDist: ระยะจากจุดถึงแนวเขตตำบล (สี่เหลี่ยม 0.1°) · อยู่ข้างใน = 0', () => {
  const { xqDist } = env([]), f = { geometry: { type: 'Polygon', coordinates: [[[101, 14], [101.1, 14], [101.1, 14.1], [101, 14.1], [101, 14]]] } };
  assert.equal(xqDist(f, 101.05, 14.05), 0);
  assert.ok(Math.abs(xqDist(f, 101.15, 14.05) - 0.05 * 111.32 * Math.cos(14.05 * Math.PI / 180)) < 1e-6);
  assert.ok(Math.abs(xqDist(f, 101.05, 13.9) - 0.1 * 110.57) < 1e-6);
  assert.equal(xqDist(null, 101, 14), null);
});

// ---- import_fx.js กับไฟล์ Excel จำลอง ----
const HEAD = ['ลำดับที่', 'ปีงบประมาณ', 'วัน', 'เดือน', 'ปี', 'เวลารับแจ้งเหตุ', 'รับแจ้งเหตุจาก', 'พื้นที่ป่า', 'สถานที่', 'หมู่ที่', 'ตำบล', 'อำเภอ', 'จังหวัด', 'E', 'N', 'เข้าดับไฟ', 'เสร็จสิ้น', 'พื้นที่เสียหาย(ไร่)', 'สาเหตุการเกิด', 'ดำเนินการโดย', 'ผู้รายงาน'];
const MON = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
function rowOf(a, seq) {
  const [tb, am, pv] = FX.tm[a[7]].split('|'), d = new Date(a[0] * 864e5), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  return [seq, y + 543 + (m >= 10 ? 1 : 0), d.getUTCDate(), MON[m - 1], String(y + 543), .5, 'ชาวบ้านในพื้นที่', FX.fr[a[14]], '', '', tb, am, pv, a[17], a[18], .55, .6, a[11], 'เก็บหาของป่า', 'สถานีควบคุมไฟป่าทับลาน', 'x'];
}
test('import_fx.js: คอลัมน์ "ตรวจแล้ว" ข้ามคำเตือนและติดธง r[24]=1 · ไม่มีคอลัมน์ = แถวยาว 24 ช่องเหมือนเดิม', () => {
  const misSeq = L0.find(o => o.why.join() === 'คนละตำบล').r.seq;
  const mis = FX.r.find(a => a[22] === misSeq), bad = FX.r.find(a => a[4] === 2), ok = FX.r.find(a => a[4] === 0 && !L0.some(o => o.r.seq === a[22]));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fxck-')), run = (rows, name) => {
    const f = path.join(dir, name + '.xlsx'), j = path.join(dir, name + '.json'); fs.writeFileSync(f, xlsx(rows));
    const o = cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'import_fx.js'), f, '--dry', '--json', j], { encoding: 'utf8' });
    return [JSON.parse(fs.readFileSync(j, 'utf8')), o];
  };
  try {
    const base = [rowOf(mis, 1), rowOf(bad, 2), rowOf(ok, 3)];
    const [A, oa] = run([HEAD, ...base], 'a');
    assert.equal(A.q.mis, 1); assert.equal(A.q.none, 1); assert.equal(A.q.ck, undefined); assert.ok(A.r.every(r => r.length === 24)); assert.match(oa, /ไม่มีคอลัมน์ "ตรวจแล้ว"/);
    const [B, ob] = run([HEAD.concat('ตรวจแล้ว'), base[0].concat('✓'), base[1].concat('ไม่'), base[2]], 'b');
    assert.equal(B.q.mis, 0, 'แถวคนละตำบลที่ตรวจแล้ว ไม่นับ'); assert.equal(B.q.none, 1, '"ไม่" = ยังไม่ตรวจ'); assert.equal(B.q.ck, 1); assert.match(ob, /คอลัมน์ "ตรวจแล้ว" 1 แถว/);
    const r1 = B.r.find(r => r[22] === 1); assert.equal(r1[24], 1); assert.ok(B.r.filter(r => r[22] !== 1).every(r => r.length === 24));
    assert.deepEqual(r1.slice(0, 24), A.r.find(r => r[22] === 1), 'ข้อมูลแถวเหมือนเดิมนอกจากธง');
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
});
