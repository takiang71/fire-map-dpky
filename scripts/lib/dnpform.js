// แบบรับแจ้งเหตุไฟป่า กรมอุทยานฯ (Google Forms → ตารางคำตอบ Google Sheets) → แถวการดับไฟป่าของกลุ่มป่า — prefix DF · docs/arch/dnp-form.md
// ผู้ใช้ขอ 19 พ.ย. 69: เจ้าหน้าที่กรอกแบบรับแจ้งเหตุของกรมฯ ที่เดียว แล้วเว็บดึงมาแสดง/วิเคราะห์ (แทนการบันทึกซ้ำในฟอร์มของเว็บ — ฟอร์ม FD ซ่อนแล้ว)
// · อ่านผ่าน gviz (ตารางเปิดให้ทุกคนที่มีลิงก์อ่านได้) เลือกเฉพาะคอลัมน์ที่ไม่ใช่ข้อมูลส่วนบุคคล — อีเมล/ชื่อผู้กรอก/เบอร์โทร ไม่ถูกดาวน์โหลดเลย
// · แต่ละ สบอ. อ่าน 2 แท็บ: แท็บคำตอบดิบ (รายการใหม่เข้าทันที) + แท็บของ สบอ. (ศูนย์ฯ เติมไร่/เวลาเสร็จ/สถานะ/ความรุนแรงภายหลัง) จับคู่ด้วยประทับเวลา+พิกัด
// · เก็บเฉพาะแถวในกลุ่มป่า: พิกัดอยู่ในแนวเขต (where) หรือพื้นที่ป่า/สถานีฯ ในรายการของกลุ่มป่า
const { utmToLL } = require('./tiff');

// แหล่งข้อมูล (ปีงบ 2569 ใช้ต่อในปีงบ 2570 จนกว่ากรมฯ จะเปลี่ยนฟอร์ม — เปลี่ยนที่นี่ที่เดียว แล้วรัน node --test test/)
// sbo = ค่าคอลัมน์ "สำนักบริหารพื้นที่อนุรักษ์" ที่ใช้กรองแท็บคำตอบดิบ (ทั้งภาค)
const DF_SRC = [
  { k: 'สบอ.1', id: '1cxX2nWj7vSSlbG-ehgtz_Emd6hm1f8QP-lW-hh0_X6A', raw: '94843598', tab: '1998515040', sbo: 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)' },
  { k: 'สบอ.7', id: '1xFZlI9VbQt9oMG-uIzxEkgGgEbfDZx2wcfhiT1c0mno', raw: '314274430', tab: '1164016369', sbo: 'สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)' }
];
// คอลัมน์ข้อมูลส่วนบุคคล — ไม่ใส่ใน select ของ gviz (ไม่ดาวน์โหลด)
const PRIV = /อีเมล|email|ผู้กรอก|เบอร์|โทรศัพท์|ชื่อ-?สกุล|ผู้รายงาน/i;
// กลุ่มป่าดงพญาเย็น-เขาใหญ่: พื้นที่ป่าอนุรักษ์ / สถานีฯ (ชื่อในฟอร์มปีงบ 2569)
const AREA = /เขาใหญ่|ทับลาน|ปางสีดา|ตาพระยา|ดงใหญ่|โคกสูง|เขาฉกรรจ์/;
const STAT = /สถานีควบคุมไฟป่า(เขาใหญ่|ทับลาน|ตาพระยา-ปางสีดา|วังน้ำเขียว|ดงใหญ่|นครนายก|ปราจีนบุรี)/;
// เปลี่ยนชื่อสถานีฯ (ผู้ใช้แจ้ง 19 พ.ย. 69) — ชุดเดียวกับ STRN ใน index.html และ scripts/import_fx.js (test/dnpform.test.js ตรวจ)
const STRN = {'สถานีควบคุมไฟป่านครนายก':'สถานีควบคุมไฟป่าเขาใหญ่ (ด้านทิศใต้)','สถานีควบคุมไฟป่าปราจีนบุรี':'สถานีควบคุมไฟป่าทับลาน (ด้านทิศใต้)'};

