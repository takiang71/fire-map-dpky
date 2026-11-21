// วัดความล่าช้าของ NASA FIRMS ต่อรอบดาวเทียม (ผู้ใช้ขอ 21 พ.ย. 69 "ตามต่อข้อมูลให้ด้วย") — ใช้เทียบกับ API ไทย (ThaiREN) ในสไลด์ present/
//  - รันใน site.yml หลัง build_site (ทุก ~5 นาที) · รอบที่ต้องตาม = รอบใน .state/pass_lag.json (pass_wait.js บันทึกเมื่อ API ไทยเห็นข้อมูลรอบนั้น)
//    อายุ MIN_AGE–MAX_AGE นาทีหลังดาวเทียมผ่าน และยังไม่อยู่ใน .state/firms_lag.json
//  - ถาม FIRMS area API (MAP_KEY = env FIRMS_KEY) ดาวเทียมละ 1 คำขอ กรอบประเทศไทย → มีแถวดาวเทียมเดียวกัน เวลาสแกน ±NEAR นาที = รอบนั้นขึ้น FIRMS แล้ว
//    บันทึก {k, t (เวลาผ่านกลุ่มป่า), seen, lag (นาที), n (จุดในกรอบ), th (ความล่าช้า API ไทยจาก pass_lag)} · เกิน MAX_AGE ยังไม่ขึ้น = {miss:1}
//  - ความละเอียด ≈ รอบ site (~5 นาที) · ไม่มี key / นอกช่วง = ไม่ถาม · exit 0 เสมอ (ห้ามทำให้รอบ site ล้ม)
//  - สรุปผล: node scripts/firms_lag.js --report [ไฟล์ firms_lag.json] (ไม่ระบุ = ดึงจาก branch state)
// ทดสอบ: FIRMS_BASE (เซิร์ฟเวอร์จำลอง) · STATE_DIR · LAG_NOW=<ms>
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.STATE_DIR || path.join(ROOT, '.state');
const BASE = process.env.FIRMS_BASE || 'https://firms.modaps.eosdis.nasa.gov';
const BOX = '97.3,5.6,105.7,20.5';
const SRC = { SNPP: 'VIIRS_SNPP_NRT', NOAA20: 'VIIRS_NOAA20_NRT', NOAA21: 'VIIRS_NOAA21_NRT' };
const MIN_AGE = 45, MAX_AGE = 12 * 60, NEAR = 8;
const readJ = f => { try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf8')) } catch (e) { return null } };
const th = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' ');

/* รอบที่ต้องถาม FIRMS: อยู่ใน pass_lag (API ไทยเห็นแล้ว) ดาวเทียมผ่านหลังเริ่มตาม (since — รอบก่อนนั้นอาจขึ้น FIRMS นานแล้ว ตัวเลขจะเกินจริง)
   อายุ MIN_AGE..MAX_AGE และยังไม่มีผลใน log */
const tracked = (passLog, log, since) => passLog.filter(p => SRC[p.k] && p.lag != null && p.t >= since && !log.some(x => x.k === p.k && Math.abs(x.t - p.t) < 6e4));
function pending(passLog, log, now, since = 0) {
  return tracked(passLog, log, since).filter(p => now - p.t >= MIN_AGE * 6e4 && now - p.t <= MAX_AGE * 6e4);
}
/* รอบที่หมดเวลา (เกิน MAX_AGE แต่ยังไม่ขึ้น FIRMS) */
function expired(passLog, log, now, since = 0) {
  return tracked(passLog, log, since).filter(p => now - p.t > MAX_AGE * 6e4);
}
/* CSV ของ FIRMS → จำนวนจุดของรอบ p (เวลาสแกน UTC ห่างจาก p.t ≤ NEAR นาที) */
function count(csv, p) {
  const L = String(csv).trim().split('\n'), h = L[0].split(','), iD = h.indexOf('acq_date'), iT = h.indexOf('acq_time');
  if (iD < 0 || iT < 0) return 0;
  let n = 0;
  for (const l of L.slice(1)) {
    const v = l.split(','), t = v[iT].padStart(4, '0'), ms = Date.parse(`${v[iD]}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`);
    if (Math.abs(ms - p.t) <= NEAR * 6e4) n++;
  }
  return n;
}

