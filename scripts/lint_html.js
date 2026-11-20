// E2 (docs/review-2569-11-15.md): หา template literal ที่แทรกค่าลง HTML โดยไม่ผ่าน esc() — ตัวตรวจ XSS แบบคร่าว ๆ (ไม่ใช่ตัวแยกไวยากรณ์ JS เต็มรูป)
// ใช้: node scripts/lint_html.js [โฟลเดอร์เว็บ|ไฟล์.html] [--json] [--all] [--update-base]   (ไม่ใส่ = repo: index.html + manual/index.html)
//   ตรวจทุก <script> ที่เป็นโค้ด (ไม่ใช่บล็อกข้อมูล JSON) → จุดที่ส่ง HTML เข้า DOM:
//     x.innerHTML= / += · x.outerHTML= · insertAdjacentHTML(ตำแหน่ง, …) · .setHTML(…) (ป๊อปอัป MapLibre)
//   ในนิพจน์ด้านขวา ทุก ${…} ของ template literal (รวมที่ซ้อนใน .map(…)) ต้อง "ปลอดภัย":
//     esc(…) · ตัวเลข (nf/Number/Math/toFixed/toLocaleString/.length/ตัวเลขตรง ๆ/+x) · สตริงตรง ๆ ในโค้ด · template ซ้อน (ตรวจข้างในแยก)
//     a?b:c (ตรวจ b, c) · a&&b (ตรวจ b — ค่าเท็จ ''/0/false/null ไม่มีอันตราย) · a||b (ตรวจทั้งคู่) · ….map(…).join(…) (ตรวจ template ใน callback แยก)
//     ชื่อคงที่ตัวพิมพ์ใหญ่ (SATN[k], TMO[i] — ค่าจากโค้ด) · ฟังก์ชันที่คืน HTML จากโค้ดเอง (ดู SAFE_FN / สร้างจาก template ทั้งตัว)
//   ที่ไม่เข้าเกณฑ์ = "ต้องตรวจ" (ค่าจากข้อมูลภายนอกอาจหลุดเป็น HTML) — เลขบรรทัดเป็นบรรทัดจริงใน index.html
//   ยกเว้นรายจุดที่ตรวจด้วยตาแล้วว่าค่ามาจากโค้ด/ตัวเลข: ใส่ /*xss-ok*/ ใน ${…} เช่น ${/*xss-ok*/k} (ห้ามใช้ // ท้ายบรรทัด — กติกาข้อ 5)
// ผล: ไม่มีจุดใหม่ (นอก scripts/lint_html_base.json) = exit 0 · มี = exit 1 (check_site เรียก lint()+fresh() แล้วใส่เป็นคำเตือน ไม่ทำให้ไม่ผ่าน)
'use strict';
const fs = require('fs'), path = require('path');

// ---- ตัวแบ่ง token อย่างง่าย: หาตำแหน่งสตริง/คอมเมนต์/regex/template (ซ้อนได้) ----
// คืน { mask: Uint8Array (1 = อยู่ในสตริง/คอมเมนต์/regex/ตัวอักษรของ template), tpls: [{a, b, parts:[{a, b}]}] } ตำแหน่งอ้างอิงใน src
const RE_BEFORE = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const KW_BEFORE = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/;
function scan(src) {
  const n = src.length, mask = new Uint8Array(n), tpls = [];
  const prevSig = i => { let j = i - 1; while (j >= 0 && /\s/.test(src[j])) j--; return j };
  // อ่านโค้ดตั้งแต่ i จนเจอ '}' ที่ปิด depth 0 (ใช้กับ ${…}) หรือจบไฟล์ → คืนตำแหน่ง '}'
  function code(i, stopBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; mask.fill(1, i, j); i = j; continue }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; mask.fill(1, i, j); i = j; continue }
      if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++ } mask.fill(1, i, j + 1); i = j + 1; continue }
      if (c === '`') { i = tpl(i); continue }
      if (c === '/') {
        const p = prevSig(i), pc = p < 0 ? '' : src[p];
        if (p < 0 || RE_BEFORE.has(pc) || KW_BEFORE.test(src.slice(Math.max(0, p - 10), p + 1))) {
          let j = i + 1, cls = false;
          while (j < n && src[j] !== '\n') { const x = src[j]; if (x === '\\') { j += 2; continue } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; j++ }
          j++; while (j < n && /[a-z]/i.test(src[j])) j++;
          mask.fill(1, i, j); i = j; continue;
        }
      }
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0 && stopBrace) return i; depth--; }
      i++;
    }
    return n;
  }
  function tpl(i) {
    const T = { a: i, b: -1, parts: [] }; tpls.push(T); mask[i] = 1; let j = i + 1;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { mask[j] = mask[j + 1] = 1; j += 2; continue }
      if (c === '`') { mask[j] = 1; T.b = j + 1; return j + 1 }
      if (c === '$' && src[j + 1] === '{') { mask[j] = mask[j + 1] = 1; const e = code(j + 2, true); T.parts.push({ a: j + 2, b: e }); if (e < n) mask[e] = 1; j = e + 1; continue }
      mask[j] = 1; j++;
    }
    T.b = n; return n;
  }
  code(0, false);
  return { mask, tpls };
}

