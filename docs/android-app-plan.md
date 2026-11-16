# แผนทำแอป Android จากแผนที่สถานการณ์ไฟป่า (ร่าง 15 พ.ย. 2569)

> เอกสารนี้เขียนให้ **ใช้สั่งงาน AI โมเดลอื่นต่อได้ทันที** — แต่ละเฟสมีเป้าหมาย ไฟล์ที่ต้องแตะ คำสั่ง และเกณฑ์ "เสร็จ" ชัดเจน
> โจทย์จากผู้ใช้: ทำเว็บนี้เป็นแอปลงโทรศัพท์ Android โดย**ข้อมูลหลักอยู่ในแอปให้มากที่สุด** และ**ใช้ออนไลน์เฉพาะส่วนที่สำคัญ**
> ยังไม่ได้ลงมือทำอะไรในโค้ด — เป็นแผน + ผลสำรวจโค้ดจริงของ `index.html`/`scripts/` ณ วันที่เขียน

---

## 0. ข้อสรุปและแนวทางที่แนะนำ

**แนะนำ: Capacitor (WebView แบบห่อ) + ฝัง `_site/` ทั้งก้อนไว้ใน APK + แผนที่ฐานออฟไลน์แบบ PMTiles + ชั้นอัปเดตข้อมูลผ่าน GitHub Pages**

เหตุผล: โค้ดเดิมเป็นไฟล์เดียว (`index.html` 2.38 MB, MapLibre GL JS) ทำงานใน WebView ได้แทบไม่ต้องเขียนใหม่ · ข้อมูลย้อนหลังทั้งหมด (hdata/adata/wdata/fxdata/geo + `data/*`) ฝังไว้ในแอปได้ ~22 MB · ส่วนที่ต้องออนไลน์มีแค่ "จุดสด 48 ชม. + อากาศ/เรดาร์/ดาวเทียม + อัปเดตข้อมูลรายวัน" ซึ่งเป็นส่วนสำคัญที่ยอมรับได้อยู่แล้ว

| ทางเลือก | ข้อมูลอยู่ในแอป | ออฟไลน์ได้ | แรงงาน | หมายเหตุ |
|---|---|---|---|---|
| **A. Capacitor (แนะนำ)** | ✅ ทั้ง `_site/` ฝังใน APK | ✅ แผนที่ฐาน + ข้อมูลย้อนหลังทั้งหมด | ปานกลาง (AI ทำได้ใน 1–2 สัปดาห์) | ใช้โค้ดเดิม เพิ่มปลั๊กอินเท่าที่จำเป็น ติดตั้งได้ทั้ง APK และ Play Store |
| B. PWA + TWA (Bubblewrap/PWABuilder) | ❌ มาจากเว็บ แคชด้วย service worker | บางส่วน (แคชจำกัด Android ล้างได้) | น้อย | ต้องมีเน็ตครั้งแรกเสมอ ไม่ตรงโจทย์ "ข้อมูลอยู่ในแอป" |
| C. เขียนใหม่ Kotlin + MapLibre Android SDK | ✅ | ✅ | มากมาก (เขียนใหม่ ~6,700 บรรทัด) | ไม่คุ้ม ฟีเจอร์เยอะเกินไป |

---

> **16 พ.ย. 69**: ทำ PWA (D1 ของรายงานตรวจ) แล้ว — manifest + sw.js + แคชออฟไลน์ + ปุ่มเก็บไทล์ OpenFreeMap ≤300 แผ่น (docs/arch/ui-modules.md "PWA / ออฟไลน์") = ทางเลือก B บางส่วน ใช้ได้ทันทีโดยติดตั้งจากเบราว์เซอร์ · แผนนี้ (Capacitor + PMTiles) ยังไม่เริ่ม และไม่ซ้ำกับ PWA: แอปใช้ prefix `AP` · PWA ใช้ `pwa` · ถ้าทำแอปให้ปิดการลงทะเบียน sw.js ใน WebView (Capacitor เสิร์ฟจากเครื่องอยู่แล้ว)

## 1. ผลสำรวจ: แอปพึ่งพาอะไรออนไลน์บ้าง (ตรวจจาก `index.html` จริง 15 พ.ย. 69)

### 1.1 ฝังในแอปได้ทั้งหมด (ออฟไลน์ 100%) — ชั้นที่ 1 "ข้อมูลหลัก"

| สิ่งที่ฝัง | ขนาด | ที่มา |
|---|---|---|
| `index.html` (โค้ด + บล็อก `geo` `hdata` `adata` `wdata` `wadata` `fxdata`) | 2.4 MB | ผลของ `build_site.js` |
| `manual/` คู่มือ + ภาพ | 7.3 MB | เดิม |
| `data/burn/` (พื้นที่เผาไหม้ B4/C/G + index) | 5 MB | `sync_burn.js` |
| `data/fwi/` (FWI + ตาราง `g/` จาก branch fwi-grid) | ~4 MB | `sync_fwi.js` / `fwi_local.js` |
| `data/fuel/` `data/tour/` `data/ftype/ftype.json` `admin.json` `prov.json` `ranger.json` `fbase.json` `tourism.json` `tle.json` `gfs_vr.json` `cams_grid.json` | ~6 MB | build_site คัดลอกให้อยู่แล้ว (บรรทัด 193–208) |
| ไลบรารีที่ตอนนี้ดึงจาก CDN: `maplibre-gl 4.7.1` (js+css), `xlsx 0.18.5`, `proj4 2.11.0`, ฟอนต์ Noto Sans Thai (Google Fonts) | ~2 MB | **ต้องดาวน์โหลดมาเก็บในแอป** (เฟส 1) |
| **แผนที่ฐานออฟไลน์** (ยังไม่มี) — PMTiles เวกเตอร์กรอบกลุ่มป่า + glyphs ไทย | ประมาณ 20–60 MB แล้วแต่ zoom สูงสุด | สร้างใหม่ (เฟส 2) |

รวม APK ประมาณ **50–90 MB** (ต้องวัดจริงหลังทำเฟส 2)

