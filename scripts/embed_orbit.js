// ฝังสำเนา scripts/lib/orbit.js (SGP4 + รอบผ่านของดาวเทียม) ลงใน index.html ระหว่างเครื่องหมาย /*ORB-LIB-BEGIN*/ … /*ORB-LIB-END*/
// แก้ orbit.js แล้วรัน: node scripts/embed_orbit.js · ตรวจว่าตรงกันอย่างเดียว: node scripts/embed_orbit.js --check (check_site.js เรียก)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), H = path.join(ROOT, 'index.html'), B = '/*ORB-LIB-BEGIN*/', E = '/*ORB-LIB-END*/';
function parts(s) { const i = s.indexOf(B), j = s.indexOf(E); if (i < 0 || j < i) throw new Error('ไม่พบเครื่องหมาย ORB-LIB'); return [s.slice(0, i), s.slice(i, j + E.length), s.slice(j + E.length)] }
const lib = parts(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'orbit.js'), 'utf8').replace(/\r\n/g, '\n'))[1];
const html = fs.readFileSync(H, 'utf8'), [a, cur, c] = parts(html);
if (process.argv.includes('--check')) { if (cur !== lib) { console.error('สำเนา orbit.js ใน index.html ไม่ตรงกับ scripts/lib/orbit.js — รัน node scripts/embed_orbit.js'); process.exit(1) } console.log('orbit.js ตรงกัน'); }
else if (cur === lib) console.log('ไม่เปลี่ยน');
else { fs.writeFileSync(H, a + lib + c); console.log('ฝัง orbit.js ลง index.html แล้ว') }
