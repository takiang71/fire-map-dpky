# คู่มือติดตั้ง LINE bot แจ้งเตือนจุดความร้อน

บอทนี้แจ้งเตือนเข้ากลุ่ม LINE เมื่อพบจุดความร้อนใหม่ใน 6 พื้นที่อนุรักษ์ของกลุ่มป่า **ไม่รวม ขสป.ดงใหญ่** และตอบเมื่อมีคนพิมพ์ "สรุป" ในกลุ่ม

ข้อความเป็น **Flex Message แบบการ์ดสไลด์ 7 ใบ**

- **ใบที่ 1 ภาพรวมทั้งปี:**
  - หัวการ์ด: สบอ.1 (ปราจีนบุรี) + วันที่และเวลา
  - สะสมปีงบ พร้อม % เทียบปีก่อนช่วงเดียวกัน
  - ไทล์: จุดใน 24 ชม. / ทั้งปีงบก่อน / ดาวเทียมตัวชี้วัด
  - ไทล์: จังหวัด / อำเภอ / ตำบลที่พบจุดสูงสุด
  - ตารางรายพื้นที่: ปีนี้ / ปีก่อน / ▲▼%
  - กราฟแท่งรายเดือนสองปี
- **ใบที่ 2–7 แยกรายพื้นที่:** อช.เขาใหญ่ · อช.ทับลาน · อช.ปางสีดา · อช.ตาพระยา · ขห.เขาฉกรรจ์ · ขห.โคกสูง
  - ตัวเลข 24 ชม. / สะสม / ปีก่อน
  - กราฟแท่งรายเดือน
  - รายการจุด แตะแล้วเปิด Google Maps
  - ตอนแจ้งเตือน พื้นที่ที่มีจุดใหม่จะขึ้นก่อน

ขนาดข้อความ: LINE จำกัด carousel ไม่เกิน 50 KB ถ้าข้อความใหญ่เกิน 48,000 ไบต์ บอทจะลดจำนวนจุดที่แสดงต่อการ์ดเอง (ปกติ 4 จุด กรณีทุกพื้นที่มีจุดพร้อมกัน 2 จุด)

## ภาพรวม

| ส่วน | อยู่ที่ไหน | ทำอะไร |
|---|---|---|
| แจ้งเตือนอัตโนมัติ (push) | GitHub Actions workflow `site` → `scripts/line_notify.js` | ทุกรอบที่สร้างเว็บ: ถ้ามีจุดใหม่ในแนวเขต (สแกนไม่เกิน 12 ชม.) จะส่งเข้ากลุ่ม 1 ข้อความรวมทุกจุด |
| ตอบคำสั่ง (reply) | Cloudflare Worker `worker/line-webhook.mjs` (มีตัวสร้างการ์ด `carousel()` ที่ Actions ใช้ร่วม) | "สรุป" / "ช่วยเหลือ" / "รหัสกลุ่ม" |
| สถานะ | `https://takiang71.github.io/fire-map-dpky/notify.json` | จุดที่แจ้งไปแล้ว + บันทึก 50 รอบล่าสุด (ดูว่าส่งหรือข้ามเพราะอะไร) |

**โควตา:** แผนฟรีของ LINE OA ส่งได้ราว 300 ข้อความ/เดือน และ push เข้ากลุ่มนับตามจำนวนสมาชิก (กลุ่ม 20 คน = 20 ข้อความ/ครั้ง ≈ 15 ครั้ง/เดือน)
สคริปต์ตรวจโควตาที่เหลือก่อนส่งทุกครั้ง ถ้าไม่พอจะไม่ส่ง และส่งไม่เกิน 4 ครั้ง/วัน ส่วนการตอบ "สรุป" ไม่นับโควตา ใช้ได้ตลอด

---

## 1. สร้าง LINE Official Account + เปิด Messaging API

1. เข้า https://manager.line.biz → สร้างบัญชี LINE Official Account (ฟรี) เช่นชื่อ "ไฟป่า ดงพญาเย็น-เขาใหญ่"
2. ในบัญชีนั้น: **ตั้งค่า → Messaging API → เปิดใช้งาน Messaging API** (เลือก/สร้าง Provider)
3. **ตั้งค่า → การตอบกลับ**
   - แชท: **ปิด**
   - ข้อความตอบกลับอัตโนมัติ: **ปิด**
   - ข้อความทักทาย: ปิด (ไม่บังคับ)
   - Webhook: **เปิด**
4. **ตั้งค่า → บัญชี → อนุญาตให้บัญชีเข้าร่วมกลุ่มแชท: เปิด**
5. เข้า https://developers.line.biz/console → เลือก Channel ของบัญชีนี้ แล้วจดค่า 2 ค่า
   - แท็บ **Basic settings** → **Channel secret**
   - แท็บ **Messaging API** → **Channel access token (long-lived)** → กด Issue

