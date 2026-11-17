# โฮสต์และสายงานอัตโนมัติ

> GitHub Pages/Actions (site, sync, wx), watchdog, state branch, ลดภาระ API, pass_wait, sync_hotspots, FIRMS, ตัดจุดซ้ำ, API ต้นทาง
> ย้ายมาจาก CLAUDE.md เดิม (15 พ.ย. 69) โดยไม่ตัดข้อเท็จจริง — ดัชนีอยู่ที่ [CLAUDE.md](../../CLAUDE.md)

## โฮสต์ / workflow / watchdog

- **โฮสต์ (ใช้งานจริงแล้ว 27 ต.ค. 69):** https://takiang71.github.io/fire-map-dpky/ · repo สาธารณะ https://github.com/takiang71/fire-map-dpky (branch main, LF ตาม `.gitattributes`) · GitHub Pages แบบ Source = GitHub Actions · ผู้ใช้ยืนยันว่าเปิดเผยข้อมูลทั้งหมดเป็นสาธารณะได้
  - **ทำงานในเครื่อง: `git pull` ก่อนแก้ทุกครั้ง** (sync บน Actions commit วันละ 2 ครั้ง) แล้ว commit + push เมื่อแก้เสร็จ · push ครั้งแรกล็อกอินผ่าน Git Credential Manager แล้ว · git identity ของ repo: takiang71
  - `.github/workflows/site.yml` ตั้งไว้ทุก 10 นาที (**จริง GitHub รันแค่ทุก 2–5 ชม.** — หน้าเว็บจึง fallback ดึง API ตรงเมื่อ live.json เก่ากว่า 40 นาที ใช้งานได้ปกติ) + push: `node scripts/build_site.js` → `_site/` (index.html + `live.json` จุด 48 ชม. กรองในแนวเขตแล้ว + `air4thai.json`) แล้ว deploy-pages
  - **schedule ของ sync ก็ช้า/หาย** (30 ต.ค. 69 ผู้ใช้ส่งภาพหน้า Actions: มีแค่ 5 รอบใน 3 วัน — 27 ต.ค. 21:02, 28 ต.ค. 09:01, 29 ต.ค. 09:28 และ 22:15) → เพิ่มคู่มือ `docs/line-bot.md` ข้อ 7 ให้ cron-job.org เรียก dispatch ของ sync.yml 06:17/09:17/15:17/18:17 (ใช้ token เดิม) — **ตั้งแล้ว 30 ต.ค. 69** (งาน "fire-map sync", Test run ได้ 204)
    · ตรวจผ่าน API สาธารณะ `/actions/runs/<id>/jobs` (ไม่ต้องล็อกอิน; เครื่องผู้ใช้ไม่มี gh): รอบ dispatch 10:19/10:29 ผ่านทุกขั้น sync_burn 14–22 วิ, sync_fuel 2 วิ (ไม่มีเดือนใหม่), commit + deploy
  - **ตัวสั่งงานสำรอง `worker/watchdog.mjs`** (ผู้ใช้ขอ 11 พ.ย. 69, คู่มือ docs/line-bot.md ข้อ 11 — **ติดตั้งแล้ว 11 พ.ย. 69**: Worker `fire-watchdog` https://fire-watchdog.takiang71.workers.dev/ + Secret GH_TOKEN (token เดิมของ cron-job.org) + Cron Trigger `*/5 * * * *` — หน้าสถานะอ่าน GitHub ได้ would ว่าง
    · **ทดสอบจริงแล้ว 11 พ.ย. 69**: ผู้ใช้ปิดงาน fire-map site ใน cron-job.org → รอบ site ห่าง 19.5 นาที แล้ว Worker สั่งรอบ 16:15 น. (workflow_dispatch, success) ตรงกับ Cron Trigger ทุก 5 นาที): ตื่นทุก 5 นาที ดูรอบล่าสุดผ่าน GitHub API
    · site สร้างเกิน `SITE_GAP` 15 นาที → dispatch
    · sync ผ่านรอบ `SYNC_SLOTS` (เวลาไทย) 25 นาที–3 ชม. ยังไม่มีรอบตั้งแต่ (รอบ−10 นาที) → dispatch
    · ปกติไม่สั่ง (ไม่ซ้อน cron-job.org)
    · dispatch ส่ง `inputs.by=watchdog` — site.yml/sync.yml มี input `by` (sync สั่ง site ด้วย `-f by=sync`) **ถ้าลบ input ออก dispatch ของ Worker จะได้ 422**
    · health.js รับ `RUN_BY`/`RUN_EV`: by=watchdog → ปัญหา `cron` (แจ้งเมื่อต่อเนื่อง 1 ชม.), หายเฉพาะรอบ workflow_dispatch ที่ไม่มี by (= cron-job.org/กดเอง), รอบ schedule/push/sync คงสถานะเดิม
    · GET URL ของ Worker = สถานะ + `would` (ไม่สั่งจริง)
    · `OFF=1` ปิด
    · `GH_API` ทดสอบ
    · ทดสอบกับ GitHub API จำลองแล้ว (scratchpad wdtest.mjs: 18 กรณีรวมข้ามเที่ยงคืน/เกิน 3 ชม./422/ไม่มี token)
    · sync สั่ง site ด้วย -f by=sync ผ่านแล้ว (รอบ 15:17 11 พ.ย. 69)
  - `.github/workflows/sync.yml` 4 รอบ `17 23,2,8,11 * * *` UTC (= 06:17/09:17/15:17/18:17 ไทย — เผื่อ GitHub ข้ามรอบ เช่นรอบ 15:00 ของ 28 ต.ค. 69 หายไป): รัน sync, commit index.html + data แล้วสั่ง `gh workflow run site.yml` (push ด้วย GITHUB_TOKEN ไม่ปลุก workflow อื่น)

## live.json — จุด 48 ชม. (FIRMS สำรอง, ลดภาระ API, รอรอบดาวเทียม)