### 1.2 ควรอัปเดตผ่านออนไลน์เมื่อมีเน็ต แล้วเก็บไว้ใช้ตอนออฟไลน์ — ชั้นที่ 2 "ข้อมูลสำคัญที่เปลี่ยนบ่อย"

ทั้งหมดอยู่บน `https://takiang71.github.io/fire-map-dpky/` (GitHub Pages เปิด CORS ให้ทุกที่ ดึงจากแอปได้ตรง)

| ไฟล์ | เปลี่ยนบ่อยแค่ไหน | ใช้ทำอะไร |
|---|---|---|
| `live.json` | ทุก ~5 นาที (site.yml) | จุดความร้อนสด 48 ชม. — **สำคัญที่สุด** |
| `watch.json` | ทุก 5 นาที | พื้นที่เฝ้าระวังพิเศษ |
| `air4thai.json` | ทุกรอบ site | สถานีฝุ่น Air4Thai (ต้นทางไม่เปิด CORS จึงต้องผ่าน Pages) |
| `data/fwi/index.json` + `data/fwi/g/*.json` | วันละครั้ง | FWI รายวัน |
| `data/gfs_vr.json` `data/cams_grid.json` | ตาม wx.yml | VR, PM2.5 |
| `data/burn/index.json` + ชุดใหม่ | สัปดาห์ละครั้ง | พื้นที่เผาไหม้รอบใหม่ |
| `data/tle.json` | ทุกวัน | วงโคจรดาวเทียมรอบถัดไป |
| **ทั้งก้อน `_site/` (OTA bundle)** | วันละครั้งพอ | อัปเดต hdata/adata (ฐานข้อมูลสะสมที่ฝังใน index.html) + ทุกอย่างข้างบน โดยไม่ต้องออก APK ใหม่ |

### 1.3 ออนไลน์อย่างเดียว (ยอมให้ไม่มีตอนออฟไลน์) — ชั้นที่ 3

- แผนที่ฐานออนไลน์: OpenFreeMap (style + fonts), Esri World Topo / World Imagery / Wayback, DEM `elevation-tiles-prod` (AWS), NASA GIBS, EOX — **ห้ามแคช Esri ลงเครื่องตามเงื่อนไขการใช้ของ Esri** → ออฟไลน์ใช้ PMTiles ของเราแทน
- API สด: ThaiREN `wildlandfire.thairen.net.th/.../api/alerts` (fallback เมื่อ `live.json` เก่ากว่า 40 นาที = `LIVE_MAXAGE`), open-meteo (อากาศ/PM2.5 รายจุด), api-bdc (reverse geocode), RainViewer (เรดาร์), JMA Himawari, กรมอุตุฯ `wxmap.tmd.go.th/api/`, Windy (iframe `#wy-f`), Cloudflare Worker `fire-layers` (`UL_API` หลังบ้านชั้นข้อมูล)
- ลิงก์ภายนอก: Google Maps (21 จุด), แชร์ LINE/Telegram/Facebook, `target="_blank"` 30 จุด

### 1.4 โค้ดที่ WebView ของ Android ไม่รองรับตรงๆ (ต้องแก้ในเฟส 4)

| สิ่งที่ใช้ | จำนวนจุดใน index.html | ปัญหาบน WebView | ทางแก้ |
|---|---|---|---|
| `<a download>` / `.download=` (CSV, GeoJSON, KML/GPX, PNG) | 7 | WebView ไม่ดาวน์โหลด blob | เขียนไฟล์ด้วย `@capacitor/filesystem` แล้วเปิดแผ่นแชร์ `@capacitor/share` |
| `window.print()` (พิมพ์แผนที่/รายงาน) | 6 | ไม่มี print dialog | ปลั๊กอินเล็กเขียนเอง (Kotlin ~30 บรรทัด) เรียก `PrintManager` + `webView.createPrintDocumentAdapter` หรือส่งออกเป็นภาพแล้วแชร์ |
| `navigator.geolocation` | 3 | ต้องขอสิทธิ์ระดับแอป | `@capacitor/geolocation` + shim แทน `navigator.geolocation` |
| `navigator.share` | 2 | บางรุ่นใช้ได้ บางรุ่นไม่ | `@capacitor/share` |
| `localStorage` (ตั้งค่า/ชั้นที่เลือก) | 15 | ใช้ได้ คงอยู่ใน WebView | ไม่ต้องแก้ |
| ปุ่ม Back ของเครื่อง | — | ออกจากแอปทันที | `@capacitor/app` `backButton` → ปิดแผง/ป๊อปอัปก่อน |

### 1.5 สิ่งที่สำรวจแล้วและเป็นผลดี

- ค่าคงที่ `BN_BASE` (บรรทัด 2053) เลือก `data/burn/` แบบ relative เมื่อ `location.protocol` เป็น http/https — ใน Capacitor หน้าเว็บถูกเสิร์ฟที่ `https://localhost` จึง**ใช้ไฟล์ที่ฝังในแอปโดยอัตโนมัติ** (`ADM_URL` `PROV_URL` `FU_BASE` `FT_URL` `RG_URL` `FB_URL` `INC_URL` `GVR_URL` `FWU` `CM_URL` ล้วนต่อจาก `BN_BASE`) · `OB_URL` (บรรทัด 5790) ตรรกะเดียวกัน
- `LIVE_FILE='live.json'` relative + ตรรกะ fallback ไป API เมื่อเก่า — นำมาใช้กับแนวคิด "ออนไลน์ก่อน ถอยมาใช้สำเนาในเครื่อง" ได้เลย
- ไม่มี service worker / manifest เดิม (มีแค่ `theme-color`) → ไม่ชนกับอะไร
- prefix `AP` `AU` `OTA` `APK` ยังไม่ถูกใช้ใน index.html (ตรวจแล้ว 15 พ.ย. 69) → โมดูลแอปใช้ prefix **`AP`** (กติกาข้อ 6 ของ CLAUDE.md)
- กรอบแนวเขตกลุ่มป่า (จาก `data/geo.json`): **W 101.127 · S 13.649 · E 103.227 · N 14.612** → ใช้ตัด PMTiles (บวกกันชน ~0.2°)

