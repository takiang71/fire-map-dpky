// เปิดเว็บในเครื่อง พร้อมส่งต่อ /air4thai (Air4Thai ไม่เปิด CORS)
// ใช้: node scripts/serve.js [port] [โฟลเดอร์]   แล้วเข้า http://localhost:8000
//   เช่น node scripts/serve.js 8002 _site  เพื่อทดสอบผลของ build_site.js แบบเดียวกับบนโฮสต์
const http = require('http'), fs = require('fs'), path = require('path');
const { air4thai } = require('./lib/air4thai');
const CSP = require('./lib/csp');

const ROOT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..');
const PORT = +process.env.PORT || +process.argv[2] || 8000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

http.createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/air4thai') {
    try { const b = await air4thai(); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(b) }
    catch (e) { res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: e.message })) }
    return;
  }
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return }
    // E2: หน้า HTML ได้ CSP แบบรายงานอย่างเดียว (scripts/lib/csp.js — ไม่บล็อก) เหมือนที่ sw.js ใส่บนโฮสต์
    const hd = { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' };
    if (path.extname(f).toLowerCase() === '.html') hd[CSP.HEADER] = CSP.policy(b.toString('utf8'));
    res.writeHead(200, hd); res.end(b);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT));
