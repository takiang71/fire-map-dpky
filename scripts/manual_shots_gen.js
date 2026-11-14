// สร้างรายการภาพหน้าจอของคู่มือ (scripts/manual_shots.json) — ภาพรายสวิตช์ในแผงชั้นข้อมูล + ภาพหลักที่เปิดจุดความร้อนตัวอย่าง
// node scripts/manual_shots_gen.js  แล้ว  node scripts/manual_shots.mjs manual/img scripts/manual_shots.json
const fs = require('fs'), path = require('path');
const U = 'http://localhost:8000/';
// ตัวช่วยที่ใส่หน้าทุกงาน: W = รอ, set = เปิด/ปิดสวิตช์ชั้นข้อมูลตาม aria-checked, row = เลื่อนแผงชั้นข้อมูลให้เห็นแถว, demo = เปิดจุดตัวอย่าง
const PRE = `const W=ms=>new Promise(r=>setTimeout(r,ms));
const sw=k=>document.querySelector('.sw[data-k='+k+']');
const set=(k,v)=>{const b=sw(k);if(b&&(b.getAttribute('aria-checked')==='true')!==v)b.click()};
const row=k=>{const rb=document.querySelector('#right .rb'),r=sw(k).closest('.row');rb.scrollTop=r.offsetTop-70};
const demo=async()=>{const b=document.querySelector('#bDemo');if(b.getAttribute('aria-checked')!=='true')b.click();await W(2500)};
const lay=async()=>{lcSet(true);document.querySelector('#bLay').click();await W(700)};
const sel=(id,v)=>{const s=document.querySelector(id);const o=[...s.options].find(o=>o.value===v||o.value.startsWith(v));if(o){s.value=o.value;s.dispatchEvent(new Event('change'))}};
`;
const J = [];
const job = (name, js, o = {}) => J.push({ name, url: U, w: o.w || 1280, h: o.h || 760, wait: 11000, q: o.q || 66, js: PRE + js, after: o.after || 6000, ...(o.clip ? { clip: o.clip } : {}), ...(o.clipSel ? { clipSel: o.clipSel, pad: o.pad || 0 } : {}), ...(o.boxes ? { boxes: o.boxes } : {}), ...(o.dpr ? { dpr: o.dpr } : {}) });
const go = (c, z, x = '') => `map.jumpTo({center:[${c}],zoom:${z}${x}});`;

// ---------- ภาพหลัก (เปิดจุดความร้อนตัวอย่าง) ----------
job('overview', `await demo();`, { w: 1440, h: 860, q: 70, after: 3000, boxes: { lhd: '#left .lhd', btns: '#left .btns', pcard: '#pcard', ctl: '#ctl', attr: '#attr', hint: '#hint', lcol: '#lcol', scale: '.maplibregl-ctrl-scale' } });
job('card', `await demo();document.querySelector('#left').scrollTop=0;`, { w: 1440, h: 2200, q: 78, after: 2500, clipSel: '#pcard', pad: 8,
  boxes: { sats: '#pcard [data-sats]', xdy: '#pcard [data-xdy]', kp: '#p-kp', cmp: '#p-cmp', cfy: '#pcard .cfy', ch: '#p-ch', md: '#p-md', tb: '#p-tb', q: '#pcard .srch', pbt: '#pcard .pbt', pcard: '#pcard' } });
job('mobile', `await demo();`, { w: 390, h: 844, dpr: 2, q: 70, after: 2500 });

// ---------- แผนที่ฐาน (ตัดเฉพาะกลางแผนที่) ----------
for (const b of ['natural', 'flat', 'sat', 'detail', 'dark'])
  job('base_' + b, `lcSet(true);document.querySelector('[data-b=${b}]').click();await W(4000);${go('101.415,14.665', 12.4)}`, { after: 7000, q: 66, clip: { x: 340, y: 190, width: 600, height: 380 } });

