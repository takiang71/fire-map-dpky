// สถานะของตัวแจ้งเตือน (notify.json / tg_notify.json / health.json) — จำว่าแจ้งจุดไหน/ส่งสรุปประจำวันแล้วหรือยัง
// อ่านจาก 3 ที่ แล้วใช้ชุดที่ช่อง updated ใหม่สุด:
//   1) STATE_DIR (ค่าเริ่มต้น .state/) — workflow site ดึงจาก branch "state" มาวางก่อนรัน และ push กลับหลังรัน (แม่นยำที่สุด)
//   2) raw.githubusercontent.com ของ branch state (แคช ~5 นาที — ใช้ตอนรันนอก workflow site เช่น health --site ใน sync)
//   3) หน้าเว็บ GitHub Pages (ที่เดิม)
// เหตุ: 6 พ.ย. 69 Pages ค้างที่รอบ 05:01 น. ทั้งที่ deploy ขึ้นว่าสำเร็จ → ตัวแจ้งเตือนอ่านสถานะเก่า
//       → สรุปประจำวันส่งซ้ำทุก 5 นาทีทั้ง LINE และ Telegram
const fs = require('fs'), path = require('path');
const DIR = process.env.STATE_DIR || path.join(__dirname, '..', '..', '.state');
const RAW = process.env.STATE_RAW ?? 'https://raw.githubusercontent.com/takiang71/fire-map-dpky/state/';

const getJ = async (url, now) => {
  try { const r = await fetch(url + '?t=' + now, { signal: AbortSignal.timeout(20e3) }); return r.ok ? await r.json() : null }
  catch (e) { return null }
};

async function loadState(name, site, now = Date.now()) {
  let loc = null;
  try { loc = JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')) } catch (e) { }
  const src = [['branch state', loc]];
  if (!loc && RAW) src.push(['branch state (raw)', await getJ(RAW + name, now)]);
  if (site) src.push(['หน้าเว็บ', await getJ(site + name, now)]);
  const t = s => (s && Date.parse(s.updated)) || 0;
  let best = null;
  for (const x of src) if (x[1] && (!best || t(x[1]) > t(best[1]))) best = x;
  const th = ms => new Date(ms + 7 * 36e5).toISOString().slice(5, 16).replace('T', ' ');
  console.log(`สถานะ ${name}: ` + (best ? `ใช้ ${best[0]} (อัปเดต ${th(t(best[1]))} น.)` : 'ไม่พบ') +
    src.filter(x => x !== best).map(([k, s]) => ` · ${k}: ${s ? th(t(s)) + ' น.' : 'ไม่มี'}`).join(''));
  return best ? best[1] : null;
}

module.exports = { loadState };