- **จุด 48 ชม. สำรองด้วย NASA FIRMS** (ผู้ใช้ขอ 11 พ.ย. 69): build_site `live()` = `apiLive()` (เดิม) → ดาวเทียมที่ควรมี `SATS()` (SNPP ถึง `SNPP_END` 2 พ.ย. 69 13:00 UTC) แต่ API ไม่มีใน 48 ชม. ทั้งประเทศ (`meta.sats` นับต่อดวง) / API ดึงไม่ได้ / ตอบว่าง → `FM.recent(need, stat)` (CSV 7 วันสาธารณะ เฉพาะดวงที่ขาด, `FIRMS_PUB` ทดสอบ) เติมจุดในแนวเขต ≤48 ชม. เป็น feature รูป API (`fmFeat`, unique_id `firms|d|t|la|lo|sat` คงที่, `_src:'firms'`) + พื้นที่เฝ้าระวังลง WLIVE
  · `meta.firms {sats,n,box (จุดของดวงนั้นในกรอบ BOX 48 ชม. ทั้งในและนอกแนวเขต),why,err}`
  · ปกติไม่ดึง FIRMS เลย
  · health `api`: ล่ม/ว่าง = บอกว่าใช้ FIRMS แทนกี่จุด, ขาดบางดวง = แจ้งเฉพาะเมื่อ box > 0 (หน้าฝนดวงหนึ่งอาจไม่มีจุดจริง)
  · หน้าเว็บ `HSRC.fm` ป้ายส้มใต้บรรทัดที่มา (ล้างเมื่อดึง API ตรง)
  · Telegram ต่อท้ายดาวเทียม "(NASA FIRMS)" (LINE ไม่ได้ติดป้าย)
  · **กันแจ้งซ้ำ `scripts/lib/near.js`** (line_notify/telegram_notify): `st.near` [[ms,la5,lo5,sat]] ดาวเทียมเดียวกัน ±10 นาที <200 หน่วย (~220 ม.) = จุดเดิม → FIRMS↔API และระเบียนซ้ำของ API ไม่แจ้งซ้ำ, จุดข้างเคียง ≥375 ม. ยังแจ้ง
  · prune ตาม KEEP_H
  · `HOTSPOT_API` env ทดสอบ
  · ทดสอบกับ API/FIRMS จำลอง 4 แบบ (ปกติ/ขาดดวง/ว่าง/ล่ม) + หน้าเว็บ site-test + Telegram --preview — ยังไม่เคยเกิดกับ API จริง
- **ลดภาระ API ต้นทาง** (ผู้ใช้ถาม 13 พ.ย. 69 ว่าดึงทุก 5 นาทีกระทบเว็บต้นทางไหม → สั่ง "ปรับเลย" โดยต้องไม่กระทบความเร็วแจ้งเตือน/ฐานข้อมูล): `apiLive` ใน build_site ดึงแค่ `INC_H` 12 ชม. ล่าสุด (+`EDGE_MIN` 20 นาทีให้ตัวตัดจุดซ้ำเห็นรอบที่ขอบครบ ไม่นำมาใช้) แล้วรวมกับแคช `.state/live_cache.json` {updated, full, feats, W, nat {"ดาวเทียม|full_date": จำนวนทั้งประเทศ}} — 12 ชม. = ช่วงที่ LINE/Telegram แจ้ง จึงแจ้งเตือนเร็วเท่าเดิม
  · ดึงเต็ม 48 ชม. เมื่อ: ไม่มีแคช / ดึงเต็มล่าสุดเกิน `FULL_MIN` 30 นาที / คำตอบ 12 ชม. ว่างหรือขาดดาวเทียมใน SATS() / `LIVE_FULL`
  · ดึงเต็มแล้วว่างหรือขาดดวง = `full` เป็น 0 → รอบถัดไปดึงเต็มอีก (เคยพบตอนทดสอบ: API กลับมาแล้วจุด 12–48 ชม. หาย 30 นาที)
  · meta nation_total/sats/nation_last คิดจาก nat ทั้ง 48 ชม. (FIRMS/health ตัดสินเหมือนเดิม) + `meta.fetch`
  · ใส่ User-Agent `fire-map-dpky (<url เว็บ>)`
  · site.yml load/save state รวม live_cache.json (ไม่ขึ้น Pages)
  · ข้อจำกัด: จุดที่ต้นทางลงช้ากว่า 12 ชม. (เกินช่วงแจ้งเตือนอยู่แล้ว) ขึ้น live.json ช้าได้ ≤30 นาที
  · ภาระลด ~70% (จำลอง: 560 KB → 169–206 KB ต่อรอบ)
  · ทดสอบกับ API จำลองเทียบตัวเดิม 8 กรณี (ไม่มีแคช/รอบปกติ/รอบใหม่/ลงข้อมูลช้า/ครบ 30 นาที/API ว่าง/กลับมา/รอบถัดไป) ตรงกันทุกจุดยกเว้นจุดลงช้า 20 ชม. ตามที่ออกแบบ
  · ฐานข้อมูลสะสม (sync_hotspots) ไม่เกี่ยว
