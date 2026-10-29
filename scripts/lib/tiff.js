// อ่าน GeoTIFF แบบง่าย (ไม่ต้องติดตั้งแพ็กเกจ) — พอสำหรับผลิตภัณฑ์ "ตามรอยเผา" (LZW/Deflate/ไม่บีบอัด, แถบละแถว/หลายแถว, int/uint 8–16 บิต)
// + แปลงพิกัด UTM ↔ ละติจูด/ลองจิจูด (WGS84) ใช้กับกริด Sentinel-2
const zlib = require('zlib');

const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 11: 4, 12: 8, 16: 8 };
function readTiff(b) {
  const le = b[0] === 0x49, u16 = o => le ? b.readUInt16LE(o) : b.readUInt16BE(o), u32 = o => le ? b.readUInt32LE(o) : b.readUInt32BE(o),
    f64 = o => le ? b.readDoubleLE(o) : b.readDoubleBE(o);
  if (u16(2) !== 42) throw new Error('ไม่ใช่ TIFF (หรือเป็น BigTIFF)');
  const ifd = u32(4), n = u16(ifd), T = {};
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), typ = u16(e + 2), cnt = u32(e + 4), off = SZ[typ] * cnt <= 4 ? e + 8 : u32(e + 8);
    if (typ === 2) { T[tag] = b.toString('latin1', off, off + cnt - 1); continue }
    const v = new Array(cnt);
    for (let k = 0; k < cnt; k++) { const o = off + k * SZ[typ]; v[k] = typ === 3 ? u16(o) : typ === 4 ? u32(o) : typ === 12 ? f64(o) : typ === 8 ? (le ? b.readInt16LE(o) : b.readInt16BE(o)) : b[o] }
    T[tag] = v;
  }
  const w = T[256][0], h = T[257][0], bps = T[258][0], comp = T[259][0], spp = (T[277] || [1])[0], planar = (T[284] || [1])[0],
    pred = (T[317] || [1])[0], signed = (T[339] || [1])[0] === 2, rps = (T[278] || [h])[0], offs = T[273], cnts = T[279];
  if (T[322]) throw new Error('ยังไม่รองรับ TIFF แบบไทล์');
  if (bps !== 8 && bps !== 16) throw new Error('ไม่รองรับ ' + bps + ' บิต');
  const scale = T[33550], tie = T[33922], geo = T[34735] || [];
  // หาเลข EPSG ของระบบพิกัด (ProjectedCSTypeGeoKey 3072)
  let epsg = null; for (let i = 4; i + 3 < geo.length; i += 4) if (geo[i] === 3072 && geo[i + 1] === 0) epsg = geo[i + 3];
  const spb = Math.ceil(h / rps), BY = bps / 8;
  function strip(i) {
    const raw = b.subarray(offs[i], offs[i] + cnts[i]);
    return comp === 1 ? raw : comp === 5 ? lzw(raw) : comp === 8 || comp === 32946 ? zlib.inflateSync(raw) : (() => { throw new Error('ไม่รองรับการบีบอัดแบบ ' + comp) })();
  }
  // อ่านแบนด์ที่ k (เริ่ม 0) → Int32Array ขนาด w*h
  function band(k) {
    if (planar !== 2 && spp > 1 && k) throw new Error('รองรับเฉพาะแบนด์แยก (PlanarConfiguration=2) เมื่อมีหลายแบนด์');
    const out = new Int32Array(w * h), ch = planar === 2 ? 1 : spp;
    for (let s = 0; s < spb; s++) {
      const d = strip(planar === 2 ? k * spb + s : s), y0 = s * rps, rows = Math.min(rps, h - y0), rowB = w * ch * BY;
      for (let r = 0; r < rows; r++) {
        const o = r * rowB, base = (y0 + r) * w;
        if (pred === 2) for (let x = ch; x < w * ch; x++) {
          if (BY === 1) d[o + x] = (d[o + x] + d[o + x - ch]) & 255;
          else { const a = d[o + 2 * x] | d[o + 2 * x + 1] << 8, p = d[o + 2 * (x - ch)] | d[o + 2 * (x - ch) + 1] << 8, v = (a + p) & 65535; d[o + 2 * x] = v & 255; d[o + 2 * x + 1] = v >> 8 }
        }
        for (let x = 0; x < w; x++) {
          const p = o + x * ch * BY;
          let v = BY === 1 ? d[p] : le ? d[p] | d[p + 1] << 8 : d[p] << 8 | d[p + 1];
          if (signed) v = BY === 1 ? (v << 24 >> 24) : (v << 16 >> 16);
          out[base + x] = v;
        }
      }
    }
    return out;
  }
  return { w, h, spp, epsg, px: scale ? [scale[0], scale[1]] : null, x0: tie ? tie[3] - tie[0] * scale[0] : null, y0: tie ? tie[4] + tie[1] * scale[1] : null, band, tags: T };
}

