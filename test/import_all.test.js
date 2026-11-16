// C3 scripts/import_all.js --dry: แยกชนิดไฟล์จากหัวคอลัมน์/เนื้อ zip ถูก · hdata ต้องใส่ --hdata · ไฟล์ชนิดเดียวกันซ้ำ = หยุด (ไม่รันตัวนำเข้าจริง)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { ROOT, zip, xlsx } = require('./helpers.cjs');

const run = (...a) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'import_all.js'), ...a], { encoding: 'utf8' }); return [r.status, r.stdout + r.stderr] };

test('import_all --dry: จัดชนิด fx / hdata / shapefile / tour / kbp / kmz / ไม่รู้จัก', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  try {
    fs.writeFileSync(path.join(d, 'ดับไฟ70.xlsx'), xlsx([['ลำดับที่', 'ปีงบประมาณ', 'วัน', 'เข้าดับไฟ', 'เสร็จสิ้น']]));
    fs.writeFileSync(path.join(d, 'hot.xlsx'), xlsx([['ปีงบประมาณ', 'ว/ด/ป', 'เวลา', 'LAT', 'LONG', 'POINT_X']]));
    fs.writeFileSync(path.join(d, 'แหล่ง.xlsx'), xlsx([['สังกัด', 'ชื่ออุทยานแห่งชาติ', 'ประเภทแหล่งท่องเที่ยว', 'ชื่อ', 'Latitude', 'Longtitude']]));
    fs.writeFileSync(path.join(d, 'เสือโคร่งในพื้นที่อนุรักษ์.xlsx'), xlsx([['พื้นที่', 'จำนวน']]));
    fs.writeFileSync(path.join(d, 'อื่น.xlsx'), xlsx([['ก', 'ข']]));
    const dbf = fl => Buffer.concat([Buffer.alloc(32), ...fl.map(n => { const b = Buffer.alloc(32); b.write(n, 'latin1'); return b }), Buffer.from([0x0d])]).toString('latin1');
    fs.writeFileSync(path.join(d, 'ranger.zip'), zip([['a/x.shp', 'x'], ['a/x.dbf', dbf(['nationalpa', 'station_na', 'remark'])]]));
    fs.writeFileSync(path.join(d, 'fire.zip'), zip([['a/y.shp', 'x'], ['a/y.dbf', dbf(['DATE', 'TAMBON'])]]));
    fs.writeFileSync(path.join(d, 'พื้นที่.kmz'), 'x'); fs.writeFileSync(path.join(d, 'note.txt'), 'x'); fs.writeFileSync(path.join(d, '~$ดับไฟ70.xlsx'), 'lock');
    let [st, o] = run(d, '--dry');
    assert.equal(st, 0, o);
    assert.match(o, /▶ ดับไฟ70\.xlsx — Excel สถิติดับไฟรวม อส\./);
    assert.match(o, /⏸ hot\.xlsx — Excel จุดความร้อนกรมอุทยานฯ .*ต้องได้รับอนุญาตจากผู้ใช้/);
    assert.match(o, /· แหล่ง\.xlsx — .*ยังไม่มีสคริปต์ import_tour\.js/);
    assert.match(o, /· เสือโคร่งในพื้นที่อนุรักษ์\.xlsx — .*ยังไม่มีสคริปต์ import_kbp\.js/);
    assert.match(o, /อื่น\.xlsx — ไม่รู้จักรูปแบบคอลัมน์/);
    assert.match(o, /▶ ranger\.zip — shapefile หน่วยพิทักษ์/);
    assert.match(o, /· fire\.zip — shapefile ที่ไม่รู้จัก \(ฟิลด์: DATE, TAMBON\)/);
    assert.match(o, /พื้นที่\.kmz — .*import_watch\.js/);
    assert.ok(!/note\.txt|~\$/.test(o), 'ไม่สนไฟล์อื่น/ไฟล์ล็อกของ Excel');
    assert.match(o, /--dry: จะรัน 2 ตัวนำเข้า \+ node --test/);
    [st, o] = run(d, '--dry', '--hdata', '--no-check');
    assert.match(o, /▶ hot\.xlsx/); assert.match(o, /จะรัน 3 ตัวนำเข้า$/m);
    fs.writeFileSync(path.join(d, 'ดับไฟ71.xlsx'), xlsx([['ลำดับที่', 'เข้าดับไฟ', 'เสร็จสิ้น']]));
    [st, o] = run(d, '--dry');
    assert.equal(st, 1); assert.match(o, /มีไฟล์ชนิดเดียวกันมากกว่า 1 ไฟล์ \(fx\)/);
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
});
