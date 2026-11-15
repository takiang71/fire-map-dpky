// สถานะตัวแจ้งเตือน (scripts/lib/state.js): เลือกชุดที่ updated ใหม่สุดจาก branch state (.state/) / raw / หน้าเว็บ
// ไม่ต่อเน็ตจริง: STATE_DIR = โฟลเดอร์ชั่วคราว, STATE_RAW ว่าง, หน้าเว็บ = fetch จำลอง
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-state-'));
process.env.STATE_DIR = DIR; process.env.STATE_RAW = '';
const { loadState } = require('../scripts/lib/state');

const SITE = 'https://example.test/site/';
let web = {};
const realFetch = global.fetch;
test.before(() => {
  global.fetch = async url => {
    const k = String(url).split('?')[0].replace(SITE, '');
    return k in web ? { ok: true, json: async () => web[k] } : { ok: false, json: async () => null };
  };
});
test.after(() => { global.fetch = realFetch; fs.rmSync(DIR, { recursive: true, force: true }) });
const quiet = async f => { const l = console.log; console.log = () => {}; try { return await f() } finally { console.log = l } };

test('มีทั้ง .state/ และหน้าเว็บ → ใช้ชุดที่ updated ใหม่กว่า', async () => {
  fs.writeFileSync(path.join(DIR, 'notify.json'), JSON.stringify({ updated: '2026-11-15T07:00:00Z', from: 'state' }));
  web = { 'notify.json': { updated: '2026-11-15T06:00:00Z', from: 'web' } };
  assert.equal((await quiet(() => loadState('notify.json', SITE))).from, 'state');
  web['notify.json'] = { updated: '2026-11-15T08:00:00Z', from: 'web' };
  assert.equal((await quiet(() => loadState('notify.json', SITE))).from, 'web');
});

test('ไม่มีไฟล์ใน .state/ → ใช้หน้าเว็บ · ไม่มีที่ไหนเลย → null', async () => {
  web = { 'tg_notify.json': { updated: '2026-11-15T05:00:00Z', from: 'web' } };
  assert.equal((await quiet(() => loadState('tg_notify.json', SITE))).from, 'web');
  assert.equal(await quiet(() => loadState('health.json', SITE)), null);
  assert.equal(await quiet(() => loadState('health.json', null)), null);
});

test('ไฟล์ใน .state/ เสีย (JSON ผิด) ไม่ทำให้ล่ม → ใช้แหล่งอื่น', async () => {
  fs.writeFileSync(path.join(DIR, 'health.json'), '{เสีย');
  web = { 'health.json': { updated: '2026-11-15T05:00:00Z', ok: true } };
  assert.equal((await quiet(() => loadState('health.json', SITE))).ok, true);
});

test('หน้าเว็บตอบช้า/ล่ม (fetch โยน error) → ยังใช้ .state/ ได้', async () => {
  fs.writeFileSync(path.join(DIR, 'pass.json'), JSON.stringify({ updated: '2026-11-15T07:00:00Z', v: 1 }));
  global.fetch = async () => { throw new Error('timeout') };
  assert.equal((await quiet(() => loadState('pass.json', SITE))).v, 1);
});