const col = i => i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26);
const cl = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const nil = v => !v || /^(-|ไม่มี|ไม่ทราบ|undefined)$/.test(v);

function csv(t) {
  const R = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === ',') { r.push(f); f = '' } else if (c === '\n') { r.push(f.replace(/\r$/, '')); R.push(r); r = []; f = '' } else f += c;
  }
  if (f || r.length) { r.push(f); R.push(r) }
  return R;
}
const gviz = (id, gid, tq) => `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}&tq=${encodeURIComponent(tq)}`;

// อ่านแท็บเดียว: หัวตาราง → select เฉพาะคอลัมน์ที่ไม่ใช่ข้อมูลส่วนบุคคล (+ where) → [{หัว: ค่า}]
async function readTab(get, id, gid, where) {
  const H = csv(await get(gviz(id, gid, 'select * limit 0')))[0] || [];
  if (!H.length || !H.some(h => /วันที่และเวลารับแจ้งเหตุ/.test(h))) throw new Error('หัวตารางไม่ใช่แบบรับแจ้งเหตุ (gid ' + gid + ')');
  const keep = H.map((h, i) => [cl(h), i]).filter(([h]) => h && !PRIV.test(h));
  const w = where ? where(n => { const x = keep.find(k => k[0] === n); return x ? col(x[1]) : null }) : '';
  const R = csv(await get(gviz(id, gid, 'select ' + keep.map(k => col(k[1])).join(',') + (w ? ' where ' + w : ''))));
  const hd = (R[0] || []).map(cl);
  if (hd.some(h => PRIV.test(h))) throw new Error('คำตอบมีคอลัมน์ข้อมูลส่วนบุคคล');
  return R.slice(1).filter(r => r.some(v => cl(v))).map(r => { const o = {}; hd.forEach((h, i) => { if (h && !(h in o)) o[h] = cl(r[i]) }); return o });
}

// วันเวลาจาก gviz: "26/4/2026, 20:20:00" (ว/ด/ปี ค.ศ.) · ปี พ.ศ. → ค.ศ. · ปี 20xx ที่เกินจริง (พิมพ์ 69 = 2069) → พ.ศ. 25xx
function dt(s) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s || ''); if (!m) return null;
  let y = +m[3]; if (y > 2400) y -= 543; else if (y > 2035 && y < 2100) y = 2500 + y % 100 - 543;
  const ms = Date.UTC(y, +m[2] - 1, +m[1], +(m[4] || 0) - 7, +(m[5] || 0));
  return isNaN(ms) ? null : { ms, time: m[4] != null };
}
const day = ms => Math.floor((ms + 7 * 36e5) / 864e5), hhmm = ms => { const x = new Date(ms + 7 * 36e5); return x.getUTCHours() * 100 + x.getUTCMinutes() };
const fyOf = d => { const x = new Date(d * 864e5); return x.getUTCFullYear() + 543 + (x.getUTCMonth() >= 9 ? 1 : 0) };
const num = s => { const m = /-?\d+(?:\.\d+)?/.exec(String(s || '').replace(/,/g, '')); return m ? +m[0] : 0 };

