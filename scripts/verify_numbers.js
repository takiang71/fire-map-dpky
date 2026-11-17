// C2 (docs/review-2569-11-15.md): ตรวจว่าตัวเลขสะสมปีงบตรงกันทุกช่องทาง — หน้าเว็บ ↔ summary.json ↔ การ์ด LINE (carousel) ↔ สรุปประจำวัน Telegram (dailyMsg)
// ใช้: node scripts/verify_numbers.js [โฟลเดอร์เว็บ=_site] [--ci]
//   - หน้าเว็บ: ดึงโค้ดจริงจาก <โฟลเดอร์>/index.html (liveList/geoAt/fyNow/fyPts/fyCum/xAD/xLive/hdata+adata) มารันใน Node ด้วยข้อมูลฝัง (data/emb/*.json ใน _site)
//     + live.json — ไม่ใช่สำเนาตรรกะ จึงจับได้เมื่อหน้าเว็บกับ build_site.js summary() คิดต่างกัน · เวลา "ตอนนี้" = summary.generated (คนละรอบวันไม่ทำให้คลาด)
//   - LINE: carousel() จาก worker/line-webhook.mjs (ตัวเดียวกับ line_notify.js) แบบสรุปประจำวัน → แถวรายพื้นที่ + รวม ในการ์ดแรก
//   - Telegram: node scripts/telegram_notify.js --preview (ไม่ส่ง ไม่ต้องมี token, NOTIFY_DIR = โฟลเดอร์นี้) → บรรทัด "• พื้นที่ ปีนี้ | ปีก่อน" + "รวม"
//   เทียบ (ค่าเริ่มต้นหน้าเว็บ = ไม่รวม ขสป.ดงใหญ่ ชุดเดียวกับ LINE/Telegram): สะสมปีงบรวม · ทุกพื้นที่ (รวมดงใหญ่) · รายพื้นที่อนุรักษ์ · รายจังหวัด · ปีงบก่อนทั้งปี/ช่วงเดียวกัน
//   ผล: <โฟลเดอร์>/numcheck.json {at, ok, now, fy, n, diff:[…], checks:[…]} → health.js ตรวจ `num` แจ้งผู้ดูแล · ต่างกัน = ::warning (--ci) และ exit 1 (ไม่ใช่ --ci)
//   - แดชบอร์ด ?dash (F4, 17 พ.ย. 69): ดึง dsKpi() จาก index.html มารันกับ summary.json (S.xdy จริง/เท็จ) → คอลัมน์ dash · ไม่มี dsKpi = ไม่มีคอลัมน์ (หน้าเว็บรุ่นก่อน F4)
//   ตรวจไม่ได้ (ไม่มี summary.json/live.json, โค้ดหน้าเว็บเปลี่ยนชื่อ) = ok:null + ::warning — ไม่ถือว่าตัวเลขผิด
'use strict';
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), CI = args.includes('--ci');
const DIR = path.resolve(ROOT, args.find(a => !a.startsWith('--')) || '_site');
const EX = /ดงใหญ่/, OUTA = 'นอกพื้นที่อนุรักษ์';

