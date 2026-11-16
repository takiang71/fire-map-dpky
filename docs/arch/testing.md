# การตรวจงาน

> ย้ายมาจาก CLAUDE.md เดิม (15 พ.ย. 69) โดยไม่ตัดข้อเท็จจริง — ดัชนีอยู่ที่ [CLAUDE.md](../../CLAUDE.md)

## การตรวจงาน

- **`node scripts/check_site.js [โฟลเดอร์]`** (ผู้ใช้ขอ 11 พ.ย. 69, ~80 วิ): syntax ทุก `<script>` (vm.Script บอกบรรทัดจริงใน index.html, JSON.parse บล็อกข้อมูล, + manual/index.html) แล้วเปิดใน Chrome headless 1440 + 390 กดปุ่มหลัก (`DESK`/`MOB`: สถิติ+แท็บดับไฟ+ตาราง, จปร., เล่นย้อน, ตารางจุด, แผงชั้นข้อมูล, ข้อมูลพื้นฐาน, วัด, ชั้นของฉัน, ภูมิประเทศ, พิมพ์แผนที่, ปุ่มเครื่องมือมือถือ) นับ Runtime.exceptionThrown — error เครือข่าย/โดเมนภายนอก (`NET`) ไม่นับ
  · ไม่พบปุ่ม/แผนที่โหลดไม่เสร็จ = คำเตือน
  · exit 0/1/2 (2 = เปิด Chrome ไม่ได้)
  · **รันก่อน commit ทุกครั้งที่แก้ index.html**
  · ทดสอบแล้วจับได้: syntax ผิด, `//` กลืนโค้ดแล้วตัวแปรหาย (error ตอนกดปุ่ม), `let` ชื่อซ้ำข้ามบล็อก
  · ถ้าเพิ่มปุ่ม/แผงใหม่ ให้เพิ่มขั้นใน DESK/MOB
  · **ขั้นท้าย (15 พ.ย. 69, A2/A3/D8)**: เปิด `?debug=1` (1440) → มี `__LOG`/`dbg`/`fetchT` + ปุ่ม `#attr #dg-cp` · `fetchT('__hang',{},800)` (เซิร์ฟเวอร์ในสคริปต์ไม่ตอบ 5 วิ) ต้องได้ TimeoutError <4 วิ และลง __LOG · `Network.emulateNetworkConditions` ออฟไลน์แล้วกด ↻ ต้องมี toast "ดึงข้อมูล…/ต้นทาง…" ภายใน 22 วิ (ไม่ใช่ "ดึงข้อมูลใหม่แล้ว") และ __LOG เพิ่ม · กดปุ่มคัดลอกได้ JSON (ua/ver/log) → `info.debug` ใน check.json · แล้ว `Page.addScriptToEvaluateOnNewDocument('delete window.DecompressionStream')` โหลดใหม่ → ต้องขึ้น `#oldb` เต็มจอ (error ของแอปในขั้นนี้ย้ายไปคำเตือน เพราะเบราว์เซอร์จริงไม่เก่า)
  - ใน `site.yml` ขั้น `check site` (continue-on-error, 6 นาที) ต่อจาก build: `--ci` เขียน `_site/check.json` {sha, ok, errs, warn, fallback}
    · **ไม่ผ่าน = แทน _site/index.html ด้วยฉบับบนเว็บ** (ข้อมูลอื่นขึ้นปกติ) + `::error` + health.js เช็ก `ci` แจ้งผู้ดูแล
    · sha ตรงกับ check.json บนเว็บ = ใช้ผลเดิม ไม่เปิด Chrome (รอบ cron ส่วนใหญ่)
    · `CHECK_FORCE=1` ตรวจใหม่
    · Linux ใส่ --no-sandbox
- ก่อนส่งทุกครั้ง: แยก inline script แล้ว `node --check`; ทดสอบฟังก์ชันด้วย harness Node (ดึงโค้ดจาก index.html ด้วย regex แล้ว eval)
- ถ้ามีอินเทอร์เน็ต ให้เปิดด้วย Playwright/เบราว์เซอร์จริงเพื่อตรวจหน้าจอ (ในเซสชันเดิมทำไม่ได้ จึงยังไม่เคยตรวจภาพจริง)
- บอกผู้ใช้ตรงๆ เสมอว่าอะไรตรวจแล้ว อะไรยังไม่ได้ตรวจ


