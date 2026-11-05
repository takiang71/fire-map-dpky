// เงินรายได้อุทยานแห่งชาติรายเดือน จากรายงาน Power BI สาธารณะ "ระบบรายงานการจัดเก็บเงินรายได้อุทยานแห่งชาติ"
// (ผู้ใช้ขอ 5 พ.ย. 69) → data/income.json เฉพาะ 4 อุทยานในกลุ่มป่า + ยอดรวมทั้งประเทศ/อันดับรายปีงบ
// รายงานเผยแพร่แบบ Publish to web — อ่านผ่าน querydata ที่หน้ารายงานใช้เอง (ไม่ต้องล็อกอิน/คีย์ แต่ไม่ใช่ API ทางการ:
// ถ้า Microsoft เปลี่ยนรูปแบบหรือเจ้าของปิดการเผยแพร่ สคริปต์จะล้มและคงไฟล์เดิมไว้)
// node scripts/sync_income.js   (เขียนไฟล์เฉพาะเมื่อข้อมูลเปลี่ยน)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'income.json');
const R = 'eyJrIjoiNDcwMmI2ZGItZThkMi00ZmExLWJhZjEtYWJiNGFhODU3NzM0IiwidCI6ImVjOGI5MWM3LTMxMDctNGU5Zi1iMzRmLTY3MmRkZmE5Y2NlMSIsImMiOjEwfQ==';
const { k: KEY, t: TENANT } = JSON.parse(Buffer.from(R, 'base64').toString());
const VIEW = 'https://app.powerbi.com/view?r=' + encodeURIComponent(R);
const FALLBACK = 'https://wabi-south-east-asia-b-primary-redirect.analysis.windows.net/';
// รหัสในหน้าความสำคัญ (KB) ← ชื่อในรายงาน
const PARKS = { ky: 'เขาใหญ่', tl: 'ทับลาน', ps: 'ปางสีดา', tp: 'ตาพระยา' };
// ลำดับเดือนในปีงบ ต.ค. → ก.ย.
const MON = ['ตุลาคม', 'พฤศจิกายน', 'ธันวาคม', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน'];

const H = { 'X-PowerBI-ResourceKey': KEY };
// แปลงชื่อคลัสเตอร์ -redirect → -api ตามที่หน้ารายงานทำ (getAPIMUrl)
const apim = u => { const x = new URL(u); const h = x.hostname.split('.'); h[0] = h[0].replace('-redirect', '').replace('global-', '') + '-api'; return x.protocol + '//' + h.join('.') };
async function json(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { ...H, ...(opt.headers || {}) }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(url.replace(/\?.*/, '') + ' → HTTP ' + r.status);
  return r.json();
}

async function api() {
  let c = FALLBACK;
  try { const h = await (await fetch(VIEW, { signal: AbortSignal.timeout(30000) })).text(); const m = h.match(/resolvedClusterUri = '([^']+)'/); if (m) c = m[1] } catch { }
  try { const r = await json(apim(c) + '/public/routing/cluster/' + TENANT); if (r.FixedClusterUri) c = r.FixedClusterUri } catch { }
  return apim(c);
}

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

(async () => {
  const A = await api();
  const mx = await json(A + `/public/reports/${KEY}/modelsAndExploration?preferReadOnlySession=true`);
  const model = mx.models[0];
  const col = p => ({ Column: { Expression: { SourceRef: { Source: 'i' } }, Property: p }, Name: 'Income.' + p });
  const sel = [col('ปีงบประมาณ'), col('ชื่ออุทยานแห่งชาติ'), col('เดือน'),
    { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: 'i' } }, Property: 'เงินรายได้' } }, Function: 0 }, Name: 'Sum(Income.เงินรายได้)' }];
  const WIN = 100000;
  const body = {
    version: '1.0.0', cancelQueries: [], modelId: model.id,
    queries: [{ Query: { Commands: [{ SemanticQueryDataShapeCommand: { Query: { Version: 2, From: [{ Name: 'i', Entity: 'Income', Type: 0 }], Select: sel }, Binding: { Primary: { Groupings: [{ Projections: [0, 1, 2, 3] }] }, DataReduction: { DataVolume: 4, Primary: { Window: { Count: WIN } } }, Version: 1 } } }] } }]
  };
  const q = await json(A + '/public/reports/querydata?synchronous=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ds = q.results[0].result.data.dsr.DS[0];
  const rows = dsr(ds);
  if (rows.length >= WIN) throw new Error('ข้อมูลเกินหน้าต่าง ' + WIN + ' แถว');
  // รวม: ยอดรายเดือนต่ออุทยาน และยอดรายปีงบต่ออุทยาน (ใช้หาอันดับ)
  const by = {}, tot = {};
  for (const [fy, p, m, v] of rows) {
    const mi = MON.indexOf(m); if (!fy || !p || mi < 0) continue;
    ((by[p] ??= {})[fy] ??= Array(12).fill(0))[mi] += Math.round(v || 0);
    (tot[fy] ??= {})[p] = (tot[fy][p] || 0) + (v || 0);
  }
  for (const n of Object.values(PARKS)) if (!by[n]) throw new Error('ไม่พบอุทยาน ' + n + ' ในรายงาน');
  const fys = Object.keys(tot).sort();
  const nat = {}; for (const fy of fys) { const v = Object.values(tot[fy]); nat[fy] = { sum: Math.round(v.reduce((a, b) => a + b, 0)), n: v.filter(x => x > 0).length } }
  const parks = {};
  for (const [id, n] of Object.entries(PARKS)) {
    const rk = {};
    for (const fy of fys) { const v = tot[fy][n] || 0; if (v > 0) rk[fy] = 1 + Object.values(tot[fy]).filter(x => x > v).length }
    parks[id] = { n, fy: by[n], rk };
  }
  const out = {
    v: 1, src: 'ระบบรายงานการจัดเก็บเงินรายได้อุทยานแห่งชาติ (Power BI)', url: VIEW,
    refresh: model.LastRefreshTime || model.lastRefreshTime || null, // เวลา UTC ที่ต้นทางรีเฟรชข้อมูล
    mon: MON, fys, nat, parks
  };
  const txt = JSON.stringify(out);
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const strip = s => s.replace(/"refresh":"[^"]*",?/, '');
  if (old && strip(old) === strip(txt)) { console.log('income: ไม่มีข้อมูลใหม่ (รีเฟรชต้นทาง ' + out.refresh + ')'); return }
  fs.writeFileSync(OUT + '.tmp', txt); fs.renameSync(OUT + '.tmp', OUT);
  const last = fys[fys.length - 1];
  console.log(`income: ${rows.length} แถว ${Object.keys(tot[last] || {}).length} อุทยาน ปีงบ ${fys[0]}–${last} · ` +
    Object.values(parks).map(p => p.n + ' ' + (p.fy[last] || []).reduce((a, b) => a + b, 0).toLocaleString()).join(' / '));
})().catch(e => { console.error('income: ' + e.message); process.exit(1) });
