// Cloudflare Worker (ฟรี) รับ webhook ของ LINE bot แล้วตอบกลับในกลุ่ม — ข้อความตอบกลับ (reply) ไม่นับโควตา
// งานหนัก (ดึง API ทั้งประเทศ กรองแนวเขต แจ้งเตือน push) อยู่บน GitHub Actions (scripts/line_notify.js) เพราะ Worker ฟรีจำกัด CPU 10 ms
// ที่นี่อ่านแค่ไฟล์เล็กที่เว็บเผยแพร่ไว้: live.json (จุด 48 ชม. ในแนวเขต) + summary.json (ยอดสะสมปีงบรายพื้นที่/รายเดือน)
// ตั้งค่าใน Cloudflare: Secrets LINE_SECRET (Channel secret), LINE_TOKEN (Channel access token) · Variable SITE_URL (ไม่ใส่ = เว็บหลัก)
// คำสั่งในกลุ่ม: "สรุป" · "ช่วยเหลือ" · "รหัสกลุ่ม" (ใช้ตอนติดตั้ง) — บอทจะตอบเฉพาะข้อความที่ขึ้นต้นด้วยคำสั่ง ไม่ตอบแชตทั่วไป
// carousel() ใช้ร่วมกับ scripts/line_notify.js (import ไฟล์นี้) — ข้อความแจ้งเตือนและคำตอบ "สรุป" จึงหน้าตาเดียวกัน
const SITE0 = 'https://takiang71.github.io/fire-map-dpky/';
const SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const thMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00');
const tTh = ms => new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }) + ' น.';
const hm = ms => new Date(ms + 7 * 36e5).toISOString().slice(11, 16);
const dTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });

// ไม่แจ้งเตือน/ไม่นับ เขตรักษาพันธุ์สัตว์ป่าดงใหญ่ และพื้นที่รับผิดชอบสถานีฯ ดงใหญ่ (ผู้ใช้กำหนด 28 ต.ค. 69)
export const EX = /ดงใหญ่/;
export const excluded = p => EX.test(p._ar || '') || EX.test(p._st || '');
// การ์ด 2–7: 6 พื้นที่อนุรักษ์ (การ์ด 1 ภาพรวม มีไทล์จังหวัด/อำเภอ/ตำบลสูงสุด) (ชื่อตาม where() ใน scripts/lib/area.js)
const AREAS = [
  { k: 'อุทยานแห่งชาติเขาใหญ่', s: 'อช.เขาใหญ่', c: '#2E7D32' },
  { k: 'อุทยานแห่งชาติทับลาน', s: 'อช.ทับลาน', c: '#1565C0' },
  { k: 'อุทยานแห่งชาติปางสีดา', s: 'อช.ปางสีดา', c: '#00838F' },
  { k: 'อุทยานแห่งชาติตาพระยา', s: 'อช.ตาพระยา', c: '#6A1B9A' },
  { k: 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)', s: 'ขห.เขาฉกรรจ์', c: '#E65100', n: 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมประกาศ)' },
  { k: 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมการ)', s: 'ขห.โคกสูง', c: '#AD1457', n: 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมประกาศ)' },
];
const OUT = 'นอกพื้นที่อนุรักษ์', RED = '#D93A1F', BLUE = '#3E6FD8', MUT = '#8A8F98';

// --- ส่วนประกอบ Flex ---
// span ใน LINE ไม่รับ size จากข้อความแม่ (ตกไปเป็น md) → ใส่ size ของข้อความแม่ให้ทุก span ที่ไม่ได้ระบุเอง
const T = (text, o = {}) => ({ type: 'text', text: String(text), ...o, ...(o.contents ? { contents: o.contents.map(sp => sp.size || !o.size ? sp : { ...sp, size: o.size }) } : {}) });
const B = (layout, contents, o = {}) => ({ type: 'box', layout, contents, ...o });
const dPct = (c, p) => !p ? (c ? ['▲ ใหม่', RED] : ['–', MUT]) : c === p ? ['= เท่าเดิม', MUT] : [`${c > p ? '▲' : '▼'} ${Math.abs(Math.round((c - p) / p * 100))}%`, c > p ? RED : '#2E7D32'];
// ไทล์ตัวเลข (กระชับ: ตัวเลข lg, ระยะขอบ 4px — ผู้ใช้ขอให้การ์ดสั้นพอเห็นเต็มจอมือถือ)
const tile = (v, l, color = '#222222') => B('vertical', [T(v, { size: 'lg', weight: 'bold', align: 'center', color }), T(l, { size: 'xxs', align: 'center', color: MUT, wrap: true })],
  { flex: 1, backgroundColor: '#F5F6F8', cornerRadius: 'md', paddingAll: '4px' });