## ชุดทดสอบหน่วย `test/` (เพิ่ม 15 พ.ย. 69 ตามข้อ B4 ของ docs/review-2569-11-15.md)

- **รัน: `node --test test/`** (ไม่ต้องติดตั้งแพ็กเกจ — `node:test` + `node:assert`, ~0.5 วิ) · รันก่อน commit ทุกครั้งที่แก้ `scripts/lib/*` หรือฟังก์ชันในหน้าเว็บที่มีเทสต์
  · Node 22 ขึ้นไปถือ `test/` เป็นชื่อไฟล์ (ไม่ไล่หาไฟล์ในโฟลเดอร์แบบ Node 20) → Node แปลงเป็น **`test/index.js`** ซึ่งโหลด `test/*.test.js` ทุกไฟล์ให้รันในรอบเดียว
  · รันไฟล์เดียว: `node --test test/dedup.test.js` · อย่ารัน `node --test` เปล่าๆ (จะรันซ้ำสองรอบ เพราะ index.js ถูกนับเป็นไฟล์เทสต์ด้วย)
- **ใน Actions**
  · รันผ่าน `node scripts/unit_ci.js` (= `node --test --test-reporter=spec test/` + เทสต์ที่ล้มพิมพ์เป็น `::error title=ชุดทดสอบหน่วยไม่ผ่าน::ชื่อ — ข้อความ` → ดูได้ใน annotations ของรอบผ่าน API สาธารณะ `/check-runs/{job}/annotations` โดยไม่ต้องล็อกอิน) · ใช้ในเครื่องแทน node --test ได้
  · **กับดัก Node**: timer ของ `AbortSignal.timeout` เป็นแบบ unref — เทสต์ที่รอแต่ timer นี้ต้องมี timer ปกติค้ำ event loop (`alive()` ใน net.test.js) ไม่งั้น Node 22 บน Actions ล้ม ทั้งที่ Node 24 บน Windows ผ่าน (15 พ.ย. 69)
  · `site.yml` ขั้น `unit tests` ก่อน build (continue-on-error) → ไม่ผ่าน = ส่ง `UNIT=failure` ให้ `check_site.js --ci` ซึ่งถือว่าไม่ผ่าน: ใช้ index.html ฉบับบนเว็บ, `check.json` มี `unit:false` + errs "ชุดทดสอบหน่วยไม่ผ่าน", health.js แจ้งผู้ดูแล (ปัญหา `ci`) — live.json/การแจ้งเตือนยังทำงาน · รอบที่ `unit:false` จะไม่ถูกใช้ผลเดิมตาม sha (แก้แค่ scripts/ แล้วตรวจใหม่ได้)
  · `sync.yml` ขั้นแรก (ไม่มี continue-on-error) → ไม่ผ่าน = หยุดรอบนั้น ไม่ commit ข้อมูล (รอบถัดไปดึงวันที่ขาด + 7 วันล่าสุดซ้ำอยู่แล้ว) · ขั้น `check site` (health --site) ยังรันเพราะ `if: always()`
