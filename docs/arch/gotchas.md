# ข้อควรระวัง: ชื่อชนกัน และบั๊กที่เคยเจอ

> รวบรวมจาก CLAUDE.md เดิม — ข้อในหัวข้อ "สรุป" เป็นสำเนาย่อ (ต้นฉบับยังอยู่ในไฟล์หมวดนั้น) ส่วนหัวข้อ "ต้นฉบับ" ย้ายมาทั้งบรรทัด
> ย้ายมาจาก CLAUDE.md เดิม (15 พ.ย. 69) โดยไม่ตัดข้อเท็จจริง — ดัชนีอยู่ที่ [CLAUDE.md](../../CLAUDE.md)

## สรุป — ชื่อที่ชนกันแล้ว (ห้ามใช้ซ้ำ)

| ชื่อที่ถูกใช้แล้ว | ของใคร | ทางที่ใช้แทน |
|---|---|---|
| `STM` | `let` สถานีวัดฝุ่น | สถานีไฟป่า = `window.FSM` |
| คลาส `.stm` | ป้ายสถานีวัดฝุ่น PM2.5 | สถานีไฟป่า = `.fsm` |
| `PM` / `PMD` / `PMQ` | โหมดการ์ด / ข้อมูลฝุ่น / `let` ในโมดูลพิมพ์ (ชื่อซ้ำ = สคริปต์ทั้งก้อนล้ม) | พิมพ์แผนที่ = `PP`/`PPD`; ฝุ่นในแผงชั้นข้อมูล = `pq-*`/`A4Q` |
| id `pm-*` | โมดูลพิมพ์แผนที่ (`#pm-lg`, `#pm-t` …) | ห้ามใช้ในแผงชั้นข้อมูล |
| `HM` | โหมดแผนที่สถิติ | Himawari = `HIM*` |
| `WG` | ตารางลม | จปร. = `WWG` |
| `WLT` | Windy | เวลาเฟรมเส้นลม = `WFT0` |
| ชั้น `fx` | โมเดลไฟ | ชั้นการดับไฟ = `xt*`/`xtc*` |
| `fw-c` `fw-d` `fw-t`, คลาส `fwt` | CBI เดิม / กริดในแผงรายละเอียด | ชั้น FWI ใช้ `FW*`/`fw*` อื่น, ตารางรายงาน = `table.fwrt` |
| id `w-src` | ชิปตัวกรองแหล่งข้อมูลของการ์ด จปร. | กล่องที่มาข้อมูล = `#wa-dsrc` |
| `data-k` ภายใน `#hcard` | ถูกจับเป็นตัวกรองสถิติ `HF` → error | `data-xk/data-xv`, `data-ob` ฯลฯ |
| คลาส `mb` | `.mb{padding:14px 16px}` ของ modal | กล่องดาวเทียมมือถือ = `obm` |
| `.kb-ch svg{width:100%}` | กราฟในหน้าข้อมูลพื้นฐาน | ไอคอนใช้ `.kb-ch svg.kb-fi` |
| คีย์ขึ้นต้น `i` ใน `PP.E` | กล่องรูปภาพของผู้ใช้ | ตรวจด้วย `/^id/` |
| `fetchT` `FTO` `dbg` `DBG` `slowMsg` `dgCopy` `HSERR`, `window.__LOG` `window.__OLD`, id `dg-cp` `dg-tx` `oldb` | ตัวช่วยเครือข่าย/บันทึกข้อผิดพลาด (A2/A3) และกล่องเบราว์เซอร์เก่า (D8) — 15 พ.ย. 69 | `FT` = ชนิดป่า (ใช้อยู่ก่อน จึงตั้ง `FTO`) |
| `ULMAX` `ulBig` `ulLogAll` `ulALog` `ualDraw` `ualWhat` `UALA` `UALR` `UALK` `UA.lk` `UA.LG` id `ua-lk` `ua-lt` `data-a="lall"` · worker `TGRE` · check_site `E3UI` | E3 หลังบ้าน (บันทึกการใช้งาน/ออกทุกอุปกรณ์/8 MB) · A7 ลิงก์เชิญ Telegram — 17 พ.ย. 69 | — |
| `gz*` `GZ*` id `gz` `gz-*` `bSr` ชั้น `gz-hl` · `vw*` `VW*` (`VWD` `VWB` `VWO` `VWS` `VWX` `VWT` `VWU`) id `vw-*` localStorage `fm-vw` · `window.gzKB` | ค้นหา (D4) / ลิงก์มุมมอง (D3), 16 พ.ย. 69 | — |
| `WJ` `wjLib` `wj*` เครื่องหมาย `/*WJ-LIB-BEGIN*/…END*/` · `HCJ` `hcFin` `hcSel` · `TR.job` `trJob` `trAbort` · `TL` `TLG` `tl*` (`tlPut` `tlTile` `tlPack` `tlTry`) `bnHotP` `bnHsPts` `BNHQ` `bnTile0` `bnTileW` `rpTile0` `rpTileW` `WJ.drop` `WJ.gen` | Web Worker งานหนัก (B2, 17 พ.ย. 69) — ฟังก์ชันใน wjLib ชื่อซ้ำกับของแอป (`hcLink` `hcHull` `trSA` `trHorn` `trElev` `trContours` `bnLL` `bnM` `trX`…) | สคริปต์ที่ค้น/แก้ index.html ด้วย indexOf/split ต้องเริ่มค้น**หลัง** `/*WJ-LIB-END*/` (เคยตัดโค้ดช่วงกว้างเพราะเจอ `function trSA(` ในบล็อก lib ก่อน) |
| `TK` `TKDB` `TKC` `TKI` `TKA` `TKV` `TKN` `tk*` (`tkOk` `tkDP` `tkFix` `tkBar` `tkPos` `tkGpx` `tkPack` `tkView` `tkLenV` …) · id `tk` `tk-*` · source `tks` `tkv` ชั้น `tk-c` `tk-l` `tk-v` · IndexedDB `fm-tk` · localStorage `fm-tki` · `locOn` `LOC.q` `UL.rd` · เครื่องหมาย `/*TK-PURE-BEGIN*/…END*/` | F7 บันทึกเส้นทาง (18 พ.ย. 69) | ระวัง prefix `tr` = ภูมิประเทศ (อย่าใช้ `trk*` ในหน้าเว็บ; ช่องรายงาน `trk` อยู่ใน body/Worker เท่านั้น) |

