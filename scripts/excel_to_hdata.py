"""อ่าน Excel จุดความร้อนย้อนหลัง (ชีตแรก, คอลัมน์ตามไฟล์ DPKY61-69) แล้วเข้ารหัสแบบ dictionary ฝังลง index.html
ใช้ dictionary เดิมเป็นฐานเพื่อให้ลำดับเดิมคงที่ · รัน: python3 scripts/excel_to_hdata.py [ไฟล์.xlsx]"""
import openpyxl,json,re,datetime
import os,sys
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
P=os.path.join(ROOT,'index.html')
X=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'data','Data_hotspots_61-69_DPYK_Full2.xlsx')
h=open(P,encoding='utf8').read()
old=json.loads(re.search(r'id="hdata">(.*?)</script>',h,re.S).group(1))
wb=openpyxl.load_workbook(X,read_only=True,data_only=True)
rows=list(wb.worksheets[0].iter_rows(values_only=True))[1:]
D={k:list(old[k]) for k in ['pv','am','tm','ar','ld','fu','st','sb']}
def idx(k,v):
    v=(v or '').strip() if isinstance(v,str) else ('' if v is None else str(v))
    if v not in D[k]: D[k].append(v)
    return D[k].index(v)
def hhmm(t):
    s='%.2f'%float(t); a,b=s.split('.'); return int(a)*100+int(b)
out=[]
for r in rows:
    d=(r[1].date()-datetime.date(1970,1,1)).days
    out.append([d,hhmm(r[2]),round(float(r[3])*1e5),round(float(r[4])*1e5),idx('pv',r[9]),idx('am',r[8]),idx('tm',(r[7] or '').strip()+'|'+(r[8] or '').strip()),idx('ar',r[10]),idx('ld',r[14]),idx('fu',r[13]),idx('st',r[11]),idx('sb',r[12])])
# compare with old
o=old['r'];same=sum(1 for a,b in zip(out,o) if a==b);print('same prefix',same,'of',len(o))
diff=[(i,a,b) for i,(a,b) in enumerate(zip(out,o)) if a!=b][:5];print(diff)
print({k:(len(old[k]),len(D[k])) for k in D}, {k:D[k][len(old[k]):] for k in D if len(D[k])>len(old[k])})
# รวมชื่อสถานีที่สะกดต่างกัน (เว้นวรรครอบขีด) ให้เป็นชื่อเดียว
norm={}
for i,v in enumerate(D['st']):
    k=re.sub(r'\s','',v)
    norm.setdefault(k,i)
remap={i:norm[re.sub(r'\s','',v)] for i,v in enumerate(D['st'])}
for r in out: r[10]=remap[r[10]]
keep=sorted(set(remap.values()));newi={o:n for n,o in enumerate(keep)};D['st']=[D['st'][o] for o in keep]
for r in out: r[10]=newi[r[10]]
s=json.dumps({**D,'r':out},ensure_ascii=False,separators=(',',':'))
h=re.sub(r'(<script type="application/json" id="hdata">).*?(</script>)',lambda m:m.group(1)+s+m.group(2),h,count=1,flags=re.S)
open(P,'w',encoding='utf8').write(h);print('rows',len(out))
