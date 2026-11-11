# Сборка колоды «Королевская» из листов-картинок владельца: на листе 4 карты J Q K A одной масти
# (src/<hearts|diamonds|clubs|spades>.png). Числовые карты 6–10 рисуются по шаблону туза: рамка — от туза пик,
# значки и маленькая масть — из туза своей масти, цифры — шрифт Lora. Запуск: python3 scripts/deck-from-sheets.py
# «Королевская» колода v2: J Q K A — с листов владельца (4 карты на листе), 6–10 — рисуем сами по шаблону туза той же масти.
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage
SRC='/tmp/deck2/src'; OUT='/tmp/deck2/out'
FACES=['J','Q','K','A']; SUITS=['hearts','diamonds','clubs','spades']
OUT_W,OUT_H=540,756; RATIO=0.663
FONT='/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf'

def runs(idx):
    out=[]; s=p=idx[0]
    for i in idx[1:]:
        if i!=p+1: out.append((s,p)); s=i
        p=i
    out.append((s,p)); return out

def slice_sheet(su):
    a=np.asarray(Image.open(f'{SRC}/{su}.png').convert('RGB')).astype(int); H,W=a.shape[:2]
    bgm=(np.abs(a-a[5,5]).sum(axis=2)<60)
    y0,y1=[r for r in runs(np.where(bgm.mean(axis=1)<0.7)[0]) if r[1]-r[0]>150][0]
    cols=[c for c in runs(np.where(bgm[y0:y1+1].mean(axis=0)<0.8)[0]) if c[1]-c[0]>150]
    W0=max(c[1]-c[0]+1 for c in cols if c[1]<W-1); H0=round(W0/RATIO)
    cards={}
    for f,(x0,x1) in zip(FACES,cols):
        crop=a[y0:y1+1,x0:x1+1]; h,w=crop.shape[:2]; h=min(h,H0); w=min(w,W0); crop=crop[:h,:w]
        canvas=np.zeros((H0,W0,3),int); have=np.zeros((H0,W0),bool)
        canvas[:h,:w]=crop; have[:h,:w]=True
        rot=canvas[::-1,::-1]; fill=(~have)&have[::-1,::-1]; canvas[fill]=rot[fill]   # срезанный край — из противоположного угла
        canvas=flatfield(canvas)
        if f=='A':
            cw,ch=int(W0*.36),int(H0*.22); canvas[H0-ch:,W0-cw:]=canvas[:ch,:cw][::-1,::-1]
        cards[f]=canvas
    return cards

def flatfield(c):
    # выравниваем серый градиент на белом фоне (лист треф); цветные фигуры почти не трогаем
    c=c.astype(float); Lf=c.mean(axis=2); L=Image.fromarray(Lf.astype(np.uint8))
    bgl=np.asarray(L.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(8))).astype(float)
    g=np.clip(255/np.maximum(bgl,80),1,3.2)
    sat=c.max(axis=2)-c.min(axis=2)
    w=np.clip((Lf/np.maximum(bgl,1)-.55)/.35,0,1)*np.clip(1-sat/40,0,1)   # 1 — фон/бумага, 0 — рисунок
    gg=1+(g-1)*w
    c=np.clip(c*gg[...,None],0,255)
    L2=c.mean(axis=2); sat2=c.max(axis=2)-c.min(axis=2)
    t=np.clip((L2-212)/26,0,1)*np.clip(1-sat2/30,0,1)      # почти белое → чисто белое (бумага)
    c=c*(1-t[...,None])+255*t[...,None]
    return np.clip(c,0,255).astype(np.uint8)

