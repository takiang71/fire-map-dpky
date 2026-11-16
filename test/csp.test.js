// E1 (SRI) + E2 (CSP แบบรายงานอย่างเดียว) — docs/review-2569-11-15.md
//  - ทุก <script src>/<link href> ภายนอกใน index.html + manual มี integrity sha384 + crossorigin="anonymous" · ตัวโหลดภายหลัง (xlsx, proj4) ตั้ง integrity/crossOrigin
//  - นโยบาย scripts/lib/csp.js: ครอบทุกโดเมนที่ index.html ใช้ (grep https://) · ส่งเป็น Report-Only เท่านั้น (ห้ามบังคับใช้จนผู้ใช้อนุมัติ)
//  - sw.js ฉบับเผยแพร่ใส่ header Report-Only ให้หน้าแรก (GitHub Pages ตั้ง header ไม่ได้) และไม่ใส่ header แบบบังคับ
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, HTML } = require('./helpers.cjs');
const CSP = require('../scripts/lib/csp');
const { pwaFiles } = require('../scripts/build_site');

test('E1: <script>/<link> ภายนอกทุกตัว (index.html + คู่มือ) มี integrity sha384 + crossorigin="anonymous"', () => {
  for (const f of ['index.html', 'manual/index.html']) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const tags = [...h.matchAll(/<(script|link)\b[^>]*\b(?:src|href)="https?:\/\/[^"]+"[^>]*>/g)].map(m => m[0]).filter(t => !/rel="(canonical|preconnect|dns-prefetch)"/.test(t) && !/property=|name=/.test(t));
    for (const t of tags) {
      assert.match(t, /\sintegrity="sha384-[A-Za-z0-9+/]{64}"/, f + ': ' + t);
      assert.match(t, /\scrossorigin="anonymous"/, f + ': ' + t);
    }
    if (f === 'index.html') assert.equal(tags.length, 2, 'MapLibre js+css');
  }
  // ตัวโหลดภายหลัง: s.src='https://…' ต้องตามด้วย integrity + crossOrigin
  const dyn = [...HTML.matchAll(/s\.src='(https:\/\/[^']+)';([^;]*;[^;]*;)/g)];
  assert.equal(dyn.length, 2, 'xlsx + proj4');
  for (const m of dyn) assert.match(m[2], /^s\.integrity='sha384-[A-Za-z0-9+/]{64}';s\.crossOrigin='anonymous';$/, m[1]);
  // รุ่นคงที่ (ห้ามอัปเกรด MapLibre ในรอบ E1)
  assert.match(HTML, /maplibre-gl\/4\.7\.1\/maplibre-gl\.min\.js"/);
});

test('E2: นโยบาย CSP ครอบทุกโดเมนที่ index.html โหลด · เป็น Report-Only · มีโดเมนที่โค้ดประกอบเอง', () => {
  const P = CSP.policy(HTML), dir = n => (P.split('; ').find(d => d.startsWith(n + ' ')) || '');
  assert.equal(CSP.HEADER, 'Content-Security-Policy-Report-Only');
  for (const h of CSP.cspHosts(HTML)) if (!CSP.NAV_ONLY.has(h)) { assert.ok(dir('connect-src').includes(h), 'connect-src ' + h); assert.ok(dir('img-src').includes(h), 'img-src ' + h) }
  for (const h of ['https://wildlandfire.thairen.net.th', 'https://tiles.openfreemap.org', 'https://server.arcgisonline.com', 'https://*.google.com', 'https://tilecache.rainviewer.com', 'https://embed.windy.com'])
    assert.ok(dir('connect-src').includes(h) || dir('frame-src').includes(h), h);
  assert.match(dir('script-src'), /https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(dir('script-src'), /'unsafe-eval'/, 'D8 ใช้ new Function');
  assert.match(dir('object-src'), /'none'/);
  assert.ok(!/report-uri|upgrade-insecure|block-all/.test(P));
  // index.html ไม่มี CSP แบบบังคับ (meta http-equiv="Content-Security-Policy")
  assert.doesNotMatch(HTML, /http-equiv="Content-Security-Policy"/i);
});

// sw.js ใน vm: คำขอหน้าแรก (navigate) → คำตอบมี header Report-Only (ไม่ใช่แบบบังคับ) · มี header อยู่แล้ว = ไม่แตะ
async function nav(src, cached) {
  const H = {}, Hd = globalThis.Headers, Rs = globalThis.Response;
  const ctx = { self: { registration: { scope: 'https://takiang71.github.io/fire-map-dpky/' }, addEventListener: (t, f) => H[t] = f, skipWaiting: async () => { }, clients: { claim: async () => { } } },
    caches: { open: async () => ({ match: async () => cached, put: async () => { }, addAll: async () => { } }), keys: async () => [], delete: async () => true },
    fetch: async () => cached, URL, Headers: Hd, Response: Rs, Request: class { constructor(u) { this.url = u } }, Promise, setTimeout };
  vm.runInNewContext(src, ctx);
  let p; H.fetch({ request: { method: 'GET', url: 'https://takiang71.github.io/fire-map-dpky/?hs=14,101', mode: 'navigate', cache: 'default' }, respondWith(x) { p = x }, waitUntil() { } });
  return p;
}
test('E2: sw.js ฉบับเผยแพร่ใส่ Content-Security-Policy-Report-Only ให้หน้าแรก · ฉบับ dev ไม่ใส่ · ไม่มี header บังคับ', async () => {
  const A = pwaFiles(HTML, {});
  assert.equal(A.csp, CSP.policy(HTML));
  assert.doesNotMatch(A.sw, /\/\*__SW_CSP__\*\//);
  const r = await nav(A.sw, new Response('<!doctype html><p>x', { status: 200, headers: { 'Content-Type': 'text/html' } }));
  assert.equal(r.headers.get('Content-Security-Policy-Report-Only'), A.csp);
  assert.equal(r.headers.get('Content-Security-Policy'), null);
  assert.equal(r.headers.get('Content-Type'), 'text/html');
  assert.equal(await r.text(), '<!doctype html><p>x');
  const keep = await nav(A.sw, new Response('y', { headers: { 'Content-Security-Policy-Report-Only': "default-src 'self'" } }));
  assert.equal(keep.headers.get('Content-Security-Policy-Report-Only'), "default-src 'self'");
  const dev = await nav(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), new Response('z'));
  assert.equal(dev.headers.get('Content-Security-Policy-Report-Only'), null, 'repo (dev) ไม่ใส่ — serve.js ส่ง header เอง');
});

test('E2: serve.js และ check_site ส่ง CSP แบบรายงานอย่างเดียวให้หน้า HTML · หน้าเว็บฟัง securitypolicyviolation', () => {
  for (const f of ['scripts/serve.js', 'scripts/check_site.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(s, /require\('\.\/lib\/csp'\)/, f); assert.match(s, /CSP\.HEADER\]\s*=\s*CSP\.policy\(/, f);
  }
  assert.match(HTML, /addEventListener\('securitypolicyviolation',/);
  assert.match(HTML, /window\.__CSPV=\[\]/);
});