---

## 2. สถาปัตยกรรมแอปที่จะได้

```
APK
├─ www/  (= _site/ ณ วันสร้าง APK + vendor/ ไลบรารี + basemap/ PMTiles + glyphs)
│   └─ index.html  (เพิ่มโมดูล AP ก่อน </body> ด้วย lastIndexOf — กติกาข้อ 4)
├─ Capacitor plugins: filesystem, share, geolocation, app, network, browser, status-bar, splash-screen
├─ @capgo/capacitor-updater (โหมด manual, self-hosted)  ← OTA ชั้นที่ 2 "ทั้งก้อน"
└─ Kotlin plugin เล็ก: Print

เปิดแอป →  โหลด www/ (ออฟไลน์ได้ทันที)
        →  มีเน็ต? → AP.fetch(): ดึงชั้นที่ 2 รายไฟล์ (live.json ฯลฯ) แบบ "ออนไลน์ก่อน ถอยมาใช้สำเนาในเครื่อง"
        →  มีเน็ต + Wi-Fi + เกิน 24 ชม.? → AP.ota(): เช็ก bundle.json บน Pages → โหลด zip → ใช้รอบเปิดถัดไป
```

กติกาของชั้นที่ 2 (ต้องเขียนลงโค้ด): ลองดึงจาก `https://takiang71.github.io/fire-map-dpky/<path>` timeout 8 วินาที → สำเร็จ = ใช้ + เขียนสำเนาลง Filesystem (`Directory.Data/cache/<path>`) → ล้มเหลว = อ่านสำเนาใน Filesystem → ไม่มี = อ่านของที่ฝังใน `www/` → แสดงป้าย "ข้อมูล ณ <เวลา>" ให้ผู้ใช้รู้ว่าเก่า

---

## 3. ขั้นตอนทำงาน (เรียงเฟส — ทำทีละเฟส ทดสอบก่อนไปเฟสถัดไป)

กติการวมทุกเฟส (จาก `CLAUDE.md`): `git pull` ก่อนแก้ · แก้ `index.html` ด้วย Node `split(a).join(b)` ห้าม `String.replace` · แทรกก่อน `</body>` ใช้ `lastIndexOf` · ห้าม `//` ท้ายบรรทัดที่มีโค้ดต่อ · โมดูลใหม่ใช้ prefix `AP` · รัน `node --test test/` และ `node scripts/check_site.js` ทุกครั้งที่แตะ `index.html` · ข้อความบนหน้าจอเป็นภาษาไทย · **ห้ามแก้บล็อกข้อมูล `hdata`/`adata`/… ด้วยมือ** · **อย่าทำให้เว็บเดิมขึ้นกับแอป**: ทุกอย่างที่เป็นของแอปทำงานเฉพาะเมื่อ `window.Capacitor?.isNativePlatform()` เป็นจริง และแก้ผ่าน `scripts/build_app.js` ลง `app/www/` เท่านั้น (เว็บเดิมต้องทำงานเหมือนเดิม 100%)

### เฟส 0 — เตรียมเครื่อง (ทำครั้งเดียว ผู้ใช้ติดตั้งเองหรือให้ AI สั่งผ่าน winget)

1. ติดตั้ง **Android Studio** รุ่นล่าสุด (มาพร้อม Android SDK, Platform-Tools/adb, emulator) → ใน SDK Manager ติดตั้ง *Android SDK Platform* รุ่นที่ Capacitor รุ่นที่ใช้ระบุ + *Build-Tools* + *Command-line Tools*
2. ติดตั้ง **JDK 21** (Capacitor 7 ใช้ Gradle 8.x + Java 21; ถ้า Capacitor รุ่นใหม่กว่าระบุรุ่นอื่นให้ทำตามเอกสารรุ่นนั้น) — เครื่องผู้ใช้**ยังไม่มี Java** (ตรวจ 15 พ.ย. 69) · Node 24 + npm 11 มีแล้ว
3. ตั้ง environment: `JAVA_HOME`, `ANDROID_HOME` (ปกติ `%LOCALAPPDATA%\Android\Sdk`), เพิ่ม `platform-tools` ลง PATH · ตรวจด้วย `java -version`, `adb version`
4. บนโทรศัพท์ทดสอบ: เปิด *ตัวเลือกนักพัฒนา* → *การแก้ไขข้อบกพร่อง USB* · ตรวจว่า **Android System WebView** อัปเดตล่าสุดจาก Play Store (MapLibre ต้องการ WebGL; WebView รุ่นเก่ามากอาจมีปัญหา)
5. เกณฑ์เสร็จ: `adb devices` เห็นเครื่อง · `npx cap doctor` (หลังเฟส 3) ไม่มี error

### เฟส 1 — ทำหน้าเว็บให้ "ไม่พึ่ง CDN" (สคริปต์ `scripts/build_app.js` ใหม่)

เป้าหมาย: สร้างโฟลเดอร์ `app/www/` ที่เปิดแบบไม่มีเน็ตแล้วหน้าแรกขึ้นครบ (ยกเว้นแผนที่ฐาน ซึ่งทำในเฟส 2)