## 2. สร้าง Cloudflare Worker (ฟรี)

1. สมัคร/เข้า https://dash.cloudflare.com → **Workers & Pages → Create → Create Worker** → ตั้งชื่อ เช่น `fire-line` → Deploy
2. กด **Edit code** → ลบโค้ดเดิม แล้ววางเนื้อหาไฟล์ `worker/line-webhook.mjs` ทั้งไฟล์ → **Deploy**
3. **Settings → Variables and Secrets → Add** (เลือกชนิด **Secret**)
   - `LINE_SECRET` = Channel secret
   - `LINE_TOKEN` = Channel access token
4. จด URL ของ Worker เช่น `https://fire-line.<ชื่อบัญชี>.workers.dev`
   - เปิดในเบราว์เซอร์ต้องขึ้นว่า "LINE webhook: … ทำงานอยู่"

## 3. ผูก webhook

LINE Developers console → แท็บ **Messaging API**

1. ใส่ URL ของ Worker ใน **Webhook URL** → กด **Verify** (ต้องขึ้น Success)
2. เปิด **Use webhook**

## 4. เชิญบอทเข้ากลุ่ม

1. เพิ่มบอทเป็นเพื่อน (สแกน QR ในแท็บ Messaging API) แล้วเชิญเข้ากลุ่ม
2. บอทจะตอบข้อความต้อนรับพร้อม **รหัสกลุ่ม** (ขึ้นต้นด้วย `C…`)
   - ถ้าไม่ขึ้น ให้พิมพ์ `รหัสกลุ่ม` ในกลุ่ม
3. ลองพิมพ์ `สรุป` → บอทต้องตอบสรุปจุดความร้อน

## 5. ตั้งค่า GitHub ให้ส่งแจ้งเตือน

repo `takiang71/fire-map-dpky` → **Settings → Secrets and variables → Actions**

- แท็บ **Secrets → New repository secret:** `LINE_TOKEN` = Channel access token
- แท็บ **Variables → New repository variable:**
  - `LINE_GROUP_ID` = รหัสกลุ่มจากข้อ 4
  - (ไม่บังคับ) `LINE_MAX_DAY` = จำนวนครั้งสูงสุดต่อวัน (ค่าเริ่มต้น 4)
  - (ไม่บังคับ) `LINE_RESERVE` = จำนวนข้อความที่เก็บไว้ไม่ใช้
  - (ไม่บังคับ) `LINE_DAILY` = เวลาส่งสรุปประจำวันเข้ากลุ่ม (เวลาไทย HH:MM, ค่าเริ่มต้น 07:30 · `off` = ปิด) — วันละ 1 ข้อความ × จำนวนสมาชิก

จากนั้นแจ้งเตือนจะเริ่มทำงานในรอบถัดไปของ workflow `site`

(ไม่บังคับ) ตรวจรูปแบบการ์ดกับ LINE โดยไม่ส่งจริงและไม่เสียโควตา

```bash
node scripts/build_site.js
```

แล้วรันคำสั่งนี้ (ใส่ token ของคุณแทน `<token>`)

```bash
LINE_TOKEN=<token> node scripts/line_notify.js --validate
```

## 6. (แนะนำมาก) ให้ workflow รันทุก 10 นาทีจริง

ตัวตั้งเวลาของ GitHub เองรันจริงแค่ทุก 2–5 ชม. แจ้งเตือนจึงจะช้าตามไปด้วย แก้โดยให้ cron-job.org (ฟรี) สั่งรันแทน

1. **สร้าง token ของ GitHub:** https://github.com/settings/personal-access-tokens/new (Fine-grained)
   - Repository access: **Only select repositories** → `fire-map-dpky`
   - Permissions → Repository → **Actions: Read and write**
   - กดสร้าง แล้วคัดลอก token ไว้
2. **สมัคร https://cron-job.org → Create cronjob**
   - URL: `https://api.github.com/repos/takiang71/fire-map-dpky/actions/workflows/site.yml/dispatches`
   - Schedule: ทุก 10 นาที
   - แท็บ Advanced:
     - Request method: **POST**
     - Request body: `{"ref":"main"}`
     - Headers:
       - `Authorization: Bearer <token>`
       - `Accept: application/vnd.github+json`
       - `X-GitHub-Api-Version: 2022-11-28`
       - `User-Agent: cron-job`
3. **กด Test run** ต้องได้ HTTP **204** และหน้า Actions ของ repo มีรอบ `site` ใหม่

ผลพลอยได้: ไฟล์ `live.json` บนเว็บจะสดขึ้น หน้าเว็บจึงไม่ต้องดึง API ตรงบ่อย

## 7. (แนะนำ) ให้ sync เก็บข้อมูลตรงเวลา

