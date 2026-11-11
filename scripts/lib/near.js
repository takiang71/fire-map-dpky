// กันแจ้งเตือนจุดเดียวกันซ้ำ เมื่อมาจากคนละแหล่ง/คนละระเบียน (ใช้ใน line_notify.js และ telegram_notify.js)
//   - API ไทยขัดข้อง → build_site ใช้จุดจาก NASA FIRMS (ไม่มี unique_id) แล้ว API กลับมาส่งจุดเดียวกันพร้อม unique_id ใหม่
//   - API ไทยมีระเบียนซ้ำของจุดเดียวกัน (เวลาต่าง 1–3 นาที ห่าง <~165 ม. — CLAUDE.md งานค้างข้อ 13)
// จำตำแหน่งจุดที่แจ้ง/เห็นแล้วใน st.near = [[เวลาสแกน ms, lat×1e5, lon×1e5, ดาวเทียม]]
// ถือว่าเป็นจุดเดียวกัน: ดาวเทียมเดียวกัน เวลาต่าง ≤10 นาที ห่าง <200 หน่วย (~220 ม.) — FIRMS ห่างจาก API ~70 ม.;
//   จุดข้างเคียงจริงในรอบสแกนเดียวกันห่าง ≥375 ม. (ขนาดพิกเซล VIIRS) จึงยังแจ้งแยกกัน
const satKey = s => { s = String(s == null ? '' : s); return /21/.test(s) ? 'NOAA21' : /20/.test(s) ? 'NOAA20' : /npp|suomi/i.test(s) ? 'SNPP' : s };
const thMs = fd => Date.parse(String(fd).replace(' ', 'T') + '+07:00');
const rec = f => { const p = f.properties, [lo, la] = f.geometry.coordinates; return [thMs(p.full_date), Math.round(la * 1e5), Math.round(lo * 1e5), satKey(p.satellite_name)] };
const sameRec = (a, b) => a[3] === b[3] && Math.abs(a[0] - b[0]) <= 10 * 60e3 && Math.hypot(a[1] - b[1], a[2] - b[2]) < 200;
const seenNear = (st, f) => { const r = rec(f); return (st.near || []).some(n => sameRec(n, r)) };

// จุดใหม่ = ยังไม่เคยแจ้งด้วยรหัสนี้ และไม่ใกล้จุดที่เคยเห็นแล้ว
const isNew = (st, f, idOf) => !(idOf(f) in st.sent) && !seenNear(st, f);
// จำจุดนี้ (รหัส + ตำแหน่ง)
function remember(st, f, idOf, now) {
  if (!(idOf(f) in st.sent)) st.sent[idOf(f)] = now;
  if (!seenNear(st, f)) (st.near || (st.near = [])).push(rec(f));
}
// ลบตำแหน่งที่สแกนเก่ากว่า keepH ชม.
const prune = (st, now, keepH) => { if (st.near) st.near = st.near.filter(n => now - n[0] < keepH * 36e5) };

module.exports = { isNew, remember, prune, seenNear, sameRec };