- **ไฟล์เทสต์** (แต่ละไฟล์มีหมายเหตุหัวไฟล์ว่าทดสอบอะไร)
  | ไฟล์ | ทดสอบ |
  |---|---|
  | `dedup.test.js` | `apiDups`/`featDups`: รอบซ้ำ (แฝดเหลื่อมคงที่ ช้ากว่า 0–2 นาที) ทิ้งระเบียนเร็วกว่า, รอบปกติไม่ทิ้ง, รอบเล็ก/ทั้งชุด, แยกดวง/รอบ, จับคู่ 1:1, ค่าเกณฑ์ `O`, **สำเนา apiDups ใน index.html ให้ผลเท่ากัน** |
  | `orbit.test.js` | SGP4 เทียบชุด Vallado 00005 (13 เวลา) + 28057 (25 เวลา) คลาด <0.5 มม. (`fixtures/vallado.json`), สำเนา ORB-LIB ใน index.html ตรงไฟล์, `next()` 24 ชม. จาก `fixtures/tle.json`, scanAng/scanKm/dest/bearing |
  | `area.test.js` | `where()` จุดในทุกพื้นที่ (รวมเขาฉกรรจ์/โคกสูง/ดงใหญ่ สบอ.7), นอกแนวเขต, `SBP`, `watchAt` จปร., **`geoAt` ในหน้าเว็บให้พื้นที่/สถานีฯ เดียวกับ where() ทุก 0.05°** |
  | `near.test.js` | กันแจ้งซ้ำ: FIRMS→API รหัสใหม่, จุดข้างเคียง 1 พิกเซล, คนละดวง, >10 นาที, ชื่อดาวเทียมหลายแบบ, `prune` |
  | `state.test.js` | `loadState`: เลือกชุด updated ใหม่สุด, ไฟล์เสีย, เว็บล่ม (fetch จำลอง ไม่ต่อเน็ต — `STATE_DIR` ชั่วคราว, `STATE_RAW` ว่าง) |
  | `summary.test.js` | `fwiSummary` (+ ทางสำรอง LFA `fixtures/fwi_lfa.json`, `fwi_lfa` stale/summarize)/`vrSummary`/`camsSummary` กับ `fixtures/{fwi,gfs_vr,cams_grid}.json` (สังเคราะห์ ค่าเท่ากันทั้งพื้นที่ — ค่าที่ถูกคิดด้วยมือในหมายเหตุ) + เกณฑ์ระดับ VR/PM2.5 |
  | `xlsx.test.js` | `unzip`/`readXlsx` กับ xlsx ที่สร้างในเทสต์ (เก็บตรง+บีบอัด, shared/inline string, ตัวเลข/วันที่/ตรรกะ/สูตร/error, คอลัมน์ AA, แถวที่ข้าม) |
  | `tiff.test.js` | `llToUTM` เทียบสูตร Krüger อิสระ (<1 ซม.), แปลงกลับไปกลับมา, `readTiff` 8 บิต/16 บิตมีเครื่องหมาย+Deflate+predictor, EPSG/พิกเซล/มุม |
  | `net.test.js` | `fetchT` (ตอบทันที/เกินเวลา=TimeoutError/ไม่มี AbortSignal.timeout ใช้ AbortController/ผู้เรียกยกเลิก/เครือข่ายล่ม) · `dbg` (200 รายการ, warn เฉพาะ ?debug=1) · `slowMsg` · **ไม่มี `fetch(` ตรงนอก fetchT** · สคริปต์ D8 เป็นสคริปต์แรก ES5 และตรวจครบ |
  | `hdfill.test.js` | C1 `hdFill` (ดึงจาก index.html) จำลอง 2 ต.ค. 2570: เติมเฉพาะปีงบ 2570 ด้วย indSat (SNPP ถึง 1 พ.ย. 69 / NOAA-20 จากนั้น ไม่รวม NOAA-21), ld/fu/sb/fa, `fyCum(2570)` ไม่เป็น 0, `hdfNote`/`hdfSats`, มี Excel แม้จุดเดียว = ไม่เติม |
  | `health.test.js` | health `xlsx`/`savi`/`b4` ด้วย `HEALTH_NOW` (รอยต่อ 1 ธ.ค., 90/21 วัน, ต้นทางใหม่กว่าเว็บ), ระยะทวนซ้ำใน `CHECKS` · ล้าง cache `lib/state` หลังโหลด (state.test.js ต้องได้ STATE_DIR ของตัวเอง) |
  | `emb.test.js` | B1 `splitEmb` กับ index.html จริง (อ่านอย่างเดียว เขียนโฟลเดอร์ชั่วคราว): 6 ไฟล์ชื่อมี hash เนื้อหาตรงทุกไบต์, < 1.5 MB, สคริปต์แอปถูกพักครบ/ไม่เปลี่ยน/ลำดับเดิม, สคริปต์ส่วนหัวไม่ถูกแตะ, ตัวโหลดรอ DOMContentLoaded · D2 meta/ไอคอน · B3 ไม่มี googleapis + ไฟล์ woff2 มีจริง |
  | `pwa.test.js` | D1: manifest (start_url/scope/standalone/ไอคอนมีไฟล์), `pwaFiles` (รุ่น sha เปลี่ยนตาม HTML, shell มี fonts/emb/MapLibre, ไม่มีตำแหน่งแทนค้าง), sw.js ใน vm: คำขอที่ต้องแคช vs ห้ามแตะ (API, Esri, Google, คู่มือ, PNG), `pwaTiles` ≤300 แผ่น ซูม 9–13 |
  | `fiscal.test.js` | ฟังก์ชันในหน้าเว็บ (ดึงจาก index.html): `fy0` `fyOfDay` (รอยต่อ 1 ต.ค.) `thDay` (เปลี่ยนวัน 17:00 UTC) `IND_SW`/`indSat` (2 พ.ย. 69) `fuOK` (+ dictionary จริงใน hdata) `dyAS` |
  | `search.test.js` | D4 `gzFind`/`gzCo` (ดึงจาก index.html + `udCoParse` + GIO): "บุพราหมณ์" → ต.บุพราหมณ์ อ.นาดี, "ทับลาน" → อช.ทับลาน แล้วสถานีฯ, คำนำหน้า ต./อ./จ., ชื่อย่อ จปร./ขญ.1, ค้นได้แม้ยังไม่มี admin/ranger, UTM 47/48 (มี/ไม่มีโซน), ละติจูด/ลองจิจูด (สลับลำดับ, องศา ลิปดา), ข้อความทั่วไปไม่ใช่พิกัด, คืนค่า UDCO · อ่าน data/admin.json ranger.json (ไม่เปลี่ยนตาม sync) |
  | `risk.test.js` | F2 `lib/risk.js`: FWI ชุดมาตรฐาน Van Wagner, ฝนลดดัชนี, DC เขตร้อน, dekad/ปีงบ, climBuild (หด/ไม่นับปีอื่น/เรียบ), auc/confusion/brier, fitLogit กู้สัมประสิทธิ์ (rng) |
  | `mrep.test.js` | F3 `lib/mrep.js`: เริ่มเก็บ/เดือนใหม่/เดือนเดิม/เกิน 7 วัน/ว่าง + ข้อความ HTML/LINE |
  | `fxcheck.test.js` | C4 `xqRows`/`xqDist` (ดึงจาก index.html) กับ fxdata + `data/admin.json` (ไฟล์คงที่): สาเหตุนับตรงกับ `q` ของ import_fx, เรียงตามลำดับต้นฉบับ, ข้ามแถว ck/vf · `import_fx.js --dry --json` กับ xlsx 3 แถวที่สร้างในเทสต์: คอลัมน์ "ตรวจแล้ว" ข้ามคำเตือน + `r[24]=1`, ไม่มีคอลัมน์ = แถว 24 ช่อง |
  | `firms_audit.test.js` | C5 `firms_audit.js --from 2026-10` กับเซิร์ฟเวอร์ FIRMS จำลอง (`FIRMS_BASE`, ตอบตามช่วงวัน UTC ที่ขอ): firms/api/match/miss/extra ต่อดาวเทียม, pct 66.7, ตัดจุด `src:'firms'`/นอกเดือน · `faLine` ในหน้าเว็บ |
  | `import_all.test.js` | C3 `import_all.js --dry`: แยกชนิดจากหัวคอลัมน์/DBF ใน zip, hdata ต้องมี `--hdata`, KBP ครั้งเดียว (ไฟล์ไม่มีนามสกุล), tour ต้องมี Excel+KML, ไฟล์ชนิดเดียวกันซ้ำ = หยุด (ไม่รันตัวนำเข้า) |
  | `kbp_tour.test.js` | C3 `import_kbp.js`/`import_tour.js --dry --json` กับ Excel/KML จำลอง: ลำดับคีย์ตามแถว, บริเวณค่าเข้า, ทางบก, CC ยุบช่องว่าง, กลุ่มเสือโคร่ง, ช้าง "–" + eleNat, lodgeN · tour: Excel มาก่อน, ALIAS/จุดชมวิว=จุดชมทิวทัศน์, รายละเอียด KML (เวลา/คน/a/ทุ่งหญ้า/สิ่งอำนวยความสะดวก+คำผิด), o:'m', ภาพเดิม/ภาพใหม่ sha1, อุทยานจากพิกัด, รายการเขียนมือคงไว้, เรียง, ตัดแหล่งที่หาย (tour อ่านรายการเขียนมือจาก index.html) |
  | `viewlink.test.js` | D3 `vwEnc`/`vwParse`/`vwApply` ไป-กลับ (ผู้รับตั้งค่าเริ่มต้นต่างกันก็ได้ชั้นเดียวกัน), ค่าที่ไม่รู้จักข้าม, v ผิด = ไม่ใช้, deepLink ใช้ v เฉพาะเมื่อไม่มีลิงก์ตรงอื่น, `history.replaceState(` มีที่เดียว, vwSched ตรวจสวิตช์ซ้ำ, VWX ลบพารามิเตอร์ลิงก์ตรงครบ |
