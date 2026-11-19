// สำเนาทดสอบแบบรับแจ้งเหตุไฟป่า กรมอุทยานฯ — scripts/gas/dnp_form_copy.gs (Apps Script) · docs/dnp-form.md
//  รันสคริปต์กับ FormApp/SpreadsheetApp จำลอง แล้วตรวจว่าสำเนามีคำถาม ตัวเลือก ช่องบังคับ ตัวตรวจ และการข้ามส่วนตรงต้นฉบับ
//  fixtures/dnp_form_sbo1.json, dnp_form_sbo7.json = FB_PUBLIC_LOAD_DATA_ จากหน้า viewform (19 พ.ย. 69)
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'gas', 'dnp_form_copy.gs'), 'utf8');
const FX = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const NAV = { CONTINUE: 'CONTINUE', GO_TO_PAGE: 'GO_TO_PAGE', RESTART: 'RESTART', SUBMIT: 'SUBMIT' };

function mock() {
  const log = { items: [], form: {} };
  const item = kind => {
    const o = { kind, title: null, help: '', req: null, choices: null, other: false, goTo: null, valid: null, year: null };
    const self = {
      setTitle: t => (o.title = t, self), setHelpText: t => (o.help = t, self), setRequired: r => (o.req = r, self),
      createChoice: (v, to) => ({ v, to: to === undefined ? null : to }),
      setChoices: c => (o.choices = c, self), setGoToPage: p => (o.goTo = p, self), setValidation: v => (o.valid = v, self),
      _o: o
    };
    if (kind === 'mc' || kind === 'cb') self.showOtherOption = b => (o.other = b, self);
    if (kind === 'date' || kind === 'datetime') self.setIncludesYear = b => (o.year = b, self);
    log.items.push(o);
    return self;
  };
  const form = {
    setDescription: s => (log.form.desc = s), setEmailCollectionType: t => (log.form.email = t), setCollectEmail: b => (log.form.email = b),
    setConfirmationMessage: s => (log.form.confirm = s), setAcceptingResponses: b => (log.form.accept = b), setPublished: b => (log.form.pub = b),
    setDestination: (t, id) => (log.form.dest = [t, id]),
    addTextItem: () => item('text'), addParagraphTextItem: () => item('para'), addMultipleChoiceItem: () => item('mc'),
    addListItem: () => item('list'), addCheckboxItem: () => item('cb'), addDateItem: () => item('date'), addDateTimeItem: () => item('datetime'),
    addTimeItem: () => item('time'), addPageBreakItem: () => item('page'), addSectionHeaderItem: () => item('header'),
    getPublishedUrl: () => 'https://forms/view', getEditUrl: () => 'https://forms/edit'
  };
  const vb = () => { const r = {}; const b = { requireTextMatchesPattern: p => (r.re = p, b), requireNumber: () => (r.num = true, b), requireWholeNumber: () => (r.whole = true, b), setHelpText: t => (r.msg = t, b), build: () => r }; return b; };
  const ctx = {
    FormApp: { create: t => (log.form.title = t, form), EmailCollectionType: { RESPONDER_INPUT: 'RESPONDER_INPUT' }, PageNavigationType: NAV, DestinationType: { SPREADSHEET: 'SPREADSHEET' }, createTextValidation: vb },
    SpreadsheetApp: { create: t => (log.form.sheetTitle = t, { getId: () => 'SHEET', getUrl: () => 'https://sheet' }) },
    Logger: { log: () => {} }, UrlFetchApp: null
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, log };
}

