/** Pure, testable discovery logic. No candidate scoring or eligibility inference. */
export const PRACTICES = {ip:'IP & brand',commercial:'Commercial & tech',corporate:'Corporate',data:'Data & privacy',disputes:'Disputes',regulatory:'Regulatory',general:'General legal',other:'Other practice areas'};
export const ROUTES = {inhouse:'In-house',china:'China bridge',firms:'Law firms',traditional:'Traditional',openmarket:'Open market',boards:'Job boards',unknown:'Unspecified'};
export const STATUSES = {saved:'Saved',preparing:'Preparing',applied:'Applied',interview:'Interview',offer:'Offer',rejected:'Rejected',withdrawn:'Withdrawn',hidden:'Hidden'};
export const DEFAULTS = {view:'today',q:'',practice:'all',region:'uk',source:'all',pqe:'all',work:'all',fresh:'0',sort:'signal',page:1};
const VIEWS = ['today','discover','saved','applications','hidden','archive','health','settings'];
export function safeURL(value) {
  try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password ? u.href : null; }
  catch { return null; }
}
export function readState(hash='') {
  const p=new URLSearchParams(hash.replace(/^#/,'')), s={...DEFAULTS};
  for (const k of Object.keys(s)) if (p.has(k)) s[k]=p.get(k);
  if (!VIEWS.includes(s.view)) s.view='today';
  if (!['all',...Object.keys(PRACTICES)].includes(s.practice)) s.practice='all';
  if (!p.has('region')) s.region=s.view==='today'?'all':'uk';
  else if (!['all','uk','london','rest','unknown','international'].includes(s.region)) s.region='uk';
  if (!['all',...Object.keys(ROUTES)].includes(s.source)) s.source='all';
  if (!['all','nq','early','mid','senior','unknown'].includes(s.pqe)) s.pqe='all';
  if (!['all','remote','hybrid','unspecified'].includes(s.work)) s.work='all';
  if (!['signal','newest','company','title'].includes(s.sort)) s.sort='signal';
  s.q=String(s.q).slice(0,200); s.fresh=s.fresh==='1'?'1':'0';
  s.page=Math.min(10000,Math.max(1,parseInt(s.page,10)||1)); return s;
}
export function writeState(s) {
  const p=new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) if (String(s[k])!==String(DEFAULTS[k])) p.set(k,String(s[k]));
  return '#'+p.toString();
}
export function pqeRange(value) {
  if (!value) return null;
  const v=value.toLowerCase().replace(/newly qualified/g,'nq'), nums=[...v.matchAll(/\d+/g)].map(x=>Number(x[0]));
  if (v.includes('nq')) return [0,nums[0]??0];
  if (!nums.length) return null;
  return [nums[0],nums[1]??(v.includes('+')?99:nums[0])];
}
export function discoverySignal(j) {
  const base={ip:12,commercial:10,corporate:7,data:7,disputes:6,regulatory:3,general:4,other:-20}[j.practice]??0;
  const pqe=pqeRange(j.pqe);
  return base+(j.snapshotNew?2:0)+(j.sourceKind==='employer-feed'?2:0)+(pqe&&pqe[0]<=2?3:0)
    -(j.region==='unknown'?4:0)-(j.seniority==='senior-title'?4:0)-(j.warnings.some(x=>x.startsWith('Patent-profession'))?5:0);
}
export function searchMatch(j,query) {
  const hay=[j.title,j.company,j.location,PRACTICES[j.practice],j.pqe,...j.sources.map(x=>ROUTES[x])].join(' ').toLowerCase();
  const terms=query.toLowerCase().match(/-?"[^"]+"|\S+/g)||[];
  return terms.every(term=>{const minus=term.startsWith('-'); const t=(minus?term.slice(1):term).replace(/^"|"$/g,'');
    return !t|| (minus?!hay.includes(t):hay.includes(t));});
}
export function filterJobs(jobs,s,privateJobs={}) {
  const results=jobs.filter(j=>{
    const local=privateJobs[j.id]||{}, status=local.status;
    if (s.view==='archive') { if (j.status==='listed') return false; }
    else if (!['saved','applications','hidden'].includes(s.view) && j.status!=='listed') return false;
    if (s.view==='saved' && !['saved','preparing'].includes(status)) return false;
    if (s.view==='applications' && !['applied','interview','offer','rejected','withdrawn'].includes(status)) return false;
    if (s.view==='hidden' ? status!=='hidden' : status==='hidden') return false;
    if (s.view==='today' && (!j.snapshotNew||['applied','interview','offer','rejected','withdrawn'].includes(status))) return false;
    if (s.practice!=='all' && j.practice!==s.practice) return false;
    if (s.region==='uk' && !['london','rest','uk'].includes(j.region)) return false;
    if (!['all','uk'].includes(s.region)&&j.region!==s.region) return false;
    if (s.source!=='all'&&!j.sources.includes(s.source)) return false;
    if (s.work!=='all'&&j.workMode!==s.work) return false;
    if (s.fresh==='1'&&!j.snapshotNew) return false;
    if (s.pqe!=='all') {
      const r=pqeRange(j.pqe);
      if (s.pqe==='unknown') {if(r)return false;}
      else if (!r) return false;
      else {
        const [lo,hi]={nq:[0,0],early:[0,2],mid:[3,5],senior:[6,99]}[s.pqe];
        if (r[1]<lo||r[0]>hi) return false;
      }
    }
    return searchMatch(j,s.q);
  });
  return results.sort((a,b)=>{
    let diff=0;
    if (s.sort==='signal') diff=discoverySignal(b)-discoverySignal(a);
    if (s.sort==='newest') diff=(Date.parse(b.firstSeen)||0)-(Date.parse(a.firstSeen)||0);
    if (s.sort==='company') diff=a.company.localeCompare(b.company);
    if (s.sort==='title') diff=a.title.localeCompare(b.title);
    return diff||a.company.localeCompare(b.company)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id);
  });
}
export function daysOld(value,now=Date.now()) { return value? Math.max(0,Math.floor((now-Date.parse(value))/86400000)):null; }
export function displayDate(value) { return value?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/London'}).format(new Date(value)):'Not recorded'; }
export function explanation(j) {
  const base=j.practice==='general'?'Legal-role title; specialism needs checking.':PRACTICES[j.practice]+' signal in the advertised title.';
  return base+(j.pqe?' Stated level: '+j.pqe+'.':' PQE not extracted — read the advert.');
}
export function publicCSV(jobs) {
  const quote=v=>{let s=String(v??'');if(/^[\s\uFEFF]*[=+\-@]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [['Role','Listed organisation','Location','Practice signal','PQE evidence','Listing last observed','Application URL'],
    ...jobs.map(j=>[j.title,j.company,j.location,PRACTICES[j.practice],j.pqe,j.sourceLastSeen,j.url])]
    .map(row=>row.map(quote).join(',')).join('\r\n');
}
export function validateSnapshot(data) {
  if (data?.schemaVersion!==1||!Array.isArray(data.jobs)||!data.jobs.length||!Array.isArray(data.sources)) throw new Error('Unsupported or empty vacancy snapshot.');
  const ids=new Set();
  for (const j of data.jobs) {
    if(!/^[a-f0-9]{24}$/.test(j.id)||ids.has(j.id)||typeof j.title!=='string'||typeof j.company!=='string'||!Array.isArray(j.sources)||!Array.isArray(j.warnings)) throw new Error('Invalid vacancy data.');
    ids.add(j.id); if (j.url&&!safeURL(j.url)) throw new Error('Unsafe application link.');
  }
  return data;
}