// LZW แบบ TIFF (MSB-first, รหัสเริ่ม 9 บิต, ขยายก่อนเต็มหนึ่งรหัส "early change")
function lzw(src) {
  let out = Buffer.allocUnsafe(Math.max(1024, src.length * 4)), op = 0;
  const pre = new Int32Array(4096), suf = new Uint8Array(4096), len = new Uint16Array(4096), first = new Uint8Array(4096);
  for (let i = 0; i < 256; i++) { pre[i] = -1; suf[i] = i; len[i] = 1; first[i] = i }
  let bits = 9, next = 258, old = -1, bp = 0;
  const total = src.length * 8;
  const put = c => {
    const L = len[c]; if (op + L > out.length) { const nb = Buffer.allocUnsafe(Math.max(out.length * 2, op + L)); out.copy(nb, 0, 0, op); out = nb }
    let p = op + L - 1; for (let k = c; k >= 0; k = pre[k]) out[p--] = suf[k]; op += L;
  };
  while (bp + bits <= total) {
    let c = 0; for (let i = 0; i < bits; i++) { c = c << 1 | (src[(bp + i) >> 3] >> (7 - ((bp + i) & 7)) & 1) } bp += bits;
    if (c === 257) break;
    if (c === 256) { bits = 9; next = 258; old = -1; continue }
    if (old < 0) { put(c); old = c; continue }
    if (c < next) { put(c); if (next < 4096) { pre[next] = old; suf[next] = first[c]; len[next] = len[old] + 1; first[next] = first[old]; next++ } }
    else { if (next < 4096) { pre[next] = old; suf[next] = first[old]; len[next] = len[old] + 1; first[next] = first[old]; next++ } put(c) }
    old = c;
    if (next + 1 >= 1 << bits && bits < 12) bits++;
  }
  return out.subarray(0, op);
}

// UTM (WGS84) — สูตร Krüger แบบย่อ (คลาดเคลื่อนระดับมิลลิเมตรในโซน)
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996, E2 = F * (2 - F), EP2 = E2 / (1 - E2), RAD = Math.PI / 180;
function utmToLL(E, N, zone) {
  const x = E - 500000, M = N / K0, mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256)),
    e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2)),
    p = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu),
    s = Math.sin(p), c = Math.cos(p), t = Math.tan(p), n1 = A / Math.sqrt(1 - E2 * s * s), t1 = t * t, c1 = EP2 * c * c,
    r1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5), d = x / (n1 * K0);
  const lat = p - (n1 * t / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720);
  const lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120) / c;
  return [(zone * 6 - 183) + lon / RAD, lat / RAD];
}
function llToUTM(lon, lat, zone) {
  const la = lat * RAD, s = Math.sin(la), c = Math.cos(la), t = Math.tan(la), n = A / Math.sqrt(1 - E2 * s * s), T2 = t * t, C = EP2 * c * c,
    a = c * (lon - (zone * 6 - 183)) * RAD,
    M = A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256) * la - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * la) + (15 * E2 * E2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * la) - (35 * E2 ** 3 / 3072) * Math.sin(6 * la));
  const E = K0 * n * (a + (1 - T2 + C) * a ** 3 / 6 + (5 - 18 * T2 + T2 * T2 + 72 * C - 58 * EP2) * a ** 5 / 120) + 500000;
  const N = K0 * (M + n * t * (a * a / 2 + (5 - T2 + 9 * C + 4 * C * C) * a ** 4 / 24 + (61 - 58 * T2 + T2 * T2 + 600 * C - 330 * EP2) * a ** 6 / 720));
  return [E, N];
}

module.exports = { readTiff, lzw, utmToLL, llToUTM };