// ---- แยกนิพจน์ระดับบนสุด (ไม่นับในวงเล็บ/สตริง) ----
function topSplit(s, ops) {
  const S = scan(s), out = []; let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (S.mask[i]) continue; const c = s[i];
    if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
    else if (depth === 0) for (const op of ops) if (s.startsWith(op, i)) { out.push([s.slice(last, i), op]); last = i + op.length; i += op.length - 1; break }
  }
  out.push([s.slice(last), null]); return out;
}
// ternary ระดับบนสุด: cond ? a : b → [cond, a, b] (ไม่ใช่ ternary = null)
function ternary(s) {
  const S = scan(s); let depth = 0, q = -1, nest = 0;
  for (let i = 0; i < s.length; i++) {
    if (S.mask[i]) continue; const c = s[i];
    if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === '?' && s[i + 1] !== '.' && s[i + 1] !== '?' && s[i - 1] !== '?') { if (q < 0) q = i; else nest++ }
    else if (depth === 0 && c === ':' && q >= 0) { if (nest) nest--; else return [s.slice(0, q), s.slice(q + 1, i), s.slice(i + 1)] }
  }
  return null;
}
const balancedCall = (s, name) => { if (!s.startsWith(name + '(')) return false; let d = 0; const S = scan(s); for (let i = name.length; i < s.length; i++) { if (S.mask[i]) continue; if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0) return i === s.length - 1 } } return false };
const strip = s => { s = s.trim(); while (s.startsWith('(') && balancedCall('X' + s, 'X')) s = s.slice(1, -1).trim(); return s };

