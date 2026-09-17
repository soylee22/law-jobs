"""Browser regression suite. Use --embedded for offline DOM tests when navigation is blocked.
Normal mode tests real ES modules, CSP, Web Crypto and persistence against a local server.
"""
import argparse,json,re,subprocess,sys,tempfile,time
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def embedded(page):
 from bs4 import BeautifulSoup
 soup=BeautifulSoup((ROOT/'index.html').read_text(),'html.parser')
 for el in soup.select('script,link,meta[http-equiv="Content-Security-Policy"]'):el.decompose()
 page.set_content(str(soup));page.add_style_tag(content=(ROOT/'web/app.css').read_text())
 page.evaluate('(x)=>window.__FIXTURE=x',json.loads((ROOT/'data/jobs.json').read_text()))
 page.evaluate('window.fetch=async()=>({ok:true,json:async()=>window.__FIXTURE})')
 parts=[]
 for filename in ('core.mjs','vault.mjs','app.mjs'):
  s=(ROOT/'web'/filename).read_text();s=re.sub(r'^import .+?;\n','',s,flags=re.M).replace('export ','')
  parts.append(s.replace('import.meta.url',"'https://local.test/law-jobs/web/app.mjs'"))
 page.evaluate('(async()=>{'+''.join(parts)+'})()')

def run(offline=False,output=None):
 results=[];server=None
 def check(name,condition):
  assert condition,name
  results.append(name)
 with sync_playwright() as p:
  executable='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None
  b=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
  context=b.new_context(viewport={'width':1440,'height':1080},device_scale_factor=1)
  page=context.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  if offline:embedded(page)
  else:
   server=subprocess.Popen([sys.executable,'-m','http.server','8767','--bind','127.0.0.1','--directory',str(ROOT.parent)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   time.sleep(1);page.goto('http://127.0.0.1:8767/'+ROOT.name+'/',wait_until='networkidle')
  try:
   page.wait_for_selector('.job-card')
   jobs={j['id']:j for j in json.loads((ROOT/'data/jobs.json').read_text())['jobs']}
   check('Initial page is bounded to 20 cards',page.locator('.job-card').count()==20)
   check('Initial DOM below 1200 elements',page.locator('*').count()<1200)
   initial_ids=page.locator('.job-card').evaluate_all('(els)=>els.map(e=>e.dataset.job)')
   check('New today is limited to the latest snapshot',all(jobs[x]['snapshotNew'] for x in initial_ids))
   check('Today view explains the shortlist boundary',page.locator('#results-title').inner_text()=='New in the latest snapshot')
   check('Today view keeps the latest-snapshot filter visible',page.locator('#fresh').is_checked() and page.locator('#fresh').is_disabled())
   page.locator('a[data-view=discover]').click();page.wait_for_timeout(100)
   page.locator('#fresh').check();page.locator('#region').select_option('london')
   ids=page.locator('.job-card').evaluate_all('(els)=>els.map(e=>e.dataset.job)')
   check('Combined fresh and London filter applied to every card',all(jobs[x]['snapshotNew'] and jobs[x]['region']=='london' for x in ids))
   check('Deep link includes both filters','fresh=1' in page.url and 'region=london' in page.url)
   if page.locator('[data-page="2"]').count():
    first=ids[0];page.locator('[data-page="2"]').click()
    check('Pagination changes the result slice',page.locator('.job-card').first.get_attribute('data-job')!=first)
   page.locator('#reset').click();page.locator('#search').fill('Mishcon');page.wait_for_timeout(250)
   check('Search matches the organisation',all('Mishcon' in x for x in page.locator('.card-company').all_inner_texts()))
   page.locator('.title-button').first.click();page.wait_for_selector('#detail-dialog[open]')
   check('Evidence distinguishes unverified requirements','Requirements not independently checked' in page.locator('#detail-content').inner_text())
   check('Job modal has an accessible title',page.locator('#detail-dialog').get_attribute('aria-labelledby')=='detail-title')
   page.keyboard.press('Escape');check('Escape closes modal',not page.locator('#detail-dialog').is_visible())
   page.locator('#reset').click()
   if not offline:
    page.locator('#vault-button').click();page.locator('#password').fill('test passphrase for this browser');page.locator('#confirm-password').fill('test passphrase for this browser')
    page.locator('#vault-form [type=submit]').click();page.wait_for_selector('#vault-dialog',state='hidden')
    page.locator('.save-button').first.click();page.wait_for_timeout(300)
    page.locator('.title-button').first.click();page.locator('[name=note]').fill('PRIVATE_BROWSER_SENTINEL');page.locator('[name=status]').select_option('applied');page.locator('#job-form [type=submit]').click();page.wait_for_timeout(350)
    check('Private note encrypted rather than plaintext in storage','PRIVATE_BROWSER_SENTINEL' not in page.evaluate('JSON.stringify(localStorage)'))
    check('Encrypted vault has been persisted',page.evaluate('localStorage.getItem("mithril.vault.v1")!==null'))
    page.keyboard.press('Escape');page.locator('#vault-button').click()
    check('Locked DOM contains no decrypted notes','PRIVATE_BROWSER_SENTINEL' not in page.content())
    page.locator('#vault-button').click();page.locator('#password').fill('wrong passphrase');page.locator('#vault-form [type=submit]').click();expect(page.locator('#vault-error')).to_contain_text('Could not unlock')
    check('Incorrect password is rejected','Could not unlock' in page.locator('#vault-error').inner_text())
    page.locator('#password').fill('test passphrase for this browser');page.locator('#vault-form [type=submit]').click();page.wait_for_selector('#vault-dialog',state='hidden')
    page.locator('a[data-view=applications]').click();page.wait_for_timeout(100)
    page.locator('.title-button').first.click();check('Private note survives lock/unlock',page.locator('[name=note]').input_value()=='PRIVATE_BROWSER_SENTINEL')
    page.keyboard.press('Escape');page.locator('#vault-button').click();page.reload(wait_until='networkidle')
    check('Reload returns locked rather than retaining a key',page.locator('#vault-button').inner_text()=='Unlock workspace')
   page.locator('a[data-view=today]').click();page.wait_for_timeout(100)
   today_ids=page.locator('.job-card').evaluate_all('(els)=>els.map(e=>e.dataset.job)')
   check('Returning to New today keeps only latest-snapshot listings',all(jobs[x]['snapshotNew'] for x in today_ids))
   page.locator('body').click(position={'x':800,'y':10});page.keyboard.press('/')
   check('Slash shortcut focuses search',page.locator('#search').evaluate('(e)=>e===document.activeElement'))
   if output:
    output.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(output/'desktop.png'),full_page=False)
   for width in [390,360,768]:
    page.set_viewport_size({'width':width,'height':844})
    check(f'No horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    if width==390:
     check('First mobile job is above 550 pixels',page.locator('.job-card').first.bounding_box()['y']<550)
     page.locator('#filter-toggle').click();check('Mobile filter disclosure works',page.locator('#region').is_visible());page.locator('#filter-toggle').click()
     if output:page.screenshot(path=str(output/'mobile.png'),full_page=False)
   check('No uncaught JavaScript exceptions',not errors)
   summary={'mode':'embedded-offline' if offline else 'real-browser','passed':len(results),'checks':results,'errors':errors}
   if output:(output/'browser-results.json').write_text(json.dumps(summary,indent=2))
   print(json.dumps(summary,indent=2))
  finally:
   b.close()
   if server:server.terminate()
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--embedded',action='store_true');ap.add_argument('--output',type=Path);args=ap.parse_args();run(args.embedded,args.output)