workflow `sync` (เก็บจุดความร้อนสะสม + พื้นที่เผาไหม้ + แหล่งเชื้อเพลิง) ตั้งไว้วันละ 4 รอบ แต่ GitHub รันจริงแค่วันละ 1–2 รอบและช้าหลายชั่วโมง
(เช่น รอบ 06:17 น. ของ 29 ต.ค. 69 รันจริง 09:28 น., 30 ต.ค. 69 ถึง ~07:00 น. ยังไม่รัน) แก้แบบเดียวกับข้อ 6:

### 7.1 ทดสอบด้วยมือก่อน (บน GitHub)

1. เปิด https://github.com/takiang71/fire-map-dpky/actions/workflows/sync.yml
2. ทางขวามีแถบสีฟ้าเขียนว่า "This workflow has a workflow_dispatch event trigger" → กดปุ่ม **Run workflow** (ปุ่มเล็กมีลูกศรลง)
3. กล่องเล็กเด้งขึ้นมา ช่อง "Use workflow from" ให้เป็น **Branch: main** → กดปุ่มเขียว **Run workflow** ในกล่อง
4. รอ 2–3 วินาที แล้วกดรีเฟรชหน้า จะมีแถวใหม่ "sync" ขึ้นบนสุด (วงกลมเหลืองหมุน = กำลังรัน)
5. รอจนเป็น ✓ สีเขียว (ปกติ 30 วินาที – 2 นาที) แล้วคลิกที่แถวนั้น → คลิกกล่อง **sync** ทางซ้าย
6. คลิกขั้น **Run node scripts/sync_fuel.js** เพื่อกางดูข้อความ ควรเห็น
   `ตามรอยเผา SAVI: 1 เดือน · เก็บ 1 · ต้องประมวลผล 0` (= ทำงานได้ ไม่มีเดือนใหม่)
   และขั้น **Run node scripts/sync_burn.js** ควรเห็น `ตามรอยเผา b4: … รอบ · ต้องประมวลผล 0 รอบ` (หรือมีรอบใหม่ก็ได้)
   - ถ้าขั้นไหนมีไอคอนสีส้ม/แดง ให้คัดลอกข้อความในขั้นนั้นมาให้ดู

### 7.2 ตั้ง cron-job.org ให้สั่งรันตามเวลา

**ก. หา token เดิม** (ไม่ต้องสร้างใหม่ — token ของข้อ 6 ใช้ได้กับทุก workflow ใน repo นี้)
1. เข้า https://console.cron-job.org → เมนู **Cronjobs**
2. คลิกงานเดิม **fire-map site** → แท็บ **ADVANCED**
3. ในส่วน Headers แถว `Authorization` คัดลอกค่าทั้งหมด (ขึ้นต้นด้วย `Bearer github_pat_…`) เก็บไว้ก่อน
4. กดออกโดย **ไม่ต้องกด Save** (ไม่ได้แก้อะไร)

**ข. สร้างงานใหม่**
1. หน้า Cronjobs กดปุ่ม **CREATE CRONJOB**
2. แท็บ **COMMON**
   - **Title:** `fire-map sync`
   - **URL:** `https://api.github.com/repos/takiang71/fire-map-dpky/actions/workflows/sync.yml/dispatches`
     (ต่างจากงานเดิมแค่ `site.yml` → `sync.yml`)
   - **Enable job:** เปิด
   - **Execution schedule:** เลือก **Custom**
     - Days of month: **Every day of month** (ทุกวัน) · Days of week: **Every day of week** · Months: **Every month**
     - Hours: เลือก **6, 9, 15, 18** (กด Ctrl ค้างแล้วคลิกทีละตัว)
     - Minutes: เลือก **17** ตัวเดียว
     - ด้านล่างจะแสดงเวลารันครั้งถัดไป ให้ตรวจว่าเป็น 06:17 / 09:17 / 15:17 / 18:17
3. แท็บ **ADVANCED**
   - **Time zone:** `Asia/Bangkok` (ถ้าไม่มีช่องนี้ ให้ตั้งที่เมนู Settings ของบัญชี · หรือถ้าต้องใช้ UTC ให้เลือก Hours = **23, 2, 8, 11** แทน)
   - **Request method:** `POST`
   - **Request body:** `{"ref":"main"}`
   - **Headers:** กด **ADD** ทีละแถว 4 แถว (Key / Value)
     | Key | Value |
     |---|---|
     | `Authorization` | ค่าที่คัดลอกจากข้อ ก. (`Bearer github_pat_…`) |
     | `Accept` | `application/vnd.github+json` |
     | `X-GitHub-Api-Version` | `2022-11-28` |
     | `User-Agent` | `cron-job` |
   - **Treat redirects with HTTP 3xx as success:** ไม่ต้องเปิด
