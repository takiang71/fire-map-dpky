// ความล่าช้า NASA FIRMS ต่อรอบดาวเทียม (scripts/firms_lag.js, 21 พ.ย. 69) — FIRMS จำลอง ไม่ใช้โควตาจริง
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const { ROOT } = require('./helpers.cjs');
const FL = require(path.join(ROOT, 'scripts', 'firms_lag.js'));

const H = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
const T = Date.parse('2026-11-21T06:11:00Z'); /* NOAA-20 ผ่านกลุ่มป่า 13:11 น. */

test('pending/expired: ตามเฉพาะรอบที่ API ไทยเห็นแล้ว อายุ 45 นาที–12 ชม. ยังไม่มีผล', () => {
  const PL = [{ k: 'NOAA20', t: T, lag: 31 }, { k: 'NOAA21', t: T + 43 * 6e4, lag: 39 }, { k: 'NOAA20', t: T - 13 * 36e5, lag: 40 }, { k: 'X', t: T, lag: 1 }];
  const now = T + 60 * 6e4;
  assert.deepEqual(FL.pending(PL, [], now).map(p => p.k), ['NOAA20']);           /* NOAA21 อายุ 17 นาที ยังไม่ถึง */
  assert.equal(FL.pending(PL, [{ k: 'NOAA20', t: T + 2e4 }], now).length, 0);    /* มีผลแล้ว */
  assert.deepEqual(FL.expired(PL, [], now).map(p => p.t), [T - 13 * 36e5]);
  /* since = เริ่มตาม: รอบก่อนนั้นไม่ตาม ไม่นับว่าไม่ขึ้น */
  assert.equal(FL.pending(PL, [], now, T + 1).length, 0);
  assert.equal(FL.expired(PL, [], now, T - 6e4).length, 0);
});

test('count: นับจุดดาวเทียมเดียวกันเวลาสแกน ±8 นาที', () => {
  const csv = [H, '14,101,0,0,0,2026-11-21,0609,N20,VIIRS,n,2.0NRT,0,1,D', '14,101,0,0,0,2026-11-21,0612,N20,VIIRS,n,2.0NRT,0,1,D', '14,101,0,0,0,2026-11-21,0654,N20,VIIRS,n,2.0NRT,0,1,D'].join('\n');
  assert.equal(FL.count(csv, { t: T }), 2);
  assert.equal(FL.count(H, { t: T }), 0);
});

test('firms_lag.js กับ FIRMS จำลอง → .state/firms_lag.json + --report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-'));
  fs.writeFileSync(path.join(dir, 'pass_lag.json'), JSON.stringify({ log: [{ k: 'NOAA21', t: T + 43 * 6e4, lag: 39 }, { k: 'NOAA20', t: T, lag: 31 }] }));
  fs.writeFileSync(path.join(dir, 'firms_lag.json'), JSON.stringify({ log: [], since: T - 6e4 }));
  const req = [];
  const srv = http.createServer((q, s) => {
    req.push(q.url);
    s.end(q.url.includes('NOAA20') ? [H, '14,101,0,0,0,2026-11-21,0612,N20,VIIRS,n,2.0NRT,0,1,D'].join('\n') : H);
  });
  await new Promise(r => srv.listen(0, r));
  const env = { ...process.env, FIRMS_BASE: `http://127.0.0.1:${srv.address().port}`, FIRMS_KEY: 'k', STATE_DIR: dir, LAG_NOW: String(T + 150 * 6e4) };
  const out = await new Promise((res, rej) => cp.execFile(process.execPath, [path.join(ROOT, 'scripts', 'firms_lag.js')], { env, encoding: 'utf8' }, (e, o, se) => e ? rej(new Error(o + se)) : res(o)));
  srv.close();
  assert.equal(req.length, 2);
  assert.ok(req[0].includes('/api/area/csv/k/VIIRS_NOAA20_NRT/') || req[1].includes('/api/area/csv/k/VIIRS_NOAA20_NRT/'));
  const F = JSON.parse(fs.readFileSync(path.join(dir, 'firms_lag.json'), 'utf8'));
  assert.equal(F.log.length, 1);
  assert.deepEqual({ k: F.log[0].k, lag: F.log[0].lag, n: F.log[0].n, th: F.log[0].th }, { k: 'NOAA20', lag: 150, n: 1, th: 31 });
  assert.match(out, /ช้ากว่าดาวเทียมผ่าน 150 นาที/);
  assert.match(FL.report(F), /FIRMS ช้ากว่า API ไทย: n=1 ค่ากลาง 119 นาที/);
});
