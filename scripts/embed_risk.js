// ฝังสำเนา scripts/lib/risk.js (ดัชนีเสี่ยงไฟป่า F2) ลงใน index.html ระหว่างเครื่องหมาย /*RISK-LIB-BEGIN*/ … /*RISK-LIB-END*/ (แบบ embed_orbit.js)
// แก้ risk.js แล้วรัน: node scripts/embed_risk.js · ตรวจอย่างเดียว: node scripts/embed_risk.js --check (check_site.js ตรวจด้วย)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), H = path.join(ROOT, 'index.html'), B = '/*RISK-LIB-BEGIN*/', E = '/*RISK-LIB-END*/';
function parts(s) { const i = s.indexOf(B), j = s.indexOf(E); if (i < 0 || j < i) throw new Error('ไม่พบเครื่องหมาย RISK-LIB'); return [s.slice(0, i), s.slice(i, j + E.length), s.slice(j + E.length)] }
const lib = parts(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'risk.js'), 'utf8').replace(/\r\n/g, '\n'))[1];
const html = fs.readFileSync(H, 'utf8'), [a, cur, c] = parts(html);
if (process.argv.includes('--check')) { if (cur !== lib) { console.error('สำเนา risk.js ใน index.html ไม่ตรงกับ scripts/lib/risk.js — รัน node scripts/embed_risk.js'); process.exit(1) } console.log('risk.js ตรงกัน'); }
else if (cur === lib) console.log('ไม่เปลี่ยน');
else { fs.writeFileSync(H, a + lib + c); console.log('ฝัง risk.js ลง index.html แล้ว') }
