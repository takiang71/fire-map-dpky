// ตรวจว่าต้นทางของข้อมูลพยากรณ์ 3 ชุดมีรอบใหม่กว่าที่เรามีหรือยัง — ผู้ใช้ขอ 15 พ.ย. 69 "ปรับให้ตามต้นทางให้เร็วขึ้น ให้แสดงผลเป็นปัจจุบันเร็วที่สุด
// และบอกบนเว็บว่าข้อมูลล่าสุดเมื่อวันที่เท่าไร เวลากี่โมง" (เดิมดึงเฉพาะใน sync 4 รอบ/วัน → ช้ากว่าต้นทาง 0.5–6.5 ชม. และ GFS รอบ 12Z ไม่เคยขึ้นเว็บ)
//   FWI/FFMC  TFDRS กรมป่าไม้   HEAD /forecast/<วัน>/<วัน>_FWI.tif ของวันถัดจากรอบที่มี (ออกวันละครั้ง ~14:20 น.) + Last-Modified ของรอบที่มี (ต้นทางคำนวณใหม่)
//   VR        NOAA GFS (NOMADS) HEAD f180.idx ของรอบถัดไป (00/06/12/18Z ครบ 180 ชม. ~4 ชม. หลังรอบ)
//   PM2.5     CAMS (Open-Meteo) GET static/meta.json (~1 KB, รอบ 00/12Z พร้อม ~9.9 ชม. หลังรอบ)
// รันใน workflow site ทุกรอบ (~5 นาที, คำขอเล็ก 3–6 ครั้ง พร้อมกัน ≤10 วิ) ต่อจาก build_site:
//   - เขียน _site/data/wxsrc.json {t, fwi|gfs|cams:{have,pub,upd,src,srcPub,ready}, need[], err{}} ให้หน้าเว็บบอกรอบ/เวลาเผยแพร่/เวลาดึง/ตรวจล่าสุด และโหลดใหม่เมื่อรอบเปลี่ยน
//   - --dispatch: มีรอบใหม่ (need) → สั่ง workflow wx (scripts ดึงจริง ~1–6 นาที แล้ว commit + สั่ง site) ผ่าน GitHub API ด้วย GITHUB_TOKEN
//     ไม่สั่งซ้ำเมื่อ wx กำลังรัน/รอคิว หรือเพิ่งสั่งชุดเดียวกันไม่ถึง WX_BACKOFF นาที (ดึงไม่สำเร็จจะลองใหม่ทุก 15 นาที ไม่รัวทุก 5 นาที)
// ใช้: node scripts/wx_check.js [--out _site/data/wxsrc.json] [--dispatch]   (env WX_NOW จำลองเวลา, FDRS_URL/GFS_NOMADS/OM_AQ/GH_API ทดสอบ)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), D = f => path.join(ROOT, 'data', f);
const FDRS = process.env.FDRS_URL || 'https://fdrs.forest.go.th', NOM = process.env.GFS_NOMADS || 'https://nomads.ncep.noaa.gov', OM = process.env.OM_AQ || 'https://air-quality-api.open-meteo.com';
const GH = process.env.GH_API || 'https://api.github.com', REPO = process.env.GITHUB_REPOSITORY || 'takiang71/fire-map-dpky', TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const NOW = process.env.WX_NOW ? Date.parse(process.env.WX_NOW) : Date.now();
const SETTLE = 10 * 6e4; // FWI: ไฟล์ใหม่ต้องนิ่ง 10 นาที (ต้นทางเขียน 10 ตัวแปร × 3 วันทีละไฟล์)
const BACKOFF = (+process.env.WX_BACKOFF || 15) * 6e4;
const UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
const ai = process.argv.indexOf('--out'), OUT = ai > 0 ? process.argv[ai + 1] : path.join(ROOT, '_site', 'data', 'wxsrc.json');
const DISPATCH = process.argv.includes('--dispatch');
const rd = f => { try { return JSON.parse(fs.readFileSync(D(f), 'utf8')) } catch (e) { return null } };
const addD = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const iso = t => t == null || isNaN(t) ? null : new Date(t).toISOString();
async function head(u) { // Last-Modified (ms) ถ้ามีไฟล์ · null = ไม่มี (404) · throw = เชื่อมต่อไม่ได้
  const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8e3) });
  if (r.status === 404) return null;
  if (r.status === 403) throw new Error('HTTP 403 ต้นทางปฏิเสธ (' + ['server', 'cf-mitigated'].map(k => r.headers.get(k) && k + ': ' + r.headers.get(k)).filter(Boolean).join(', ') + ')'); // TFDRS ปฏิเสธเครื่อง GitHub (15 พ.ย. 69)
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const m = Date.parse(r.headers.get('last-modified') || ''); return isNaN(m) ? NOW : m;
}

