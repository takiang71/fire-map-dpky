// GeoTIFF + UTM ↔ ละติจูด/ลองจิจูด (scripts/lib/tiff.js — ใช้กับผลิตภัณฑ์ "ตามรอยเผา" กริด Sentinel-2)
const test = require('node:test'), assert = require('node:assert/strict'), zlib = require('zlib');
const { readTiff, utmToLL, llToUTM } = require('../scripts/lib/tiff');

// อ้างอิงอิสระ: สูตร Krüger อนุกรม n ถึงกำลัง 4 (WGS84) — แม่นระดับ ≤1 มม. ในโซน
function kruger(lon, lat, zone) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f), R = Math.PI / 180;
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180, 13 * n * n / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440, 61 * n ** 3 / 240 - 103 * n ** 4 / 140, 49561 * n ** 4 / 161280];
  const p = lat * R, l = (lon - (zone * 6 - 183)) * R, c = 2 * Math.sqrt(n) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - c * Math.atanh(c * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(l)), eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  al.forEach((v, j) => { const k = 2 * (j + 1); E += v * Math.cos(k * xi) * Math.sinh(k * eta); N += v * Math.sin(k * xi) * Math.cosh(k * eta) });
  return [500000 + k0 * A * E, k0 * A * N];
}

test('llToUTM ตรงกับสูตร Krüger ภายใน 1 ซม. ทั่วกลุ่มป่า (โซน 47 และ 48)', () => {
  let mx = 0;
  for (let lo = 100.8; lo <= 103.4; lo += 0.1) for (let la = 13.5; la <= 14.8; la += 0.1) {
    const z = lo < 102 ? 47 : 48, [E, N] = llToUTM(lo, la, z), [e, n] = kruger(lo, la, z);
    mx = Math.max(mx, Math.hypot(E - e, N - n));
  }
  assert.ok(mx < 0.01, `คลาดสูงสุด ${(mx * 1000).toFixed(2)} มม.`);
});

test('เส้นเมริเดียนกลาง/เส้นศูนย์สูตร และแปลงกลับไปกลับมาได้ (คลาด < 1 ซม.)', () => {
  assert.deepEqual(llToUTM(105, 0, 48).map(v => Math.round(v * 1000) / 1000), [500000, 0]);
  assert.deepEqual(utmToLL(500000, 0, 47), [99, 0]);
  for (const [lo, la] of [[101.37, 14.44], [102.177, 14.13], [102.9, 13.7]]) for (const z of [47, 48]) {
    const [E, N] = llToUTM(lo, la, z), [x, y] = utmToLL(E, N, z), [E2, N2] = llToUTM(x, y, z);
    assert.ok(Math.hypot(E2 - E, N2 - N) < 0.01, `${lo},${la} โซน ${z}`);
    assert.ok(Math.hypot(x - lo, y - la) < 1e-7, `${lo},${la} โซน ${z} ได้ ${x},${y}`);
  }
});

// GeoTIFF แถบเดียวแบบ little-endian: extra = [[tag, type, values]] (type 3=SHORT 4=LONG 12=DOUBLE) · data = Buffer ของ strip
function tiff(w, h, bps, comp, data, extra = []) {
  const E = [[256, 3, [w]], [257, 3, [h]], [258, 3, [bps]], [259, 3, [comp]], [273, 4, [0]], [277, 3, [1]], [278, 3, [h]], [279, 4, [data.length]], ...extra]
    .sort((a, b) => a[0] - b[0]).map(([tag, type, v]) => ({ tag, type, v }));
  const SZ = { 3: 2, 4: 4, 12: 8 }, ifd = 8;
  let p = ifd + 2 + E.length * 12 + 4;
  for (const e of E) if (SZ[e.type] * e.v.length > 4) { e.off = p; p += SZ[e.type] * e.v.length }
  const b = Buffer.alloc(p + data.length);
  b.write('II', 0, 'latin1'); b.writeUInt16LE(42, 2); b.writeUInt32LE(ifd, 4); b.writeUInt16LE(E.length, ifd);
  E.forEach((e, i) => {
    if (e.tag === 273) e.v = [p];
    const o = ifd + 2 + i * 12, at = e.off != null ? e.off : o + 8;
    b.writeUInt16LE(e.tag, o); b.writeUInt16LE(e.type, o + 2); b.writeUInt32LE(e.v.length, o + 4);
    if (e.off != null) b.writeUInt32LE(e.off, o + 8);
    e.v.forEach((v, k) => e.type === 3 ? b.writeUInt16LE(v, at + 2 * k) : e.type === 4 ? b.writeUInt32LE(v, at + 4 * k) : b.writeDoubleLE(v, at + 8 * k));
  });
  data.copy(b, p);
  return b;
}
// ขนาดพิกเซล 10 ม. · มุมบนซ้าย E 750,000 N 1,600,000 · EPSG 32647 (UTM 47N)
const GEO = [[33550, 12, [10, 10, 0]], [33922, 12, [0, 0, 0, 750000, 1600000, 0]], [34735, 3, [1, 1, 0, 1, 3072, 0, 1, 32647]]];

test('readTiff: 8 บิตไม่บีบอัด + พิกัดภูมิศาสตร์ (ขนาดพิกเซล/มุมบนซ้าย/EPSG)', () => {
  const t = readTiff(tiff(3, 2, 8, 1, Buffer.from([1, 2, 3, 4, 5, 255]), GEO));
  assert.deepEqual([t.w, t.h, t.spp, t.epsg, t.px, t.x0, t.y0], [3, 2, 1, 32647, [10, 10], 750000, 1600000]);
  assert.deepEqual([...t.band(0)], [1, 2, 3, 4, 5, 255]);
});

test('readTiff: 16 บิตมีเครื่องหมาย + Deflate + predictor 2 (ผลต่างตามแนวนอน)', () => {
  const V = [[100, -5, 300, -32768], [0, 7, 7, 32767]], raw = Buffer.alloc(16);
  V.forEach((r, y) => r.forEach((v, x) => raw.writeUInt16LE((v - (x ? r[x - 1] : 0) + 65536 * 2) & 65535, (y * 4 + x) * 2)));
  const t = readTiff(tiff(4, 2, 16, 8, zlib.deflateSync(raw), [[317, 3, [2]], [339, 3, [2]]]));
  assert.deepEqual([...t.band(0)], V.flat());
  assert.equal(t.epsg, null);
});

test('readTiff: ไฟล์ที่ไม่ใช่ TIFF แจ้งข้อผิดพลาดชัดเจน', () => {
  assert.throws(() => readTiff(Buffer.from([0x49, 0x49, 0x2b, 0, 8, 0, 0, 0])), /ไม่ใช่ TIFF/);
});