async function run() {
  const k = (process.env.FIRMS_KEY || '').trim() || (() => { try { return fs.readFileSync(path.join(ROOT, '.firms_key'), 'utf8').trim() } catch (e) { return '' } })();
  if (!k) return console.log('firms_lag: ไม่มี FIRMS_KEY — ข้าม');
  const now = +process.env.LAG_NOW || Date.now();
  const PL = (readJ('pass_lag.json') || { log: [] }).log, F = readJ('firms_lag.json') || { log: [], since: now };
  if (!F.since) F.since = now;
  const P = pending(PL, F.log, now, F.since);
  for (const p of expired(PL, F.log, now, F.since)) F.log.unshift({ k: p.k, t: p.t, miss: 1, th: p.lag });
  if (!P.length) console.log(`firms_lag: ไม่มีรอบที่ต้องตาม (เริ่มตาม ${th(F.since)} น.)`);
  if (P.length) console.log(`firms_lag: ตามรอบ ${P.map(p => `${p.k} ${th(p.t)}`).join(', ')}`);
  for (const sat of [...new Set(P.map(p => p.k))]) {
    const ps = P.filter(p => p.k === sat), d0 = new Date(Math.min(...ps.map(p => p.t)) - NEAR * 6e4).toISOString().slice(0, 10);
    try {
      const r = await fetch(`${BASE}/api/area/csv/${k}/${SRC[sat]}/${BOX}/2/${d0}`, { signal: AbortSignal.timeout(45e3) });
      const t = await r.text();
      if (!r.ok || /^(Invalid|Error)|Exceeding/i.test(t)) throw new Error(`HTTP ${r.status} ${t.slice(0, 60).trim()}`);
      for (const p of ps) {
        const n = count(t, p); if (!n) continue;
        F.log.unshift({ k: p.k, t: p.t, seen: now, lag: Math.round((now - p.t) / 6e4), n, th: p.lag });
        console.log(`firms_lag: ${p.k} ${th(p.t)} ขึ้น FIRMS แล้ว ช้ากว่าดาวเทียมผ่าน ${Math.round((now - p.t) / 6e4)} นาที (API ไทย ${p.lag} นาที, ${n} จุด)`);
      }
    } catch (e) { console.log(`firms_lag: ถาม FIRMS ${sat} ไม่สำเร็จ:`, e.message) }
  }
  F.log = F.log.sort((a, b) => b.t - a.t).slice(0, 400); F.updated = new Date(now).toISOString();
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, 'firms_lag.json'), JSON.stringify(F)) } catch (e) { console.log('firms_lag: บันทึกไม่สำเร็จ', e.message) }
}

/* สรุปผล: ค่ากลาง/ต่ำสุด/สูงสุด แยกดวง กลางวัน/กลางคืน + เทียบ API ไทย */
function report(F) {
  const ok = F.log.filter(x => x.lag != null), miss = F.log.filter(x => x.miss);
  const st = a => { if (!a.length) return '–'; a = [...a].sort((x, y) => x - y); const m = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; return `n=${a.length} ค่ากลาง ${m} นาที (${a[0]}–${a.at(-1)})` };
  const day = x => { const h = new Date(x.t + 7 * 36e5).getUTCHours(); return h >= 6 && h < 18 };
  const L = [`รอบที่วัดได้ ${ok.length} · ไม่ขึ้นภายใน ${MAX_AGE / 60} ชม. ${miss.length}`,
    `FIRMS ทั้งหมด: ${st(ok.map(x => x.lag))}`,
    `  กลางวัน: ${st(ok.filter(day).map(x => x.lag))}`,
    `  กลางคืน: ${st(ok.filter(x => !day(x)).map(x => x.lag))}`];
  for (const s of Object.keys(SRC)) { const a = ok.filter(x => x.k === s); if (a.length) L.push(`  ${s}: ${st(a.map(x => x.lag))}`) }
  const both = ok.filter(x => x.th != null);
  L.push(`API ไทย (รอบเดียวกัน): ${st(both.map(x => x.th))}`, `FIRMS ช้ากว่า API ไทย: ${st(both.map(x => x.lag - x.th))}`, '', 'รอบ (เวลาไทย) · FIRMS · API ไทย');
  for (const x of F.log.slice(0, 60)) L.push(`${x.k} ${th(x.t)} · ${x.miss ? 'ไม่ขึ้น' : x.lag + ' นาที'} · ${x.th != null ? x.th + ' นาที' : '–'}`);
  return L.join('\n');
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === '--report') {
    let F;
    try { F = JSON.parse(a[1] ? fs.readFileSync(a[1], 'utf8') : (cp.execSync('git fetch -q origin state', { cwd: ROOT }), cp.execSync('git show origin/state:firms_lag.json', { cwd: ROOT, encoding: 'utf8' }))) }
    catch (e) { console.log('ยังไม่มี firms_lag.json:', e.message); process.exit(0) }
    console.log(report(F));
  } else run().catch(e => console.log('firms_lag: ผิดพลาด', e.message));
}
module.exports = { pending, expired, count, report, MIN_AGE, MAX_AGE };