def finish(arr, special=False):
    im=Image.fromarray(arr); im=im.crop((3,3,im.width-3,im.height-3)); w,h=im.size
    W2=round(h*5/7); base=Image.new('RGB',(W2,h),(255,255,255))
    inner=Image.new('L',(w,h),0); ImageDraw.Draw(inner).rounded_rectangle((0,0,w-1,h-1),radius=int(w*.07),fill=255)
    base.paste(im,((W2-w)//2,0),inner)
    base=base.resize((OUT_W,OUT_H),Image.LANCZOS).convert('RGBA')
    if special:
        t=(np.add.outer(np.arange(OUT_H)/OUT_H, np.arange(OUT_W)/OUT_W)/2)[...,None]
        c1,c2,c3=np.array([124,60,255]),np.array([228,184,74]),np.array([185,140,255])
        g=np.where(t<.5, c1+(c2-c1)*(t/.5), c2+(c3-c2)*((t-.5)/.5)); grad=Image.fromarray(g.astype(np.uint8))
        ring=Image.new('L',(OUT_W,OUT_H),0); ImageDraw.Draw(ring).rounded_rectangle((6,6,OUT_W-7,OUT_H-7),radius=int(OUT_W*.06),outline=255,width=9)
        glow=ring.filter(ImageFilter.GaussianBlur(8)).point(lambda v:int(v*.55))
        base.paste(Image.new('RGB',(OUT_W,OUT_H),(140,80,255)),(0,0),glow); base.paste(grad,(0,0),ring)
    mask=Image.new('L',(OUT_W,OUT_H),0); ImageDraw.Draw(mask).rounded_rectangle((0,0,OUT_W-1,OUT_H-1),radius=int(OUT_W*.07),fill=255)
    base.putalpha(mask); return base

def corner_parts(ace):
    H,W=ace.shape[:2]; rx,ry=int(W*.36),int(H*.22)
    reg=ace[:ry,:rx].astype(int); ink=(reg.sum(axis=2)<600)
    lab,n=ndimage.label(ink); objs=ndimage.find_objects(lab); parts=[]
    for i,sl in enumerate(objs):
        hh=sl[0].stop-sl[0].start; ww=sl[1].stop-sl[1].start; area=(lab[sl]==i+1).sum()
        if area<15: continue
        parts.append(dict(i=i+1,sl=sl,area=area,w=ww,h=hh,cy=(sl[0].start+sl[0].stop)/2,cx=(sl[1].start+sl[1].stop)/2))
    lines=[p for p in parts if p['w']>4*p['h'] or p['h']>4*p['w']]
    rest=[p for p in parts if p not in lines]
    big=max(rest,key=lambda p:p['area']); rest=[p for p in rest if p is not big]
    letter=min(rest,key=lambda p:p['cy']); small=[p for p in rest if p is not letter]
    small=max(small,key=lambda p:p['area']) if small else None
    top=[p for p in lines if p['w']>p['h']]; top=min(top,key=lambda p:p['cy']) if top else None
    return lab,big,letter,small,top

INK={'hearts':(139,26,36),'diamonds':(139,26,36),'clubs':(20,20,22),'spades':(18,24,58)}
PIP={'hearts':(226,16,26),'diamonds':(226,16,26),'clubs':(12,12,14),'spades':(16,22,56)}
def ink_mask(arr):  # 0..1: насколько пиксель «чернила», относительно белого
    L=arr.astype(float).mean(axis=2); return np.clip((245-L)/170,0,1)
def number_cards(ace_tmpl, ace_own, su):
    H,W=ace_tmpl.shape[:2]; lab,big,letter,small,top=corner_parts(ace_tmpl)
    ls=letter['sl']
    m=ink_mask(ace_tmpl)
    m[int(H*.19):int(H*.81), int(W*.15):int(W*.85)]=0
    bs=big['sl']; m[bs[0].start-4:bs[0].stop+4, bs[1].start-4:bs[1].stop+4]=0
    m[ls[0].start-3:ls[0].stop+3, ls[1].start-3:ls[1].stop+3]=0
    capH=ls[0].stop-ls[0].start; lx=(ls[1].start+ls[1].stop)/2; lb=ls[0].stop
    sb=(int(lx-capH*.6), lb+2, int(lx+capH*.6), int(lb+2+capH*.95))   # маленькая масть под буквой
    m[sb[1]:sb[3], sb[0]:sb[2]]=0
    if top is not None:
        ts=top['sl']; m[ts[0].start:ts[0].stop, int(W*.2):ts[1].start+2]=np.maximum(m[ts[0].start:ts[0].stop, int(W*.2):ts[1].start+2], m[ts[0].start:ts[0].stop, ts[1].start+5:ts[1].start+6])
    # правый нижний угол шаблона = повёрнутый левый верхний (уже без «A» и мастей)
    cw,ch=int(W*.36),int(H*.22); m[H-ch:,W-cw:]=m[:ch,:cw][::-1,::-1]
    # нижняя линия рамки: дотягиваем вправо до начала углового блока
    m[int(H*.9):, W-cw:W-int(W*.2)]=0   # убираем повёрнутый обрубок верхней линии
    band=m[int(H*.9):, int(W*.2):int(W*.6)]; prof=band.mean(axis=1); rows=np.where(prof>prof.max()*.5)[0]
    if len(rows):
        y0=int(H*.9)+rows.min(); y1=int(H*.9)+rows.max()+1
        xl=int(W*.2)+np.where(band[rows].max(axis=0)>.5)[0].min()
        m[y0:y1, xl:W-int(W*.2)]=np.maximum(m[y0:y1, xl:W-int(W*.2)], band[rows].max(axis=1)[:,None])
    # значки своей масти (из туза этой масти): большая — для раскладки, маленькая — для индекса
    _,obig,_,_,_=corner_parts(ace_own)
    def sprite(p,pad=4):
        sl=p['sl']; return ink_mask(ace_own[sl[0].start-pad:sl[0].stop+pad, sl[1].start-pad:sl[1].stop+pad])
    pipm=sprite(obig); smallm=ink_mask(ace_own[sb[1]:sb[3], sb[0]:sb[2]])
    def paste(mask, sp, cx, cy, flip=False):
        if flip: sp=sp[::-1,::-1]
        hh,ww=sp.shape; X=int(round(cx-ww/2)); Y=int(round(cy-hh/2)); mask[Y:Y+hh,X:X+ww]=np.maximum(mask[Y:Y+hh,X:X+ww],sp)
    out={}
    for rank in ['6','7','8','9','10']:
        frame=m.copy(); idx=np.zeros_like(m); pips=np.zeros_like(m)
        size=10
        while True:
            f=ImageFont.truetype(FONT,size)
            try: f.set_variation_by_name('SemiBold')
            except Exception: pass
            bb=f.getbbox('8')
            if bb[3]-bb[1]>=capH: break
            size+=1
        txt=Image.new('L',(int(size*2.2),int(size*1.6)),0); ImageDraw.Draw(txt).text((0,0),rank,font=f,fill=255); txt=txt.crop(txt.getbbox())
        maxw=int(capH*(1.3 if rank=='10' else .8))
        if txt.width>maxw: txt=txt.resize((maxw,txt.height),Image.LANCZOS)
        t=np.asarray(txt).astype(float)/255; X=int(lx-txt.width/2); Y=lb-txt.height
        idx[Y:Y+t.shape[0],X:X+t.shape[1]]=np.maximum(idx[Y:Y+t.shape[0],X:X+t.shape[1]],t)
        idx[sb[1]:sb[3], sb[0]:sb[2]]=np.maximum(idx[sb[1]:sb[3], sb[0]:sb[2]], smallm)
        idx[H-ch:,W-cw:]=np.maximum(idx[H-ch:,W-cw:], idx[:ch,:cw][::-1,::-1])
        L=[(.31,.2),(.69,.2),(.31,.5),(.69,.5),(.31,.8),(.69,.8)] if rank in '678' else [(.31,.2),(.69,.2),(.31,.4),(.69,.4),(.31,.6),(.69,.6),(.31,.8),(.69,.8)]
        extra={'6':[],'7':[(.5,.35)],'8':[(.5,.35),(.5,.65)],'9':[(.5,.5)],'10':[(.5,.3),(.5,.7)]}[rank]
        sp=np.asarray(Image.fromarray((pipm*255).astype(np.uint8)).resize((int(pipm.shape[1]*1.05),int(pipm.shape[0]*1.05)),Image.LANCZOS)).astype(float)/255
        for (fx,fy) in L+extra: paste(pips, sp, fx*W, fy*H, flip=fy>.5)
        card=np.full((H,W,3),255.0)
        for mk,col in ((frame,INK[su]),(idx,INK[su] if su in ('clubs','spades') else PIP[su]),(pips,PIP[su])):
            card=card*(1-mk[...,None])+np.array(col)[None,None,:]*mk[...,None]
        out[rank]=card.astype(np.uint8)
    return out

sheets={su:slice_sheet(su) for su in SUITS}
tmpl=sheets['spades']['A']
for su in SUITS:
    cards=sheets[su]
    for f,c in cards.items(): finish(c).save(f'{OUT}/{f}_{su}.webp','WEBP',quality=88,method=6)
    own=cards['A']
    if own.shape!=tmpl.shape: own=np.asarray(Image.fromarray(own).resize((tmpl.shape[1],tmpl.shape[0]),Image.LANCZOS))
    for r,c in number_cards(tmpl, own, su).items(): finish(c, special=(r=='7' and su=='spades')).save(f'{OUT}/{r}_{su}.webp','WEBP',quality=88,method=6)
print('ok')
