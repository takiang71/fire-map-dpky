// โปรไฟล์ Chrome ชั่วคราว (scripts/lib/chprof.js): sweep ลบเฉพาะโฟลเดอร์เก่าตาม prefix · close ปิดโปรเซสทั้งต้นไม้แล้วลบโปรไฟล์
// เคยค้างใน %TEMP% 219 โฟลเดอร์ 18 GB (19 พ.ย. 69) เพราะลบด้วย setTimeout หลังโปรแกรมจบ
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { sweep, close } = require('../scripts/lib/chprof');

test('sweep: ลบโฟลเดอร์ prefix ที่เก่ากว่ากำหนด คงโฟลเดอร์ใหม่ ไฟล์ และ prefix อื่น', () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'chprof-t-')), mk = (n, old) => { const p = path.join(D, n); fs.mkdirSync(p); fs.writeFileSync(path.join(p, 'x'), 'x'); if (old) { const t = new Date(Date.now() - 2 * 3600e3); fs.utimesSync(p, t, t) } return p };
  try {
    const a = mk('ck-old', 1), b = mk('ck-new', 0), c = mk('chp-old', 1); fs.writeFileSync(path.join(D, 'ck-file'), 'x');
    assert.equal(sweep('ck-', 3600e3, D), 1);
    assert.equal(fs.existsSync(a), false); assert.equal(fs.existsSync(b), true); assert.equal(fs.existsSync(c), true); assert.equal(fs.existsSync(path.join(D, 'ck-file')), true);
  } finally { fs.rmSync(D, { recursive: true, force: true }) }
});

test('close: ปิดโปรเซสที่ยังทำงาน (รวมลูก) แล้วลบโปรไฟล์ · โปรเซสจบแล้ว = ลบได้ทันที', async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'chprof-c-')); fs.writeFileSync(path.join(prof, 'f'), 'x');
  /* โปรเซสแม่ที่มีลูกค้างอยู่ — แบบเดียวกับ Chrome (หลายโปรเซส) */
  const ch = spawn(process.execPath, ['-e', "require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{stdio:'ignore'});setInterval(()=>{},1e3)"], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await close(ch, prof, 5000), true);
  assert.notEqual(ch.exitCode === null && ch.signalCode === null, true, 'โปรเซสยังไม่จบ');
  assert.equal(fs.existsSync(prof), false);
  const p2 = fs.mkdtempSync(path.join(os.tmpdir(), 'chprof-c-')), done = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  await new Promise(r => done.once('exit', r));
  assert.equal(await close(done, p2), true); assert.equal(fs.existsSync(p2), false);
});
