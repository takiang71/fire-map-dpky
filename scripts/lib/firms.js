// NASA FIRMS (VIIRS 375 ม. ชุดเดียวกับ API ไทย) — แหล่งสำรองเมื่อ API ไทยขัดข้อง และใช้ตรวจย้อนหลัง
//  - recent(): ไฟล์ CSV 7 วันล่าสุดแบบสาธารณะ (ไม่ต้องใช้ key)
//  - area(sat, d0, d1): ย้อนหลังได้ทั้งหมด ต้องมี MAP_KEY (env FIRMS_KEY หรือไฟล์ .firms_key ที่รากโปรเจกต์ — ignore ไว้แล้ว)
//    เลือกชุด NRT ถ้าครอบช่วงวัน ไม่งั้นใช้ SP (ชุดผ่านการตรวจแล้ว) ตาม /api/data_availability
//  วันที่/เวลาแปลงเป็นเวลาไทยแบบเดียวกับ API ไทย (d = วันนับจาก 1970-01-01, t = HHMM)
const fs = require('fs'), path = require('path');
const { where } = require('./area');
const { admIndex } = require('./burnsum');

const ROOT = path.join(__dirname, '..', '..');
const BASE = 'https://firms.modaps.eosdis.nasa.gov';
const BOX = [100.5, 13, 103.9, 15.2]; // กรอบกลุ่มป่า (ตะวันตก ใต้ ตะวันออก เหนือ)
const PUB = { SNPP: 'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2', NOAA20: 'noaa-20-viirs-c2/csv/J1_VIIRS_C2', NOAA21: 'noaa-21-viirs-c2/csv/J2_VIIRS_C2' };
const SRC = { SNPP: 'VIIRS_SNPP', NOAA20: 'VIIRS_NOAA20', NOAA21: 'VIIRS_NOAA21' };
const isoOf = d => new Date(d * 864e5).toISOString().slice(0, 10);
const dayOf = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;

function key() {
  if (process.env.FIRMS_KEY) return process.env.FIRMS_KEY.trim();
  try { return fs.readFileSync(path.join(ROOT, '.firms_key'), 'utf8').trim() || null } catch (e) { return null }
}

// โควตา MAP_KEY 5,000 หน่วย/10 นาที คิดตามขนาดคำขอ (ตรวจทั้งปีงบ ~540 คำขอเกินโควตา) — เกินแล้ว FIRMS ตอบ "Invalid MAP_KEY"
// จึงเช็ก mapkey_status แล้วรอจนโควตาคืน (สูงสุด ~12 นาที) ก่อนลองใหม่
async function waitQuota(k, log) {
  for (let i = 0; i < 13; i++) {
    const s = await fetch(`${BASE}/mapserver/mapkey_status/?MAP_KEY=${k}`).then(r => r.json()).catch(() => null);
    if (!s || s.current_transactions == null) return false; // คีย์ผิดจริง
    if (s.current_transactions < s.transaction_limit * 0.9) return true;
    if (i === 0) (log || console.log)(`FIRMS ใช้โควตาครบ (${s.current_transactions}/${s.transaction_limit}) รอโควตาคืน…`);
    await new Promise(r => setTimeout(r, 60e3));
  }
  return false;
}

async function get(url, label, log) {
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { signal: AbortSignal.timeout(180e3) });
    const t = await r.text();
    if (/Invalid MAP_KEY/i.test(t) && key() && await waitQuota(key(), log)) { k--; continue }
    if (!r.ok || /^(Invalid|Error)/i.test(t)) throw new Error(`HTTP ${r.status} ${t.slice(0, 80).trim()}`);
    return t;
  } catch (e) {
    if (k >= 3) throw new Error(`${label}: ${e.message}`);
    await new Promise(r => setTimeout(r, 3000 * k));
  }
}

