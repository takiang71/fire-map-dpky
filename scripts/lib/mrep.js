// F3 แจ้งลิงก์รายงานประจำเดือน (reports/index.json จาก scripts/monthly_report.js → _site/reports/) — ใช้ร่วมใน telegram_notify.js และ line_notify.js
// สถานะ st.mrep = id รายงานล่าสุดที่แจ้งแล้ว (เช่น "2569-11") · ไม่มีสถานะ (ครั้งแรก) = จำรายงานล่าสุดโดยไม่ส่ง · รายงานสร้างเกิน 7 วันแล้ว = จำโดยไม่ส่ง (กันส่งย้อนเมื่อสถานะหาย)
const fs = require('fs'), path = require('path');

function readIndex(out) { try { return JSON.parse(fs.readFileSync(path.join(out, 'reports', 'index.json'), 'utf8')) } catch (e) { return null } }

// → { r: รายงานที่ต้องแจ้ง | null, seed: true = จำโดยไม่ส่ง, latest }
function pending(ix, last, now) {
  const L = ix && Array.isArray(ix.list) ? ix.list.slice().sort((a, b) => a.id < b.id ? 1 : -1) : [], latest = L[0];
  if (!latest) return { r: null, seed: false, latest: null };
  if (!last) return { r: null, seed: true, latest };
  if (latest.id <= last) return { r: null, seed: false, latest };
  if (now - Date.parse(latest.gen) > 7 * 864e5) return { r: null, seed: true, latest };
  return { r: latest, seed: false, latest };
}

function text(r, { site = 'https://takiang71.github.io/fire-map-dpky/', html = true } = {}) {
  const b = s => html ? `<b>${s}</b>` : s, u = site + 'reports/' + (r.pdf || r.html);
  const n = r.n || {}, d = n.indPrev ? (n.ind === n.indPrev ? 'เท่าเดิม' : `${n.ind > n.indPrev ? '▲' : '▼'} ${Math.abs(Math.round((n.ind - n.indPrev) / n.indPrev * 100))}%`) : '';
  const lines = [`📄 ${b(`รายงานสถานการณ์ไฟป่าประจำเดือน ${r.t}`)}`, 'กลุ่มป่าดงพญาเย็น-เขาใหญ่ (ไม่รวม ขสป.ดงใหญ่)',
    `จุดความร้อนตัวชี้วัดกรมอุทยานฯ ${n.ind ?? '-'} จุด${n.indPrev != null ? ` (ปีก่อน ${n.indPrev}${d ? ' ' + d : ''})` : ''} · ทุกดาวเทียม ${n.all ?? '-'} จุด · สะสมปีงบ ${n.fy ?? '-'} จุด`];
  if (r.partial) lines.push('⚠ ข้อมูลยังไม่ครบเดือน');
  lines.push(html ? `<a href="${u}">เปิดรายงาน${r.pdf ? ' (PDF)' : ''}</a> · <a href="${site}reports/${r.html}">หน้าเว็บ</a>` : `เปิดรายงาน: ${u}`);
  return lines.join('\n');
}
module.exports = { readIndex, pending, text };