// หัวข้อย่อยพร้อมคำอธิบายสีในบรรทัดเดียว
const sub = (txt, keys = []) => T('x', { size: 'xxs', margin: 'md', contents: [{ type: 'span', text: txt + '  ', weight: 'bold', color: '#444444' }, ...keys.flatMap(([c, l]) => [{ type: 'span', text: '■', color: c }, { type: 'span', text: ' ' + l + '  ', color: MUT }])] });
// กราฟแท่งรายเดือน ต.ค.–ก.ย. ปีนี้ (สีพื้นที่/แดง) เทียบปีก่อน (น้ำเงิน) · pm = null แสดงเฉพาะปีนี้ (การ์ดรายพื้นที่)
// แท่งเรียงในกล่องเดียว (ไม่ห่อรายเดือน) และไม่ใส่คุณสมบัติเกินจำเป็น เพื่อให้ JSON ทั้ง carousel ไม่เกิน 50 KB
function months(m, pm, c = RED, H = 28) {
  const mx = Math.max(1, ...m, ...(pm || [])), bar = (v, col, g) => B('vertical', [], { height: (v ? Math.max(2, Math.round(v / mx * H)) : 1) + 'px', backgroundColor: v ? col : '#DADDE2', ...(g ? { margin: 'xs' } : {}) });
  return [
    B('horizontal', m.flatMap((v, i) => pm ? [bar(v, c, i > 0), bar(pm[i], BLUE)] : [bar(v, c, i > 0)]), { alignItems: 'flex-end', height: H + 'px', margin: 'xs' }),
    B('horizontal', ['ต.ค.', 'ม.ค.', 'เม.ย.', 'ก.ค.'].map(x => T(x, { size: 'xxs', color: MUT }))),
  ];
}
const hbar = (v, mx, c) => B('vertical', v ? [B('vertical', [], { width: Math.max(4, Math.round(v / mx * 100)) + '%', height: '6px', backgroundColor: c })] : [], { height: '6px', backgroundColor: '#EEF0F3' });
// จุดละ 1 บรรทัด แตะเพื่อเปิด Google Maps
const ptRow = f => {
  const p = f.properties, [lo, la] = f.geometry.coordinates, t = thMs(p.full_date);
  return T('x', { size: 'xxs', margin: 'sm', contents: [{ type: 'span', text: `${hm(t)} ${dTh(t)} `, weight: 'bold', color: '#222222' }, { type: 'span', text: `${SATN[satKey(p.satellite_name)] || p.satellite_name} · ต.${p.subdistrict_name_th || '-'} อ.${p.district_name_th || '-'}`, color: MUT }],
    action: { type: 'uri', label: 'แผนที่', uri: `https://maps.google.com/?q=${la.toFixed(5)},${lo.toFixed(5)}` } });
};
// อันดับสูงสุดจากตัวนับ {ชื่อ: จำนวน} · ชื่อ อำเภอ = "อำเภอ|จังหวัด", ตำบล = "ตำบล|อำเภอ|จังหวัด"
const topN = (o, n) => Object.entries(o || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th')).slice(0, n);
const LV = { pv: ['จังหวัด', k => 'จ.' + k], am: ['อำเภอ', k => { const [a, p] = k.split('|'); return `อ.${a} จ.${p}` }], tm: ['ตำบล', k => { const [t, a, p] = k.split('|'); return `ต.${t} อ.${a} จ.${p}` }] };
const mergeCnt = (to, from) => { for (const k in from || {}) to[k] = (to[k] || 0) + from[k] };
const dateTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
const footer = site => B('vertical', [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดแผนที่', uri: site } }], { paddingAll: '0px' });

// live = live.json, sum = summary.json, fresh = จุดใหม่ที่จะแจ้งเตือน (null = โหมดสรุป แสดงจุด 24 ชม. แทน)
// LINE จำกัด JSON ของ carousel ไม่เกิน 50 KB → ถ้าเกิน 48,000 ไบต์ (UTF-8: อักษรไทยตัวละ 3 ไบต์) ลดจำนวนจุดที่แสดงต่อการ์ดลง
export const bytes = m => new TextEncoder().encode(JSON.stringify(m)).length;
export function carousel(o) {
  let m;
  for (const per of [4, 2, 1, 0]) { m = build({ ...o, per }); if (bytes(m) < 48000) break }
  return m;
}
// daily = สรุปประจำวันที่ line_notify.js push เข้ากลุ่ม (เปลี่ยนแค่หัวการ์ดและ altText)
function build({ live, sum, fresh = null, site = SITE0, now = Date.now(), quotaLeft = null, per = 4, test = false, daily = false }) {
  const alert = !!fresh;
  const pts = (live && live.features || []).filter(f => f.properties && !excluded(f.properties)), h24 = pts.filter(f => now - thMs(f.properties.full_date) < 24 * 36e5);
  const nw = (fresh || []).filter(f => !excluded(f.properties)), list = alert ? nw : h24;
  const A = Object.entries(sum && sum.areas || {}).filter(([k]) => !EX.test(k)), z = () => ({ fy: 0, prv: 0, pfull: 0, m: Array(12).fill(0), pm: Array(12).fill(0), pv: {}, am: {}, tm: {} });
  const sumOf = rows => rows.reduce((o, [, v]) => { o.fy += v.fy; o.prv += v.prv; o.pfull += v.pfull; v.m.forEach((x, i) => { o.m[i] += x; o.pm[i] += v.pm[i] }); for (const l in LV) mergeCnt(o[l], v[l]); return o }, z());
  const all = sumOf(A), of = k => (A.find(([x]) => x === k) || [, z()])[1], out = sumOf(A.filter(([k]) => k.startsWith(OUT)));
  const fy = sum ? sum.fy : '', ind = sum ? sum.ind : '', [dt, dc] = dPct(all.fy, all.prv);
  const inA = (L, k) => L.filter(f => f.properties._ar === k);

  // การ์ดที่ 1: ภาพรวมทั้งปี (กระชับให้เห็นเต็มจอมือถือ — ผู้ใช้ทดสอบบน Galaxy S25 Ultra แล้วยาวเกินจอ)
  const rows = [...AREAS.map(a => [a.s, of(a.k), a.c]), ...(out.fy || out.prv ? [['นอกเขตอนุรักษ์', out, '#9E9E9E']] : [])], mx = Math.max(1, ...rows.flatMap(r => [r[1].fy, r[1].prv]));
  const head = (title, color) => B('vertical', [
    T(title, { color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true }),
    T(`สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี) · ${dateTh(now)} ${hm(now)} น.`, { color: '#FFFFFFDD', size: 'xxs', wrap: true }),
  ], { backgroundColor: color, paddingAll: '10px' });
  const banner = txt => B('vertical', [T(txt, { color: '#FFFFFF', weight: 'bold', size: 'xs', wrap: true })], { backgroundColor: RED, cornerRadius: 'md', paddingAll: '6px' });
  // ไทล์ จังหวัด/อำเภอ/ตำบล ที่พบจุดสูงสุด (สะสมปีงบ) — รูปแบบเดียวกับไทล์ตัวเลขด้านบน (ผู้ใช้ขอ)
  const topTile = l => { const [x] = topN(all[l], 1);
    return B('vertical', [T(x ? x[0].split('|')[0] : '–', { size: 'sm', weight: 'bold', align: 'center', color: x ? '#B3261E' : MUT, wrap: true }), T(LV[l][0] + 'สูงสุด' + (x ? ` ${x[1]}` : ''), { size: 'xxs', align: 'center', color: MUT })],
      { flex: 1, backgroundColor: '#F5F6F8', cornerRadius: 'md', paddingAll: '4px', justifyContent: 'center' }) };
  const nwBy = AREAS.map(a => [a.s, inA(nw, a.k).length]).filter(x => x[1]).map(x => `${x[0]} ${x[1]}`).concat(inA(nw, OUT).length ? [`นอกเขตฯ ${inA(nw, OUT).length}`] : []).join(' · ');
  const overview = {
    type: 'bubble', size: 'mega',
    header: head(`🔥 ${daily ? 'สรุปประจำวัน' : 'สถานการณ์ไฟป่า'} ปีงบ ${fy}`, '#B3261E'),
    body: B('vertical', [
      ...(alert ? [banner(`${test ? '🧪 ทดสอบ · ' : ''}พบจุดใหม่ ${nw.length} จุด${nwBy ? ': ' + nwBy : ''}`)] : []),
      B('baseline', [T('สะสมปีงบ', { size: 'xs', color: MUT, flex: 0 }), T(String(all.fy), { size: 'xxl', weight: 'bold', color: RED, flex: 0, margin: 'sm' }), T('จุด', { size: 'xs', color: MUT, flex: 0, margin: 'sm' }),
        T(dt, { size: 'xs', weight: 'bold', color: dc, flex: 0, margin: 'md' }), T(`เทียบ ${fy - 1} (${all.prv})`, { size: 'xxs', color: MUT, margin: 'sm' })], { margin: alert ? 'sm' : 'none' }),
      B('horizontal', [tile(h24.length, 'จุดใน 24 ชม.'), tile(all.pfull, `ทั้งปีงบ ${fy - 1}`, BLUE), tile(ind.replace('Suomi ', ''), 'ดาวเทียมตัวชี้วัด', '#444444')], { spacing: 'sm', margin: 'sm' }),
      B('horizontal', [topTile('pv'), topTile('am'), topTile('tm')], { spacing: 'sm', margin: 'sm' }),
      sub('รายพื้นที่ (สะสมปีงบ)', [[RED, String(fy)], [BLUE, `${fy - 1} ช่วงเดียวกัน`]]),
      ...rows.map(([n, v, c]) => { const [t, tc] = dPct(v.fy, v.prv);
        return B('horizontal', [
          T(n, { size: 'xxs', color: '#333333', flex: 5 }),
          B('vertical', [hbar(v.fy, mx, c)], { flex: 4 }),
          T(String(v.fy), { size: 'xxs', weight: 'bold', align: 'end', flex: 2 }),
          T(String(v.prv), { size: 'xxs', color: BLUE, align: 'end', flex: 2 }),
          T(t, { size: 'xxs', weight: 'bold', color: tc, align: 'end', flex: 3 }),
        ], { alignItems: 'center', margin: 'xs', spacing: 'sm' }) }),
      B('horizontal', [T('รวม', { flex: 9, weight: 'bold' }), T(String(all.fy), { flex: 2, align: 'end', weight: 'bold', color: RED }), T(String(all.prv), { flex: 2, align: 'end', weight: 'bold', color: BLUE }), T(dt, { flex: 3, align: 'end', weight: 'bold', color: dc })].map(x => ({ ...x, size: 'xxs' })), { margin: 'sm', spacing: 'sm' }),
      sub('รายเดือน', [[RED, String(fy)], [BLUE, String(fy - 1)]]),
      ...months(all.m, all.pm),
      T(`ไม่รวม ขสป.ดงใหญ่ · ปีก่อนไม่รวมจุดจัดการเชื้อเพลิง/ไม่พบไฟ${fy === 2570 ? ' · ตั้งแต่ 2 พ.ย. 69 ตัวชี้วัดใช้ NOAA-20 แทน SNPP (ปีก่อน = SNPP)' : ''}${quotaLeft != null ? ` · แจ้งเตือนได้อีก ~${quotaLeft} ครั้ง` : ''}`, { size: 'xxs', color: MUT, margin: 'sm', wrap: true }),
    ], { paddingAll: '10px' }),
    footer: footer(site),
  };

  // การ์ดที่ 2–7: รายพื้นที่อนุรักษ์ (โหมดแจ้งเตือน: พื้นที่ที่มีจุดใหม่ขึ้นก่อน)
  const order = AREAS.map((a, i) => ({ a, i, n: inA(nw, a.k).length })).sort((x, y) => alert ? y.n - x.n || x.i - y.i : x.i - y.i);
  const cards = order.map(({ a }) => {
    const v = of(a.k), L = inA(list, a.k).sort((x, y) => thMs(y.properties.full_date) - thMs(x.properties.full_date)), n24 = inA(h24, a.k).length, [t, c] = dPct(v.fy, v.prv);
    return {
      type: 'bubble', size: 'mega',
      header: B('vertical', [T(a.s, { color: '#FFFFFF', size: 'md', weight: 'bold' }), T(a.n || a.k, { color: '#FFFFFFCC', size: 'xxs' })], { backgroundColor: a.c, paddingAll: '10px' }),
      body: B('vertical', [
        ...(alert && L.length ? [banner(`🔥 พบจุดใหม่ ${L.length} จุด`)] : []),
        B('horizontal', [tile(n24, 'จุดใน 24 ชม.', n24 ? RED : '#222222'), tile(v.fy, `สะสมปีงบ ${fy}`), tile(v.prv, `${fy - 1} ช่วงเดียวกัน`, BLUE)], { spacing: 'sm', margin: alert && L.length ? 'sm' : 'none' }),
        T('x', { size: 'xxs', margin: 'sm', wrap: true, contents: [{ type: 'span', text: t + ' ', color: c, weight: 'bold' }, { type: 'span', text: `เทียบปีงบก่อนช่วงเดียวกัน · ทั้งปีงบ ${fy - 1} = ${v.pfull} จุด`, color: MUT }] }),
        sub('รายเดือน', [[a.c, `ปีงบ ${fy}`]]),
        ...months(v.m, null, a.c, 24),
        sub(alert ? 'จุดใหม่รอบนี้ (แตะเพื่อเปิดแผนที่)' : 'จุดใน 24 ชม. (แตะเพื่อเปิดแผนที่)'),
        ...(L.length ? L.slice(0, per).map(ptRow) : [T(alert ? 'ไม่มีจุดใหม่ในพื้นที่นี้รอบนี้' : 'ไม่พบจุดความร้อนใน 24 ชม.', { size: 'xxs', color: '#2E7D32', margin: 'sm' })]),
        ...(L.length > per ? [T(`…และอีก ${L.length - per} จุด`, { size: 'xxs', color: MUT })] : []),
      ], { paddingAll: '10px' }),
      footer: footer(site),
    };
  });

  const altText = ((test ? '[ทดสอบ] ' : '') + (alert
    ? `🔥 พบจุดความร้อนใหม่ ${nw.length} จุด ` + AREAS.map(a => [a.s, inA(nw, a.k).length]).filter(x => x[1]).map(x => `${x[0]} ${x[1]}`).join(', ')
    : `${daily ? '📋 สรุปประจำวัน ' + dateTh(now) + ' · ' : ''}สรุปจุดความร้อน ปีงบ ${fy}: สะสม ${all.fy} จุด · 24 ชม. ${h24.length} จุด`)).slice(0, 390);
  return { type: 'flex', altText, contents: { type: 'carousel', contents: [overview, ...cards] } };
}

// การ์ดพื้นที่เผาไหม้รอบล่าสุด (bs = burn_summary.json จาก scripts/lib/burnsum.js) — line_notify.js push เมื่อมีรอบใหม่ · คำสั่ง "เผาไหม้" ตอบด้วยการ์ดนี้
// carousel 7 ใบ แบบเดียวกับการ์ดจุดความร้อน: ใบ 1 ภาพรวม (ไทล์ จังหวัด/อำเภอ/ตำบลที่ไหม้มากสุด — ผู้ใช้ขอ 30 ต.ค. 69) · ใบ 2–7 รายพื้นที่อนุรักษ์ (ที่มีรอยเผารอบนี้ขึ้นก่อน)
// ไม่รวมดงใหญ่ (ตัดมาแล้วใน burnsum.js) · ทุกใบต้องสั้นพอดีจอมือถือ
const BURN = '#A3171B', VIO = '#7C3AED', nf = v => Math.round(v).toLocaleString('en-US'), rai = v => v > 0 && v < 1 ? '<1' : nf(v);
const dYMD = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
// ชื่อสถานีฯ แบบสั้นพอดีช่องในการ์ด (ผู้ใช้เห็น "สถานีฯ ทับลาน (ด้าน…" ถูกตัด 30 ต.ค. 69)
const stShort = n => n === 'ไม่มี' ? 'ไม่มีสถานีฯ ดูแล' : n.replace('สถานีควบคุมไฟป่า', 'สถานีฯ ').replace(' (ด้านทิศใต้)', ' (ใต้)').replace(' - ', '-');
export const burnLab = bs => { const a = dateTh(dYMD(bs.d0)), b = dateTh(dYMD(bs.d1)); return bs.d0.slice(0, 6) === bs.d1.slice(0, 6) ? a.replace(/ \S+ \S+$/, '') + '–' + b : a.replace(/ \S+$/, '') + ' – ' + b };
// เพดาน 50 KB: ถ้าเกิน 48,000 ไบต์ ลดบรรทัดที่ไหม้มากสุดในการ์ดรายพื้นที่ 3 → 1 (ตำบล) → 0 (กรณีหนักสุดสมมติแบบ 3 บรรทัด = 49.7 KB)
export function burnCard(bs, o = {}) {
  let m;
  for (const lv of [3, 1, 0]) { m = burnBuild(bs, { ...o, lv }); if (bytes(m) < 48000) break }
  return m;
}
function burnBuild(bs, { site = SITE0, test = false, lv = 3 } = {}) {
  const lab = burnLab(bs), pct = (r, h) => r ? Math.round(h / r * 100) : 0, P = pct(bs.rai, bs.hs), Z = { rai: 0, hs: 0, fy: 0, m: Array(12).fill(0), st: {}, tm: {} };
  const rows = [...AREAS.map(a => [a.s, bs.ar[a.k] || 0, a.c]), ['นอกเขตอนุรักษ์', bs.ar[OUT] || 0, '#9E9E9E']].filter(r => r[1] > 0), mx = Math.max(1, ...rows.map(r => r[1]));
  const row = (n, v, c, m) => B('horizontal', [T(n, { size: 'xxs', color: '#333333', flex: 7 }), B('vertical', [hbar(v, m, c)], { flex: 4 }), T(rai(v), { size: 'xxs', weight: 'bold', align: 'end', flex: 3 })], { alignItems: 'center', margin: 'xs', spacing: 'sm' });
  // ไทล์ชื่อพื้นที่ที่ไหม้มากสุด (รูปแบบเดียวกับ topTile ของการ์ดจุดความร้อน)
  const topT = (o, l) => { const [x] = Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
    return B('vertical', [T(x ? x[0].split('|')[0] : '–', { size: 'sm', weight: 'bold', align: 'center', color: x ? BURN : MUT, wrap: true }), T(l + 'สูงสุด' + (x ? ` ${rai(x[1])} ไร่` : ''), { size: 'xxs', align: 'center', color: MUT, wrap: true })],
      { flex: 1, backgroundColor: '#F5F6F8', cornerRadius: 'md', paddingAll: '4px', justifyContent: 'center' }) };
  const head = (t, s, c) => B('vertical', [T(t, { color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true }), T(s, { color: '#FFFFFFDD', size: 'xxs', wrap: true })], { backgroundColor: c, paddingAll: '10px' });
  const overview = {
    type: 'bubble', size: 'mega',
    header: head(`${test ? '🧪 ทดสอบ · ' : ''}🔥 พื้นที่เผาไหม้ รอบ ${lab}`, 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี) · ระบบตามรอยเผา', BURN),
    body: B('vertical', [
      B('baseline', [T('รอบนี้', { size: 'xs', color: MUT, flex: 0 }), T(nf(bs.rai), { size: 'xxl', weight: 'bold', color: BURN, flex: 0, margin: 'sm' }), T('ไร่', { size: 'xs', color: MUT, flex: 0, margin: 'sm' }),
        T(`(${(bs.rai / 625).toFixed(1)} ตร.กม.)`, { size: 'xxs', color: MUT, margin: 'sm' })]),
      B('horizontal', [tile(P + '%', `มีจุดความร้อนใกล้ (≤${bs.radius_m / 1000} กม.)`, P ? RED : '#222222'), tile(nf(bs.rai - bs.hs), 'ไร่ ไม่พบจุดความร้อน', VIO), tile(nf(bs.fy_rai), `ไร่ สะสมปีงบ ${bs.fy}`)], { spacing: 'sm', margin: 'sm' }),
      ...(bs.pv ? [B('horizontal', [topT(bs.pv, 'จังหวัด'), topT(bs.am, 'อำเภอ'), topT(bs.tm, 'ตำบล')], { spacing: 'sm', margin: 'sm' })] : []),
      sub('รายพื้นที่ (ไร่)'),
      ...(rows.length ? rows.map(([n, v, c]) => row(n, v, c, mx)) : [T('ไม่พบรอยเผาไหม้ในพื้นที่อนุรักษ์รอบนี้', { size: 'xxs', color: '#2E7D32', margin: 'sm' })]),
      ...(bs.miss ? [T('⚠ รอบนี้ต้นทางไม่มีภาพบางส่วนของพื้นที่ (เมฆมาก) ตัวเลขจริงอาจมากกว่านี้', { size: 'xxs', color: '#B45309', margin: 'sm', wrap: true })] : []),
      T('ภาพดาวเทียม 20 ม. จากระบบตามรอยเผา (สสน.) ออกหลังสิ้นรอบ ~9 วัน · ไม่รวม ขสป.ดงใหญ่ · ไม่พบจุดความร้อน = ไฟที่ดาวเทียม VIIRS ไม่เห็น', { size: 'xxs', color: MUT, margin: 'sm', wrap: true }),
    ], { paddingAll: '10px' }),
    footer: footer(site),
  };
  // ใบ 2–7: รายพื้นที่อนุรักษ์ (ไม่รวม ขสป.ดงใหญ่) — พื้นที่ที่มีรอยเผารอบนี้มากกว่าขึ้นก่อน
  const order = AREAS.map((a, i) => ({ a, i, X: (bs.areas || {})[a.k] || Z })).sort((x, y) => y.X.rai - x.X.rai || x.i - y.i);
  const cards = order.map(({ a, X }) => {
    const p = pct(X.rai, X.hs), sts = Object.entries(X.st || {}).sort((x, y) => y[1] - x[1]).slice(0, 3), smx = Math.max(1, ...sts.map(s => s[1]));
    // จังหวัด/อำเภอ/ตำบลที่ไหม้มากสุดในพื้นที่ — บรรทัดข้อความละชิ้น (ไม่ใช้ \n ใน span ที่ไม่แน่ใจว่า LINE ขึ้นบรรทัดให้) (ผู้ใช้เลือก 30 ต.ค. 69 แทนไทล์ที่ทำให้กรณีหนักสุดเกิน 50 KB)
    const t1 = o => Object.entries(o || {}).sort((x, y) => y[1] - x[1])[0], tops = [['จังหวัด', t1(X.pv), ([p]) => 'จ.' + p], ['อำเภอ', t1(X.am), ([a, p]) => `อ.${a} จ.${p}`], ['ตำบล', t1(X.tm), ([t, a, p]) => `ต.${t} อ.${a} จ.${p}`]].slice(3 - lv).filter(x => x[1]);
    return {
      type: 'bubble', size: 'mega',
      header: head(a.s, (a.n || a.k) + ` · รอยเผาไหม้ รอบ ${lab}`, a.c),
      body: B('vertical', [
        B('horizontal', [tile(rai(X.rai), 'ไร่ รอบนี้', X.rai ? BURN : '#222222'), tile(X.rai ? p + '%' : '–', 'มีจุดความร้อนใกล้'), tile(nf(X.fy), `ไร่ สะสมปีงบ ${bs.fy}`)], { spacing: 'sm' }),
        ...tops.map(([l, [k, v], f], i) => T('x', { size: 'xxs', wrap: true, ...(i ? {} : { margin: 'sm' }), contents: [{ type: 'span', text: l + 'ที่ไหม้มากสุด ', weight: 'bold', color: '#444444' }, { type: 'span', text: `${f(k.split('|'))} (${rai(v)} ไร่)`, color: MUT }] })),
        sub('รายเดือน (ไร่ · รวมรายรอบ)', [[a.c, `ปีงบ ${bs.fy}`]]),
        ...months(X.m || Z.m, null, a.c, 24),
        sub('ตามพื้นที่รับผิดชอบสถานีฯ รอบนี้ (ไร่)'),
        ...(sts.length ? sts.map(([n, v]) => row(stShort(n), v, a.c, smx)) : [T('ไม่พบรอยเผาไหม้ในพื้นที่นี้รอบนี้', { size: 'xxs', color: '#2E7D32', margin: 'sm' })]),
      ], { paddingAll: '10px' }),
      footer: footer(site),
    };
  });
  return { type: 'flex', altText: `${test ? '[ทดสอบ] ' : ''}🔥 พื้นที่เผาไหม้รอบ ${lab}: ${nf(bs.rai)} ไร่ · มีจุดความร้อนใกล้ ${P}% · สะสมปีงบ ${bs.fy} ${nf(bs.fy_rai)} ไร่`.slice(0, 390), contents: { type: 'carousel', contents: [overview, ...cards] } };
}

async function verify(secret, body, sig) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...mac)) === sig;
}
const getJ = async (site, f) => { try { const r = await fetch(site + f + '?t=' + Date.now()); return r.ok ? await r.json() : null } catch (e) { return null } };

