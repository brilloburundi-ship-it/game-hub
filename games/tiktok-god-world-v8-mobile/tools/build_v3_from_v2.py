from PIL import Image
import numpy as np, cv2, os, shutil, json, zipfile, math

SRC_PROJ='/mnt/data/TikTok-God-World-Pixi-v2-organic'
OUT='/mnt/data/TikTok-God-World-Pixi-v3-civilizations'
BUILD_SRC='/mnt/data/sprite_medievali_pixel_art_del_regno_blu.png'
if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(SRC_PROJ, OUT)

# -----------------------------------------------------------------------------
# 1) Re-extract CLEAN blue civilization buildings directly from the transparent
#    source sheet. This removes neighbor fragments inherited by the v2 crops.
# -----------------------------------------------------------------------------
src=Image.open(BUILD_SRC).convert('RGBA')
boxes={
    'castle':(48,13,48+349,13+413),
    'keep':(509,54,509+321,54+354),
    'gate':(926,93,926+370,93+306),
    'watchtower':(1103,395,1103+147,395+227),
    'stone_tower':(867,403,867+144,403+216),
    'wall':(40,436,40+178,436+172),
    'wall_corner':(539,455,539+195,455+159),
    'house_a':(25,611,25+199,611+204),
    # Component 9 in the generated source contains two nearby assets; split them.
    'house_b':(270,620,510,815),
    'windmill':(340,820,530,1024),
    'stable':(1281,621,1281+237,621+189),
    'house_c':(543,625,543+193,625+190),
    'forge':(1033,626,1033+217,626+186),
    'barracks':(778,629,778+231,629+183),
    'church':(810,811,810+208,811+198),
    'silo':(574,818,574+184,818+185),
    'warehouse':(1294,824,1294+216,824+175),
    'farm':(25,825,25+260,825+180),
    'market':(1049,835,1049+232,835+173),
}

def trim_alpha(im, pad=2):
    a=np.array(im.getchannel('A'))
    ys,xs=np.where(a>18)
    if len(xs)==0: return Image.new('RGBA',(1,1),(0,0,0,0))
    return im.crop((max(0,int(xs.min())-pad),max(0,int(ys.min())-pad),min(im.width,int(xs.max())+pad+1),min(im.height,int(ys.max())+pad+1)))

def clean_alpha(im):
    arr=np.array(im.convert('RGBA'))
    # hard alpha is lighter and avoids colored edge halos in pixel rendering
    arr[...,3]=np.where(arr[...,3]>24,255,0).astype(np.uint8)
    return Image.fromarray(arr,'RGBA')

build_dir=os.path.join(OUT,'assets','buildings')
os.makedirs(build_dir,exist_ok=True)
manifest={}
# Downsample source art to lightweight native sprite sizes. Renderer normalizes
# visual scale, so source dimensions no longer affect in-game size.
for name,box in boxes.items():
    im=clean_alpha(trim_alpha(src.crop(box),2))
    # ~46% of generated source resolution, nearest-neighbor only.
    scale=0.46
    nw=max(24,int(round(im.width*scale))); nh=max(24,int(round(im.height*scale)))
    im=im.resize((nw,nh),Image.Resampling.NEAREST)
    im=trim_alpha(im,1)
    path=os.path.join(build_dir,name+'.png')
    im.save(path,optimize=True,compress_level=9)
    manifest[name]={'file':f'assets/buildings/{name}.png','w':im.width,'h':im.height}
with open(os.path.join(build_dir,'manifest.json'),'w',encoding='utf-8') as f:
    json.dump(manifest,f,indent=2)

# -----------------------------------------------------------------------------
# 2) Clean neutral farmer sheets. Remove stray disconnected bits and replace
#    malformed frames ONLY with another frame from the SAME action.
# -----------------------------------------------------------------------------
npc_dir=os.path.join(OUT,'assets','npc')
old_manifest=json.load(open(os.path.join(npc_dir,'manifest.json'),encoding='utf-8'))

def largest_component_frame(fr):
    arr=np.array(fr.convert('RGBA'))
    mask=(arr[...,3]>18).astype(np.uint8)
    n,lab,stats,_=cv2.connectedComponentsWithStats(mask,8)
    if n<=1:
        arr[...,3]=0
        return Image.fromarray(arr,'RGBA')
    areas=[int(stats[i,4]) for i in range(1,n)]
    main=1+int(np.argmax(areas))
    keep=(lab==main)
    # keep medium components that are very near the main component (e.g. tool tip)
    x,y,w,h,_=stats[main]
    for i in range(1,n):
        if i==main: continue
        xx,yy,ww,hh,area=stats[i]
        if area<10: continue
        dx=max(x-(xx+ww),xx-(x+w),0); dy=max(y-(yy+hh),yy-(y+h),0)
        if math.hypot(dx,dy)<=3:
            keep |= (lab==i)
    arr[...,3]=np.where(keep,255,0).astype(np.uint8)
    return Image.fromarray(arr,'RGBA')

