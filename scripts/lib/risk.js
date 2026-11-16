/*RISK-LIB-BEGIN*/
/* ดัชนีเสี่ยงไฟป่าล่วงหน้าของระบบนี้ (F2 — docs/review-2569-11-15.md) — ไม่ใช่ค่าทางการของกรมอุทยานฯ/กรมป่าไม้
 * ใช้ร่วมกันทั้ง Node (scripts/risk_backtest.js, build_site ในอนาคต) และหน้าเว็บ (ฝังสำเนาระหว่างเครื่องหมาย RISK-LIB แบบ orbit.js — ยังไม่ฝังจนกว่าผู้ใช้อนุมัติผลตรวจย้อนหลัง)
 * ไม่มี I/O ไม่มีเครือข่าย — ฟังก์ชันล้วน
 *  - fwiDay(prev, w, lat, month): ระบบ FWI ของแคนาดา (Van Wagner 1987) รายวัน จากอุณหภูมิ/ความชื้น/ลม ตอนเที่ยง + ฝน 24 ชม. (ใช้เมื่อไม่มีค่า TFDRS เช่น ตรวจย้อนหลังด้วย ERA5)
 *  - dekad(day): ช่วง 10 วันของปี 0–35 (เดือน×3 + วันที่ 1–10/11–20/21–สิ้นเดือน)
 *  - climBuild(...): ความถี่ "วันที่มีจุดความร้อน" ต่อหน่วยพื้นที่ต่อช่วง 10 วัน (หดเข้าค่าเฉลี่ยรวม + ทำให้เรียบ ±1 ช่วง)
 *  - feats/prob/level: คะแนน = logistic(สัมประสิทธิ์ M) ของ logit(ความถี่ในอดีต) + ln(1+FWI) [+ จุดความร้อน 3 วันก่อน] → ระดับ 1–5 ตามเกณฑ์ LV
 *  - fitLogit / auc / confusion: ใช้ตอนตรวจย้อนหลัง
 */
