// ของที่ใช้ร่วมกันระหว่าง sync_burn.js (พื้นที่เผาไหม้) และ sync_fuel.js (แหล่งเชื้อเพลิง SAVI) — ข้อมูลจากระบบตามรอยเผา (tamroypao.hii.or.th)
// GeoTIFF รายกริด Sentinel-2 (~110×110 กม., UTM, 20 ม./พิกเซล) · กริดที่ทับแนวเขตกลุ่มป่า 7 กริด
const fs = require('fs');
const { utmToLL, llToUTM } = require('./tiff');
const { GEO } = require('./area');

const SRC = 'https://tamroypao.hii.or.th/product/';
const GRIDS = ['47PQR', '47PQS', '47PRR', '47PRS', '48PTA', '48PTB', '48PUA'];
const RAI = 400 / 1600;   // 20×20 ม. = 0.25 ไร่
const writeSafe = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f) };

async function get(url, bin) {
  for (let k = 1; ; k++) try {
    const r = await fetch(url, { signal: AbortSignal.timeout(bin ? 600e3 : 60e3) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return bin ? Buffer.from(await r.arrayBuffer()) : await r.text();
  } catch (e) {
    if (k >= 3) throw new Error(url.split('/').pop() + ': ' + e.message);
    await new Promise(r => setTimeout(r, 5000 * k));
  }
}
// หน้าสารบัญของ Tomcat → [{href, size(ไบต์โดยประมาณ), mod}]
function listing(h) {
  return h.split(/<tr/i).slice(1).map(r => {
    const a = r.match(/href="([^"]+)"/), t = r.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const s = t.match(/([\d.]+) (KiB|MiB|B)\b/), m = t.match(/\w{3}, \d+ \w{3} \d{4} [\d:]+ GMT/);
    return a && { href: a[1], size: s ? Math.round(+s[1] * { B: 1, KiB: 1024, MiB: 1048576 }[s[2]]) : 0, mod: m ? m[0] : '' };
  }).filter(Boolean);
}

// --- แนวเขตบนกริดพิกเซลของแต่ละกริด: ป้ายพื้นที่อนุรักษ์ + ป้ายสถานีฯ (สถานีหลักทับ "พื้นที่รอง" ตามกติกา where()) ---
const AR = { 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าโคกสูง': 'เขตห้ามล่าสัตว์ป่าโคกสูง (เตรียมการ)', 'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่าเขาฉกรรจ์': 'เขตห้ามล่าสัตว์ป่าเขาฉกรรจ์ (เตรียมการ)' };
const CONS = GEO.cons.features, ARN = ['นอกพื้นที่อนุรักษ์', ...CONS.map(f => AR[f.properties.name] || f.properties.name)];
const stName = f => f.properties.station.replace(/\s*\(พื้นที่รอง\)/, '').trim();
const STN = ['ไม่มี', ...new Set(GEO.resp.features.map(stName))];
function rasterize(t, zone) {
  const W = t.w, H = t.h, ar = new Uint8Array(W * H), st = new Uint8Array(W * H);
  const fill = (f, lab, v) => f.geometry.coordinates.forEach(poly => {
    const rings = poly.map(r => r.map(([x, y]) => { const [E, N] = llToUTM(x, y, zone); return [(E - t.x0) / t.px[0], (t.y0 - N) / t.px[1]] }));
    let y0 = Infinity, y1 = -Infinity; rings[0].forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) });
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
      const c = y + 0.5, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if ((r[i][1] > c) !== (r[j][1] > c)) xs.push(r[i][0] + (c - r[i][1]) * (r[j][0] - r[i][0]) / (r[j][1] - r[i][1]));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        if (b >= a) lab.fill(v, y * W + a, y * W + b + 1);
      }
    }
  });
  CONS.forEach((f, i) => fill(f, ar, i + 1));
  const R = GEO.resp.features, sec = f => /พื้นที่รอง/.test(f.properties.station);
  [...R.filter(sec), ...R.filter(f => !sec(f))].forEach(f => fill(f, st, STN.indexOf(stName(f))));
  return { ar, st };
}

// ศูนย์กลางกริด (ลองจิจูด, ละติจูด) จากชื่อ — ใช้ตัดสินว่าพิกเซลในส่วนที่กริดซ้อนกันเป็นของกริดใด
const ROW = 'ABCDEFGHJKLMNPQRSTUV', COLS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
function gridCenter(g) {
  const z = +g.slice(0, 2), col = COLS[(z - 1) % 3].indexOf(g[3]) + 1, ri = ROW.indexOf(g[4]);
  // แถว 100 กม. ที่ใกล้ละติจูด ~14° (ประเทศไทย) — ตัวอักษรแถววนทุก 2,000 กม.
  const r = ((ri - (z % 2 ? 0 : 5)) % 20 + 20) % 20, top = (r + 1) * 1e5;
  return utmToLL(col * 1e5 + 54900, top - 54900, z);
}
const owner = (lon, lat, gs) => { let b = null, bd = Infinity; const c = Math.cos(lat * Math.PI / 180); for (const [g, [x, y]] of gs) { const d = ((lon - x) * c) ** 2 + (lat - y) ** 2; if (d < bd) { bd = d; b = g } } return b };

module.exports = { SRC, GRIDS, RAI, writeSafe, get, listing, ARN, STN, rasterize, gridCenter, owner };
