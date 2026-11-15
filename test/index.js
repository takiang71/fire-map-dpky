// จุดเข้าของ `node --test test/` — Node 22 ขึ้นไปถือ "test/" เป็นชื่อไฟล์ (ไม่ไล่หาไฟล์ในโฟลเดอร์แบบ Node 20)
// จึงแปลงเป็น test/index.js ตามกติกา require ของโฟลเดอร์ → ไฟล์นี้โหลด test/*.test.js ทุกไฟล์ (เรียงชื่อ) ให้รันในรอบเดียว
// เพิ่มเทสต์ใหม่ = สร้างไฟล์ test/<ชื่อ>.test.js เท่านั้น ไม่ต้องแก้ไฟล์นี้ (ดู docs/arch/testing.md)
const fs = require('fs'), path = require('path');
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()) require(path.join(__dirname, f));
