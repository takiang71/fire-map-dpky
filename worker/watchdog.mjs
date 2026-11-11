// Cloudflare Worker (ฟรี) ตัวสั่งงานสำรอง — คอยดูว่า workflow ของ GitHub Actions ยังถูกสั่งรันตามเวลา (ผู้ใช้ขอ 11 พ.ย. 69, คู่มือ docs/line-bot.md ข้อ 11)
// ปกติ cron-job.org เป็นผู้สั่ง: site ทุก 5 นาที · sync 06:17/09:17/15:17/18:17 น. — ถ้าบริการนั้นหยุด แจ้งเตือนจุดไฟจะช้าเหลือรอบของ GitHub เอง (ห่าง 2–5 ชม.)
// Worker นี้ตื่นทุก 5 นาที (Cron Trigger) แล้วดูรอบล่าสุดผ่าน GitHub API:
//   site: รอบล่าสุด (ทุกประเภท) สร้างเกิน SITE_GAP นาที (ค่าเริ่มต้น 15) → สั่งรัน site
//   sync: ผ่านเวลารอบตามตาราง (SYNC_SLOTS เวลาไทย) มาแล้ว 25 นาที–3 ชม. แต่ยังไม่มีรอบ sync ตั้งแต่เวลานั้น → สั่งรัน sync
//   สั่งรันพร้อม inputs.by = "watchdog" → health.js รู้ว่า cron-job.org ไม่ได้สั่ง และแจ้งผู้ดูแลถ้าเป็นต่อเนื่องเกิน 1 ชม.
//   ไม่สั่งซ้อนกับ cron-job.org: ถ้าทุกอย่างปกติ Worker นี้ไม่สั่งอะไรเลย
// ตั้งค่าใน Cloudflare: Secret GH_TOKEN = token เดียวกับที่ใช้ใน cron-job.org (fine-grained PAT สิทธิ์ Actions: Read and write เฉพาะ repo นี้ — ใส่แค่ตัว token ไม่ต้องมีคำว่า Bearer)
//   Triggers → Cron Triggers: */5 * * * *
//   Variables (ไม่บังคับ): REPO (ค่าเริ่มต้น takiang71/fire-map-dpky) · SITE_GAP (นาที) · SYNC_SLOTS ("06:17,09:17,15:17,18:17") · OFF = "1" ปิดชั่วคราว
//   GH_API = ปลายทาง API (ใช้ทดสอบกับเซิร์ฟเวอร์จำลอง)
// เปิด URL ของ Worker ในเบราว์เซอร์ = ดูสถานะ (รอบล่าสุด + Worker จะสั่งอะไรถ้าตื่นตอนนี้) โดยไม่สั่งรันจริง
const MIN = 60e3;

function cfg(env) {
  return {
    api: (env.GH_API || 'https://api.github.com').replace(/\/$/, ''),
    repo: env.REPO || 'takiang71/fire-map-dpky',
    token: String(env.GH_TOKEN || '').replace(/^\s*Bearer\s+/i, '').trim(),
    gap: Math.max(8, +env.SITE_GAP || 15),
    slots: String(env.SYNC_SLOTS || '06:17,09:17,15:17,18:17').split(',').map(s => s.trim().match(/^(\d{1,2}):(\d{2})$/)).filter(Boolean).map(m => +m[1] * 60 + +m[2]),
    off: /^(1|true|on|yes)$/i.test(String(env.OFF || '')),
  };
}

async function gh(c, p, body) {
  const r = await fetch(`${c.api}/repos/${c.repo}${p}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'fire-map-watchdog', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} HTTP ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : {};
}
const lastRun = async (c, wf) => ((await gh(c, `/actions/workflows/${wf}/runs?per_page=1`)).workflow_runs || [])[0] || null;
const dispatch = (c, wf) => gh(c, `/actions/workflows/${wf}/dispatches`, { ref: 'main', inputs: { by: 'watchdog' } });

// เวลารอบ sync ล่าสุดที่ควรเริ่มไปแล้ว (มิลลิวินาที) ถ้าตอนนี้อยู่ในช่วง 25 นาที–3 ชม. หลังรอบนั้น ไม่งั้น null
function syncSlot(c, now) {
  const th = now + 7 * 60 * MIN, day = th - (th % (1440 * MIN)), mins = Math.floor((th - day) / MIN);
  let best = null;
  for (const s of c.slots) for (const d of [0, -1]) {
    const ago = mins - (s + d * 1440);
    if (ago >= 25 && ago < 180 && (best == null || ago < best)) best = ago;
  }
  return best == null ? null : now - best * MIN;
}

const thT = ms => new Date(ms + 7 * 60 * MIN).toISOString().replace('T', ' ').slice(0, 16) + ' น.';
const runInfo = (r, now) => r && { id: r.id, event: r.event, status: r.status, conclusion: r.conclusion, created: thT(Date.parse(r.created_at)), ago_min: Math.round((now - Date.parse(r.created_at)) / MIN) };

// ตัดสินใจ (และสั่งถ้า run = true) → ผลสำหรับ log/หน้าสถานะ
export async function check(env, now = Date.now(), run = true) {
  const c = cfg(env), out = { at: thT(now), repo: c.repo, off: c.off, actions: [] };
  if (!c.token) { out.error = 'ยังไม่ได้ตั้ง Secret GH_TOKEN'; return out }
  const [site, sync] = await Promise.all([lastRun(c, 'site.yml'), lastRun(c, 'sync.yml')]);
  out.site = runInfo(site, now); out.sync = runInfo(sync, now);
  const sAge = site ? now - Date.parse(site.created_at) : Infinity;
  if (sAge > c.gap * MIN) out.actions.push(['site.yml', `รอบล่าสุด ${site ? Math.round(sAge / MIN) + ' นาทีก่อน' : 'ไม่มี'} (เกิน ${c.gap} นาที)`]);
  const slot = syncSlot(c, now);
  if (slot != null && (!sync || Date.parse(sync.created_at) < slot - 10 * MIN)) out.actions.push(['sync.yml', `ยังไม่มีรอบตั้งแต่ ${thT(slot)}`]);
  out.sync_slot = slot == null ? null : thT(slot);
  if (!run || c.off) { out.would = out.actions.map(a => a.join(': ')); out.actions = []; return out }
  for (const a of out.actions) {
    try { await dispatch(c, a[0]); a.push('สั่งรันแล้ว') } catch (e) { a.push('สั่งไม่สำเร็จ: ' + e.message) }
  }
  return out;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(check(env, event.scheduledTime || Date.now()).then(r => console.log(JSON.stringify(r)), e => console.log('watchdog error:', e.message)));
  },
  async fetch(req, env) {
    let r; try { r = await check(env, Date.now(), false) } catch (e) { r = { error: e.message } }
    r.note = 'หน้านี้ดูสถานะอย่างเดียว ไม่สั่งรัน · would = สิ่งที่ Worker จะสั่งถ้าตื่นตอนนี้ (ว่าง = ปกติ) · Worker ตื่นเองทุก 5 นาทีตาม Cron Trigger';
    return new Response(JSON.stringify(r, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  },
};
