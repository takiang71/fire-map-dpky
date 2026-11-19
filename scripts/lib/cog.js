// อ่าน Cloud-Optimized GeoTIFF (BigTIFF/TIFF แบบไทล์, Deflate/ไม่บีบอัด, float32 แบนด์เดียวหรือหลายแบนด์ต่อพิกเซล) ทีละแผ่นผ่าน HTTP Range
// ใช้กับ GEM-15 ของ Google (scripts/build_dem15.js) — ไม่ต้องติดตั้งแพ็กเกจ · แคชแผ่นดิบลงดิสก์ได้ (opt.cache)
const fs = require('fs'), path = require('path'), zlib = require('zlib');

// แยกส่วนหัว: b = Buffer ตั้งแต่ไบต์ 0 (ยาวพอคลุม IFD แรก) · คืนแท็กของ IFD แรก {tag: {typ, cnt, at}} + ตัวอ่านค่า
function parseHeader(b) {
  const le = b[0] === 0x49; if (!le && b[0] !== 0x4d) throw new Error('ไม่ใช่ TIFF');
  const u16 = o => le ? b.readUInt16LE(o) : b.readUInt16BE(o), u32 = o => le ? b.readUInt32LE(o) : b.readUInt32BE(o),
    u64 = o => Number(le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o)), ver = u16(2), big = ver === 43;
  if (ver !== 42 && !big) throw new Error('ไม่ใช่ TIFF');
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 11: 4, 12: 8, 16: 8, 17: 8 };
  const ifd = big ? u64(8) : u32(4), n = big ? u64(ifd) : u16(ifd), es = big ? 20 : 12, T = {};
  if (ifd + (big ? 8 : 2) + n * es > b.length) throw new Error('ส่วนหัว TIFF ยาวเกินที่อ่านมา');
  for (let i = 0; i < n; i++) {
    const e = ifd + (big ? 8 : 2) + i * es, tag = u16(e), typ = u16(e + 2), cnt = big ? u64(e + 4) : u32(e + 4), sz = (SZ[typ] || 1) * cnt;
    T[tag] = { typ, cnt, at: sz <= (big ? 8 : 4) ? e + (big ? 12 : 8) : (big ? u64(e + 12) : u32(e + 8)) };
  }
  // อ่านค่าของแท็กจาก Buffer d ที่เริ่มที่ออฟเซ็ต base (ค่าแบบอินไลน์อยู่ใน b เสมอ)
  const val = (t, d = b, base = 0) => {
    const { typ, cnt, at } = t, o0 = at - base, v = [];
    if (typ === 2) return d.toString('latin1', o0, o0 + cnt - 1);
    for (let k = 0; k < cnt; k++) {
      const o = o0 + k * SZ[typ];
      v.push(typ === 3 ? (le ? d.readUInt16LE(o) : d.readUInt16BE(o)) : typ === 4 ? (le ? d.readUInt32LE(o) : d.readUInt32BE(o))
        : typ === 16 ? Number(le ? d.readBigUInt64LE(o) : d.readBigUInt64BE(o)) : typ === 12 ? (le ? d.readDoubleLE(o) : d.readDoubleBE(o))
          : typ === 11 ? (le ? d.readFloatLE(o) : d.readFloatBE(o)) : d[o]);
    }
    return v;
  };
  const bytes = t => t.cnt * (SZ[t.typ] || 1), inl = t => t.at + bytes(t) <= b.length;
  return { le, big, T, val, bytes, inl };
}

// เปิดไฟล์ COG จาก URL → {w,h,tw,th,spp,zone,e0,n0,px, tile(tx,ty) → Float32Array tw*th*spp}
async function openCOG(url, opt = {}) {
  const get = opt.fetch || (async (a, n) => {
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${a + n - 1}` }, signal: AbortSignal.timeout(opt.timeout || 120000) });
    if (r.status !== 206 && r.status !== 200) throw new Error('COG HTTP ' + r.status + ' ' + url);
    const b = Buffer.from(await r.arrayBuffer()); return r.status === 200 ? b.subarray(a, a + n) : b;
  });
  const H = parseHeader(await get(0, opt.head || 65536)), T = H.T, need = t => H.inl(t) ? H.val(t) : null;
  const one = async t => need(t) || H.val(t, await get(t.at, H.bytes(t)), t.at);
  const w = (await one(T[256]))[0], h = (await one(T[257]))[0], tw = (await one(T[322]))[0], th = (await one(T[323]))[0],
    bps = (await one(T[258]))[0], comp = (await one(T[259]))[0], spp = T[277] ? (await one(T[277]))[0] : 1,
    fmt = T[339] ? (await one(T[339]))[0] : 1, pred = T[317] ? (await one(T[317]))[0] : 1, planar = T[284] ? (await one(T[284]))[0] : 1;
  if (bps !== 32 || fmt !== 3) throw new Error('รองรับเฉพาะ float32');
  if (pred !== 1 || planar !== 1) throw new Error('ยังไม่รองรับ predictor/planar แบบนี้');
  if (comp !== 1 && comp !== 8 && comp !== 32946) throw new Error('ไม่รองรับการบีบอัดแบบ ' + comp);
  const sc = await one(T[33550]), tie = await one(T[33922]), gk = await one(T[34735]);
  let epsg = null; for (let i = 4; i + 3 < gk.length; i += 4) if (gk[i] === 3072 && gk[i + 1] === 0) epsg = gk[i + 3];
  if (!epsg || !(epsg >= 32601 && epsg <= 32660)) throw new Error('รองรับเฉพาะ UTM ซีกโลกเหนือ (EPSG:326xx) ได้ ' + epsg);
  const off = await one(T[324]), cnt = await one(T[325]), ntx = Math.ceil(w / tw), le = H.le;
  const C = {};
  const tile = (tx, ty) => C[tx + ',' + ty] || (C[tx + ',' + ty] = (async () => {
    const i = ty * ntx + tx; if (tx < 0 || ty < 0 || tx >= ntx || i >= off.length) return null;
    if (!cnt[i]) return null;
    let raw, f = opt.cache && path.join(opt.cache, opt.key || 'cog', `${tx}_${ty}.bin`);
    try { raw = f && fs.readFileSync(f) } catch (e) { raw = null }
    if (!raw) { raw = await get(off[i], cnt[i]); if (f) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, raw) } }
    const d = comp === 1 ? raw : zlib.inflateSync(raw), n = tw * th * spp, o = new Float32Array(n);
    for (let k = 0; k < n; k++) o[k] = le ? d.readFloatLE(k * 4) : d.readFloatBE(k * 4);
    return o;
  })());
  // ทิ้งแผ่นที่ถอดแล้ว (คุมหน่วยความจำ) — แผ่นดิบยังอยู่ในแคชดิสก์
  const drop = () => { for (const k in C) delete C[k] };
  return { w, h, tw, th, spp, zone: epsg - 32600, e0: tie[3], n0: tie[4], px: sc[0], py: sc[1], ntx, nty: Math.ceil(h / th), tile, drop };
}

module.exports = { parseHeader, openCOG };
