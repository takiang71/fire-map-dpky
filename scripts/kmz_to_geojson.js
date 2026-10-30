// แปลง KMZ 5 ชุดใน data/kmz → data/geo.json (ลดจุด Douglas-Peucker ~12 ม.) แล้วฝังลง index.html
// รัน: node scripts/kmz_to_geojson.js · แทน kmz_to_geojson.py เดิม (ตรรกะเดียวกันทุกขั้น ผลตรงกับ geo ที่ฝังอยู่ทุกไบต์)
const fs = require('fs'), path = require('path');
const { unzip } = require('./lib/xlsx');

const ROOT = path.join(__dirname, '..');
const KMZ = { k1: 'conservation_areas_PAMO1.kmz', k2: 'dong_yai_wildlife_sanctuary.kmz', k3: 'fire_control_stations.kmz', k4: 'fire_responsibility_areas_2570.kmz', k5: 'Point47จุดเฝ้าระวัง69_Cp.kmz' };

// --- อ่าน KML แบบง่าย (Placemark ไม่ซ้อนกัน, description เป็น CDATA) ---
const xmlText = s => s.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1') === s
  ? s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(+c)).replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(parseInt(c, 16))).replace(/&amp;/g, '&')
  : s.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1');
const load = k => (unzip(fs.readFileSync(path.join(ROOT, 'data', 'kmz', KMZ[k])))['doc.kml'].toString('utf8').match(/<Placemark[\s>][\s\S]*?<\/Placemark>/g) || []);
// ลูกตรงของ Placemark (name/description) — ตัดส่วนเรขาคณิตออกก่อนค้น
const child = (pm, tag) => { const m = pm.replace(/<(Polygon|MultiGeometry|Point)[\s>][\s\S]*$/, '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)); return m ? xmlText(m[1]) : null };
const parseRing = txt => txt.split(/\s+/).filter(Boolean).map(p => p.split(',')).filter(a => a.length >= 2).map(a => [parseFloat(a[0]), parseFloat(a[1])]);
const ring = b => parseRing(b.match(/<coordinates>([\s\S]*?)<\/coordinates>/)[1]);
const polys = pm => (pm.match(/<Polygon[\s>][\s\S]*?<\/Polygon>/g) || []).map(pg => {
  const outer = (pg.match(/<outerBoundaryIs>[\s\S]*?<\/outerBoundaryIs>/) || [])[0], inner = pg.match(/<innerBoundaryIs>[\s\S]*?<\/innerBoundaryIs>/g) || [];
  return [outer ? ring(outer) : null, ...inner.map(ring)];
});
const firstCoord = pm => pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/)[1].split(',');

// --- ลดจุด ---
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = pts.map(() => false); keep[0] = keep[pts.length - 1] = true; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(), [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]; let d;
      if (L === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2 }
      if (d > md) { md = d; mi = i }
    }
    if (md > tol * tol) { keep[mi] = true; st.push([a, mi]); st.push([mi, b]) }
  }
  return pts.filter((p, i) => keep[i]);
}
const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const q = r[(i - 1 + r.length) % r.length]; s += r[i][0] * q[1] - q[0] * r[i][1] } return Math.abs(s) / 2 };
const r5 = x => +x.toFixed(5);
// round() ของ Python ปัดครึ่งเข้าหาเลขคู่
const pyRound = x => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1 };
function simp(poly, tol) {
  const res = [];
  poly.forEach((r, i) => {
    if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r = [...r, r[0]];
    let s = dp(r, tol);
    if (s.length < 4 || area(s) < tol * tol * 4) { if (i === 0) s = r; else return }
    res.push(s.map(([x, y]) => [r5(x), r5(y)]));
  });
  return res;
}

