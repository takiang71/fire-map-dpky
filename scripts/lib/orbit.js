/*ORB-LIB-BEGIN*/
/* วงโคจรดาวเทียม NOAA-20/NOAA-21: SGP4 (ใกล้โลก, ตาม Vallado 2006 "Revisiting Spacetrack Report #3") + รอบที่แถบสแกน VIIRS ผ่านจุดเป้าหมาย
 * ใช้ร่วมกันทั้ง Node (line_notify / telegram_notify) และหน้าเว็บ — index.html ฝังสำเนาไฟล์นี้ทั้งก้อน (ระหว่างเครื่องหมาย ORB-LIB) · แก้ที่นี่แล้วต้องฝังใหม่: node scripts/embed_orbit.js
 * ไม่รองรับดาวเทียมวงโคจรลึก (คาบ ≥225 นาที) — NOAA-20/21 คาบ ~101 นาที */
(function (G) {
  const PI2 = 2 * Math.PI, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const MU = 398600.8, RE = 6378.135, XKE = 60 / Math.sqrt(RE * RE * RE / MU), J2 = 0.001082616, J3 = -0.00000253881, J4 = -0.00000165597, J3OJ2 = J3 / J2, X2O3 = 2 / 3; // WGS-72 ตามมาตรฐาน TLE
  const WA = 6378.137, WF = 1 / 298.257223563, WE2 = WF * (2 - WF); // WGS-84 สำหรับละติจูด/ลองจิจูด
  const RM = 6371.0088; // รัศมีเฉลี่ยของโลก (ระยะบนพื้นผิว)
  const mod = (x, m) => ((x % m) + m) % m;
  const tleNum = s => { s = s.trim(); if (!s) return 0; const m = s.match(/^([+-]?)(\d+)([+-]\d)$/); return m ? +(m[1] + '0.' + m[2]) * Math.pow(10, +m[3]) : +s };
  const jdOfMs = ms => ms / 864e5 + 2440587.5;
  function gstime(jd) { const t = (jd - 2451545) / 36525; return mod((-6.2e-6 * t * t * t + 0.093104 * t * t + (876600 * 3600 + 8640184.812866) * t + 67310.54841) * D2R / 240, PI2) }

  // อ่าน TLE 2 บรรทัด → ค่าเริ่มต้น SGP4
  function parse(l1, l2, name) {
    const s = { name: name || '' };
    s.catnr = +l1.slice(2, 7);
    const yr = +l1.slice(18, 20), days = +l1.slice(20, 32);
    s.bstar = tleNum(l1.slice(53, 61));
    s.inclo = +l2.slice(8, 16) * D2R; s.nodeo = +l2.slice(17, 25) * D2R; s.ecco = +('0.' + l2.slice(26, 33).trim());
    s.argpo = +l2.slice(34, 42) * D2R; s.mo = +l2.slice(43, 51) * D2R; const nrev = +l2.slice(52, 63);
    const y = yr < 57 ? 2000 + yr : 1900 + yr;
    s.epochMs = Date.UTC(y, 0, 1) + (days - 1) * 864e5; s.jdepoch = jdOfMs(s.epochMs);
    init(s, nrev * PI2 / 1440);
    return s;
  }
  function init(s, noKozai) {
    const { ecco, inclo, argpo, bstar } = s;
    const eccsq = ecco * ecco, omeosq = 1 - eccsq, rteosq = Math.sqrt(omeosq), cosio = Math.cos(inclo), cosio2 = cosio * cosio;
    const ak = Math.pow(XKE / noKozai, X2O3), d1 = 0.75 * J2 * (3 * cosio2 - 1) / (rteosq * omeosq);
    let del = d1 / (ak * ak); const adel = ak * (1 - del * del - del * (1 / 3 + 134 * del * del / 81)); del = d1 / (adel * adel);
    const no = noKozai / (1 + del); s.no = no;
    const ao = Math.pow(XKE / no, X2O3), sinio = Math.sin(inclo), po = ao * omeosq, con42 = 1 - 5 * cosio2, con41 = -con42 - cosio2 - cosio2, posq = po * po, rp = ao * (1 - ecco);
    s.period = PI2 / no; if (s.period >= 225) throw new Error('ไม่รองรับวงโคจรลึก (คาบ ≥225 นาที)');
    const ss = 78 / RE + 1, qzms2t = Math.pow((120 - 78) / RE, 4);
    s.isimp = rp < 220 / RE + 1 ? 1 : 0;
    let sfour = ss, qzms24 = qzms2t; const perige = (rp - 1) * RE;
    if (perige < 156) { sfour = perige < 98 ? 20 : perige - 78; qzms24 = Math.pow((120 - sfour) / RE, 4); sfour = sfour / RE + 1 }
    const pinvsq = 1 / posq, tsi = 1 / (ao - sfour), eta = ao * ecco * tsi, etasq = eta * eta, eeta = ecco * eta, psisq = Math.abs(1 - etasq);
    const coef = qzms24 * Math.pow(tsi, 4), coef1 = coef / Math.pow(psisq, 3.5);
    const cc2 = coef1 * no * (ao * (1 + 1.5 * etasq + eeta * (4 + etasq)) + 0.375 * J2 * tsi / psisq * con41 * (8 + 3 * etasq * (8 + etasq)));
    const cc1 = bstar * cc2, cc3 = ecco > 1e-4 ? -2 * coef * tsi * J3OJ2 * no * sinio / ecco : 0, x1mth2 = 1 - cosio2;
    const cc4 = 2 * no * coef1 * ao * omeosq * (eta * (2 + 0.5 * etasq) + ecco * (0.5 + 2 * etasq) - J2 * tsi / (ao * psisq) * (-3 * con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) + 0.75 * x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)));
    const cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
    const cosio4 = cosio2 * cosio2, temp1 = 1.5 * J2 * pinvsq * no, temp2 = 0.5 * temp1 * J2 * pinvsq, temp3 = -0.46875 * J4 * pinvsq * pinvsq * no;
    s.mdot = no + 0.5 * temp1 * rteosq * con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
    s.argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) + temp3 * (3 - 36 * cosio2 + 49 * cosio4);
    const xhdot1 = -temp1 * cosio;
    s.nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;
    s.omgcof = bstar * cc3 * Math.cos(argpo);
    s.xmcof = ecco > 1e-4 ? -X2O3 * coef * bstar / eeta : 0;
    s.nodecf = 3.5 * omeosq * xhdot1 * cc1; s.t2cof = 1.5 * cc1;
    s.xlcof = -0.25 * J3OJ2 * sinio * (3 + 5 * cosio) / (Math.abs(cosio + 1) > 1.5e-12 ? 1 + cosio : 1.5e-12);
    s.aycof = -0.5 * J3OJ2 * sinio;
    s.delmo = Math.pow(1 + eta * Math.cos(s.mo), 3); s.sinmao = Math.sin(s.mo); s.x7thm1 = 7 * cosio2 - 1;
    Object.assign(s, { cc1, cc4, cc5, eta, con41, x1mth2 });
    if (!s.isimp) {
      const cc1sq = cc1 * cc1, d2 = 4 * ao * tsi * cc1sq, temp = d2 * tsi * cc1 / 3, d3 = (17 * ao + sfour) * temp, d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * cc1;
      Object.assign(s, { d2, d3, d4, t3cof: d2 + 2 * cc1sq, t4cof: 0.25 * (3 * d3 + cc1 * (12 * d2 + 10 * cc1sq)), t5cof: 0.2 * (3 * d4 + 12 * cc1 * d3 + 6 * d2 * d2 + 15 * cc1sq * (2 * d2 + cc1sq)) });
    }
  }
  // ตำแหน่ง TEME (กม.) ที่ t นาทีหลัง epoch
  function sgp4(s, t) {
    const xmdf = s.mo + s.mdot * t, argpdf = s.argpo + s.argpdot * t, nodedf = s.nodeo + s.nodedot * t, t2 = t * t;
    let argpm = argpdf, mm = xmdf, nodem = nodedf + s.nodecf * t2, tempa = 1 - s.cc1 * t, tempe = s.bstar * s.cc4 * t, templ = s.t2cof * t2;
    if (!s.isimp) {
      const delomg = s.omgcof * t, delm = s.xmcof * (Math.pow(1 + s.eta * Math.cos(xmdf), 3) - s.delmo), temp = delomg + delm, t3 = t2 * t, t4 = t3 * t;
      mm = xmdf + temp; argpm = argpdf - temp;
      tempa = tempa - s.d2 * t2 - s.d3 * t3 - s.d4 * t4; tempe = tempe + s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao); templ = templ + s.t3cof * t3 + t4 * (s.t4cof + t * s.t5cof);
    }
    let am = Math.pow(XKE / s.no, X2O3) * tempa * tempa; const nm = XKE / Math.pow(am, 1.5); let em = s.ecco - tempe;
    if (em < 1e-6) em = 1e-6;
    mm = mm + s.no * templ; let xlm = mm + argpm + nodem;
    nodem = mod(nodem, PI2); argpm = mod(argpm, PI2); xlm = mod(xlm, PI2); mm = mod(xlm - argpm - nodem, PI2);
    const sinip = Math.sin(s.inclo), cosip = Math.cos(s.inclo);
    const axnl = em * Math.cos(argpm); let temp = 1 / (am * (1 - em * em)); const aynl = em * Math.sin(argpm) + temp * s.aycof, xl = mm + argpm + nodem + temp * s.xlcof * axnl;
    const u = mod(xl - nodem, PI2); let eo1 = u, tem5 = 9999.9, ktr = 1, sineo1 = 0, coseo1 = 0;
    while (Math.abs(tem5) >= 1e-12 && ktr <= 10) {
      sineo1 = Math.sin(eo1); coseo1 = Math.cos(eo1);
      tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / (1 - coseo1 * axnl - sineo1 * aynl);
      if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
      eo1 += tem5; ktr++;
    }
    const ecose = axnl * coseo1 + aynl * sineo1, esine = axnl * sineo1 - aynl * coseo1, el2 = axnl * axnl + aynl * aynl, pl = am * (1 - el2);
    if (pl < 0) return null;
    const rl = am * (1 - ecose), rdotl = Math.sqrt(am) * esine / rl, rvdotl = Math.sqrt(pl) / rl, betal = Math.sqrt(1 - el2);
    temp = esine / (1 + betal);
    const sinu = am / rl * (sineo1 - aynl - axnl * temp), cosu = am / rl * (coseo1 - axnl + aynl * temp);
    let su = Math.atan2(sinu, cosu);
    const sin2u = (cosu + cosu) * sinu, cos2u = 1 - 2 * sinu * sinu; temp = 1 / pl; const temp1 = 0.5 * J2 * temp, temp2 = temp1 * temp;
    const mrt = rl * (1 - 1.5 * temp2 * betal * s.con41) + 0.5 * temp1 * s.x1mth2 * cos2u;
    su = su - 0.25 * temp2 * s.x7thm1 * sin2u;
    const xnode = nodem + 1.5 * temp2 * cosip * sin2u, xinc = s.inclo + 1.5 * temp2 * cosip * sinip * cos2u;
    const mvt = rdotl - nm * temp1 * s.x1mth2 * sin2u / XKE, rvdot = rvdotl + nm * temp1 * (s.x1mth2 * cos2u + 1.5 * s.con41) / XKE;
    const sinsu = Math.sin(su), cossu = Math.cos(su), snod = Math.sin(xnode), cnod = Math.cos(xnode), sini = Math.sin(xinc), cosi = Math.cos(xinc);
    const xmx = -snod * cosi, xmy = cnod * cosi, ux = xmx * sinsu + cnod * cossu, uy = xmy * sinsu + snod * cossu, uz = sini * sinsu, vx = xmx * cossu - cnod * sinsu, vy = xmy * cossu - snod * sinsu, vz = sini * cossu;
    const vk = RE * XKE / 60;
    return { r: [mrt * ux * RE, mrt * uy * RE, mrt * uz * RE], v: [(mvt * ux + rvdot * vx) * vk, (mvt * uy + rvdot * vy) * vk, (mvt * uz + rvdot * vz) * vk] };
  }
  // ตำแหน่งใต้ดาวเทียม ณ เวลา ms (UTC): {lat, lon, alt กม., v กม./วินาที}
  function at(s, ms) {
    const p = sgp4(s, (ms - s.epochMs) / 6e4); if (!p) return null;
    const g = gstime(jdOfMs(ms)), [x, y, z] = p.r, cg = Math.cos(g), sg = Math.sin(g);
    const xe = x * cg + y * sg, ye = -x * sg + y * cg, rr = Math.hypot(xe, ye);
    let lat = Math.atan2(z, rr), c = 1, h = 0;
    for (let i = 0; i < 6; i++) { const sl = Math.sin(lat); c = 1 / Math.sqrt(1 - WE2 * sl * sl); lat = Math.atan2(z + WA * c * WE2 * sl, rr) }
    h = rr / Math.cos(lat) - WA * c;
    return { lat: lat * R2D, lon: mod(Math.atan2(ye, xe) * R2D + 180, 360) - 180, alt: h, v: Math.hypot(...p.v) };
  }
  // ระยะวงกลมใหญ่ (กม.) และทิศ (องศาจากเหนือ)
  function dist(la1, lo1, la2, lo2) { const a = Math.sin((la2 - la1) * D2R / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin((lo2 - lo1) * D2R / 2) ** 2; return 2 * RM * Math.asin(Math.min(1, Math.sqrt(a))) }
  function bearing(la1, lo1, la2, lo2) { const f1 = la1 * D2R, f2 = la2 * D2R, dl = (lo2 - lo1) * D2R; return mod(Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) * R2D, 360) }
  function dest(la, lo, brg, km) { const d = km / RM, b = brg * D2R, f1 = la * D2R, l1 = lo * D2R, f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b)); return [mod((l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2))) * R2D + 180, 360) - 180, f2 * R2D] }
  // มุมสแกนจากแนวดิ่งใต้ดาวเทียม (องศา) ของจุดที่ห่างแนวใต้ดาวเทียม km กม. ที่ความสูง alt กม.
  function scanAng(km, alt) { const th = km / RM; return Math.atan2(RM * Math.sin(th), RM + alt - RM * Math.cos(th)) * R2D }
  // ระยะบนพื้น (กม.) ของมุมสแกน ang องศา
  function scanKm(ang, alt) { const e = ang * D2R, x = (RM + alt) / RM * Math.sin(e); return x >= 1 ? NaN : (Math.asin(x) - e) * RM }
  // ตำแหน่งใต้ดวงอาทิตย์ (สูตรย่อ NOAA ±0.01°) และมุมเงยของดวงอาทิตย์ที่จุด
  function sun(ms) {
    const n = jdOfMs(ms) - 2451545, L = mod(280.46 + 0.9856474 * n, 360), g = mod(357.528 + 0.9856003 * n, 360) * D2R, lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R, eps = (23.439 - 4e-7 * n) * D2R;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), gm = gstime(jdOfMs(ms));
    return { lat: dec * R2D, lon: mod((ra - gm) * R2D + 180, 360) - 180 };
  }
  function sunEl(ms, la, lo) { const s = sun(ms); return 90 - dist(la, lo, s.lat, s.lon) / RM * R2D }

  // รอบที่ดาวเทียมผ่านจุดเป้าหมาย [lon,lat] ในช่วง t0..t0+hours ชม.: จุดที่ใต้ดาวเทียมเข้าใกล้เป้าหมายที่สุดในแต่ละรอบโคจร
  // คืน [{t (ms ที่ใกล้สุด), km (ห่างแนวใต้ดาวเทียม), ang (มุมสแกน), alt, day (กลางวัน), asc (ขาขึ้นเหนือ), edge (ขอบแถบ: มุมสแกน > maxAng), out (นอกแถบสแกน)}]
  // maxAng = มุมสแกนสูงสุดที่นับ (ค่าเริ่มต้น 45° — เกินนี้ถือว่าผ่านขอบแถบ) · VIIRS สแกนได้ถึง ±56.06° (แถบกว้าง ~3,040 กม.)
  function passes(s, tgt, t0, hours, maxAng = 45) {
    const [lo, la] = tgt, out = [], step = 30e3, end = t0 + hours * 36e5, D = t => { const p = at(s, t); return p ? dist(la, lo, p.lat, p.lon) : 1e9 };
    let a = D(t0 - step), b = D(t0);
    for (let t = t0; t <= end; t += step) {
      const c = D(t + step);
      if (b <= a && b < c && b < 3000) {
        let x = t - step, y = t + step; // หาค่าต่ำสุดแบบอัตราส่วนทองคำถึง ~0.5 วินาที
        const r = (Math.sqrt(5) - 1) / 2; let x1 = y - r * (y - x), x2 = x + r * (y - x), f1 = D(x1), f2 = D(x2);
        while (y - x > 500) { if (f1 < f2) { y = x2; x2 = x1; f2 = f1; x1 = y - r * (y - x); f1 = D(x1) } else { x = x1; x1 = x2; f1 = f2; x2 = x + r * (y - x); f2 = D(x2) } }
        const tm = Math.round((x + y) / 2), p = at(s, tm), q = at(s, tm + 10e3), km = dist(la, lo, p.lat, p.lon), ang = scanAng(km, p.alt);
        if (tm >= t0 && tm <= end) out.push({ t: tm, km, ang, alt: p.alt, day: sunEl(tm, la, lo) > 0, asc: q.lat > p.lat, edge: ang > maxAng, out: ang > 56.06 });
      }
      a = b; b = c;
    }
    return out;
  }
  // เส้นทางใต้ดาวเทียม t0..t1 ทุก stepS วินาที → [[lon,lat],…]
  function track(s, t0, t1, stepS = 30) { const A = []; for (let t = t0; t <= t1; t += stepS * 1e3) { const p = at(s, t); if (p) A.push([p.lon, p.lat]) } return A }
  // ขอบแถบสแกนสองข้างของเส้นทาง (ระยะ km จากแนวใต้ดาวเทียม) → {l:[…], r:[…]}
  function swath(tr, km) {
    const l = [], r = [];
    for (let i = 0; i < tr.length; i++) {
      const a = tr[Math.max(0, i - 1)], b = tr[Math.min(tr.length - 1, i + 1)], brg = bearing(a[1], a[0], b[1], b[0]);
      l.push(dest(tr[i][1], tr[i][0], brg - 90, km)); r.push(dest(tr[i][1], tr[i][0], brg + 90, km));
    }
    return { l, r };
  }
  // แบ่งเส้นที่ข้ามเส้นวันสากล → MultiLineString
  function splitAM(c) { const L = [[]]; c.forEach((p, i) => { if (i && Math.abs(p[0] - c[i - 1][0]) > 180) L.push([]); L[L.length - 1].push(p) }); return L.filter(x => x.length > 1) }

  // จุดเป้าหมาย = กึ่งกลางกรอบแนวเขตพื้นที่อนุรักษ์ของกลุ่มป่าดงพญาเย็น-เขาใหญ่ (กรอบ 101.127–103.227°E, 13.649–14.612°N จาก data/geo.json)
  const DPKY = [102.177, 14.130];
  // รอบที่นับ = ทุกรอบที่กลุ่มป่าอยู่ในแถบสแกน (≤56.06°, รวมขอบแถบ — ผู้ใช้ขอ 13 พ.ย. 69 เดิมตัดรอบ >45°) ของทุกดวงใน tle.json ช่วง t0..t0+hours ชม. เรียงตามเวลา → [{k, n, t, ang, km, day, asc, edge}]
  function next(tle, t0, hours = 24, tgt = DPKY, maxAng = 45) {
    const A = [];
    for (const [k, s] of Object.entries((tle && tle.sats) || {})) { try { const sr = parse(s.l1, s.l2, s.n); passes(sr, tgt, t0, hours, maxAng).filter(p => !p.out).forEach(p => A.push({ k, n: s.n, ...p })) } catch (e) {} }
    return A.sort((a, b) => a.t - b.t);
  }

  // ข้อความสั้นของรอบผ่าน (เวลาไทย) เช่น "NOAA-20 ☀ 13:42" · ต่างวันจาก now ต่อท้าย "(14 พ.ย.)"
  const THM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function label(p, now) {
    const d = new Date(p.t + 7 * 36e5), n = new Date((now || p.t) + 7 * 36e5), z = x => String(x).padStart(2, '0');
    return `${p.n} ${p.day ? '☀' : '☾'} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}${d.getUTCDate() !== n.getUTCDate() ? ` (${d.getUTCDate()} ${THM[d.getUTCMonth()]})` : ''}`;
  }

  const O = { parse, sgp4, at, passes, next, label, track, swath, splitAM, dist, bearing, dest, scanAng, scanKm, sun, sunEl, gstime, DPKY, EDGE: 45, SCANMAX: 56.06 };
  if (typeof module !== 'undefined' && module.exports) module.exports = O; else G.ORB = O;
})(typeof globalThis !== 'undefined' ? globalThis : this);
/*ORB-LIB-END*/
