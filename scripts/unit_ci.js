// รันชุดทดสอบหน่วยใน Actions (site.yml / sync.yml): แสดงผลแบบ spec ตามปกติ และถ้ามีเทสต์ล้ม
// พิมพ์ ::error ของแต่ละเทสต์ที่ล้ม + ข้อความ error บรรทัดแรก → เป็น annotation ที่อ่านได้ผ่าน API สาธารณะ/หน้ารายการรอบ
// โดยไม่ต้องล็อกอินเปิด log (15 พ.ย. 69 — เทสต์ล้มบน Node 22 ของ Actions แต่ผ่านบนเครื่อง ไล่หาไม่ได้เพราะ log ต้องล็อกอิน)
// ใช้ในเครื่องได้เหมือน node --test test/ :  node scripts/unit_ci.js   (exit code เดียวกับ node --test)
'use strict';
const { spawnSync } = require('child_process'), path = require('path');
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'test/'], { encoding: 'utf8', cwd: path.join(__dirname, '..'), maxBuffer: 64 << 20 });
const out = (r.stdout || '') + (r.stderr || '');
process.stdout.write(out);
const code = r.status === null ? 1 : r.status;
if (code !== 0) {
  const L = out.split(/\r?\n/), bad = new Map();
  L.forEach((l, i) => {
    if (!/^\s*✖/.test(l) || /failing tests/.test(l)) return;
    const name = l.trim().replace(/\s*\(\d[\d.]*ms\)$/, '');
    const msg = L.slice(i + 1, i + 8).map(x => x.trim()).find(x => /Error|expected|pending|rejection|still|ไม่/.test(x)) || '';
    if (!bad.has(name) || (!bad.get(name) && msg)) bad.set(name, msg);
  });
  const esc = s => s.replace(/%/g, '%25').replace(/[\r\n]+/g, ' ').slice(0, 400);
  for (const [n, m] of [...bad].slice(0, 8)) console.log('::error title=ชุดทดสอบหน่วยไม่ผ่าน::' + esc(n + (m ? ' — ' + m : '')));
  if (!bad.size) console.log('::error title=ชุดทดสอบหน่วยไม่ผ่าน::exit ' + code + ' · ' + esc(out.slice(-300)));
}
process.exitCode = code;