// ช่องทางรับแจ้ง (ตัวเลือกฟอร์ม) → ชื่อชุดเดียวกับข้อมูล Excel อส. (fxdata XD.rp) ให้วิเคราะห์ร่วมกันได้
function rpOf(v) {
  v = cl(v).replace(/^\d+\.\s*/, '');
  if (/ดาวเทียม|hotspot|noaa|snpp|viirs|modis/i.test(v)) return 'ดาวเทียม (Hotspot)';
  if (/จุดตรวจ|จุดสกัด|จุดเฝ้าระวัง|หอดูไฟ/.test(v)) return 'ชุดจุดตรวจ/จุดสกัด/จุดเฝ้าระวังไฟป่า';
  if (/ลาดตระเวน/.test(v)) return 'ชุดลาดตระเวนและเฝ้าระวังไฟป่า';
  if (/1362/.test(v)) return 'สายด่วนพิทักษ์ป่า 1362';
  if (/อส\.?อส|เครือข่าย/.test(v)) return 'เครือข่ายไฟป่าและหมอกควัน (อส.อส)';
  if (/ประชาชน|ชาวบ้าน/.test(v)) return 'ชาวบ้านในพื้นที่';
  if (/ผู้นำชุมชน|กำนัน|ผู้ใหญ่บ้าน/.test(v)) return 'ผู้นำชุมชน (กำนัน ผู้ใหญ่บ้าน)';
  if (/อากาศยาน|เฮลิคอปเตอร์|เครื่องบิน/.test(v)) return 'อากาศยาน (เครื่องบิน/เฮลิคอปเตอร์)';
  return v || 'ไม่ระบุ';
}
// สาเหตุ (ตัวเลือกฟอร์ม + ช่องอื่นๆ พิมพ์เอง) → [ชื่อชุดเดียวกับข้อมูล Excel อส. (fxdata XD.cs), รายละเอียด]
// ตรวจกับ Excel ปีงบ 2569 (ชุดเดียวกับตารางนี้ 153 แถว, 19 พ.ย. 69): ไม่ทราบ/ไม่ → ไม่ทราบสาเหตุ · ข้อความเรื่องฝึกยิงปืน → ฝึกซ้อมยิงปืนของทหาร · ไฟจากกัมพูชา → ไฟข้ามเขต
const CSF = ['เผาไร่', 'เก็บหาของป่า', 'ล่าสัตว์', 'เลี้ยงปศุสัตว์', 'นักท่องเที่ยวและผู้สัญจร', 'ความขัดแย้ง (แกล้งจุด,ขัดผลประโยชน์)', 'พื้นที่จัดการเชื้อเพลิง (ชิงเผา)', 'เผาขยะ', 'ลุกลามจากที่ทำกินชาวบ้าน', 'ลุกลามจากเขตป่าสงวนแห่งชาติ', 'ลักลอบจุด', 'ไม่ทราบสาเหตุ'];
function csOf(v) {
  v = cl(v);
  if (!v || /^(ไม่|ไม่ทราบ|ไม่ทราบสาเหตุ|ไม่ระบุ|-)$/.test(v)) return ['ไม่ทราบสาเหตุ', ''];
  if (CSF.includes(v)) return [v, ''];
  if (/ลักลอบทำไม้/.test(v)) return ['ลักลอบทำไม้', ''];
  if (/^อุบัติเหตุ/.test(v)) return ['อุบัติเหตุ/ประมาท/เลินเล่อ', ''];
  if (/^คึกคะนอง/.test(v)) return ['คึกคะนอง/จุดเล่น', ''];
  if (/ฝึกซ้อมยิงปืน|ฝึกยิงปืน/.test(v)) return ['ฝึกซ้อมยิงปืนของทหาร', v.slice(0, 300)];
  if (/ไฟข้ามเขต|ประเทศเพื่อนบ้าน|กัมพูชา|ลาว/.test(v)) return ['ไฟข้ามเขตจากประเทศเพื่อนบ้าน', v.slice(0, 300)];
  return v.length <= 40 ? [v, ''] : ['สาเหตุอื่นๆ', v.slice(0, 300)];
}
// พื้นที่ป่าตามรายงาน → ชื่อชุดเดียวกับ import_fx.js forest()
function frOf(o) {
  const t = cl(o['พื้นที่เกิดไฟป่า']), c = cl(o['พื้นที่ป่าอนุรักษ์']), s = cl(o['พื้นที่ป่าสงวนแห่งชาติ']);
  let v = /อนุรักษ์/.test(t) && !nil(c) && c !== 'อื่นๆ' ? c : /สงวน/.test(t) && !nil(s) && s !== 'อื่นๆ' ? s : /นอกพื้นที่/.test(t) ? 'นอกพื้นที่ป่าอนุรักษ์' : (!nil(c) && c !== 'อื่นๆ' ? c : t || 'ไม่ระบุ');
  return v.replace(/^เตรียมการ(เขตห้ามล่าสัตว์ป่า)(?:ป่า)?(.+)$/, '$1$2 (เตรียมการ)');
}
// ผู้ดำเนินการ: สถานีฯ ในฟอร์ม (เปลี่ยนชื่อตาม STRN) · "อื่นๆ" = สถานีฯ/อุทยานฯ ในช่องหน่วยงานที่ร่วมบูรณาการ → อุทยานฯ ตามพื้นที่ป่า (กติกาเดียวกับ import_fx oper) → สถานีฯ ตามแนวเขต
function stOf(o, fr, w) {
  const s = cl(o['สถานีฯที่เข้าดับไฟ']), u = cl(o['หน่วยงานที่ร่วมบูรณาการ']);
  if (/^สถานีควบคุมไฟป่า/.test(s)) return STRN[s] || s;
  const m = /สถานีควบคุมไฟป่า?\s*([ก-๙]+(?:-[ก-๙]+)?)(\s*\(ด้านทิศ[ก-๙]+\))?/.exec(u);
  if (m) { const x = 'สถานีควบคุมไฟป่า' + m[1] + (m[2] ? ' ' + m[2].trim() : ''); return STRN[x] || x }
  const p = /(?:อุทยานแห่งชาติ|อช\.)\s*(ตาพระยา|ทับลาน|ปางสีดา|เขาใหญ่)/.exec(u) || /^อุทยานแห่งชาติ(ตาพระยา|ทับลาน|ปางสีดา|เขาใหญ่)/.exec(fr);
  if (p) return 'อุทยานแห่งชาติ' + p[1];
  if (/ดงใหญ่/.test(fr)) return 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่';
  return w && w.st && w.st !== 'ไม่มี' ? w.st : 'ไม่ระบุ';
}

