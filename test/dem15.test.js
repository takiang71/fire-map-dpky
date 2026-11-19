// ความสูง GEM-15 (scripts/build_dem15.js): ตัวอ่าน COG (lib/cog.js), เขียน PNG Terrarium (lib/png.js), d15Has ในหน้าเว็บ, ชุดไทล์ data/dem15 ครบตามดัชนี
const test = require('node:test'), assert = require('node:assert/strict'), zlib = require('zlib'), fs = require('fs'), path = require('path');
const { openCOG } = require('../scripts/lib/cog');
const { readPNG, rgbPNG, terrariumRGB } = require('../scripts/lib/png');
const { grab, load } = require('./helpers.cjs');

// BigTIFF แบบไทล์ 2×2 แผ่น (4×4 px) float32 Deflate · UTM 47N · ค่า = y*100 + x (แผ่นขวาล่างเว้นว่าง = ไม่มีข้อมูล)
function bigTiff() {
  const W = 8, TW = 4, tiles = [], nodata = 3;
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    if (ty * 2 + tx === nodata) { tiles.push(Buffer.alloc(0)); continue }
    const b = Buffer.alloc(TW * TW * 4); for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) b.writeFloatLE((ty * TW + j) * 100 + tx * TW + i, (j * TW + i) * 4);
    tiles.push(zlib.deflateSync(b));
  }
  const ext = [], E = []; let at = 16;
  const tag = (t, typ, vals) => E.push({ t, typ, vals });
  tag(256, 3, [W]); tag(257, 3, [W]); tag(258, 3, [32]); tag(259, 3, [8]); tag(277, 3, [1]); tag(322, 3, [TW]); tag(323, 3, [TW]); tag(339, 3, [3]);
  tag(33550, 12, [15, 15, 0]); tag(33922, 12, [0, 0, 0, 706560, 1674240, 0]); tag(34735, 3, [1, 1, 0, 1, 3072, 0, 1, 32647]);
  tag(324, 16, [0, 0, 0, 0]); tag(325, 16, tiles.map(t => t.length));
  const SZ = { 3: 2, 12: 8, 16: 8 }, ifdLen = 8 + E.length * 20 + 8, ifd = Buffer.alloc(ifdLen);
  let extOff = at + ifdLen; const ent = [];
  for (const e of E) { const n = e.vals.length * SZ[e.typ]; e.off = n <= 8 ? null : extOff; if (n > 8) extOff += n }
  let dataOff = extOff; const toff = tiles.map(t => { const o = t.length ? dataOff : 0; dataOff += t.length; return o });
  E.find(e => e.t === 324).vals = toff;
  const wr = (b, o, typ, v) => typ === 3 ? b.writeUInt16LE(v, o) : typ === 12 ? b.writeDoubleLE(v, o) : b.writeBigUInt64LE(BigInt(v), o);
  ifd.writeBigUInt64LE(BigInt(E.length), 0);
  E.forEach((e, i) => {
    const o = 8 + i * 20; ifd.writeUInt16LE(e.t, o); ifd.writeUInt16LE(e.typ, o + 2); ifd.writeBigUInt64LE(BigInt(e.vals.length), o + 4);
    if (e.off === null) e.vals.forEach((v, k) => wr(ifd, o + 12 + k * SZ[e.typ], e.typ, v));
    else { ifd.writeBigUInt64LE(BigInt(e.off), o + 12); const b = Buffer.alloc(e.vals.length * SZ[e.typ]); e.vals.forEach((v, k) => wr(b, k * SZ[e.typ], e.typ, v)); ext.push(b) }
  });
  const head = Buffer.alloc(16); head.write('II', 0, 'latin1'); head.writeUInt16LE(43, 2); head.writeUInt16LE(8, 4); head.writeBigUInt64LE(16n, 8);
  return Buffer.concat([head, ifd, ...ext, ...tiles]);
}

test('openCOG อ่าน BigTIFF แบบไทล์ Deflate float32: ขนาด/โซน/มุม/ค่าทุกแผ่น และแผ่นว่าง = null', async () => {
  const f = bigTiff(), c = await openCOG('mem://', { fetch: async (a, n) => f.subarray(a, a + n), head: 4096 });
  assert.deepEqual([c.w, c.h, c.tw, c.th, c.spp, c.zone, c.e0, c.n0, c.px, c.ntx, c.nty], [8, 8, 4, 4, 1, 47, 706560, 1674240, 15, 2, 2]);
  const t = await c.tile(1, 0); assert.equal(t[0], 4); assert.equal(t[15], 307);
  assert.equal((await c.tile(0, 1))[5], 501);
  assert.equal(await c.tile(1, 1), null);
});