1. สร้าง `app/` ที่รากโปรเจกต์ (เพิ่ม `app/www/`, `app/android/build/`, `app/node_modules/` ใน `.gitignore` — เก็บไฟล์ตั้งค่า `capacitor.config.ts`, `package.json`, โค้ดปลั๊กอินที่เขียนเอง และ `android/` ส่วนที่ Capacitor สร้างให้ไว้ใน git ตามแนวทางของ Capacitor)
2. เขียน `scripts/build_app.js` (Node ไม่มี dependency):
   - เรียก `node scripts/build_site.js` ก่อนให้ได้ `_site/` ล่าสุด แล้วคัดลอกทั้งโฟลเดอร์ → `app/www/`
   - คัดลอกไลบรารีจาก `app/vendor/` (ดาวน์โหลดครั้งแรกแล้ว commit ไว้เพื่อให้ build ซ้ำได้โดยไม่ต้องมีเน็ต): `maplibre-gl.min.js` + `.css` (4.7.1), `xlsx.full.min.js` (0.18.5), `proj4.js` (2.11.0), ฟอนต์ Noto Sans Thai น้ำหนัก 400/600/800 เป็น `.woff2` + CSS `@font-face` ชี้ไฟล์ในเครื่อง (สัญญาอนุญาต BSD/Apache/OFL ฝังได้ทั้งหมด) → `app/www/vendor/`
   - ใน `app/www/index.html` แทนที่ URL CDN ทั้ง 5 จุด (บรรทัด 9–11, 969, 3387, 4832) ด้วย path ใน `vendor/` — **ใช้ `split().join()`** และต้องนับจุดให้ครบ (throw ถ้าไม่ครบ กันเงียบๆ พัง)
   - แทรกบล็อก `<script>` ของโมดูล `AP` (เฟส 4–5) ก่อน `</body>` ตัวสุดท้าย (`lastIndexOf`)
3. ทดสอบ: `node scripts/serve.js 8003 app/www` แล้วเปิด Chrome แบบ offline (DevTools → Network → Offline) ต้องได้หน้าแรก + การ์ด + สถิติย้อนหลังครบ · Console ไม่มี error นอกจาก tile ของแผนที่ฐาน
4. เกณฑ์เสร็จ: ข้อ 3 ผ่าน · `node --test test/` ผ่าน · `index.html` ที่รากไม่ถูกแตะ

### เฟส 2 — แผนที่ฐานออฟไลน์ (PMTiles)

เป้าหมาย: มีแผนที่ฐานเวกเตอร์ของกรอบกลุ่มป่าใช้ได้โดยไม่มีเน็ต และเมื่อมีเน็ตยังใช้แผนที่ฐานออนไลน์ชุดเดิมได้

1. ติดตั้งเครื่องมือ `pmtiles` CLI (go-pmtiles จาก GitHub releases) แล้วตัดจาก Protomaps daily planet build:
   ```
   pmtiles extract https://build.protomaps.com/<วันที่ล่าสุด>.pmtiles app/basemap/dpky.pmtiles --bbox=100.9,13.45,103.45,14.85 --maxzoom=14
   ```
   วัดขนาดจริง: ถ้าเกิน ~60 MB ให้ลด `--maxzoom=13` (พอสำหรับงานภาพรวม; รายละเอียดระดับหมู่บ้านใช้ตอนออนไลน์)
2. สไตล์: ใช้ `@protomaps/basemaps` (`layers("protomaps", namedFlavor("light"), {lang:"th"})`) สร้าง style JSON ที่ชี้ `pmtiles://basemap/dpky.pmtiles` แล้วบันทึกเป็น `app/www/basemap/style.json` · ตรวจว่าชื่อสถานที่ขึ้นภาษาไทยเมื่อมี `name:th`
3. Glyphs ภาษาไทย: สร้าง PBF glyphs จาก Noto Sans Thai + Noto Sans ด้วย `font-maker` / `node-fontnik` (หรือใช้ชุด glyph ของ Protomaps basemaps-assets ถ้าตรวจแล้วมีช่วงอักษรไทย U+0E00–0E7F) → `app/www/basemap/fonts/{fontstack}/{range}.pbf`
4. ใน `index.html` (ผ่าน `build_app.js` เท่านั้น ไม่แก้เว็บ): เพิ่มตัวเลือกแผนที่ฐาน "ออฟไลน์ (ในเครื่อง)" ให้โมดูลสลับแผนที่ฐานเดิม (ค้นด้วย grep `setStyle(` — ต้องคง `{diff:false}` ตามกติกาข้อ 7) · ลงทะเบียน `maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile)` (ฝัง `pmtiles` js ใน vendor) · เมื่อ `navigator.onLine` เป็นเท็จหรือโหลด style ออนไลน์ล้มเหลว → สลับมาชุดออฟไลน์อัตโนมัติ
5. **ความเสี่ยงที่ต้องทดสอบก่อน**: PMTiles ต้องใช้ HTTP Range request — ต้องทดสอบว่า local server ของ Capacitor (`https://localhost`) ตอบ Range ให้ไฟล์ใน assets ได้ · ถ้าไม่ได้ ทางออกตามลำดับ: (ก) คัดลอก `.pmtiles` ลง `Directory.Data` ตอนเปิดครั้งแรก แล้วอ่านด้วย Filesystem plugin ผ่าน custom `pmtiles` Source (ถ้าปลั๊กอินอ่านเป็นช่วงได้) (ข) ปลั๊กอิน Kotlin เล็กที่เปิด `.pmtiles` แล้วตอบ `tile(z,x,y)` เป็น base64 ให้ `addProtocol` (ค) แปลงเป็นโฟลเดอร์ tile `z/x/y.pbf` (ไฟล์เยอะมากแต่ไม่ต้องใช้ Range)
6. ภูมิประเทศ/เงาเขา (DEM terrarium) ออฟไลน์เป็น**ทางเลือก**: ตัด terrarium เป็น PMTiles raster z≤11 (ประมาณ 10–20 MB) ถ้าผู้ใช้ต้องการ 3D ตอนออฟไลน์ · ถ้าไม่ ให้ปิดปุ่มภูมิประเทศตอนออฟไลน์พร้อมข้อความบอกเหตุ
7. เกณฑ์เสร็จ: เปิด `app/www` ผ่าน serve.js แบบ offline แล้วเห็นแผนที่ฐานพร้อมชื่อสถานที่ไทย ลากซูมได้ที่ z 7–14 ทั่วกรอบกลุ่มป่า · เมื่อ online สลับกลับชุด Esri/OpenFreeMap ได้

### เฟส 3 — สร้างโปรเจกต์ Capacitor