- **รอข้อมูลรอบดาวเทียม `scripts/pass_wait.js`** (ผู้ใช้สั่ง 13 พ.ย. 69 "ทำวิธีนี้ต่อเลย" — โฟกัสแจ้งเตือนเร็วที่สุด): ขั้นใน site.yml ก่อน build (continue-on-error, timeout 6 นาที)
  · ใช้ data/tle.json + `ORB.next` (ทุกรอบไม่ out ≤56°) หารอบที่ผ่านกลุ่มป่าเมื่อ `WIN0` 8 – `WIN1` 90 นาทีก่อน
  · ข้อมูลรอบนั้นยังไม่เข้า (ไม่มีคีย์ nat ดวงเดียวกัน ±`NEAR` 3 นาทีใน `.state/live_cache.json`) → ถาม API เฉพาะช่วง [เวลาผ่าน−3 นาที, ตอนนี้] ทุก `POLL` 45 วิ ≤`WAIT` 4 นาที
  · **รอบใดรอบหนึ่งเข้า = จบทันที** ให้ build/line_notify/telegram_notify ทำงานต่อ (เดิมรอจนครบทุกรอบที่ค้าง — แก้ตอนทดสอบ)
  · ระหว่างรอ cron-job.org สั่งรอบถัดไปไว้ในคิว concurrency "pages" → เริ่มต่อทันที (ช่องว่างไม่เฝ้า ~1.5 นาทีระหว่างรอบ)
  · นอกช่วง/เข้าแล้ว = ไม่รอ ไม่ถาม API
  · ความล่าช้าจริงต่อรอบบันทึกใน `.state/pass_lag.json` {log:[{k,t,seen,lag นาที,how first|poll|cache,ang}]} (branch state; cache = เห็นจากรอบปกติ เวลาเป็นค่าสูงสุด) ไว้ปรับ WIN0/WIN1
  · env PASS_NOW/PASS_POLL/PASS_WAIT/PASS_WIN0/PASS_WIN1/PASS_OFF
  · ปกติวันละ 4 รอบผ่าน (NOAA-20/21 กลางวัน+กลางคืน)
  · ทดสอบกับ API จำลอง + เวลาจำลอง 6 กรณี (นอกช่วง/ก่อน 8 นาที/เข้าระหว่างรอจบใน 15 วิ/แคชมีแล้ว/หมดเวลา ไม่นับดวงอื่นหรือนอก ±3 นาที/API ล่ม) exit 0 ทุกกรณี
  · ยังไม่เคยเห็นทำงานกับรอบดาวเทียมจริง

## ตามต้นทางข้อมูลพยากรณ์ (wx.yml / wx_check / fwi_local)

> ตัวชั้นข้อมูลบนเว็บอยู่ใน [layers-weather.md](layers-weather.md)

