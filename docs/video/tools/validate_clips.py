import subprocess,json,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];extracted=Path('/tmp/design-refresh-per-second');extracted.mkdir(exist_ok=True)
report={};thumbs=[];minimum={'clip-A':16,'clip-B':24,'clip-C':19,'clip-D':20,'clip-E':21,'clip-F':16}
for video in sorted(root.glob('clip-*.mp4')):
 d=extracted/video.stem;d.mkdir(exist_ok=True)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-vf','fps=1:start_time=0',str(d/'%03d.png')],check=True)
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,width,height,r_frame_rate','-of','json',str(video)]));frames=[]
 for i,p in enumerate(sorted(d.glob('*.png'))):
  im=Image.open(p).convert('RGB');a=np.asarray(im).astype(np.int16);small=np.asarray(im.resize((192,108)));colors,counts=np.unique(small.reshape(-1,3),axis=0,return_counts=True);bg=colors[counts.argmax()].astype(np.int16)
  fraction=float((np.max(np.abs(a-bg),axis=2)<=2).mean())
  # Ink/imagery differs substantially from paper; faint grid pixels are ignored.
  ink=np.max(np.abs(a-np.array([253,253,252])),axis=2)>28
  columns=np.flatnonzero(ink.sum(axis=0)>=5);span=float((columns[-1]-columns[0]+1)/1920) if len(columns) else 0
  ok=im.size==(1920,1080) and fraction<.95 and span>=.8
  frames.append({'second':i,'size':list(im.size),'background_fraction':round(fraction,4),'content_width_fraction':round(span,4),'passed':ok})
  tile=Image.new('RGB',(320,204),'#fdfdfc');tile.paste(im.resize((320,180),Image.Resampling.LANCZOS),(0,24));ImageDraw.Draw(tile).text((6,5),f'{video.stem} {i:02d}s '+('PASS' if ok else 'FAIL'),fill='black' if ok else 'red');thumbs.append(tile)
 duration=float(meta['format']['duration']);report[video.stem]={'duration':duration,'minimum_duration':minimum[video.stem],'passed':all(f['passed'] for f in frames) and duration>=minimum[video.stem],'frames':frames,'streams':meta['streams']}
 print(video.stem,duration,'pass',report[video.stem]['passed'],'max-bg',max(f['background_fraction'] for f in frames),'min-width',min(f['content_width_fraction'] for f in frames),flush=True)
cols=6;sheet=Image.new('RGB',(cols*320,math.ceil(len(thumbs)/cols)*204),'#e8e8e8')
for i,im in enumerate(thumbs):sheet.paste(im,((i%cols)*320,(i//cols)*204))
sheet.save(root/'contact-sheet.png');(root/'frame-validation.json').write_text(json.dumps(report,indent=2)+'\n')
assert all(r['passed'] for r in report.values()),'Some clips failed frame validation'
