#!/usr/bin/env node
// กรองแถบเส้นในไทล์ความสูงเรือนยอดที่สร้างแล้ว (data/chm15) โดยไม่ต้องดาวน์โหลด DSM ใหม่ (ผู้ใช้ขอ 26 พ.ย. 69) → lib/chmfilt.js
// อ่านไทล์ซูม 13 → destripeAll → เขียนซูม 13 ใหม่ + สร้างซูม 8–12 ใหม่ + คำนวณ st (ไร่ต่อชั้นต่อพื้นที่) ใหม่ · nd (ไม่มีข้อมูล) คงเดิม · ver ใหม่ (กันแคชไทล์เก่า)
// ไทล์ที่กรองแล้ว (index.filt มีค่า) จะไม่กรองซ้ำ เว้นแต่ใส่ --force · build_chm15.js กรองให้เองแล้วตอนสร้างใหม่
// node scripts/chm_destripe.js [--dir data/chm15] [--force]
const fs = require('fs'), path = require('path');
const { readPNG, grayPNG } = require('./lib/png');
const { y2lat, consFeatures, watchFeatures, maskFn } = require('./lib/gem15');
const { destripeAll, chmStats, pyramid, OPT } = require('./lib/chmfilt');
const ROOT = path.join(__dirname, '..'), arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] };
const DIR = path.resolve(ROOT, arg('dir', 'data/chm15')), ix = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), Z = ix.zmax;
if (ix.filt && !process.argv.includes('--force')) { console.log('กรองแล้ว (' + JSON.stringify(ix.filt) + ') — ใส่ --force ถ้าต้องการกรองซ้ำ'); process.exit(0) }
const t0 = Date.now(), lvl = new Map();
for (const y in ix.rows) { const R = ix.rows[y]; for (let i = 0; i < R.length; i += 2) for (let x = R[i]; x <= R[i + 1]; x++) {
  const p = readPNG(fs.readFileSync(path.join(DIR, String(Z), String(x), y + '.png'))), px = new Uint8Array(65536); for (let k = 0; k < 65536; k++) px[k] = p.rgba[k * 4]; lvl.set(x + ',' + y, px) } }
console.log(`ซูม ${Z}: ${lvl.size} แผ่น · กำลังกรอง ${JSON.stringify(OPT)}`);
const f = destripeAll(lvl);
let ch = 0, n = 0; for (const [k, a] of lvl) { const b = f.get(k); for (let i = 0; i < 65536; i++) if (a[i] !== 255) { n++; if (a[i] !== b[i]) ch++ } }
const F = [...consFeatures(ROOT), ...watchFeatures(ROOT)], mask = maskFn(F, Z), area = (y, j) => (40075016.686 * Math.cos(y2lat(y + (j + .5) / 256, Z) * Math.PI / 180) / (256 * 2 ** Z)) ** 2 / 1600;
/* st ใหม่ = st เดิม (build คิดจากค่าทศนิยม) + ผลต่างที่การกรองทำ (คิดจากค่าปัดเต็มทั้งก่อน/หลัง) — ไม่ปนผลของการปัดเศษ */
const st = chmStats(f, F.length, mask, area), s0 = chmStats(lvl, F.length, mask, area), old = ix.st; ix.st = {};
F.forEach((ft, i) => { if (!st[i].some(v => v)) return; const o = old[ft.name] || s0[i].map(() => 0); ix.st[ft.name] = o.map((v, k) => Math.max(0, Math.round(v + st[i][k] - s0[i][k]))) });
const write = (z, x, y, px) => { const p = path.join(DIR, String(z), String(x), y + '.png'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, grayPNG(256, 256, px)) };
for (const [k, px] of f) { const [x, y] = k.split(',').map(Number); write(Z, x, y, px) }
pyramid(f, Z, ix.zmin, write);
ix.filt = { ...OPT, at: new Date().toISOString().slice(0, 10) }; ix.ver = new Date().toISOString();
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(ix));
const pc = v => { const s = v.reduce((a, b) => a + b, 0); return v.map(x => Math.round(x / s * 100)).join('/') };
for (const nm of Object.keys(ix.st)) console.log(`  ${nm}: ${old[nm] ? pc(old[nm]) : '–'} → ${pc(ix.st[nm])}`);
console.log(`เปลี่ยน ${(ch / n * 100).toFixed(1)}% ของพิกเซล · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
