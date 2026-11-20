# แผนที่สถานการณ์ไฟป่า กลุ่มป่าดงพญาเย็น-เขาใหญ่ (Dong Phayayen–Khao Yai Forest Complex)

เว็บแอปไฟล์เดียว (`index.html` 2.4 MB ~8,000 บรรทัด, ข้อมูลฝัง ~1 MB · `_site/index.html` 1.62 MB: build_site แยกข้อมูลฝัง → `data/emb/`, บล็อก `lz-*` → `js/`) ภาษาไทย MapLibre GL JS 4.7.1 (cdnjs)
เปิดด้วยดับเบิลคลิก หรือ `node scripts/serve.js` แล้วเข้า http://localhost:8000 (ไม่มี Python · สคริปต์ใหม่ใช้ Node 24)
ผู้ใช้สื่อสารภาษาไทย ตอบเป็นภาษาไทย · ข้อความบนหน้าเว็บเป็นภาษาไทยทั้งหมด
สเปกตั้งต้นอยู่ที่ `docs/spec-v3.md` (เฟส 1–4)
โฮสต์: https://takiang71.github.io/fire-map-dpky/ · repo สาธารณะ https://github.com/takiang71/fire-map-dpky (main, LF) · GitHub Pages + Actions · ผู้ใช้ยืนยันว่าเปิดเผยข้อมูลทั้งหมดเป็นสาธารณะได้
แจ้งเตือน: LINE OA "Hotspots สบอ.1" (กลุ่ม**ทดสอบ**, โควตาฟรี 300/เดือน) + Telegram @Hotspot_dnp1_bot (กลุ่ม 13 คน) · Worker Cloudflare 3 ตัว: fire-line, fire-watchdog, fire-layers
ข้อมูลหลัก: จุดความร้อนสด (API ThaiREN 48 ชม.) · ย้อนหลังกรมอุทยานฯ Excel (SNPP ปีงบ 2561–2569) · API ไทย + NASA FIRMS ทุกดาวเทียมถึงปีงบ 2561 · การดับไฟ อส. 2564–2569 · พื้นที่เผาไหม้ GISTDA/HII · FWI กรมป่าไม้ · VR GFS · PM2.5 CAMS ฯลฯ
ตัวชี้วัดกรมอุทยานฯ: Suomi NPP → **NOAA-20 ตั้งแต่ 2 พ.ย. 2569** (`IND_SW`) · แผนที่แสดงทุกดวง · ค่าเริ่มต้น **ไม่รวม ขสป.ดงใหญ่ (สบอ.7)**

**รายละเอียดทั้งหมดอยู่ใน `docs/arch/*.md`** — อ่านเฉพาะไฟล์ที่เกี่ยวกับงาน แล้วค้นชื่อฟังก์ชันใน `index.html` ด้วย grep

## กติกาที่ต้องทำตามทุกครั้ง