// CSV → จุดในแนวเขต (รูปแบบเดียวกับ fetchDay ใน sync_hotspots.js + src:'firms')
let ADM;
function parse(text, sat) {
  if (ADM === undefined) ADM = admIndex();
  const L = text.split('\n'), h = L[0].split(','), c = n => h.indexOf(n), out = [];
  const iLa = c('latitude'), iLo = c('longitude'), iD = c('acq_date'), iT = c('acq_time'), iC = c('confidence');
  for (const l of L.slice(1)) {
    const v = l.split(','); if (v.length < h.length) continue;
    const la = +v[iLa], lo = +v[iLo]; if (!(lo > BOX[0] && lo < BOX[2] && la > BOX[1] && la < BOX[3])) continue;
    const w = where(lo, la); if (!w) continue;
    const tt = v[iT].padStart(4, '0'), x = new Date(Date.parse(`${v[iD]}T${tt.slice(0, 2)}:${tt.slice(2, 4)}:00Z`) + 7 * 36e5), a = ADM && ADM(lo, la);
    const cf = { n: 'nominal', l: 'low', h: 'high' }[v[iC]] || v[iC].trim();
    const r = { d: Math.floor(x / 864e5), t: x.getUTCHours() * 100 + x.getUTCMinutes(), la: Math.round(la * 1e5), lo: Math.round(lo * 1e5), sat, cf,
      pv: a ? a.p : 'ไม่ระบุ', am: a ? a.a : 'ไม่ระบุ', tm: a ? a.t : 'ไม่ระบุ', ...w, src: 'firms' };
    r.uid = `firms|${r.d}|${r.t}|${r.la}|${r.lo}|${sat}`; out.push(r);
  }
  return out;
}

async function recent() {
  const out = [];
  for (const [sat, p] of Object.entries(PUB)) out.push(...parse(await get(`${BASE}/data/active_fire/${p}_SouthEast_Asia_7d.csv`, 'FIRMS ' + sat), sat));
  return out;
}

// ช่วงวันที่ (UTC) ที่แต่ละชุดมีข้อมูล
let AV;
async function avail(k) {
  if (AV) return AV;
  AV = {};
  for (const l of (await get(`${BASE}/api/data_availability/csv/${k}/ALL`, 'FIRMS availability')).split('\n').slice(1)) {
    const [id, a, b] = l.split(','); if (id && a && b) AV[id.trim()] = [dayOf(a.trim()), dayOf(b.trim())];
  }
  return AV;
}

// วันไทย d0..d1 ของดาวเทียมหนึ่ง (วันไทย d = UTC d-1 17:00 ถึง d 17:00 จึงขอ UTC d0-1 .. d1)
// API ขอได้ครั้งละ ≤5 วัน UTC นับจาก DATE ไปข้างหน้า · ตัดช่วงตามรอยต่อ SP/NRT (เช่น SP ถึง 31 ก.ค. 69, NRT ตั้งแต่ 1 ส.ค. 69)
async function area(sat, d0, d1, log = () => {}) {
  const k = key(); if (!k) throw new Error('ไม่มี FIRMS_KEY');
  const A = await avail(k), out = [];
  for (let u = d0 - 1; u <= d1;) {
    const id = [SRC[sat] + '_NRT', SRC[sat] + '_SP'].find(i => A[i] && A[i][0] <= u && A[i][1] >= u);
    if (!id) { log(`FIRMS ไม่มีข้อมูล ${sat} ${isoOf(u)} (UTC)`); u++; continue }
    const e = Math.min(d1, u + 4, A[id][1]);
    const t = await get(`${BASE}/api/area/csv/${k}/${id}/${BOX.join(',')}/${e - u + 1}/${isoOf(u)}`, `FIRMS ${id} ${isoOf(u)}`, log);
    out.push(...parse(t, sat).filter(r => r.d >= d0 && r.d <= d1).map(r => (r.fid = id, r)));
    u = e + 1;
  }
  return out;
}

// จุดเดียวกัน: ดาวเทียมเดียวกัน วันเดียวกัน เวลาต่าง ≤10 นาที ห่าง <400 (หน่วย 1e-5 องศา ~440 ม.) — เกณฑ์เดียวกับการจับคู่ dnp
const mins = t => Math.floor(t / 100) * 60 + t % 100;
const same = (a, b) => a.d === b.d && a.sat === b.sat && Math.abs(mins(a.t) - mins(b.t)) <= 10 && Math.hypot(a.la - b.la, a.lo - b.lo) < 400;

// จับคู่หนึ่งต่อหนึ่ง (คู่ที่ใกล้สุดก่อน แบบเดียวกับ dnp) → [Set ดัชนีที่จับได้ใน A, Set ใน B, Map A→B]
function match(A, B) {
  const P = [];
  A.forEach((a, i) => B.forEach((b, j) => { if (same(a, b)) P.push([Math.hypot(a.la - b.la, a.lo - b.lo), i, j]) }));
  const uA = new Set(), uB = new Set(), m = new Map();
  for (const [, i, j] of P.sort((x, y) => x[0] - y[0])) if (!uA.has(i) && !uB.has(j)) { uA.add(i); uB.add(j); m.set(i, j) }
  return [uA, uB, m];
}

module.exports = { key, recent, area, same, match, isoOf, dayOf };
