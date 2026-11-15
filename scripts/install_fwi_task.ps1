# ตั้ง Task Scheduler "fire-map FWI" ให้เครื่องนี้ดึง FWI/FFMC จาก TFDRS แล้ว push ขึ้น GitHub (scripts/fwi_local.js)
# ผู้ใช้สั่ง 15 พ.ย. 69 — TFDRS ไม่อนุญาตเครื่องของ GitHub Actions (Cloudflare 403 challenge) จึงต้องดึงจากเครื่องผู้ดูแล
# ต่างจาก Task Scheduler ของ sync เดิม (ลบแล้ว 30 ต.ค. 69): งานนี้ทำในโคลนแยก .fwi-local\repo (ignore ไว้)
#   ไม่แตะไฟล์งาน และ commit เฉพาะ data/fwi/index.json + branch fwi-grid จึงไม่ชนกับ sync บน Actions
# รอบ: 14:40 15:40 17:00 20:00 น. (ต้นทางออก ~14:20 น., ไม่มีรอบใหม่ = จบในไม่กี่วินาที) + 07:00 น. เก็บตก
#   เครื่องปิดตอนถึงเวลา = รันทันทีที่เปิดเครื่อง (StartWhenAvailable) · ต้องล็อกอินอยู่ (ใช้ credential ของ Git Credential Manager)
#   รันแบบย่อหน้าต่าง (หน้าต่างดำเด้งแล้วหายเอง ~10 วิ เมื่อไม่มีรอบใหม่)
# ใช้: powershell -ExecutionPolicy Bypass -File scripts\install_fwi_task.ps1        ลบ: ... -Remove
# ไฟล์นี้ต้องบันทึกแบบ UTF-8 มี BOM (Windows PowerShell 5.1 อ่านไฟล์ไม่มี BOM เป็น ANSI → ภาษาไทยเพี้ยน)
param([switch]$Remove)
$name = 'fire-map FWI'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; "ลบงาน $name แล้ว"; return }
$node = (Get-Command node).Source
$root = Split-Path $PSScriptRoot -Parent
$script = Join-Path $PSScriptRoot 'fwi_local.js'
$act = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $root
$tr = @('07:00', '14:40', '15:40', '17:00', '20:00') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$pr = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $act -Trigger $tr -Settings $set -Principal $pr -Description 'ดึงดัชนีอันตรายไฟป่า FWI/FFMC จาก TFDRS กรมป่าไม้ แล้ว push ขึ้น GitHub (fire-map-dpky) — scripts/fwi_local.js' -Force | Out-Null
"ตั้งงาน '$name' แล้ว: 07:00 14:40 15:40 17:00 20:00 น. · บันทึก $root\.fwi-local\fwi_local.log"
