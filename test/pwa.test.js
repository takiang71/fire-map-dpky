// D1: PWA/ออฟไลน์ — manifest, sw.js (รุ่น/รายการ shell จาก build_site.pwaFiles, กติกาว่าคำขอไหนแคช/ไม่แตะ), pwaTiles (≤300 แผ่น ซูม 9–13)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, HTML, grab, load } = require('./helpers.cjs');
const { pwaFiles } = require('../scripts/build_site');

test('manifest: ชื่อ/เริ่มที่หน้าแรก/standalone/ไอคอน 192+512+maskable มีไฟล์จริง · index.html ลิงก์ manifest', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name && m.short_name.length <= 15, m.short_name);
  assert.deepEqual([m.start_url, m.scope, m.display, m.lang], ['./', './', 'standalone', 'th']);
  for (const s of ['192x192', '512x512']) assert.ok(m.icons.some(i => i.sizes === s && i.type === 'image/png'), s);
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
  assert.match(HTML, /<link rel="manifest" href="manifest\.webmanifest">/);
});

test('pwaFiles: sw.js ฉบับเผยแพร่มีรุ่น (sha) + รายการ shell · HTML เปลี่ยน = รุ่นเปลี่ยน', () => {
  const ix = { geo: 'data/emb/geo.11111111.json' };
  const a = pwaFiles(HTML, ix), b = pwaFiles(HTML + ' ', ix);
  assert.match(a.ver, /^[0-9a-f]{12}$/); assert.notEqual(a.ver, b.ver);
  assert.deepEqual(pwaFiles(HTML, ix).ver, a.ver, 'เหมือนเดิม = รุ่นเดิม');
  assert.ok(a.shell.includes('index.html') && a.shell.includes('manifest.webmanifest') && a.shell.includes('data/emb/geo.11111111.json'));
  assert.equal(a.shell.filter(s => /^fonts\/.+\.woff2$/.test(s)).length, 6);
  assert.ok(a.shell.some(s => /maplibre-gl\.min\.js$/.test(s)) && a.shell.some(s => /maplibre-gl\.min\.css$/.test(s)));
  assert.doesNotMatch(a.sw, /'dev'\/\*__SW_VERSION__\*\/|\/\*__SW_SHELL__\*\//);
  assert.ok(a.sw.includes(`const SW_VERSION = '${a.ver}'`));
  new vm.Script(a.sw); // syntax
});

// โหลด sw.js ใน vm แล้วยิงเหตุการณ์ fetch จำลอง — ดูว่าคำขอไหนถูก respondWith (แคช) และไหนปล่อยผ่าน
function sw(src) {
  const H = {}, ctx = { self: { registration: { scope: 'https://takiang71.github.io/fire-map-dpky/' }, addEventListener: (t, f) => H[t] = f, skipWaiting: async () => { }, clients: { claim: async () => { } } },
    caches: { open: async () => ({ match: async () => undefined, put: async () => { }, addAll: async () => { } }), keys: async () => [], delete: async () => true },
    fetch: async () => ({ ok: true, clone() { return this } }), URL, Request: class { constructor(u) { this.url = u } }, Promise, setTimeout };
  vm.runInNewContext(src, ctx);
  const route = (url, o = {}) => { let hit = false; H.fetch({ request: { method: 'GET', url, mode: o.mode || 'cors', cache: o.cache || 'default' }, respondWith(p) { hit = true; p.catch(() => { }) }, waitUntil() { } }); return hit };
  return { H, route };
}
test('sw.js: แคชเฉพาะของเว็บเอง/MapLibre/OpenFreeMap · ไม่แตะ API ตรง ไทล์ Esri/Google และหน้าคู่มือ', () => {
  const { route, H } = sw(pwaFiles(HTML, {}).sw), S = 'https://takiang71.github.io/fire-map-dpky/';
  assert.ok(H.install && H.activate && H.fetch);
  const yes = [[S, { mode: 'navigate' }], [S + 'index.html?hs=1', { mode: 'navigate' }], [S + 'fonts/noto-sans-thai-thai-400.woff2'], [S + 'data/emb/adata.502b847f.json'],
    [S + 'live.json?t=1', { cache: 'no-store' }], [S + 'summary.json'], [S + 'data/fwi/index.json'], [S + 'data/burn/b4/x.json?v=2'],
    ['https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js'], ['https://tiles.openfreemap.org/planet/20251105/12/3245/1888.pbf'], ['https://tiles.openfreemap.org/styles/positron']];
  for (const [u, o] of yes) assert.equal(route(u, o), true, 'ต้องแคช: ' + u);
  const no = [[S + 'manual/index.html', { mode: 'navigate' }], [S + 'manual/img/a.jpg'], [S + 'data/fuel/202601/12/1/2.png'],
    ['https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/alerts?x=1'], ['https://api.open-meteo.com/v1/forecast?latitude=14'],
    ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/9/1/2'], ['https://mt1.google.com/vt/lyrs=s&x=1&y=2&z=3'],
    ['https://takiang71.github.io/other/live.json']];
  for (const [u, o] of no) assert.equal(route(u, o), false, 'ห้ามแตะ: ' + u);
});

test('pwaTiles: ไม่เกิน 300 แผ่น ซูมเริ่ม 9 ต่อเนื่อง · กรอบเล็กได้ถึงซูม 13 · กรอบใหญ่มาก = ไม่เก็บ', () => {
  const src = grab(/const lx=\(lo,z\)=>[^\n]*/) + '\n' + grab(/function pwaTiles\(bb\)\{[\s\S]*?\n return\{tiles:out,zmax\}\}/);
  const { pwaTiles } = load('const ZS=[9,13],MAXT=300;\n' + src, ['pwaTiles']);
  const all = pwaTiles([101.1, 13.6, 103.3, 14.7]); // ทั้งกลุ่มป่า
  assert.ok(all.tiles.length <= 300 && all.tiles.length > 0, String(all.tiles.length));
  assert.deepEqual([...new Set(all.tiles.map(t => t[0]))], Array.from({ length: all.zmax - 8 }, (_, i) => 9 + i));
  const small = pwaTiles([101.40, 14.40, 101.50, 14.47]); // ~11×8 กม.
  assert.equal(small.zmax, 13); assert.ok(small.tiles.length <= 300);
  const n13 = small.tiles.filter(t => t[0] === 13);
  assert.equal(new Set(n13.map(t => t.join())).size, n13.length, 'ไม่ซ้ำ');
  assert.equal(pwaTiles([90, 5, 115, 25]).tiles.length, 0, 'ทั้งภูมิภาค');
});