- **ตรวจรับเมื่อสร้าง**: แก้เกณฑ์ใน dedup.js ให้ผิด 4 แบบ (TW 250→50, RATIO 0.6→0.05, PAIR 450→100, DT 3→0) → เทสต์ล้ม 4–7 ข้อทุกแบบ (ไม่ใช่แค่ข้อตรวจค่าเกณฑ์)
- **วิธีเพิ่มเทสต์**
  1. สร้าง `test/<เรื่อง>.test.js` (CommonJS): `const test = require('node:test'), assert = require('node:assert/strict')` แล้ว `test('ชื่อภาษาไทยบอกสิ่งที่คาด', () => { … })` — ไม่ต้องแก้ index.js
  1a. ตัวนำเข้า Excel: `xlsx(rows)`/`zip(files)` ใน helpers.cjs สร้างไฟล์ทดสอบในเทสต์ได้ (ไม่ต้องเก็บไฟล์จริง)
  2. ฟังก์ชันใน `index.html`: `const { grab, load } = require('./helpers.cjs')` → `grab(/regex ของโค้ด/)` (ไม่เจอ = เทสต์ล้มพร้อมบอก regex) แล้ว `load(src, ['ชื่อ'], { ตัวแปรที่โค้ดอ้างถึง })` · เวลาปัจจุบันจำลองด้วย class ที่ extends Date แล้วแทน `now()` (ดู fiscal.test.js)
  3. ไฟล์ตัวอย่างเก็บใน `test/fixtures/` ให้เล็ก (≤10 KB) และ**ห้ามอ่านไฟล์ใน data/ ที่ sync เปลี่ยนทุกวัน** (เทสต์ต้องให้ผลเดิมทุกรอบ) — อ่านบล็อกใน index.html ได้เฉพาะที่ไม่เปลี่ยนตาม sync (`geo`, dictionary ของ `hdata`) และอ่านอย่างเดียว
  4. ห้ามต่อเน็ตในเทสต์ (จำลอง `global.fetch` แบบ state.test.js) · ใช้ `rng(seed)` จาก helpers.cjs แทน Math.random
  5. แก้เกณฑ์/ตรรกะโดยตั้งใจ → แก้ค่าที่คาดในเทสต์ด้วย และบอกเหตุผลในหมายเหตุ

