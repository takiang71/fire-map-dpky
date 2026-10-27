"""แปลง KMZ 5 ชุดใน data/kmz → data/geo.json (ลดจุด Douglas-Peucker ~12 ม.) แล้วฝังลง index.html
รัน: python3 scripts/kmz_to_geojson.py"""
import re,json,html,math
from xml.etree import ElementTree as ET
import zipfile,os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
KMZ={'k1':'conservation_areas_PAMO1.kmz','k2':'dong_yai_wildlife_sanctuary.kmz','k3':'fire_control_stations.kmz','k4':'fire_responsibility_areas_2570.kmz','k5':'Point47จุดเฝ้าระวัง69_Cp.kmz'}
def load(k):
    raw=zipfile.ZipFile(os.path.join(ROOT,'data','kmz',KMZ[k])).read('doc.kml').decode('utf8')
    if 'xmlns:xsi' not in raw: raw=raw.replace('<kml ','<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',1)
    return ET.fromstring(raw.encode('utf8'))
loc=lambda e:e.tag.split('}')[1]
def pms(r): return [e for e in r.iter() if loc(e)=='Placemark']
def parse_ring(txt):
    pts=[]
    for p in txt.split():
        a=p.split(',')
        if len(a)>=2: pts.append((float(a[0]),float(a[1])))
    return pts
def polys(pm):
    out=[]
    for pg in [e for e in pm.iter() if loc(e)=='Polygon']:
        outer=None;inner=[]
        for b in pg:
            if loc(b)=='outerBoundaryIs': outer=parse_ring([c for c in b.iter() if loc(c)=='coordinates'][0].text)
            elif loc(b)=='innerBoundaryIs': inner.append(parse_ring([c for c in b.iter() if loc(c)=='coordinates'][0].text))
        out.append([outer]+inner)
    return out
def dp(pts,tol):
    if len(pts)<3: return pts
    keep=[False]*len(pts);keep[0]=keep[-1]=True;st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop();ax,ay=pts[a];bx,by=pts[b];dx,dy=bx-ax,by-ay;L=dx*dx+dy*dy;md=-1;mi=-1
        for i in range(a+1,b):
            px,py=pts[i]
            if L==0:d=(px-ax)**2+(py-ay)**2
            else:
                t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L));d=(px-ax-t*dx)**2+(py-ay-t*dy)**2
            if d>md:md=d;mi=i
        if md>tol*tol: keep[mi]=True;st.append((a,mi));st.append((mi,b))
    return [p for p,k in zip(pts,keep) if k]
def area(r): return abs(sum(r[i][0]*r[i-1][1]-r[i-1][0]*r[i][1] for i in range(len(r))))/2
def simp(poly,tol):
    res=[]
    for i,r in enumerate(poly):
        if r[0]!=r[-1]: r=r+[r[0]]
        s=dp(r,tol)
        if len(s)<4 or area(s)<(tol*tol*4): 
            if i==0: s=r
            else: continue
        res.append([[round(x,5),round(y,5)] for x,y in s])
    return res