1. ที่ `app/`: `npm init -y` → `npm i @capacitor/core @capacitor/android` + `npm i -D @capacitor/cli` → `npx cap init "ไฟป่า ดงพญาเย็น-เขาใหญ่" th.go.dnp.firemap.dpky --web-dir www` (ชื่อแพ็กเกจเปลี่ยนได้ แต่ **ตั้งครั้งเดียวแล้วห้ามเปลี่ยน** เพราะผูกกับการอัปเดตแอปทับ)
2. `capacitor.config.ts`: `webDir:'www'`, `server:{androidScheme:'https'}`, `android:{allowMixedContent:false}`, `plugins:{CapacitorHttp:{enabled:false}}` (เปิดเป็น `true` เฉพาะถ้าพบว่า API ต้นทางใดไม่เปิด CORS — ตอนนี้เว็บดึง ThaiREN/open-meteo/TMD/RainViewer จาก browser ตรงได้ แปลว่ามี CORS ครบ จึงไม่น่าต้องใช้)
3. ติดตั้งปลั๊กอิน: `@capacitor/filesystem @capacitor/share @capacitor/geolocation @capacitor/app @capacitor/network @capacitor/browser @capacitor/status-bar @capacitor/splash-screen`
4. `npx cap add android` → `npx cap sync` · ใน `android/app/src/main/AndroidManifest.xml` เพิ่ม `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` และ `android:usesCleartextTraffic="false"`
5. `minSdkVersion` ใช้ค่าเริ่มต้นของ Capacitor · `targetSdkVersion` ล่าสุดที่ Play กำหนด
6. ไอคอน/สแปลช: ทำ `app/resources/icon.png` (1024²) + `splash.png` จากโลโก้ที่ผู้ใช้ให้ (ถ้ายังไม่มี ใช้ไอคอนไฟในแอป) แล้วรัน `npx @capacitor/assets generate --android`
7. ทดสอบ: `npx cap run android` (หรือ `npx cap open android` แล้วกด Run ใน Android Studio) บนเครื่องจริง · เปิด `chrome://inspect` บน PC เพื่อดู Console ของ WebView
8. เกณฑ์เสร็จ: แอปเปิดขึ้น แผนที่ฐานออฟไลน์แสดง ปิดเน็ตแล้วการ์ด/สถิติย้อนหลังยังครบ

### เฟส 4 — โมดูล `AP` ส่วน WebView compat (แก้ผ่าน `build_app.js` เท่านั้น)

เขียนเป็นไฟล์ `app/src/ap.js` แล้ว `build_app.js` แทรกก่อน `</body>` · ทุกอย่างอยู่ใน `if (window.Capacitor && Capacitor.isNativePlatform()) { ... }`

1. **ดาวน์โหลดไฟล์** (7 จุด): ดักคลิกของ `a[download]` ทั้งหน้า (capture phase): อ่าน `href` (blob:/data:) → แปลงเป็น base64 → `Filesystem.writeFile({path:'export/<ชื่อ>', directory:Directory.Cache, data})` → `Share.share({files:[uri]})` · ชื่อไฟล์ไทยต้องคงไว้ · ทดสอบ CSV/GeoJSON/KML/GPX/PNG ทุกชนิด
2. **พิมพ์** (6 จุด): เขียนปลั๊กอิน Kotlin `PrintPlugin` (`@CapacitorPlugin(name="Print")`, เมธอด `print()` → `PrintManager.print(jobName, webView.createPrintDocumentAdapter(jobName), null)` ต้องรันบน UI thread) แล้ว shim `window.print = () => Capacitor.Plugins.Print.print()` · ถ้าโมดูลพิมพ์แผนที่ (`PP`) เปิดหน้าต่างใหม่หรือใช้ `<iframe>` ให้ตรวจก่อนว่ายังทำงานใน WebView
3. **ตำแหน่ง** (3 จุด): shim `navigator.geolocation.getCurrentPosition/watchPosition` ให้เรียก `Geolocation.getCurrentPosition({enableHighAccuracy:true})` / `watchPosition` และแปลงผลให้รูปเดียวกับ `GeolocationPosition` (`coords.latitude/longitude/accuracy/heading/speed`, `timestamp`)
4. **แชร์** (2 จุด): ถ้า `navigator.share` ไม่มี ให้ชี้ไป `Share.share({title,text,url})`
5. **ลิงก์ภายนอก** (`target="_blank"` 30 จุด + Google Maps + แชร์ LINE/Telegram/Facebook): Capacitor เปิด URL นอก origin ในเบราว์เซอร์ระบบอยู่แล้ว **ต้องทดสอบ** · ถ้าไม่เปิด ให้ดักคลิก `a[target=_blank]` → `Browser.open({url})` · ลิงก์ `https://www.google.com/maps/...` ให้ Android เลือกแอป Google Maps เอง (ไม่ต้องแปลงเป็น `geo:`)
6. **ปุ่ม Back**: `App.addListener('backButton', ...)` → ถ้ามีแผง/ป๊อปอัป/โหมดวาดเปิดอยู่ให้ปิดก่อน (เรียกฟังก์ชันปิดแผงเดิมของแอป — ค้นชื่อใน `docs/arch/ui-modules.md`) · ถ้าไม่มีอะไรเปิด ให้ `App.exitApp()` หลังกด 2 ครั้งใน 2 วินาที พร้อม toast "กดอีกครั้งเพื่อออก"
7. **Status bar / safe area**: `StatusBar.setOverlaysWebView({overlay:false})` + สีเดียวกับ `theme-color` · ตรวจแผงล่าง (sheet) บนจอที่มี gesture bar ด้วย `env(safe-area-inset-bottom)`
8. **Windy iframe** (`#wy-f`): ใช้ได้เมื่อ online · ตอน offline ให้ซ่อนพร้อมข้อความ
9. เกณฑ์เสร็จ: ไล่ทดสอบปุ่มหลักทุกปุ่มตามรายการ `DESK`/`MOB` ใน `scripts/check_site.js` บนเครื่องจริง (ใช้เช็กลิสต์ข้อ 7 ท้ายเอกสาร) · Console ใน `chrome://inspect` ไม่มี error

### เฟส 5 — โมดูล `AP` ส่วนข้อมูลออนไลน์ (ชั้นที่ 2) + OTA

