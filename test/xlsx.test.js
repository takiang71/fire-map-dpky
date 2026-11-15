// อ่าน .xlsx (scripts/lib/xlsx.js — ใช้กับ Excel กรมอุทยานฯ ใน excel_to_hdata.js) · ไฟล์ทดสอบสร้างในเทสต์นี้เอง (zip ทั้งแบบเก็บตรงและบีบอัด)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const { readXlsx, unzip } = require('../scripts/lib/xlsx');

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 });
const crc32 = b => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 };
// files = [[ชื่อ, ข้อความ, บีบอัด?]] → Buffer ของไฟล์ zip
function zip(files) {
  const loc = [], cen = []; let off = 0;
  for (const [name, text, deflate] of files) {
    const raw = Buffer.from(text, 'utf8'), data = deflate ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(name, 'utf8'), crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, nm, data); cen.push(c, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const SHEET1 = `<?xml version="1.0"?><worksheet ${NS}><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="2"><v>45231</v></c><c r="C1" t="inlineStr"><is><t>ข้อความ&#3585;</t></is></c><c r="D1" t="b"><v>1</v></c><c r="E1" t="s"><v>1</v></c></row>
<row r="3"><c r="B3" t="e"><v>#N/A</v></c><c r="AA3" t="str"><f>A1&amp;"y"</f><v>x&amp;y</v></c><c r="C3"><v>-12.5</v></c></row>
<row r="4"><c r="A4" s="1"/></row>
</sheetData></worksheet>`;
const FILES = [
  ['[Content_Types].xml', '<?xml version="1.0"?><Types/>', false],
  ['xl/workbook.xml', `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="จุด &amp; ข้อมูล" sheetId="1" r:id="rId1"/><sheet name="ว่าง" sheetId="2" r:id="rId2"/></sheets></workbook>`, false],
  ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/></Relationships>', false],
  ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst count="2"><si><t>อุทยานแห่งชาติเขาใหญ่</t></si><si><r><rPr><b/></rPr><t>ทับ</t></r><r><t xml:space="preserve">ลาน &lt;1&gt; &amp;#3585;</t></r></si></sst>', true],
  ['xl/worksheets/sheet1.xml', SHEET1, true],
  ['xl/worksheets/sheet2.xml', `<?xml version="1.0"?><worksheet ${NS}><sheetData/></worksheet>`, false],
];

test('unzip: อ่าน central directory ได้ทั้งไฟล์เก็บตรงและบีบอัด', () => {
  const z = unzip(zip(FILES));
  assert.deepEqual(Object.keys(z), FILES.map(f => f[0]));
  for (const [n, t] of FILES) assert.equal(z[n].toString('utf8'), t);
});

test('readXlsx: ชีต/ข้อความร่วม/ข้อความในเซลล์/ตัวเลข/วันที่/ตรรกะ/สูตร/error/แถวและคอลัมน์ที่ข้าม', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-xlsx-')), f = path.join(dir, 'ตัวอย่าง.xlsx');
  fs.writeFileSync(f, zip(FILES));
  try {
    const W = readXlsx(f);
    assert.deepEqual(W.map(s => s.name), ['จุด & ข้อมูล', 'ว่าง']);
    const R = W[0].rows;
    assert.deepEqual(R[0], ['อุทยานแห่งชาติเขาใหญ่', 45231, 'ข้อความก', true, 'ทับลาน <1> &#3585;']);
    assert.equal(R[1], undefined, 'แถว 2 ไม่มีในไฟล์');
    assert.equal(R[2][1], '#N/A');
    assert.equal(R[2][2], -12.5);
    assert.equal(R[2][26], 'x&y', 'คอลัมน์ AA = ดัชนี 26, ผลของสูตร');
    assert.equal(R[3].length, 1); assert.equal(R[3][0], undefined, 'เซลล์ว่าง (มีแค่สไตล์)');
    assert.deepEqual(W[1].rows, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
});