4. (ถ้าอยากได้อีเมลเมื่อพลาด) แท็บ **NOTIFICATIONS** เปิด "Notify me when execution fails"
5. กดปุ่ม **TEST RUN** ด้านล่าง → กด **START TEST RUN**
   - ต้องได้ **Status 204 No Content** = สั่งรันสำเร็จ (ไปดูหน้า Actions จะมีรอบ `sync` ใหม่ ประเภท "Manually run by takiang71")
   - ได้ **401** = token ผิด/หมดอายุ · **404** = URL ผิด หรือ token ไม่มีสิทธิ์ repo นี้ · **422** = body ผิด (ต้องเป็น `{"ref":"main"}` เป๊ะ)
6. กด **CREATE** (หรือ SAVE) บันทึกงาน

**ค. ตรวจหลังตั้ง**
- หน้า Cronjobs จะมี 2 งาน: `fire-map site` (ทุก 10 นาที) และ `fire-map sync` (วันละ 4 ครั้ง)
- วันถัดไปเปิดงาน `fire-map sync` → **HISTORY** ควรมี 204 ทุกรอบ และหน้า Actions ของ sync มีรอบตามเวลา
- หน้า Actions อาจมีรอบที่ GitHub รันเองตามตาราง (Scheduled) ปนอยู่ด้วย เป็นเรื่องปกติ ถ้ารันซ้อนกันจะต่อคิว ไม่ชนกัน และไม่ทำให้ข้อมูลซ้ำ
- งานรันนานได้ถึง ~45 นาทีเฉพาะตอนที่ระบบตามรอยเผาออกข้อมูลเชื้อเพลิงเดือนใหม่ (ไฟล์ใหญ่ ต้นทางช้า) รอบปกติไม่ถึง 2 นาที

## 8. การ์ดพื้นที่เผาไหม้ (เพิ่ม 30 ต.ค. 69)

- **ส่งเองอัตโนมัติ** ไม่ต้องตั้งอะไรเพิ่ม: เมื่อระบบตามรอยเผาออกข้อมูลราย 7 วันรอบใหม่ (ปกติสัปดาห์ละครั้ง ช้ากว่าสิ้นรอบ ~9 วัน) และรอบนั้นมีรอยเผาในพื้นที่ ≥ 1 ไร่
  workflow `site` จะ push การ์ด "🔥 พื้นที่เผาไหม้ รอบ …" 1 ใบเข้ากลุ่ม (ไร่ที่เผา · % ที่มีจุดความร้อนใกล้ · ไร่ที่ไม่พบจุดความร้อน · สะสมปีงบ · รายพื้นที่อนุรักษ์)
  - ใช้โควตาเท่ากับแจ้งเตือน 1 ครั้ง (= จำนวนสมาชิก) ประมาณสัปดาห์ละครั้งช่วงฤดูไฟ · รอบที่ไม่มีรอยเผาจะไม่ส่ง
  - ปิดได้ด้วย GitHub Variable `LINE_BURN` = `off`
- **คำสั่ง "เผาไหม้" ในกลุ่ม** (ตอบกลับฟรี ไม่นับโควตา) ต้องอัปเดตโค้ด Worker ก่อน:
  Cloudflare → Workers & Pages → `fire-line` → **Edit code** → ลบโค้ดเดิม วางเนื้อหา `worker/line-webhook.mjs` ฉบับใหม่ทั้งไฟล์ → **Deploy** (Secret เดิมไม่หาย)
- ทดสอบส่งเข้ากลุ่มจริงหนึ่งครั้ง (เสียโควตา): ในเครื่องรัน `node scripts/build_site.js` แล้ว `LINE_TOKEN=… LINE_GROUP_ID=… node scripts/line_notify.js --burn`

## ตรวจปัญหา

- **บอทไม่ตอบ:** ใน Cloudflare เปิด Worker → **Logs** ตรวจว่า secret ถูกต้อง
  - ถ้าขึ้น 401 แปลว่า Channel secret ผิด
- **ไม่มีแจ้งเตือน:** เปิด `…/fire-map-dpky/notify.json` ดู `log` ว่าข้ามเพราะอะไร
  - เช่น "ยังไม่ตั้ง LINE_TOKEN", "โควตาไม่พอ", "ครบ 4 ครั้งของวันนี้แล้ว"
- **รอบแรกหลังติดตั้งไม่ส่ง:** เป็นปกติ รอบแรกจะบันทึกจุดที่มีอยู่ว่าแจ้งแล้ว (ไม่ส่งจุดเก่าทั้งชุด) รอบต่อไปจึงส่งเฉพาะจุดใหม่
- **ส่งไม่สำเร็จ / ข้ามรอบ:** จุดชุดนั้นถือว่าแจ้งแล้ว ไม่ส่งซ้ำ แต่ยังพิมพ์ "สรุป" ดูได้
