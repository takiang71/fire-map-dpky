// ตารางค่า PM2.5 แบบจำลอง CAMS global (Copernicus/ECMWF ~0.4°) รอบประเทศไทย — ผู้ใช้ขอ 14 พ.ย. 69 "ทำตารางค่า + สีเกณฑ์ไทย"
// (เดิมหน้าเว็บใช้ภาพสีจาก WMS ของ ECMWF ซึ่งระบายตามสีของ CAMS และแปลงเป็นเกณฑ์ไทยไม่ได้ · เฟรม 00UTC ของ WMS เป็นพยากรณ์รอบก่อน)
// แหล่ง: Open-Meteo Air Quality API domains=cams_global (ไม่ต้องใช้คีย์) — ตรวจ 14 พ.ย. 69: ค่าเท่ากับ GetFeatureInfo ของ ECMWF WMS ทุกจุด (r 1.00 ทุกเวลาตั้งแต่ 03UTC)
//   และเวลา 00UTC = ค่าตั้งต้นของรอบใหม่ (ตรงกับภาพ PM2.5 CAMS ของ LFA Thailand r 0.87) · Open-Meteo คืนค่าช่องตารางใกล้สุด จึงขอที่จุดตาราง 0.4° พอดี
// กรอบ ลองจิจูด 92.0–109.6 ละติจูด 5.2–23.6 (ไทย เมียนมา ลาว กัมพูชา เวียดนามใต้ — ต้นทางควันข้ามแดน) = 45×47 = 2,115 จุด · ทุก 3 ชม. ตั้งแต่ 00UTC เมื่อวานถึงสิ้นพยากรณ์ (~5 วัน)
// โควตา Open-Meteo นับต่อจุด → ดึงเฉพาะเมื่อมีรอบแบบจำลองใหม่ (static/meta.json last_run_initialisation_time · CAMS global วันละ 2 รอบ 00/12UTC พร้อม ~9.9 ชม. หลังรอบ) ≈ 4,200 ต่อวัน (จำกัดฟรี 10,000/วัน 5,000/ชม. 600/นาที)
//   ขอทีละ PER จุด เว้น GAP วินาที · บน GitHub Actions IP ใช้ร่วมกับผู้ใช้อื่น → อาจโดน 429 (15 พ.ย. 69 sync ค้างจนหมดเวลา 10 นาทีทุกรอบ ไม่เคยได้รอบใหม่)
//   429 ต่อนาที = รอ 61 วิแล้วขอชุดเดิมซ้ำ (เว้นช่วงนานขึ้น) · 429 ต่อชั่วโมง/วัน = หยุด · ชุดที่ได้แล้วเก็บใน .cache/cams_part.json (workflow wx เก็บด้วย actions/cache)
//   ครั้งถัดไปดึงต่อจากที่ค้าง (รอบเดียวกันเท่านั้น) · เวลารวมไม่เกิน CAMS_BUDGET วินาที (ค่าเริ่มต้น 480) แล้วหยุด เก็บส่วนที่ได้ exit 3
//   สาเหตุที่ดึงไม่ครบเขียนเป็น ::warning:: / ::error:: ใน Actions (อ่านได้จาก API annotations สาธารณะโดยไม่ต้องล็อกอิน)
// ผล data/cams_grid.json {src,run,avail (เวลาที่ต้นทางเผยแพร่รอบนี้ ISO),upd,x0,y0,d,nx,ny,t0,dt,q:10,v:[base64 Uint16LE ค่า×10 แถวใต้→เหนือ ต่อเวลา; 65535 = ไม่มีข้อมูล]}
// ใช้: node scripts/sync_cams.js [--force]
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'cams_grid.json'), PART = path.join(__dirname, '..', '.cache', 'cams_part.json');
const API = process.env.OM_AQ || 'https://air-quality-api.open-meteo.com';
const X0 = 92.0, Y0 = 5.2, D = 0.4, NX = 45, NY = 47, PER = 100, Q = 10, NUL = 65535;
const BUDGET = (+process.env.CAMS_BUDGET || 480) * 1e3, T0 = Date.now(), WAIT1 = +process.env.CAMS_WAIT || 61e3;
let GAP = +process.env.CAMS_GAP || 11e3;
const UA = 'fire-map-dpky (https://takiang71.github.io/fire-map-dpky/)';
const CI = !!process.env.GITHUB_ACTIONS, warn = s => console.log((CI ? '::warning title=sync_cams::' : '! ') + s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ST = { ok: 0, ms: 0, e429: {}, err: {} };
class Stop extends Error { }
async function get(u) { // คืน JSON · 429 ต่อนาที = รอแล้วลองใหม่ · 429 ต่อชั่วโมง/วัน หรือผิดพลาดซ้ำ = Stop
  for (let a = 0, m = 0; ;) {
    const t = Date.now();
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45e3) });
      if (r.status === 429) {
        let why = ''; try { why = (await r.json()).reason || '' } catch (e) { }
        const k = /minut/i.test(why) ? 'นาที' : /hour/i.test(why) ? 'ชั่วโมง' : /day|daily/i.test(why) ? 'วัน' : 'ไม่ระบุ';
        ST.e429[k] = (ST.e429[k] || 0) + 1;
        if ((k === 'นาที' || k === 'ไม่ระบุ') && m < 5 && Date.now() - T0 + WAIT1 < BUDGET) { m++; GAP = Math.min(30e3, GAP * 1.5); await sleep(WAIT1); continue }
        throw new Stop('Open-Meteo จำกัดโควตา (429 ต่อ' + k + (why ? ': ' + why.slice(0, 120) : '') + ')');
      }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const j = await r.json(); ST.ok++; ST.ms += Date.now() - t; return j;
    } catch (e) {
      if (e instanceof Stop) throw e;
      const k = e.name === 'TimeoutError' ? 'หมดเวลา 45 วิ' : String(e.message || e).slice(0, 60); ST.err[k] = (ST.err[k] || 0) + 1;
      if (++a >= 3 || Date.now() - T0 > BUDGET) throw new Stop('ขอข้อมูลไม่สำเร็จ: ' + k);
      await sleep(5e3 * a);
    }
  }
}
const stat = () => `สำเร็จ ${ST.ok} คำขอ (เฉลี่ย ${ST.ok ? Math.round(ST.ms / ST.ok) : '-'} ms)` + (Object.keys(ST.e429).length ? ' · 429 ' + JSON.stringify(ST.e429) : '') + (Object.keys(ST.err).length ? ' · ผิดพลาด ' + JSON.stringify(ST.err) : '');
(async () => {
  const force = process.argv.includes('--force');
  const meta = await get(API + '/data/cams_global/static/meta.json'), run = new Date(meta.last_run_initialisation_time * 1e3).toISOString().slice(0, 13) + 'Z';
  const avail = meta.last_run_availability_time ? new Date(meta.last_run_availability_time * 1e3).toISOString() : null;
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  if (prev && prev.run === run && !force) return console.log('CAMS รอบ', run, 'มีอยู่แล้ว ไม่ดึงใหม่');
  const P = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) P.push([+(X0 + i * D).toFixed(1), +(Y0 + j * D).toFixed(1)]);
  // ชุดที่ได้แล้วของรอบเดียวกัน (ดึงค้างจากครั้งก่อน)
  let part = null; try { part = JSON.parse(fs.readFileSync(PART, 'utf8')) } catch (e) { }
  if (!part || part.run !== run || part.per !== PER || force) part = { run, per: PER, T: null, b: {} };
  const had = Object.keys(part.b).length; if (had) console.log('ดึงต่อจากครั้งก่อน', had, 'ชุด');
  const save = () => { fs.mkdirSync(path.dirname(PART), { recursive: true }); fs.writeFileSync(PART + '.tmp', JSON.stringify(part)); fs.renameSync(PART + '.tmp', PART) };
  const need = Math.ceil(P.length / PER);
  let stop = null, first = true;
  for (let k = 0; k < P.length; k += PER) {
    if (part.b[k]) continue;
    if (Date.now() - T0 > BUDGET) { stop = 'ใช้เวลาครบ ' + BUDGET / 1e3 + ' วินาที'; break }
    if (!first) await sleep(GAP); first = false;
    const B = P.slice(k, k + PER);
    let j; try { j = await get(`${API}/v1/air-quality?latitude=${B.map(p => p[1]).join(',')}&longitude=${B.map(p => p[0]).join(',')}&hourly=pm2_5&past_days=1&forecast_days=6&timezone=GMT&domains=cams_global&cell_selection=nearest`) }
    catch (e) { if (e instanceof Stop) { stop = e.message; break } throw e }
    const A = Array.isArray(j) ? j : [j];
    if (A.length !== B.length) throw new Error(`ได้ ${A.length} จุดจาก ${B.length}`);
    const rows = [];
    for (const x of A) {
      const t = x.hourly.time.map(s => Date.parse(s + 'Z')), I = t.map((v, i) => v % 108e5 === 0 ? i : -1).filter(i => i >= 0); // ทุก 3 ชม. (00,03,…UTC)
      if (!part.T) part.T = I.map(i => t[i]); else if (I.length !== part.T.length || t[I[0]] !== part.T[0]) throw new Error('เวลาของแต่ละจุดไม่ตรงกัน');
      rows.push(I.map(i => x.hourly.pm2_5[i]));
    }
    part.b[k] = rows; save();
    process.stdout.write(`\r${Object.keys(part.b).length}/${need} ชุด`);
  }
  console.log('\n' + stat());
  const got = Object.keys(part.b).length;
  if (got < need) { warn(`CAMS รอบ ${run} ได้ ${got}/${need} ชุด — ${stop || 'ไม่ครบ'} · ${stat()} · เก็บส่วนที่ได้ไว้ดึงต่อครั้งหน้า`); process.exit(3) }
  const T = part.T, V = []; for (let k = 0; k < P.length; k += PER) V.push(...part.b[k]);
  // ตัดเวลาท้ายที่ไม่มีค่าเลย (เกินสิ้นพยากรณ์)
  let n = T.length; while (n > 0 && V.every(r => r[n - 1] == null)) n--;
  if (n < 16) throw new Error('ข้อมูลน้อยผิดปกติ (' + n + ' เวลา) — คงไฟล์เดิม');
  const miss = V.reduce((s, r) => s + r.slice(0, n).filter(v => v == null).length, 0);
  if (miss > P.length * n * .05) throw new Error(`ค่าว่าง ${miss} จาก ${P.length * n} — คงไฟล์เดิม`);
  const v = []; for (let k = 0; k < n; k++) { const b = Buffer.alloc(P.length * 2); V.forEach((r, p) => b.writeUInt16LE(r[k] == null ? NUL : Math.min(NUL - 1, Math.round(r[k] * Q)), p * 2)); v.push(b.toString('base64')) }
  const o = { src: 'Copernicus CAMS global ผ่าน Open-Meteo Air Quality API (cams_global)', run, avail, upd: new Date().toISOString(), x0: X0, y0: Y0, d: D, nx: NX, ny: NY, t0: T[0], dt: 108e5, q: Q, v };
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(o)); fs.renameSync(OUT + '.tmp', OUT);
  try { fs.unlinkSync(PART) } catch (e) { }
  console.log(`CAMS รอบ ${run} · ${n} เวลา (${new Date(T[0]).toISOString().slice(0, 13)}Z – ${new Date(T[n - 1]).toISOString().slice(0, 13)}Z) × ${P.length} จุด · ค่าว่าง ${miss} · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})().catch(e => { console.error('\nsync_cams:', e.message); if (CI) console.log('::error title=sync_cams::' + String(e.message).slice(0, 300) + ' · ' + stat()); process.exit(1) });
