import asyncio,json,sys
from playwright.async_api import async_playwright
from capture_clean import ROOT,CURSOR,scroll,view,click,Clip
async def pause(page,n=2):await page.wait_for_timeout(n*1000)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--window-size=1920,1080'])
  c=await b.new_context(viewport={'width':1280,'height':720},device_scale_factor=1.5)
  page=await c.new_page();metrics=await c.new_cdp_session(page);await metrics.send('Emulation.setDeviceMetricsOverride',{'width':1280,'height':720,'deviceScaleFactor':1.5,'mobile':False});await page.goto('http://127.0.0.1:3170');await page.evaluate(CURSOR);await page.mouse.move(1150,180)
  # Block any external model request; production server has no live credentials.
  await page.route('https://api.meta.ai/**',lambda route:route.abort())
  clip=Clip(page,'clip-A',17);await clip.start();await pause(page,3);await view(page,page.locator('#brand-heading'),7500);await pause(page,3);await clip.stop()
  await scroll(page,0,1500)
  clip=Clip(page,'clip-B',25);await clip.start();await pause(page);await click(page,page.get_by_role('button',name='Load demo data',exact=True).first)
  await pause(page);await view(page,page.locator('#website-text'),2200);await pause(page);await view(page,page.locator('#brief'),2000);await pause(page)
  await view(page,page.locator('#ads-heading'),2200);await pause(page)
  analyze=page.get_by_role('button',name='Analyze coverage',exact=True)
  y=await analyze.evaluate('(e)=>e.getBoundingClientRect().top+scrollY-700');await scroll(page,y,5000);await pause(page)
  async with page.expect_response(lambda r:'/api/analyze' in r.url) as response:await click(page,analyze)
  r=await response.value;data=await r.json()
  if r.status!=200 or data.get('mode')!='cached':raise RuntimeError('Cached analysis did not succeed: '+str(data.get('mode')))
  await pause(page,3);await clip.stop()
  summary=page.get_by_text('4 of 10 motivations are used.',exact=False).locator('..')
  maproot=page.get_by_role('heading',name='03 Coverage map',exact=True).locator('../..').locator('..')
  # Clear thumbnail hover before showing the complete map.
  await page.mouse.move(1250,30,steps=20);await view(page,summary,1800)
  clip=Clip(page,'clip-C',20);await clip.start();await pause(page,3);await page.screenshot(path=str(ROOT/'summary-bar.png'))
  await view(page,page.get_by_role('heading',name='03 Coverage map',exact=True),2400);await pause(page)
  # Full map includes all rows at native resolution.
  table=page.locator('table');pass
  await view(page,table.locator('tr').last,2600);await pause(page,3)
  why=page.get_by_role('heading',name='Why each ad is placed there');await view(page,why,2600);await pause(page,4);await clip.stop()
  # Ad 3: pin a person-containing ad and show both inspection modes.
  await view(page,page.get_by_role('heading',name='03 Coverage map',exact=True),1600)
  thumb=page.get_by_role('button').filter(has=page.get_by_alt_text('Three prices, one subscription',exact=True))
  await view(page,thumb,1800);await page.mouse.move(1250,30)
  clip=Clip(page,'clip-D',21);await clip.start();await click(page,thumb);await thumb.focus();await thumb.press('Enter');await page.mouse.move(1250,30,steps=20);await pause(page,2)
  mask=page.get_by_role('button',name='SAM 3.1 mask',exact=True);await mask.wait_for();await view(page,mask,1800);await click(page,mask);await pause(page,3);await page.screenshot(path=str(ROOT/'sam-view.png'))
  await click(page,page.get_by_role('button',name='Final ad',exact=True));await pause(page,3)
  await click(page,mask);await pause(page,2)
  qa=page.get_by_text('Layout QA',exact=False)
  if await qa.count():await view(page,qa.first,1800);await pause(page,2)
  await clip.stop()
  # Reload the cached demo for the next clip with no pinned selection.
  await page.goto('http://127.0.0.1:3170');await page.evaluate(CURSOR);await page.get_by_role('button',name='Load demo data',exact=True).first.click();await page.get_by_role('button',name='Analyze coverage',exact=True).click();await page.get_by_text('4 of 10 motivations are used.',exact=False).wait_for();await page.mouse.move(1250,30,steps=20)
  await view(page,page.get_by_role('heading',name='03 Coverage map',exact=True),1800)
  clip=Clip(page,'clip-E',22);await clip.start();await pause(page,3)
  after=page.get_by_role('heading',name='04 Concepts',exact=True);await view(page,after,3000);await pause(page,6);await page.screenshot(path=str(ROOT/'briefs.png'))
  sofie=page.get_by_text('Sofie · Reels 9:16',exact=False).first;await view(page,sofie,1700);await pause(page,1.3)
  await view(page,after,1700);await pause(page,3);await clip.stop()
  before=page.locator('#before-after');await view(page,before,2000)
  clip=Clip(page,'clip-F',17);await clip.start();await pause(page,3);await page.screenshot(path=str(ROOT/'before-after.png'))
  await view(page,page.locator('#before-after').get_by_role('heading',name='After · 3 concepts'),5000);await pause(page,3);await clip.stop(hold=3)
  await c.close();await b.close()
asyncio.run(main())