1. **`git pull` ก่อนแก้ทุกครั้ง** (GitHub Actions commit เข้า main วันละหลายครั้ง) · เสร็จแล้ว commit + push (identity takiang71)
2. **รัน `node --test test/` (ชุดทดสอบหน่วย <1 วิ) ทุกครั้งที่แก้ `scripts/` หรือ `index.html` · รัน `node scripts/check_site.js` ก่อน commit ทุกครั้งที่แก้ `index.html`** (~3 นาที; syntax + Chrome headless 1440/390 กดปุ่มหลัก) ต้องได้ `✅ ผ่าน` · เพิ่มปุ่ม/แผงใหม่ ต้องเพิ่มขั้นใน `DESK`/`MOB` ของสคริปต์ → [testing.md](docs/arch/testing.md)
3. **ห้ามแก้บล็อกข้อมูลด้วยมือ**: `hdata` (Excel กรมอุทยานฯ — **ห้ามแก้ก่อนผู้ใช้อนุญาต**), `adata`, `wdata`, `wadata`, `fxdata` สร้างจากสคริปต์เท่านั้น (`excel_to_hdata.js`, `sync_hotspots.js`, `import_watch.js`, `import_fx.js`) · อ่านบล็อกด้วย `getElementById(id).textContent` ได้ตามเดิม (ใน `_site` ตัวโหลด `embGet` สร้างบล็อกให้ก่อนรันสคริปต์แอป) — สคริปต์ใหม่ต้องเป็น `<script>` ไม่มี attribute (ยกเว้น `text/x-lazy`) → [data-blocks.md](docs/arch/data-blocks.md)
4. แก้ `index.html` ด้วย Node ใช้ `split(a).join(b)` **ห้ามใช้ `String.replace`** (`$$`/`$&` เพี้ยน) · แทรกก่อน `</body>` ต้องใช้ `lastIndexOf` (มี `</body>` ในสตริงของโมดูลพิมพ์แผนที่)
4a. เรียกเครือข่ายใน index.html ใช้ `fetchT(url,opt,FTO.main|tile|big|aux)` ห้าม `fetch(` ตรง · catch ในเส้นทางโหลดข้อมูลใช้ `dbg('ชื่อ',e)` ไม่ปล่อยว่าง · สคริปต์แรกใน `<head>` (ตรวจเบราว์เซอร์เก่า) ต้อง ES5 → [gotchas.md](docs/arch/gotchas.md)
5. **ห้ามใส่หมายเหตุ `//` ท้ายบรรทัดที่มีโค้ดต่อ** (เคยกลืนโค้ดจนปุ่มเสีย; `node --check` ไม่จับ) ใช้ `/* */`
6. ชื่อที่**ชนกันแล้วห้ามใช้ซ้ำ**: `FT` (ชนิดป่า), `fetchT`/`FTO`/`dbg`, `PM`/`PMD`/`PMQ`, `HM`, `WG`, `WLT`, `STM`, คลาส `mb`, id `pm-*`, ชั้น `fx`, `fw-c/fw-d/fw-t`, id `w-src`, `data-k` ใน `#hcard` · โมดูลใหม่ตั้ง prefix เฉพาะ 2–3 ตัวอักษร → [gotchas.md](docs/arch/gotchas.md)
7. `apply()`/`setup()` ถูกเรียกก่อนสไตล์โหลด: ห่อ `try`, ห้ามใช้ `isStyleLoaded()` ตัดสิน ใช้ `map.getSource('dem')` · สลับแผนที่ฐานต้องคง `setStyle(...,{diff:false})`
8. แก้ `scripts/lib/orbit.js` แล้วต้องรัน `node scripts/embed_orbit.js` (สำเนาฝังใน index.html)
9. **แก้ฟีเจอร์แล้วต้องแก้คู่มือ `manual/index.html` ตาม** (ไอคอน = SVG จริงจากแอป, ภาพ `manual/img/*.jpg` ถ่ายด้วย `manual_shots.mjs`) · แหล่งข้อมูลของเมนูเปลี่ยน → แก้ `srcUpd()` + ตาราง `#src-menu` ในคู่มือ
10. ห้ามปลอม User-Agent เพื่อเลี่ยงการกันบอตของต้นทาง (TFDRS) · GitHub API ไม่ล็อกอินจำกัด 60 ครั้ง/ชม. อย่าวนถาม
11. ข้อความบนเว็บเป็นภาษาไทย · ตอบผู้ใช้เป็นภาษาไทย · **บอกตรงๆ ว่าอะไรตรวจแล้ว อะไรยังไม่ได้ตรวจ**
12. workflow: ลบ input `by` ออกจาก site.yml/sync.yml ไม่ได้ (watchdog dispatch จะได้ 422) · `sync.yml` cron 4 รอบ · `site.yml` ถูก cron-job.org เรียกทุก 5 นาที · **อย่าติดตั้ง Task Scheduler ของ sync กลับ** (แก้ชนกับ Actions; งาน "fire-map FWI" เป็นคนละงาน ใช้ได้)
13. ทดสอบในเครื่องเหมือนโฮสต์: `node scripts/build_site.js` แล้ว `node scripts/serve.js 8002 _site` (launch config `site-test`)
14. การตัดสินใจของผู้ใช้ที่บันทึกไว้แล้ว อย่ารื้อโดยไม่ถาม → [decisions.md](docs/arch/decisions.md) · เพิ่มฟีเจอร์ใหม่ให้บันทึกรายละเอียดลง `docs/arch/` ไฟล์ที่ตรงหมวด (ไม่ใช่ใน CLAUDE.md) และเก็บ CLAUDE.md ให้สั้นกว่า 16 KB

## แผนที่เอกสาร (อ่านเฉพาะที่เกี่ยว)