// ฟังก์ชันในหน้าเว็บที่คืนสตริง HTML/ข้อความจากโค้ดเอง (ค่าภายนอกที่รับเข้าไปผ่าน esc ภายในแล้ว — ตรวจด้วยตา 16 พ.ย. 69)
// เติมอัตโนมัติด้วย: ฟังก์ชันลูกศรที่ตัวมันเองเป็น template/esc ทั้งตัว (ดู autoSafe)
const SAFE_FN = new Set(['esc', 'nf', 'Number', 'String', 'parseInt', 'parseFloat', 'fmtN', 'pct', 'thTime', 'thDate', 'dShort', 'dTh', 'tTh', 'hm', 'ico', 'svg', 'ICO', 'paShort', 'sbShort', 'escA', 'encodeURIComponent', 'JSON.stringify']);
function safeExpr(e, ctx) {
  e = strip(e);
  if (!e) return true;
  if (/\/\*\s*xss-ok\s*\*\//.test(e)) return true;
  // ตัวเลข/สตริงตรง ๆ/ค่าตรรกะ
  if (/^-?[\d.]+(e[-+]?\d+)?$/i.test(e) || /^(true|false|null|undefined)$/.test(e)) return true;
  if (/^(['"])(?:(?!\1)[^\\]|\\.)*\1$/.test(e)) return true;
  if (/^`[\s\S]*`$/.test(e) && scan(e).tpls[0] && scan(e).tpls[0].b === e.length) return true; // template ซ้อน: ข้างในตรวจแยก
  const t = ternary(e); if (t) return safeExpr(t[1], ctx) && safeExpr(t[2], ctx);
  const or = topSplit(e, ['||', '??']); if (or.length > 1) return or.every(([x]) => safeExpr(x, ctx));
  const and = topSplit(e, ['&&']); if (and.length > 1) return safeExpr(and[and.length - 1][0], ctx);
  const plus = topSplit(e, ['+']); if (plus.length > 1 && plus.every(([x]) => x.trim())) return plus.every(([x]) => safeExpr(x, ctx));
  if (/^[+-]/.test(e) && !/^[+-]['"`]/.test(e)) return true; // +x / -x = ตัวเลข
  if (topSplit(e, ['-', '*', '/', '%']).length > 1) return true; // เลขคณิต
  if (/^(Math\.\w+|Number|nf|parseInt|parseFloat)\(/.test(e) || /\.(toFixed|toLocaleString|toPrecision|length|size)(\([^()]*\))?$/.test(e) || /\.length$/.test(e)) return true;
  if (/^typeof\b/.test(e)) return true;
  // ฟังก์ชันที่รู้ว่าปลอดภัย (ทั้งนิพจน์เป็นการเรียกครั้งเดียว)
  const fm = e.match(/^([\w$.]+)\(/); if (fm && (SAFE_FN.has(fm[1]) || ctx.auto.has(fm[1])) && balancedCall(e, fm[1])) return true;
  // ….map(cb).join(…) / ….join('') ของรายการที่ map เป็น template แล้ว
  if (/\.map\(/.test(e) && /\.join\([^()]*\)$/.test(e)) { const cb = e.slice(e.indexOf('.map(') + 5); return /=>\s*(`|esc\(|\(?`)/.test(cb) || /=>\s*\{[\s\S]*return\s*`/.test(cb) || /^\(?(esc|nf|ico)\)/.test(cb) || ctx.auto.has((cb.match(/^([\w$]+)\)/) || [])[1]) }
  if (/^[\w$.]+\.join\(/.test(e)) return false;
  // ค่าคงที่ในโค้ด: ชื่อตัวพิมพ์ใหญ่ล้วน (SATN[k], TMO[m], FWK[c][0])
  if (/^[A-Z][A-Z0-9_]*(\[[^\]]*\]|\.\w+)*$/.test(e)) return true;
  return false;
}
// ฟังก์ชันลูกศร/ฟังก์ชันที่คืน template หรือ esc() ทั้งตัว → นับเป็นตัวสร้าง HTML ที่ปลอดภัย (ข้างในถูกตรวจแยกอยู่แล้วเมื่อถูกส่งเข้า sink)
function autoSafe(src) {
  const A = new Set();
  for (const m of src.matchAll(/(?:const|let|var|,)\s*([\w$]+)\s*=\s*(?:\([^()]*\)|[\w$]+)\s*=>\s*(`|esc\()/g)) A.add(m[1]);
  return A;
}

const SINK = [
  { re: /\.(innerHTML|outerHTML)\s*\+?=(?!=)/g, kind: 'assign' },
  { re: /\.insertAdjacentHTML\(/g, kind: 'call2' },
  { re: /\.setHTML\(/g, kind: 'call1' },
];
// ช่วงนิพจน์ด้านขวา: assign = จนถึง ; หรือ , หรือวงเล็บปิดระดับบนสุด · call = อาร์กิวเมนต์ (call2 = ตัวที่สอง)
function rhs(src, mask, at, kind) {
  let i = at, depth = 0;
  const end = c => c === ';' || c === ',' || c === ')' || c === '}' || c === ']' || c === '\n';
  if (kind === 'assign') {
    for (; i < src.length; i++) { if (mask[i]) continue; const c = src[i]; if ('([{'.includes(c)) depth++; else if (depth > 0 && ')]}'.includes(c)) depth--; else if (depth === 0 && end(c)) break }
    return [at, i];
  }
  let a = at;
  if (kind === 'call2') { for (; i < src.length; i++) { if (mask[i]) continue; const c = src[i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; else if (depth === 0 && c === ',') { a = i + 1; i++; break } } }
  depth = 0;
  for (; i < src.length; i++) { if (mask[i]) continue; const c = src[i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) { if (depth === 0) break; depth-- } else if (depth === 0 && c === ',') break }
  return [a, i];
}

function lint(file) {
  const html = fs.readFileSync(file, 'utf8'), out = [], rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, U = []; let m;
  while ((m = re.exec(html))) {
    const at = m[1] || '', ty = (at.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    // x-emb-app = สคริปต์แอปที่ build_site พักไว้ (B1) · x-lazy = โค้ดโหลดเมื่อใช้ใน repo (B1 เฟส 2 — lzJs)
    if (/\ssrc\s*=/.test(at) || (ty && !/javascript|module|x-emb-app|x-lazy/i.test(ty))) continue;
    U.push({ text: html, base: m.index + m[0].indexOf('>') + 1, src: m[2], file: rel });
  }
  // B1 เฟส 2: _site — โค้ดที่ build_site.splitLz แยกเป็น js/<n>.<sha8>.js (ดัชนี #lzix) ตรวจทั้งไฟล์ (คีย์ใน lint_html_base.json = 'app' เหมือนตอนอยู่ใน index.html)
  const lz = html.match(/<script type="application\/json" id="lzix">([\s\S]*?)<\/script>/);
  if (lz) for (const u of Object.values(JSON.parse(lz[1]))) {
    const f = path.join(path.dirname(file), u), t = fs.readFileSync(f, 'utf8');
    U.push({ text: t, base: 0, src: t, file: path.relative(process.cwd(), f).replace(/\\/g, '/') });
  }
  for (const { text, base, src, file: fr } of U) {
    const S = scan(src), ctx = { auto: autoSafe(src) }, n0 = out.length;
    const lineOf = i => text.slice(0, base + i).split('\n').length;
    for (const { re: sr, kind } of SINK) {
      sr.lastIndex = 0; let s;
      while ((s = sr.exec(src))) {
        if (S.mask[s.index]) continue;
        const [a, b] = rhs(src, S.mask, s.index + s[0].length, kind), expr = src.slice(a, b);
        // นิพจน์ทั้งก้อนไม่ใช่ template (เช่น x.innerHTML=html ตัวแปร) — ตรวจเป็นนิพจน์เดียว
        const T = S.tpls.filter(t => t.a >= a && t.b <= b);
        if (!T.length) { if (!safeExpr(expr, ctx)) out.push({ line: lineOf(s.index), sink: s[0].replace(/\s+/g, ''), expr: expr.trim().slice(0, 80), why: 'ค่า HTML จากตัวแปร (ตรวจที่มาของตัวแปร)' }); continue }
        for (const t of T) for (const p of t.parts) {
          const e = src.slice(p.a, p.b);
          if (!safeExpr(e, ctx)) out.push({ line: lineOf(p.a), sink: s[0].replace(/\s+/g, ''), expr: e.trim().slice(0, 80), why: 'ไม่ผ่าน esc()' });
        }
      }
    }
    for (let k = n0; k < out.length; k++) out[k].file = fr;
  }
  // ตัดซ้ำ (template ซ้อนใน sink เดียวกันถูกนับครั้งเดียวต่อบรรทัด+นิพจน์)
  const seen = new Set();
  return out.filter(x => { const k = x.file + '|' + x.line + '|' + x.expr; if (seen.has(k)) return false; seen.add(k); return true });
}

// ---- รายการที่ตรวจด้วยตาแล้ว (ratchet): scripts/lint_html_base.json = คีย์ "sink|นิพจน์" (ไม่มีเลขบรรทัด — แก้บรรทัดอื่นแล้วไม่หลุด) ----
// check_site เตือนเฉพาะจุดใหม่ที่ไม่อยู่ในรายการ · ตรวจจุดใหม่แล้วว่าปลอดภัย (ค่าจากโค้ด/ตัวเลข) → node scripts/lint_html.js --update-base
// ค่าภายนอก (API/ไฟล์ผู้ใช้/เซิร์ฟเวอร์) → ใส่ esc() แทน ห้ามเพิ่มเข้ารายการ
const BASE = path.join(__dirname, 'lint_html_base.json');
// ไฟล์ในคีย์: app = index.html (ใน repo หรือ _site) · manual = manual/index.html
const keyOf = r => (/manual[\\/]/.test(r.file) ? 'manual' : 'app') + '|' + r.sink + '|' + r.expr;
// ตรวจทั้งเว็บ (index.html + manual/index.html ในโฟลเดอร์ dir)
const lintDir = dir => ['index.html', 'manual/index.html'].map(f => path.join(dir, f)).filter(f => fs.existsSync(f)).flatMap(lint);
function readBase() { try { return JSON.parse(fs.readFileSync(BASE, 'utf8')) } catch (e) { return null } }
// จุดที่ยังไม่อยู่ในรายการ (นับซ้ำได้: คีย์เดียวกันมี 3 ที่ ในรายการ 2 = ใหม่ 1)
function fresh(R, base = readBase()) {
  if (!base) return R;
  const left = Object.assign({}, base.keys);
  return R.filter(r => { const k = keyOf(r); if (left[k] > 0) { left[k]--; return false } return true });
}
function writeBase(R) {
  const keys = {}; for (const r of R) keys[keyOf(r)] = (keys[keyOf(r)] || 0) + 1;
  fs.writeFileSync(BASE, JSON.stringify({ note: 'จุดที่ค่าเข้า HTML โดยไม่ผ่าน esc() ซึ่งตรวจด้วยตาแล้วว่าเป็นค่าจากโค้ด/ตัวเลข/HTML ที่โค้ดสร้างเอง (E2) — สร้างด้วย node scripts/lint_html.js --update-base', updated: new Date().toISOString().slice(0, 10), n: R.length, keys: Object.fromEntries(Object.entries(keys).sort()) }, null, 1) + '\n');
}

module.exports = { lint, lintDir, scan, fresh, readBase, keyOf, safeExpr: (e, auto = new Set()) => safeExpr(e, { auto }) };

if (require.main === module) (() => {
  // อาร์กิวเมนต์ = ไฟล์ HTML หรือโฟลเดอร์เว็บ (ไม่ใส่ = โฟลเดอร์ repo: index.html + manual/index.html)
  const args = process.argv.slice(2), t = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
  const A = fs.statSync(t).isDirectory() ? lintDir(t) : lint(t);
  if (args.includes('--update-base')) { writeBase(A); console.log(`บันทึก ${A.length} จุดเป็นรายการที่ตรวจแล้ว → ${path.relative(process.cwd(), BASE)}`); return }
  // --all = ทุกจุด (รวมที่ตรวจแล้ว) · ปกติ = เฉพาะจุดใหม่ที่ไม่อยู่ใน lint_html_base.json
  const N = fresh(A), R = args.includes('--all') ? A : N;
  if (args.includes('--json')) console.log(JSON.stringify(R, null, 1));
  else {
    for (const r of R) console.log(`${r.file}:${r.line}  ${r.sink}  \${${r.expr}}  — ${r.why}`);
    console.log(`ทั้งหมด ${A.length} จุด · ตรวจแล้ว (lint_html_base.json) ${A.length - N.length} · ` + (N.length ? `ใหม่ ${N.length} จุด — ค่าภายนอกให้ใส่ esc() · ค่าจากโค้ด/ตัวเลขใส่ /*xss-ok*/ หรือ --update-base` : '✅ ไม่มีจุดใหม่'));
  }
  process.exitCode = N.length ? 1 : 0;
})();
