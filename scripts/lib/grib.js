// อ่าน GRIB2 แบบง่าย (ไม่ต้องติดตั้งแพ็กเกจ) — รองรับเฉพาะกริดละติจูด/ลองจิจูด (template 3.0) + simple packing (5.0) ไม่มี bitmap
// พอสำหรับไฟล์ที่ตัดช่วงด้วย NOMADS grib filter (filter_gfs_0p25.pl) ซึ่งเข้ารหัสใหม่เป็น simple packing — ใช้ใน sync_gfsvr.js
const s16 = v => v & 0x8000 ? -(v & 0x7fff) : v, s32 = v => v & 0x80000000 ? -(v & 0x7fffffff) : v; // GRIB2 ใช้ sign-magnitude
function decode(buf) {
  const out = []; let p = 0;
  while (p + 16 <= buf.length) {
    if (buf.toString('latin1', p, p + 4) !== 'GRIB') { p++; continue }
    if (buf[p + 7] !== 2) throw new Error('ไม่ใช่ GRIB2');
    const L = Number(buf.readBigUInt64BE(p + 8)); let q = p + 16; const g = {};
    while (q < p + L - 4) {
      const n = buf.readUInt32BE(q), s = buf[q + 4];
      if (s === 3) { const t = buf.readUInt16BE(q + 12); if (t !== 0) throw new Error('กริดแบบ ' + t + ' ไม่รองรับ');
        g.ni = buf.readUInt32BE(q + 30); g.nj = buf.readUInt32BE(q + 34); g.la1 = s32(buf.readUInt32BE(q + 46)) / 1e6; g.lo1 = buf.readUInt32BE(q + 50) / 1e6;
        g.la2 = s32(buf.readUInt32BE(q + 55)) / 1e6; g.lo2 = buf.readUInt32BE(q + 59) / 1e6; g.di = buf.readUInt32BE(q + 63) / 1e6; g.dj = buf.readUInt32BE(q + 67) / 1e6; g.scan = buf[q + 71] }
      else if (s === 4) { g.cat = buf[q + 9]; g.num = buf[q + 10]; g.fh = buf.readUInt32BE(q + 18) }
      else if (s === 5) { g.np = buf.readUInt32BE(q + 5); const t = buf.readUInt16BE(q + 9); if (t !== 0) throw new Error('การบีบอัดแบบ ' + t + ' ไม่รองรับ');
        g.R = buf.readFloatBE(q + 11); g.E = s16(buf.readUInt16BE(q + 15)); g.D = s16(buf.readUInt16BE(q + 17)); g.nb = buf[q + 19] }
      else if (s === 6) { if (buf[q + 5] !== 255) throw new Error('มี bitmap ไม่รองรับ') }
      else if (s === 7) { const d = buf.subarray(q + 5, q + n), v = new Float64Array(g.np), f = 2 ** g.E, k = 10 ** g.D; let bit = 0;
        for (let i = 0; i < g.np; i++) { let x = 0; for (let j = 0; j < g.nb; j++) { x = x * 2 + ((d[bit >> 3] >> (7 - (bit & 7))) & 1); bit++ } v[i] = (g.R + x * f) / k }
        g.v = v }
      q += n;
    }
    out.push(g); p += L;
  }
  return out;
}
module.exports = { decode };