ทุกโมดูลใหม่ตั้ง prefix เฉพาะ 2–3 ตัวอักษร และค้นด้วย grep ก่อนตั้งชื่อ

## สรุป — บั๊ก/กับดักที่เคยเจอ

- **Web Worker (B2, 17 พ.ย. 69)**: โค้ดใน `wjLib()` ต้องเป็นฟังก์ชันบริสุทธิ์ — ห้ามอ้าง DOM/map/S/localStorage/fetchT/ตัวแปรของแอป (รันจาก `wjLib.toString()` ใน Worker; test/wj.test.js ตรวจด้วย regex) · ผลลัพธ์ที่มี typed array ใส่ `__t` = buffer ที่โอน (buffer เดียวห้ามซ้ำ) · อาร์กิวเมนต์ที่โอนไปแล้วใช้ต่อไม่ได้ จึงส่งผ่าน `WJ.job(fn, mk)` ที่ `mk()` สร้างใหม่ได้เมื่อต้องรันซ้ำบน main thread (Worker ตาย) · `trContours` ของ lib ต้องได้ `ar` ใน G (ใช้คำนวณ el) · แผ่น DEM ใน DEMC ห้ามโอนตรง (ใช้ที่อื่น) ให้ `slice()` ก่อน · กล่องผลต้องรอ "กำลังคำนวณ…" หายก่อนอ่านตัวเลข (check_site) · แถวพื้นที่เผาไหม้/เผาซ้ำซาก `o.q`/`o.bb` เป็น **view ของ typed array** (ไม่ใช่ Array) — อ่านด้วยดัชนีได้ ห้ามใช้ .map/.concat/JSON แล้วคาดว่าได้ Array · `o.hs` มีค่าหลัง `await bnHotP(D)` (โค้ดใหม่ที่ใช้ hs ใน async ให้รอก่อน) · ไทล์ที่วาดใน Worker ต้องคงลำดับแถวและสูตร bnPaint เดิม (check_site เทียบพิกเซลกับ bnTile0/rpTile0)

- **เรียกเครือข่ายใน index.html ใช้ `fetchT(url, opt, FTO.main|tile|big|aux)` เท่านั้น** (A2, 15 พ.ย. 69 — เดิม fetch 40 แห่งมี timeout แห่งเดียว เน็ตช้าในป่า = ค้างไม่มีกำหนด) · เกินเวลา = `TimeoutError` → จุดที่ผู้ใช้รอผลใช้ `toast(slowMsg(e,'ข้อความเดิม'))` ("ต้นทางตอบช้า ลองใหม่") · `test/net.test.js` ล้มถ้ามี `fetch(` ตรงนอก fetchT · ไฟล์ใหญ่ (admin 2 MB, prov 1 MB, ftype, gfs_vr, cams_grid, burn) = `FTO.big` 60 วิ เพราะ AbortSignal.timeout นับรวมเวลาอ่าน body
- **catch ในเส้นทางโหลดข้อมูลห้ามว่าง** ใช้ `catch(e){dbg('ชื่อ',e)}` / `.catch(e=>dbg('ชื่อ',e))` (A3) — guard DOM/ลำดับโหลด (`try{LX()}catch(e){}` ใน apply/setup, localStorage) ปล่อยว่างได้ เพราะ error ที่คาดไว้จะท่วม `__LOG` · fetchT บันทึกความล้มเหลวของเครือข่ายเองแล้ว (ไม่บันทึกเมื่อผู้เรียกยกเลิกด้วย signal ของตัวเอง)
- **สคริปต์แรกใน `<head>` (D8) ต้องเป็น ES5 ล้วน** — ห้าม `=>` `let/const` template `?.` `??` (เทสต์ net ตรวจ) · ถ้าเพิ่มความสามารถใหม่ที่รุ่นต่ำสุด (Chrome 98 / Safari 16.4 / Firefox 113) ไม่มี ให้เพิ่มการตรวจในสคริปต์นั้น + แก้รุ่นในคู่มือ #m-browser

