// นักท่องเที่ยว เงินรายได้ ยานพาหนะ (รายเดือน) และปริมาณขยะ (รายปีงบ) ของอุทยานแห่งชาติ จากรายงาน Power BI สาธารณะ 4 ฉบับ (ผู้ใช้ขอ 5 พ.ย. 69)
//   vis = "ระบบรายงานจำนวนนักท่องเที่ยวในอุทยานแห่งชาติ" ตาราง Tourist (ไทย/ต่างชาติ)
//   rev = "ระบบรายงานการจัดเก็บเงินรายได้อุทยานแห่งชาติ" ตาราง Income
//   veh = "ระบบรายงานจำนวนยานพาหนะที่เข้าอุทยานแห่งชาติ" ตาราง จำนวนยานพาหนะ
//   was = "ระบบการรายงานปริมาณขยะในอุทยานแห่งชาติ" ตาราง แยกปี (รายปีงบ ไม่มีรายเดือน, กก. แยก 5 ประเภท)
// → data/tourism.json เฉพาะ 4 อุทยานในกลุ่มป่า (รายเดือน) + ยอดทั้งประเทศ/อันดับรายปีงบ
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

async function report(cfg) {
  const { k: KEY, t: TENANT } = JSON.parse(Buffer.from(cfg.r, 'base64').toString());
  const VIEW = 'https://app.powerbi.com/view?r=' + encodeURIComponent(cfg.r);
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
  const col = p => ({ ...ce(p), Name: cfg.ent + '.' + p });
  const sum = { Aggregation: { Expression: ce(cfg.val), Function: 0 }, Name: 'Sum(' + cfg.ent + '.' + cfg.val + ')' };
  const q = async (sel, where) => {
    const body = {
      version: '1.0.0', cancelQueries: [], modelId: model.id,
      queries: [{ Query: { Commands: [{ SemanticQueryDataShapeCommand: { Query: { Version: 2, From: [{ Name: 't', Entity: cfg.ent, Type: 0 }], Select: sel, ...(where ? { Where: where } : {}) }, Binding: { Primary: { Groupings: [{ Projections: sel.map((_, i) => i) }] }, DataReduction: { DataVolume: 4, Primary: { Window: { Count: WIN } } }, Version: 1 } } }] } }]
    };
    const j = await json(A + '/public/reports/querydata?synchronous=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const rows = dsr(j.results[0].result.data.dsr.DS[0]);
    if (rows.length >= WIN) throw new Error(cfg.ent + ': ผลถึงเพดาน ' + WIN + ' แถว (ข้อมูลอาจไม่ครบ)');
    return rows;
  };
  // 1) รายเดือน (หรือรายปีงบเมื่อไม่มีเดือน) แยกประเภทถ้ามี เฉพาะ 4 อุทยาน  2) ยอดรายปีงบทุกอุทยาน (หาอันดับ/ยอดทั้งประเทศ)
  // ค่าบางแถวมาเป็นข้อความทศนิยม ('4433.7999…') จึงแปลงด้วย Number ก่อนรวม
  const where = [{ Condition: { In: { Expressions: [ce(cfg.park)], Values: Object.values(PARKS).map(p => [{ Literal: { Value: `'${p}'` } }]) } } }];
  const mrows = await q([col(cfg.fy), col(cfg.park), ...(cfg.mon ? [col(cfg.mon)] : []), ...(cfg.kind ? [col(cfg.kind)] : []), sum], where);
  const yrows = await q([col(cfg.fy), col(cfg.park), sum]);
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
  return { meta: { src: cfg.src + ' (Power BI)', url: VIEW, refresh: model.LastRefreshTime || model.lastRefreshTime || null, fys, nat }, parks, rows: mrows.length + yrows.length };
}

(async () => {
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const out = { v: 2, mon: MON, names: PARKS, vis: null, rev: null, veh: null, was: null, parks: Object.fromEntries(Object.keys(PARKS).map(k => [k, {}])) };
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
  if (out.vis || out.rev) {
    const txt = JSON.stringify(out);
    const strip = s => s.replace(/"refresh":"[^"]*",?/g, '');
    if (old && strip(JSON.stringify(old)) === strip(txt)) console.log('tourism: ไม่มีข้อมูลใหม่');
    else { fs.writeFileSync(OUT + '.tmp', txt); fs.renameSync(OUT + '.tmp', OUT); console.log('tourism: บันทึก ' + path.relative(ROOT, OUT) + ' ' + txt.length + ' ไบต์') }
  }
  if (bad) process.exit(1);
})().catch(e => { console.error('tourism: ' + e.message); process.exit(1) });