// --- ตารางคุณสมบัติใน description: เซลล์ชื่อฟิลด์ (อักษรอังกฤษ/_) ตามด้วยเซลล์ค่า ---
const unesc = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(+c)).replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(parseInt(c, 16))).replace(/&amp;/g, '&');
function cells(pm) {
  const d = (child(pm, 'description') || '').replace(/<style[\s\S]*?<\/style>/g, '');
  const c = [...d.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => unesc(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()), m = {};
  for (let i = 1; i < c.length - 1; i++) if (/^[A-Za-z_]+$/.test(c[i]) && !(c[i] in m)) m[c[i]] = c[i + 1];
  return m;
}
const P1 = 'สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)', P7 = 'สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)';
const paro = s => { s = (s || '').replace(/\s+/g, ''); return s.includes('ที่1') ? P1 : s.includes('ที่7') ? P7 : s };
const TOL = 0.00012;
const TYPE = { NPRK: 'อุทยานแห่งชาติ', WLDS: 'เขตรักษาพันธุ์สัตว์ป่า', P_WLDS: 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่า' };
const list = s => s.trim().replace(/^,+|,+$/g, '').replace(/\s*,\s*/g, ', ');

const cons = [];
for (const k of ['k1', 'k2']) for (const pm of load(k)) {
  const a = cells(pm), ps = polys(pm); let name, ty, pa, rai;
  if (k === 'k2') { name = 'เขตรักษาพันธุ์สัตว์ป่าดงใหญ่'; ty = 'WLDS'; pa = P7; rai = parseFloat(a.Area__RAI_ || 0) }
  else { name = a.NAME_TH || child(pm, 'name'); ty = a.TYPE; pa = paro(a.PARO); rai = parseFloat(a.AERA__RAI || 0) }
  cons.push({ type: 'Feature', properties: { name, kind: ty, kindTh: TYPE[ty] || ty, paro: pa, rai: pyRound(rai) }, geometry: { type: 'MultiPolygon', coordinates: ps.map(p => simp(p, TOL)) } });
}
const resp = [];
for (const pm of load('k4')) {
  const a = cells(pm), ps = polys(pm), g = k => (a[k] || '');
  resp.push({ type: 'Feature', properties: { station: g('Station').trim(), paro: paro(a.PARO), ftype: g('FType').trim(), loc: g('Location').trim().replace(/ตาพระตา/g, 'ตาพระยา'),
    tam: list(g('Subdistric')), amp: list(g('District')), prov: list(g('Province')), rai: Math.trunc(parseFloat(a.Area || 0) || 0) }, geometry: { type: 'MultiPolygon', coordinates: ps.map(p => simp(p, TOL)) } });
}
const stn = [];
for (const pm of load('k3')) {
  const a = cells(pm), co = firstCoord(pm);
  stn.push({ type: 'Feature', properties: { name: child(pm, 'name').trim(), paro: paro(a.PARO), tam: a.SUBDISTRIC || '', amp: a.District || '', prov: a.Province || '' }, geometry: { type: 'Point', coordinates: [r5(parseFloat(co[0])), r5(parseFloat(co[1]))] } });
}
// จุดเฝ้าระวังไฟป่า ปี 2569 (47 จุด) — แก้คำสะกดชนิดป่าที่พิมพ์ผิดในต้นฉบับ
const FTFIX = [['ป่าเบจพรรณ', 'ป่าเบญจพรรณ'], ['ป่าเต็มรัง', 'ป่าเต็งรัง']];
const ftype = s => { s = s.trim(); for (const [a, b] of FTFIX) s = s.split(a).join(b); return s && !s.startsWith('ป่า') ? 'ป่า' + s : s };
const wpt = [];
for (const pm of load('k5')) {
  const a = cells(pm), co = firstCoord(pm), g = k => (a[k] || '').trim();
  wpt.push({ type: 'Feature', properties: { name: child(pm, 'name').trim(), station: g('Station'), loc: g('Location'), ftype: ftype(g('Forest_typ')), vil: g('Village'), moo: g('Village_No'), tam: g('Subdistric'), amp: g('District'), prov: g('Provance'), utm: `${g('Zone')} ${g('UTM_X')}E ${g('UTM_Y')}N` },
    geometry: { type: 'Point', coordinates: [r5(parseFloat(co[0])), r5(parseFloat(co[1]))] } });
}
const G = { cons: { type: 'FeatureCollection', features: cons }, resp: { type: 'FeatureCollection', features: resp }, stn: { type: 'FeatureCollection', features: stn }, wpt: { type: 'FeatureCollection', features: wpt } };
for (const n of ['cons', 'resp', 'stn']) for (const f of G[n].features) f.properties.pn = f.properties.paro.includes('ที่ 1') ? '1' : '7';
const s = JSON.stringify(G);
fs.writeFileSync(path.join(ROOT, 'data', 'geo.json'), s);
// ฝังลง index.html (แทนบล็อก <script type="application/json" id="geo">) — ใช้ split/join ไม่ใช้ replace (กัน $ ในข้อความ)
const H = path.join(ROOT, 'index.html'), h = fs.readFileSync(H, 'utf8'), m = h.match(/(<script type="application\/json" id="geo">)([\s\S]*?)(<\/script>)/);
fs.writeFileSync(H, h.slice(0, m.index) + m[1] + s.split('</').join('<\\/') + m[3] + h.slice(m.index + m[0].length));
const npts = f => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0) : 1;
console.log('bytes', Buffer.byteLength(s));
for (const n in G) for (const f of G[n].features) console.log(n, f.properties.name || f.properties.station, npts(f), (f.properties.paro || '').slice(-14), f.properties.rai);
