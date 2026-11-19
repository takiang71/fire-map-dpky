// โปรไฟล์ Chrome ชั่วคราว (--user-data-dir) ของสคริปต์ที่เปิด Chrome headless: check_site (ck-), manual_shots (chp-), make_og (og-), monthly_report (mr-)
// เดิมลบด้วย setTimeout หลัง ch.kill() — โปรแกรมจบก่อนถึงเวลาลบ และบน Windows ch.kill() ปิดแค่ตัวหลัก โปรเซสลูกยังล็อกไฟล์
// → ค้างใน %TEMP% ~100–250 MB ต่อรอบ (19 พ.ย. 69 พบ 219 โฟลเดอร์ 18 GB จน C: เหลือ 4.8 GB)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

// ลบโฟลเดอร์ <tmp>/<prefix>* ที่ไม่ได้แก้ไขเกิน ageMs (ของรอบก่อนที่ค้าง — รอบที่กำลังรันอยู่จะแก้ไขล่าสุดเสมอ ไม่โดนลบ)
function sweep(prefix, ageMs = 3600e3, dir = os.tmpdir()) {
  let n = 0;
  let L = []; try { L = fs.readdirSync(dir) } catch (e) { return 0 }
  for (const d of L) {
    if (!d.startsWith(prefix)) continue;
    const p = path.join(dir, d);
    try { const st = fs.statSync(p); if (!st.isDirectory() || Date.now() - st.mtimeMs < ageMs) continue; fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); n++ } catch (e) { }
  }
  return n;
}

// ปิด Chrome ทั้งต้นไม้โปรเซส แล้วรอให้ออกจริง (≤ms) ก่อนลบโปรไฟล์ (ลองซ้ำเมื่อไฟล์ยังถูกล็อก) · คืน true = ลบได้
async function close(ch, prof, ms = 8000) {
  if (ch && ch.exitCode === null && ch.signalCode === null) {
    const ex = new Promise(r => ch.once('exit', r));
    try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(ch.pid), '/T', '/F'], { stdio: 'ignore' }); else ch.kill() } catch (e) { }
    await Promise.race([ex, new Promise(r => setTimeout(r, ms))]);
  }
  if (!prof) return true;
  try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); return !fs.existsSync(prof) } catch (e) { return false }
}

module.exports = { sweep, close };
