# การตรวจงาน

> ย้ายมาจาก CLAUDE.md เดิม (15 พ.ย. 69) โดยไม่ตัดข้อเท็จจริง — ดัชนีอยู่ที่ [CLAUDE.md](../../CLAUDE.md)

## การตรวจงาน

- **`node scripts/check_site.js [โฟลเดอร์]`** (ผู้ใช้ขอ 11 พ.ย. 69, ~80 วิ): syntax ทุก `<script>` (vm.Script บอกบรรทัดจริงใน index.html, JSON.parse บล็อกข้อมูล, + manual/index.html) แล้วเปิดใน Chrome headless 1440 + 390 กดปุ่มหลัก (`DESK`/`MOB`: สถิติ+แท็บดับไฟ+ตาราง, จปร., เล่นย้อน, ตารางจุด, แผงชั้นข้อมูล, ข้อมูลพื้นฐาน, วัด, ชั้นของฉัน, ภูมิประเทศ, พิมพ์แผนที่, ปุ่มเครื่องมือมือถือ) นับ Runtime.exceptionThrown — error เครือข่าย/โดเมนภายนอก (`NET`) ไม่นับ
  · ไม่พบปุ่ม/แผนที่โหลดไม่เสร็จ = คำเตือน
  · exit 0/1/2 (2 = เปิด Chrome ไม่ได้)
  · **รันก่อน commit ทุกครั้งที่แก้ index.html**
  · ทดสอบแล้วจับได้: syntax ผิด, `//` กลืนโค้ดแล้วตัวแปรหาย (error ตอนกดปุ่ม), `let` ชื่อซ้ำข้ามบล็อก
  · ถ้าเพิ่มปุ่ม/แผงใหม่ ให้เพิ่มขั้นใน DESK/MOB
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
  | `summary.test.js` | `fwiSummary`/`vrSummary`/`camsSummary` กับ `fixtures/{fwi,gfs_vr,cams_grid}.json` (สังเคราะห์ ค่าเท่ากันทั้งพื้นที่ — ค่าที่ถูกคิดด้วยมือในหมายเหตุ) + เกณฑ์ระดับ VR/PM2.5 |
  | `xlsx.test.js` | `unzip`/`readXlsx` กับ xlsx ที่สร้างในเทสต์ (เก็บตรง+บีบอัด, shared/inline string, ตัวเลข/วันที่/ตรรกะ/สูตร/error, คอลัมน์ AA, แถวที่ข้าม) |
  | `tiff.test.js` | `llToUTM` เทียบสูตร Krüger อิสระ (<1 ซม.), แปลงกลับไปกลับมา, `readTiff` 8 บิต/16 บิตมีเครื่องหมาย+Deflate+predictor, EPSG/พิกเซล/มุม |
  | `fiscal.test.js` | ฟังก์ชันในหน้าเว็บ (ดึงจาก index.html): `fy0` `fyOfDay` (รอยต่อ 1 ต.ค.) `thDay` (เปลี่ยนวัน 17:00 UTC) `IND_SW`/`indSat` (2 พ.ย. 69) `fuOK` (+ dictionary จริงใน hdata) `dyAS` |
- **ตรวจรับเมื่อสร้าง**: แก้เกณฑ์ใน dedup.js ให้ผิด 4 แบบ (TW 250→50, RATIO 0.6→0.05, PAIR 450→100, DT 3→0) → เทสต์ล้ม 4–7 ข้อทุกแบบ (ไม่ใช่แค่ข้อตรวจค่าเกณฑ์)
- **วิธีเพิ่มเทสต์**
  1. สร้าง `test/<เรื่อง>.test.js` (CommonJS): `const test = require('node:test'), assert = require('node:assert/strict')` แล้ว `test('ชื่อภาษาไทยบอกสิ่งที่คาด', () => { … })` — ไม่ต้องแก้ index.js
  2. ฟังก์ชันใน `index.html`: `const { grab, load } = require('./helpers.cjs')` → `grab(/regex ของโค้ด/)` (ไม่เจอ = เทสต์ล้มพร้อมบอก regex) แล้ว `load(src, ['ชื่อ'], { ตัวแปรที่โค้ดอ้างถึง })` · เวลาปัจจุบันจำลองด้วย class ที่ extends Date แล้วแทน `now()` (ดู fiscal.test.js)
  3. ไฟล์ตัวอย่างเก็บใน `test/fixtures/` ให้เล็ก (≤10 KB) และ**ห้ามอ่านไฟล์ใน data/ ที่ sync เปลี่ยนทุกวัน** (เทสต์ต้องให้ผลเดิมทุกรอบ) — อ่านบล็อกใน index.html ได้เฉพาะที่ไม่เปลี่ยนตาม sync (`geo`, dictionary ของ `hdata`) และอ่านอย่างเดียว
  4. ห้ามต่อเน็ตในเทสต์ (จำลอง `global.fetch` แบบ state.test.js) · ใช้ `rng(seed)` จาก helpers.cjs แทน Math.random
  5. แก้เกณฑ์/ตรรกะโดยตั้งใจ → แก้ค่าที่คาดในเทสต์ด้วย และบอกเหตุผลในหมายเหตุ