const HELP = ['🤖 บอทแจ้งเตือนจุดความร้อน กลุ่มป่าดงพญาเย็น-เขาใหญ่', '',
  '• แจ้งเตือนอัตโนมัติเมื่อพบจุดความร้อนใหม่ใน 6 พื้นที่อนุรักษ์ (ไม่รวม ขสป.ดงใหญ่) ทุกดาวเทียม VIIRS',
  '• พิมพ์ "สรุป" — การ์ดสรุปทั้งปี + รายพื้นที่',
  '• พิมพ์ "เผาไหม้" — พื้นที่เผาไหม้รอบล่าสุด (ระบบตามรอยเผา ราย 7 วัน) · บอทส่งให้เองเมื่อมีรอบใหม่ที่มีรอยเผา',
  '• พิมพ์ "ช่วยเหลือ" — ข้อความนี้',
  '', 'การแจ้งเตือนอัตโนมัติใช้โควตาข้อความฟรีของ LINE ตามจำนวนสมาชิกกลุ่ม ถ้าโควตาเดือนนี้หมด บอทจะหยุดแจ้งเตือนเอง แต่ยังตอบ "สรุป" ได้ตลอด'].join('\n');

async function reply(env, token, msg) {
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.LINE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken: token, messages: [typeof msg === 'string' ? { type: 'text', text: msg.slice(0, 4900) } : msg] }),
  });
  if (!r.ok) console.log('reply', r.status, await r.text());
}