// ---------- รายสวิตช์ (เปิดแผงชั้นข้อมูลค้างไว้ให้เห็นกล่องตั้งค่า) ----------
job('sw_d3', `await lay();set('d3',true);await W(1500);row('d3');${go('101.38,14.40', 11.6, ',pitch:62,bearing:-25')}`, { after: 9000 });
job('sw_hot', `await lay();await demo();row('hot');const b=new maplibregl.LngLatBounds();HS.forEach(h=>b.extend([h.lon,h.lat]));map.fitBounds(b,{padding:{top:60,bottom:60,left:60,right:420},duration:0});`);
const HCV = go('102.02,14.40', 10.3);
job('sw_hcl', `await lay();set('hcl',true);await W(1500);sel('#hc-s','fyp');await W(1500);row('hcl');${HCV}`);
job('sw_hgp', `await lay();set('hgp',true);await W(1500);sel('#hc-s','fyp');await W(1500);row('hgp');${HCV}`);
job('sw_har', `await lay();set('har',true);set('hgp',true);await W(1500);sel('#hc-s','fyp');await W(1500);row('har');${HCV}`);
job('sw_burst', `await lay();set('hcl',true);await W(1500);sel('#hc-s','fyp');await W(2500);const C=HCC.C;let i=0;C.forEach((c,k)=>{if(c.n>C[i].n)i=k});hcBurst(i);await W(4000);row('hcl');`, { after: 5000 });
job('sw_hist', `await lay();set('hist',true);await W(2500);row('hist');${go('101.75,14.30', 9.1)}`);
job('sw_xt', `await lay();set('xt',true);await W(2500);row('xt');${go('101.75,14.30', 9.1)}`);
job('sw_burn_c', `await lay();set('burn',true);await W(3500);sel('#bn-s','c202603');await W(4000);row('burn');document.querySelector('#right .rb').scrollTop+=30;${go('102.20,14.30', 10.4)}`, { after: 8000 });
job('sw_burn_h', `await lay();set('burn',true);await W(3500);sel('#bn-s','fy2569');await W(4000);const h=document.querySelector('#bn-h');h&&h.click();await W(2500);row('burn');document.querySelector('#right .rb').scrollTop+=160;${go('102.62,14.40', 10.9)}`, { after: 8000 });
job('sw_rep', `await lay();set('rep',true);await W(4000);row('rep');${go('102.20,14.30', 10.4)}`, { after: 8000 });
job('sw_dry', `await lay();set('dry',true);await W(6000);const rb=document.querySelector('#drseg button[data-v=rh]');rb&&rb.click();await W(2500);row('dry');${go('101.0,13.8', 5.8)}`, { after: 6000 });
job('sw_ftype', `await lay();set('ftype',true);await W(4000);row('ftype');${go('101.80,14.25', 9.2)}`, { after: 8000 });
job('sw_fuel', `await lay();set('fuel',true);await W(4000);row('fuel');${go('101.45,14.35', 10.6)}`, { after: 9000 });
job('sw_wind', `await lay();set('wind',true);await W(3000);row('wind');${go('101.6,14.1', 7.6)}`, { after: 9000 });
job('sw_wx', `await lay();set('wx',true);await W(3000);row('wx');${go('101.6,14.1', 7.4)}`, { after: 9000 });
job('sw_vr', `await lay();S.orb=false;S.vrs='gfs';S.vrg='max';set('vr',true);await W(6000);row('vr');document.querySelector('#right .rb').scrollTop+=62;${go('101.9,14.3', 7.6)}await W(300);{const p=map.project([101.75,14.3]),[x,y,a]=vrCtr();map.panBy([p.x-(x-a.m.left),p.y-(y-a.m.top)],{duration:0})}`, { after: 9000 });
job('sw_rad', `await lay();set('rad',true);await W(3000);row('rad');${go('101.0,13.4', 5.4)}`, { after: 8000 });
job('sw_pm', `await lay();set('pm',true);await W(4000);row('pm');${go('101.0,13.6', 5.6)}`, { after: 8000 });
job('sw_cons', `await lay();row('cons');${go('101.95,14.25', 8.9)}`, { after: 4000 });
job('sw_resp', `await lay();set('resp',true);await W(1500);row('resp');${go('101.95,14.25', 9.0)}`, { after: 5000 });
job('sw_stn', `await lay();set('stn',true);set('resp',true);await W(1500);row('stn');${go('101.55,14.25', 10.8)}`, { after: 6000 });
job('sw_wpt', `await lay();set('wpt',true);await W(1500);row('wpt');${go('101.42,14.22', 11.2)}`, { after: 6000 });
job('sw_wch', `await lay();set('wch',true);await W(1500);row('wch');document.querySelector('#right .rb').scrollTop-=45;${go('101.16,14.32', 11.2)}`, { after: 6000 });
job('sw_adm', `await lay();set('prov',true);set('amp',true);set('tam',true);await W(3000);row('prov');${go('101.50,14.10', 10.0)}`, { after: 7000 });
job('sw_road', `await lay();document.querySelector('[data-b=detail]').click();await W(4000);row('water');${go('101.42,14.19', 12.6)}`, { after: 8000 });

// ภาพอื่น (แผงรายละเอียด สถิติ ตาราง ฯลฯ) อยู่ใน manual_shots_base.json
const B = JSON.parse(fs.readFileSync(path.join(__dirname, 'manual_shots_base.json'), 'utf8'));
fs.writeFileSync(path.join(__dirname, 'manual_shots.json'), JSON.stringify([...J, ...B], null, 1));
console.log(J.length + B.length, 'งาน');
