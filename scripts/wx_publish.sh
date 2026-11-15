#!/usr/bin/env bash
# ใช้ใน .github/workflows/wx.yml: commit ไฟล์ข้อมูลชุดเดียวแล้ว push (ดึงทับ+ลองใหม่เมื่อชนกับ sync/คนแก้) แล้วสั่ง site เผยแพร่ทันที
# ใช้: bash scripts/wx_publish.sh "<ชื่อชุด>" <ไฟล์/โฟลเดอร์>...   (ต้องตั้ง GH_TOKEN)
set -e
name="$1"; shift
git add "$@"
if git diff --cached --quiet; then echo "$name: ไม่มีข้อมูลใหม่"; exit 0; fi
git commit -qm "wx: $name $(TZ=Asia/Bangkok date '+%Y-%m-%d %H:%M')"
for i in 1 2 3 4 5; do
  if git pull -q --rebase && git push -q; then ok=1; break; fi
  echo "push ไม่สำเร็จ ลองใหม่ ($i)"; sleep $((i * 5))
done
[ -n "$ok" ] || { echo "::error title=wx::push $name ไม่สำเร็จ"; exit 1; }
gh workflow run site.yml --ref main -f by=wx
echo "$name: commit แล้ว + สั่ง site"
