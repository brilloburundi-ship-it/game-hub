from PIL import Image, ImageDraw, ImageFilter
import numpy as np, random, json, math, os, shutil
from collections import deque

SEED=260811
random.seed(SEED)
np.random.seed(SEED)

OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(OUT,'assets','map'), exist_ok=True)

GW,GH=88,64
TW,TH=40,20
ORIGIN_X=1720
ORIGIN_Y=135
MAP_W=3900
MAP_H=1900

# --- smooth multi-octave noise ---
def noise_field(w,h,cw,ch,seed):
    rng=np.random.default_rng(seed)
    a=(rng.random((ch,cw))*255).astype(np.uint8)
    im=Image.fromarray(a,'L').resize((w,h),Image.Resampling.BICUBIC)
    arr=np.asarray(im,dtype=np.float32)/255.0
    return (arr-arr.mean())/(arr.std()+1e-6)

n1=noise_field(GW,GH,8,6,SEED)
n2=noise_field(GW,GH,16,12,SEED+1)
n3=noise_field(GW,GH,32,23,SEED+2)
moist=noise_field(GW,GH,10,8,SEED+3)
rough=noise_field(GW,GH,12,9,SEED+4)

land=np.zeros((GH,GW),dtype=np.uint8)
field=np.zeros((GH,GW),dtype=np.float32)
for y in range(GH):
    for x in range(GW):
        u=(x/(GW-1)-0.5)*2
        v=(y/(GH-1)-0.5)*2
        base=1.0-(u/1.03)**2-(v/0.82)**2
        # organic lobes / peninsulas
        def gauss(cx,cy,sx,sy,amp):
            return amp*math.exp(-(((u-cx)/sx)**2+((v-cy)/sy)**2))
        shape=base
        shape += gauss(-0.78,0.00,0.44,0.46,0.52)
        shape += gauss(0.78,-0.08,0.40,0.42,0.45)
        shape += gauss(0.30,0.72,0.44,0.32,0.28)
        shape += gauss(-0.15,-0.72,0.34,0.30,0.22)
        # bays / coves
        shape -= gauss(-0.62,-0.48,0.25,0.24,0.36)
        shape -= gauss(0.57,0.54,0.28,0.24,0.40)
        shape -= gauss(0.04,0.83,0.28,0.20,0.22)
        shape += 0.20*n1[y,x]+0.085*n2[y,x]+0.025*n3[y,x]
        field[y,x]=shape
        land[y,x]=1 if shape>0.02 else 0