// ---- โค้ดหน้าเว็บ: ตัดช่วงจาก "a" ถึงจบ "b" (ไม่เจอ = โยน error ชื่อชิ้นที่หาไม่เจอ) ----
function cut(html, a, b, name) {
  const i = html.indexOf(a); if (i < 0) throw new Error(`ไม่พบโค้ด ${name} (${a.slice(0, 40)}) ใน index.html`);
  const j = html.indexOf(b, i); if (j < 0) throw new Error(`ไม่พบจุดจบของ ${name} (${b.slice(0, 40)})`);
  return html.slice(i, j + b.length);
}
// ข้อมูลฝัง: _site = data/emb/<id>.<sha>.json ตามดัชนี <script id="emb"> · repo = บล็อก <script type="application/json" id="…">
function blocks(html, dir) {
  const B = {}, ix = html.match(/<script type="application\/json" id="emb">([\s\S]*?)<\/script>/);
  if (ix) for (const [id, u] of Object.entries(JSON.parse(ix[1]))) B[id] = fs.readFileSync(path.join(dir, u), 'utf8');
  for (const m of html.matchAll(/<script type="application\/json" id="(\w+)">([\s\S]*?)<\/script>/g)) if (m[1] !== 'emb' && !(m[1] in B)) B[m[1]] = m[2];
  return B;
}
// รันโค้ดหน้าเว็บ (เวลาตอนนี้ = now) → ฟังก์ชันที่ต้องใช้
function page(html, B, live, now) {
  const src = [
    'const H=36e5;',
    cut(html, 'const HOTSPOT_TZ=', 'return inA}', 'liveList'),
    cut(html, 'const inside=(q,r)=>', '\n', 'inside'), cut(html, 'const inFeat=(q,f)=>', '\n', 'inFeat'), cut(html, 'const geoAt=(lon,lat)=>', '\n', 'geoAt'),
    cut(html, 'const DYR=/ดงใหญ่/', 'HB=()=>S.xdy?HD.filter(xHD):HD;', 'xAD/xLive'),
    cut(html, 'const thDay=()=>', '\n', 'thDay/fy0/fyOfDay'),
    cut(html, "const fuOK=r=>DIC.fu[r.fu]==='ไม่มี';", '\n', 'fuOK'),
    cut(html, 'function fyCum(F){', 'return a}', 'fyCum'),
    cut(html, 'const hKey=(d,t,la,lo)=>', '\n', 'hKey'),
    cut(html, 'function fyNow(F,T){', 'return a}', 'fyNow'),
    cut(html, "let PM='24',FYC=null,FYA=false;", '\n', 'PM'),
    cut(html, 'function fyPts(all=', 'return(FYC={k,L}).L}', 'fyPts'),
    cut(html, 'const SB1=', '\n', 'SB1/SB7'), cut(html, 'const SBP={', '\n', 'SBP'),
    cut(html, 'const esc=t=>', 'let HDF=[];try{HDF=hdFill(HD,AD,fyOfDay(thDay()))}catch(e){dbg(\'hdFill\',e)}', 'hdata/adata/hdFill'),
    'LIVE=liveList(__live);',
    'return {liveList,geoAt,fyNow,fyPts,fyCum,thDay,fy0,fyOfDay,fuOK,xHD,get HD(){return HD},get DIC(){return DIC},get AD(){return AD},get ADI(){return ADI},get LIVE(){return LIVE},HSRC};',
  ].join('\n');
  class D extends Date { constructor(...a) { if (a.length) super(...a); else super(now) } static now() { return now } }
  const env = {
    Date: D, document: { getElementById: id => id in B ? { textContent: B[id] } : null }, GEO: JSON.parse(B.geo), S: { xdy: true, sats: { SNPP: true, NOAA20: true, NOAA21: true } },
    WAR: [], watchAt: () => null, nearestHist: () => null, loadedAt: 0, satOn: () => true, dbg: () => { }, console: { warn() { }, log() { } }, __live: live, LIVE: [],
  };
  const K = Object.keys(env);
  return { fn: new Function(...K, src)(...K.map(k => env[k])), S: env.S };
}