- **ตามต้นทางข้อมูลพยากรณ์ (FWI/FFMC
  · VR GFS
  · PM2.5 CAMS)** (ผู้ใช้ขอ 15 พ.ย. 69 "ปรับให้ตามต้นทางให้เร็วขึ้น ให้แสดงผลเป็นปัจจุบันเร็วที่สุด และบอกบนเว็บว่าข้อมูลล่าสุดเมื่อวันที่/เวลา" + แก้ CAMS): เดิมดึงใน sync 4 รอบ/วัน → ช้ากว่าต้นทาง 0.5–6.5 ชม., GFS 12Z ไม่เคยขึ้นเว็บ, สรุป 05:30 ใช้ GFS 06Z/CAMS 00Z ของเมื่อวาน
  · **CAMS ไม่เคยอัปเดตบน Actions** (sync_cams หมดเวลา 10 นาทีทุกรอบ 15 พ.ย. 69 — continue-on-error จึงขึ้น success; ในเครื่อง 4.5 นาที — น่าจะ 429 Open-Meteo จาก IP ที่ใช้ร่วมกัน)
  · ตอนนี้: site.yml ขั้น `check forecast sources` = `scripts/wx_check.js --dispatch` (ทุกรอบ ~5 นาที, คำขอเล็ก: HEAD TFDRS `<วันถัดไป>_FWI.tif` (ไฟล์ต้องนิ่ง 10 นาที; รอบเดิม Last-Modified เปลี่ยน/วันพยากรณ์ไม่ครบ ก็ดึง), HEAD NOMADS f180.idx รอบถัดไป (≥3.5 ชม. หลังรอบ), GET Open-Meteo meta.json) → `_site/data/wxsrc.json` {t, fwi|gfs|cams:{have,pub,upd,src,srcPub,ready}, need, err, wx}
  · มีรอบใหม่ = POST dispatch `wx.yml` (input need, by) — ไม่สั่งเมื่อ wx กำลังรัน/รอคิว หรือรัน `[need เดียวกัน]` (run-name) ภายใน `WX_BACKOFF` 15 นาที
  · site.yml ต้องมี `actions: write`
  · **`.github/workflows/wx.yml`** (concurrency wx) ดึงเฉพาะชุดใน need แล้ว `scripts/wx_publish.sh` commit ทีละชุด (pull --rebase ลองใหม่ 5 ครั้ง) + สั่ง site `-f by=wx`
  · FWI โหลด/บันทึก branch fwi-grid ก่อน commit index.json
  · trigger push เมื่อแก้ wx.yml/sync_cams/sync_gfsvr/sync_fwi (ทดสอบ)
  · ย้ายออกจาก sync.yml แล้ว (sync push ก็ลองใหม่ 5 ครั้ง)
  · **sync_cams ใหม่**: 429 ต่อนาที = รอ 61 วิแล้วลองชุดเดิม (GAP ×1.5), ต่อชั่วโมง/วัน = หยุด
  · ชุดที่ได้เก็บ `.cache/cams_part.json` (ignore; wx ใช้ actions/cache restore/save key cams-part-<run_id>) ครั้งถัดไปดึงต่อเฉพาะรอบเดียวกัน
  · `CAMS_BUDGET` 480 วิ แล้ว exit 3
  · สาเหตุเขียน `::warning::`/`::error::` = **อ่านได้สาธารณะ** `api.github.com/repos/<repo>/check-runs/<job id>/annotations` (log ต้องล็อกอิน)
  · ขึ้นเว็บโดยประมาณ ~5–15 นาทีหลังต้นทางเผยแพร่
  · หน้าเว็บ: สคริปต์ท้ายไฟล์ (FR/frDraw/frGet) กล่อง `.dfr` บนสุดของ #fwibox/#vrbox/#cmbox (สร้างใน JS, id fr-fwi/fr-gfs/fr-cams) "ข้อมูลรอบ…
  · ต้นทางเผยแพร่…
  · ขึ้นเว็บ…" + ✓ เป็นรอบล่าสุด
  · ตรวจกับต้นทาง… (คลาส ok) / ⏳ ต้นทางออกรอบใหม่แล้ว กำลังดึง (nw) / ตรวจไม่ได้ (er)
  · อ่าน wxsrc.json ทุก 5 นาทีขณะเปิดชั้น + กลับมาที่แท็บ
  · have ใหม่กว่าที่โหลดไว้ = โหลดชั้นนั้นใหม่เอง
  · ห่อ fwDraw/gvDraw/cmDraw
  · ทดสอบ: GitHub API จำลอง 5 กรณี (ไม่มี/กำลังรัน/เพิ่งสั่ง/เกิน 15 นาที/ชุดอื่น), Open-Meteo จำลอง (429 นาที+ชั่วโมง → 4/22 ชุด exit 3 → ดึงต่อครบ), site-test + check_site ผ่าน
  · คู่มือ `#wx-fresh` + แถวตารางแหล่งข้อมูล
  · **ผลจริงรอบแรก 15 พ.ย. 69**: wx (push) ดึง CAMS 12Z สำเร็จบน Actions ใช้ ~7.5 นาที (commit 10:35 น.)
  · GFS ไม่มีรอบใหม่
  · **TFDRS (fdrs.forest.go.th หลัง Cloudflare) ตอบ HTTP 403 กับเครื่อง GitHub Actions** → sync_fwi ไม่เคยดึงได้บน Actions (save fwi grids ถูกข้ามทุกรอบ, ข้อมูล FWI ทั้งหมดมาจากการรันในเครื่อง) และ wx_check ขึ้น err.fwi → กล่อง .dfr ของ FWI เป็นคลาส er "ระบบตรวจกับต้นทางไม่ได้"
  · ไม่เปลี่ยน User-Agent เพื่อเลี่ยงการบล็อก (ไม่ใช่วิธีที่เหมาะสม) — ทางแก้ที่ต้องให้ผู้ใช้ตัดสิน: ขอกรมป่าไม้/WFSRU อนุญาตเครื่อง GitHub หรือช่องทางดึงอย่างเป็นทางการ, หรือรัน sync_fwi ในเครื่องแล้ว push (ต้อง push ตาราง g/ ไป branch fwi-grid ด้วย)
  · sync_fwi/sync_gfsvr เขียน ::error เมื่อผิดพลาด (403 บอกหัว server/cf-mitigated/cf-ray)
  · health.js เพิ่ม `fwi`: รอบเก่ากว่าเมื่อวานหลัง 18:00 น. หรือ ≥2 วัน = แจ้งผู้ดูแล
  · **หยุดตรวจ/ดึง TFDRS จาก GitHub แล้ว** (ผู้ใช้สั่ง 15 พ.ย. 69 หลังอธิบายว่าการปลอม User-Agent = เลี่ยงการกันบอตที่เจ้าของตั้งใจ): wx_check ไม่ส่งคำขอไป TFDRS (`fwi.mode=local` รายงานเฉพาะรอบที่มี; `WX_FWI=1` = ตรวจแบบเดิม)
  · wx.yml รันขั้น FWI เฉพาะเมื่อ need มี fwi (สั่งเอง)
  · กล่อง .dfr ของ FWI ขึ้น ℹ ดึงอัตโนมัติไม่ได้ ผู้ดูแลดึงให้เป็นครั้งคราว (คลาส nw + ลิงก์ TFDRS เมื่อรอบเก่ากว่าเมื่อวานหลัง 16:00 น. หรือ ≥2 วัน)
  · health `fwi` บอกให้รัน sync_fwi ในเครื่องแล้ว push (รวม g/ ไป branch fwi-grid)
  · LFA (`wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/raster/fdrs_<fwi|dc|dmc|bui|ffmc|isi>/status|image.png|value?lat=&lon=`, CORS *) ส่งต่อ TFDRS ได้จาก GitHub ค่าตรงกัน แต่มีแค่วันของรอบ ไม่มีพยากรณ์/อากาศ ภาพสีคนละเกณฑ์ — ยังไม่ใช้
  · **ดึงจากเครื่องผู้ใช้แทน** (ผู้ใช้สั่ง "ทำเลย" 15 พ.ย. 69): `scripts/fwi_local.js` ทำในโคลนแยก `.fwi-local/repo` (ignore; ไม่แตะไฟล์งาน) fetch+reset origin/main → ตาราง g/ จาก fwi-grid (git show ทีละไฟล์) → sync_fwi → index.json เปลี่ยน = force push fwi-grid (ถ้า tree เปลี่ยน) แล้ว commit index.json เข้า main (pull --rebase ลองใหม่ 5) — push = site เผยแพร่เอง
  · ใช้ git ที่ C:Program FilesGit (Task Scheduler ไม่มีใน PATH)
  · ชื่อ/อีเมล git อ่านจากโฟลเดอร์งาน
  · บันทึก `.fwi-local/fwi_local.log`
  · `--force` / `FWI_NO_PUSH=1`
  · Task Scheduler **"fire-map FWI"** (`scripts/install_fwi_task.ps1` — **ต้องบันทึกแบบ UTF-8 มี BOM** ไม่งั้น PowerShell 5.1 อ่านไทยเพี้ยน; `-Remove` ลบ) node.exe + เส้นทางสคริปต์ (ภาษาไทยใช้ได้) workdir = โฟลเดอร์โปรเจกต์
  · 07:00 14:40 15:40 17:00 20:00 น. StartWhenAvailable, Interactive (ต้องล็อกอิน — ใช้ Git Credential Manager), มีหน้าต่างดำเด้งสั้นๆ
  · ไม่ขัดกับการลบ Task Scheduler ของ sync เดิม (นั่นแก้ index.html ชนกับ Actions; งานนี้แตะแค่ data/fwi/index.json + branch fwi-grid)
  · **ตัวรันคำสั่งของ Claude อยู่ใน sandbox: ไฟล์ที่เขียนนอกโฟลเดอร์โปรเจกต์ (เช่น %LOCALAPPDATA%) งานตั้งเวลามองไม่เห็น** (ครั้งแรกได้ 0x8007010B directory invalid / MODULE_NOT_FOUND) จึงเก็บใน .fwi-local
  · ทดสอบแล้ว: รันผ่าน Task Scheduler ได้ (ไม่มีรอบใหม่ = จบ ~10 วิ) และ --force ผ่าน Task Scheduler push เข้า main ได้ (11:26 น.)
  · ยังไม่เคยเห็น push branch fwi-grid (ตารางไม่เปลี่ยนในการทดสอบ) — จะเกิดครั้งแรกเมื่อรอบ 15 พ.ย. ออก
  · ยังแนะนำให้ติดต่อ WFSRU
  · **GitHub API แบบไม่ล็อกอินจำกัด 60 ครั้ง/ชม.** — อย่าวนถามสถานะ run ถี่ (เคยหมดโควตา)