async function fwi() {
  const j = rd('fwi/index.json'), run = j && j.run, d0 = run && j.days.find(x => x.d === run && !x.f);
  const o = { have: run || null, pub: d0 && d0.lm ? iso(Date.parse(d0.lm)) : null, upd: j && j.upd || null, src: run || null, srcPub: null, ready: true };
  const today = new Date(NOW + 7 * 36e5).toISOString().slice(0, 10);
  if (!run) { o.src = null; o.need = true; return o }
  // รอบใหม่: วันถัดจากรอบที่มีถึงวันนี้ (เวลาไทย) ใหม่สุดก่อน
  for (let d = today; d > run; d = addD(d, -1)) {
    const m = await head(`${FDRS}/forecast/${d}/${d}_FWI.tif`);
    if (m != null) { o.src = d; o.srcPub = iso(m); o.ready = NOW - m >= SETTLE; o.need = o.ready; return o }
  }
  // รอบเดิม: ต้นทางคำนวณใหม่ (Last-Modified เปลี่ยน) หรือวันพยากรณ์ของรอบนี้ยังไม่ครบ (ดึงตอนต้นทางยังเขียนไม่ครบ)
  const m = await head(`${FDRS}/forecast/${run}/${run}_FWI.tif`);
  if (m != null) o.srcPub = iso(m);
  const rlm = d0 && d0.rlm && Date.parse(d0.rlm);
  if (m != null && rlm && Math.abs(m - rlm) > 1e3 && NOW - m >= SETTLE) o.need = 'recalc';
  if ([1, 2].some(f => !j.days.some(x => x.d === addD(run, f) && x.f === f && x.run === run))) o.need = 'incomplete';
  return o;
}

async function gfs() {
  const j = rd('gfs_vr.json'), cyc = j && j.cyc, c0 = cyc ? Date.parse(cyc.replace(/Z$/, ':00:00Z')) : null;
  const o = { have: cyc || null, pub: j && j.pub || null, upd: j && j.upd || null, src: cyc || null, srcPub: null };
  // รอบถัดไปที่อาจพร้อมแล้ว (≥3.5 ชม. หลังเวลารอบ) ใหม่สุดก่อน · ไม่มีไฟล์เลย = ย้อน 2 วัน
  const last = Math.floor((NOW - 3.5 * 36e5) / 216e5) * 216e5;
  for (let t = last, k = 0; t > (c0 || NOW - 2 * 864e5) && k < 8; t -= 216e5, k++) {
    const d = new Date(t), c = String(d.getUTCHours()).padStart(2, '0'), ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const m = await head(`${NOM}/pub/data/nccf/com/gfs/prod/gfs.${ymd}/${c}/atmos/gfs.t${c}z.pgrb2.0p25.f180.idx`);
    if (m != null) { o.src = d.toISOString().slice(0, 13) + 'Z'; o.srcPub = iso(m); o.need = true; return o }
  }
  if (!cyc) { o.src = null; return o }
  if (!o.pub) { // ไฟล์ที่ดึงก่อนมีช่อง pub → อ่านเวลาเผยแพร่ของรอบที่มี
    const d = new Date(c0), c = String(d.getUTCHours()).padStart(2, '0'), ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const m = await head(`${NOM}/pub/data/nccf/com/gfs/prod/gfs.${ymd}/${c}/atmos/gfs.t${c}z.pgrb2.0p25.f180.idx`); if (m != null) o.pub = o.srcPub = iso(m);
  }
  return o;
}

