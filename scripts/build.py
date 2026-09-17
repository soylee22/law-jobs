#!/usr/bin/env python3
"""Publish-safe migration from legacy HTML; never imports candidate assessments.

A build timestamp is NOT a vacancy verification timestamp. Unknowns stay unknown.
Usage: python scripts/build.py --legacy /private/scanner/output --out .
       python scripts/build.py --bootstrap 40a1184c9d4c34da98b6442a89b56a1107414e74 --out .
       python scripts/build.py --out .   # rebuild existing public JSON, without re-dating it
"""
from __future__ import annotations
import argparse, ast, hashlib, json, re, shutil, subprocess, tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit, urljoin
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {'inhouse':'In-house','china':'China bridge','firms':'Law firms',
          'traditional':'Traditional','openmarket':'Open market','boards':'Job boards'}
SOURCE_BASES = {'morgan stanley':'https://morganstanley.eightfold.ai',
                'vodafone group':'https://jobs.vodafone.com'}
BOARD_DOMAINS = ('linkedin.com','reed.co.uk','indeed.com','indeed.co.uk','totallylegal.com',
                 'lawgazette.co.uk','simplylawjobs.com','glassdoor.com','glassdoor.co.uk')
PUBLIC_FIELDS = {'id','title','company','location','region','workMode','url','sources','sourceKind',
                 'firstSeen','sourceLastSeen','descriptionCheckedAt','status','snapshotNew',
                 'practice','pqe','pqeEvidence','seniority','warnings','duplicateGroup','linkRepaired'}
PRIVATE_KEYS = {'applied','data-applied','candidate','candidateEvidence','profile','notes','applicationStatus'}


