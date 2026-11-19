// F1 (16 พ.ย. 69) ข้อความแจ้ง "ผลตรวจสอบจากหน้างาน" เข้ากลุ่ม Telegram (HTML) / LINE (ข้อความธรรมดา) — ใช้ร่วมกันใน telegram_notify.js และ line_notify.js
// รายงานมาจาก _site/reports.json (build_site.js ดึงจาก Worker fire-layers) · ชื่อสาเหตุ = รายการ cs ของบล็อก fxdata (ดัชนีเดียวกับฟอร์มในหน้าเว็บ)
const RES = { fire: ['🔥', 'พบไฟกำลังไหม้'], out: ['🧯', 'ดับแล้ว'], none: ['✅', 'ตรวจแล้วไม่พบไฟ'], plan: ['🌾', 'เผาตามแผน (ชิงเผา)'] };
const SATN = { SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const hm = ms => new Date(ms + 7 * 36e5).toISOString().slice(11, 16);
const dTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const dateTh = ms => new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const arS = a => String(a || 'นอกพื้นที่อนุรักษ์').replace(/^อุทยานแห่งชาติ/, 'อช.').replace(/^เขตรักษาพันธุ์สัตว์ป่า/, 'ขสป.').replace(/^เขตห้ามล่าสัตว์ป่า/, 'ขหล.');
const rai = v => (+v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const ll = r => r.hs ? [r.hs.la, r.hs.lo] : r.pos ? [r.pos[1], r.pos[0]] : null;

// รายงานที่ยังไม่เคยแจ้ง: ไม่อยู่ใน sent (= {id: เวลาสร้าง}) และสร้างไม่เกิน maxH ชม. (กันไหลเมื่อสถานะหาย)
function fresh(reports, sent, now, maxH = 48) { return (reports || []).filter(r => r && r.id && !(sent || {})[r.id] && now - r.c < maxH * 36e5).sort((a, b) => a.c - b.c) }

// html = true → Telegram (HTML + ลิงก์) · false → LINE (ข้อความธรรมดา ลิงก์เป็น URL เปล่า)
function vfText(L, { site = 'https://takiang71.github.io/fire-map-dpky/', now = Date.now(), html = true, cs = [], per = 12, test = false } = {}) {
  const E = html ? escH : s => String(s == null ? '' : s), b = s => html ? `<b>${s}</b>` : s, i = s => html ? `<i>${s}</i>` : s;
  const link = (u, t) => html ? `<a href="${u}">${t}</a>` : `${t} ${u}`;
  const out = [`${test ? '🧪 ' + b('ทดสอบ') + ' · ' : ''}📋 ${b(`ผลตรวจสอบจากหน้างาน ${L.length} รายการ`)}`, `กลุ่มป่าดงพญาเย็น-เขาใหญ่ · ${dateTh(now)} ${hm(now)} น.`];
  for (const r of L.slice(0, per)) {
    const [ic, nm] = RES[r.res] || ['•', r.res], p = ll(r), tm = String(r.tm || '').split('|');
    const head = [`${ic} ${b(nm)}`, r.hs ? `จุด ${dTh(r.hs.t)} ${hm(r.hs.t)} น.${r.hs.sat ? ' ' + (SATN[r.hs.sat] || r.hs.sat) : ''}` : r.tn ? `แจ้งเหตุ ${dTh(r.tn)} ${hm(r.tn)} น.` : null, arS(r.ar), tm[0] ? `ต.${E(tm[0])} อ.${E(tm[1] || '-')}` : null].filter(Boolean).join(' · ');
    const det = [r.res !== 'none' ? `${rai(r.rai)} ไร่` : null, r.cs != null && cs[r.cs] ? E(cs[r.cs]) : r.csx ? E(r.csx) : null, r.ta ? `เข้าถึง ${r.ta}${r.te ? '–' + r.te : ''} น.` : null, r.ag ? `หน่วยงาน: ${E(String(r.ag).replace(/^สถานีควบคุมไฟป่า/, 'สถานีฯ '))}` : null, r.crew ? `${r.crew} คน` : null, r.un && r.un !== '-' ? `หน่วย: ${E(r.un)}` : null, `โดย ${E(r.by && r.by.d || '-')}`].filter(Boolean).join(' · ');
    out.push('', head, `  ${det}`);
    if (r.note) out.push(`  ${i('“' + E(String(r.note).slice(0, 200)) + '”')}`);
    if (p) out.push(`  📍 ${link(`https://maps.google.com/?q=${p[0].toFixed(5)},${p[1].toFixed(5)}`, 'Google Maps')}  ·  🗺️ ${link(`${site}?hs=${p[0].toFixed(5)},${p[1].toFixed(5)}`, 'แผนที่ไฟป่า')}`);
  }
  if (L.length > per) out.push('', `…และอีก ${L.length - per} รายการ ดูได้ในแผนที่ (แท็บการดับไฟป่า)`);
  out.push('', i('บันทึกโดยเจ้าหน้าที่ผ่านแผนที่ไฟป่า · แก้ไขได้ภายใน 24 ชม.'));
  return out.join('\n');
}
module.exports = { vfText, fresh, RES };