1. **ออนไลน์ก่อน ถอยมาใช้สำเนาในเครื่อง** — เขียน `AP.fetch(relPath)`:
   - `NET_BASE = 'https://takiang71.github.io/fire-map-dpky/'`
   - ลำดับ: ถ้า `Network.getStatus().connected` → `fetch(NET_BASE+relPath, {signal: AbortSignal.timeout(8000)})` → สำเร็จ: เขียนสำเนา `Directory.Data/cache/<relPath>` + บันทึกเวลา → คืนค่า · ล้มเหลว: อ่านสำเนาใน Data → ไม่มี: `fetch(relPath)` (ของที่ฝังใน www) · ทุกกรณีตั้ง `AP.stale[relPath] = เวลาของข้อมูล` ให้ UI ขึ้นป้าย
   - **ไฟล์ที่ต้องผ่าน `AP.fetch`**: `live.json`, `watch.json`, `air4thai.json`, `data/fwi/index.json`, `data/fwi/g/*.json`, `data/gfs_vr.json`, `data/cams_grid.json`, `data/tle.json`, `data/burn/index.json` + ชุดย่อยที่ index ชี้ (โหลดเมื่อผู้ใช้เปิดชั้นนั้น) · ไฟล์อื่น (admin/prov/ftype/fuel/tour/ranger/fbase/manual) ใช้ของที่ฝังพอ เพราะเปลี่ยนนานๆ ครั้งและ OTA ครอบคลุม
   - วิธีผูกกับโค้ดเดิมโดยแตะน้อยที่สุด: ใน `ap.js` ครอบ `window.fetch` เฉพาะเมื่อ URL ตรงรายการข้างบน (relative หรือขึ้นต้นด้วย `NET_BASE`) ให้วิ่งผ่าน `AP.fetch` — โค้ดเดิม (`liveFile()`, `BN_BASE`, `FWU`, `GVR_URL`, `CM_URL`, `OB_URL`, `watch.json`) ไม่ต้องแก้ · ตัดพารามิเตอร์กันแคช `?t=` `?h=` `?v=` `?r=` ออกตอนทำ key ของสำเนา
2. **จุดสด**: ตรรกะเดิม `liveFile()` ถ้า `live.json` เก่ากว่า `LIVE_MAXAGE` 40 นาที จะดึง ThaiREN API ตรง — บนมือถือคงไว้ (สำคัญสุด) แต่เพิ่ม timeout 15 วินาทีและแสดง "ข้อมูลเมื่อ hh:mm (ออฟไลน์)" เมื่อทั้งสองทางล้มเหลว
3. **OTA ทั้งก้อน** (`@capgo/capacitor-updater` self-hosted ไม่ใช้บริการ Capgo cloud, โหมด `autoUpdate:false`):
   - ฝั่ง Actions: แก้ `scripts/build_site.js` ให้สร้างเพิ่ม `_site/app/bundle.zip` (= ผลของ `build_app.js` ส่วน www **ไม่รวม** `basemap/` และ `vendor/` ที่ไม่เปลี่ยน เพื่อให้ zip เล็ก ~10 MB) + `_site/app/bundle.json` `{version:"<yyyymmdd-hhmm>", sha256, size, built}` · ทำวันละครั้ง (ใน workflow เช็กว่า `bundle.json` วันนี้มีแล้วก็ข้าม) ไม่ใช่ทุก 5 นาที
   - ฝั่งแอป `AP.ota()`: เมื่อ `connected && connectionType==='wifi'` และห่างจากครั้งก่อน ≥ 24 ชม. → ดึง `bundle.json` → ถ้า `version` ใหม่กว่า → `CapacitorUpdater.download({url, version})` → ตรวจ sha256 → `CapacitorUpdater.set()` (ใช้รอบเปิดถัดไป) → `notifyAppReady()` ตอนเปิดสำเร็จ (ถ้าไม่เรียก ปลั๊กอินจะ rollback ให้เอง = กันบันเดิลเสีย) · มีปุ่ม "ตรวจอัปเดตข้อมูลตอนนี้" ในเมนูตั้งค่า + แสดง "ฐานข้อมูล ณ <วันที่ของ bundle>"
   - ข้อควรระวัง: bundle.zip ต้องมี `index.html` ที่ราก · `basemap/` และ `vendor/` ที่ไม่อยู่ใน zip ต้องอ้างแบบ path ที่ปลั๊กอินยังหาเจอ (ทดสอบ; ถ้าไม่เจอ ให้รวมลง zip ด้วยแล้วยอมให้ zip ใหญ่ขึ้น หรือย้าย basemap ไป `Directory.Data` ตั้งแต่เฟส 2 ข้อ 5)
4. **ตัวชี้วัด hdata (Excel กรมอุทยานฯ)**: เปลี่ยนเมื่อผู้ใช้นำเข้าเอง (นานๆ ครั้ง) → ผ่าน OTA พอ ไม่ต้องทำช่องทางพิเศษ
5. เกณฑ์เสร็จ: (ก) เปิดแอปแบบมีเน็ต → จุดสดตรงกับเว็บ · (ข) ปิดเน็ต → เปิดแอปใหม่ ยังเห็นจุดชุดล่าสุดพร้อมป้ายเวลา · (ค) ปล่อย bundle ใหม่บน Pages → เปิดแอปบน Wi‑Fi → ปิด-เปิด → สถิติปีงบเปลี่ยนตาม

### เฟส 6 — สร้าง APK/AAB แจกจ่าย