def clean(value: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', value or '')).strip()


def text(node, selector: str = '') -> str:
    n = node.select_one(selector) if selector else node
    return clean(n.get_text(' ', strip=True)) if n else ''


def norm(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', value.lower())


def canonical_url(value: str, company: str = '') -> tuple[str | None, bool]:
    value, repaired = clean(value), False
    if value.startswith('/careers/job/') and company.lower() in SOURCE_BASES:
        value, repaired = urljoin(SOURCE_BASES[company.lower()], value), True
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        if u.scheme not in ('http','https') or not host or u.username or u.password:
            return None, False
        if host in ('localhost','127.0.0.1','0.0.0.0','::1') or host.endswith('.github.io'):
            return None, False
        if re.fullmatch(r'[\d.]+',host):
            return None, False
        if u.port not in (None,80,443):
            return None, False
        query = [(k,v) for k,v in parse_qsl(u.query,keep_blank_values=True)
                 if not k.lower().startswith('utm_') and k.lower() not in
                 ('trk','trackingid','refid','ref','source','gh_src','fbclid','gclid')]
        path = u.path.rstrip('/') or '/'
        if host == 'linkedin.com' or host.endswith('.linkedin.com'):
            m = re.search(r'/jobs/view/(?:.*-)?(\d{7,})$',path)
            if m:
                return 'https://www.linkedin.com/jobs/view/' + m.group(1), repaired
        return urlunsplit(('https',host,path,urlencode(sorted(query)),'')), repaired
    except (ValueError,TypeError):
        return None, False


def stamp(soup) -> str | None:
    value = text(soup,'.sub')
    m = re.search(r'(\d{1,2} [A-Za-z]+ \d{4}), (\d{2}:\d{2})',value)
    if not m:
        return None
    try:
        return datetime.strptime(' '.join(m.groups()),'%d %B %Y %H:%M').replace(
            tzinfo=ZoneInfo('Europe/London')).astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def region(location: str) -> str:
    v = location.lower()
    if not v or re.search(r'unspecified|unclear|unknown|\d+ locations?|multiple locations?',v):
        return 'unknown'
    if re.search(r'\b(canada|ontario|new york|alabama|new hampshire|united states|usa|australia|singapore|hong kong)\b',v):
        return 'international'
    if re.search(r'\b(london|croydon|bromley|wembley)\b',v):
        return 'london'
    if re.search(r'\b(united kingdom|uk|gbr|great britain|england|scotland|wales|northern ireland)\b',v):
        return 'uk'
    # Explicit places, not the legacy "rest" flag. Do not guess all comma-separated cities are UK.
    places = ('manchester|birmingham|leeds|bristol|edinburgh|glasgow|belfast|cardiff|oxford|cambridge|'
              'newcastle|nottingham|sheffield|liverpool|reading|slough|guildford|surrey|kent|essex|'
              'oxfordshire|cambridgeshire|hertfordshire|buckinghamshire|berkshire|hampshire|sussex|'
              'yorkshire|lancashire|leicester|derby|coventry|milton keynes|southampton|portsmouth|'
              'brentford|norwich|exeter|plymouth|chester|bath|aberdeen|dundee|swansea|york|brighton|'
              'warrington|hounslow|luton|st albans|cheltenham|gloucester|newbury|warwick|bournemouth')
    if re.search(r'\b('+places+r')\b',v):
        return 'rest'
    if re.search(r'\b(germany|france|sweden|switzerland|netherlands|ireland|dublin|paris|berlin|'
                 r'stockholm|gothenburg|united states|usa|singapore|hong kong|china|beijing|shanghai|'
                 r'australia|poland|romania|spain|italy|belgium|austria|czech|slovakia|denmark)\b',v):
        return 'international'
    return 'unknown'


def classify(title: str) -> str:
    t = title.lower()
    if re.search(r'personal injury|serious injury|catastrophic|clinical negligence|medical negligence|'
                 r'family law|family solicitor|conveyanc|private client|probate|immigration|criminal|'
                 r'residential property|real estate|property solicitor',t):
        return 'other'
    if re.search(r'intellectual property|trade\s*mark|trademark|\bip\b|brand|copyright|patent',t):
        return 'ip'
    if re.search(r'privacy|data protection|gdpr',t):
        return 'data'
    if re.search(r'commercial|technology|\btech\b|product counsel|licensing|ecommerce|e-commerce|digital|contracts',t):
        return 'commercial'
    if re.search(r'corporate|\bm&a\b|mergers|acquisitions',t):
        return 'corporate'
    if re.search(r'litigation|dispute|arbitration',t):
        return 'disputes'
    if re.search(r'compliance|regulatory|sanctions|export control|financial crime',t):
        return 'regulatory'
    return 'general'


def parse_pqe(value: str) -> str | None:
    v = clean(value).replace('–','-').replace('—','-')
    patterns = [r'\bNQ\s*(?:-|to)\s*\d+\s*(?:years?\s*)?(?:PQE)?',
                r'\b\d+\s*(?:-|to)\s*\d+\s*(?:years?\s*)?PQE\b',
                r'\b\d+\s*\+?\s*(?:years?\s*)?PQE\b',
                r'\bNQ\b|\bnewly qualified\b']
    for p in patterns:
        m = re.search(p,v,re.I)
        if m:
            return clean(m.group(0))
    return None


def make_job(title, company, location, url, route, seen, is_new=False, signal='', status='listed'):
    title, company, location = map(clean,(title,company,location))
    canonical, repaired = canonical_url(url,company)
    key = canonical or '|'.join([company,title,location,url])
    pqe = parse_pqe(title) or parse_pqe(signal)
    warns = []
    reg = region(location)
    if reg == 'unknown': warns.append('Location or UK eligibility needs checking')
    if not canonical: warns.append('Application URL unavailable; find the employer advert')
    if repaired: warns.append('Relative URL repaired using the employer careers host; opening not verified')
    if re.search(r'patent (?:prosecution|attorney)|mechanical engineering|physics',title,re.I):
        warns.append('Patent-profession or technical qualification may be required')
    if re.search(r'switzerland|austria|czech|slovakia|germany|france',title,re.I) and reg in ('unknown','uk'):
        warns.append('Role title mentions another jurisdiction; confirm the actual base')
    work = 'remote' if re.search(r'\bremote\b',location+' '+title,re.I) else (
        'hybrid' if re.search(r'\bhybrid\b',location+' '+title,re.I) else 'unspecified')
    host = urlsplit(canonical).hostname if canonical else ''
    kind = 'job-board' if any(host == d or host.endswith('.'+d) for d in BOARD_DOMAINS) else (
        'employer-feed' if route in ('inhouse','china','firms') else 'unverified')
    return dict(id=hashlib.sha256(key.encode()).hexdigest()[:24],title=title,company=company,
                location=location or 'Location not supplied',region=reg,workMode=work,url=canonical,
                sources=[route],sourceKind=kind,firstSeen=seen if is_new else None,
                sourceLastSeen=seen if status=='listed' else None,descriptionCheckedAt=None,
                status=status,snapshotNew=bool(is_new and status=='listed'),practice=classify(title),
                pqe=pqe,pqeEvidence=('Advert title' if parse_pqe(title) else 'Legacy extraction; unverified') if pqe else None,
                seniority='senior-title' if re.search(r'\bsenior\b|head of|general counsel|partner|director',title,re.I)
                          else 'unspecified',warnings=warns,duplicateGroup=None,linkRepaired=repaired)


def import_legacy(folder: Path, previous: dict | None = None) -> dict:
    records, health = {}, []
    def add(j):
        if not j['title'] or not j['company']: return
        old = records.get(j['id'])
        if old:
            old['sources'] = sorted(set(old['sources'] + j['sources']))
            old['snapshotNew'] = old['snapshotNew'] or j['snapshotNew']
            if old['region']=='unknown' and j['region']!='unknown':
                old['location'],old['region']=j['location'],j['region']
                old['warnings']=[w for w in old['warnings'] if w!='Location or UK eligibility needs checking']
            elif old['location']!=j['location'] and j['region']!='unknown':
                warning='Another listing of this URL gives location: '+j['location']
                if warning not in old['warnings']: old['warnings'].append(warning)
            if not old['pqe'] and j['pqe']:
                old['pqe'], old['pqeEvidence'] = j['pqe'],j['pqeEvidence']
            if old['status'] != 'listed' and j['status']=='listed':
                sources=old['sources']; records[j['id']]=j; j['sources']=sources
        else: records[j['id']]=j
    for route, label in ROUTES.items():
        p=folder/(route+'.html')
        if not p.exists():
            health.append(dict(id=route,label=label,observedAt=None,rows=0,enrichment=None,state='missing'))
            continue
        soup=BeautifulSoup(p.read_text(encoding='utf8'),'html.parser')
        seen=stamp(soup); rows=soup.select('.role'); enrich=None
        for note in soup.select('.note'):
            match=re.search(r'Enrich:\s*(\{[^}]+\})',text(note))
            if match:
                try:
                    raw=ast.literal_eval(match.group(1)); enrich={k:int(raw[k]) for k in
                        ('selected','fetched','cache_hits','failed') if k in raw}
                except (ValueError,TypeError,SyntaxError): pass
        for row in rows:
            parent=row.find_parent(class_='company')
            if not parent: continue
            h=parent.select_one('.co-head h3')
            if not h: continue
            company=clean(' '.join(str(c) for c in h.contents if isinstance(c,str)))
            title_node=row.select_one('.role-title')
            if title_node:
                for badge in title_node.select('.newbadge,.appliedbadge'): badge.decompose()
            link=row.select_one('a.apply')
            add(make_job(text(title_node),company,text(row,'.loc'),link.get('href','') if link else '',
                         route,seen,row.get('data-new')=='1',text(row,'.sig')))
        health.append(dict(id=route,label=label,observedAt=seen,rows=len(rows),enrichment=enrich,
                           state='imported' if rows else 'missing'))
    # Union in combined rows: retains records not rendered in a route, but never reads private fields.
    p=folder/'all.html'
    if p.exists():
        soup=BeautifulSoup(p.read_text(encoding='utf8'),'html.parser')
        for row in soup.select('tbody tr'):
            link=row.select_one('a.rowlink')
            if not link: continue
            title_node=row.select_one('.title')
            for badge in title_node.select('.newbadge,.appliedbadge') if title_node else []: badge.decompose()
            label=text(row,'.route').lower()
            route=next((k for k,v in ROUTES.items() if v.lower()==label),'unknown')
            j=make_job(text(title_node),text(row,'.company'),text(row,'.loc'),link.get('href',''),
                       route,stamp(soup),row.get('data-new')=='1',text(row,'.signal'))
            add(j)
    if not records: raise ValueError('No vacancies parsed. Refusing to replace the last good snapshot.')
    p=folder/'gone.html'
    if p.exists():
        soup=BeautifulSoup(p.read_text(encoding='utf8'),'html.parser')
        for row in soup.select('tbody tr'):
            link=row.select_one('a.rowlink'); title_node=row.select_one('.title')
            if not link: continue
            for badge in title_node.select('.gonebadge') if title_node else []: badge.decompose()
            label=text(row,'.route').lower()
            route=next((k for k,v in ROUTES.items() if v.lower()==label),'unknown')
            j=make_job(text(title_node),text(row,'.company'),text(row,'.loc'),link.get('href',''),route,None,status='missing')
            if j['id'] not in records: add(j)
    if previous:
        for old in previous.get('jobs',[]):
            if old['id'] in records:
                # A genuine first-seen date is stable across rebuilds and reposts.
                if old.get('firstSeen'): records[old['id']]['firstSeen']=old['firstSeen']
            else:
                j={k:old.get(k) for k in PUBLIC_FIELDS}; j['status']='unknown'; j['snapshotNew']=False
                records[j['id']]=j
    groups=defaultdict(list)
    for j in records.values():
        if j['region']!='unknown' and j['status']=='listed':
            groups[(norm(j['company']),norm(j['title']),norm(j['location']))].append(j)
    for key, jobs in groups.items():
        if len(jobs)>1:
            group=hashlib.sha256('|'.join(key).encode()).hexdigest()[:16]
            for j in jobs: j['duplicateGroup']=group
    times=[h['observedAt'] for h in health if h['observedAt']]
    return dict(schemaVersion=1,snapshotAt=max(times) if times else None,
                generatedAt=datetime.now(timezone.utc).isoformat(),sources=health,
                jobs=sorted(records.values(),key=lambda j:j['id']))


def validate(data: dict) -> None:
    if data.get('schemaVersion')!=1 or not isinstance(data.get('jobs'),list) or not data['jobs']:
        raise ValueError('Invalid or empty public snapshot')
    if set(data)!={'schemaVersion','snapshotAt','generatedAt','sources','jobs'}:
        raise ValueError('Unexpected public snapshot fields')
    for source in data['sources']:
        if set(source)!={'id','label','observedAt','rows','enrichment','state'}:
            raise ValueError('Unexpected public source fields')
        if source['enrichment'] and not set(source['enrichment']) <= {'selected','fetched','cache_hits','failed'}:
            raise ValueError('Unexpected enrichment fields')
    seen=set()
    for j in data['jobs']:
        if set(j)!=PUBLIC_FIELDS: raise ValueError('Unexpected public record fields (privacy allowlist)')
        if j['id'] in seen: raise ValueError('Duplicate vacancy identity')
        seen.add(j['id'])
        if not re.fullmatch(r'[a-f0-9]{24}',j['id']): raise ValueError('Invalid identity')
        for k in ('title','company','location'):
            if not isinstance(j[k],str) or len(j[k])>2000: raise ValueError('Invalid '+k)
        if j['url'] and not canonical_url(j['url'])[0]: raise ValueError('Unsafe URL')
        if j['status'] not in ('listed','missing','unknown'): raise ValueError('Unsubstantiated vacancy status')
        if j['region'] not in ('london','rest','uk','unknown','international'): raise ValueError('Invalid region')
        if j['descriptionCheckedAt'] is not None: raise ValueError('This importer cannot substantiate JD verification')
    if any(k in data for k in PRIVATE_KEYS): raise ValueError('Private data in public snapshot')


def build(out: Path, legacy: Path | None = None):
    out.mkdir(parents=True,exist_ok=True)
    existing=out/'data/jobs.json'; previous=json.loads(existing.read_text()) if existing.exists() else None
    if legacy: data=import_legacy(legacy,previous)
    elif previous: data=previous
    else: raise ValueError('Supply --legacy or --bootstrap for the initial public-data migration')
    validate(data)
    (out/'data').mkdir(exist_ok=True)
    existing.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    web=out/'web'
    if web.resolve() != (ROOT/'web').resolve(): shutil.copytree(ROOT/'web',web,dirs_exist_ok=True)
    shutil.copyfile(ROOT/'web/index.html',out/'index.html')
    (out/'.nojekyll').touch()
    for name in [*ROUTES,'all','gone','shortlist']:
        suffix='view=archive' if name=='gone' else ('view=saved' if name=='shortlist' else
               'view=discover'+('&source='+name if name in ROUTES else ''))
        (out/(name+'.html')).write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta http-equiv="refresh" content="0;url=./index.html#'+suffix+'">'
            '<title>Mithril — view moved</title><p>This view has moved to '
            '<a href="./index.html#'+suffix+'">Mithril</a>.</p></html>')
    counts=Counter(j['status'] for j in data['jobs'])
    print(json.dumps(dict(records=len(data['jobs']),statuses=dict(counts),
                         repairedLinks=sum(j['linkRepaired'] for j in data['jobs']),
                         unknownLocations=sum(j['region']=='unknown' for j in data['jobs']),
                         snapshotAt=data['snapshotAt']),indent=2))


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--legacy',type=Path); ap.add_argument('--out',type=Path,default=ROOT)
    ap.add_argument('--bootstrap',help='Explicit audited git revision; used only for first migration')
    args=ap.parse_args()
    if args.bootstrap and not (args.out/'data/jobs.json').exists():
        if not re.fullmatch('[a-f0-9]{40}',args.bootstrap): ap.error('Bootstrap needs a full commit SHA')
        with tempfile.TemporaryDirectory(prefix='mithril-migrate-') as d:
            for name in [*ROUTES,'all','gone']:
                content=subprocess.check_output(['git','show',args.bootstrap+':'+name+'.html'],cwd=ROOT)
                (Path(d)/(name+'.html')).write_bytes(content)
            build(args.out,Path(d))
    else:
        # Existing scanner pushes can be bridged; publishers must also adopt the safe export command.
        legacy=args.legacy
        if not legacy and (args.out/'all.html').exists() and 'data-fit=' in (args.out/'all.html').read_text():
            legacy=args.out
        build(args.out,legacy)

if __name__=='__main__': main()
