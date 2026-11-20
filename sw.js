/* service worker ของแผนที่สถานการณ์ไฟป่า (D1 ของ docs/review-2569-11-15.md — 16 พ.ย. 69) · ลงทะเบียนจาก index.html เฉพาะ http(s) (ไม่ใช่ file://)
   build_site.js แทน SW_VERSION ด้วย sha ของ build และ SHELL ด้วยรายการ app shell (index.html, manifest, ไอคอน, ฟอนต์, MapLibre, data/emb/*)
   → deploy ใหม่ = ไฟล์นี้เปลี่ยน = เบราว์เซอร์ติดตั้งรุ่นใหม่เอง (skipWaiting) แล้วลบแคช shell รุ่นเก่า · หน้าเว็บขึ้นป้าย "อัปเดตแล้ว แตะเพื่อโหลดใหม่"
   เปิดจากโฟลเดอร์ repo (serve.js) = SW_VERSION 'dev' → ไม่ precache, หน้าเว็บ/โค้ดใช้เครือข่ายก่อน (แก้โค้ดแล้วเห็นทันที) ถอยมาใช้แคชเมื่อออฟไลน์
   กติกาแคช
     - app shell + ฟอนต์ + MapLibre (cdnjs) + data/emb/* + js/* (โค้ดโหลดเมื่อใช้ B1 เฟส 2 — precache คู่กับ index.html รุ่นเดียวกัน, ชื่อมี hash) = cache-first (แคช shell-<รุ่น>)
     - live.json summary.json watch.json air4thai.json wxsrc.json data/**.json = stale-while-revalidate (แคช data-v1, คีย์ไม่รวม query)
       · คำขอที่หน้าเว็บสั่ง cache:'no-store'/'no-cache' (เช่น live.json ทุก 5 นาที — ต้องการข้อมูลสด) = เครือข่ายก่อน ถอยมาใช้แคชเมื่อล้ม/เกิน 8 วิ
     - ไทล์ OpenFreeMap ที่ผู้ใช้กด "เก็บพื้นที่นี้ไว้ดูออฟไลน์" (แคช ofm-v1 — หน้าเว็บเขียนเอง) = ไทล์ .pbf cache-first · style/TileJSON/sprite/glyph เครือข่ายก่อน
     - API ภายนอก/ไทล์ Esri/Google/อื่น ๆ = ไม่แตะ (ไม่แคช) */
const SW_VERSION = 'dev'/*__SW_VERSION__*/, SHELL = [/*__SW_SHELL__*/];
// E2: Content-Security-Policy-Report-Only ของหน้าแรก (GitHub Pages ตั้ง header ไม่ได้ / <meta> ใช้กับ Report-Only ไม่ได้) — build_site.js ใส่นโยบายจาก scripts/lib/csp.js
// รายงานอย่างเดียว ไม่บล็อก · รุ่น dev = '' (serve.js ส่ง header เองอยู่แล้ว)
const CSP = ''/*__SW_CSP__*/;
const withCSP = r => { if (!CSP || !r || r.type === 'opaque' || r.headers.has('Content-Security-Policy-Report-Only')) return r;
  const h = new Headers(r.headers); h.set('Content-Security-Policy-Report-Only', CSP); return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h }) };
const DEV = SW_VERSION === 'dev', C_SHELL = 'shell-' + SW_VERSION, C_DATA = 'data-v1', C_OFM = 'ofm-v1';
const SCOPE = new URL(self.registration.scope), ROOT = SCOPE.pathname;
const MAPLIBRE = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/maplibre-gl\//, OFM = /^https:\/\/tiles\.openfreemap\.org\//;
const SHELL_RE = /^(index\.html|manifest\.webmanifest|fonts\/.+\.woff2|img\/icon[\w-]*\.(png|svg)|data\/emb\/.+\.json|js\/\w+\.[0-9a-f]{8}\.js)$/;
const DATA_RE = /^(live|summary|watch|air4thai|wxsrc|burn_summary|risk)\.json$|^data\/.+\.json$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    if (SHELL.length) { const c = await caches.open(C_SHELL); await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))) }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== C_SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ sw: SW_VERSION });
});

const keyOf = u => { const x = new URL(u); x.search = ''; x.hash = ''; return x.href };
async function cacheFirst(req, name, key = req) {
  const c = await caches.open(name), hit = await c.match(key, { ignoreSearch: true });
  if (hit) return hit;
  const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(key, r.clone()); return r;
}
async function networkFirst(req, name, key, ms = 8000) {
  const c = await caches.open(name);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), ms))]);
    if (r.ok) c.put(key, r.clone()); return r;
  } catch (err) { const hit = await c.match(key); if (hit) return hit; throw err }
}
async function staleWhileRevalidate(req, name, key, ev) {
  const c = await caches.open(name), hit = await c.match(key);
  const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r });
  if (hit) { ev.waitUntil(net.catch(() => { })); return hit }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === SCOPE.origin && url.pathname.startsWith(ROOT)) {
    const p = url.pathname.slice(ROOT.length);
    // หน้าแรก (รวมลิงก์ตรง ?hs= ?pts= …) — หน้าอื่นใต้ scope (คู่มือ) ไม่แตะ
    if (req.mode === 'navigate') {
      if (p !== '' && p !== 'index.html') return;
      const k = new URL('index.html', SCOPE).href;
      e.respondWith((DEV ? networkFirst(new Request(k), C_SHELL, k) : cacheFirst(new Request(k), C_SHELL, k).catch(() => networkFirst(req, C_SHELL, k))).then(withCSP));
      return;
    }
    if (SHELL_RE.test(p)) { e.respondWith(DEV ? networkFirst(req, C_SHELL, keyOf(req.url)) : cacheFirst(req, C_SHELL, keyOf(req.url))); return }
    if (DATA_RE.test(p)) {
      const k = keyOf(req.url);
      e.respondWith(req.cache === 'no-store' || req.cache === 'no-cache' || req.cache === 'reload' ? networkFirst(req, C_DATA, k) : staleWhileRevalidate(req, C_DATA, k, e));
    }
    return;
  }
  if (MAPLIBRE.test(req.url)) { e.respondWith(cacheFirst(req, C_SHELL)); return }
  if (OFM.test(req.url)) {
    const k = keyOf(req.url);
    e.respondWith(/\.pbf$/.test(url.pathname) && !/\/fonts\//.test(url.pathname)
      ? caches.open(C_OFM).then(c => c.match(k)).then(h => h || fetch(req))
      : caches.open(C_OFM).then(c => fetch(req).then(r => { if (r.ok) c.match(k).then(h => h && c.put(k, r.clone())); return r }).catch(() => c.match(k).then(h => h || Promise.reject(new Error('offline'))))));
  }
});
