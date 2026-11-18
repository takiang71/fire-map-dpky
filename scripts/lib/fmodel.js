// ดึงโค้ดโมเดลไฟ (เฟส 2) จาก index.html มารันใน Node — ไม่เขียนสูตรซ้ำ (แบบเดียวกับ grab/load ของ test/helpers.cjs)
// ใช้กับ scripts/fire_model_eval.js (F5 ตรวจย้อนหลัง) และ test/fmodel.test.js
// ชิ้นที่ดึง: calc/spreadVec/FUEL/R0 (วงรี Rothermel+Anderson), fuelAt/ftAt (เชื้อเพลิงอัตโนมัติ), geoAt (แนวเขต),
//   windAt/fqHr/huy/hyAdj (โหมด Lagrangian ขอบไฟ Huygens + EMC รายชั่วโมงเมื่อ P.hrly), slopeAt (ความลาดจาก DEM — ต้องส่ง demTile ฝั่ง Node ให้)
// ชื่อ/รูปโค้ดในหน้าเว็บเปลี่ยน = โยน error บอกว่าหาชิ้นไหนไม่เจอ
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const PIECES = {
  nf: /const nf=\(x,d=0\)=>[^\n]*/,
  model: /const WAF=[\s\S]*?\nfunction calc\(p\)\{[\s\S]*?upDir:V\.up\}\}/,
  fuel: /const fuelByElev=[^\n]*\n[\s\S]*?const FTI=[^\n]*\nfunction fuelAt\(g,z,f\)\{[\s\S]*?\n return\{i,why:[^\n]*\}\}/,
  ft: /function ftUTM\(lon,lat,zone\)\{[\s\S]*?\nconst ftAt=[^\n]*/,
  ftDec: /const g=new Uint8Array\(j\.w\*j\.h\);j\.r\.forEach\(.*?\}\}\);/,
  geo: /const inside=\(q,r\)=>[^\n]*\nconst inFeat=[^\n]*\nconst geoAt=[^\n]*/,
  hr: /const fqHr=[^\n]*/,
  wind: /function windAt\(t\)\{[\s\S]*?return\[-P\.u\*Math\.sin\(a\)\/3\.6,-P\.u\*Math\.cos\(a\)\/3\.6\]\}/,
  huy: /function hull\(pts\)\{[\s\S]*?\nconst hyAdj=[^\n]*/,
  slope: /async function slopeAt\([\s\S]*?\n return\{s:[^\n]*\}\}/,
};

function source(html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) {
  const g = k => { const m = html.match(PIECES[k]); if (!m) throw new Error('ไม่พบโค้ดโมเดลไฟใน index.html: ' + k + ' ' + PIECES[k]); return m[0] };
  return `let FT=null,WS=null,manualWind=false,P={};
${g('nf')}
${g('model')}
${g('fuel')}
${g('ft')}
${g('geo')}
${g('wind')}
${g('hr')}
${g('huy')}
${g('slope')}
function setFT(j){${g('ftDec')}j.g=g;FT=j;return j}
function setP(p,ws){P=p;WS=ws||null;manualWind=false}
return {calc,spreadVec,FUEL,R0,EH,MX,WAF,emc,eta,ffM,fuelAt,fuelByElev,ftAt,geoAt,windAt,fqHr,huy,hyAdj,slopeAt,setFT,setP};`;
}

// env: GEO (แนวเขตจากบล็อก geo) · demTile(z,x,y) → Promise<Float32Array 65536 ความสูง ม.> (เฉพาะเมื่อใช้ slopeAt)
function loadModel(env = {}, html) {
  return new Function('GEO', 'demTile', source(html))(env.GEO || { cons: { features: [] }, resp: { features: [] } }, env.demTile || (() => Promise.reject(new Error('ไม่มี demTile'))));
}

module.exports = { loadModel, source, PIECES };