(function (G) {
  'use strict';
  const R = {};
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // ---------- ระบบ FWI (Van Wagner 1987; สมการเดียวกับ cffdrs) ----------
  // ความยาววันสำหรับ DMC / ปัจจัยวันสำหรับ DC (ปรับตามละติจูดแบบ cffdrs): >30°N ตารางมาตรฐานของแคนาดา · 10–30°N DMC ตาราง EL10 · −10–10° DMC = 9 · −20–20° DC = 1.4 ทุกเดือน
  const EL = [6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0], FL = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6];
  const EL10 = [7.9, 8.4, 8.9, 9.5, 9.9, 10.2, 10.1, 9.7, 9.1, 8.6, 8.1, 7.8];
  R.FWI0 = { ffmc: 85, dmc: 6, dc: 15 };
  function ffmcDay(f0, T, H, W, P) {
    let mo = 147.2 * (101 - f0) / (59.5 + f0);
    if (P > 0.5) {
      const rf = P - 0.5;
      mo += 42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf)) + (mo > 150 ? 0.0015 * (mo - 150) ** 2 * Math.sqrt(rf) : 0);
      if (mo > 250) mo = 250;
    }
    const ed = 0.942 * H ** 0.679 + 11 * Math.exp((H - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * H));
    let m = mo;
    if (mo > ed) {
      const ko = 0.424 * (1 - (H / 100) ** 1.7) + 0.0694 * Math.sqrt(W) * (1 - (H / 100) ** 8), kd = ko * 0.581 * Math.exp(0.0365 * T);
      m = ed + (mo - ed) * 10 ** -kd;
    } else {
      const ew = 0.618 * H ** 0.753 + 10 * Math.exp((H - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * H));
      if (mo < ew) {
        const kl = 0.424 * (1 - ((100 - H) / 100) ** 1.7) + 0.0694 * Math.sqrt(W) * (1 - ((100 - H) / 100) ** 8), kw = kl * 0.581 * Math.exp(0.0365 * T);
        m = ew - (ew - mo) * 10 ** -kw;
      }
    }
    return clamp(59.5 * (250 - m) / (147.2 + m), 0, 101);
  }
  function dmcDay(d0, T, H, P, el) {
    T = Math.max(T, -1.1);
    const rk = 1.894 * (T + 1.1) * (100 - H) * el * 1e-6;
    let pr = d0;
    if (P > 1.5) {
      const rw = 0.92 * P - 1.27, wmi = 20 + 280 / Math.exp(0.023 * d0);
      const b = d0 <= 33 ? 100 / (0.5 + 0.3 * d0) : d0 <= 65 ? 14 - 1.3 * Math.log(d0) : 6.2 * Math.log(d0) - 17.2;
      const wmr = wmi + 1000 * rw / (48.77 + b * rw);
      pr = Math.max(43.43 * (5.6348 - Math.log(wmr - 20)), 0);
    }
    return Math.max(pr + 100 * rk, 0);
  }
  function dcDay(c0, T, P, fl) {
    T = Math.max(T, -2.8);
    let dr = c0;
    if (P > 2.8) {
      const rd = 0.83 * P - 1.27, qo = 800 * Math.exp(-c0 / 400), qr = qo + 3.937 * rd;
      dr = Math.max(400 * Math.log(800 / qr), 0);
    }
    const v = Math.max(0.36 * (T + 2.8) + fl, 0);
    return Math.max(dr + 0.5 * v, 0);
  }
  const isiOf = (ffmc, W) => { const m = 147.2 * (101 - ffmc) / (59.5 + ffmc); return 0.208 * Math.exp(0.05039 * W) * 91.9 * Math.exp(-0.1386 * m) * (1 + m ** 5.31 / 4.93e7) };
  const buiOf = (dmc, dc) => {
    if (dmc <= 0 && dc <= 0) return 0;
    const b = dmc <= 0.4 * dc ? 0.8 * dmc * dc / (dmc + 0.4 * dc) : dmc - (1 - 0.8 * dc / (dmc + 0.4 * dc)) * (0.92 + (0.0114 * dmc) ** 1.7);
    return Math.max(b, 0);
  };
  const fwiOf = (isi, bui) => {
    const fd = bui <= 80 ? 0.626 * bui ** 0.809 + 2 : 1000 / (25 + 108.64 * Math.exp(-0.023 * bui)), b = 0.1 * isi * fd;
    return b > 1 ? Math.exp(2.72 * (0.434 * Math.log(b)) ** 0.647) : b;
  };
  /* prev = {ffmc,dmc,dc} ของวันก่อน (ไม่มี = FWI0) · w = {t (°C), h (%), w (กม./ชม.), p (มม./24 ชม.)} ตอนเที่ยง · month 1–12 */
  R.fwiDay = function (prev, w, lat, month) {
    const p = prev || R.FWI0, H = clamp(w.h, 0, 100), W = Math.max(w.w, 0), P = Math.max(w.p || 0, 0), T = w.t, mi = month - 1;
    const el = lat > 30 ? EL[mi] : lat > 10 ? EL10[mi] : lat > -10 ? 9 : EL[(mi + 6) % 12];
    const fl = lat > 20 ? FL[mi] : lat > -20 ? 1.4 : FL[(mi + 6) % 12];
    const ffmc = ffmcDay(p.ffmc, T, H, W, P), dmc = dmcDay(p.dmc, T, H, P, el), dc = dcDay(p.dc, T, P, fl);
    const isi = isiOf(ffmc, W), bui = buiOf(dmc, dc);
    return { ffmc, dmc, dc, isi, bui, fwi: fwiOf(isi, bui) };
  };

  // ---------- เวลา ----------
  /* day = วันนับจาก 1970-01-01 (วันที่ไทย) → ช่วง 10 วัน 0–35 */
  R.dekad = function (day) { const d = new Date(day * 864e5); return d.getUTCMonth() * 3 + Math.min(2, Math.floor((d.getUTCDate() - 1) / 10)) };
  /* ปีงบ พ.ศ. ของวัน (1 ต.ค. ขึ้นปีงบใหม่) */
  R.fyOf = function (day) { const d = new Date(day * 864e5); return d.getUTCFullYear() + 543 + (d.getUTCMonth() >= 9 ? 1 : 0) };
  R.fyDays = function (fy) { const a = Date.UTC(fy - 544, 9, 1) / 864e5; return [a, Date.UTC(fy - 543, 9, 1) / 864e5 - 1] };

  // ---------- ความถี่ในอดีต ----------
  /* fire: {unit: Set(วัน)} วันที่หน่วยนั้นมีจุดความร้อน ≥1 · units: รายชื่อหน่วย · fys: ปีงบที่ใช้สร้าง (ตรวจย้อนหลังต้องไม่รวมปีที่ทดสอบ)
   * → {g:[36] ค่ารวมทุกหน่วย, u:{unit:[36]}} ความน่าจะเป็นที่หน่วยจะมีจุดในวันหนึ่งของช่วงนั้น
   * หด: (n + A·g)/(N + A) — หน่วยที่มีประวัติน้อยเข้าใกล้ค่ารวม · เรียบ: [¼,½,¼] รอบปี (ช่วง 35 ติดกับ 0) */
  R.CLIM_A = 60;
  R.climBuild = function (fire, units, fys, A) {
    A = A == null ? R.CLIM_A : A;
    const N = new Array(36).fill(0);
    for (const fy of fys) { const [a, b] = R.fyDays(fy); for (let d = a; d <= b; d++) N[R.dekad(d)]++ }
    const cnt = {}, tot = new Array(36).fill(0), fs = new Set(fys);
    for (const u of units) {
      const c = cnt[u] = new Array(36).fill(0);
      for (const d of fire[u] || []) if (fs.has(R.fyOf(d))) { const k = R.dekad(d); c[k]++; tot[k]++ }
    }
    const sm = a => a.map((v, i) => 0.25 * a[(i + 35) % 36] + 0.5 * v + 0.25 * a[(i + 1) % 36]);
    const g0 = tot.map((t, k) => N[k] ? t / (N[k] * units.length) : 0), u = {};
    for (const x of units) u[x] = sm(cnt[x].map((n, k) => (n + A * g0[k]) / (N[k] + A)));
    return { g: sm(g0), u, fys: fys.slice() };
  };

  // ---------- คะแนน ----------
  const logit = p => { p = clamp(p, 1e-5, 1 - 1e-5); return Math.log(p / (1 - p)) };
  R.logit = logit;
  /* ตัวแปร: [1, logit(ความถี่ในอดีต), ln(1+FWI), มีจุดในหน่วยภายใน 3 วันก่อน (0/1)] — โมเดลที่ไม่ใช้ตัวใดให้สัมประสิทธิ์ 0 */
  R.feats = function (clim, fwi, recent) { return [1, logit(clim), Math.log1p(Math.max(fwi || 0, 0)), recent ? 1 : 0] };
  /* สัมประสิทธิ์ที่ใช้งาน = โมเดล M2 (ความถี่ในอดีต + FWI + จุด 3 วันก่อน) fit จากปีงบ 2561–2568 ด้วย scripts/risk_backtest.js ไฟจริง = ทุกดาวเทียม
     ทดสอบปีงบ 2569: ตำบล AUC 0.905 · แปลงสถานีฯ 0.908 — ผู้ใช้อนุมัติ M2 16 พ.ย. 69 · LV = ควอนไทล์ 50/75/90/97% ในฤดูไฟของปีที่ fit · ดู docs/arch/risk.md */
  R.M = { v: 'M2 (fit ปีงบ 2561–2568, อนุมัติ 16 พ.ย. 2569)', tm: { b: [-3.34, 0.727, 0.68, 1.35], LV: [0.0143, 0.0271, 0.048, 0.122] }, st: { b: [-4.05, 0.572, 0.792, 1.54], LV: [0.0393, 0.0713, 0.184, 0.354] } };
  R.M.b = R.M.tm.b;
  /* เกณฑ์ความน่าจะเป็น → ระดับ 1–5 (ต่ำมาก/ต่ำ/ปานกลาง/สูง/สูงมาก) — ค่าเริ่มต้น = ของตำบล */
  R.LV = R.M.tm.LV;
  R.LVN = ['ต่ำมาก', 'ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก'];
  R.prob = function (x, b) { b = b || R.M.b; let z = 0; for (let i = 0; i < x.length; i++) z += x[i] * (b[i] || 0); return 1 / (1 + Math.exp(-z)) };
  R.level = function (p, lv) { lv = lv || R.LV; let k = 1; for (const t of lv) if (p >= t) k++; return k };

  // ---------- ตรวจย้อนหลัง ----------
  /* logistic regression แบบ Newton (IRLS) + ridge เล็กน้อย (ไม่ลงโทษค่าคงที่) · X = แถวตัวแปร, y = 0/1 · cols = ดัชนีคอลัมน์ที่ใช้ */
  R.fitLogit = function (X, y, cols, ridge) {
    ridge = ridge == null ? 1e-3 : ridge;
    const k = cols.length, b = new Array(k).fill(0);
    for (let it = 0; it < 50; it++) {
      const g = new Array(k).fill(0), Hm = Array.from({ length: k }, () => new Array(k).fill(0));
      for (let i = 0; i < X.length; i++) {
        let z = 0; for (let a = 0; a < k; a++) z += b[a] * X[i][cols[a]];
        const p = 1 / (1 + Math.exp(-z)), w = p * (1 - p), e = y[i] - p;
        for (let a = 0; a < k; a++) { const xa = X[i][cols[a]]; g[a] += e * xa; for (let c = a; c < k; c++) Hm[a][c] += w * xa * X[i][cols[c]] }
      }
      for (let a = 0; a < k; a++) { for (let c = 0; c < a; c++) Hm[a][c] = Hm[c][a]; if (a) { Hm[a][a] += ridge * X.length; g[a] -= ridge * X.length * b[a] } }
      const d = solve(Hm, g); let mx = 0;
      for (let a = 0; a < k; a++) { b[a] += d[a]; mx = Math.max(mx, Math.abs(d[a])) }
      if (mx < 1e-7) break;
    }
    const full = new Array(Math.max(...cols) + 1).fill(0); cols.forEach((c, i) => { full[c] = b[i] });
    return full;
  };
  function solve(A, v) {
    const n = v.length, M = A.map((r, i) => r.concat([v[i]]));
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      [M[i], M[p]] = [M[p], M[i]];
      if (Math.abs(M[i][i]) < 1e-12) continue;
      for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c] }
    }
    return M.map((r, i) => Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]);
  }
  /* AUC (Mann–Whitney, คะแนนเท่ากันนับครึ่ง) */
  R.auc = function (s, y) {
    const ix = s.map((v, i) => i).sort((a, b) => s[a] - s[b]);
    let rank = 0, sp = 0, np = 0, i = 0;
    while (i < ix.length) {
      let j = i; while (j + 1 < ix.length && s[ix[j + 1]] === s[ix[i]]) j++;
      const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (y[ix[k]]) { sp += r; np++ }
      rank = j + 1; i = j + 1;
    }
    const nn = ix.length - np;
    return np && nn ? (sp - np * (np + 1) / 2) / (np * nn) : NaN;
  };
  /* ตารางสับสน: แถว = ระดับ 1–5 → {n หน่วย-วัน, fire หน่วย-วันที่มีจุด, rate} + 2×2 ที่เกณฑ์ ระดับ ≥ cut */
  R.confusion = function (lv, y, cut) {
    cut = cut || 4;
    const rows = [1, 2, 3, 4, 5].map(k => ({ lv: k, n: 0, fire: 0 }));
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < lv.length; i++) {
      const r = rows[lv[i] - 1]; r.n++; if (y[i]) r.fire++;
      const hi = lv[i] >= cut; if (hi && y[i]) tp++; else if (hi) fp++; else if (y[i]) fn++; else tn++;
    }
    rows.forEach(r => { r.rate = r.n ? r.fire / r.n : 0 });
    return { rows, cut, tp, fp, fn, tn, pod: tp / (tp + fn || 1), far: fp / (tp + fp || 1), pofd: fp / (fp + tn || 1), csi: tp / (tp + fp + fn || 1) };
  };
  /* Brier skill เทียบค่าคงที่ (อัตราเฉลี่ย) */
  R.brier = function (p, y) { let s = 0, m = 0; for (let i = 0; i < y.length; i++) m += y[i]; m /= y.length || 1; let r = 0; for (let i = 0; i < y.length; i++) { s += (p[i] - y[i]) ** 2; r += (m - y[i]) ** 2 } return { bs: s / y.length, bss: r ? 1 - s / r : 0 } };

  if (typeof module !== 'undefined' && module.exports) module.exports = R; else G.RISK = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
/*RISK-LIB-END*/
