// C2 scripts/verify_numbers.js: หน้าเว็บ (โค้ดจริงใน index.html) ↔ summary.json (build_site.summary) ↔ การ์ด LINE ↔ สรุปประจำวัน Telegram
//  - ทดสอบ "ความสอดคล้อง" ไม่ใช่ค่าคงที่ จึงใช้ adata/hdata ใน index.html ได้ (ค่าเปลี่ยนตาม sync แต่ทุกช่องทางต้องเท่ากันเสมอ) · โฟลเดอร์ชั่วคราว ไม่ต่อเน็ต
//  - กรณี 1: เวลาจำลองกลางปีงบ 2569 (จุดจาก adata เยอะ ทุกพื้นที่ — ตัวชี้วัด SNPP) · กรณี 2: วันหลัง adata.to + จุดสด 48 ชม. สังเคราะห์ (เส้นทาง live.json, ดงใหญ่ถูกตัด)
//  - ตรวจรับ C2: แก้ summary ให้ต่าง 1 จุด → ต้องจับได้ (ok:false และชี้พื้นที่ที่ต่าง)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { ROOT, HTML } = require('./helpers.cjs');
const { where, block } = require('../scripts/lib/area');
const { verify } = require('../scripts/verify_numbers');

function site(now, live) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'num-'));
  fs.writeFileSync(path.join(d, 'index.html'), HTML); fs.writeFileSync(path.join(d, 'live.json'), JSON.stringify(live));
  const R = Date.now; Date.now = () => now;
  try { delete require.cache[require.resolve('../scripts/build_site')]; const S = require('../scripts/build_site').summary(live); S.generated = new Date(now).toISOString(); fs.writeFileSync(path.join(d, 'summary.json'), JSON.stringify(S)) }
  finally { Date.now = R }
  return d;
}
const empty = { type: 'FeatureCollection', meta: { generated: '' }, features: [] };

test('C2 กลางปีงบ 2569: หน้าเว็บ = summary.json = LINE = Telegram ทุกพื้นที่/จังหวัด · แก้ summary +1 จุด = จับได้', async () => {
  const now = Date.parse('2026-04-20T05:00:00Z'), d = site(now, empty);
  const R = await verify(d);
  assert.equal(R.ok, true, R.diff.join('\n')); assert.equal(R.fy, 2569); assert.ok(R.line && R.telegram);
  assert.ok(R.n.ex > 20 && R.n.all >= R.n.ex, JSON.stringify(R.n));
  assert.ok(R.checks.filter(c => c.name.startsWith('พื้นที่ ')).length >= 6);
  assert.ok(R.checks.some(c => c.name.startsWith('จังหวัด ')));
  // ตรวจรับ: summary ต่างไป 1 จุดในพื้นที่ที่มีจุด
  const f = path.join(d, 'summary.json'), S = JSON.parse(fs.readFileSync(f, 'utf8')), k = Object.keys(S.areas).find(x => S.areas[x].fy > 0 && !/ดงใหญ่|นอกพื้นที่/.test(x));
  S.areas[k].fy++; fs.writeFileSync(f, JSON.stringify(S));
  const B = await verify(d, { tg: false });
  assert.equal(B.ok, false);
  assert.ok(B.diff.some(x => x.startsWith('พื้นที่ ' + k)), B.diff.join('\n'));
  assert.ok(B.diff.some(x => x.startsWith('สะสมปีงบ ไม่รวมดงใหญ่')));
});

test('C2 จุดสด live.json หลัง adata.to: นับเท่ากันทุกช่องทาง · จุดใน ขสป.ดงใหญ่ไม่นับในยอดไม่รวมดงใหญ่ · ปีก่อนทั้งปีเท่ากัน', async () => {
  const to = JSON.parse(block('adata')[1]).to, day = new Date(Date.parse(to) + 864e5).toISOString().slice(0, 10), now = Date.parse(day + 'T05:00:00Z'); // 12:00 น. ไทย
  const P = [[101.2, 14.55], [101.95, 14.4], [102.45, 14.15], [102.55, 14.1], [102.6, 13.95]];
  const features = P.map(([lo, la], i) => { const w = where(lo, la); assert.ok(w, `${lo},${la} ต้องอยู่ในแนวเขต`);
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] }, properties: { unique_id: 't' + i, full_date: `${day} 0${1 + i}:3${i}:00`, satellite_name: 'NOAA-20', latitude: la, longitude: lo, confidence: 'nominal',
      province_name_th: 'นครราชสีมา', district_name_th: 'ปักธงชัย', subdistrict_name_th: 'ตะขบ', _ar: w.ar, _st: w.st } } });
  const R = await verify(site(now, { ...empty, features }));
  assert.equal(R.ok, true, R.diff.join('\n'));
  const dy = R.checks.find(c => c.name === 'สะสมปีงบ ทุกพื้นที่ (รวมดงใหญ่)'), ex = R.checks.find(c => c.name === 'สะสมปีงบ ไม่รวมดงใหญ่');
  assert.ok(dy.page - ex.page >= 1, 'จุดดงใหญ่ 1 จุดอยู่ในยอดรวม แต่ไม่อยู่ในยอดไม่รวมดงใหญ่');
  assert.ok(R.checks.find(c => c.name === 'พื้นที่ อุทยานแห่งชาติทับลาน').page >= 1);
});