# Remove tiny detached noise components; keep main island + medium islets.
seen=np.zeros_like(land,bool); comps=[]
for y in range(GH):
    for x in range(GW):
        if not land[y,x] or seen[y,x]: continue
        q=[(x,y)]; seen[y,x]=1; comp=[]
        while q:
            ax,ay=q.pop(); comp.append((ax,ay))
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny=ax+dx,ay+dy
                if 0<=nx<GW and 0<=ny<GH and land[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=1;q.append((nx,ny))
        comps.append(comp)
comps.sort(key=len,reverse=True)
keep=set(comps[0])
for comp in comps[1:]:
    if len(comp)>=10: keep.update(comp)
for y in range(GH):
    for x in range(GW): land[y,x]=1 if (x,y) in keep else 0

# Small islands: added as terrain only, using the same tile renderer/palette as the original map.
for cx,cy,rx,ry in [(9,13,3,2),(80,12,3,2),(81,53,3,2),(13,55,3,2),(73,58,2,2)]:
    for yy in range(max(1,cy-ry-1),min(GH-1,cy+ry+2)):
        for xx in range(max(1,cx-rx-1),min(GW-1,cx+rx+2)):
            if ((xx-cx)/rx)**2+((yy-cy)/ry)**2 <= 1.0:
                land[yy,xx]=1

# Carve a few irregular inland lakes, but keep all rendering in the original map generator.
def calc_coast(mask):
    inf=999
    out=np.full((GH,GW),inf,dtype=np.int16)
    qq=deque()
    for yy in range(GH):
        for xx in range(GW):
            if mask[yy,xx]==0:
                out[yy,xx]=0; qq.append((xx,yy))
    while qq:
        xx,yy=qq.popleft()
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=xx+dx,yy+dy
            if 0<=nx<GW and 0<=ny<GH and out[ny,nx]>out[yy,xx]+1:
                out[ny,nx]=out[yy,xx]+1; qq.append((nx,ny))
    return out

precoast=calc_coast(land)
lake_candidates=[]
for yy in range(7,GH-7):
    for xx in range(7,GW-7):
        if land[yy,xx] and precoast[yy,xx]>=8:
            lake_candidates.append((int(precoast[yy,xx]),xx,yy))
lake_candidates.sort(reverse=True)
lake_centers=[]
for _,cx,cy in lake_candidates:
    if all(math.hypot(cx-ax,cy-ay)>15 for ax,ay in lake_centers):
        lake_centers.append((cx,cy))
    if len(lake_centers)>=4: break
for li,(cx,cy) in enumerate(lake_centers):
    rx=2.4+(li%2)*0.5; ry=1.7+((li+1)%2)*0.35
    for yy in range(max(2,cy-4),min(GH-2,cy+5)):
        for xx in range(max(2,cx-4),min(GW-2,cx+5)):
            wobble=random.Random(SEED+li*10000+xx*101+yy*307).random()*0.10
            if ((xx-cx)/rx)**2+((yy-cy)/ry)**2 <= 0.92+wobble and precoast[yy,xx]>=5:
                land[yy,xx]=0

# Coast distance (Manhattan through land): 0 water, 1 coast land.
INF=999
coast=np.full((GH,GW),INF,dtype=np.int16)
q=deque()
for y in range(GH):
    for x in range(GW):
        if land[y,x]==0:
            coast[y,x]=0;q.append((x,y))
while q:
    x,y=q.popleft()
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx,ny=x+dx,y+dy
        if 0<=nx<GW and 0<=ny<GH and coast[ny,nx]>coast[y,x]+1:
            coast[ny,nx]=coast[y,x]+1;q.append((nx,ny))

biomes=[['ocean']*GW for _ in range(GH)]
for y in range(GH):
    for x in range(GW):
        if not land[y,x]: continue
        yy=y/(GH-1); xx=x/(GW-1)
        # mountains: two natural ridges; keep away from coast
        ridge1=14+0.23*x+2.8*math.sin(x/7.5)
        ridge2=31-0.16*x+2.4*math.sin(x/6.0+1.8)
        is_mountain=(coast[y,x]>=3 and rough[y,x]>0.15 and (abs(y-ridge1)<1.6 or (x<30 and abs(y-ridge2)<1.0)))
        north_cold=(yy<0.16 and coast[y,x]>=2 and n2[y,x]>-0.35)
        desert_zone=(xx>0.63 and yy>0.42 and moist[y,x]<0.85) or (xx>0.73 and yy>0.30)
        if coast[y,x]==1:
            biomes[y][x]='ice_coast' if north_cold else 'beach'
        elif is_mountain:
            biomes[y][x]='mountain'
        elif north_cold:
            biomes[y][x]='tundra'
        elif desert_zone:
            biomes[y][x]='desert'
        elif moist[y,x]>0.15 and coast[y,x]>=2:
            biomes[y][x]='forest'
        else:
            biomes[y][x]='grass'

# Rivers: from deep mountain/forest cells to ocean, by descending coast distance.
rivers=[]
cands=[]
for y in range(GH):
    for x in range(GW):
        if land[y,x] and coast[y,x]>=8 and biomes[y][x] in ('mountain','forest'):
            cands.append((coast[y,x]+random.random()*3,x,y))
cands.sort(reverse=True)
starts=[]
for _,x,y in cands:
    if all(math.hypot(x-a,y-b)>13 for a,b in starts):
        starts.append((x,y))
    if len(starts)>=5: break
for sx,sy in starts:
    path=[(sx,sy)]; x,y=sx,sy; visited={(x,y)}
    for _ in range(80):
        if coast[y,x]<=1: break
        opts=[]
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<GW and 0<=ny<GH and land[ny,nx] and (nx,ny) not in visited:
                score=coast[ny,nx] + random.random()*1.2 + (0.35 if biomes[ny][nx]=='mountain' else 0)
                opts.append((score,nx,ny))
        if not opts: break
        opts.sort(key=lambda z:z[0]); _,x,y=opts[0]
        visited.add((x,y));path.append((x,y))
    if len(path)>=6: rivers.append(path)

# Resources used later by economy visualization / potential bridge.
resources=[]
for y in range(GH):
    for x in range(GW):
        if not land[y,x] or coast[y,x]<2: continue
        b=biomes[y][x]
        r=random.Random(SEED+x*7907+y*104729)
        p=r.random()
        if b=='forest' and p<0.13: resources.append([x,y,'wood'])
        elif b=='mountain' and p<0.26: resources.append([x,y,'stone'])
        elif b=='grass' and p<0.035: resources.append([x,y,'food'])
        elif b=='desert' and p<0.025: resources.append([x,y,'gold'])

# --- render pixel-art style static world ---
im=Image.new('RGB',(MAP_W,MAP_H),(24,70,104)); d=ImageDraw.Draw(im)
# ocean gradient horizontal bands
for yy in range(MAP_H):
    t=yy/(MAP_H-1)
    col=(25+int(8*t),76+int(13*t),116+int(12*t))
    d.line((0,yy,MAP_W,yy),fill=col)
# water streaks
rr=random.Random(SEED+55)
for _ in range(1150):
    x=rr.randrange(15,MAP_W-15); y=rr.randrange(20,MAP_H-20)
    ln=rr.choice([3,4,6,8,10]); shade=rr.choice([(45,103,145),(54,113,153),(34,91,132)])
    d.line((x,y,x+ln,y),fill=shade,width=1)

# Helpers
def iso(x,y): return (ORIGIN_X+(x-y)*TW//2, ORIGIN_Y+(x+y)*TH//2)
def diamond(cx,cy): return [(cx,cy-TH//2),(cx+TW//2,cy),(cx,cy+TH//2),(cx-TW//2,cy)]
COL={
 'grass':((118,178,78),(103,160,69)),
 'forest':((92,158,70),(78,139,62)),
 'beach':((214,194,132),(194,171,111)),
 'desert':((221,190,126),(202,166,102)),
 'tundra':((195,213,190),(171,195,178)),
 'ice_coast':((220,230,218),(194,212,204)),
 'mountain':((128,145,128),(103,124,113)),
}
# shallow-water halo around coast ocean tiles
for y in range(GH):
    for x in range(GW):
        if land[y,x]: continue
        near=False
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<GW and 0<=ny<GH and land[ny,nx]:near=True
        if near:
            cx,cy=iso(x,y)
            d.polygon(diamond(cx,cy),fill=(44,119,151))

# Tiles sorted by depth.
for depth in range(GW+GH-1):
    for y in range(GH):
        x=depth-y
        if not (0<=x<GW) or not land[y,x]: continue
        cx,cy=iso(x,y); b=biomes[y][x]
        top,shade=COL[b]
        local=random.Random(SEED+x*5003+y*9151)
        delta=local.choice([-5,-3,0,0,2,4])
        top2=tuple(max(0,min(255,c+delta)) for c in top)
        # visible cliff/soil sides on south-facing coastline
        if x+1>=GW or land[y,x+1]==0:
            d.polygon([(cx+TW//2,cy),(cx,cy+TH//2),(cx,cy+TH//2+5),(cx+TW//2,cy+5)],fill=(117,96,70) if b not in ('tundra','ice_coast') else (151,170,166))
        if y+1>=GH or land[y+1,x]==0:
            d.polygon([(cx,cy+TH//2),(cx-TW//2,cy),(cx-TW//2,cy+5),(cx,cy+TH//2+5)],fill=(129,104,74) if b not in ('tundra','ice_coast') else (160,178,173))
        d.polygon(diamond(cx,cy),fill=top2)
        # subtle natural texture, no grid outline
        if b in ('grass','forest'):
            for _ in range(local.randrange(0,3)):
                px=cx+local.randrange(-13,14); py=cy+local.randrange(-5,6)
                d.point((px,py),fill=(75,137,61))
        elif b in ('beach','desert'):
            for _ in range(local.randrange(0,3)):
                px=cx+local.randrange(-14,15); py=cy+local.randrange(-5,6)
                d.point((px,py),fill=(183,152,96))
        elif b in ('tundra','ice_coast') and local.random()<.35:
            d.line((cx-4,cy,cx+4,cy),fill=(225,234,225))

# rivers, slightly wide dark bank + bright water
for path in rivers:
    pts=[iso(x,y) for x,y in path]
    if len(pts)>1:
        d.line(pts,fill=(72,105,92),width=5,joint='curve')
        d.line(pts,fill=(56,139,166),width=3,joint='curve')
        for i in range(1,len(pts),3):
            x,y=pts[i]; d.line((x-2,y-1,x+3,y-1),fill=(100,181,191),width=1)

# Decorations, same visual language as the previous static map.
def tree(cx,cy,scale=1.0,snow=False):
    s=max(1,int(scale))
    trunk=(93,61,37); outline=(38,70,48)
    d.rectangle((cx-1*s,cy-1*s,cx+1*s,cy+5*s),fill=trunk)
    greens=[(44,116,61),(54,139,65),(68,153,72)]
    if snow: greens=[(105,142,120),(145,170,147),(215,226,211)]
    d.polygon([(cx,cy-12*s),(cx-7*s,cy-2*s),(cx+7*s,cy-2*s)],fill=outline)
    d.polygon([(cx,cy-11*s),(cx-6*s,cy-2*s),(cx+6*s,cy-2*s)],fill=greens[0])
    d.polygon([(cx,cy-8*s),(cx-8*s,cy+2*s),(cx+8*s,cy+2*s)],fill=greens[1])
    d.polygon([(cx,cy-4*s),(cx-7*s,cy+5*s),(cx+7*s,cy+5*s)],fill=greens[2])

def round_tree(cx,cy):
    d.rectangle((cx-1,cy,cx+1,cy+6),fill=(92,58,34))
    d.ellipse((cx-7,cy-10,cx+7,cy+4),fill=(38,104,53),outline=(31,77,47))
    d.ellipse((cx-5,cy-11,cx+4,cy-2),fill=(52,133,60))

def mountain(cx,cy,large=True,snow=False):
    h=20 if large else 14; w=17 if large else 12
    d.polygon([(cx,cy-h),(cx-w,cy+7),(cx+w,cy+7)],fill=(73,88,82))
    d.polygon([(cx,cy-h+2),(cx-2,cy+6),(cx+w,cy+7)],fill=(123,137,126))
    if snow:
        d.polygon([(cx,cy-h),(cx-6,cy-h+8),(cx,cy-h+6),(cx+5,cy-h+9)],fill=(227,234,229))
    else:
        d.polygon([(cx,cy-h),(cx-5,cy-h+7),(cx,cy-h+5),(cx+4,cy-h+8)],fill=(167,176,163))

def cactus(cx,cy):
    col=(54,128,74); dark=(38,94,59)
    d.rectangle((cx-2,cy-10,cx+2,cy+6),fill=dark)
    d.rectangle((cx-1,cy-9,cx+1,cy+5),fill=col)
    d.rectangle((cx-6,cy-5,cx-2,cy-2),fill=dark); d.rectangle((cx-5,cy-7,cx-3,cy-3),fill=col)
    d.rectangle((cx+2,cy-4,cx+6,cy-1),fill=dark); d.rectangle((cx+3,cy-6,cx+5,cy-2),fill=col)

def rock(cx,cy,light=False):
    c=(151,156,150) if light else (96,107,102); hi=(188,191,181) if light else (132,141,133)
    d.polygon([(cx-5,cy+2),(cx-2,cy-5),(cx+4,cy-4),(cx+7,cy+2),(cx+3,cy+5),(cx-4,cy+5)],fill=c)
    d.polygon([(cx-2,cy-4),(cx+3,cy-3),(cx+1,cy),(cx-4,cy+1)],fill=hi)

def flower(cx,cy):
    d.point((cx,cy),fill=(56,111,57)); d.point((cx,cy-1),fill=(235,219,89))

# Forest remains the same darker biome. Individual trees come from the existing tree-depth renderer.
for depth in range(GW+GH-1):
    for y in range(GH):
        x=depth-y
        if not (0<=x<GW) or not land[y,x]: continue
        cx,cy=iso(x,y); b=biomes[y][x]
        r=random.Random(SEED+900000+x*1543+y*3571)
        if b=='forest':
            if r.random()<.08: flower(cx+r.randint(-12,12),cy+r.randint(-4,4))
        elif b=='grass':
            if r.random()<.10: flower(cx+r.randint(-12,12),cy+r.randint(-4,4))
        elif b=='mountain':
            mountain(cx,cy-2,large=r.random()<.6,snow=y<12)
            if r.random()<.35: rock(cx+r.randint(-12,12),cy+r.randint(1,6))
        elif b=='tundra':
            if r.random()<.42: tree(cx+r.randint(-10,10),cy+r.randint(-3,5),snow=True)
            elif r.random()<.25: rock(cx,cy,light=True)
        elif b=='desert':
            if r.random()<.25: cactus(cx+r.randint(-10,10),cy+r.randint(-2,5))
            elif r.random()<.18: rock(cx,cy)
        elif b in ('beach','ice_coast'):
            if r.random()<.10: rock(cx+r.randint(-10,10),cy+r.randint(-2,4),light=b=='ice_coast')

for x,y,t in resources:
    cx,cy=iso(x,y)
    if t=='wood':
        d.rectangle((cx-5,cy-1,cx+4,cy+1),fill=(107,67,39)); d.point((cx+4,cy),fill=(178,126,68))
    elif t=='stone': rock(cx,cy)
    elif t=='gold':
        d.polygon([(cx,cy-5),(cx+4,cy),(cx,cy+4),(cx-4,cy)],fill=(227,181,50)); d.point((cx-1,cy-2),fill=(255,228,100))
    elif t=='food':
        for k in range(3): d.line((cx-3+k*3,cy+4,cx-3+k*3,cy-5),fill=(204,170,58),width=1)

for y in range(GH):
    for x in range(GW):
        if not land[y,x]: continue
        if coast[y,x]==1:
            cx,cy=iso(x,y)
            if x+1>=GW or land[y,x+1]==0: d.line((cx+TW//2-2,cy,cx+2,cy+TH//2-1),fill=(142,205,202),width=1)
            if y+1>=GH or land[y+1,x]==0: d.line((cx-2,cy+TH//2-1,cx-TW//2+2,cy),fill=(142,205,202),width=1)

map_path=os.path.join(OUT,'assets/map/world.png')
im.save(map_path,optimize=True,compress_level=9)
world={
    'gridW':GW,'gridH':GH,'tileW':TW,'tileH':TH,'originX':ORIGIN_X,'originY':ORIGIN_Y,
    'mapWidth':MAP_W,'mapHeight':MAP_H,'land':land.tolist(),'biomes':biomes,
    'coastDistance':coast.tolist(),'resources':resources,'rivers':rivers,'seed':SEED,
    'version':'organic-v4-expanded-same-style'
}
with open(os.path.join(OUT,'assets/map/world.json'),'w',encoding='utf-8') as f: json.dump(world,f,separators=(',',':'))

# Data for the existing tree-depth renderer only; no additional runtime system.
trees=[]
tree_id=0
for y in range(GH):
    for x in range(GW):
        if not land[y,x]: continue
        b=biomes[y][x]
        if b not in ('forest','grass','tundra'): continue
        r=random.Random(SEED+1300000+x*7907+y*104729)
        chance=.84 if b=='forest' else (.22 if b=='tundra' else .08)
        if r.random()>=chance: continue
        count=1 + (1 if b=='forest' and r.random()<.46 else 0) + (1 if b=='forest' and r.random()<.16 else 0)
        cx,cy=iso(x,y)
        for _ in range(count):
            t='pine-snow' if b=='tundra' else ('pine' if r.random()<.64 else 'round')
            trees.append({'id':tree_id,'type':t,'x':int(cx+r.randint(-12,12)),'y':int(cy+r.randint(-4,6)),'cell':[x,y]})
            tree_id+=1
vegetation={'version':'organic-v4-expanded-same-style','trees':trees}
with open(os.path.join(OUT,'assets/map/vegetation.json'),'w',encoding='utf-8') as f: json.dump(vegetation,f,separators=(',',':'))

print('generated', map_path, os.path.getsize(map_path)//1024,'KB', 'land',int(land.sum()),'resources',len(resources),'rivers',len(rivers),'trees',len(trees))