## ข้อมูลเปิด open/ + wx_today.json + summary.json รายสัปดาห์ (F8/F4, 17 พ.ย. 69)

- เอกสารสาธารณะทุกไฟล์บน Pages (สคีมา/ความถี่/ตัวอย่าง/เครดิตต้นทาง) → **[docs/api.md](../api.md)** — แก้สคีมาไฟล์ใน _site ต้องแก้เอกสารนี้ด้วย
- build_site ต่อจาก summary.json: `scripts/lib/opendata.js` `write(OUT,{A,H,live,site})` → `_site/open/hotspots_fy<ปีงบ>.csv` (ปีงบ 2561–ปัจจุบัน ~0.1–1 MB/ปี รวม ~3 MB) + `open/index.json`
  · แถว = adata ทุกดาวเทียม (API/FIRMS) + live.json วันหลัง `adata.to` ที่ไม่ซ้ำ hKey + จุด hdata ที่จับคู่ไม่ได้ (แหล่ง "กรมอุทยานฯ (Excel)") · จับคู่ hdata ↔ SNPP 1:1 (วันเดียวกัน ±10 นาที <400 หน่วย 1e-5°, ใกล้สุดก่อน — กติกา sync_hotspots) ใหม่ทุกครั้งเพราะช่อง dnp ใน adata มีเฉพาะยุค API
  · `kpi`: ปีงบที่มี hdata = จับคู่ได้และ fu "ไม่มี" · ไม่มี = `indSat` · `dong_yai` = dyAS · ตรวจแล้ว (17 พ.ย. 69): ปีงบ 2569 kpi 120 / ไม่รวมดงใหญ่ 83 = summary pfull · จุด Excel 133 = จับคู่ 127 (= adata dnp 127) + ไม่มีคู่ 6 · ปีงบ 2570 kpi 1 = summary.total
  · CSV: BOM + CRLF + หัว "ไทย (english)" 20 คอลัมน์ (`COLS`) · ไม่มีข้อมูลส่วนบุคคล
- `_site/wx_today.json` {generated, fwi, vr, pm} = `fwiSummary/vrSummary/camsSummary(now)` (ชุดเดียวกับสรุปประจำวัน LINE/Telegram) → แดชบอร์ด `#ds-wx`
- summary.json เพิ่มต่อพื้นที่: `w`/`pw` รายสัปดาห์ 53 ช่อง (ช่อง i = วัน 7i..7i+6 จาก 1 ต.ค., วันที่ 364–365 รวมช่อง 52) ปีนี้/ปีก่อนทั้งปี · `sn`/`psn` ตามสถานีฯ ปีนี้/ปีก่อนช่วงเดียวกัน (hdata `st`) — Worker LINE ไม่ใช้ช่องใหม่ (ขนาดเพิ่ม ~3 KB)
- reports.json (F1) ยังเป็นสาธารณะ (หน้าเว็บใช้แสดงสถานะ/สิทธิ์แก้ไข) มี `by` (ชื่อผู้ใช้/ชื่อที่แสดง) + note — **ไม่อยู่ในรายการข้อมูลเปิดของ api.md** (ระบุว่าห้ามเผยแพร่ซ้ำ) · แดชบอร์ดใช้แค่นับตามผล

## รายงานประจำเดือน (F3)

- `scripts/monthly_report.js` (16 พ.ย. 69) ขั้น `monthly report` ใน **sync.yml** (continue-on-error, 6 นาที) ก่อน commit: `--acc` ทุกรอบ แล้วโหมดปกติ
  · `--acc`: วันที่ `f=0` (ไม่ใช่พยากรณ์) จาก data/fwi/index.json → **data/fwi/daily.json** `{d:{"YYYY-MM-DD":{all|ky|tl|…:{FWI:[เฉลี่ย,สูงสุด],FFMC:[…]}}}}` (ต้นทางเก็บแค่ 7 วัน; เริ่มสะสม 9 พ.ย. 69) — commit ใน sync
  · ปกติ: วันที่ 1–3 (เวลาไทย) และยังไม่มี `reports/<พ.ศ.>-<MM>.html` ของเดือนก่อน = สร้าง (4 รอบ/วัน → รอบแรกที่สำเร็จ) · `--month YYYY-MM` (ค.ศ.) สร้างทับ · `--no-pdf` · `RM_NOW` จำลองเวลา · `RM_DIR` โฟลเดอร์ปลายทาง (ทดสอบ)
  · ผลลัพธ์ **commit ลง `reports/` ใน main** (site.yml สร้าง _site ใหม่ทุก 5 นาที ไฟล์ใน _site อย่างเดียวจะหาย) → build_site คัดลอก `reports/` → `_site/reports/` · `reports/index.json` `{v,upd,list:[{id:"2569-10",m:"2026-10",t,html,pdf,n:{ind,all,indPrev,fy},partial?,gen}]}` ใหม่สุดก่อน · **ต้องมีโฟลเดอร์ reports/ เสมอ** (ขั้น commit ของ sync.yml `git add reports`)
  · PDF: Chrome CLI `--headless=new --print-to-pdf --no-pdf-header-footer --virtual-time-budget=8000` (Linux + --no-sandbox) ของไฟล์ HTML ในที่ (ฟอนต์ `../fonts`) A4 · ไม่มี Chrome = มีแต่ HTML (index pdf:null)
  · ตัวเลข (ไม่รวมดงใหญ่ `dyAS`): ตัวชี้วัด = hdata ของปีงบที่มี Excel / ไม่มี = adata `indSat` (= hdFill) · ทุกดาวเทียม = adata · เดือนเดียวกันปีก่อน + สะสมปีงบ ต.ค.→สิ้นเดือน เทียบปีก่อนช่วงเดียวกัน · รายพื้นที่/สถานีฯ · 10 ตำบล (ทุกดาวเทียม) · พื้นที่เผาไหม้ = รอบ 7 วันใน data/burn/index.json ที่กึ่งกลางรอบอยู่ในเดือน (`p.ar` คีย์เป็นดัชนี `B.ar`; ผลรวมรายรอบ) · ดับไฟ = fxdata + reports.json (F1) จากเว็บ · FWI = daily.json · แผนที่/กราฟเป็น SVG (ไม่มีไทล์)
  · **ตรวจตัวเลขกับแผงสถิติหน้าเว็บ (`HB()` ปุ่มดงใหญ่เปิด)**: มี.ค. 2569 ตัวชี้วัด 21 / มี.ค. 2568 12 / สะสม ต.ค.–มี.ค. 58 vs 164 / อช.ทับลาน มี.ค. 15 / ปีงบ 2569 ทั้งปี 96 — ตรงทุกค่า
  · รายงานแรก: ตุลาคม 2569 (สร้างมือ 16 พ.ย. 69, 0 จุด) — รายงานอัตโนมัติฉบับแรก = พฤศจิกายน 2569 วันที่ 1 ธ.ค. 69

