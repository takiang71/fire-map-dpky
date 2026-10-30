// อ่าน .xlsx แบบไม่ต้องติดตั้งแพ็กเกจ (zip central directory + zlib.inflateRaw) — คืนค่าทุกชีตเป็นแถวของค่าเซลล์
// ตัวเลขคืนเป็น number (วันที่ = เลขลำดับวันของ Excel), ข้อความคืนเป็น string · ไม่อ่านสูตร/สไตล์
const fs = require('fs'), zlib = require('zlib');

function unzip(buf) {
  const out = {}; let e = buf.length - 22;
  while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0, n = buf.readUInt16LE(e + 10); i < n; i++) {
    const m = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), fl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + fl).toString('utf8'), s = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const d = buf.slice(s, s + cs);
    out[name] = m === 0 ? d : zlib.inflateRawSync(d);
    p += 46 + fl + xl + cl;
  }
  return out;
}
const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/&amp;/g, '&');
const col = ref => [...ref.match(/^[A-Z]+/)[0]].reduce((c, ch) => c * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const txt = x => ent((x.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));

function readXlsx(file) {
  const z = unzip(fs.readFileSync(file)), ss = [];
  if (z['xl/sharedStrings.xml']) for (const si of z['xl/sharedStrings.xml'].toString().match(/<si>[\s\S]*?<\/si>/g) || []) ss.push(txt(si));
  const wb = z['xl/workbook.xml'].toString(), rels = z['xl/_rels/workbook.xml.rels'].toString();
  return [...wb.matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)].map(([, name, id]) => {
    const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${id}"[^>]*>`))[0];
    const x = z['xl/' + rel.match(/Target="([^"]*)"/)[1].replace(/^\/?xl\//, '')].toString(), rows = [];
    for (const r of x.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
      const a = [];
      for (const c of r.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) || []) {
        const t = (c.match(/ t="(\w+)"/) || [])[1]; let v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (t === 's') v = ss[+v]; else if (t === 'inlineStr') v = txt(c); else if (t === 'str' || t === 'e') v = v == null ? null : ent(v); else if (t === 'b') v = v === '1'; else if (v != null) v = +v;
        a[col(c.match(/ r="([A-Z]+\d+)"/)[1])] = v;
      }
      rows[+r.match(/ r="(\d+)"/)[1] - 1] = a;
    }
    return { name: ent(name), rows };
  });
}
module.exports = { readXlsx, unzip };
