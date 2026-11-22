// Worker ตัวสั่งงานสำรอง (worker/watchdog.mjs) กับ GitHub API จำลอง (แทน globalThis.fetch) — ไม่ต่อเน็ต
//  · 23 พ.ย. 69: รอบค้าง queued/in_progress → ยกเลิก (409 → force-cancel) · หน้าสถานะแค่บอก would ไม่ยกเลิกจริง
const { describe, test, before, after, beforeEach } = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), { pathToFileURL } = require('url');

describe('watchdog', () => { /* hook อยู่ใน describe — ไม่กระทบเทสต์ไฟล์อื่นที่รันในโปรเซสเดียวกัน */
  const MIN = 60e3, NOW = Date.parse('2026-11-22T20:00:00Z'); /* 03:00 น. ไทย — ไม่อยู่ในช่วงรอบ sync */
  const iso = m => new Date(NOW - m * MIN).toISOString();
  let W, calls, runs, cancel409;
  const env = { GH_TOKEN: 'x', GH_API: 'https://gh.test' };
  function mock() {
    calls = [];
    globalThis.fetch = async (url, o = {}) => {
      const u = new URL(url), m = o.method || 'GET'; calls.push(m + ' ' + u.pathname + u.search);
      const j = (s, b) => new Response(b == null ? null : JSON.stringify(b), { status: s });
      let x;
      if (m === 'GET' && (x = u.pathname.match(/workflows\/([\w.]+)\/runs$/))) {
        const st = u.searchParams.get('status');
        return j(200, { workflow_runs: runs.filter(r => r.wf === x[1] && (!st || r.status === st)).slice(0, +u.searchParams.get('per_page') || 30) });
      }
      if (m === 'POST' && /\/cancel$/.test(u.pathname)) return cancel409 ? j(409, { message: 'Cannot cancel' }) : j(202, {});
      if (m === 'POST' && /\/force-cancel$/.test(u.pathname)) return j(202, {});
      if (m === 'POST' && /dispatches$/.test(u.pathname)) return j(204);
      return j(404, { message: 'nf' });
    };
  }
  const F0 = globalThis.fetch;
  after(() => { globalThis.fetch = F0 });
  before(async () => { W = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'watchdog.mjs')).href) });
  beforeEach(() => { cancel409 = false; mock() });

  const R = (id, wf, status, ago, extra) => ({ id, wf, status, conclusion: null, event: 'workflow_dispatch', created_at: iso(ago), ...extra });

  test('ปกติ: ไม่ยกเลิก ไม่สั่ง', async () => {
    runs = [R(3, 'site.yml', 'in_progress', 1, { run_started_at: iso(1) }), R(2, 'site.yml', 'completed', 5), R(9, 'sync.yml', 'completed', 60)];
    const r = await W.check(env, NOW);
    assert.deepEqual(r.cancels, []); assert.deepEqual(r.actions, []);
    assert.ok(!calls.some(c => c.startsWith('POST')));
  });

  test('site ค้าง queued 5 ชม. → ยกเลิก (รอบ pending ใหม่ไม่แตะ)', async () => {
    runs = [R(10, 'site.yml', 'pending', 1), R(1, 'site.yml', 'queued', 300, { run_started_at: iso(300) })];
    const r = await W.check(env, NOW);
    assert.equal(r.cancels.length, 1); assert.match(r.cancels[0][0], /site\.yml .*queued 300 นาที/); assert.equal(r.cancels[0][1], 'ยกเลิกแล้ว');
    assert.ok(calls.includes('POST /repos/takiang71/fire-map-dpky/actions/runs/1/cancel'));
    assert.ok(!calls.some(c => /runs\/10\//.test(c)));
    assert.deepEqual(r.actions, []); /* รอบล่าสุดเพิ่งสร้าง 1 นาที ไม่ต้องสั่งใหม่ */
  });

  test('queued ไม่ถึงเกณฑ์ (15 นาที < 20) ไม่ยกเลิก · STUCK=10 ยกเลิก', async () => {
    runs = [R(1, 'site.yml', 'queued', 15)];
    assert.deepEqual((await W.check(env, NOW)).cancels, []);
    mock(); assert.equal((await W.check({ ...env, STUCK: '10' }, NOW)).cancels.length, 1);
  });

  test('in_progress เกินเพดาน: site 40 / sync 150 นาที', async () => {
    runs = [R(1, 'site.yml', 'in_progress', 45, { run_started_at: iso(45) }), R(2, 'sync.yml', 'in_progress', 100, { run_started_at: iso(100) }), R(3, 'wx.yml', 'in_progress', 61, { run_started_at: iso(61) })];
    const r = await W.check(env, NOW);
    assert.deepEqual(r.cancels.map(c => c[0].split(' ')[0]).sort(), ['site.yml', 'wx.yml']);
  });

  test('cancel ได้ 409 → force-cancel', async () => {
    cancel409 = true; runs = [R(1, 'site.yml', 'queued', 60)];
    const r = await W.check(env, NOW);
    assert.equal(r.cancels[0][1], 'บังคับยกเลิกแล้ว');
    assert.ok(calls.some(c => /runs\/1\/force-cancel$/.test(c)));
  });

  test('หน้าสถานะ (run=false) และ OFF=1: บอก would ไม่ยกเลิกจริง', async () => {
    runs = [R(1, 'site.yml', 'queued', 60)];
    const r = await W.check(env, NOW, false);
    assert.ok(r.would.some(w => /^ยกเลิก site\.yml/.test(w)));
    mock(); const o = await W.check({ ...env, OFF: '1' }, NOW);
    assert.ok(o.would.length >= 1);
    assert.ok(!calls.some(c => c.startsWith('POST')));
  });

  test('API รายการค้างล้ม → ยังตรวจ/สั่ง site ตามเดิม', async () => {
    runs = [R(2, 'site.yml', 'completed', 30)];
    const f = globalThis.fetch;
    globalThis.fetch = (url, o) => /status=/.test(url) ? Promise.resolve(new Response('x', { status: 500 })) : f(url, o);
    const r = await W.check(env, NOW);
    assert.match(r.stuck_error, /HTTP 500/);
    assert.equal(r.actions[0][0], 'site.yml'); assert.equal(r.actions[0][2], 'สั่งรันแล้ว');
  });
});