## ความครบถ้วนของ API เทียบ NASA FIRMS รายเดือน (C5, 16 พ.ย. 69)

- **sync.yml** ขั้น `firms audit` (ก่อน commit; continue-on-error, timeout 10 นาที, env `FIRMS_KEY` จาก secret): เดือนก่อน (เวลาไทย) ยังไม่มี `data/firms_audit_<YYYYMM>.json` → `node scripts/firms_audit.js --from <YYYY-MM>` = รอบแรกของเดือน (พลาด = รอบถัดไปลองใหม่) · ไม่มี secret = `::warning` แล้วข้าม · ขั้น commit `git add data/firms_audit_*.json` (เมื่อมีไฟล์)
- ใช้คำขอ FIRMS ~20 ครั้ง/เดือน (≤5 วันต่อคำขอ × ดาวเทียม) ไม่ถึงโควตา 5,000/10 นาที · ทดสอบด้วยเซิร์ฟเวอร์จำลอง `FIRMS_BASE` (`test/firms_audit.test.js`) — ใช้โควตาจริงครั้งเดียว 16 พ.ย. 69 สร้าง `data/firms_audit_202610.json` (FIRMS 2 จุด = API 2 จุด → 100%, API มีข้อมูล 31/31 วัน)
- จับคู่ด้วย `FM.match` (ดาวเทียมเดียวกัน วันเดียวกัน ≤10 นาที <400 หน่วย 1e-5°) · `pct` = จับคู่ได้ / จุด FIRMS · `miss` = FIRMS มีแต่ API ไม่มี (API ขาด) · `extra` = API มีแต่ FIRMS ไม่มี · `apiDays` = วันของเดือนที่มีใน `hotspots_api.json raw.days` · API ที่เติมจาก FIRMS (`src:'firms'`) ไม่นับ
- build_site คัดลอก `data/firms_audit_*.json` → `_site/data/` และเดือนล่าสุดเป็น `_site/data/firms_audit.json` → หน้าเว็บ `faLoad()` (1.5 วิหลังโหลด, `BN_BASE` = เปิดจากไฟล์ใช้ของโฮสต์) → `FA` → `faLine(FA)` บรรทัดท้าย `#p-src` ใน `srcUpd()` · คู่มือ `#src-menu`

## ตรวจความสอดคล้องตัวเลข (C2, 16 พ.ย. 69)

- `site.yml` ขั้น **verify numbers** (continue-on-error, 2 นาที) ต่อจาก check site ก่อน line_notify: `node scripts/verify_numbers.js _site --ci`
  · หน้าเว็บ: ดึงโค้ดจริงจาก `_site/index.html` เป็นช่วง (`liveList` ตั้งแต่ `HOTSPOT_TZ`, `geoAt`, `dyAS/xAD/xLive`, `thDay/fy0/fyOfDay`, `fuOK`, `fyCum`, `hKey`, `fyNow`, `fyPts`, `SB1/SBP`, ช่วง `esc`…`hdFill` = อ่าน hdata/adata) รันใน `new Function` ด้วยข้อมูลฝัง `data/emb/*.json` + live.json · เวลา = `summary.generated` (Date จำลอง) · หาโค้ดไม่เจอ = ok:null + ::warning (ไม่ใช่ตัวเลขผิด)
  · เทียบ (ค่าเริ่มต้นหน้าเว็บ ไม่รวมดงใหญ่): ปีงบ · สะสมทุกพื้นที่ (`fyNow` S.xdy=false = summary.total = ผลรวม areas) · สะสมไม่รวมดงใหญ่ (fyNow = จำนวน fyPts = ผลรวม areas ที่ไม่ใช่ดงใหญ่ = แถว "รวม" การ์ด LINE = "รวม" Telegram) · ปีงบก่อนทั้งปี/ช่วงเดียวกัน (HD fuOK xHD) · รายพื้นที่อนุรักษ์ (geoAt ชื่อ "เตรียมประกาศเป็น…" → "… (เตรียมการ)") · รายจังหวัด
  · LINE = `carousel({live,sum,now,daily:true})` การ์ดแรก (แถวชื่อย่อ AREAS + "รวม") · Telegram = `telegram_notify.js --preview` (ไม่ส่ง; `NOTIFY_DIR` = โฟลเดอร์, `TG_NOW`) ส่วน "สรุปประจำวัน"
  · ผล `_site/numcheck.json` {at, now, ok, fy, n, diff, checks} (ขึ้น Pages ด้วย) → health.js `num` (ต่อเนื่อง 1 ชม.) แจ้งผู้ดูแล · ต่าง = `::warning title=ตัวเลขหน้าเว็บ/summary.json/LINE/Telegram ไม่ตรงกัน::`
  · ตรวจรับ: กลางปีงบ 2569 ตรงกัน 17 รายการ (สะสม 100 ไม่รวมดงใหญ่/138 ทั้งหมด, 6 พื้นที่, 6 จังหวัด) · แก้ summary ทับลาน +1 → จับได้ 3 รายการ (รวมทุกพื้นที่, ไม่รวมดงใหญ่, ทับลาน) · `test/numbers.test.js`

## อื่นๆ ของโฮสต์