| ไฟล์ | เนื้อหา | คำค้นตัวอย่าง |
|---|---|---|
| [data-blocks.md](docs/arch/data-blocks.md) | บล็อก `geo` `hdata` `adata` `fxdata` `wdata` `wadata`, ไฟล์ต้นฉบับ, สคริปต์นำเข้า, กติกา HD/AD/ตัวชี้วัด/ปุ่มดาวเทียม/ดงใหญ่ | `IND_SW` `fyNow` `xHD` `satFy` `dyAS` `import_fx` `lzJs` |
| [pipelines.md](docs/arch/pipelines.md) | site.yml / sync.yml / wx.yml, watchdog, branch `state`, live.json + FIRMS สำรอง, ลดภาระ API, `pass_wait`, `sync_hotspots`, ตัดจุดซ้ำ, fwi_local, API ต้นทาง | `apiLive` `dedup.js` `near.js` `wx_check` `SNPP_END` `opendata` |
| [notify.md](docs/arch/notify.md) | LINE (carousel, Worker, โควตา, สรุปประจำวัน, การ์ดเผาไหม้), Telegram, `health.js`, ลิงก์ตรง `?hs` `?pts` `?burn` | `carousel` `burnCard` `hsLink` `LINE_MAX_DAY` `loadState` |
| [ui-modules.md](docs/arch/ui-modules.md) | การ์ดหลัก, ตาราง/CSV/รายงาน, สถิติย้อนหลัง + เล่นย้อน, กองจุด, ดับไฟ, จปร., วัด, วาด/Layer Manager/หลังบ้าน, ภูมิประเทศ, ความสูง, พิมพ์แผนที่, ภาพดาวเทียม, โมเดลไฟ, คู่มือ | `renderCard` `hRender` `pbStart` `hcCalc` `wFocus` `msSet` `GIO` `PP` `dsKpi` `syDash` |
| [data-sources.md](docs/arch/data-sources.md) | พื้นที่เผาไหม้/เผาซ้ำซาก/SAVI, แนวเขตปกครอง, ชนิดป่า, ความลาดชัน, ความสูง GEM-15, ท่องเที่ยว/Power BI, หน่วยพิทักษ์, หน้าข้อมูลพื้นฐาน | `sync_burn` `bnData` `ftAt` `slopeAt` `demURL` `sync_tourism` `KBP` |
| [layers-weather.md](docs/arch/layers-weather.md) | Windy, อากาศรายชั่วโมง/ลม, เรดาร์, Himawari, สถานีกรมอุตุฯ, VR (GFS), FWI (TFDRS), PM2.5 CAMS/Air4Thai, ดาวเทียมรอบถัดไป | `S.vr` `gvMaxFn` `fwNow` `cmLoad` `tmLoad` `ORB` |
| [decisions.md](docs/arch/decisions.md) | ความชอบ/การตัดสินใจของผู้ใช้ (เลย์เอาต์แผง, ค่าเริ่มต้นชั้นข้อมูล, เครดิต) + งานค้างเดิม (ประวัติ) | `homePad` `panFit` `sheetFit` `ctlFit` |
| [gotchas.md](docs/arch/gotchas.md) | ชื่อชนกัน + บั๊กที่เคยเจอ | |
| [data-update.md](docs/arch/data-update.md) | ตารางชุดข้อมูลนำเข้ามือ · Excel กรมอุทยานฯ ปีงบใหม่ / ดับไฟ | `import_all` `excel_to_hdata` `hdFill` `chkXlsx` |
| [risk.md](docs/arch/risk.md) | F2 ดัชนีเสี่ยง (ไม่ใช่ค่าทางการ) ตรวจย้อนหลัง | `RISK` `fwiDay` |
| [testing.md](docs/arch/testing.md) | ชุดทดสอบหน่วย `test/` (วิธีเพิ่มเทสต์), check_site (ในเครื่อง/CI), ตัวตรวจ XSS/CSP/ตัวเลข | `node --test` `check_site` `--ci` `UNIT` `lint_html` `verify_numbers` |

เอกสารอื่น: `docs/api.md` (ข้อมูลเปิด) · `docs/line-bot.md` (ติดตั้ง LINE/cron-job.org/watchdog/health) · `docs/telegram-bot.md` · `docs/layers-backend.md` · `manual/index.html` (คู่มือผู้ใช้) · `docs/review-2569-11-15.md` (รายงานตรวจและงานค้าง)

## โครงสร้างไฟล์ (ย่อ)