## เวลาโหลดก่อน/หลังแยกข้อมูลฝัง (B1 เฟส 1, 16 พ.ย. 69)

Chrome headless 1440×900 · เสิร์ฟ `_site` จากเซิร์ฟเวอร์ในเครื่อง (ไม่บีบอัด gzip — Pages บีบอัด จึงช้ากว่าจริงทั้งสองฝั่ง) · ปิดแคช · ค่ามัธยฐานของ 3 รอบ · harness: `b1h.js time` ใน scratchpad ของเซสชัน (โค้ดสรุปในหัวข้อนี้)

| | DOMContentLoaded | การ์ดมีตัวเลข (`#p-kp`) | `map.loaded()` | ขนาด index.html |
|---|---|---|---|---|
| ก่อน (ไม่จำกัดความเร็ว) | 2,141 ms | 2,164 ms | 5,140 ms | 2,401,445 B |
| หลัง (ไม่จำกัดความเร็ว) | 203 ms | 1,755 ms | 4,343 ms | 1,378,884 B + data/emb 6 ไฟล์ ~1.03 MB |
| ก่อน (Fast 3G 1.6 Mbps/150 ms) | 24,826 ms | 19,462 ms | 23,782 ms | |
| หลัง (Fast 3G) | 13,752 ms | 14,584 ms | 24,356 ms | |