const keyOf = o => [cl(o['ประทับเวลา']), cl(o['พิกัด X']), cl(o['พิกัด Y'])].join('|');

// แถวดิบ (แท็บคำตอบ + ค่าที่ศูนย์ฯ เติมในแท็บ สบอ.) → แถวการดับไฟ หรือ null (นอกกลุ่มป่า/วันที่ใช้ไม่ได้)
// ctx: { where(lo,la), adm(lo,la) → {t,a,p}, SBP }
function rowOf(o, sbo, ctx) {
  const ts = dt(o['ประทับเวลา']); let a = dt(o['วันที่และเวลารับแจ้งเหตุ']), bad = 0;
  if (!a || (ts && (a.ms > ts.ms + 864e5 || a.ms < ts.ms - 400 * 864e5))) { if (!ts) return null; a = ts; bad = 1 }  /* วันที่รับแจ้งผิดรูป/หลังเวลาส่ง/ก่อนส่งเกินปี = ใช้เวลาส่งแทน */
  const E = num(o['พิกัด X']), N = num(o['พิกัด Y']), z0 = num(o['Zone']), z = z0 === 47 || z0 === 48 ? z0 : E > 500000 ? 47 : 48;
  let lo = 0, la = 0, xy = 2;
  if (E >= 150000 && E <= 950000 && N >= 1450000 && N <= 1700000) { [lo, la] = utmToLL(E, N, z); xy = 0 }
  const w = xy === 0 ? ctx.where(lo, la) : null, fr = frOf(o), st = stOf(o, fr, w);
  if (!w && !AREA.test(fr) && !STAT.test(cl(o['สถานีฯที่เข้าดับไฟ']))) return null;
  const ad = xy === 0 && ctx.adm ? ctx.adm(lo, la) : null;
  const pv = ad ? ad.p : cl(o['จังหวัด']) || 'ไม่ระบุ', am = ad ? ad.a : cl(o['อำเภอ']).replace(/^อ(?:ำเภอ|\.)\s*/, '') || 'ไม่ระบุ', tm = ad ? ad.t : cl(o['ตำบล']).replace(/^ต(?:ำบล|\.)\s*/, '') || 'ไม่ระบุ';
  const fin = dt(o['วันเวลาที่ดำเนินการเสร็จ']); let du = fin && a.time ? Math.round((fin.ms - a.ms) / 6e4) : null; if (du != null && (du < 0 || du > 7 * 1440)) du = null;
  const hsv = cl(o['จุดที่ตรวจพบไฟ']), crew = num(o['จำนวนผู้ปฏิบัติงานทั้งหมด (นาย)']), un = cl(o['หน่วยงานที่ร่วมบูรณาการ']);
  const d = day(a.ms), cs = csOf(o['สาเหตุการเกิดไฟป่า']);
  return {
    d, t: a.time ? hhmm(a.ms) : -1, fy: fyOf(d), la: +la.toFixed(5), lo: +lo.toFixed(5), xy, E: Math.round(E) || 0, N: Math.round(N) || 0, z,
    pv, am, tm, ar: w ? w.ar : xy === 2 ? 'ไม่ทราบ (พิกัดใช้ไม่ได้)' : 'นอกพื้นที่อนุรักษ์', st, sb: (ctx.SBP && ctx.SBP[pv]) || (w && w.sb) || sbo,
    rai: num(o['ประมาณพื้นที่ไฟไหม้ (ไร่)']), cs: cs[0], cd: cs[1], rp: rpOf(o['ตรวจพบไฟจาก']), fr,
    te: fin ? hhmm(fin.ms) : -1, du, hs: /^ตรง/.test(hsv) ? 0 : /^ไม่ตรง/.test(hsv) ? 1 : 2,
    moo: nil(cl(o['หมู่ที่'])) ? '' : cl(o['หมู่ที่']), pl: nil(cl(o['หมู่บ้าน/บริเวณ'])) ? '' : cl(o['หมู่บ้าน/บริเวณ']),
    op: [crew ? crew + ' คน' : '', nil(un) ? '' : un].filter(Boolean).join(' · '),
    sev: cl(o['ระดับความรุนแรงของไฟ']), sts: cl(o['สถานะของไฟป่า']), grp: cl(o['ประเภทกลุ่มไฟ']), ft: cl(o['ชนิดป่า']),
    hid: nil(cl(o['ID (Hotspot)'])) ? '' : cl(o['ID (Hotspot)']), src: sbo === DF_SRC[1].sbo ? 'สบอ.7' : 'สบอ.1', ...(bad ? { bad } : {})
  };
}

