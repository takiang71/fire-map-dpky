// D3 ลิงก์มุมมอง ?v=ละติจูด,ลองจิจูด,ซูม[,ทิศ,เอียง]&l=… (ดึงโค้ดจริงจาก index.html): vwEnc/vwParse/vwApply ไป-กลับ, ค่าที่ไม่รู้จักถูกข้าม,
// deepLink ใช้ v เฉพาะเมื่อไม่มี ?hs ?bb ?ar ?burn ?pts ?wa · ไม่มีการเขียน URL เองนอก vwSet (สวิตช์/ปุ่มคัดลอก/แชร์)
const test = require('node:test'), assert = require('node:assert/strict');
const { HTML, grab } = require('./helpers.cjs');

const SLIT = grab(/let S=(\{base:'natural'[^\n]*?\});/);
const SRC = grab(/const VWB=[\s\S]*?(?=async function vwGo\()/);
// ปุ่มตัวเลือกในแผงชั้นข้อมูล (vwOk ตรวจค่าจาก data-v ของปุ่มจริงใน index.html)
const btns = sel => sel.split(',').flatMap(s => { const id = s.trim().match(/^#([\w-]+) button$/)[1], blk = grab(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</div>`)); return [...blk.matchAll(/data-v="([^"]+)"/g)].map(m => ({ dataset: { v: m[1] } })) });
function W(saved = {}) {
  const VWD = new Function('return ' + SLIT)(), S = Object.assign(new Function('return ' + SLIT)(), saved), calls = [];
  const env = {
    S, VWD, BNK: null, $$: btns, $: () => null, map: { setStyle: () => calls.push('setStyle'), getCenter: () => ({ lat: 14.3, lng: 101.5 }), getZoom: () => 10.3, getBearing: () => 0, getPitch: () => 0 },
    sty: () => ({}), apply: () => calls.push('apply'), sync: () => { }, dbg: () => { }, toast: () => { }, location: { protocol: 'https:', origin: 'https://x', pathname: '/fire-map-dpky/', search: '', hash: '' },
    history: { replaceState: () => calls.push('replaceState') }, document: { querySelector: () => null }, localStorage: { getItem: () => null },
  };
  const k = Object.keys(env);
  const f = new Function(...k, SRC + '\n;return{vwEnc,vwParse,vwApply,vwQS,vwURL,getBNK:()=>BNK,setBNK:v=>{BNK=v}};');
  return Object.assign(f(...k.map(x => env[x])), { S, VWD, calls });
}

test('ค่าเริ่มต้นทั้งหมด = l ว่าง · ลิงก์มีแค่ v', () => {
  const w = W(); assert.equal(w.vwEnc(), ''); assert.equal(w.vwQS(), 'v=14.30000,101.50000,10.30');
  assert.equal(w.vwURL(), 'https://x/fire-map-dpky/?v=14.30000,101.50000,10.30');
});

test('เข้ารหัสชั้นที่ต่างจากค่าเริ่มต้น (เปิด/ปิด/ตัวเลือก/แผนที่ฐาน) แล้วเปิดคืนได้ค่าเดิม', () => {
  const a = W(); Object.assign(a.S, { cons: false, amp: true, fwi: true, fwv: 'DC', burn: true, base: 'sat', img: 'esri', vr: true, vrg: 'max' }); a.setBNK('fy2569');
  const l = a.vwEnc();
  assert.equal(l, 'base:sat,img:esri,-cons,amp,burn:fy2569,fwi:DC,vr:max');
  // ผู้รับบันทึกค่าเริ่มต้นของตัวเองไว้ต่างกัน (เปิดแนวเขตตำบล, แผนที่โทนมืด) → ได้ชั้นเหมือนผู้ส่ง
  const b = W({ tam: true, base: 'dark', cons: true });
  const o = b.vwParse(new URLSearchParams('v=14.3,101.5,10.3,20,45&l=' + l));
  assert.deepEqual([o.la, o.lo, o.z, o.b, o.p], [14.3, 101.5, 10.3, 20, 45]);
  b.vwApply(o);
  assert.equal(b.vwEnc(), l);
  assert.equal(b.S.tam, false); assert.equal(b.S.base, 'sat'); assert.equal(b.getBNK(), 'fy2569');
  assert.ok(b.calls.includes('setStyle') && b.calls.includes('apply'));
  assert.ok(!b.calls.includes('replaceState'), 'เปิดลิงก์แล้วไม่เขียน URL เอง');
});

test('ค่าที่ไม่รู้จัก/ผิดรูปแบบถูกข้าม · v ผิด = ไม่ใช้ลิงก์', () => {
  const w = W(), o = w.vwParse(new URLSearchParams('v=14,101,9&l=base:moon,fwi:XYZ,burn:../x,foo,amp,%3Cb%3E'));
  w.vwApply(o);
  assert.equal(w.S.base, 'natural'); assert.equal(w.S.fwi, true); assert.equal(w.S.fwv, 'FWI'); assert.equal(w.S.amp, true); assert.equal(w.getBNK(), null);
  for (const v of ['', '14,101', 'a,b,c', '95,101,9', '14,190,9', '14,101,30']) assert.equal(w.vwParse(new URLSearchParams('v=' + v)), null, v);
});

test('deepLink: ?hs ?bb ?ar ?burn ?pts ?wa มาก่อน v · URL เขียนเฉพาะใน vwSet (เรียกจากสวิตช์/คัดลอก/แชร์)', () => {
  const dl = grab(/async function deepLink\(LD\)\{[\s\S]*?\n function|async function deepLink\(LD\)\{[^\n]*\n[^\n]*\n[^\n]*/);
  assert.match(dl, /if\(hs\.length!==2&&bb\.length!==4&&!ar&&!bn&&!pts\.length&&!wa\)\{const vw=vwParse\(q\);if\(vw\)return vwGo\(vw,LD\);return\}/);
  const n = (HTML.match(/history\.replaceState\(/g) || []).length;
  assert.equal(n, 1, 'มี replaceState ที่เดียว (vwSet)');
  assert.match(grab(/function vwSched\(\)\{[^\n]*/), /if\(!vwOn\(\)\)return;.*if\(vwOn\(\)\)vwSet\(\)/);
  const VWX = grab(/VWX=(\[[^\]]*\])/); for (const p of ['hs', 'bb', 'ar', 'burn', 'pts', 'wa', 'kb', 'wy']) assert.ok(VWX.includes(`'${p}'`), 'เขียน URL ใหม่ต้องลบ ?' + p);
});