for action,meta in old_manifest['actions'].items():
    sheet_path=os.path.join(npc_dir,action+'.png')
    if not os.path.exists(sheet_path): continue
    sh=Image.open(sheet_path).convert('RGBA')
    fw,fh,n=meta['frameWidth'],meta['frameHeight'],meta['frames']
    frames=[]; metrics=[]
    for i in range(n):
        fr=largest_component_frame(sh.crop((i*fw,0,(i+1)*fw,fh)))
        a=np.array(fr.getchannel('A'))
        ys,xs=np.where(a>0)
        if len(xs):
            bbox=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
            area=int((a>0).sum()); hh=bbox[3]-bbox[1]
        else:
            bbox=(0,0,0,0); area=0; hh=0
        frames.append(fr); metrics.append((area,hh,bbox))
    med_area=float(np.median([m[0] for m in metrics if m[0]>0])) if any(m[0]>0 for m in metrics) else 1
    med_h=float(np.median([m[1] for m in metrics if m[1]>0])) if any(m[1]>0 for m in metrics) else 1
    good=[]
    for i,(area,hh,bbox) in enumerate(metrics):
        # malformed frames in generated work sheets are much smaller than peers.
        ok=area>=med_area*.58 and hh>=med_h*.72
        # Explicitly reject known clipped first watering pose; all replacement
        # remains inside the watering action.
        if action=='water' and i==0: ok=False
        if action=='pickaxe' and i==4: ok=False
        if ok: good.append(i)
    if not good: good=[max(range(n),key=lambda i:metrics[i][0])]
    for i in range(n):
        if i not in good:
            repl=min(good,key=lambda j:abs(j-i))
            frames[i]=frames[repl].copy()
            metrics[i]=metrics[repl]
    out_sheet=Image.new('RGBA',(fw*n,fh),(0,0,0,0))
    for i,fr in enumerate(frames): out_sheet.alpha_composite(fr,(i*fw,0))
    out_sheet.save(sheet_path,optimize=True,compress_level=9)
    good_heights=[metrics[i][1] for i in range(n) if metrics[i][1]>0]
    old_manifest['actions'][action]['visualHeight']=int(round(float(np.median(good_heights)))) if good_heights else fh
    old_manifest['actions'][action]['v3Cleaned']=True
old_manifest['version']='3.1-v3-clean'
with open(os.path.join(npc_dir,'manifest.json'),'w',encoding='utf-8') as f:
    json.dump(old_manifest,f,indent=2)

# map asset is intentionally NOT regenerated. V3 keeps exactly the v2 world.
world_path=os.path.join(OUT,'assets','map','world.json')
world=json.load(open(world_path,encoding='utf-8'))
world['version']='organic-v2-map-locked-v3-gameplay'
with open(world_path,'w',encoding='utf-8') as f: json.dump(world,f,separators=(',',':'))

# Service worker cache bump while keeping same file/URL structure.
sw_path=os.path.join(OUT,'sw.js')
sw=open(sw_path,encoding='utf-8').read().replace("god-world-v2-organic","god-world-v3-civilizations")
open(sw_path,'w',encoding='utf-8').write(sw)

# README update.
readme='''# TikTok God World — Live Kingdoms v3 — Civilizations Fix\n\nV3 mantiene **identica la mappa organica della v2**. La patch interviene solo sulle civiltà generate dai JOIN.\n\n## Correzioni V3\n- Prefab blu riestratti dal foglio sorgente trasparente: eliminati i ritagli di edifici vicini.\n- Scala edifici normalizzata per categoria; castello più contenuto e villaggi meno ammassati.\n- Un solo edificio per cella e distanza minima tra costruzioni: niente sovrapposizioni casuali.\n- Capitale e nuove costruzioni solo su terreno interno valido; niente edifici su mare, spiaggia, fiumi o montagne.\n- I JOIN preferiscono pianure interne e ricevono una piccola area iniziale sufficiente a distribuire castello, casa, fattoria e magazzino.\n- NPC neutral ripuliti: frame malformati sostituiti esclusivamente con frame della stessa azione.\n- Tutte le animazioni NPC vengono normalizzate alla stessa altezza visiva.\n- Contadini distribuiti sul territorio anziché ammassati sotto il castello.\n- Pathfinding a celle: i contadini camminano solo su celle terrestri percorribili del proprio regno e non attraversano fiumi/mare.\n- Massimo 28 lavoratori visibili per civiltà: la popolazione economica può continuare a crescere senza creare un muro di sprite.\n- Build AI non consuma risorse se non trova una cella valida.\n\n## TikTok / test\n`JOIN` crea la civiltà. Il pannello TEST resta separato dagli eventi live. Nessun JOIN/gift viene generato automaticamente.\n\n## PWA / stesso URL\nLa struttura dei file resta identica alla v2. Per aggiornare la PWA già installata, sostituisci i file sullo stesso hosting/URL; il service worker V3 invalida la cache precedente.\n'''
open(os.path.join(OUT,'README.md'),'w',encoding='utf-8').write(readme)

# Zip
zip_path='/mnt/data/TikTok-God-World-Pixi-v3-civilizations.zip'
if os.path.exists(zip_path): os.remove(zip_path)
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for root,_,files in os.walk(OUT):
        for fn in files:
            p=os.path.join(root,fn)
            z.write(p,os.path.relpath(p,OUT))
print('Prepared assets/project shell:', OUT)
print('ZIP will be refreshed after game.js write:', zip_path)