// ดึงทุกแหล่ง → { generated, src, sheets:[{k,raw,tab,n,err}], rows }
// get(url) → ข้อความ (ทดสอบส่งตัวจำลองได้) · แท็บ สบอ. อ่านไม่ได้ = ยังใช้แท็บดิบ (ไม่มีไร่/เวลาเสร็จ) · แท็บดิบอ่านไม่ได้ = ใช้แท็บ สบอ. อย่างเดียว
async function dnpForm(get, ctx, src = DF_SRC) {
  const rows = [], sheets = [];
  for (const s of src) {
    const info = { k: s.k, raw: 0, tab: 0, n: 0 }, byS = w => { const c = w('สำนักบริหารพื้นที่อนุรักษ์'); return c ? `${c} = '${s.sbo.replace(/'/g, "\\'")}'` : '' };
    let R = null, T = null;
    try { R = await readTab(get, s.id, s.raw, byS); info.raw = R.length } catch (e) { info.err = 'แท็บคำตอบ: ' + e.message }
    try { T = await readTab(get, s.id, s.tab); info.tab = T.length } catch (e) { info.err = (info.err ? info.err + ' · ' : '') + 'แท็บ ' + s.k + ': ' + e.message }
    if (!R && !T) { sheets.push(info); continue }
    const M = new Map(); for (const o of T || []) M.set(keyOf(o), o);
    const L = R ? R.map(o => Object.assign({}, o, M.get(keyOf(o)) || {})) : T;
    if (R && T) { const seen = new Set(R.map(keyOf)); for (const o of T) if (!seen.has(keyOf(o))) L.push(o) }  /* แถวที่ศูนย์ฯ เพิ่มในแท็บ สบอ. เอง */
    for (const o of L) { const r = rowOf(o, s.sbo, ctx); if (r) { rows.push(r); info.n++ } }
    sheets.push(info);
  }
  rows.sort((a, b) => a.d - b.d || a.t - b.t);
  return { generated: new Date().toISOString(), src: 'sheet', sheets, rows };
}

module.exports = { DF_SRC, PRIV, STRN, csv, readTab, dt, rowOf, rpOf, csOf, frOf, stOf, dnpForm, gviz, col };
