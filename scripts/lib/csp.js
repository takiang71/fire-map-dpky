// E2 (docs/review-2569-11-15.md): Content-Security-Policy แบบ **Report-Only** (รายงานอย่างเดียว ไม่บล็อกอะไร) — ห้ามเปลี่ยนเป็น Content-Security-Policy (บังคับ) จนกว่าผู้ใช้อนุมัติ
// เบราว์เซอร์ไม่รับ Report-Only ใน <meta http-equiv> (ตามมาตรฐาน CSP — ถูกเพิกเฉยพร้อมข้อความเตือน) และ GitHub Pages ตั้ง header เองไม่ได้ จึงส่งเป็น header ทาง:
//   - sw.js (build_site.js แทน /*__SW_CSP__*/ ด้วยนโยบายนี้) → หน้าแรกที่ service worker ส่ง (ตั้งแต่ครั้งที่ 2 ที่เปิดเว็บ)
//   - scripts/serve.js และเซิร์ฟเวอร์ใน check_site.js (ทดสอบในเครื่อง)
// หน้าเว็บฟัง securitypolicyviolation → dbg('csp', …) ลง window.__LOG (?debug=1 เห็นใน console + ปุ่มคัดลอก) และ window.__CSPV
// โดเมน: จาก grep "https://…" ใน index.html (cspHosts) + โดเมนที่โค้ดประกอบเอง (EXTRA) — test/csp.test.js ตรวจว่าครบทุกโดเมนใน index.html
'use strict';
// โดเมนที่ไม่ได้อยู่ใน index.html ตรง ๆ (ประกอบ URL ในโค้ด หรือได้จากคำตอบ API)
const EXTRA = [
  'https://*.google.com',            // ไทล์ Google mt0–mt3.google.com (`https://mt${i}.google.com`)
  'https://tilecache.rainviewer.com' // RainViewer host จาก weather-maps.json (j.host)
];
// ลิงก์ที่เปิดเป็นหน้า/แท็บใหม่เท่านั้น (ไม่ใช่การโหลดทรัพยากร) — ไม่ต้องอยู่ในนโยบาย
const NAV_ONLY = new Set(['https://github.com', 'https://line.me', 'https://t.me', 'https://www.facebook.com', 'https://social-plugins.line.me']);
// โดเมนทั้งหมดใน index.html (ไม่ซ้ำ เรียงตามตัวอักษร) — ตัด https://mt (ส่วนต้นของ mt${i}.google.com) ที่ EXTRA ครอบไว้
function cspHosts(html) {
  return [...new Set([...html.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map(m => m[0].toLowerCase().replace(/\.$/, '')))]
    .filter(h => /\.[a-z]{2,}$/.test(h)).sort();
}
// นโยบาย: สคริปต์/สไตล์ inline ทั้งแอปใช้อยู่ ('unsafe-inline') · 'unsafe-eval' = ตัวตรวจเบราว์เซอร์รุ่นเก่า (D8) ใช้ new Function
// img/connect/frame = โดเมนที่รู้จัก — ชั้นข้อมูล XYZ/WMS ที่ผู้ใช้เพิ่มเอง/ไฟล์ที่ผู้ใช้นำเข้าจะขึ้นเป็น violation (คาดไว้แล้ว ไม่ใช่ข้อผิดพลาด)
function policy(html) {
  const H = cspHosts(html).filter(h => !NAV_ONLY.has(h)).concat(EXTRA).join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${H}`,
    `connect-src 'self' data: blob: ${H}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `frame-src 'self' ${H}`,
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
module.exports = { policy, cspHosts, EXTRA, NAV_ONLY, HEADER: 'Content-Security-Policy-Report-Only' };
