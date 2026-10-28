# คู่มือติดตั้ง LINE bot แจ้งเตือนจุดความร้อน

บอทนี้แจ้งเตือนเข้ากลุ่ม LINE เมื่อพบจุดความร้อนใหม่ในแนวเขตกลุ่มป่า และตอบเมื่อมีคนพิมพ์ "สรุป" ในกลุ่ม

## ภาพรวม

| ส่วน | อยู่ที่ไหน | ทำอะไร |
|---|---|---|
| แจ้งเตือนอัตโนมัติ (push) | GitHub Actions workflow `site` → `scripts/line_notify.js` | ทุกรอบที่สร้างเว็บ: ถ้ามีจุดใหม่ในแนวเขต (สแกนไม่เกิน 12 ชม.) จะส่งเข้ากลุ่ม 1 ข้อความรวมทุกจุด |
| ตอบคำสั่ง (reply) | Cloudflare Worker `worker/line-webhook.js` | "สรุป" / "ช่วยเหลือ" / "รหัสกลุ่ม" |
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
2. กด **Edit code** → ลบโค้ดเดิม แล้ววางเนื้อหาไฟล์ `worker/line-webhook.js` ทั้งไฟล์ → **Deploy**
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

จากนั้นแจ้งเตือนจะเริ่มทำงานในรอบถัดไปของ workflow `site`

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

## ตรวจปัญหา

- **บอทไม่ตอบ:** ใน Cloudflare เปิด Worker → **Logs** ตรวจว่า secret ถูกต้อง
  - ถ้าขึ้น 401 แปลว่า Channel secret ผิด
- **ไม่มีแจ้งเตือน:** เปิด `…/fire-map-dpky/notify.json` ดู `log` ว่าข้ามเพราะอะไร
  - เช่น "ยังไม่ตั้ง LINE_TOKEN", "โควตาไม่พอ", "ครบ 4 ครั้งของวันนี้แล้ว"
- **รอบแรกหลังติดตั้งไม่ส่ง:** เป็นปกติ รอบแรกจะบันทึกจุดที่มีอยู่ว่าแจ้งแล้ว (ไม่ส่งจุดเก่าทั้งชุด) รอบต่อไปจึงส่งเฉพาะจุดใหม่
- **ส่งไม่สำเร็จ / ข้ามรอบ:** จุดชุดนั้นถือว่าแจ้งแล้ว ไม่ส่งซ้ำ แต่ยังพิมพ์ "สรุป" ดูได้
