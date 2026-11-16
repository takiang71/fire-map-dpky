// E2 scripts/lint_html.js: ตัวหา template ที่แทรกค่าลง innerHTML/insertAdjacentHTML/setHTML โดยไม่ผ่าน esc()
//  - ไฟล์ HTML ตัวอย่างสร้างในเทสต์ (โฟลเดอร์ชั่วคราว) — ไม่อ่าน data/ · index.html จริงอ่านอย่างเดียว
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { ROOT } = require('./helpers.cjs');
const L = require('../scripts/lint_html');

const tmp = (js, name = 'index.html') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-')), f = path.join(d, name); fs.writeFileSync(f, `<!doctype html><script type="application/json" id="x">{"a":"\`\${p.name}\`"}</script>\n<script>\n${js}\n</script>`); return f };

test('safeExpr: esc/ตัวเลข/สตริงตรง/ternary/&&/|| /map().join ปลอดภัย · ค่าดิบจากข้อมูลไม่ปลอดภัย', () => {
  for (const e of ['esc(p.name)', "nf(n)", 'x.length', '3', "'ข้อความ'", 'a?esc(b):\'–\'', 'ok&&esc(t)', "esc(a)||'–'", 'Math.round(v)', 'v.toFixed(1)', 'SATN[k]',
    "L.map(r=>`<td>${r.n}</td>`).join('')", '/*xss-ok*/k', 'fyOfDay(d)-1'])
    assert.equal(L.safeExpr(e), true, e);
  for (const e of ['p.name', 'p.description', 'h.tam', 'a?p.name:\'\'', 'ok&&p.desc', "p.name||'–'", "f.sats.join(', ')", 'm', 'n+1'])
    assert.equal(L.safeExpr(e), false, e);
});

test('lint: จับค่าดิบใน innerHTML / insertAdjacentHTML / setHTML / += และใน template ซ้อน · ข้ามสตริง คอมเมนต์ regex และบล็อก JSON', () => {
  const f = tmp([
    'el.innerHTML=`<b>${p.name}</b> ${esc(p.ok)} ${n}`;',
    "el.insertAdjacentHTML('beforeend',`<i>${r.desc}</i>`);",
    'new maplibregl.Popup().setLngLat(ll).setHTML(`<b>${st.name}</b>${st.area?`<br>${st.area}`:\'\'}`).addTo(map);',
    'el.innerHTML+=`<p>${esc(a)}</p>`;',
    "const s='el.innerHTML=`${bad}`';/* el.innerHTML=`${bad2}` */const re=/innerHTML=`${x}`/;",
    'el.innerHTML=L.map(x=>`<li>${x.title}</li>`).join(\'\');',
    'el.textContent=`${p.name}`;',
  ].join('\n'));
  const R = L.lint(f), got = R.map(r => r.expr).sort();
  assert.deepEqual(got, ['n', 'p.name', 'r.desc', 'st.area', 'st.name', 'x.title'].sort());
  assert.ok(R.every(r => r.line >= 3), 'เลขบรรทัดเป็นบรรทัดจริงในไฟล์');
  assert.equal(R.find(r => r.expr === 'r.desc').sink, '.insertAdjacentHTML(');
  assert.equal(R.find(r => r.expr === 'st.name').sink, '.setHTML(');
});

test('lint: รายการที่ตรวจแล้ว (ratchet) — คีย์ไม่มีเลขบรรทัด นับซ้ำได้ · จุดใหม่ = ไม่อยู่ในรายการ', () => {
  const R = L.lint(tmp('a.innerHTML=`${k}${k}`;\nb.innerHTML=`${p.name}`;'));
  const base = { keys: { [L.keyOf(R[0])]: 1 } };
  assert.equal(R.filter(r => r.expr === 'k').length, 1, 'บรรทัดเดียวกัน นิพจน์เดียวกัน = นับครั้งเดียว');
  assert.deepEqual(L.fresh(R, base).map(r => r.expr), ['p.name']);
  assert.equal(L.fresh(R, null).length, R.length, 'ไม่มีไฟล์รายการ = ทุกจุดเป็นจุดใหม่');
  assert.match(L.keyOf({ file: '_site/manual/index.html', sink: '.innerHTML=', expr: 'x' }), /^manual\|/);
  assert.match(L.keyOf({ file: '_site/index.html', sink: '.innerHTML=', expr: 'x' }), /^app\|/);
});

test('index.html + คู่มือ: ไม่มีจุดใหม่นอกรายการที่ตรวจแล้ว · จุดที่แก้แล้ว (Air4Thai/ดาวเทียม/สถานีกรมอุตุฯ) ใช้ esc()', () => {
  const A = L.lintDir(ROOT);
  assert.deepEqual(L.fresh(A).map(r => `${r.file}:${r.line} ${r.expr}`), []);
  for (const e of ['st.name', 'st.area', 'st.src', "f.sats.join(', ')||'–'", 's.station_id', 's.id']) assert.ok(!A.some(r => r.expr === e && !/manual/.test(r.file)), e);
});
