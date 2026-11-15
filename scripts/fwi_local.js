// ดึงดัชนีอันตรายไฟป่า FWI/FFMC (TFDRS กรมป่าไม้) จากเครื่องผู้ดูแลแล้ว push ขึ้น GitHub — ผู้ใช้สั่ง 15 พ.ย. 69 "ทำเลย"
// เหตุผล: fdrs.forest.go.th (Cloudflare) ตอบ 403 challenge กับเครื่องของ GitHub Actions จึงดึงบน Actions ไม่ได้ (ไม่เลี่ยงการกันบอต)
//   เครื่องผู้ดูแลเข้าเว็บได้ปกติ → Task Scheduler "fire-map FWI" (scripts/install_fwi_task.ps1) เรียกสคริปต์นี้หลายรอบต่อวันหลังต้นทางออก (~14:20 น.)
// ทำงานใน "โคลนแยก" .fwi-local\repo ในโฟลเดอร์โปรเจกต์ (ignore ไว้) — ไม่แตะไฟล์งานของผู้ใช้ (ไม่ชนกับไฟล์ที่กำลังแก้/ยังไม่ commit)
//   1) fetch + reset --hard origin/main · ตาราง g/ จาก branch fwi-grid
//   2) node scripts/sync_fwi.js (ไม่มีรอบใหม่ = จบ ไม่ push)
//   3) ตาราง g/ เปลี่ยน → force push branch fwi-grid (commit เดียว) ก่อน · แล้ว commit data/fwi/index.json เข้า main (pull --rebase ลองใหม่ 5 ครั้ง)
//      push เข้า main = workflow site เผยแพร่เอง (trigger push)
// บันทึก .fwi-local\fwi_local.log (ตัดเหลือ ~200 บรรทัด) · ใช้ credential ของ Git Credential Manager ที่ล็อกอินไว้แล้ว
// ใช้: node scripts/fwi_local.js [--force]   (env FWI_DIR เปลี่ยนโฟลเดอร์, FWI_NO_PUSH=1 ทดสอบไม่ push)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const DIR = process.env.FWI_DIR || path.join(__dirname, '..', '.fwi-local'); // อยู่ใน .gitignore
const REPO = 'https://github.com/takiang71/fire-map-dpky.git', R = path.join(DIR, 'repo'), LOG = path.join(DIR, 'fwi_local.log');
const FORCE = process.argv.includes('--force'), NOPUSH = process.env.FWI_NO_PUSH === '1';
const HERE = path.join(__dirname, '..'); // โฟลเดอร์งานของผู้ใช้ — อ่านแค่ชื่อ/อีเมล git
fs.mkdirSync(DIR, { recursive: true });
const stamp = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const log = (...a) => { const s = `[${stamp()}] ${a.join(' ')}`; console.log(s); fs.appendFileSync(LOG, s + '\n') };
// Task Scheduler อาจไม่มี git ใน PATH → ใช้ที่ติดตั้งมาตรฐานถ้ามี
const GIT = ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe'].find(p => fs.existsSync(p)) || 'git';
function git(args, o = {}) {
  const r = cp.spawnSync(GIT, args, { cwd: o.cwd || R, encoding: o.buf ? 'buffer' : 'utf8', maxBuffer: 64 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.status !== 0 && !o.ok) throw new Error('git ' + args.join(' ') + ' ล้ม: ' + (r.error ? r.error.message + ' ' : '') + String(r.stderr || '').trim().slice(0, 300));
  return o.buf ? r.stdout : String(r.stdout || '').trim();
}
function cfg(k) { try { return git(['config', k], { cwd: HERE }) } catch (e) { return '' } }
(async () => {
  log('เริ่ม' + (FORCE ? ' (--force)' : ''));
  // 1) โคลนแยก
  if (!fs.existsSync(path.join(R, '.git'))) { log('โคลน', REPO); git(['clone', '-q', '--depth', '20', '--branch', 'main', REPO, R], { cwd: DIR }) }
  const name = cfg('user.name') || 'takiang71', mail = cfg('user.email');
  git(['config', 'user.name', name]); if (mail) git(['config', 'user.email', mail]);
  git(['config', 'core.autocrlf', 'false']);
  git(['fetch', '-q', 'origin', 'main']); git(['reset', '-q', '--hard', 'origin/main']);
  const G = path.join(R, 'data', 'fwi', 'g'); fs.rmSync(G, { recursive: true, force: true }); fs.mkdirSync(G, { recursive: true });
  let oldTree = '';
  if (git(['fetch', '-q', '--depth', '1', 'origin', 'fwi-grid'], { ok: true }) !== null) {
    try { oldTree = git(['rev-parse', 'FETCH_HEAD^{tree}']);
      for (const f of git(['ls-tree', '--name-only', 'FETCH_HEAD']).split('\n').filter(Boolean)) fs.writeFileSync(path.join(G, f), git(['show', 'FETCH_HEAD:' + f], { buf: 1 }));
    } catch (e) { log('ยังไม่มี branch fwi-grid หรืออ่านไม่ได้:', e.message) }
  }
  const before = fs.readFileSync(path.join(R, 'data', 'fwi', 'index.json'), 'utf8');
  // 2) ดึงจาก TFDRS
  const s = cp.spawnSync(process.execPath, [path.join(R, 'scripts', 'sync_fwi.js'), ...(FORCE ? ['--force'] : [])], { cwd: R, encoding: 'utf8' });
  const out = (String(s.stdout || '') + String(s.stderr || '')).trim().split('\n').filter(Boolean);
  out.slice(-8).forEach(l => log('  ' + l));
  if (s.status !== 0) { log('sync_fwi ล้ม (exit ' + s.status + ')'); process.exitCode = 1; return }
  const after = fs.readFileSync(path.join(R, 'data', 'fwi', 'index.json'), 'utf8');
  if (after === before) { log('ไม่มีรอบใหม่ — ไม่ push'); return }
  const run = JSON.parse(after).run;
  if (NOPUSH) { log('FWI_NO_PUSH=1 — ได้รอบ', run, 'แต่ไม่ push'); return }
  // 3a) ตาราง g/ → branch fwi-grid (commit เดียว force push) ก่อน main ให้ site เห็นตารางครบเมื่อเห็นรอบใหม่
  const FG = path.join(DIR, 'fg'); fs.rmSync(FG, { recursive: true, force: true }); fs.mkdirSync(FG);
  for (const f of fs.readdirSync(G)) fs.copyFileSync(path.join(G, f), path.join(FG, f));
  git(['init', '-q', '-b', 'fwi-grid'], { cwd: FG }); git(['config', 'core.autocrlf', 'false'], { cwd: FG }); git(['add', '-A'], { cwd: FG });
  const newTree = git(['write-tree'], { cwd: FG });
  if (newTree !== oldTree) {
    git(['-c', 'user.name=' + name, ...(mail ? ['-c', 'user.email=' + mail] : []), 'commit', '-qm', 'fwi grids ' + new Date().toISOString() + ' (เครื่องผู้ดูแล)'], { cwd: FG });
    git(['push', '-qf', REPO, 'fwi-grid'], { cwd: FG }); log('push ตาราง g/ → branch fwi-grid แล้ว');
  } else log('ตาราง g/ ไม่เปลี่ยน');
  // 3b) index.json → main
  git(['add', 'data/fwi/index.json']);
  git(['commit', '-qm', `fwi: TFDRS รอบ ${run} (ดึงจากเครื่องผู้ดูแล — ต้นทางไม่อนุญาตเครื่อง GitHub)`]);
  let ok = false;
  for (let i = 1; i <= 5 && !ok; i++) {
    try { git(['pull', '-q', '--rebase', 'origin', 'main']); git(['push', '-q', 'origin', 'HEAD:main']); ok = true }
    catch (e) { log('push main ไม่สำเร็จ ลองใหม่', i, e.message.slice(0, 120)); await new Promise(r => setTimeout(r, i * 5e3)) }
  }
  if (!ok) { log('push main ไม่สำเร็จ'); process.exitCode = 1; return }
  log('push รอบ', run, 'เข้า main แล้ว (site เผยแพร่เองจาก push)');
})().catch(e => { log('ผิดพลาด:', e.message); process.exitCode = 1 })
  .finally(() => { try { const L = fs.readFileSync(LOG, 'utf8').split('\n'); if (L.length > 400) fs.writeFileSync(LOG, L.slice(-200).join('\n')) } catch (e) { } });