for (const [fx, name] of [['dnp_form_sbo1.json', 'สบอ.1'], ['dnp_form_sbo7.json', 'สบอ.7']]) {
  test('สำเนา ' + name + ': คำถาม/ช่องบังคับ/ตัวเลือกตรงต้นฉบับ', () => {
    const d = FX(fx), { ctx, log } = mock();
    const r = ctx.dnpBuild(d, '[ทดสอบ] ');
    assert.ok(log.form.title.startsWith('[ทดสอบ] แบบรับแจ้งเหตุไฟป่า'), log.form.title);
    assert.equal(log.form.email, 'RESPONDER_INPUT', 'เก็บอีเมลแบบพิมพ์เอง');
    assert.deepEqual(log.form.dest, ['SPREADSHEET', 'SHEET']);
    assert.equal(r.skip.length, 0, 'ไม่มีข้อที่ข้าม');
    const src = d[1][1];
    assert.equal(log.items.length, src.length, 'จำนวนข้อ (รวมส่วน) เท่ากัน');
    const qs = src.filter(q => q[3] !== 8);
    assert.equal(r.n, qs.length);
    assert.ok(qs.every(q => q[4][0][2] === 1), 'ต้นฉบับบังคับทุกข้อ');
    src.forEach((q, i) => {
      const o = log.items[i];
      assert.equal(o.title, q[1] || '', 'ชื่อข้อ ' + i);
      if (q[3] === 8) return;
      assert.equal(o.req, true, q[1]);
      const opts = q[4][0][1];
      if (opts) {
        const want = opts.filter(x => !(x[4] === 1 && !x[0])).map(x => x[0]);
        assert.deepEqual([...o.choices.map(c => c.v)], want, 'ตัวเลือก ' + q[1]);
        assert.equal(o.other, opts.some(x => x[4] === 1 && !x[0]), 'ตัวเลือกอื่นๆ ' + q[1]);
      }
    });
    const by = t => log.items[src.findIndex(q => q[1] === t)];
    assert.equal(by('วันที่และเวลารับแจ้งเหตุ').kind, 'datetime');
    assert.equal(by('กลุ่มไฟเดิม').kind, 'date');
    assert.equal(by('ชนิดป่า').kind, 'cb');
    assert.equal(by('ตรวจพบไฟจาก').other, true, '"ตรวจพบไฟจาก" มีช่องอื่นๆ พิมพ์เอง');
    assert.deepEqual({ ...by('พิกัด X').valid }, { re: '([0-9]{6})', msg: 'กรุณาตรวจสอบความถูกต้อง' });
    assert.deepEqual({ ...by('พิกัด Y').valid }, { re: '([0-9]{7})', msg: 'กรุณาตรวจสอบความถูกต้อง' });
    assert.equal(by('จำนวนผู้ปฏิบัติงานทั้งหมด (นาย)').valid.whole, true);
    assert.equal(by('เบอร์โทรศัพท์มือถือ').valid.re, "(0)([6'8'9]{1})([0-9]{8})");
  });

  test('สำเนา ' + name + ': การข้ามส่วนตรงต้นฉบับ', () => {
    const d = FX(fx), { ctx, log } = mock();
    ctx.dnpBuild(d, '');
    const src = d[1][1], page = id => log.items[src.findIndex(q => q[0] === id)];
    const pg = t => log.items[src.findIndex(q => q[3] === 8 && q[1] === t)];
    const area = log.items[src.findIndex(q => q[1] === 'พื้นที่เกิดไฟป่า')];
    const to = v => area.choices.find(c => c.v === v).to;
    assert.equal(to('ป่าอนุรักษ์')._o, pg('ระบุพื้นที่ป่าอนุรักษ์'));
    assert.equal(to('พื้นที่ราษฎรทำกินในป่าอนุรักษ์')._o, pg('ระบุพื้นที่ป่าอนุรักษ์'));
    assert.equal(to('ป่าสงวนแห่งชาติ')._o, pg('ระบุพื้นที่ป่าสงวนแห่งชาติ'));
    assert.equal(to('นอกพื้นที่ป่าฯ')._o, pg('ระบุการตรวจพบไฟจาก'));
    /* จบส่วนป่าอนุรักษ์ → ข้ามส่วนป่าสงวน ไปส่วนตรวจพบไฟ (เก็บไว้ที่ส่วนป่าสงวน = ส่วนถัดไป) */
    assert.equal(pg('ระบุพื้นที่ป่าสงวนแห่งชาติ').goTo._o, pg('ระบุการตรวจพบไฟจาก'));
    const grp = log.items[src.findIndex(q => q[1] === 'ประเภทกลุ่มไฟ')];
    assert.equal(grp.choices.find(c => c.v === 'กลุ่มไฟเดิม').to._o, pg('ระบุกลุ่มไฟเดิม'));
    const after = src.find(q => q[3] === 8 && !q[1])[0];
    assert.equal(grp.choices.find(c => c.v === 'กลุ่มไฟใหม่').to._o, page(after), 'กลุ่มไฟใหม่ ข้ามส่วนวันที่กลุ่มไฟเดิม');
  });
}

test('dnpLoad: อ่านโครงสร้างจากหน้า viewform · หน้าไม่มีข้อมูล (บังคับล็อกอิน) = แจ้งชัด', () => {
  const { ctx } = mock();
  const d = FX('dnp_form_sbo1.json');
  const html = '<html><script>var FB_PUBLIC_LOAD_DATA_ = ' + JSON.stringify(d) + ';</script></html>';
  assert.equal(ctx.dnpLoad(html)[1][1].length, d[1][1].length);
  assert.throws(() => ctx.dnpLoad('<html>ลงชื่อเข้าใช้</html>'), /อ่านโครงสร้างฟอร์มไม่ได้/);
});
