/*
 * สร้าง "สำเนาสำหรับทดสอบ" ของแบบรับแจ้งเหตุไฟป่า กรมอุทยานฯ (Google Forms) ในบัญชี Google ของผู้รัน
 * ใช้ทดสอบการส่งรายงานจากเว็บแผนที่ไฟป่า โดยไม่เกิดแถวปลอมในตารางจริงของกรมฯ — docs/dnp-form.md
 *
 * วิธีใช้: เปิด https://script.google.com → โครงการใหม่ → วางไฟล์นี้ทั้งไฟล์ → เลือกฟังก์ชัน makeCopies → เรียกใช้
 *          (ครั้งแรก Google ขออนุญาต: สร้าง/แก้ฟอร์ม, สร้างสเปรดชีต, เชื่อมต่อบริการภายนอกเพื่ออ่านหน้าฟอร์มต้นฉบับ)
 *          จบแล้วดูลิงก์ในบันทึกการดำเนินการ (Execution log) แล้วส่งลิงก์ "ฟอร์ม (ส่งคำตอบ)" ให้ผู้ดูแลเว็บ
 *
 * ทำอะไร: อ่านโครงสร้างฟอร์มต้นฉบับจากหน้า viewform สาธารณะ (ไม่ส่งข้อมูลใดๆ เข้าฟอร์มต้นฉบับ)
 *          แล้วสร้างฟอร์มใหม่ คำถาม/ตัวเลือก/ช่องบังคับ/ตัวตรวจรูปแบบ/การข้ามส่วน เหมือนเดิม + เก็บอีเมลแบบเดียวกับต้นฉบับ (ยืนยันตัวตน)
 *          + สเปรดชีตรับคำตอบ · ชื่อฟอร์มขึ้นต้น [ทดสอบ] · รหัสช่อง (entry.N) จะต่างจากต้นฉบับ (เว็บจับคู่ช่องจากชื่อคำถาม)
 */

var DNP_SOURCES = [
  { name: 'สบอ.1', url: 'https://docs.google.com/forms/d/e/1FAIpQLSeKDgZ5l6Hdrd_ClCrXoIK9BlYcsJTHWFCwSnBMtegDN3CetA/viewform' },
  { name: 'สบอ.7', url: 'https://docs.google.com/forms/d/e/1FAIpQLScFW1QvKgC0aOi714G-shiOgD_fQ5e0o8CJicoHGnWyWtb7NA/viewform' }
];
var DNP_PREFIX = '[ทดสอบ] ';

function makeCopies() {
  var out = [];
  for (var i = 0; i < DNP_SOURCES.length; i++) {
    var s = DNP_SOURCES[i], r = dnpCopyFromUrl(s.url, DNP_PREFIX);
    out.push(s.name + '\n  ฟอร์ม (ส่งคำตอบ): ' + r.view + '\n  แก้ไขฟอร์ม: ' + r.edit + '\n  ตารางคำตอบ: ' + r.sheet +
      '\n  คำถาม ' + r.n + ' ข้อ' + (r.skip.length ? ' · ข้าม: ' + r.skip.join(', ') : ''));
  }
  Logger.log('สร้างสำเนาเสร็จ\n\n' + out.join('\n\n'));
}

/* อ่าน FB_PUBLIC_LOAD_DATA_ จากหน้า viewform */
function dnpLoad(html) {
  var m = /FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/.exec(html);
  if (!m) throw new Error('อ่านโครงสร้างฟอร์มไม่ได้ (ฟอร์มอาจบังคับล็อกอิน หรือหน้าเปลี่ยนรูปแบบ)');
  return JSON.parse(m[1]);
}

function dnpCopyFromUrl(url, prefix) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('เปิดฟอร์มต้นฉบับไม่ได้ HTTP ' + res.getResponseCode() + ' ' + url);
  return dnpBuild(dnpLoad(res.getContentText()), prefix);
}