- หมายเหตุ `//` ท้ายบรรทัดที่มีโค้ดต่อ กลืนโค้ด (เคยทำ `let WYK` หาย, กรอบแผนที่พิมพ์ไม่ปรับขนาด) — `node --check` ไม่จับ → ใช้ `/* */`
- แก้ index.html ด้วย `String.replace` ใน Node: `$$`/`$&` ถูกตีความ → ใช้ `split(a).join(b)`
- มีสตริง `</body>` ในโมดูลพิมพ์แผนที่ → แทรกโค้ดก่อน `</body>` ต้องใช้ `lastIndexOf`
- `let` ชื่อซ้ำข้ามบล็อก `<script>` = ทั้งบล็อกไม่ทำงาน
- **`const`/`let` ระดับบนสุดไม่อยู่บน `window`** — `window.LOC`/`window.CUR` เป็น undefined เสมอ (เคยทำให้ฟอร์ม F1 ไม่ใส่พิกัดจากตำแหน่งของฉัน และกล่องผลตรวจสอบไม่วาดใหม่หลังบันทึก — แก้ 18 พ.ย. 69) → อ้างข้ามบล็อกด้วย `typeof X!=='undefined'&&X`
- `setup()` อาจทำงานก่อนสคริปต์ท้ายไฟล์ และ `isStyleLoaded()` เป็น false ระหว่างไทล์โหลด → อย่าใช้ตัดสิน ใช้ `map.getSource('dem')` และเรียกสร้างชั้นซ้ำท้ายสคริปต์ (`msLayers`, `obTick`)
- `apply()` ถูกเรียกก่อนสไตล์โหลด → `(map.getStyle()||{})` + `try` รอบ setTerrain · สลับแผนที่ฐานต้องคง `setStyle(...,{diff:false})`
- `fitBounds` ภายในเหตุการณ์ dblclick ต้อง `setTimeout` · เมื่อผู้ใช้ตั้งลดการเคลื่อนไหว `dur()=0` moveend ยิงทันที → ผูก `once('moveend')` ก่อนเรียก fitBounds/easeTo
- SVGElement ไม่มี property `hidden` → ครอบด้วย div (`#mcross`)
- กฎ `[hidden]{display:none!important}` ทั้งหน้า → แผงที่เลื่อนเข้า-ออกต้อง `!important` (`#ulm[hidden]`, `#hlg[hidden],#hlg.px`)
- Chrome มือถือ vh > innerHeight ตอนแถบที่อยู่แสดง → วัดตำแหน่งจริง ห้ามคิดจาก innerHeight×สัดส่วน
- `scrollIntoView` หยุดการเลื่อนแบบนุ่มของหน้า (คู่มือ) → ตั้ง scrollTop เอง
- ป๊อปอัป MapLibre โฟกัสลิงก์นอกจอ → `focusAfterOpen:false`
- Browser pane ที่ถูกซ่อนไม่วาดเฟรม/ไม่เดิน rAF → ตรวจภาพด้วย Chrome headless · headless ไม่เดิน transition ถ้าไม่มีเฟรม → ใช้ prefers-reduced-motion
- LINE Flex: สีต้อง `#RRGGBB`/`#RRGGBBAA` เท่านั้น · span ไม่สืบทอด size · เพดาน 50 KB นับเป็นไบต์ UTF-8
- `notify.json` `log` เรียงใหม่สุดก่อน (อ่าน `slice(0,n)`)
- GitHub Pages อาจค้างรุ่นเก่า → สถานะอ่านจาก branch `state` (`scripts/lib/state.js`)
- GitHub API ไม่ล็อกอิน 60 ครั้ง/ชม. — อย่าวนถามสถานะ run
- API ต้นทางตอบทั้งประเทศ 0 จุด = ขัดข้อง ห้ามลบข้อมูลเดิม
- Excel ดับไฟ: หัวคอลัมน์ "ปี" ชน "ปีงบประมาณ"
- Python `round` ปัดครึ่งเข้าเลขคู่ (`pyRound`) — ตอนแปลงสคริปต์ .py เป็น JS
- สคริปต์ PowerShell 5.1 ที่มีภาษาไทยต้องบันทึก UTF-8 มี BOM
- ตัวรันคำสั่งของ Claude อยู่ใน sandbox: ไฟล์นอกโฟลเดอร์โปรเจกต์ งานตั้งเวลาของ Windows มองไม่เห็น
- VR: ค่าสูงสุดของวันต้องเป็นสูงสุดของค่ารายชั่วโมงที่จุด — ห้ามกลับไปใช้ `gvField('max')`
- ห้ามปลอม User-Agent เพื่อเลี่ยงการกันบอตของต้นทาง (TFDRS)