- การ์ดมีตัวเลขเร็วขึ้น ~0.4 วิ (เน็ตเร็ว) / ~4.9 วิ (3G) · `map.loaded()` ใกล้เดิม (รอไทล์ภาพแผนที่จาก CDN เป็นหลัก) · HTML โครงขึ้นเร็วขึ้นมาก (DCL)
- วัดเพิ่มที่ควรทำ: เปิดซ้ำ (แคช ETag/304) บน Pages จริง และมือถือจริง (D7)
- วิธีวัด: `Page.navigate` แล้ว poll ทุก 100 ms ว่า `#p-kp` มีตัวเลข / `map.loaded()` · `performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd` หลัง loadEventEnd · 3G = `Network.emulateNetworkConditions` (ไทล์ภายนอกก็ถูกจำกัดด้วย)
- ตัวเลขอ้างอิง (`b1h.js ref`): นาฬิกาตายตัว 2026-11-15T16:00Z + บล็อก API/live.json/watch.json + Math.random ตายตัว → อ่านการ์ดหลัก, โหมดเทียบ, การ์ดสถิติแท็บ hs/ha/xt, การ์ด จปร. — ก่อนแก้ (repo, _site) = หลังแก้ (repo, _site) ทุกค่า

## check_site ขั้น PWA (D1, 16 พ.ย. 69)

- ต่อจากขั้นเบราว์เซอร์รุ่นเก่า (ใช้ profile เดียวกัน): โหลดหน้า → `navigator.serviceWorker.ready` ≤20 วิ, active = activated, ถามรุ่นผ่าน postMessage → รีโหลดออนไลน์ 1 ครั้ง (ให้แคชระหว่างใช้งานเต็ม) → `Page.getAppManifest` (ไม่มี error ร้ายแรง) + `Page.getInstallabilityErrors` ต้องว่าง (= Lighthouse installable) → **ปิดเน็ต**: `Network.emulateNetworkConditions offline` ของหน้า + ปิดเซิร์ฟเวอร์ในเครื่อง (service worker เป็นอีก target ที่ emulate ไม่ถึง) → `Page.reload` ต้องมีแผนที่ + แหล่ง cons + การ์ดมีตัวเลข + HD > 0 + แถบ `#pwa-bar` ขึ้น · error ระหว่างออฟไลน์ (ไทล์/ฟอนต์ภายนอก) = คำเตือน · ผล → `info.debug.pwa` {sw (รุ่น), scope, installable, offline:{bar, hd, live, at}}
- ผลครั้งแรก (_site ในเครื่อง): sw รุ่น e46e3d0b4d9f activated · installable true · ออฟไลน์รีโหลด: HD 3,154 · แถบ "📴 ออฟไลน์ · จุดความร้อนเมื่อ 16 พ.ย. 06:18 น."
- ขั้นออฟไลน์เดิม (A2, ปุ่ม ↻) ล้มครั้งแรกหลังมี service worker เพราะ live.json มาจากแคช → toast "ดึงข้อมูลใหม่แล้ว" ทั้งที่ออฟไลน์ → แก้ข้อความปุ่ม ↻ เมื่อ `navigator.onLine===false`

## check_site ขั้นค้นหา / ลิงก์มุมมอง (D4/D3, 16 พ.ย. 69)