export async function handle(env, ev) {
  const site = env.SITE_URL || SITE0, src = ev.source || {};
  if (ev.type === 'join') return reply(env, ev.replyToken, HELP + (src.groupId ? `\n\nรหัสกลุ่มนี้ (ใช้ตั้งค่า LINE_GROUP_ID):\n${src.groupId}` : ''));
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const t = ev.message.text.trim();
  if (/^(สรุป|summary)/i.test(t)) {
    const [live, sum] = await Promise.all([getJ(site, 'live.json'), getJ(site, 'summary.json')]);
    return reply(env, ev.replyToken, sum ? carousel({ live, sum, site }) : `อ่านข้อมูลสรุปไม่ได้ในขณะนี้ — เปิดแผนที่: ${site}`);
  }
  if (/^(เผาไหม้|รอยเผา|burn)/i.test(t)) {
    const bs = await getJ(site, 'burn_summary.json');
    return reply(env, ev.replyToken, bs ? burnCard(bs, { site }) : `อ่านข้อมูลพื้นที่เผาไหม้ไม่ได้ในขณะนี้ — เปิดแผนที่: ${site}`);
  }
  if (/^(ช่วยเหลือ|วิธีใช้|help)/i.test(t)) return reply(env, ev.replyToken, HELP);
  if (/^(รหัสกลุ่ม|groupid)/i.test(t)) return reply(env, ev.replyToken, src.groupId ? `รหัสกลุ่มนี้:\n${src.groupId}` : `ไม่ใช่กลุ่ม (${src.type}) — เชิญบอทเข้ากลุ่มแล้วพิมพ์ใหม่`);
}