/* สร้างฟอร์มจากโครงสร้าง d (แยกจาก UrlFetch เพื่อทดสอบด้วย FormApp จำลองใน Node: test/dnp_copy.test.js) */
function dnpBuild(d, prefix) {
  var info = d[1], items = info[1] || [], title = (prefix || '') + String(info[8] || d[3] || 'แบบรับแจ้งเหตุไฟป่า').replace(/\s+/g, ' ').trim();
  var form = FormApp.create(title);
  form.setDescription('สำเนาสำหรับทดสอบการส่งจากเว็บแผนที่ไฟป่า — ไม่ใช่แบบรับแจ้งเหตุจริงของกรมอุทยานฯ' + (info[0] ? '\n\n' + info[0] : ''));
  /* อีเมล: info[10][6] = 2 ยืนยันตัวตน (ต้องล็อกอิน Google — ฟอร์มจริงของกรมฯ) · 3 พิมพ์เอง · ตรวจ 19 พ.ย. 69 จากสำเนารุ่นแรกที่ตั้ง RESPONDER_INPUT แล้วได้ 3 */
  var em = info[10] && info[10][6], ET = FormApp.EmailCollectionType;
  try { if (em === 2) form.setEmailCollectionType(ET.VERIFIED); else if (em === 3) form.setEmailCollectionType(ET.RESPONDER_INPUT); } catch (e) { if (em) form.setCollectEmail(true); }
  if (info[2] && info[2][0]) form.setConfirmationMessage(String(info[2][0]));
  form.setAcceptingResponses(true);
  try { if (form.setPublished) form.setPublished(true); } catch (e) { /* บัญชีที่ยังไม่มีสถานะเผยแพร่ */ }

  var pages = {}, made = [], skip = [], n = 0;
  /* รอบ 1: สร้างทุกข้อตามลำดับ (ต้องมีส่วนครบก่อนตั้งการข้ามส่วนของตัวเลือก) */
  for (var i = 0; i < items.length; i++) {
    var q = items[i], id = q[0], t = q[1] || '', help = q[2] || '', type = q[3], a = (q[4] && q[4][0]) || [], req = a[2] === 1, it = null;
    if (type === 0) { it = form.addTextItem(); dnpValid(it, a[4]); }
    else if (type === 1) { it = form.addParagraphTextItem(); }
    else if (type === 2) { it = form.addMultipleChoiceItem(); }
    else if (type === 3) { it = form.addListItem(); }
    else if (type === 4) { it = form.addCheckboxItem(); }
    else if (type === 9) { it = (a[7] && a[7][0]) ? form.addDateTimeItem() : form.addDateItem(); if (a[7] && a[7][1] === 0 && it.setIncludesYear) it.setIncludesYear(false); }
    else if (type === 10) { it = form.addTimeItem(); }
    else if (type === 8) { it = form.addPageBreakItem(); pages[id] = it; }
    else if (type === 6) { it = form.addSectionHeaderItem(); }
    else { skip.push(t + ' (ชนิด ' + type + ')'); continue; }
    it.setTitle(t); if (help) it.setHelpText(help);
    if (type !== 8 && type !== 6) { it.setRequired(req); n++; }
    made.push({ q: q, it: it, type: type, a: a });
  }
  /* รอบ 2: ตัวเลือก (+ ไปส่วนที่ระบุ) และการไปต่อท้ายส่วน
     ส่วน (type 8) ช่อง [5] = หลังจบ "ส่วนก่อนหน้า" ไปที่ใด — ความหมายเดียวกับ PageBreakItem.setGoToPage
     ตรวจกับตารางคำตอบจริง 19 พ.ย. 69: เลือก "ป่าอนุรักษ์" แล้วช่องป่าสงวนว่างทุกแถว = ข้ามส่วนป่าสงวน */
  for (var j = 0; j < made.length; j++) {
    var o = made[j];
    if (o.type === 8) {
      var g = o.q[5];
      if (g === -3) o.it.setGoToPage(FormApp.PageNavigationType.SUBMIT);
      else if (g === -1) o.it.setGoToPage(FormApp.PageNavigationType.RESTART);
      else if (g && pages[g]) o.it.setGoToPage(pages[g]);
      continue;
    }
    if (o.type !== 2 && o.type !== 3 && o.type !== 4) continue;
    var ch = [], other = false, opts = o.a[1] || [];
    for (var k = 0; k < opts.length; k++) {
      var op = opts[k], v = op[0];
      if (op[4] === 1 && !v) { other = true; continue; }
      var to = op[2];
      if (o.type !== 4 && to === -3) ch.push(o.it.createChoice(v, FormApp.PageNavigationType.SUBMIT));
      else if (o.type !== 4 && to && pages[to]) ch.push(o.it.createChoice(v, pages[to]));
      else ch.push(o.it.createChoice(v));
    }
    o.it.setChoices(ch);
    if (other && o.it.showOtherOption) o.it.showOtherOption(true);
  }

  var ss = SpreadsheetApp.create(title + ' (คำตอบ)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  return { view: form.getPublishedUrl(), edit: form.getEditUrl(), sheet: ss.getUrl(), n: n, skip: skip };
}

/* ตัวตรวจข้อความ: [4,301,[regex],msg] = ตรงรูปแบบ · [1,9] = ตัวเลข · [1,10] = จำนวนเต็ม */
function dnpValid(it, vs) {
  if (!vs || !vs[0]) return;
  var v = vs[0], b = FormApp.createTextValidation();
  if (v[0] === 4 && v[1] === 301 && v[2]) b = b.requireTextMatchesPattern(v[2][0]);
  else if (v[0] === 1 && v[1] === 10) b = b.requireWholeNumber();
  else if (v[0] === 1 && v[1] === 9) b = b.requireNumber();
  else return;
  if (v[3]) b = b.setHelpText(String(v[3]));
  it.setValidation(b.build());
}