1. สร้าง keystore ครั้งเดียว: `keytool -genkeypair -v -keystore firemap-release.jks -alias firemap -keyalg RSA -keysize 2048 -validity 10000` — **ผู้ใช้เก็บไฟล์ + รหัสผ่านเองนอก repo** (ทำหายแล้วอัปเดตแอปเดิมทับไม่ได้อีก) · ห้าม commit · ใส่ path/รหัสใน `android/key.properties` ที่ ignore ไว้
2. ตั้ง `signingConfigs.release` ใน `android/app/build.gradle` ให้อ่านจาก `key.properties`
3. `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (แจก APK ให้เจ้าหน้าที่ติดตั้งเอง — เหมาะกับหน่วยงานภายใน) · ถ้าจะลง Play Store ใช้ `bundleRelease` → `.aab` (ต้องมีบัญชีนักพัฒนา Play ค่าสมัครครั้งเดียว ผ่านการตรวจ ใช้ *Internal testing* ก่อน)
4. แจกจ่าย APK ผ่าน **GitHub Releases** ของ repo (สาธารณะอยู่แล้ว) ใส่ลิงก์ดาวน์โหลดในคู่มือ `manual/index.html` + QR · ในแอปมีหน้าตั้งค่าแสดงรุ่นแอป (`App.getInfo()`) และรุ่น bundle
5. (ทางเลือก) workflow `.github/workflows/app.yml`: trigger เมื่อ push tag `app-v*` → setup-java 21 + android SDK → `node scripts/build_app.js` → `npx cap sync` → `gradlew assembleRelease` (keystore จาก GitHub Secrets แบบ base64) → แนบ APK เข้า Release อัตโนมัติ · **อย่าแตะ `site.yml`/`sync.yml` input `by`** (กติกาข้อ 12)
6. เกณฑ์เสร็จ: ติดตั้ง APK บนเครื่อง 2 รุ่น (Android 8–10 และรุ่นใหม่) ได้ · อัปเดตทับด้วย APK รุ่นถัดไปได้โดยค่าตั้งค่า (localStorage) ไม่หาย

### เฟส 7 — (ทางเลือก ภายหลัง) แจ้งเตือน Push

ตอนนี้แจ้งเตือนผ่าน LINE OA/Telegram อยู่แล้ว ไม่จำเป็นต้องทำทันที · ถ้าจะทำ: `@capacitor/push-notifications` + Firebase Cloud Messaging (topic `dpky`) + ให้ `scripts/line_notify.js` / Worker `fire-line` ยิง FCM เพิ่มหนึ่งช่องทาง (ไม่มีโควตาแบบ LINE) · กดแจ้งเตือนแล้วเปิดแอปที่จุดนั้น (ใช้ลิงก์ตรง `?hs=` `?pts=` แบบเดียวกับ `docs/arch/notify.md`)

### เฟส 8 — เอกสารและกติกาโปรเจกต์

1. เพิ่ม `docs/arch/android-app.md` อธิบายโครงสร้าง `app/`, `build_app.js`, โมดูล `AP`, OTA, วิธี build/sign (อ้างจากแผนนี้แล้วปรับตามที่ทำจริง) · ใน `CLAUDE.md` เพิ่มเพียง 1 บรรทัดชี้ไป (เก็บ CLAUDE.md < 16 KB)
2. เพิ่ม `AP` ลงรายการชื่อที่ใช้แล้วใน `docs/arch/gotchas.md`
3. คู่มือ `manual/index.html`: หัวข้อ "ติดตั้งแอป Android" + ข้อจำกัดตอนออฟไลน์ (กติกาข้อ 9)
4. ถ้ามีเทสต์หน่วยได้ (เช่น ตรรกะ `AP.fetch` เลือกแหล่ง, ตัดพารามิเตอร์กันแคช, เปรียบเทียบ version ของ bundle) ให้เพิ่มใน `test/` แบบไม่พึ่ง Capacitor (ฉีด `fetch`/`Filesystem` จำลอง)

---

## 4. ข้อควรระวังและข้อจำกัดที่รู้แล้ว

- **เงื่อนไขการใช้ Esri**: ห้ามเก็บ tile ของ Esri ไว้ใช้ออฟไลน์ → ออฟไลน์ใช้ PMTiles จาก Protomaps/OpenStreetMap (ใส่เครดิต © OpenStreetMap contributors, © Protomaps) · ออนไลน์ใช้ชุดเดิมได้
- **WebGL บนมือถือราคาถูก**: MapLibre ใช้ WebGL เครื่องเก่าบางรุ่น render ช้า — ลดภาระด้วยการปิด terrain/เงาเขาเป็นค่าเริ่มต้น**เฉพาะในแอป** (ดู `docs/arch/decisions.md` ก่อนเปลี่ยนค่าเริ่มต้นใดๆ ของเว็บ)
- **หน่วยความจำ**: `adata` 7,303 แถว + hdata ปีงบ 2561–2569 โหลดได้สบายบนมือถือ (เว็บทำงานบนจอ 390 px อยู่แล้วตาม check_site)
- **ขนาด APK** โตตาม PMTiles · Play Store จำกัด AAB 200 MB (ส่วนเกินใช้ Play Asset Delivery) — ตั้งเป้าให้ APK < 100 MB
- **ตรวจสอบก่อนเชื่อ**: ค่าเวอร์ชันเครื่องมือ (Capacitor/JDK/SDK/minSdk) ในแผนนี้มาจากความรู้ทั่วไป ณ กลางปี 2569 → ผู้ทำต้องยึดเอกสารทางการของ Capacitor รุ่นที่ติดตั้งจริง
- **สิ่งที่ยังไม่ได้ทดสอบ** (ต้องพิสูจน์ในเฟสที่ระบุ): Range request ของ PMTiles ใน Capacitor local server (เฟส 2 ข้อ 5) · การเปิด `target=_blank` ไปเบราว์เซอร์ระบบ (เฟส 4 ข้อ 5) · โมดูลพิมพ์ `PP` ใน WebView (เฟส 4 ข้อ 2) · ปลั๊กอิน updater กับไฟล์นอก zip (เฟส 5 ข้อ 3) · CORS ของ ThaiREN เมื่อ origin เป็น `https://localhost` (ถ้าติด ให้เปิด `CapacitorHttp`)
- แอปไม่กระทบระบบเดิม: เว็บ, Actions, LINE/Telegram ทำงานเหมือนเดิม เพราะแอปเป็นแค่ผู้บริโภคไฟล์บน Pages เพิ่มอีกหนึ่งราย (โหลดบน Pages เพิ่มเล็กน้อย ไม่มีผลกับ API ThaiREN ยกเว้น fallback 40 นาทีซึ่งเว็บก็ทำอยู่แล้ว)

