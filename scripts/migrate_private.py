#!/usr/bin/env python3
"""Recover explicit legacy applied markers into an encrypted, user-local backup.
The passphrase is prompted locally and sent to Node over stdin, never as an argument.
No candidate narratives are copied; application dates remain unknown.
"""
import argparse,getpass,hashlib,json,os,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
from bs4 import BeautifulSoup
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build import canonical_url,clean
ROOT=Path(__file__).resolve().parents[1]

def recover(html,public):
    known={j['id']:j for j in public['jobs']};records={}
    soup=BeautifulSoup(html,'html.parser')
    for row in soup.select('tr[data-applied="1"]'):
        link=row.select_one('a.rowlink');co=row.select_one('.company')
        if not link or not co:continue
        url,_=canonical_url(link.get('href',''),clean(co.get_text(' ',strip=True)))
        if not url:continue
        identity=hashlib.sha256(url.encode()).hexdigest()[:24]
        if identity not in known:continue
        records[identity]={'status':'applied','note':'Imported from an explicit legacy applied marker. The application date was not recorded; no date has been inferred.',
                           'history':[],'snapshot':known[identity],
                           'updatedAt':datetime.now(timezone.utc).isoformat()}
    return records

def main():
    p=argparse.ArgumentParser();p.add_argument('--legacy',type=Path,required=True,help='Original all.html outside the public repository')
    p.add_argument('--output',type=Path,required=True,help='Encrypted backup path OUTSIDE this public repository')
    a=p.parse_args();out=a.output.expanduser().resolve()
    if out==ROOT or ROOT in out.parents:p.error('Store private backups outside the public repository')
    if out.exists():p.error('Output exists; refusing to overwrite it')
    public=json.loads((ROOT/'data/jobs.json').read_text());records=recover(a.legacy.read_text(encoding='utf8'),public)
    if not records:raise SystemExit('No matching explicit applied markers found; nothing written.')
    print(f'Recovered {len(records)} explicit applied markers. No application dates inferred.')
    password=getpass.getpass('New backup passphrase (12+ characters): ')
    if len(password)<12:raise SystemExit('Passphrase too short; nothing written.')
    if password!=getpass.getpass('Confirm passphrase: '):raise SystemExit('Passphrases differ; nothing written.')
    payload=json.dumps({'password':password,'jobs':records},ensure_ascii=False)
    result=subprocess.run(['node',str(ROOT/'scripts/seal_private.mjs')],input=payload,text=True,capture_output=True,check=True)
    out.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:f.write(result.stdout)
    print('Encrypted backup written. Restore it from Workspace & privacy before adding new tracker entries.')
    print('Restoring replaces the current browser workspace; export any existing workspace first.')
if __name__=='__main__':main()
