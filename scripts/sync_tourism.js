// ข้อมูลการท่องเที่ยวและสัตว์ป่าของอุทยานแห่งชาติ จากรายงาน Power BI สาธารณะของกรมอุทยานฯ 9 ฉบับ (ผู้ใช้ขอ 5 พ.ย. 69)
// รายเดือน/รายปีงบต่ออุทยาน (REPORTS):
//   vis = "ระบบรายงานจำนวนนักท่องเที่ยวในอุทยานแห่งชาติ" ตาราง Tourist (ไทย/ต่างชาติ)
//   rev = "ระบบรายงานการจัดเก็บเงินรายได้อุทยานแห่งชาติ" ตาราง Income
//   veh = "ระบบรายงานจำนวนยานพาหนะที่เข้าอุทยานแห่งชาติ" ตาราง จำนวนยานพาหนะ
//   was = "ระบบการรายงานปริมาณขยะในอุทยานแห่งชาติ" ตาราง แยกปี (รายปีงบ ไม่มีรายเดือน, กก. แยก 5 ประเภท)
// ข้อมูลประกอบ (EXTRAS):
//   close = "ระบบรายงานข้อมูลการเปิด-ปิดการท่องเที่ยวและพักแรมในอุทยานแห่งชาติและวนอุทยาน" — ช่วงปิดแหล่งท่องเที่ยวประจำปี
//   wild  = "ระบบฐานข้อมูลการกระจายของสัตว์ป่าชนิดสำคัญ" (ปี 2564) — **เก็บแค่จำนวนบันทึกต่อชนิด ไม่เก็บพิกัด**
//           (ตำแหน่งที่พบเสือโคร่ง/ช้าง/กระทิงเสี่ยงต่อการล่า แม้ต้นทางจะเผยแพร่อยู่แล้ว)
//   dark  = "อุทยานแห่งชาติและวนอุทยานท้องฟ้ามืด" — อุทยานท้องฟ้ามืด + สถานที่ดูดาว
//   wsr   = "ระบบรายงานการดำเนินงานในพื้นที่เขตรักษาพันธุ์สัตว์ป่าและเขตห้ามล่าสัตว์ป่า" — ดงใหญ่: นักท่องเที่ยว รายได้ จุดศึกษาธรรมชาติ
//   hec   = "ระบบรายงานการแก้ไขปัญหาช้างป่าและสัตว์ป่าที่สร้างผลกระทบต่อราษฎรนอกพื้นที่ป่าอนุรักษ์" — ช้างป่าออกนอกพื้นที่ ผู้บาดเจ็บ/เสียชีวิต (จำนวนเท่านั้น) เครือข่ายเฝ้าระวัง อำเภอที่มีปัญหา
// → data/tourism.json เฉพาะพื้นที่ในกลุ่มป่า + ยอดทั้งประเทศ/อันดับ
// รายงานเผยแพร่แบบ Publish to web — อ่านผ่าน querydata ที่หน้ารายงานใช้เอง (ไม่ต้องล็อกอิน/คีย์ แต่ไม่ใช่ API ทางการ:
// ถ้า Microsoft เปลี่ยนรูปแบบหรือเจ้าของปิดการเผยแพร่ ฉบับนั้นจะล้ม → คงข้อมูลเดิมของฉบับนั้นไว้ และจบด้วย exit 1)
// node scripts/sync_tourism.js   (เขียนไฟล์เฉพาะเมื่อข้อมูลเปลี่ยน)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'tourism.json');
const FALLBACK = 'https://wabi-south-east-asia-b-primary-redirect.analysis.windows.net/';
// รหัสในหน้าความสำคัญ (KB) ← ชื่อในรายงาน
const PARKS = { ky: 'เขาใหญ่', tl: 'ทับลาน', ps: 'ปางสีดา', tp: 'ตาพระยา' };
// ลำดับเดือนในปีงบ ต.ค. → ก.ย. (ชื่อเต็มตามรายงาน)
const MON = ['ตุลาคม', 'พฤศจิกายน', 'ธันวาคม', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน'];
const MCAL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const REPORTS = {
  vis: { r: 'eyJrIjoiODljOTFmNDktY2IwZi00MWQzLTlhYTAtZDE2NWE1ZWVmOGQzIiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==', src: 'ระบบรายงานจำนวนนักท่องเที่ยวในอุทยานแห่งชาติ',
    ent: 'Tourist', fy: 'ปีงบประมาณ', park: 'ชื่ออุทยาน', mon: 'เดือน', val: 'จำนวน', kind: 'ประเภทนักท่องเที่ยว', kinds: { 'ไทย': 'th', 'ต่างชาติ': 'fo' } },
  rev: { r: 'eyJrIjoiNDcwMmI2ZGItZThkMi00ZmExLWJhZjEtYWJiNGFhODU3NzM0IiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==', src: 'ระบบรายงานการจัดเก็บเงินรายได้อุทยานแห่งชาติ',
    ent: 'Income', fy: 'ปีงบประมาณ', park: 'ชื่ออุทยานแห่งชาติ', mon: 'เดือน', val: 'เงินรายได้' },
  veh: { r: 'eyJrIjoiODRiNzRkNmUtMWU3Ni00NjI0LWI3ZGItMWQ4MGI5MDE0MjUxIiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==', src: 'ระบบรายงานจำนวนยานพาหนะที่เข้าอุทยานแห่งชาติ',
    ent: 'จำนวนยานพาหนะ', fy: 'ปีงบประมาณ', park: 'อุทยานแห่งชาติ', mon: 'เดือน', val: 'จำนวน' },
  // mon: null = รายปีงบ → parks[id][ประเภท][ปีงบ] เป็นตัวเลขเดียว (กก.)
  was: { r: 'eyJrIjoiZTAwOGY2MjgtY2M4MC00NWU2LWE0Y2EtZmQ4OTFhMDZhNDVkIiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==', src: 'ระบบการรายงานปริมาณขยะในอุทยานแห่งชาติ',
    ent: 'แยกปี', fy: 'ปีงบประมาณ', park: 'อุทยานแห่งชาติ', mon: null, val: 'ปริมาณขยะ(กิโลกรัม)', kind: 'ประเภทขยะ',
    kinds: { 'ขยะทั่วไป': 'g', 'ขยะรีไซเคิล': 'r', 'ขยะอินทรีย์': 'o', 'ขยะอันตราย': 'h', 'อื่นๆ': 'x' } },
};
const R_CLOSE = 'eyJrIjoiN2ZlNzc2NzAtYWJmOC00NWM1LTk4YzAtZDNmMGIwNmQ3NjkyIiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==';
const R_WILD = 'eyJrIjoiYmZkZDA5ZTgtZmIwNi00NzRiLWJhZGItNzQwYzE2ODRiMTgzIiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==';
const R_DARK = 'eyJrIjoiNDZiZGQzZWYtOGUwZC00MTlhLWFhNzMtZTQ4MjM5N2NkOGY3IiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==';
const R_WSR = 'eyJrIjoiMWYxMTdiOWUtZGY4MC00N2QyLWFiNTAtYmFlNDJiZjlhYTQ2IiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==';
const R_HEC = 'eyJrIjoiYjc1ZmZkOGItYWQ2MC00MjM1LThkMTAtMDE4MzBiYmZjNzFjIiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==';
// พื้นที่อนุรักษ์ในกลุ่มป่า (ชื่อเต็มในรายงานสัตว์ป่า/ท้องฟ้ามืด) → รหัส KB
const FULL = { 'อุทยานแห่งชาติเขาใหญ่': 'ky', 'อุทยานแห่งชาติทับลาน': 'tl', 'อุทยานแห่งชาติปางสีดา': 'ps', 'อุทยานแห่งชาติตาพระยา': 'tp', 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่': 'dy' };
const WIN = 30000; // เพดานแถวต่อคำขอของบริการ (ขอมากกว่านี้ก็ได้แค่ 30,000)

const apim = u => { const x = new URL(u); const h = x.hostname.split('.'); h[0] = h[0].replace('-redirect', '').replace('global-', '') + '-api'; return x.protocol + '//' + h.join('.') };
// ถอดรูปแบบบีบอัด DSR ของ Power BI: R = บิตใช้ค่าซ้ำจากแถวก่อน, Ø = บิตค่าว่าง, DN = ดัชนีใน ValueDicts
function dsr(ds) {
  const rows = [], vd = ds.ValueDicts || {}; let prev = [], sch = null;
  for (const o of ds.PH[0].DM0) {
    if (o.S) sch = o.S;
    const row = []; let ci = 0; const rep = o.R || 0, nul = o['Ø'] || 0;
    for (let i = 0; i < sch.length; i++) {
      if (rep & (1 << i)) { row.push(prev[i]); continue }
      if (nul & (1 << i)) { row.push(null); continue }
      let v = o.C[ci++]; if (sch[i].DN && typeof v === 'number') v = vd[sch[i].DN][v]; row.push(v);
    }
    rows.push(row); prev = row;
  }
  return rows;
}

// เชื่อมรายงาน 1 ฉบับ → { meta, q(entity, cols, {sum, fn, measure, where}) }
async function connect(R, src) {
  const { k: KEY, t: TENANT } = JSON.parse(Buffer.from(R, 'base64').toString());
  const VIEW = 'https://app.powerbi.com/view?r=' + encodeURIComponent(R);
  const H = { 'X-PowerBI-ResourceKey': KEY };
  const json = async (url, opt = {}) => {
    const r = await fetch(url, { ...opt, headers: { ...H, ...(opt.headers || {}) }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(url.replace(/\?.*/, '') + ' → HTTP ' + r.status);
    return r.json();
  };
  let c = FALLBACK;
  try { const h = await (await fetch(VIEW, { signal: AbortSignal.timeout(30000) })).text(); const m = h.match(/resolvedClusterUri = '([^']+)'/); if (m) c = m[1] } catch { }
  try { const r = await json(apim(c) + '/public/routing/cluster/' + TENANT); if (r.FixedClusterUri) c = r.FixedClusterUri } catch { }
  const A = apim(c);
  const mx = await json(A + `/public/reports/${KEY}/modelsAndExploration?preferReadOnlySession=true`);
  const model = mx.models[0];
  const ce = p => ({ Column: { Expression: { SourceRef: { Source: 't' } }, Property: p } });
  const q = async (ent, cols, o = {}) => {
    const sel = cols.map(p => ({ ...ce(p), Name: ent + '.' + p }));
    if (o.sum) sel.push({ Aggregation: { Expression: ce(o.sum), Function: o.fn ?? 0 }, Name: 'Sum(' + ent + '.' + o.sum + ')' });
    if (o.measure) sel.push({ Measure: { Expression: { SourceRef: { Source: 't' } }, Property: o.measure }, Name: ent + '.' + o.measure });
    const where = o.where && Object.entries(o.where).map(([k, vs]) => ({ Condition: { In: { Expressions: [ce(k)], Values: vs.map(v => [{ Literal: { Value: `'${v}'` } }]) } } }));
    const body = {
      version: '1.0.0', cancelQueries: [], modelId: model.id,
      queries: [{ Query: { Commands: [{ SemanticQueryDataShapeCommand: { Query: { Version: 2, From: [{ Name: 't', Entity: ent, Type: 0 }], Select: sel, ...(where ? { Where: where } : {}) }, Binding: { Primary: { Groupings: [{ Projections: sel.map((_, i) => i) }] }, DataReduction: { DataVolume: 4, Primary: { Window: { Count: WIN } } }, Version: 1 } } }] } }]
    };
    const j = await json(A + '/public/reports/querydata?synchronous=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = j.results[0].result.data.dsr;
    if (!res.DS) throw new Error(ent + ': ' + JSON.stringify(res).slice(0, 200));
    const rows = dsr(res.DS[0]);
    if (rows.length >= WIN) throw new Error(ent + ': ผลถึงเพดาน ' + WIN + ' แถว (ข้อมูลอาจไม่ครบ)');
    return rows;
  };
  return { meta: { src: src + ' (Power BI)', url: VIEW, refresh: model.LastRefreshTime || model.lastRefreshTime || null }, q };
}

async function report(cfg) {
  const C = await connect(cfg.r, cfg.src);
  // 1) รายเดือน (หรือรายปีงบเมื่อไม่มีเดือน) แยกประเภทถ้ามี เฉพาะ 4 อุทยาน  2) ยอดรายปีงบทุกอุทยาน (หาอันดับ/ยอดทั้งประเทศ)
  // ค่าบางแถวมาเป็นข้อความทศนิยม ('4433.7999…') จึงแปลงด้วย Number ก่อนรวม
  const mrows = await C.q(cfg.ent, [cfg.fy, cfg.park, ...(cfg.mon ? [cfg.mon] : []), ...(cfg.kind ? [cfg.kind] : [])], { sum: cfg.val, where: { [cfg.park]: Object.values(PARKS) } });
  const yrows = await C.q(cfg.ent, [cfg.fy, cfg.park], { sum: cfg.val });
  const parks = {};
  for (const r of mrows) {
    const id = Object.keys(PARKS).find(k => PARKS[k] === r[1]);
    if (!cfg.mon) {
      const [fy, , kd] = r, v = Number(r[r.length - 1]) || 0, key = cfg.kind ? cfg.kinds[kd] : 'n';
      if (cfg.kind && !key && v) throw new Error(cfg.ent + ': ไม่รู้จักประเภท "' + kd + '"');
      if (fy && id && key) ((parks[id] ??= {})[key] ??= {})[fy] = Math.round((((parks[id][key][fy]) || 0) + v) * 10) / 10;
      continue;
    }
    const [fy, , m] = r, v = Math.round(Number(r[r.length - 1]) || 0), mi = MON.indexOf(m);
    if (mi < 0 && v) throw new Error(cfg.ent + ': ไม่รู้จักชื่อเดือน "' + m + '"');
    if (!fy || !id || mi < 0) continue;
    const key = cfg.kind ? cfg.kinds[r[3]] : 'n'; if (!key) continue;
    ((((parks[id] ??= {})[key] ??= {})[fy]) ??= Array(12).fill(0))[mi] += v;
  }
  for (const id of Object.keys(PARKS)) if (!parks[id]) throw new Error(cfg.ent + ': ไม่พบอุทยาน ' + PARKS[id]);
  const tot = {};
  for (const [fy, p, v] of yrows) if (fy && p) (tot[fy] ??= {})[p] = (tot[fy][p] || 0) + (Number(v) || 0);
  const fys = Object.keys(tot).sort();
  const nat = {}; for (const fy of fys) { const v = Object.values(tot[fy]); nat[fy] = { sum: Math.round(v.reduce((a, b) => a + b, 0)), n: v.filter(x => x > 0).length } }
  for (const [id, n] of Object.entries(PARKS)) {
    const rk = {};
    for (const fy of fys) { const v = tot[fy][n] || 0; if (v > 0) rk[fy] = 1 + Object.values(tot[fy]).filter(x => x > v).length }
    parks[id].rk = rk;
  }
  return { meta: { ...C.meta, fys, nat }, parks, rows: mrows.length + yrows.length };
}

// "01 มีนาคม " → [1, 3] (วัน, เดือนปฏิทิน)
const dm = s => { const m = String(s || '').trim().match(/^(\d{1,2})\s+(\S+)/); if (!m) return null; const mo = MCAL.indexOf(m[2]) + 1; return mo ? [+m[1], mo] : null };
const EXTRAS = {
  // ช่วงปิดแหล่งท่องเที่ยวประจำปี: parks[id] = [[ชื่อ, lat, lon, เปิดตลอดปี 1|0, [ว,ด] เริ่มปิด, [ว,ด] สิ้นสุด, สาเหตุ, หมายเหตุ]]
  // วันที่ใช้ข้อความไทย (วัน+เดือน วนทุกปี) — ช่องวันที่จริงของต้นทางปีไม่ตรงกัน (เช่น เริ่ม 2025 สิ้นสุด 2023)
  async close() {
    const C = await connect(R_CLOSE, 'ระบบรายงานข้อมูลการเปิด-ปิดการท่องเที่ยวและพักแรมในอุทยานแห่งชาติและวนอุทยาน'), E = 'รวมปิดประจำปี 69update';
    const rows = await C.q(E, ['หน่วยงาน', 'ชื่อหน่วยงาน', 'ชื่อแหล่งท่องเที่ยว', 'latitude', 'longitude', 'เปิดตลอดปี', 'สาเหตุการปิด', 'หมายเหตุ', 'วันที่เริ่มปิดไทย', 'วันที่สิ้นสุดการปิดไทย'], { where: { 'ชื่อหน่วยงาน': Object.values(PARKS) } });
    const parks = {}; let n = 0;
    for (const [unit, nm, site, la, lo, all, why, note, f, t] of rows) {
      const id = Object.keys(PARKS).find(k => PARKS[k] === nm); if (!id || unit !== 'อุทยานแห่งชาติ' || !site) continue;
      (parks[id] ??= []).push([String(site).trim(), la == null ? null : +(+la).toFixed(5), lo == null ? null : +(+lo).toFixed(5), all === 'ใช่' ? 1 : 0, dm(f), dm(t), why || '', note || '']); n++;
    }
    for (const id in parks) parks[id].sort((a, b) => a[0].localeCompare(b[0], 'th'));
    if (!n) throw new Error('close: ไม่พบแหล่งท่องเที่ยวของอุทยานในกลุ่มป่า');
    return { obj: { ...C.meta, parks }, log: n + ' แหล่ง' };
  },
  // สัตว์ป่าชนิดสำคัญ ปี 2564: areas[id] = {sp:{ชนิด: จำนวนบันทึก}, ev:{ลักษณะการพบ: จำนวน}} + nat{ชนิด: ทั้งประเทศ} — ไม่เก็บพิกัด
  async wild() {
    const C = await connect(R_WILD, 'ระบบฐานข้อมูลการกระจายของสัตว์ป่าชนิดสำคัญ'), E = 'wildlife2564', M = 'จำนวนสัตว์ป่า';
    const names = Object.keys(FULL);
    const a = await C.q(E, ['ชื่อพื้นที่อนุรักษ์', 'ชนิดสัตว์ป่า_edit'], { measure: M, where: { 'ชื่อพื้นที่อนุรักษ์': names } });
    const b = await C.q(E, ['ชื่อพื้นที่อนุรักษ์', 'รายละเอียดย่อย_edit'], { measure: M, where: { 'ชื่อพื้นที่อนุรักษ์': names } });
    const c = await C.q(E, ['ชนิดสัตว์ป่า_edit'], { measure: M });
    const d = await C.q(E, ['ชื่อพื้นที่อนุรักษ์'], { measure: M });
    const areas = {};
    for (const [ar, sp, v] of a) { const id = FULL[ar]; if (id && sp) ((areas[id] ??= { sp: {}, ev: {} }).sp[sp] = +v || 0) }
    for (const [ar, ev, v] of b) { const id = FULL[ar]; if (id && ev) ((areas[id] ??= { sp: {}, ev: {} }).ev[ev] = (areas[id].ev[ev] || 0) + (+v || 0)) }
    const nat = Object.fromEntries(c.filter(r => r[0]).map(r => [r[0], +r[1] || 0]));
    // อันดับพื้นที่ตามจำนวนบันทึกรวม
    const tot = d.filter(r => r[0]).map(r => [r[0], +r[1] || 0]);
    for (const [ar, id] of Object.entries(FULL)) { const v = (tot.find(r => r[0] === ar) || [])[1]; if (areas[id] && v) { areas[id].rk = 1 + tot.filter(r => r[1] > v).length } }
    if (!Object.keys(areas).length) throw new Error('wild: ไม่พบพื้นที่ในกลุ่มป่า');
    return { obj: { ...C.meta, year: '2564', nat, nAreas: tot.length, areas }, log: Object.keys(areas).length + ' พื้นที่' };
  },
  // อุทยานท้องฟ้ามืด: parks[id] = {y ปีที่ขึ้นทะเบียน, act กิจกรรม, url, season, spots:[[ชื่อ, lat, lon, ภาพ]]}
  async dark() {
    const C = await connect(R_DARK, 'อุทยานแห่งชาติและวนอุทยานท้องฟ้ามืด');
    const names = Object.keys(FULL);
    const a = await C.q('อุทยานท้องฟ้ามืด', ['อุทยานท้องฟ้ามืด', 'ปีที่ขึ้นทะเบียน', 'รูปแบบกิจกรรม', 'URL', 'ช่วงเดือนดูดาว']);
    const b = await C.q('สถานที่ดูดาว', ['อุทยานท้องฟ้ามืด', 'สถานที่ดูดาว', 'ละติจูด', 'ลองจิจูด', 'ภาพประกอบ'], { where: { 'อุทยานท้องฟ้ามืด': names } });
    const parks = {};
    for (const [nm, y, act, url, season] of a) { const id = FULL[nm]; if (id) parks[id] = { y: y || '', act: act || '', url: url || '', season: season || '', spots: [] } }
    for (const [nm, s, la, lo, img] of b) { const id = FULL[nm]; if (id && parks[id] && s) parks[id].spots.push([s, +(+la).toFixed(5), +(+lo).toFixed(5), img || '']) }
    return { obj: { ...C.meta, n: a.length, parks }, log: Object.keys(parks).length + ' พื้นที่ในกลุ่มป่า จาก ' + a.length };
  },
  // เขตรักษาพันธุ์สัตว์ป่าดงใหญ่ (รายงานการดำเนินงานในเขตรักษาพันธุ์ฯ/เขตห้ามล่าฯ): vis {ปีงบ: คน} รายปี · rev {ปีงบ: [12 เดือน ต.ค.→ก.ย.]} บาท
  // · rk อันดับในบรรดาเขตรักษาพันธุ์สัตว์ป่า · nat {ปีงบ: {vis, rev, nv, nr}} ยอดรวมเขตรักษาพันธุ์ฯ ทั้งประเทศ · sites จุดศึกษาธรรมชาติ [หน่วย, จุด, [บริการ], X, Y (UTM 48N)]
  // ใช้ตาราง *_ขสป_ขหล (ปีงบ 2562–ล่าสุด) — ตาราง เงินรายได้/นักท่องเที่ยว เดิมถึงแค่ 2567
  async wsr() {
    const C = await connect(R_WSR, 'ระบบรายงานการดำเนินงานในพื้นที่เขตรักษาพันธุ์สัตว์ป่าและเขตห้ามล่าสัตว์ป่า'), DY = 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่', WS = 'เขตรักษาพันธุ์สัตว์ป่า';
    const v = await C.q('นักท่องเที่ยว_ขสป_ขหล', ['ปีงบประมาณ', 'ประเภทพื้นที่อนุรักษ์', 'ชื่อหน่วยงาน'], { sum: 'จำนวน (คน)' });
    const r = await C.q('เงินรายได้_ขสป_ขหล', ['ปีงบประมาณ', 'ประเภทพื้นที่อนุรักษ์', 'ชื่อหน่วยงาน'], { sum: 'รายได้' });
    const m = await C.q('เงินรายได้_ขสป_ขหล', ['ปีงบประมาณ', 'เดือน'], { sum: 'รายได้', where: { 'ชื่อหน่วยงาน': [DY] } });
    const s = await C.q('สถานที่ศึกษาธรรมชาติ', ['หน่วยปฏิบัติ', 'จุดที่ให้บริการ ', 'การให้บริการ', 'พิกัด X', 'พิกัด Y'], { where: { 'ชื่อหน่วยงาน': [DY] } });
    const dy = { vis: {}, rev: {}, rk: { vis: {}, rev: {} } }, nat = {};
    const rank = (rows, key) => { const fys = [...new Set(rows.map(x => x[0]))].sort(); for (const fy of fys) { const L = rows.filter(x => x[0] === fy && x[1] === WS).map(x => [x[2], +x[3] || 0]), me = (L.find(x => x[0] === DY) || [])[1] || 0; (nat[fy] ??= {})[key] = Math.round(L.reduce((a, x) => a + x[1], 0)); nat[fy]['n' + key[0]] = L.filter(x => x[1] > 0).length; if (me > 0) dy.rk[key][fy] = 1 + L.filter(x => x[1] > me).length } };
    for (const [fy, t, n, x] of v) if (n === DY && fy) dy.vis[fy] = (dy.vis[fy] || 0) + Math.round(+x || 0);
    rank(v, 'vis'); rank(r, 'rev');
    for (const [fy, mo, x] of m) { const i = MON.indexOf(mo); if (i < 0 && +x) throw new Error('wsr: ไม่รู้จักเดือน ' + mo); if (fy && i >= 0) (dy.rev[fy] ??= Array(12).fill(0))[i] += Math.round(+x || 0) }
    const sites = [];
    for (const [u, p, sv, X, Y] of s) { const o = sites.find(z => z[0] === u && z[1] === p); if (o) { if (!o[2].includes(sv)) o[2].push(sv) } else sites.push([u, p, [sv], +X, +Y]) }
    if (!Object.keys(dy.vis).length) throw new Error('wsr: ไม่พบดงใหญ่');
    return { obj: { ...C.meta, dy, nat, sites }, log: 'ดงใหญ่ นักท่องเที่ยว ' + Object.keys(dy.vis).join(',') + ' · รายได้ ' + Object.keys(dy.rev).join(',') + ' · จุดศึกษาธรรมชาติ ' + sites.length };
  },
  // ช้างป่ากับชุมชน (รายงานการแก้ไขปัญหาช้างป่าและสัตว์ป่าที่สร้างผลกระทบต่อราษฎร) เฉพาะกลุ่มป่าดงพญาเย็น-เขาใหญ่
  // units[ชื่อสั้น] = {t ประเภท, out:{ปีงบ:[ออกนอกพื้นที่, ไม่เสียหาย, เสียหาย]}, hurt:{ปีงบ:[บาดเจ็บ, เสียชีวิต]}, net:{ปีงบ:[เครือข่าย, สมาชิก]}, dist:{ปีงบ:['อำเภอ|จังหวัด']}}
  // · pop [ต่ำ, สูง] ประชากรช้างป่าทั้งกลุ่มป่า · nat {ปีงบ:{out, dmg, hurt, dead}} ทั้งประเทศ
  // **เหตุช้างทำร้ายราษฎรเก็บเฉพาะจำนวนต่อพื้นที่/ปี** — ไม่เก็บวันที่ เพศ หมู่บ้านของผู้ประสบเหตุ
  async hec() {
    const C = await connect(R_HEC, 'ระบบรายงานการแก้ไขปัญหาช้างป่าและสัตว์ป่าที่สร้างผลกระทบต่อราษฎรนอกพื้นที่ป่าอนุรักษ์'), G = 'ดงพญาเย็น-เขาใหญ่', W = { 'กลุ่มป่า': [G] };
    const short = s => String(s || '').trim().replace(/^(อุทยานแห่งชาติ|เขตรักษาพันธุ์สัตว์ป่า|เขตห้ามล่าสัตว์ป่า)/, '').trim();
    const typ = s => (String(s || '').match(/^(อุทยานแห่งชาติ|เขตรักษาพันธุ์สัตว์ป่า|เขตห้ามล่าสัตว์ป่า)/) || [])[1] || '';
    const units = {}, U = (n, t) => { const k = short(n); const u = (units[k] ??= { t: '', out: {}, hurt: {}, net: {}, dist: {} }); if (t && !u.t) u.t = t; return u };
    const pop = (await C.q('จำนวนช้างป่า', ['กลุ่มป่า', 'จำนวน', 'จำนวนสูงสุด'])).find(r => r[0] === G);
    const out = await C.q('ช้างป่าออกนอกพื้นที่', ['ปีงบประมาณ', 'กลุ่มป่า', 'หน่วยงาน', 'ออกนอกพื้นที่(ครั้ง)', 'ไม่เสียหาย (ครั้ง)', 'เสียหาย (ครั้ง)']);
    const nat = {};
    for (const [fy, g, u, a, b, c] of out) { if (!fy) continue; const N = (nat[fy] ??= { out: 0, dmg: 0, hurt: 0, dead: 0 }); N.out += +a || 0; N.dmg += +c || 0; if (g === G) { const o = U(u, typ(u)).out; const p = (o[fy] ??= [0, 0, 0]); p[0] += +a || 0; p[1] += +b || 0; p[2] += +c || 0 } }
    const hurt = await C.q('ช้างป่าทำร้ายราษฎร', ['ปีงบประมาณ', 'กลุ่มป่า', 'สถานะ', 'พื้นที่รับผิดชอบ'], { measure: 'CountP' });
    for (const [fy, g, st, u, n] of hurt) { if (!fy) continue; const i = st === 'เสียชีวิต' ? 1 : 0; (nat[fy] ??= { out: 0, dmg: 0, hurt: 0, dead: 0 })[i ? 'dead' : 'hurt'] += +n || 0; if (g === G) { const h = U(u, typ(u)).hurt; (h[fy] ??= [0, 0])[i] += +n || 0 } }
    const net = await C.q('เครือข่ายช้างป่า', ['ปีงบประมาณ', 'ประเภท', 'ชื่อพื้นที่อนุรักษ์', 'ชื่อเครือข่าย', 'หมู่บ้าน', 'หมู่ที่', 'ตำบล', 'จำนวนสมาชิก'], { where: W });
    for (const [fy, t, n, , , , , m] of net) { if (!fy) continue; const x = (U(n, t).net[fy] ??= [0, 0]); x[0]++; x[1] += +m || 0 }
    const dist = await C.q('พื้นที่มีปัญหาช้างป่า', ['ปีงบประมาณ', 'พื้นที่อนุรักษ์', 'อำเภอ', 'จังหวัด'], { where: W });
    for (const [fy, u, a, p] of dist) if (fy && a) { const d = (U(u, typ(u)).dist[fy] ??= []); const k = String(a).trim() + '|' + String(p).trim().replace('นคคราชสีมา', 'นครราชสีมา'); if (!d.includes(k)) d.push(k) }
    if (!Object.keys(units).length) throw new Error('hec: ไม่พบกลุ่มป่า ' + G);
    return { obj: { ...C.meta, pop: pop ? [+pop[1], +pop[2]] : null, nat, units }, log: Object.keys(units).length + ' พื้นที่ · ปีงบ ' + Object.keys(nat).sort().join(',') };
  },
};

(async () => {
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const out = { v: 3, mon: MON, names: PARKS, vis: null, rev: null, veh: null, was: null, close: null, wild: null, dark: null, wsr: null, hec: null, parks: Object.fromEntries(Object.keys(PARKS).map(k => [k, {}])) };
  let bad = 0;
  for (const [k, cfg] of Object.entries(REPORTS)) {
    try {
      const r = await report(cfg);
      out[k] = r.meta; for (const id in r.parks) out.parks[id][k] = r.parks[id];
      const last = r.meta.fys[r.meta.fys.length - 1], pf = String(last - 1);
      const s = id => Math.round(Object.entries(r.parks[id]).filter(([q, x]) => q !== 'rk' && x[pf]).map(([, x]) => x[pf]).reduce((a, x) => a + (Array.isArray(x) ? x.reduce((p, q) => p + q, 0) : x), 0));
      console.log(`${k}: ${r.rows} แถว ปีงบ ${r.meta.fys[0]}–${last} · ปีงบ ${pf} ` + Object.keys(PARKS).map(id => PARKS[id] + ' ' + s(id).toLocaleString()).join(' / '));
    } catch (e) {
      bad++; console.error(k + ': ' + e.message);
      // ล้ม = คงข้อมูลชุดเดิมของฉบับนี้ (ถ้าเคยมี)
      if (old && old[k]) { out[k] = old[k]; for (const id in out.parks) if (old.parks?.[id]?.[k]) out.parks[id][k] = old.parks[id][k] }
    }
  }
  for (const [k, fn] of Object.entries(EXTRAS)) {
    try { const r = await fn(); out[k] = r.obj; console.log(k + ': ' + r.log) }
    catch (e) { bad++; console.error(k + ': ' + e.message); if (old && old[k]) out[k] = old[k] }
  }
  if (Object.keys(REPORTS).concat(Object.keys(EXTRAS)).some(k => out[k])) {
    const txt = JSON.stringify(out);
    const strip = s => s.replace(/"refresh":"[^"]*",?/g, '');
    if (old && strip(JSON.stringify(old)) === strip(txt)) console.log('tourism: ไม่มีข้อมูลใหม่');
    else { fs.writeFileSync(OUT + '.tmp', txt); fs.renameSync(OUT + '.tmp', OUT); console.log('tourism: บันทึก ' + path.relative(ROOT, OUT) + ' ' + txt.length + ' ไบต์') }
  }
  if (bad) process.exit(1);
})().catch(e => { console.error('tourism: ' + e.message); process.exit(1) });