- `DESK`: ปุ่ม `#bSr` → ค้น 4 คำ (`GZ4`: "บุพราหมณ์" ผลแรก ต.บุพราหมณ์ อ.นาดี · "ทับลาน" ผลแรก อช.ทับลาน · "47 820000 1560000" = 14.09275, 101.96324 · "14.1,101.9") รอผลแรกตรงเงื่อนไข ≤10 วิ (ตัวช่วย `GZQ`) → Enter ต้องมีป๊อปอัป+หมุด → ปิด · ปุ่มคัดลอกลิงก์มุมมอง: `vwCopy.last` รูปแบบ `?v=ทศนิยม5,ทศนิยม5,ทศนิยม2` และ location มี v
- `MOB` (390×844): ค้น "บุพราหมณ์" → แผ่นผล `#gz-s` ชิดขอบล่าง และขอบบน ≥ ขอบล่างของ `#ctl` / ช่องค้นหาไม่ทับคอลัมน์ (ถ้าคอลัมน์แสดงอยู่) → ค้นพิกัด UTM → แตะผลแรก = ป๊อปอัป + แผ่นปิด
- ต่อจากรอบมือถือ (1440): เปิด `?v=14.20000,101.60000,11.50,15,0&l=base:flat,-cons,amp,fwi:DC` → กล้อง (ศูนย์กลาง ±1e-4, ซูม ±0.01, ทิศ 15) + S + ชั้น cons-f ซ่อน + **URL ไม่ถูกเขียนเอง** + `vwEnc()` เข้ารหัสกลับได้เท่าเดิม → `info.viewlink` · เปิด `?bb=…&v=…&l=-cons,amp` → ต้องไม่ใช้ v/l

## check_site ขั้นรายงานประจำเดือน (F3, 16 พ.ย. 69)

- DESK ในการ์ดสถิติ: `#h-mrep` → รอ modal ≤10 วิ ต้องมีลิงก์ `reports/` ในตาราง `.dt` หรือข้อความ "ยังไม่มีรายงาน" → ปิด

## check_site ขั้นพื้นที่เสี่ยงไฟป่า (F2, 16 พ.ย. 69)

- syntax: สำเนา `scripts/lib/risk.js` ใน index.html ต้องตรง (`orbLib(file,'risk','RISK')`)
- DESK แผงชั้นข้อมูล (ก่อน FWI): สวิตช์ `rk` → รอ ≤10 วิ ต้องมีแถว `#rk-tb tr[data-i]` และชั้น `rk-f` (ไม่มี = คำเตือน — โฟลเดอร์ repo ไม่มี risk.json; ใน CI ตรวจ _site) → แปลงสถานีฯ → พรุ่งนี้ → แตะแถวแรก → ตำบล → ปิด

## ตัวตรวจ XSS / CSP / ตัวเลข (E1/E2/C2, 16 พ.ย. 69)

- **`node scripts/lint_html.js [โฟลเดอร์|ไฟล์] [--all] [--json] [--update-base]`** (E2, <1 วิ): ตัวแบ่ง token อย่างง่าย (สตริง/คอมเมนต์/regex/template ซ้อน) หา `x.innerHTML=`/`+=`, `outerHTML=`, `insertAdjacentHTML(ตำแหน่ง, …)`, `.setHTML(…)` แล้วตรวจทุก `${…}` ในนิพจน์ด้านขวา (รวม template ใน `.map(…)`)
  · ปลอดภัย = `esc()` · ตัวเลข (nf/Number/Math/toFixed/toLocaleString/.length/เลขคณิต) · สตริงตรง · `a?b:c` (ตรวจ b,c) · `a&&b` (ตรวจ b) · `a||b` · `.map(cb).join()` ที่ cb เป็น template · ชื่อตัวพิมพ์ใหญ่ (SATN[k]) · `/*xss-ok*/` ใน `${…}`
  · **ratchet**: `scripts/lint_html_base.json` = 322 จุดที่ตรวจด้วยตาแล้ว (ค่าจากโค้ด/ตัวเลข/HTML ที่แอปสร้างเอง) คีย์ `app|manual` + sink + นิพจน์ (ไม่มีเลขบรรทัด) · เตือนเฉพาะจุดใหม่ · ตรวจจุดใหม่แล้วว่าเป็นค่าจากโค้ด → `--update-base` · ค่าภายนอก (API/ไฟล์ผู้ใช้/เซิร์ฟเวอร์) → ใส่ esc() ห้ามเพิ่มเข้ารายการ
  · ข้อจำกัด: ไม่ตามค่าข้ามตัวแปร — `h=(template); el.innerHTML=h` ตรวจแค่ว่า `h` เป็นตัวแปร (อยู่ในรายการแล้ว) ไม่ได้ตรวจ template ตอนสร้าง h · ฟังก์ชันที่คืน HTML (ftBox, fwHtml …) นับเป็นตัวสร้างของแอป
  · ตรวจด้วยตารอบแรกพบค่าภายนอกไม่ผ่าน esc 5 แห่ง → แก้แล้ว: ป๊อปอัปสถานี Air4Thai (`st.name/area/src`), ชื่อดาวเทียมจาก API ในแถบแหล่งข้อมูล (`f.sats`), `data-tmon` สถานีกรมอุตุฯ, `data-i` ชั้นเซิร์ฟเวอร์, ข้อความ `fail()` ตอนโหลดไม่สำเร็จ
