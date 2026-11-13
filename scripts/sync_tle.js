// ดึงข้อมูลวงโคจร (TLE) ของ NOAA-20 / NOAA-21 จาก CelesTrak → data/tle.json (เขียนเฉพาะเมื่อเปลี่ยน)
// ใช้คำนวณตำแหน่งดาวเทียมและนับถอยหลังรอบที่ผ่านกลุ่มป่า (หน้าเว็บ + สรุปประจำวัน LINE/Telegram) — ผู้ใช้ขอ 13 พ.ย. 69
// รันใน sync.yml (วันละ 4 รอบ — CelesTrak ขอให้ไม่ดึงถี่กว่าที่ข้อมูลเปลี่ยน ~วันละ 1–3 ครั้ง) · ดึงไม่ได้ = คงไฟล์เดิม + exit 1
//   node scripts/sync_tle.js            ปกติ
//   TLE_URL=<url ที่มี {n}>             ทดสอบกับเซิร์ฟเวอร์จำลอง
const fs = require('fs'), path = require('path');
const O = require('./lib/orbit');
const OUT = path.join(__dirname, '..', 'data', 'tle.json');
const SATS = { NOAA20: { n: 'NOAA-20', no: 43013 }, NOAA21: { n: 'NOAA-21', no: 54234 } };
const URL0 = process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?CATNR={n}&FORMAT=TLE';

(async () => {
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')) } catch (e) {}
  const sats = {}, err = [];
  for (const [k, s] of Object.entries(SATS)) {
    try {
      const r = await fetch(URL0.replace('{n}', s.no), { headers: { 'user-agent': 'fire-map-dpky (GitHub Actions)' }, signal: AbortSignal.timeout(30e3) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const L = (await r.text()).split(/\r?\n/).map(x => x.trimEnd()).filter(Boolean), i = L.findIndex(x => x.startsWith('1 ' + String(s.no).padStart(5, '0')));
      if (i < 0 || !L[i + 1] || !L[i + 1].startsWith('2 ')) throw new Error('ไม่พบ TLE ในคำตอบ: ' + L.join(' | ').slice(0, 200));
      const sr = O.parse(L[i], L[i + 1]), p = O.at(sr, Date.now()); // ตรวจว่าใช้คำนวณได้จริง
      if (!p || !(p.alt > 700 && p.alt < 950)) throw new Error('ความสูงที่คำนวณได้ผิดปกติ ' + (p && p.alt));
      sats[k] = { n: s.n, no: s.no, l1: L[i], l2: L[i + 1], ep: new Date(sr.epochMs).toISOString() };
    } catch (e) { err.push(`${s.n}: ${e.message}`); if (old && old.sats && old.sats[k]) sats[k] = old.sats[k] }
  }
  err.forEach(e => console.error('ดึง TLE ไม่ได้ —', e));
  const same = old && JSON.stringify(old.sats) === JSON.stringify(sats);
  if (Object.keys(sats).length && !same) {
    fs.writeFileSync(OUT + '.tmp', JSON.stringify({ upd: new Date().toISOString(), src: 'CelesTrak (celestrak.org) GP data', sats }, null, 1));
    fs.renameSync(OUT + '.tmp', OUT);
    console.log('บันทึก', OUT, Object.values(sats).map(s => `${s.n} epoch ${s.ep}`).join(' · '));
  } else console.log(same ? 'TLE ไม่เปลี่ยน' : 'ไม่มีข้อมูล');
  if (err.length) process.exitCode = 1;
})();
