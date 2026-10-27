// ดึง JSON สถานีวัดฝุ่น Air4Thai (กรมควบคุมมลพิษ) — ใช้ร่วมกันโดย serve.js และ build_site.js
// เซิร์ฟเวอร์ Air4Thai ส่ง intermediate certificate ผิดตัว (Node/Python ปฏิเสธ แต่เบราว์เซอร์/Windows ผ่าน)
// จึงดาวน์โหลด intermediate ตาม AIA ("CA Issuers") ในใบรับรองเอง แล้วตรวจ TLS ตามปกติ — ไม่ได้ปิดการตรวจใบรับรอง
const http = require('http'), https = require('https'), tls = require('tls'), { X509Certificate } = require('crypto');

const SRC = new URL('https://air4thai.pcd.go.th/services/getNewAQI_JSON.php');
const TTL = 600e3; // แคช 10 นาที
let ca = null, cache = { t: 0, body: null };

const get = (url, opt = {}) => new Promise((ok, no) => {
  const lib = url.protocol === 'http:' ? http : https;
  lib.get(url, { ...opt, headers: { 'User-Agent': 'fire-map-project' }, timeout: 30e3 }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => r.statusCode === 200 ? ok(Buffer.concat(b)) : no(new Error('HTTP ' + r.statusCode)));
  }).on('error', no).on('timeout', function () { this.destroy(new Error('timeout')) });
});

// อ่านใบรับรองของเซิร์ฟเวอร์ (ไม่ส่งข้อมูลใดๆ) เพื่อหา URL ของ intermediate แล้วเพิ่มเข้า CA ที่เชื่อถือ
async function fixChain() {
  const cert = await new Promise((ok, no) => {
    const s = tls.connect({ host: SRC.hostname, port: 443, servername: SRC.hostname, rejectUnauthorized: false }, () => { const c = s.getPeerCertificate(); s.end(); ok(c) });
    s.on('error', no);
  });
  // ไล่ขึ้นไปทีละชั้น (intermediate ใหม่ของ Let's Encrypt อาจออกโดย root ที่ Node ยังไม่รู้จัก แต่มี cross-sign จาก root เดิม)
  const issuers = info => ((info || '').match(/CA Issuers - URI:(\S+)/g) || []).map(s => s.slice(17)).filter(u => u.startsWith('http'));
  const pems = [];
  let urls = issuers(Object.entries(cert.infoAccess || {}).map(([k, v]) => v.map(u => k + ':' + u).join('\n')).join('\n'));
  for (let depth = 0; urls.length && depth < 4; depth++) {
    const next = [];
    for (const u of urls) try {
      const x = new X509Certificate(await get(new URL(u)));
      pems.push(x.toString());
      if (x.issuer !== x.subject) next.push(...issuers(x.infoAccess));
    } catch (e) {}
    urls = next;
  }
  if (!pems.length) throw new Error('ไม่พบ intermediate certificate');
  ca = [...tls.rootCertificates, ...pems];
}

async function air4thai() {
  if (cache.body && Date.now() - cache.t < TTL) return cache.body;
  let body;
  try { body = await get(SRC, ca ? { ca } : {}) }
  catch (e) {
    if (!/certificate|UNABLE_TO_VERIFY/i.test(e.message + e.code)) throw e;
    await fixChain(); body = await get(SRC, { ca });
  }
  cache = { t: Date.now(), body };
  return body;
}

module.exports = { air4thai };