async function cams() {
  const j = rd('cams_grid.json');
  const o = { have: j && j.run || null, pub: j && j.avail || null, upd: j && j.upd || null };
  const r = await fetch(`${OM}/data/cams_global/static/meta.json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8e3) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const m = await r.json();
  o.src = new Date(m.last_run_initialisation_time * 1e3).toISOString().slice(0, 13) + 'Z';
  o.srcPub = m.last_run_availability_time ? iso(m.last_run_availability_time * 1e3) : null;
  if (o.src !== o.have && (!o.have || o.src > o.have)) o.need = true;
  else if (!o.pub && o.srcPub) o.pub = o.srcPub; // รอบเดียวกัน (ไฟล์ที่ดึงก่อนมีช่อง avail)
  return o;
}

async function dispatch(need) { // สั่ง workflow wx — คืนข้อความบอกผล
  if (!TOKEN) return 'ไม่มี GITHUB_TOKEN';
  const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': UA };
  const key = need.slice().sort().join(',');
  const r = await fetch(`${GH}/repos/${REPO}/actions/workflows/wx.yml/runs?per_page=5`, { headers: H, signal: AbortSignal.timeout(10e3) });
  if (!r.ok) throw new Error('อ่านรายการ wx ไม่ได้ HTTP ' + r.status);
  const runs = (await r.json()).workflow_runs || [];
  const act = runs.find(x => x.status !== 'completed');
  if (act) return `wx กำลังทำงาน/รอคิว (${act.status}) ไม่สั่งซ้ำ`;
  const same = runs.find(x => (x.display_title || '').includes('[' + key + ']'));
  if (same && NOW - Date.parse(same.created_at) < BACKOFF) return `เพิ่งสั่ง [${key}] เมื่อ ${Math.round((NOW - Date.parse(same.created_at)) / 6e4)} นาทีก่อน (${same.conclusion}) — รอครบ ${BACKOFF / 6e4} นาที`;
  const p = await fetch(`${GH}/repos/${REPO}/actions/workflows/wx.yml/dispatches`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { need: key, by: 'site' } }), signal: AbortSignal.timeout(10e3) });
  if (p.status !== 204) throw new Error('สั่ง wx ไม่ได้ HTTP ' + p.status + ' ' + (await p.text()).slice(0, 150));
  return `สั่ง wx [${key}] แล้ว`;
}

(async () => {
  const out = { t: iso(NOW), err: {} }, need = [];
  const R = await Promise.allSettled([fwi(), gfs(), cams()]);
  ['fwi', 'gfs', 'cams'].forEach((k, i) => {
    if (R[i].status === 'fulfilled') { const o = R[i].value; if (o.need) need.push(k); delete o.need; out[k] = o }
    else { out.err[k] = String(R[i].reason && R[i].reason.message || R[i].reason).slice(0, 120); out[k] = null }
  });
  out.need = need;
  for (const k of ['fwi', 'gfs', 'cams']) { const o = out[k]; console.log(k.padEnd(4), o ? `มี ${o.have} · ต้นทาง ${o.src}${o.srcPub ? ' (' + o.srcPub + ')' : ''}${need.includes(k) ? ' → ต้องดึง' : ''}${o.ready === false ? ' (ไฟล์ยังไม่นิ่ง)' : ''}` : 'ตรวจไม่ได้: ' + out.err[k]) }
  if (DISPATCH && need.length) { try { out.wx = await dispatch(need) } catch (e) { out.wx = 'ผิดพลาด: ' + e.message } console.log(out.wx) }
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out));
})().catch(e => { console.error('wx_check:', e.message); process.exit(1) });