test('terrariumRGB + rgbPNG → readPNG ได้ความสูงเดิมภายในครึ่งช่วงปัด (q 0.25 ม.) รวมค่าติดลบ/ขอบ', () => {
  const e = new Float32Array(65536); for (let i = 0; i < 65536; i++) e[i] = -50 + i * 0.0371 + Math.sin(i) * 3;
  e[7] = NaN;
  const d = readPNG(rgbPNG(256, 256, terrariumRGB(e, 0.25))).rgba;
  let mx = 0; for (let i = 0; i < 65536; i++) { if (i === 7) continue; const v = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768; mx = Math.max(mx, Math.abs(v - e[i])) }
  assert.ok(mx <= 0.125 + 1e-6, 'คลาดสูงสุด ' + mx);
  assert.equal(d[7 * 4] * 256 + d[7 * 4 + 1] - 32768, 0); /* NaN → 0 ม. */
});

test('ixHas/d15Has: ซูม 13 ตามช่วงแถว · ซูมต่ำ = มีลูกอยู่ในชุด · นอกช่วงซูม/ไม่มีดัชนี = false (ใช้ร่วม dem15/chm15)', () => {
  const src = grab(/function ixHas[\s\S]*?return true\}return false\}\nconst d15Has=[^;]*;/), D15 = { ix: null };
  const { d15Has } = load(src, ['d15Has'], { D15 });
  assert.equal(d15Has(13, 100, 50), false);
  D15.ix = { zmin: 10, zmax: 13, rows: { 50: [100, 102, 110, 110], 51: [96, 96] } };
  assert.equal(d15Has(13, 101, 50), true); assert.equal(d15Has(13, 103, 50), false); assert.equal(d15Has(13, 110, 50), true); assert.equal(d15Has(13, 96, 51), true);
  assert.equal(d15Has(12, 48, 25), true);  /* ลูก 96–97 × 50–51 มี 96,51 */
  assert.equal(d15Has(12, 52, 25), false); /* ลูก 104–105 */
  assert.equal(d15Has(10, 12, 6), true);
  assert.equal(d15Has(9, 6, 3), false); assert.equal(d15Has(14, 202, 100), false);
});

test('maskFn (lib/gem15): สี่เหลี่ยมในไทล์เดียว = จำนวนพิกเซลตามขอบ · รูเจาะ (วงใน) ไม่นับ · รูปที่สองซ้อน = รูปแรกได้ก่อน · ไทล์อื่นว่าง', () => {
  const { maskFn, x2lon, y2lat } = require('../scripts/lib/gem15');
  const z = 13, x = 6403, y = 3764, ll = (px, py) => [x2lon(x + px / 256, z), y2lat(y + py / 256, z)];
  const sq = (a, b, c, d) => [ll(a, b), ll(c, b), ll(c, d), ll(a, d), ll(a, b)];
  const F = [{ name: 'A', rings: [sq(10, 20, 110, 70), sq(30, 30, 50, 40)] }, { name: 'B', rings: [sq(100, 60, 200, 100)] }];
  const m = maskFn(F, z)(x, y); let a = 0, b = 0; for (const v of m) { if (v === 0) a++; else if (v === 1) b++ }
  assert.equal(a, 100 * 50 - 20 * 10);
  assert.equal(b, 100 * 40 - 10 * 10);
  assert.equal(maskFn(F, z)(x + 1, y).every(v => v === -1), true);
});

test('grayPNG → readPNG ได้ค่าเดิมทุกพิกเซล (ไทล์ความสูงเรือนยอด)', () => {
  const { grayPNG } = require('../scripts/lib/png');
  const px = new Uint8Array(65536).map((_, i) => i % 7 === 0 ? 255 : (i * 13) % 61), d = readPNG(grayPNG(256, 256, px)).rgba;
  for (let i = 0; i < 65536; i++) if (d[i * 4] !== px[i]) assert.fail('พิกเซล ' + i);
});

for (const DIR of ['dem15', 'chm15']) test(`data/${DIR}: ทุกแผ่นในดัชนีมีไฟล์ PNG ครบซูม zmin–13 และไม่มีไฟล์เกิน`, { skip: !fs.existsSync(path.join(__dirname, '..', 'data', DIR, 'index.json')) }, () => {
  const D = path.join(__dirname, '..', 'data', DIR), ix = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
  let L = []; for (const y in ix.rows) { const R = ix.rows[y]; for (let i = 0; i < R.length; i += 2) for (let x = R[i]; x <= R[i + 1]; x++) L.push([x, +y]) }
  assert.ok(L.length > 300, 'ไทล์ซูม 13 น้อยผิดปกติ ' + L.length);
  for (let z = ix.zmax; z >= ix.zmin; z--) {
    const want = new Set(L.map(([x, y]) => x + '/' + y)), have = new Set();
    for (const x of fs.readdirSync(path.join(D, String(z)))) for (const f of fs.readdirSync(path.join(D, String(z), x))) have.add(x + '/' + f.replace('.png', ''));
    assert.deepEqual([...want].filter(k => !have.has(k)), [], 'ซูม ' + z + ' ขาดไฟล์');
    assert.deepEqual([...have].filter(k => !want.has(k)), [], 'ซูม ' + z + ' มีไฟล์เกิน');
    L = [...new Set(L.map(([x, y]) => (x >> 1) + ',' + (y >> 1)))].map(k => k.split(',').map(Number));
  }
});
