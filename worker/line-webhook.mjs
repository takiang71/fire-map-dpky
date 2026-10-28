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
const T = (text, o = {}) => ({ type: 'text', text: String(text), ...o });
const B = (layout, contents, o = {}) => ({ type: 'box', layout, contents, ...o });
const SEP = { type: 'separator', margin: 'md' };
const dPct = (c, p) => !p ? (c ? ['▲ ใหม่', RED] : ['–', MUT]) : c === p ? ['= เท่าเดิม', MUT] : [`${c > p ? '▲' : '▼'} ${Math.abs(Math.round((c - p) / p * 100))}%`, c > p ? RED : '#2E7D32'];
const tile = (v, l, color = '#222') => B('vertical', [T(v, { size: 'xl', weight: 'bold', align: 'center', color }), T(l, { size: 'xxs', align: 'center', color: MUT, wrap: true })],
  { flex: 1, backgroundColor: '#F5F6F8', cornerRadius: 'md', paddingAll: '6px' });
// กราฟแท่งรายเดือน ต.ค.–ก.ย. ปีนี้ (สีพื้นที่/แดง) เทียบปีก่อน (น้ำเงิน) · pm = null แสดงเฉพาะปีนี้ (การ์ดรายพื้นที่)
// แท่งเรียงในกล่องเดียว (ไม่ห่อรายเดือน) และไม่ใส่คุณสมบัติเกินจำเป็น เพื่อให้ JSON ทั้ง carousel ไม่เกิน 50 KB
function months(m, pm, fy, c = RED, H = 44) {
  const mx = Math.max(1, ...m, ...(pm || [])), bar = (v, col, g) => B('vertical', [], { height: (v ? Math.max(2, Math.round(v / mx * H)) : 1) + 'px', backgroundColor: v ? col : '#DADDE2', ...(g ? { margin: 'xs' } : {}) });
  return [
    B('horizontal', m.flatMap((v, i) => pm ? [bar(v, c, i > 0), bar(pm[i], BLUE)] : [bar(v, c, i > 0)]), { alignItems: 'flex-end', height: H + 'px', margin: 'sm' }),
    B('horizontal', ['ต.ค.', 'ม.ค.', 'เม.ย.', 'ก.ค.'].map(x => T(x, { size: 'xxs', color: MUT }))),
    T('x', { size: 'xxs', color: MUT, contents: [{ type: 'span', text: '■ ', color: c }, { type: 'span', text: 'ปีงบ ' + fy + (pm ? '   ' : ' · สูงสุด ' + Math.max(...m) + ' จุด/เดือน') }, ...(pm ? [{ type: 'span', text: '■ ', color: BLUE }, { type: 'span', text: 'ปีงบ ' + (fy - 1) }] : [])] }),
  ];
}
const hbar = (v, mx, c) => B('vertical', v ? [B('vertical', [], { width: Math.max(4, Math.round(v / mx * 100)) + '%', height: '6px', backgroundColor: c })] : [], { height: '6px', backgroundColor: '#EEF0F3', margin: 'xs' });
const ptRow = f => {
  const p = f.properties, [lo, la] = f.geometry.coordinates, t = thMs(p.full_date);
  return B('vertical', [
    T(`${hm(t)} น. ${dTh(t)} · ${SATN[satKey(p.satellite_name)] || p.satellite_name}`, { size: 'xs', weight: 'bold', color: '#222' }),
    T(`ต.${p.subdistrict_name_th || '-'} อ.${p.district_name_th || '-'} จ.${p.province_name_th || '-'}`, { size: 'xxs', color: MUT, wrap: true }),
  ], { paddingTop: '4px', paddingBottom: '4px', action: { type: 'uri', label: 'แผนที่', uri: `https://maps.google.com/?q=${la.toFixed(5)},${lo.toFixed(5)}` } });
};
// อันดับสูงสุดจากตัวนับ {ชื่อ: จำนวน} · ชื่อ อำเภอ = "อำเภอ|จังหวัด", ตำบล = "ตำบล|อำเภอ|จังหวัด"
const topN = (o, n) => Object.entries(o || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th')).slice(0, n);
const LV = { pv: ['จังหวัด', k => 'จ.' + k], am: ['อำเภอ', k => { const [a, p] = k.split('|'); return `อ.${a} จ.${p}` }], tm: ['ตำบล', k => { const [t, a, p] = k.split('|'); return `ต.${t} อ.${a} จ.${p}` }] };
const mergeCnt = (to, from) => { for (const k in from || {}) to[k] = (to[k] || 0) + from[k] };
const dateTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
const footer = site => B('vertical', [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดแผนที่', uri: site } }], { paddingAll: '4px' });

// live = live.json, sum = summary.json, fresh = จุดใหม่ที่จะแจ้งเตือน (null = โหมดสรุป แสดงจุด 24 ชม. แทน)
// LINE จำกัด JSON ของ carousel ไม่เกิน 50 KB → ถ้าเกิน 48,000 ไบต์ (UTF-8: อักษรไทยตัวละ 3 ไบต์) ลดจำนวนจุดที่แสดงต่อการ์ดลง
export const bytes = m => new TextEncoder().encode(JSON.stringify(m)).length;
export function carousel(o) {
  let m;
  for (const per of [4, 2, 1, 0]) { m = build({ ...o, per }); if (bytes(m) < 48000) break }
  return m;
}
function build({ live, sum, fresh = null, site = SITE0, now = Date.now(), quotaLeft = null, per = 4 }) {
  const alert = !!fresh;
  const pts = (live && live.features || []).filter(f => f.properties && !excluded(f.properties)), h24 = pts.filter(f => now - thMs(f.properties.full_date) < 24 * 36e5);
  const nw = (fresh || []).filter(f => !excluded(f.properties)), list = alert ? nw : h24;
  const A = Object.entries(sum && sum.areas || {}).filter(([k]) => !EX.test(k)), z = () => ({ fy: 0, prv: 0, pfull: 0, m: Array(12).fill(0), pm: Array(12).fill(0), pv: {}, am: {}, tm: {} });
  const sumOf = rows => rows.reduce((o, [, v]) => { o.fy += v.fy; o.prv += v.prv; o.pfull += v.pfull; v.m.forEach((x, i) => { o.m[i] += x; o.pm[i] += v.pm[i] }); for (const l in LV) mergeCnt(o[l], v[l]); return o }, z());
  const all = sumOf(A), of = k => (A.find(([x]) => x === k) || [, z()])[1], out = sumOf(A.filter(([k]) => k.startsWith(OUT)));
  const fy = sum ? sum.fy : '', ind = sum ? sum.ind : '', [dt, dc] = dPct(all.fy, all.prv);
  const inA = (L, k) => L.filter(f => f.properties._ar === k);

  // การ์ดที่ 1: ภาพรวมทั้งปี
  const rows = [...AREAS.map(a => [a.s, of(a.k), a.c]), ...(out.fy || out.prv ? [['นอกเขตอนุรักษ์', out, '#9E9E9E']] : [])], mx = Math.max(1, ...rows.flatMap(r => [r[1].fy, r[1].prv]));
  const head = (title, color) => B('vertical', [
    T(title, { color: '#FFFFFF', size: 'lg', weight: 'bold', wrap: true }),
    T('สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)', { color: '#FFFFFFDD', size: 'xxs', wrap: true }),
    T(`📅 ${dateTh(now)}  🕘 ${hm(now)} น.`, { color: '#FFFFFF', size: 'xs', weight: 'bold', margin: 'sm' }),
  ], { backgroundColor: color, paddingAll: '14px' });
  // ไทล์ จังหวัด/อำเภอ/ตำบล ที่พบจุดสูงสุด (สะสมปีงบ) — รูปแบบเดียวกับไทล์ตัวเลขด้านบน (ผู้ใช้ขอ)
  const topTile = l => { const [x] = topN(all[l], 1);
    return B('vertical', [T(x ? x[0].split('|')[0] : '–', { size: 'md', weight: 'bold', align: 'center', color: x ? '#B3261E' : MUT, wrap: true }), T(LV[l][0] + 'สูงสุด' + (x ? ` · ${x[1]} จุด` : ''), { size: 'xxs', align: 'center', color: MUT, wrap: true })],
      { flex: 1, backgroundColor: '#F5F6F8', cornerRadius: 'md', paddingAll: '6px', justifyContent: 'center' }) };
  const overview = {
    type: 'bubble', size: 'mega',
    header: head(`🔥 สถานการณ์ไฟป่า ปีงบประมาณ ${fy}`, '#B3261E'),
    body: B('vertical', [
      ...(alert ? [B('vertical', [T(`พบจุดความร้อนใหม่ ${nw.length} จุด`, { color: '#FFFFFF', weight: 'bold', size: 'sm' }),
        T(AREAS.map(a => [a.s, inA(nw, a.k).length]).filter(x => x[1]).map(x => `${x[0]} ${x[1]}`).concat(inA(nw, OUT).length ? [`นอกเขตอนุรักษ์ ${inA(nw, OUT).length}`] : []).join(' · ') || '-', { color: '#FFFFFFDD', size: 'xxs', wrap: true })],
        { backgroundColor: RED, cornerRadius: 'md', paddingAll: '8px' })] : []),
      B('baseline', [T('สะสมปีงบ', { size: 'sm', color: MUT, flex: 0 }), T(String(all.fy), { size: '3xl', weight: 'bold', color: RED, flex: 0, margin: 'md' }), T('จุด', { size: 'sm', color: MUT, flex: 0, margin: 'sm' })], { margin: 'md' }),
      T('x', { size: 'xs', wrap: true, contents: [{ type: 'span', text: dt + ' ', color: dc, weight: 'bold' }, { type: 'span', text: `เทียบปีงบ ${fy - 1} ช่วงเดียวกัน (${all.prv} จุด)`, color: MUT }] }),
      B('horizontal', [tile(h24.length, 'จุดใน 24 ชม.'), tile(all.pfull, `ทั้งปีงบ ${fy - 1}`, BLUE), tile(ind.replace('Suomi ', ''), 'ดาวเทียมตัวชี้วัด', '#444')], { spacing: 'sm', margin: 'md' }),
      B('horizontal', [topTile('pv'), topTile('am'), topTile('tm')], { spacing: 'sm', margin: 'sm' }),
      SEP,
      T(`รายพื้นที่ · สะสมปีงบ ${fy} เทียบ ${fy - 1} ช่วงเดียวกัน`, { size: 'xs', weight: 'bold', margin: 'md', color: '#444', wrap: true }),
      B('horizontal', [T('พื้นที่', { flex: 6 }), T(String(fy), { flex: 2, align: 'end', color: RED }), T(String(fy - 1), { flex: 2, align: 'end', color: BLUE }), T('เปลี่ยนแปลง', { flex: 3, align: 'end' })].map(x => ({ ...x, size: 'xxs', color: x.color || MUT })), { margin: 'sm', spacing: 'sm' }),
      ...rows.map(([n, v, c]) => { const [t, tc] = dPct(v.fy, v.prv);
        return B('horizontal', [
          B('vertical', [T(n, { size: 'xxs', color: '#333' }), hbar(v.fy, mx, c)], { flex: 6 }),
          T(String(v.fy), { size: 'xs', weight: 'bold', align: 'end', flex: 2 }),
          T(String(v.prv), { size: 'xs', color: BLUE, align: 'end', flex: 2 }),
          T(t, { size: 'xxs', weight: 'bold', color: tc, align: 'end', flex: 3 }),
        ], { alignItems: 'center', margin: 'sm', spacing: 'sm' }) }),
      { type: 'separator', margin: 'sm' },
      B('horizontal', [T('รวม', { flex: 6, weight: 'bold' }), T(String(all.fy), { flex: 2, align: 'end', weight: 'bold', color: RED }), T(String(all.prv), { flex: 2, align: 'end', weight: 'bold', color: BLUE }), T(dt, { flex: 3, align: 'end', weight: 'bold', color: dc })].map(x => ({ ...x, size: 'xs' })), { margin: 'md', spacing: 'sm' }),
      SEP,
      T('รายเดือน (ต.ค.–ก.ย.)', { size: 'xs', weight: 'bold', margin: 'md', color: '#444' }),
      ...months(all.m, all.pm, fy),
      T(`กลุ่มป่าดงพญาเย็น-เขาใหญ่ · ปีก่อน = จุดกรมอุทยานฯ${quotaLeft != null ? ` · แจ้งเตือนได้อีก ~${quotaLeft} ครั้งเดือนนี้` : ''} · ไม่รวม ขสป.ดงใหญ่`, { size: 'xxs', color: MUT, wrap: true, margin: 'md' }),
    ], { paddingAll: '14px' }),
    footer: footer(site),
  };

  // การ์ดที่ 2–7: รายพื้นที่อนุรักษ์ (โหมดแจ้งเตือน: พื้นที่ที่มีจุดใหม่ขึ้นก่อน)
  const order = AREAS.map((a, i) => ({ a, i, n: inA(nw, a.k).length })).sort((x, y) => alert ? y.n - x.n || x.i - y.i : x.i - y.i);
  const cards = order.map(({ a }) => {
    const v = of(a.k), L = inA(list, a.k).sort((x, y) => thMs(y.properties.full_date) - thMs(x.properties.full_date)), n24 = inA(h24, a.k).length, [t, c] = dPct(v.fy, v.prv);
    return {
      type: 'bubble', size: 'mega',
      header: B('vertical', [T(a.s, { color: '#FFFFFF', size: 'xl', weight: 'bold' }), T(a.n || a.k, { color: '#FFFFFFCC', size: 'xxs', wrap: true })], { backgroundColor: a.c, paddingAll: '14px' }),
      body: B('vertical', [
        ...(alert && L.length ? [B('vertical', [T(`🔥 พบจุดใหม่ ${L.length} จุด`, { color: '#FFFFFF', weight: 'bold', size: 'sm' })], { backgroundColor: RED, cornerRadius: 'md', paddingAll: '8px' })] : []),
        B('horizontal', [tile(n24, 'จุดใน 24 ชม.', n24 ? RED : '#222'), tile(v.fy, `สะสมปีงบ ${fy}`), tile(v.prv, `ปีงบ ${fy - 1} ช่วงเดียวกัน`, BLUE)], { spacing: 'sm', margin: alert && L.length ? 'md' : 'none' }),
        T('x', { size: 'xs', margin: 'sm', wrap: true, contents: [{ type: 'span', text: t + ' ', color: c, weight: 'bold' }, { type: 'span', text: `เทียบปีงบก่อนช่วงเดียวกัน · ทั้งปีงบ ${fy - 1} = ${v.pfull} จุด`, color: MUT }] }),
        ...months(v.m, null, fy, a.c, 32),
        SEP,
        T(alert ? 'จุดใหม่รอบนี้ (แตะเพื่อเปิดแผนที่)' : 'จุดใน 24 ชม. (แตะเพื่อเปิดแผนที่)', { size: 'xs', weight: 'bold', margin: 'md', color: '#444' }),
        ...(L.length ? L.slice(0, per).map(ptRow) : [T(alert ? 'ไม่มีจุดใหม่ในพื้นที่นี้รอบนี้' : 'ไม่พบจุดความร้อนใน 24 ชม.', { size: 'xs', color: '#2E7D32', margin: 'sm' })]),
        ...(L.length > per ? [T(`…และอีก ${L.length - per} จุด`, { size: 'xxs', color: MUT })] : []),
      ], { paddingAll: '14px' }),
      footer: footer(site),
    };
  });

  const altText = (alert
    ? `🔥 พบจุดความร้อนใหม่ ${nw.length} จุด ` + AREAS.map(a => [a.s, inA(nw, a.k).length]).filter(x => x[1]).map(x => `${x[0]} ${x[1]}`).join(', ')
    : `สรุปจุดความร้อน ปีงบ ${fy}: สะสม ${all.fy} จุด · 24 ชม. ${h24.length} จุด`).slice(0, 390);
  return { type: 'flex', altText, contents: { type: 'carousel', contents: [overview, ...cards] } };
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
  if (/^(ช่วยเหลือ|วิธีใช้|help)/i.test(t)) return reply(env, ev.replyToken, HELP);
  if (/^(รหัสกลุ่ม|groupid)/i.test(t)) return reply(env, ev.replyToken, src.groupId ? `รหัสกลุ่มนี้:\n${src.groupId}` : `ไม่ใช่กลุ่ม (${src.type}) — เชิญบอทเข้ากลุ่มแล้วพิมพ์ใหม่`);
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== 'POST') return new Response('LINE webhook: สถานการณ์ไฟป่า กลุ่มป่าดงพญาเย็น-เขาใหญ่ — ทำงานอยู่', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const body = await req.text();
    if (!env.LINE_SECRET || !(await verify(env.LINE_SECRET, body, req.headers.get('x-line-signature') || ''))) return new Response('bad signature', { status: 401 });
    const evs = (JSON.parse(body).events || []);
    ctx.waitUntil(Promise.all(evs.map(ev => handle(env, ev).catch(e => console.log('event', e.message)))));
    return new Response('ok'); // ตอบ LINE ทันที (ปุ่ม Verify ใน LINE Developers ส่ง events ว่าง)
  },
};