- หน้าเว็บ: `liveFile()` อ่าน `live.json` ก่อน (ถ้าเก่ากว่า `LIVE_MAXAGE` 40 นาทีหรือไม่มี → ดึง API ตรง) · `getStations` ลอง `air4thai.json` ก่อน
- ทดสอบในเครื่องแบบเดียวกับโฮสต์: `node scripts/build_site.js` แล้ว `node scripts/serve.js 8002 _site` (launch config `site-test`)
- `scripts/lib/area.js` (GEO + `where` + `SBP`) และ `scripts/lib/air4thai.js` (แก้ cert chain) ใช้ร่วมกันโดย sync/build/serve
- Task Scheduler ในเครื่อง**ลบแล้ว** (sync ย้ายไป Actions) — อย่าติดตั้งกลับ ไม่งั้นไฟล์ในเครื่องกับบน GitHub แก้ชนกัน · ทดสอบแล้ว: site (dispatch) ผ่าน, sync ผ่าน + commit + สั่ง site deploy ต่อได้

## sync_hotspots / FIRMS / ตัดจุดซ้ำ

- ~~`scripts/install_sync_task.ps1`~~ ลบแล้ว 30 ต.ค. 69 (Task Scheduler เลิกใช้ — sync อยู่บน Actions) · sync_hotspots ยังเขียน `data/sync.log` (ตัดเหลือ ~100 KB เมื่อเกิน 200 KB) · กันรันซ้อนด้วย `data/.sync.lock` · เขียนไฟล์แบบ tmp+rename
- `scripts/sync_hotspots.js` — ดึง API ทีละวัน (ทั้งประเทศ ~1 MB/วันช่วงพีค) กรองในแนวเขต เก็บสะสม ฝัง adata
  · รอบถัดไปดึงเฉพาะวันที่ขาด + ดึงซ้ำ 7 วันล่าสุด แล้ว**รวม**กับจุดเดิม (ไม่แทนที่ทั้งวัน — API เคยตอบไม่ครบ เช่น 27 ต.ค. 69 มีแค่ NOAA-21)
  · backfill ครั้งแรก 392 วันใช้ราว 10 นาที
  · **FROM = 2024-08-03** (11 พ.ย. 69 ขยายจาก 1 ต.ค. 68)
  · ต่อจุดย้อนหลัง FIRMS (`data/hotspots_hist.json`, เฉพาะ r.ar ก่อน FROM) ไว้หน้า adata ทุกรอบ
  · log นับรายปีงบ + ปีงบ 2568/2569 SNPP ตรงกับกรมอุทยานฯ กี่จุด
  - วันที่ API ตอบ **ทั้งประเทศ 0 จุด** ถือว่าขัดข้อง: คงข้อมูลเดิม ไม่บันทึกว่าเสร็จ (27 ต.ค. 69 API ตอบว่างย้อนหลัง 24–27 ต.ค. ทั้งที่เคยมีข้อมูล — ถ้าไม่กันจะลบจุดเดิมทิ้ง)
  - **แหล่งสำรอง NASA FIRMS** (30 ต.ค. 69, `scripts/lib/firms.js`): วันที่ดึงรอบนี้ (ไม่รวมวันนี้) ที่ API ไม่มีดาวเทียมใด (ว่าง/ขาดบางดวง/ดึงไม่สำเร็จ; SNPP นับถึง 2 พ.ย. 69) → ≤6 วันใช้ `recent()` CSV 7 วันสาธารณะ (SouthEast_Asia, ไม่ต้องใช้ key)
    · เก่ากว่านั้นใช้ `area()` ต้องมี MAP_KEY (env `FIRMS_KEY` = GitHub secret ใน sync.yml — **ผู้ใช้ตั้งแล้ว 1 พ.ย. 69**, ในเครื่อง = ไฟล์ `.firms_key` ที่ ignore ไว้ — ผู้ใช้บันทึกเอง 30 ต.ค. 69)
    · area: ≤5 วัน UTC ต่อคำขอนับจาก DATE ไปข้างหน้า, เลือก NRT ก่อน SP ตาม `/api/data_availability` (ตอนนี้ SP ถึง 31 ก.ค. 69, NRT ตั้งแต่ 1 ส.ค. 69; NOAA-21 NRT ตั้งแต่ 2024), acq_time ไม่เติม 0, confidence n/l/h
    · **โควตา 5,000 หน่วย/10 นาทีคิดตามขนาดคำขอ** (ตรวจทั้งปีงบรอบเดียวก็เกิน) เกินแล้วตอบ "Invalid MAP_KEY" → `waitQuota` เช็ก mapkey_status แล้วรอ
    · แปลง UTC→ไทย, ตำบล/อำเภอ/จังหวัดจาก `admIndex` (export จาก burnsum)
    · `match()` จับคู่หนึ่งต่อหนึ่ง
    · ไม่เติมถ้ามีจุด API เดิมพิกเซลเดียวกัน (±10 นาที <400)
    · `src:'firms'` + adata แถวยาว 14 ช่อง (ช่องสุดท้าย 1) → หน้าเว็บ `AD.fm` ป๊อปอัปจุดสะสม "ที่มา: NASA FIRMS"
    · ลบทิ้งเมื่อ API มีดาวเทียมนั้นในวันนั้นแล้ว
    · ตรวจแล้ว: 28–29 ต.ค. FIRMS ตรงกับ API 197/197 (ห่าง ~70 ม. เวลา ±3 นาที ความเชื่อมั่นและตำบลตรงทุกจุด)
    · ช่วงที่ API ว่าง 24–26 ต.ค. 69 FIRMS มีจุดในแนวเขตแค่ 2 จุด (24 ต.ค.) ซึ่งมีอยู่แล้ว = ไม่มีจุดหาย
  - **ตัดจุดซ้ำของ API** (ผู้ใช้สั่ง 30 ต.ค. 69
    · **เปลี่ยนวิธี 11 พ.ย. 69** งานค้างข้อ 13): ตรวจกับ FIRMS พบว่า API ส่ง**ทั้งรอบดาวเทียมมาสองชุด** ช่วง 17 ก.ย. 68 – 4 มี.ค. 69 (ทุกจุดในรอบมีคู่แฝด unique_id ต่างกัน ตำแหน่งเหลื่อมคงที่ทั้งรอบ 10–250 หน่วย เวลาเท่ากันหรือต่าง 1–3 นาที; ตั้งแต่ 9 มี.ค. 69 ไม่ซ้ำ) — เกณฑ์เดิม (เวลาต่าง 1–3 นาที <150 หน่วย ในแนวเขต) จับคู่แฝดเวลาเดียวกันไม่ได้ เหลือเกิน 62 จุด
    · `scripts/lib/dedup.js` `featDups`/`apiDups`: ตรวจ**ทั้งประเทศรายรอบ** (ดวงเดียวกัน จุดเวลาห่าง ≤6 นาที) รอบที่จุดมีคู่ <250 หน่วย ±3 นาที ≥60% (และรอบ ≥30 จุด หรือทั้งชุดเป็นแบบซ้ำ) = รอบซ้ำ → จับคู่ใกล้สุดก่อน <450 หนึ่งต่อหนึ่ง ทิ้งระเบียนเวลาเร็วกว่า/เวลาเท่ากันทิ้งตัวที่มาก่อนในคำตอบ (ตำแหน่งที่เหลือใกล้ FIRMS ที่สุด)
    · รอบปกติมีคู่ใกล้แค่ 3–26% จึงไม่ถูกตัด (ตรวจ 23 วันหลัง 9 มี.ค. ตัด 0)
    · ใช้ใน `fetchDay` ของ sync (ลบคู่แฝดที่เคยเก็บด้วย), `apiLive` ของ build_site (`meta.dup`), และ `liveList` ของหน้าเว็บ (`apiDups` สำเนาเดียวกัน — แก้ต้องแก้ทั้งสองที่; ตารางช่อง 450 หน่วย 30,000 จุด ~55 ms)
    · ล้างย้อนหลังด้วย `node scripts/sync_hotspots.js --dedup-all` (ดึงทุกวันใหม่ ~10 นาที ไม่เติม FIRMS วันเก่า) รันแล้ว 11 พ.ย. 69: ทั้งประเทศซ้ำ 93,365 ระเบียน
    · ลบจากที่เก็บ 61 จุด → ในแนวเขตปีงบ 2569 SNPP 134 / NOAA20 135 / NOAA21 152 (+ พื้นที่เฝ้าระวัง 14), dnp ยัง 117
    · จากนั้นขยาย FROM ถึง 3 ส.ค. 67 แล้วรัน `--refetch 470` เติม FIRMS วันที่ API ขาดดาวเทียม (95 วัน, +11 จุด) → ปีงบ 2568 SNPP 195 / NOAA20 200 / NOAA21 195 (ตรงกรมอุทยานฯ 187/196)
    · ปีงบ 2569 SNPP 144 / NOAA20 135 / NOAA21 152 (ตรง 127/133)
    · adata 7,303 แถว (FIRMS ย้อนหลัง 6,285) ฝัง 362 KB, index.html gzip ~535 KB 〔15 พ.ย. 69: index.html 2.38 MB, gzip ~625 KB〕
    · เทียบ FIRMS 66 วัน: API เกิน 62 → 5 จุด, จุดจริงที่ถูกตัดพลาด 2 จุด
    · **ห้ามแก้ข้อมูล Excel กรมอุทยานฯ (hdata/xlsx) ก่อนผู้ใช้อนุญาต** — ตรวจ sha1 ของ hdata ก่อน/หลังรันแล้วไม่เปลี่ยน