export default {
  async fetch(req, env, ctx) {
    // ตัดช่องว่าง/ขึ้นบรรทัดที่ติดมาตอนคัดลอกรหัสใส่ Cloudflare
    env = { ...env, LINE_SECRET: (env.LINE_SECRET || '').trim(), LINE_TOKEN: (env.LINE_TOKEN || '').trim() };
    if (req.method !== 'POST') {
      // หน้าตรวจการตั้งค่า (บอกแค่ความยาว ไม่แสดงค่ารหัส) — Channel secret = 32 ตัวอักษร (0-9 a-f), access token ยาว ~170 ตัว
      const sc = env.LINE_SECRET, tk = env.LINE_TOKEN;
      const a = !sc ? '✗ ยังไม่ได้ตั้ง' : /^[0-9a-f]{32}$/.test(sc) ? '✓ รูปแบบถูกต้อง (32 ตัวอักษร)' : `✗ รูปแบบไม่ใช่ Channel secret (ยาว ${sc.length} ตัวอักษร ควรเป็น 32 ตัว 0-9 a-f)`;
      const b = !tk ? '✗ ยังไม่ได้ตั้ง' : tk.length > 100 ? `✓ ตั้งแล้ว (ยาว ${tk.length} ตัวอักษร)` : `✗ สั้นผิดปกติ (ยาว ${tk.length}) — ควรเป็น Channel access token (long-lived)`;
      return new Response(`LINE webhook: สถานการณ์ไฟป่า กลุ่มป่าดงพญาเย็น-เขาใหญ่ — ทำงานอยู่

LINE_SECRET: ${a}
LINE_TOKEN: ${b}
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const body = await req.text();
    if (!env.LINE_SECRET || !(await verify(env.LINE_SECRET, body, req.headers.get('x-line-signature') || ''))) return new Response('bad signature', { status: 401 });
    const evs = (JSON.parse(body).events || []);
    ctx.waitUntil(Promise.all(evs.map(ev => handle(env, ev).catch(e => console.log('event', e.message)))));
    return new Response('ok'); // ตอบ LINE ทันที (ปุ่ม Verify ใน LINE Developers ส่ง events ว่าง)
  },
};