def cells(pm):
    d=pm.findtext('{*}description') or ''
    d=re.sub(r'<style.*?</style>','',d,flags=re.S)
    c=[re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',x))).strip() for x in re.findall(r'<td[^>]*>(.*?)</td>',d,re.S)]
    m={}
    for i in range(1,len(c)-1):
        if re.fullmatch(r'[A-Za-z_]+',c[i]) and c[i] not in m: m[c[i]]=c[i+1]
    return m
P1='สำนักบริหารพื้นที่อนุรักษ์ที่ 1 (ปราจีนบุรี)';P7='สำนักบริหารพื้นที่อนุรักษ์ที่ 7 (นครราชสีมา)'
def paro(s):
    s=re.sub(r'\s+','',s or '')
    return P1 if 'ที่1' in s else P7 if 'ที่7' in s else s
TOL=0.00012
TYPE={'NPRK':'อุทยานแห่งชาติ','WLDS':'เขตรักษาพันธุ์สัตว์ป่า','P_WLDS':'เตรียมประกาศเป็นเขตห้ามล่าสัตว์ป่า'}
cons=[]
for k in ['k1','k2']:
    for pm in pms(load(k)):
        a=cells(pm);ps=polys(pm)
        if k=='k2': name='เขตรักษาพันธุ์สัตว์ป่าดงใหญ่';ty='WLDS';pa=P7;rai=float(a.get('Area__RAI_',0))
        else: name=a.get('NAME_TH') or pm.findtext('{*}name');ty=a.get('TYPE');pa=paro(a.get('PARO'));rai=float(a.get('AERA__RAI',0))
        cons.append({'type':'Feature','properties':{'name':name,'kind':ty,'kindTh':TYPE.get(ty,ty),'paro':pa,'rai':round(rai)},'geometry':{'type':'MultiPolygon','coordinates':[simp(p,TOL) for p in ps]}})
resp=[]
for pm in pms(load('k4')):
    a=cells(pm);ps=polys(pm)
    st=a.get('Station','').strip()
    resp.append({'type':'Feature','properties':{'station':st,'paro':paro(a.get('PARO')),'ftype':a.get('FType','').strip(),'loc':a.get('Location','').strip().replace('ตาพระตา','ตาพระยา'),'tam':re.sub(r'\s*,\s*',', ',a.get('Subdistric','').strip().strip(',')),'amp':re.sub(r'\s*,\s*',', ',a.get('District','').strip().strip(',')),'prov':re.sub(r'\s*,\s*',', ',a.get('Province','').strip().strip(',')),'rai':int(float(a.get('Area',0) or 0))},'geometry':{'type':'MultiPolygon','coordinates':[simp(p,TOL) for p in ps]}})
stn=[]
for pm in pms(load('k3')):
    a=cells(pm);co=[c for c in pm.iter() if loc(c)=='coordinates'][0].text.split(',')
    stn.append({'type':'Feature','properties':{'name':pm.findtext('{*}name').strip(),'paro':paro(a.get('PARO')),'tam':a.get('SUBDISTRIC',''),'amp':a.get('District',''),'prov':a.get('Province','')},'geometry':{'type':'Point','coordinates':[round(float(co[0]),5),round(float(co[1]),5)]}})
# จุดเฝ้าระวังไฟป่า ปี 2569 (47 จุด) — แก้คำสะกดชนิดป่าที่พิมพ์ผิดในต้นฉบับ
FTFIX=[('ป่าเบจพรรณ','ป่าเบญจพรรณ'),('ป่าเต็มรัง','ป่าเต็งรัง')]
def ftype(s):
    s=s.strip()
    for a,b in FTFIX: s=s.replace(a,b)
    return 'ป่า'+s if s and not s.startswith('ป่า') else s
wpt=[]
for pm in pms(load('k5')):
    a=cells(pm);co=[c for c in pm.iter() if loc(c)=='coordinates'][0].text.split(',')
    g=lambda k:a.get(k,'').strip()
    wpt.append({'type':'Feature','properties':{'name':pm.findtext('{*}name').strip(),'station':g('Station'),'loc':g('Location'),'ftype':ftype(g('Forest_typ')),'vil':g('Village'),'moo':g('Village_No'),'tam':g('Subdistric'),'amp':g('District'),'prov':g('Provance'),'utm':'%s %sE %sN'%(g('Zone'),g('UTM_X'),g('UTM_Y'))},'geometry':{'type':'Point','coordinates':[round(float(co[0]),5),round(float(co[1]),5)]}})
G={'cons':{'type':'FeatureCollection','features':cons},'resp':{'type':'FeatureCollection','features':resp},'stn':{'type':'FeatureCollection','features':stn},'wpt':{'type':'FeatureCollection','features':wpt}}
for n in ('cons','resp','stn'):
    for f in G[n]['features']:
        f['properties']['pn']='1' if 'ที่ 1' in f['properties']['paro'] else '7'
s=json.dumps(G,ensure_ascii=False,separators=(',',':'))
open(os.path.join(ROOT,'data','geo.json'),'w',encoding='utf8').write(s)
# ฝังลง index.html (แทนบล็อก <script type="application/json" id="geo">)
H=os.path.join(ROOT,'index.html');h=open(H,encoding='utf8').read()
h=re.sub(r'(<script type="application/json" id="geo">).*?(</script>)',lambda m:m.group(1)+s.replace('</','<\\/')+m.group(2),h,count=1,flags=re.S)
open(H,'w',encoding='utf8').write(h)
def npts(f):
    g=f['geometry'];return sum(len(r) for p in g['coordinates'] for r in p) if g['type']=='MultiPolygon' else 1
print('bytes',len(s.encode()))
for n in G:
    for f in G[n]['features']: print(n,f['properties'].get('name') or f['properties'].get('station'),npts(f),f['properties'].get('paro','')[-14:],f['properties'].get('rai'))