- `index.html` — ทั้งแอป (CSS + HTML + JS) + บล็อกข้อมูล `<script type="application/json">` (`geo` `hdata` `adata` `fxdata` `wdata` `wadata`)
- `scripts/` — `sync_*.js` (ดึงข้อมูลบน Actions), `build_site.js` (→ `_site/`), `line_notify.js` `telegram_notify.js` `health.js`, `check_site.js`, `import_*.js` `excel_to_hdata.js` `kmz_to_geojson.js` `build_*.js` (นำเข้า/สร้างข้อมูล รันมือ), `serve.js`, `lib/` (area, dedup, firms, orbit, tiff, xlsx, state, near, *sum …)
- `worker/` — `line-webhook.mjs` (ผู้ใช้วางโค้ดใน dashboard เอง), `watchdog.mjs`, `layers.mjs`
- `data/` — ข้อมูลที่ sync/สร้าง (burn, fuel, fwi, ftype, admin.json, prov.json, gfs_vr.json, cams_grid.json, tle.json, tourism.json, ranger.json …) · `data/kmz/` แนวเขตจริงจากผู้ใช้
- `sw.js` `manifest.webmanifest` — PWA/ออฟไลน์ (build_site ใส่รุ่น) → [ui-modules.md](docs/arch/ui-modules.md) · `img/` ไอคอน/og · `fonts/` Noto Sans Thai
- `manual/` — คู่มือ + `img/` · `.github/workflows/` — site, sync, wx, line-test, tg-test

## สถานะระบบ (15 พ.ย. 69)

- Actions: site ~40 วิ/รอบ (cron-job.org 5 นาที + watchdog), sync 4 รอบ/วัน, wx ตามต้นทาง
- FWI: TFDRS บล็อกเครื่อง GitHub (403) → Task Scheduler "fire-map FWI" บนเครื่องผู้ใช้ (`fwi_local.js`) · เก่า ≥2 วัน → LFA (`fwi_lfa.js`)
- ต้นทางช้า/หยุด: SAVI มีแค่ 202601 · พื้นที่เผาไหม้ B4 รอบล่าสุด 22–28 ต.ค. 69
- **F1** ผลตรวจหน้างาน (`VF` + Worker `/reports`) · **F7** บันทึกเส้นทาง `TK` · **FD** ไฟป่าที่ตรวจพบ → ui-modules.md · **DF** แบบรับแจ้งเหตุกรมฯ → dnp-form.md
- **F2** ดัชนีเสี่ยง M2 (ผู้ใช้อนุมัติ) ชั้น `rk-*` + risk.json → risk.md · **F3** `monthly_report.js` (sync วันที่ 1 → `reports/`) → pipelines.md
- **F6** รับ DM Telegram (`/ตาม`): getUpdates + `tg_subs.json` (branch state) **ห้ามตั้ง webhook** → notify.md
- **B2** งานหนัก (กองจุด/ภูมิประเทศ/เผาไหม้) ใน Web Worker inline `WJ`/`wjLib` (ห้ามแตะ DOM) → gotchas.md testing.md
- LINE ยังเป็นกลุ่มทดสอบ — แผนย้าย/โควตา/`LINE_MODE=daily`+`TG_INVITE` → `docs/line-rollout.md` (A7) · E3 บันทึกการใช้งาน/ออกทุกอุปกรณ์ → layers-backend.md
- **ปีงบ 2571 (1 ต.ค. 70):** ถ้ายังไม่นำเข้า Excel ปีงบ 2570 เว็บเติมจาก API ให้เอง (`hdFill` + ป้าย ⚠) และ health `xlsx` เตือนตั้งแต่ 1 ธ.ค. — ควรนำเข้าตาม data-update.md

## งานค้าง

ดู **`docs/review-2569-11-15.md`** (ประเด็น A–E + ฟังก์ชันใหม่ F + roadmap) · ประวัติงานค้างเดิมอยู่ใน [decisions.md](docs/arch/decisions.md) · **แผนแอป Android** (ยังไม่เริ่ม): `docs/android-app-plan.md`
ยังเปิดอยู่: จุดกรมอุทยานฯ ปีงบ 2569 ที่ API ไม่มี 16 จุด (FIRMS มี 15) · หลายฟีเจอร์ยังไม่ได้ลองบนอุปกรณ์/โปรแกรมจริง — ดู D7 ของรายงาน