// ---- ตัวเลขจากหน้าเว็บ (ค่าเริ่มต้น = ไม่รวมดงใหญ่ S.xdy=true) ----
const arName = n => n ? n.replace(/^เตรียมประกาศเป็น(.*)$/, '$1 (เตรียมการ)') : OUTA; // ชื่อแนวเขตในหน้าเว็บ → ชื่อของ where() (lib/area.js) ที่ summary ใช้
function pageNums(P) {
  const { fn, S } = P, T0 = fn.thDay(), F = fn.fyOfDay(T0), T = T0 - fn.fy0(F), r = { F, T };
  if (!fn.ADI) throw new Error('หน้าเว็บอ่าน adata ไม่ได้');
  S.xdy = false; r.all = fn.fyNow(F, T)[T];
  S.xdy = true; r.ex = fn.fyNow(F, T)[T];
  const L = fn.fyPts(false); r.pts = L.length; r.area = {}; r.pv = {};
  for (const h of L) { const g = fn.geoAt(h.lon, h.lat), k = g.cons ? arName(g.cons.properties.name) : OUTA; r.area[k] = (r.area[k] || 0) + 1; const p = h.prov || 'ไม่ระบุ'; r.pv[p] = (r.pv[p] || 0) + 1 }
  // ปีงบก่อน: จุดกรมอุทยานฯ ไม่รวมจัดการเชื้อเพลิง/ไม่พบไฟ (fuOK) ไม่รวมดงใหญ่ (xHD) — ทั้งปี (การ์ด LINE/Telegram) และช่วงเดียวกัน (โหมดเทียบในการ์ดหน้าเว็บ)
  const sp = fn.fy0(F - 1), H = fn.HD.filter(x => x.fy === F - 1 && fn.fuOK(x) && fn.xHD(x));
  r.pfull = H.length; r.prv = H.filter(x => x.d - sp <= T).length;
  return r;
}
// ---- summary.json (build_site.js summary()) ไม่รวมพื้นที่ดงใหญ่ แบบเดียวกับ carousel()/dailyMsg ----
function sumNums(sum) {
  const A = Object.entries(sum.areas || {}), X = A.filter(([k]) => !EX.test(k)), r = { all: sum.total, ex: 0, pfull: 0, prv: 0, area: {}, pv: {} };
  for (const [k, v] of X) { r.ex += v.fy; r.pfull += v.pfull; r.prv += v.prv; const a = k.startsWith(OUTA) ? OUTA : k; r.area[a] = (r.area[a] || 0) + v.fy; for (const p in v.pv || {}) r.pv[p] = (r.pv[p] || 0) + v.pv[p] }
  r.allAreas = A.reduce((s, [, v]) => s + v.fy, 0);
  return r;
}
// ---- การ์ด LINE: carousel() แบบสรุปประจำวัน → การ์ดแรก แถว [ชื่อย่อ, แถบ, ปีนี้, ปีก่อน, %] และแถว "รวม" ----
async function lineNums(live, sum, now) {
  const W = await import(pathToFileURL(path.join(ROOT, 'worker', 'line-webhook.mjs')).href), m = W.carousel({ live, sum, now, daily: true }), r = { area: {}, pfull: {} };
  const name = Object.fromEntries(W.AREAS.map(a => [a.s, a.k]).concat([['นอกเขตอนุรักษ์', OUTA]]));
  const txt = b => (b.contents || []).filter(c => c.type === 'text').map(c => c.text);
  const walk = b => { if (!b || typeof b !== 'object') return; if (b.type === 'box' && b.layout === 'horizontal') { const t = txt(b); if (t[0] in name && t.length >= 4 && /^\d+$/.test(t[1])) { r.area[name[t[0]]] = +t[1]; r.pfull[name[t[0]]] = +t[2] } else if (t[0] === 'รวม' && /^\d+$/.test(t[1])) { r.ex = +t[1]; r.pf = +t[2] } } for (const k in b) if (k !== 'type') walk(b[k]) };
  const card = m.contents && m.contents.contents ? m.contents.contents[0] : m.contents; walk(card);
  if (r.ex == null) throw new Error('ไม่พบแถว "รวม" ในการ์ด LINE (รูปแบบการ์ดเปลี่ยน?)');
  return r;
}
// ---- Telegram: telegram_notify.js --preview → ส่วน "สรุปประจำวัน" ----
function tgNums(dir, now) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'telegram_notify.js'), '--preview'], { env: { ...process.env, NOTIFY_DIR: dir, TG_NOW: String(now), TG_TOKEN: '', TG_CHAT_ID: '' }, encoding: 'utf8', timeout: 60e3 });
  const sec = (out.split('===== สรุปประจำวัน')[1] || '').split('\n=====')[0];
  if (!sec) throw new Error('ไม่พบข้อความสรุปประจำวันใน telegram_notify.js --preview');
  const r = { area: {}, pfull: {} }, short = { 'อช.เขาใหญ่': 'อุทยานแห่งชาติเขาใหญ่', 'อช.ทับลาน': 'อุทยานแห่งชาติทับลาน', 'อช.ปางสีดา': 'อุทยานแห่งชาติปางสีดา', 'อช.ตาพระยา': 'อุทยานแห่งชาติตาพระยา', 'ขห.เขาฉกรรจ์': 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)', 'ขห.โคกสูง': 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมการ)', 'นอกเขตอนุรักษ์': OUTA };
  for (const l of sec.split('\n')) {
    let m = l.match(/^(?:•|🔥) (.+?) (\d+) \| (\d+)\s/); if (m && m[1] in short) { r.area[short[m[1]]] = +m[2]; r.pfull[short[m[1]]] = +m[3]; continue }
    m = l.match(/^รวม <b>(\d+)<\/b> \| (\d+)/); if (m) { r.ex = +m[1]; r.pf = +m[2] }
  }
  if (r.ex == null) throw new Error('ไม่พบบรรทัด "รวม" ในสรุปประจำวัน Telegram');
  return r;
}