- **`node scripts/verify_numbers.js [โฟลเดอร์=_site] [--ci] [--all]`** (C2, ~1 วิ) → [pipelines.md](pipelines.md)
- **check_site เพิ่ม** (16 พ.ย. 69)
  · ขั้น syntax: `lint_html` จุดใหม่ = คำเตือน (≤10 แถว) + `res.lint {all,new}` ใน check.json — ไม่ทำให้ไม่ผ่าน
  · เซิร์ฟเวอร์ในสคริปต์ส่ง header `Content-Security-Policy-Report-Only` ให้ .html (เหมือน serve.js)
  · DESK "ชั้นข้อมูลของฉัน" → **นำเข้า KML ทดสอบ XSS** (`XSS`): ชื่อไฟล์/ชื่อชั้น/ชื่อวัตถุ/คำอธิบาย (CDATA)/ExtendedData/SimpleData = `<img src=x onerror=alert(1)>` ผ่าน `ulImport` → `GIO.load` → รายการชั้น + `ulPop` · ต้อง: alert ไม่ถูกเรียก (แทน window.alert ด้วยตัวนับ), ไม่มี `img[src="x"]`, ข้อความอยู่ใน textContent ของป๊อปอัปและรายการ → `info.xss` แล้วลบชั้นทดสอบ
  · ท้ายรอบเดสก์ท็อป/มือถือ: **CSP probe** โหลดภาพจาก `https://csp-probe.invalid` → ต้องได้ violation `disposition: report` ใน `window.__CSPV` (= header ทำงานและไม่บล็อก) ไม่ได้ = error · violation อื่น = คำเตือน "ถ้าบังคับใช้จะบล็อก …" → `info.csp`
- **ไฟล์เทสต์เพิ่ม**
  | ไฟล์ | ทดสอบ |
  |---|---|
  | `lint.test.js` | E2 `safeExpr` ปลอดภัย/ไม่ปลอดภัย · `lint` จับ 4 sink + template ซ้อน ข้ามสตริง/คอมเมนต์/regex/JSON · ratchet นับซ้ำ · index.html+คู่มือไม่มีจุดใหม่ และจุดที่แก้ใช้ esc() |
  | `csp.test.js` | E1 ทุก `<script>`/`<link>` ภายนอก (index+คู่มือ) มี sha384+crossorigin, ตัวโหลด xlsx/proj4 ตั้ง integrity, MapLibre 4.7.1 · E2 นโยบายครอบทุกโดเมนใน index.html (grep) + EXTRA, Report-Only เท่านั้น, ไม่มี meta CSP บังคับ · sw.js ใน vm ใส่ header ให้ navigate (ฉบับเผยแพร่) / ไม่ใส่ (dev) / ไม่ทับ header เดิม |
  | `numbers.test.js` | C2 เวลาจำลอง 20 เม.ย. 2569 (adata ทุกพื้นที่) และวันหลัง adata.to + live.json สังเคราะห์ 5 จุด (มีดงใหญ่) → หน้าเว็บ = summary = LINE = Telegram · แก้ summary +1 จุด → ok:false ชี้พื้นที่ (~3 วิ เพราะเรียก telegram_notify --preview) |