---

## 5. Prompt ต้นแบบสำหรับสั่ง AI โมเดลอื่น (คัดลอกไปใช้ได้ เลือกเฟสที่ต้องการ)

```
คุณกำลังทำงานใน repo https://github.com/takiang71/fire-map-dpky (branch main) ซึ่งเป็นเว็บแอปแผนที่ไฟป่าไฟล์เดียว index.html (ภาษาไทย, MapLibre GL JS 4.7.1)
อ่านก่อนเริ่ม: CLAUDE.md (กติกา 14 ข้อ — ต้องทำตามทุกข้อ โดยเฉพาะ: git pull ก่อนแก้, แก้ index.html ด้วย Node split/join ห้าม String.replace, แทรกก่อน </body> ใช้ lastIndexOf, ห้าม // ท้ายบรรทัดที่มีโค้ด, โมดูลใหม่ใช้ prefix AP, ห้ามแก้บล็อกข้อมูล hdata/adata/wdata/wadata/fxdata ด้วยมือ, รัน node --test test/ และ node scripts/check_site.js ก่อน commit, ตอบและเขียนข้อความบนหน้าจอเป็นภาษาไทย)
แผนงานทั้งหมดอยู่ที่ docs/android-app-plan.md — ให้ทำ "เฟส <N>" ตามขั้นตอนในนั้นทีละข้อ
ข้อกำหนดเพิ่มเติม:
1. ห้ามทำให้เว็บเดิม (index.html ที่ราก, GitHub Pages, workflows site/sync/wx, LINE/Telegram) เปลี่ยนพฤติกรรม — โค้ดของแอปต้องทำงานเฉพาะเมื่อ window.Capacitor?.isNativePlatform() เป็นจริง และแก้ผ่าน scripts/build_app.js ลง app/www/ เท่านั้น
2. ทุกขั้นที่ "ต้องทดสอบ" ในแผน ให้ทดสอบจริงแล้วรายงานผลตรงๆ ว่าผ่าน/ไม่ผ่าน พร้อมหลักฐาน (ผลคำสั่ง, ภาพหน้าจอจาก chrome://inspect หรือ adb) ห้ามสรุปว่าผ่านโดยไม่ได้ทดสอบ
3. เมื่อจบเฟส: อัปเดต docs/android-app-plan.md ส่วน "สถานะ" + docs/arch/android-app.md แล้ว commit + push (identity takiang71) ด้วยข้อความ commit ภาษาไทย
4. ถ้าพบว่าข้อใดในแผนขัดกับโค้ดจริงหรือเอกสารทางการของเครื่องมือรุ่นที่ติดตั้ง ให้ยึดของจริง แล้วบันทึกความต่างลงในแผน
```

---

## 6. สถานะ (อัปเดตทุกครั้งที่จบเฟส)

| เฟส | สถานะ | วันที่ | หมายเหตุ |
|---|---|---|---|
| 0 เตรียมเครื่อง | ยังไม่เริ่ม | | เครื่องผู้ใช้ไม่มี Java/Android SDK (ตรวจ 15 พ.ย. 69) |
| 1 ไม่พึ่ง CDN | ยังไม่เริ่ม | | |
| 2 แผนที่ฐานออฟไลน์ | ยังไม่เริ่ม | | |
| 3 โปรเจกต์ Capacitor | ยังไม่เริ่ม | | |
| 4 WebView compat | ยังไม่เริ่ม | | |
| 5 ข้อมูลออนไลน์ + OTA | ยังไม่เริ่ม | | |
| 6 APK/AAB | ยังไม่เริ่ม | | |
| 7 Push (ทางเลือก) | ยังไม่เริ่ม | | |
| 8 เอกสาร | ยังไม่เริ่ม | | |

## 7. เช็กลิสต์ทดสอบบนเครื่องจริง (ใช้ตอนเฟส 4–6)

- [ ] เปิดแอปครั้งแรกแบบไม่มีเน็ต: หน้าแรก, การ์ดหลัก, สถิติย้อนหลัง, เล่นย้อน, กองจุด, ดับไฟ, จปร., วัด, แผนที่ฐานออฟไลน์, ชื่อสถานที่ไทย
- [ ] เปิดเน็ต: จุดสด 48 ชม. ตรงกับเว็บ, ป้ายเวลา, FWI, VR, PM2.5, เรดาร์, Himawari, Windy, Esri/OpenFreeMap สลับได้
- [ ] ปิดเน็ตอีกครั้ง: ยังเห็นจุดชุดล่าสุดจากสำเนา + ป้าย "ข้อมูลเมื่อ …"
- [ ] ส่งออก CSV / GeoJSON / KML / GPX / PNG → แผ่นแชร์ขึ้น ไฟล์เปิดได้ในแอปอื่น (ชื่อไฟล์ไทยถูกต้อง)
- [ ] พิมพ์แผนที่/รายงาน → Print dialog ของ Android หรือ PDF
- [ ] ปุ่มตำแหน่งฉัน → ขอสิทธิ์ → แสดงตำแหน่ง
- [ ] ลิงก์ Google Maps / แชร์ LINE / Telegram / Facebook → เปิดแอปภายนอก
- [ ] ปุ่ม Back: ปิดแผง → ปิดป๊อปอัป → กด 2 ครั้งออก
- [ ] หมุนจอ / จอที่มี notch / gesture bar: แผงล่างไม่ถูกบัง
- [ ] OTA: ปล่อย bundle ใหม่ → Wi‑Fi → เปิดใหม่ 2 ครั้ง → เวอร์ชันข้อมูลเปลี่ยน · bundle เสีย → rollback อัตโนมัติ
- [ ] อัปเดต APK ทับรุ่นเก่า: ค่าตั้งค่า (localStorage) และสำเนาข้อมูลไม่หาย
- [ ] ลองบน Android 8–10 หนึ่งเครื่อง และ Android 13+ หนึ่งเครื่อง
