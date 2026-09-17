import {PRACTICES,ROUTES,STATUSES,DEFAULTS,readState,writeState,filterJobs,displayDate,daysOld,explanation,publicCSV,validateSnapshot,safeURL} from './core.mjs';
import {Vault} from './vault.mjs';
const $=s=>document.querySelector(s), e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAGE_SIZE=20, privateViews=['saved','applications','hidden'];
let data=null,state=readState(location.hash),visible=[],allJobs=[],lookup=new Map(),toastTimer,searchTimer,lockTimer,activeJob=null;
let vault,storageAvailable=true;
try {const storage=window.localStorage;storage.getItem('mithril.vault.v1');vault=new Vault(storage);}
catch {storageAvailable=false;vault=new Vault({getItem(){return null;},setItem(){throw new Error('Browser storage is unavailable.');}});}
const localJobs=()=>vault.unlocked?vault.data.jobs:{};
const statusOf=j=>localJobs()[j.id]?.status||'';
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6500);}
function touchVault(){clearTimeout(lockTimer);if(vault.unlocked)lockTimer=setTimeout(()=>lockWorkspace('Workspace locked after 15 minutes without activity.'),900000);}
function lockWorkspace(message='Workspace locked.'){vault.lock();activeJob=null;$('#detail-dialog').close();$('#vault-dialog').close();$('#detail-content').replaceChildren();$('#vault-content').replaceChildren();render();if(message)toast(message);}
function navigate(patch,replace=false){
  state=readState(writeState({...state,...patch,page:patch.page??1}));
  history[replace?'replaceState':'pushState'](null,'',writeState(state));render();
}
function download(name,content,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function actions(label='Unlock workspace'){return '<button class="button primary" data-action="vault">'+e(label)+'</button>';}
function empty(title,message,button=''){return '<div class="empty"><h3>'+e(title)+'</h3><p>'+e(message)+'</p>'+button+'</div>';}
function updateJobs(){
  allJobs=[...data.jobs];const ids=new Set(allJobs.map(j=>j.id));
  if(vault.unlocked)for(const [id,v] of Object.entries(vault.data.jobs)){
    if(!ids.has(id)&&v.snapshot){allJobs.push({...v.snapshot,id,status:'unknown',snapshotNew:false});}
  }
  lookup=new Map(allJobs.map(j=>[j.id,j]));
}
function render(){
  if(!data)return;
  updateJobs();touchVault();document.body.dataset.view=state.view;
  document.querySelectorAll('a[data-view]').forEach(a=>{
    if(a.dataset.view===state.view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  $('#vault-button').textContent=vault.unlocked?'Lock workspace':'Unlock workspace';
  $('#snapshot-label').textContent='Listing snapshot · '+displayDate(data.snapshotAt)+' · not a live check';
  const titles={today:['NEW IN THE LATEST SNAPSHOT.','New listings.<br><em>Worth a closer look.</em>','Only roles first reported in the latest snapshot appear here. Save a role to build your private shortlist.'],
    discover:['THE FULL DISCOVERY SET','A wider field.<br><em>A clearer view.</em>','Search across the available routes. Combine filters to turn a long list into a useful one.'],
    saved:['YOUR PRIVATE SHORTLIST','Roles worth a closer look.','Only roles you saved or marked preparing appear here. This is your shortlist, not a score.'],
    applications:['FROM INTEREST TO INTERVIEW','Keep the next step visible.','Your private application history, notes and follow-ups. Opening an advert never marks it applied.'],
    hidden:['OUT OF THE WAY, NOT LOST','A quieter search.','Hidden roles stay out of discovery. You can bring them back whenever your priorities change.'],
    archive:['ABSENCE IS NOT CLOSURE','Not seen recently.','These listings disappeared from a scan or are absent from the latest input. That does not prove they are closed.'],
    health:['KNOW WHAT THE SYSTEM KNOWS','The evidence behind the feed.','Discovery coverage and description-check failures, without a misleading all-green status.'],
    settings:['YOUR WORKSPACE. YOUR CONTROL.','Private by design.<br><em>Honest about the limits.</em>','Manage your encrypted local workspace and understand exactly how discovery works.']};
  const [eyebrow,title,description]=titles[state.view];$('#view-eyebrow').textContent=eyebrow;$('#page-title').innerHTML=title;$('#page-description').textContent=description;
  $('#hero-note').hidden=!['today','discover'].includes(state.view);
  const listed=data.jobs.filter(j=>j.status==='listed'), fresh=listed.filter(j=>j.snapshotNew).length;
  $('#metrics').innerHTML=[['Available in snapshot',listed.length.toLocaleString(),'Not confirmed open now'],['New in this snapshot',fresh.toLocaleString(),'First reported by the scanner'],['Discovery routes',data.sources.length,'Employer feeds + job boards'],['Requirements to check',listed.filter(j=>!j.descriptionCheckedAt).length.toLocaleString(),'No invented verification']].map(([label,note,caption])=>'<div class="metric"><div class="label">'+label+'</div><strong>'+note+'</strong><div class="caption">'+caption+'</div></div>').join('');
  $('#metrics').hidden=['settings','health'].includes(state.view)||privateViews.includes(state.view);
  const age=daysOld(data.snapshotAt);$('#stale-banner').hidden=age!==null&&age<7;
  $('#stale-banner').textContent=age===null?'The source observation date was not recorded. Treat these as discoveries to verify.':'This snapshot is '+age+' days old. A site rebuild does not re-check vacancies; open the advert before acting.';
  $('#discover-count').textContent=listed.length.toLocaleString();$('#today-count').textContent=fresh;
  const special=['health','settings'].includes(state.view);
  $('#search-section').hidden=special;$('#feed-layout').hidden=special;$('#special-view').hidden=!special;
  $('#saved-searches').innerHTML=vault.unlocked&&vault.data.searches.length?'<div class="eyebrow">SAVED SEARCHES</div>'+vault.data.searches.map(s=>'<a href="'+e(s.hash.startsWith('#')?s.hash:'#')+'">'+e(s.name)+'</a>').join(''):'';
  if(special){renderSpecial();return;}
  for(const k of ['region','source','pqe','work','sort'])$('#'+k).value=state[k];
  $('#search').value=state.q;$('#fresh').checked=state.view==='today'||state.fresh==='1';$('#fresh').disabled=state.view==='today';
  $('#practice-pills').innerHTML=[['all','All practices'],...Object.entries(PRACTICES)].map(([key,label])=>'<button class="pill" data-practice="'+key+'" aria-pressed="'+(state.practice===key)+'">'+label+'</button>').join('');
  const blocked=privateViews.includes(state.view)&&!vault.unlocked;
  visible=blocked?[]:filterJobs(allJobs,state,localJobs());
  const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));state.page=Math.min(state.page,pages);
  const start=(state.page-1)*PAGE_SIZE, slice=visible.slice(start,start+PAGE_SIZE);
  $('#results-title').textContent={today:'New in the latest snapshot',discover:'Explore opportunities',saved:'Your private shortlist',applications:'Your application history',hidden:'Hidden opportunities',archive:'Listings to re-check'}[state.view];
  $('#result-count').textContent=blocked?'Workspace locked':visible.length.toLocaleString()+' matching '+(visible.length===1?'listing':'listings')+(visible.length?' · '+(start+1)+'–'+(start+slice.length)+' shown':'');
  const filters=[state.region==='uk'?'UK location stated in listing':state.region==='all'?'All locations':$('#region').selectedOptions[0].textContent,
    state.practice!=='all'?PRACTICES[state.practice]:null,state.source!=='all'?ROUTES[state.source]:null,state.view==='today'?'Latest snapshot only':state.fresh==='1'?'New in snapshot':null,
    state.pqe!=='all'?$('#pqe').selectedOptions[0].textContent:null,state.work!=='all'?$('#work').selectedOptions[0].textContent:null,
    state.view==='saved'?'Save or prepare roles to keep them here.':null].filter(Boolean);
  $('#filter-summary').textContent=filters.join(' · ')+'. '+(state.sort==='signal'?'Ordered by evidence signals, not a score or proven suitability.':'All filters combine.');
  if(blocked)$('#results').innerHTML=empty('Your workspace is locked.','Applications and notes are encrypted in this browser. Unlock to see them — they are never loaded from the public feed.',actions());
  else if(!slice.length)$('#results').innerHTML=empty('A little too quiet.','No roles match this view. Try resetting the filters or explore all locations, including those that still need checking.','<button class="button" data-action="clear">Reset filters</button>');
  else $('#results').innerHTML=slice.map(renderCard).join('');
  $('#pagination').innerHTML=pages>1?'<button class="button small" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+'>← Previous</button><span>Page '+state.page+' of '+pages+'</span><button class="button small" data-page="'+(state.page+1)+'" '+(state.page===pages?'disabled':'')+'>Next →</button>':'';
  renderInsights();
}
function renderCard(j){
  const local=localJobs()[j.id]||{},status=local.status,source=j.sourceKind==='employer-feed'?'Employer-feed discovery':j.sourceKind==='job-board'?'Job-board discovery':'Source unverified';
  const mono=j.company.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const tags='<span class="badge purple">'+e(PRACTICES[j.practice]||'Legal')+'</span>'+(j.snapshotNew?'<span class="badge green">New in snapshot</span>':'')+
    (status?'<span class="badge outline">'+e(STATUSES[status]||status)+'</span>':'')+(j.status!=='listed'?'<span class="badge amber">Availability unknown</span>':'');
  return '<article class="job-card" data-job="'+j.id+'"><div class="card-top"><span class="monogram" aria-hidden="true">'+e(mono)+'</span><div class="card-heading"><div class="card-company"><strong>'+e(j.company)+'</strong><span>· '+e(j.sources.map(s=>ROUTES[s]||s).join(' / '))+'</span></div><h3><button class="title-button" data-detail="'+j.id+'">'+e(j.title)+'</button></h3><div class="badges">'+tags+'</div></div><button class="save-button '+(status?'saved':'')+'" data-save="'+j.id+'" aria-label="'+e(status?'Manage '+j.title:'Save '+j.title)+'">'+(status?'◆':'◇')+'</button></div>'+
    '<div class="card-meta"><span>⌖ '+e(j.location)+'</span><span>'+e(j.pqe||'PQE not extracted')+'</span>'+(j.workMode!=='unspecified'?'<span>'+e(j.workMode)+' mentioned</span>':'')+'</div><p class="card-explanation">'+e(explanation(j))+'</p>'+
    '<div class="card-bottom"><div class="card-evidence">'+source+'<br>'+e(local.reviewed?'Requirements marked reviewed by you':'Requirements not checked')+(j.duplicateGroup?' · Possible cross-post':'')+'</div><div class="card-actions"><button class="text-button" data-detail="'+j.id+'">View evidence</button>'+
    (safeURL(j.url)?'<a class="button" href="'+e(j.url)+'" target="_blank" rel="noopener noreferrer">Open advert ↗</a>':'<span class="badge amber">Link unavailable</span>')+'</div></div></article>';
}
function renderInsights(){
  const failures=data.sources.filter(s=>(s.enrichment?.failed||0)>0),unknown=data.jobs.filter(j=>j.status==='listed'&&j.region==='unknown').length;
  let privateCard;
  if(!vault.unlocked)privateCard='<div class="insight-card dark"><div class="eyebrow">YOUR PRIVATE WORKSPACE</div><h3>Good opportunities deserve a next step.</h3><p>Save roles, track applications and keep notes in a passphrase-protected workspace on this device.</p>'+actions(vault.exists?'Unlock your workspace':'Create your workspace')+'</div>';
  else {
    const records=Object.values(vault.data.jobs),due=records.filter(v=>v.due&&v.due<=new Date().toLocaleDateString('en-CA')&&!['hidden','rejected','withdrawn','offer'].includes(v.status));
    privateCard='<div class="insight-card dark"><div class="eyebrow">YOUR PRIVATE WORKSPACE</div><h3>'+records.filter(v=>['saved','preparing'].includes(v.status)).length+' roles worth a closer look.</h3><p>'+records.filter(v=>['applied','interview'].includes(v.status)).length+' active applications · '+due.length+' follow-ups due.</p><a class="button" href="#view=applications&region=all">See your next steps →</a></div>';
  }
  $('#insights').innerHTML=privateCard+'<div class="insight-card"><div class="eyebrow">THE SEARCH BRIEFING</div><h3>Keep the blind spots visible.</h3><div class="brief-line"><span>Description-check issues</span><b>'+failures.length+' routes</b></div><div class="brief-line"><span>Locations to confirm</span><b>'+unknown+'</b></div><div class="brief-line"><span>Last source snapshot</span><b>'+e(displayDate(data.snapshotAt))+'</b></div><p>A cached snippet is not a fresh advert check. Missing from a feed is not the same as closed.</p><a class="text-button" href="#view=health">Inspect source health →</a></div>'+
    '<div class="insight-card"><div class="eyebrow">A BETTER SEARCH</div><h3>Make the query do more.</h3><p>Try <strong>counsel London</strong>, an exact phrase such as <strong>"trade mark"</strong>, or exclude a term with <strong>-senior</strong>.</p><button class="text-button" data-action="csv">Export these public listings ↓</button></div>';
}
function renderSpecial(){
  if(state.view==='health'){
    $('#special-view').innerHTML='<div class="notice">These are imported scanner observations, not a live monitoring service. A description-check failure does not mean discovery failed or that a job is closed.</div><div class="health-grid">'+data.sources.map(s=>{
      const x=s.enrichment,failed=x?.failed||0;
      return '<article class="health-card"><div class="eyebrow">DISCOVERY ROUTE</div><h3>'+e(s.label)+'</h3><span class="badge '+(failed||s.state==='missing'?'amber':'purple')+'">'+(s.state==='missing'?'Missing input':failed?'Description checks degraded':'Snapshot imported — not live verified')+'</span><div class="health-stats"><div><b>'+s.rows+'</b><small>Raw route rows</small></div><div><b>'+(x?x.failed:'—')+'</b><small>JD checks failed</small></div><div><b>'+(x?x.cache_hits:'—')+'</b><small>Cached responses</small></div></div><p>Observed '+e(displayDate(s.observedAt))+'. '+(x?'Selected '+x.selected+'; freshly fetched '+x.fetched+'. Cache ages and row-level checks were not supplied.':'No description-check counters supplied.')+'</p><a class="text-button" href="#view=discover&source='+s.id+'&region=all">Explore this route →</a></article>';
    }).join('')+'</div><div class="settings-card"><h2>What a healthy feed would establish</h2><p>Separate listing observation, full-description retrieval, requirement extraction and confirmed closure. This release does not upgrade legacy keyword scores into evidence, make network checks it has not performed, or confuse publication time with verification time.</p><p>Snapshot: '+e(displayDate(data.snapshotAt))+' · Public data packaged: '+e(displayDate(data.generatedAt))+'. Employer names from recruitment postings may identify the recruiter, not the hiring client.</p></div>';
    return;
  }
  $('#special-view').innerHTML='<div class="settings-layout"><section class="settings-card"><div class="eyebrow lilac">LOCAL ENCRYPTED WORKSPACE</div><h2>Your notes do not belong in a public feed.</h2><p>Saved roles, application statuses, notes, follow-ups and saved searches are encrypted in this browser. The passphrase and encryption key are not saved. The workspace locks after 15 minutes of inactivity.</p><p><strong>This is local storage, not a cloud account.</strong> Other devices do not automatically synchronise. Clearing browser data removes the workspace. Keep an encrypted backup and remember the passphrase: there is no password recovery.</p><div class="dialog-actions">'+actions(vault.unlocked?'Lock workspace':vault.exists?'Unlock workspace':'Create workspace')+'<button class="button" data-action="backup" '+(!vault.exists?'disabled':'')+'>Export encrypted backup</button><button class="button" data-action="restore">Restore backup</button></div><details><summary>Security boundaries</summary><p>AES-GCM encryption protects the saved workspace while locked. It is not a substitute for a secure device, and does not protect unlocked data from malicious scripts, extensions, same-origin compromises or someone using this browser. This implementation has automated tests, not an independent security audit. Use a long, unique passphrase. The site loads no third-party scripts, fonts, ads or analytics.</p></details></section>'+
    '<section class="settings-card"><div class="eyebrow lilac">THE DISCOVERY MODEL</div><h2>Relevance is a reason to investigate.</h2><p>Discovery order uses practice words in a title, explicitly extracted PQE, the discovery route and new-in-snapshot status. "Associate" alone does not mean NQ. "Attorney" alone does not mean senior. Earlier practice in another jurisdiction is neither assumed to count nor assumed not to count.</p><p><strong>No recommendation is a verified eligibility decision.</strong> Read the requirements, check the actual location and confirm the advert is open. A private "reviewed" marker records your own review only.</p><details><summary>Dates, duplicates and missing listings</summary><p>First seen is unknown unless the scanner actually reported it. Rebuilds do not change observation dates. Exact canonical URLs share one identity; similar employer/title/location combinations are flagged as possible cross-posts, not silently merged. A disappeared listing is kept with unknown availability, not declared closed.</p></details><details><summary>Public-data and historical privacy limits</summary><p>The new public dataset excludes candidate questionnaires, matter narratives, application status and notes. Earlier published versions may still exist in Git history, old artifacts or caches. Removing the current pages does not retract those copies. The upstream scanner must use the publish-safe exporter before pushing future data.</p></details><p>Keyboard: press <strong>/</strong> to search. All filters combine. Filter URLs are bookmarkable; private notes are never placed in them.</p></section></div>';
}
function openDetail(id){
  const j=lookup.get(id);if(!j)return;activeJob=id;
  const local=localJobs()[id]||{},same=j.duplicateGroup?allJobs.filter(x=>x.duplicateGroup===j.duplicateGroup&&x.id!==id):[];
  const field=(label,value)=>'<div><small>'+e(label)+'</small><strong>'+e(value)+'</strong></div>';
  $('#detail-content').innerHTML='<div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow lilac">'+e(j.company)+'</div><h2 id="detail-title">'+e(j.title)+'</h2><div class="badges"><span class="badge purple">'+e(PRACTICES[j.practice])+'</span><span class="badge amber">Requirements not independently checked</span></div></div><button class="close" data-close="detail" aria-label="Close job details">×</button></div>'+
    '<div class="detail-grid">'+field('Location as supplied',j.location)+field('PQE as supplied',j.pqe||'Not extracted — not an NQ claim')+field('First seen',displayDate(j.firstSeen))+field('Listing last observed',displayDate(j.sourceLastSeen))+field('Description checked','Not recorded')+field('Vacancy status',j.status==='listed'?'Present in snapshot; current opening unverified':'Missing or unknown — not confirmed closed')+'</div>'+
    '<section class="detail-section"><h3>Why it surfaced</h3><p>'+e(explanation(j))+'</p>'+(j.pqe?'<p>PQE evidence: '+e(j.pqeEvidence)+'. The jurisdiction basis and whether this is mandatory or preferred still need checking.</p>':'')+
    (j.warnings.length?'<ul>'+j.warnings.map(w=>'<li>'+e(w)+'</li>').join('')+'</ul>':'')+'<p>Discovery sources: '+e(j.sources.map(s=>ROUTES[s]||s).join(', '))+'. '+(j.sourceKind==='job-board'?'This is a job-board link, not an employer-verified source.':'Source classification is not a live availability check.')+'</p>'+
    (safeURL(j.url)?'<a class="button primary" href="'+e(j.url)+'" target="_blank" rel="noopener noreferrer">Open original advert ↗</a><p class="small-print source-link">'+e(new URL(j.url).hostname)+'</p>':'<p class="notice">The application link could not be resolved safely. Find the role on the employer website before applying.</p>')+'</section>'+
    (same.length?'<section class="detail-section"><h3>Possible cross-posts — not auto-merged</h3>'+same.map(x=>'<p><button class="text-button" data-detail="'+x.id+'">'+e(x.company+' · '+x.title)+' →</button></p>').join('')+'</section>':'')+
    '<section class="detail-section"><h3>Your private next step</h3>'+(vault.unlocked?'<form id="job-form"><div class="form-grid"><label class="field">Application stage<select name="status"><option value="">Not tracked</option>'+Object.entries(STATUSES).map(([k,label])=>'<option value="'+k+'" '+(local.status===k?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="field">Follow-up date<input type="date" name="due" value="'+e(local.due||'')+'"></label><label class="field full">Next action<input name="nextAction" maxlength="500" placeholder="Read the PQE requirements; contact the recruiter…" value="'+e(local.nextAction||'')+'"></label><label class="field full">Private notes<textarea name="note" maxlength="20000" placeholder="What matters, what to clarify, what to prepare…">'+e(local.note||'')+'</textarea></label></div><label class="check small-print"><input type="checkbox" name="reviewed" '+(local.reviewed?'checked':'')+'> I have reviewed the requirements myself</label><p class="form-error" id="job-error" role="alert"></p><div class="dialog-actions"><button class="button primary" type="submit">Save private changes</button><button class="text-button" type="button" data-hide="'+id+'">'+(local.status==='hidden'?'Restore to saved':'Hide from discovery')+'</button></div></form>'+
      (local.history?.length?'<details class="small-print"><summary>Application history</summary>'+local.history.slice().reverse().map(h=>'<div class="history-line">'+e(STATUSES[h.status]||h.status)+' · '+e(displayDate(h.at))+'</div>').join('')+'</details>':''):
      '<p>Unlock to save notes or track this role. Private information is never written into the public website.</p>'+actions())+'</section></div>';
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
  $('#job-form')?.addEventListener('submit',async ev=>{
    ev.preventDefault();const f=new FormData(ev.target),button=ev.target.querySelector('[type=submit]');button.disabled=true;
    try{await vault.update(id,{status:f.get('status'),due:f.get('due'),nextAction:f.get('nextAction'),note:f.get('note'),reviewed:f.has('reviewed')},j);render();openDetail(id);toast('Private changes saved on this device.');}
    catch(err){$('#job-error').textContent=err.message;}finally{button.disabled=false;}
  });
}
function openVault(mode='unlock'){
  if(mode==='unlock'&&vault.unlocked){lockWorkspace();return;}
  const restore=mode==='restore',creating=!vault.exists&&!restore;
  $('#vault-content').innerHTML='<div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow lilac">LOCAL ENCRYPTED WORKSPACE</div><h2 id="vault-title">'+(restore?'Restore an encrypted backup':creating?'A private space for your next move.':'Welcome back.')+'</h2></div><button class="close" data-close="vault" aria-label="Close workspace dialog">×</button></div>'+
    '<p class="small-print">'+(restore?'Only Mithril encrypted backup files are accepted. Decryption is checked before existing data is replaced.':creating?'Choose a long, unique passphrase. Your notes and application history stay encrypted on this device — not in the public job feed.':'Enter the passphrase for the workspace saved in this browser.')+'</p><form id="vault-form">'+
    (restore?'<label class="field">Encrypted backup<input id="backup-file" type="file" accept=".json,application/json" required></label>':'')+
    '<label class="field">Passphrase<input id="password" type="password" autocomplete="'+(creating?'new-password':'current-password')+'" '+(creating?'minlength="12"':'')+' required></label>'+
    (creating?'<label class="field">Confirm passphrase<input id="confirm-password" type="password" autocomplete="new-password" minlength="12" required></label><p class="notice">There is no password recovery. Export a backup after saving your first roles. Clearing browser data removes the local copy.</p>':'')+
    (restore&&vault.exists?'<label class="check small-print"><input id="replace-confirm" type="checkbox" required> Replace this browser’s existing workspace. I have exported a backup of anything I need to keep.</label>':'')+
    '<p class="form-error" id="vault-error" role="alert"></p><div class="dialog-actions"><button class="button primary" type="submit" '+(!storageAvailable?'disabled':'')+'>'+(restore?'Restore backup':creating?'Create workspace':'Unlock workspace')+'</button></div></form><p class="small-print">No cloud sync. No password sent to a server. Automatic lock after 15 minutes of inactivity.</p></div>';
  $('#vault-dialog').showModal();
  $('#vault-form').addEventListener('submit',async ev=>{
    ev.preventDefault();const button=ev.target.querySelector('[type=submit]');button.disabled=true;$('#vault-error').textContent='';
    try{
      const password=$('#password').value;
      if(restore){const file=$('#backup-file').files[0];if(!file||file.size>10000000)throw new Error('Choose a backup file smaller than 10 MB.');await vault.restore(await file.text(),password);}
      else if(creating){if(password!==$('#confirm-password').value)throw new Error('The passphrases do not match.');await vault.create(password);}
      else await vault.unlock(password);
      $('#password').value='';$('#vault-dialog').close();render();if(activeJob)openDetail(activeJob);toast(restore?'Encrypted workspace restored.':creating?'Workspace created. Your notes stay on this device.':'Workspace unlocked.');
    }catch(err){$('#vault-error').textContent=err.message;}finally{button.disabled=false;}
  });
}
async function saveJob(id){
  if(!vault.unlocked){openVault();return;}
  const j=lookup.get(id);if(!j)return;
  if(statusOf(j)){openDetail(id);return;}
  try{await vault.update(id,{status:'saved'},j);render();toast('Saved to your encrypted workspace.');}catch(err){toast(err.message);}
}
function resetFilters(){navigate({...DEFAULTS,view:state.view,region:privateViews.includes(state.view)||state.view==='archive'||state.view==='today'?'all':'uk'});}
async function handleAction(action){
  if(action==='vault')openVault();
  if(action==='clear')resetFilters();
  if(action==='backup'){try{download('mithril-encrypted-backup-'+new Date().toISOString().slice(0,10)+'.json',vault.export());toast('Encrypted backup exported. Keep it with your passphrase stored separately.');}catch(err){toast(err.message);}}
  if(action==='restore')openVault('restore');
  if(action==='csv'){download('mithril-public-listings.csv','\ufeff'+publicCSV(visible),'text/csv;charset=utf-8');toast('Exported public listing fields only. Private notes were not included.');}
}
document.addEventListener('click',async ev=>{
  const t=ev.target.closest('button,a');if(!t)return;
  if(t.dataset.close){$('#'+t.dataset.close+'-dialog').close();if(t.dataset.close==='detail')activeJob=null;}
  if(t.dataset.action)await handleAction(t.dataset.action);
  if(t.dataset.practice)navigate({practice:t.dataset.practice});
  if(t.dataset.page){navigate({page:Number(t.dataset.page)});$('#results-title').scrollIntoView({block:'start',behavior:'auto'});}
  if(t.dataset.detail)openDetail(t.dataset.detail);
  if(t.dataset.save)await saveJob(t.dataset.save);
  if(t.dataset.hide){const j=lookup.get(t.dataset.hide);try{await vault.update(j.id,{status:statusOf(j)==='hidden'?'saved':'hidden'},j);$('#detail-dialog').close();activeJob=null;render();toast('Role updated. Hidden roles can be restored from the Hidden view.');}catch(err){toast(err.message);}}
});
$('#vault-button').addEventListener('click',()=>openVault());
$('#reset').addEventListener('click',resetFilters);
for(const k of ['region','source','pqe','work','sort'])$('#'+k).addEventListener('change',ev=>navigate({[k]:ev.target.value}));
$('#fresh').addEventListener('change',ev=>navigate({fresh:ev.target.checked?'1':'0'}));
$('#search').addEventListener('input',ev=>{clearTimeout(searchTimer);const q=ev.target.value;searchTimer=setTimeout(()=>navigate({q},true),120);});
$('#save-search').addEventListener('click',async()=>{
  if(!vault.unlocked){openVault();return;}
  const name=prompt('Name this saved search (stored in your encrypted workspace):');if(!name)return;
  try{await vault.saveSearch(name,writeState({...state,page:1}));render();toast('Search saved. It is a bookmark, not an automated alert.');}catch(err){toast(err.message);}
});
window.addEventListener('hashchange',()=>{state=readState(location.hash);render();});
window.addEventListener('popstate',()=>{state=readState(location.hash);render();});
window.addEventListener('storage',ev=>{if(ev.key==='mithril.vault.v1'&&vault.unlocked)lockWorkspace('Workspace changed in another tab. Unlock again to load the latest copy.');});
window.addEventListener('pagehide',()=>lockWorkspace(''));
window.addEventListener('pageshow',ev=>{if(ev.persisted)lockWorkspace('Workspace locked after returning to this page.');});
$('#vault-dialog').addEventListener('close',()=>$('#vault-content').replaceChildren());
$('#detail-dialog').addEventListener('close',()=>$('#detail-content').replaceChildren());
document.addEventListener('keydown',ev=>{
  touchVault();if(ev.key==='/'&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
    ev.preventDefault();if(['health','settings'].includes(state.view))navigate({view:'discover'});$('#search').focus();
  }
});
document.addEventListener('pointerdown',touchVault,{passive:true});
$('#detail-dialog').addEventListener('cancel',()=>activeJob=null);
for(const [k,label] of Object.entries(ROUTES)){const option=document.createElement('option');option.value=k;option.textContent=label;$('#source').append(option);}
$('#filter-toggle')?.addEventListener('click',ev=>{document.body.classList.toggle('filters-open');ev.currentTarget.setAttribute('aria-expanded',String(document.body.classList.contains('filters-open')));});
try{
  const response=await fetch(new URL('../data/jobs.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Vacancy data could not be loaded ('+response.status+').');
  data=validateSnapshot(await response.json());render();
}catch(err){$('#load-error').hidden=false;$('#load-error').textContent=err.message+' Reload to retry. Your encrypted workspace has not been changed.';$('#results').innerHTML=empty('The feed is temporarily unavailable.','No old data has been silently presented as current. Please reload when the snapshot is available.');}