async function verify(dir = DIR, o = {}) {
  const rd = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), sum = rd('summary.json'), live = rd('live.json');
  const now = o.now || Date.parse(sum.generated);
  const pg = pageNums(page(html, blocks(html, dir), live, now)), sm = sumNums(sum);
  const ln = o.line === false ? null : await lineNums(live, sum, now), tg = o.tg === false ? null : tgNums(dir, now);
  let dk = null; if (html.includes('const dsKpi=')) { const f = new Function(cut(html, 'const dsKpi=', '/*dsKpi-end*/', 'dsKpi') + ';return dsKpi')(); dk = { ex: f(sum, true), all: f(sum, false) } }
  const checks = [], diff = [], add = (name, v) => { const vals = Object.values(v).filter(x => x !== undefined), ok = vals.every(x => x === vals[0]); checks.push({ name, ...v, ok }); if (!ok) diff.push(`${name}: ` + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${k} ${x}`).join(' / ')) };
  add('ปีงบ', { page: pg.F, summary: sum.fy });
  add('สะสมปีงบ ทุกพื้นที่ (รวมดงใหญ่)', { page: pg.all, summary: sm.all, 'summary รายพื้นที่': sm.allAreas, dash: dk ? dk.all.fy : undefined });
  add('สะสมปีงบ ไม่รวมดงใหญ่', { page: pg.ex, 'page รายจุด': pg.pts, summary: sm.ex, dash: dk ? dk.ex.fy : undefined, line: ln && ln.ex, telegram: tg && tg.ex });
  add('ปีงบก่อนทั้งปี ไม่รวมดงใหญ่', { page: pg.pfull, summary: sm.pfull, dash: dk ? dk.ex.pfull : undefined, line: ln && ln.pf, telegram: tg && tg.pf });
  add('ปีงบก่อนช่วงเดียวกัน ไม่รวมดงใหญ่', { page: pg.prv, summary: sm.prv, dash: dk ? dk.ex.prv : undefined });
  for (const k of [...new Set([...Object.keys(pg.area), ...Object.keys(sm.area), ...Object.keys(ln ? ln.area : {}), ...Object.keys(tg ? tg.area : {})])].sort())
    add(`พื้นที่ ${k}`, { page: pg.area[k] || 0, summary: sm.area[k] || 0, dash: dk ? (dk.ex.ar[k] || { fy: 0 }).fy : undefined, line: ln ? ln.area[k] || 0 : undefined, telegram: tg ? tg.area[k] || 0 : undefined });
  for (const k of [...new Set([...Object.keys(pg.pv), ...Object.keys(sm.pv)])].sort()) add(`จังหวัด ${k}`, { page: pg.pv[k] || 0, summary: sm.pv[k] || 0 });
  return { at: new Date().toISOString(), now: new Date(now).toISOString(), ok: !diff.length, fy: pg.F, n: { all: pg.all, ex: pg.ex, pfull: pg.pfull }, dash: !!dk, line: !!ln, telegram: !!tg, diff, checks };
}
module.exports = { verify, sumNums };

if (require.main === module) (async () => {
  let R;
  try { R = await verify() }
  catch (e) { R = { at: new Date().toISOString(), ok: null, why: e.message, diff: [], checks: [] } }
  try { fs.writeFileSync(path.join(DIR, 'numcheck.json'), JSON.stringify(R)) } catch (e) { }
  if (R.ok === null) { console.log(`${CI ? '::warning title=ตรวจความสอดคล้องตัวเลขไม่ได้::' : '⚠ ตรวจไม่ได้: '}${R.why}`); return }
  for (const c of R.checks) if (!c.ok || args.includes('--all')) console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ` + Object.entries(c).filter(([k, v]) => !['name', 'ok'].includes(k) && v !== undefined).map(([k, v]) => `${k} ${v}`).join(' · '));
  if (R.ok) console.log(`✅ ตัวเลขตรงกัน ${R.checks.length} รายการ — ปีงบ ${R.fy} สะสม ${R.n.ex} จุด (ไม่รวมดงใหญ่ · ทั้งหมด ${R.n.all}) ปีก่อนทั้งปี ${R.n.pfull} · หน้าเว็บ = summary.json${R.dash ? ' = แดชบอร์ด' : ''}${R.line ? ' = LINE' : ''}${R.telegram ? ' = Telegram' : ''}`);
  else { console.log(`${CI ? '::warning title=ตัวเลขหน้าเว็บ/summary.json/LINE/Telegram ไม่ตรงกัน::' : '❌ ไม่ตรงกัน: '}${R.diff.slice(0, 5).join(' ; ')}`); if (!CI) process.exitCode = 1 }
})();
