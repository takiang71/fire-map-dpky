// ดึงโค้ดโมเดลไฟ (เฟส 2) จาก index.html มารันใน Node — ไม่เขียนสูตรซ้ำ (แบบเดียวกับ grab/load ของ test/helpers.cjs)
// ใช้กับ scripts/fire_model_eval.js (F5 ตรวจย้อนหลัง) และ test/fmodel.test.js
// ชิ้นที่ดึง: calc/spreadVec/FUEL/R0 (วงรี Rothermel+Anderson), fuelAt/ftAt/chWinSum (เชื้อเพลิงอัตโนมัติ + เรือนยอดรอบจุด), geoAt (แนวเขต),
//   windAt/fqHr/huy/hyAdj (โหมด Lagrangian ขอบไฟ Huygens + EMC รายชั่วโมงเมื่อ P.hrly), slopeAt (ความลาดจาก DEM — ต้องส่ง demTile ฝั่ง Node ให้)
// ชื่อ/รูปโค้ดในหน้าเว็บเปลี่ยน = โยน error บอกว่าหาชิ้นไหนไม่เจอ
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const PIECES = {
  nf: /const nf=\(x,d=0\)=>[^\n]*/,
  model: /const WAF=[\s\S]*?\nfunction calc\(p\)\{[\s\S]*?upDir:V\.up\}\}/,
  fuel: /const fuelByElev=[^\n]*\n[\s\S]*?const FTI=[^\n]*\nfunction fuelAt\(g,z,f,cw\)\{[\s\S]*?\n return\{i,why:[^\n]*\}\}/,
  ft: /function ftUTM\(lon,lat,zone\)\{[\s\S]*?\nconst ftAt=[^\n]*/,
  ftIn: /const ftIn=[^\n]*/,
  ftDec: /const g=new Uint8Array\(j\.w\*j\.h\);j\.r\.forEach\(.*?\}\}\);/,
  geo: /const inside=\(q,r\)=>[^\n]*\nconst inFeat=[^\n]*\nconst geoAt=[^\n]*/,
  hr: /const fqHr=[^\n]*/,
  wind: /function windAt\(t\)\{[\s\S]*?return\[-P\.u\*Math\.sin\(a\)\/3\.6,-P\.u\*Math\.cos\(a\)\/3\.6\]\}/,
  huy: /function hull\(pts\)\{[\s\S]*?\nconst hyAdj=[^\n]*/,
  slope: /async function slopeAt\([\s\S]*?\n return\{s:[^\n]*\}\}/,
  /* วง MTT (23 พ.ย. 69): mtSolve จาก wjLib + mtGrid/mtWx จากบล็อก lz-mt → mtRun = ลำดับเดียวกับ mtKick ของหน้าเว็บ (ขยายกริดเมื่อถึงขอบ) แต่รันตรง ไม่ผ่าน Worker */
  mtn: /const MTN=\d+/,
  mtSolve: /function mtSolve\(o\)\{[\s\S]*?\n  return\{lv:out\.map[^\n]*/,
  mtGrid: /async function mtGrid\(h,ext\)\{[\s\S]*?(?=\nfunction mtKick\()/,
};

function source(html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) {
  const g = k => { const m = html.match(PIECES[k]); if (!m) throw new Error('ไม่พบโค้ดโมเดลไฟใน index.html: ' + k + ' ' + PIECES[k]); return m[0] };
  return `let FT=null,WS=null,manualWind=false,P={},fuelAuto=true;
${g('nf')}
${g('model')}
${g('fuel')}
${g('ft')}
${g('ftIn')}
${g('geo')}
${g('wind')}
${g('hr')}
${g('huy')}
${g('slope')}
${g('mtn')}
${g('mtSolve')}
${g('mtGrid')}
let mtWtr=async()=>null,mtChm=async()=>null;
function setMt(w,c){const d=w?mtWtrDec(w):null;mtWtr=async()=>d;mtChm=async()=>c||null}
async function mtRun(h,ext){let x=Math.min(40000,Math.max(300,ext));for(let g=0;;g++){const G=await mtGrid(h,x),W=mtWx(),T=P.hr*60,r=mtSolve({N:G.N,cs:G.cs,kf:G.kf,sx:G.sx,sy:G.sy,bd:W.bd,wx:W.wx,wy:W.wy,et:W.et,T,lv:[T/3,2*T/3,T],pc:PWC,pb:PWB});if(!r.edge||g===3||x>=40000)return{...r,cs:G.cs,ext:x,fc:G.fc,wt:G.wt,ch:G.ch};x=Math.min(40000,x*1.7)}}
function setFT(j){${g('ftDec')}j.g=g;FT=j;return j}
function setP(p,ws){P=p;WS=ws||null;manualWind=false}
return {setMt,mtGrid,mtRun,mtSolve,calc,spreadVec,FUEL,R0,EH,MX,WAF,emc,eta,ffM,fuelAt,fuelByElev,chWinSum,CHWN,ftAt,geoAt,windAt,fqHr,huy,hyAdj,slopeAt,setFT,setP};`;
}

// env: GEO (แนวเขตจากบล็อก geo) · demTile(z,x,y) → Promise<Float32Array 65536 ความสูง ม.> (เฉพาะเมื่อใช้ slopeAt)
function loadModel(env = {}, html) {
  return new Function('GEO', 'demTile', source(html))(env.GEO || { cons: { features: [] }, resp: { features: [] } }, env.demTile || (() => Promise.reject(new Error('ไม่มี demTile'))));
}

module.exports = { loadModel, source, PIECES };