## ต้นฉบับ

- ระวัง: แก้ index.html ด้วย `String.replace` ใน Node — ข้อความแทนที่ที่มี `$$` / `$&` จะถูกตีความเป็นรูปแบบพิเศษ (เคยทำ `$$(` กลายเป็น `$(`) ใช้ `split(a).join(b)` แทน
- `apply()` ถูกเรียกก่อนสไตล์โหลด: ใช้ `(map.getStyle()||{})` และ try รอบ setTerrain (เคย throw จนบรรทัดตั้ง setInterval รีเฟรชไม่ทำงาน)
- แผนที่: `setup()` สร้างเลเยอร์ทั้งหมด (เรียกใน `style.load` และ `styledata` guard), `apply()`, สลับแผนที่ฐานด้วย `setStyle(...,{diff:false})` — **ห้ามเอา diff:false ออก** ไม่งั้นเลเยอร์หายเมื่อสลับฐาน
- คลาส `.stm` เป็นของป้ายสถานีวัดฝุ่น PM2.5 (คนละอันกับสถานีไฟป่า `.fsm`)

- **E1 integrity (16 พ.ย. 69)**: MapLibre js/css + ตัวโหลด xlsx/proj4 มี `integrity="sha384-…"` + `crossorigin="anonymous"` — เปลี่ยนรุ่น/URL ต้องคำนวณใหม่จากไฟล์จริง (`curl -sS URL | openssl dgst -sha384 -binary | base64` หรือ Node crypto) และเทียบกับ sha512 ที่ `https://api.cdnjs.com/libraries/<ชื่อ>/<รุ่น>?fields=sri` · ผิด = เบราว์เซอร์ไม่รันไฟล์ → `fail('โหลดไลบรารีแผนที่…')` · `test/csp.test.js` ล็อกรุ่น 4.7.1 (ยังไม่อัปเกรด — ต้องตรวจ setTerrain/addProtocol/cooperativeGestures ก่อน)
- **E2 CSP แบบรายงานอย่างเดียว**: `<meta http-equiv="Content-Security-Policy-Report-Only">` ไม่มีผล (มาตรฐานห้าม — เบราว์เซอร์เพิกเฉย) และ Pages ตั้ง header ไม่ได้ → ส่งเป็น header จาก `sw.js` (หน้าแรกที่ service worker ส่ง = ตั้งแต่ครั้งที่ 2 ที่เปิดเว็บ) + serve.js + check_site · นโยบายอยู่ที่ `scripts/lib/csp.js` ที่เดียว · **เพิ่มโดเมนภายนอกใหม่ใน index.html → csp.test.js ตรวจจาก grep ว่าอยู่ในนโยบาย** (โดเมนที่ประกอบในโค้ด เช่น `mt${i}.google.com` ต้องเพิ่มใน `EXTRA`) · ห้ามเปลี่ยนเป็น Content-Security-Policy (บังคับ) จนกว่าผู้ใช้อนุมัติหลังดู violation
- **E2 innerHTML**: ค่าจากภายนอก (API, ไฟล์ผู้ใช้, เซิร์ฟเวอร์) ต้องผ่าน `esc()` เสมอ · `node scripts/lint_html.js` บอกจุดใหม่ (check_site เตือน) — อย่าใช้ `--update-base` ปิดคำเตือนของค่าภายนอก
- **ห้ามใส่ `padding` ใน flyTo/easeTo/jumpTo** (ยกเว้นตั้งเป็น 0): MapLibre เก็บค่าค้างใน transform แล้ว `fitBounds({padding})` บวกซ้ำ → ปุ่มโฮมมือถือไม่ทำงาน (ที่ไม่พอ) / เดสก์ท็อปซูมออกเกิน หลังกดตำแหน่งของฉันหรือเปิดรายละเอียดจุด (ผู้ใช้แจ้ง 18 พ.ย. 69) — ใช้ `offset:padOff(pad)` แทน · `fitHome` รีเซ็ต padding ค้างกันไว้อีกชั้น
