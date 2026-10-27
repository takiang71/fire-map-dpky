// Cloudflare Worker: ส่งต่อข้อมูลสถานีวัดฝุ่น Air4Thai พร้อมเปิด CORS (เฉพาะ URL นี้ ไม่ใช่ proxy เปิด)
// วิธีใช้: dash.cloudflare.com → Workers & Pages → Create Worker → วางโค้ดนี้ → Deploy
// แล้วนำ URL ของ Worker (เช่น https://air4thai.<ชื่อ>.workers.dev) ไปใส่ AIR4THAI_PROXY ใน index.html
const SRC = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php';

export default {
  async fetch(req) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      const r = await fetch(SRC, { cf: { cacheTtl: 600, cacheEverything: true } }); // แคช 10 นาที
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...cors, 'content-type': 'application/json' } });
    }
  },
};