## เซิร์ฟเวอร์ในเครื่อง / proxy

- `scripts/serve.js` — เว็บเซิร์ฟเวอร์ในเครื่อง + proxy `/air4thai` (แคช 10 นาที) · `.claude/launch.json` ชี้มาที่ตัวนี้
- `scripts/air4thai-worker.js` — Cloudflare Worker ส่งต่อ Air4Thai พร้อม CORS (ผู้ใช้ต้อง deploy เอง แล้วใส่ URL ใน `AIR4THAI_PROXY`) — **ยังไม่ได้ทดสอบบน Cloudflare จริง**

## การดึงข้อมูลสดฝั่งหน้าเว็บ

- รีเฟรชอัตโนมัติ (`POLL`, `pollTick`, ตรวจทุก 60 วินาที): ดึงเฉพาะ 3 ชม. ล่าสุดทุก 5 นาทีแล้วรวมกับรอบก่อน (`liveKey`) + ดึงเต็ม 48 ชม. ทุก 30 นาที · ไม่ดึงขณะแท็บถูกซ่อน ดึงทันทีเมื่อกลับมา · ผลว่าง (ระหว่างรอบดาวเทียม) ไม่ถือเป็น error
- จุดความร้อนจริง: `HOTSPOT_API`, `hsQS(hr=48)` (start_date/end_date เวลาไทย ย้อนหลัง hr ชม. + reserved_only=0&protected_only=0), `normAlert`, `liveList` (กรองเฉพาะจุดในแนวเขต cons/resp), `getHotspots`, `hsrcShow`, `sysTime`

## API จุดความร้อน (Land Fire Alerts Thailand, WFSRU/ThaiREN) — ไม่ต้องใช้ key, CORS เปิด

`GET https://wildlandfire.thairen.net.th/landfirealertsmap_thailand/api/alerts?start_date=YYYY-MM-DDTHH:MM:SS&end_date=…&reserved_only=0&protected_only=0`
ไม่ส่ง start/end → HTTP 400. ตอบ GeoJSON FeatureCollection, properties:
`full_date` ("2026-10-26 13:42:00" เวลาไทย = เวลาดาวเทียมสแกน), `satellite_name` (NOAA20/NOAA21/…), `confidence` (nominal/…),
`province_name_th/en`, `district_name_th/en`, `subdistrict_name_th/en`, `protected_area_name_th`, `reserved_forest_name`, `utm_*`, `unique_id` — **ไม่มี FRP**
หน้าเว็บต้นทางแสดง "Last update" (เช่น 13h47) = เวลาระบบประมวลผล ไม่อยู่ใน response ของ alerts — อยู่ใน HTML หน้าแรก (ดูงานค้างข้อ 1)

