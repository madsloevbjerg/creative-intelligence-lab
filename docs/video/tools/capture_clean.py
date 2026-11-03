import asyncio,base64,time,json,subprocess,io
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ROOT.mkdir(parents=True,exist_ok=True)
FRAMES=Path('/tmp/design-refresh-fixed-frames');FRAMES.mkdir(exist_ok=True)
CURSOR="""() => {const d=document.createElement('div');d.id='video-cursor';Object.assign(d.style,{position:'fixed',width:'18px',height:'18px',borderRadius:'50%',background:'#211e1b',boxShadow:'0 2px 8px #0006',pointerEvents:'none',zIndex:'2147483647',left:'1150px',top:'180px'});document.body.appendChild(d);window.addEventListener('mousemove',e=>{d.style.left=(e.clientX-9)+'px';d.style.top=(e.clientY-9)+'px'})}"""
async def ready(page):
 await page.evaluate('''async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))}''')
async def scroll(page,y,ms=2200):
 await page.evaluate('''async ([target,ms])=>{const start=scrollY,delta=Math.max(0,Math.min(target,document.documentElement.scrollHeight-innerHeight))-start;await new Promise(resolve=>{let begin;function step(t){begin??=t;const p=Math.min(1,(t-begin)/ms),e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;scrollTo(0,start+delta*e);if(p<1)requestAnimationFrame(step);else resolve()}requestAnimationFrame(step)})}''',[y,ms])
async def view(page,loc,ms=2200):await scroll(page,await loc.evaluate('(e)=>e.getBoundingClientRect().top+scrollY-50'),ms)
async def click(page,loc):
 b=await loc.bounding_box()
 if b['y']<20 or b['y']+b['height']>700:await view(page,loc);b=await loc.bounding_box()
 await page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=30);await page.wait_for_timeout(250);await loc.click()
class Clip:
 def __init__(self,page,name,target):self.page=page;self.name=name;self.target=target;self.frames=[];self.running=False
 async def start(self):
  await ready(self.page)
  self.dir=FRAMES/self.name;self.dir.mkdir(exist_ok=True)
  # A screenshot loop avoids Chromium's screencast surface resizing and blank frames.
  self.running=True;self.begin=time.monotonic();self.task=asyncio.create_task(self.loop())
 async def loop(self):
  while self.running:
   tick=time.monotonic();data=await self.page.screenshot(type='jpeg',quality=95,animations='allow',caret='hide',scale='device');im=Image.open(io.BytesIO(data)).convert('RGB')
   if im.size!=(1920,1080):im=im.resize((1920,1080),Image.Resampling.LANCZOS)
   # Discard a genuinely blank capture; the preceding frame will hold through the gap.
   extrema=im.getextrema()
   if max(hi-lo for lo,hi in extrema)>20:
    path=self.dir/f'{len(self.frames):06}.jpg';im.save(path,quality=95);self.frames.append((path,time.monotonic()-self.begin))
   await asyncio.sleep(max(0,1/15-(time.monotonic()-tick)))
 async def stop(self,hold=0):
  await self.page.wait_for_timeout(max(hold*1000,(self.target-(time.monotonic()-self.begin))*1000,100));self.running=False;await self.task;elapsed=time.monotonic()-self.begin
  assert self.frames,'No valid frames'
  # Anchor the first valid image at t=0, then preserve wall-clock frame durations.
  self.frames[0]=(self.frames[0][0],0);lines=[]
  for i,(path,t) in enumerate(self.frames):
   duration=(self.frames[i+1][1] if i+1<len(self.frames) else elapsed)-t
   lines += [f"file '{path}'",'option framerate 1000',f'duration {max(.001,duration):.6f}']
  lines += [f"file '{self.frames[-1][0]}'",'option framerate 1000'];manifest=self.dir/'frames.txt';manifest.write_text('\n'.join(lines))
  timing=ROOT/'capture-timing';timing.mkdir(exist_ok=True);(timing/(self.name+'.json')).write_text(json.dumps([{'frame':p.name,'seconds':t} for p,t in self.frames],indent=2)+'\n')
  await asyncio.to_thread(subprocess.run,['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(manifest),'-t',str(elapsed),'-vf','fps=30,scale=1920:1080','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',str(ROOT/(self.name+'.mp4'))],check=True)
  print(self.name,round(elapsed,2),len(self.frames),flush=True)
