/** Local-only encrypted workspace. Not server authentication or automatic cloud sync.
 * PBKDF2-HMAC-SHA-256 -> AES-256-GCM; unique random IV for every write.
 * Keys/passwords stay in memory. Storage holds ciphertext only. */
const KEY='mithril.vault.v1', ITERATIONS=600000;
const enc=new TextEncoder(), dec=new TextDecoder();
function b64(bytes){let s=''; for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b); return btoa(s);}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function envelope(raw){
  const e=typeof raw==='string'?JSON.parse(raw):raw;
  if(e?.format!=='mithril-vault'||e.version!==1||e.iterations!==ITERATIONS||
     typeof e.salt!=='string'||typeof e.iv!=='string'||typeof e.ciphertext!=='string'||
     e.ciphertext.length>14000000||unb64(e.salt).length!==16||unb64(e.iv).length!==12)
    throw new Error('Not a supported Mithril encrypted backup.');
  return e;
}
async function derive(password,salt){
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function validateWorkspace(data){
  if(data?.version!==1||typeof data.jobs!=='object'||data.jobs===null||Array.isArray(data.jobs)||!Array.isArray(data.searches)) throw new Error('Invalid workspace.');
  if(Object.keys(data.jobs).some(k=>!/^[a-f0-9]{24}$/.test(k))) throw new Error('Invalid workspace IDs.');
  for(const v of Object.values(data.jobs)){
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid workspace record.');
    if(v.status&&!['saved','preparing','applied','interview','offer','rejected','withdrawn','hidden'].includes(v.status))throw new Error('Invalid application stage.');
    for(const k of ['note','nextAction','due'])if(k in v&&typeof v[k]!=='string')throw new Error('Invalid private field.');
    if(v.history&&(!Array.isArray(v.history)||v.history.some(h=>typeof h.status!=='string'||typeof h.at!=='string')))throw new Error('Invalid history.');
    if(v.snapshot&&(!['title','company','location'].every(k=>typeof v.snapshot[k]==='string')||!Array.isArray(v.snapshot.sources)||!Array.isArray(v.snapshot.warnings)))throw new Error('Invalid saved vacancy.');
  }
  if(data.searches.some(s=>typeof s.name!=='string'||s.name.length>70||typeof s.hash!=='string'||!s.hash.startsWith('#')||s.hash.length>2048))throw new Error('Invalid saved searches.');
  return data;
}
export class Vault {
  constructor(storage=globalThis.localStorage){this.storage=storage;this.key=null;this.salt=null;this.data=null;this.queue=Promise.resolve();this.baseline=null;}
  get exists(){return this.storage.getItem(KEY)!==null;}
  get unlocked(){return this.key!==null;}
  async create(password){
    if(this.exists)throw new Error('A workspace already exists. Unlock or restore it instead.');
    if(password.length<12)throw new Error('Use a passphrase of at least 12 characters.');
    if(!globalThis.crypto?.subtle)throw new Error('Encrypted storage requires HTTPS or localhost.');
    this.salt=crypto.getRandomValues(new Uint8Array(16));this.key=await derive(password,this.salt);
    this.data={version:1,jobs:{},searches:[]};this.baseline=null;
    try{await this.persist();}catch(e){this.lock();throw e;}
  }
  async unlock(password){
    const raw=this.storage.getItem(KEY);if(!raw)throw new Error('No workspace stored on this browser.');
    const e=envelope(raw),salt=unb64(e.salt),key=await derive(password,salt);
    let data;
    try{data=validateWorkspace(JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(e.iv)},key,unb64(e.ciphertext)))));}
    catch{throw new Error('Could not unlock. Check the passphrase and backup.');}
    this.key=key;this.salt=salt;this.data=data;this.baseline=raw;
  }
  lock(){this.key=null;this.salt=null;this.data=null;this.baseline=null;}
  async persist(){
    if(!this.unlocked)throw new Error('Unlock the workspace first.');
    if(this.storage.getItem(KEY)!==this.baseline)throw new Error('Workspace changed in another tab. Lock and unlock again before editing.');
    const key=this.key,salt=this.salt,iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(this.data)));
    if(this.key!==key)throw new Error('Workspace locked before the change could be saved.');
    // Re-check after asynchronous encryption: never silently clobber another tab's write.
    if(this.storage.getItem(KEY)!==this.baseline)throw new Error('Another tab saved a change. Lock and unlock again.');
    const raw=JSON.stringify({format:'mithril-vault',version:1,iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)});
    this.storage.setItem(KEY,raw);this.baseline=raw;
  }
  update(id,patch,snapshot){
    const operation=async()=>{
      if(!this.unlocked)throw new Error('Unlock the workspace first.');
      if(!/^[a-f0-9]{24}$/.test(id))throw new Error('Invalid vacancy ID.');
      const before=structuredClone(this.data),prior=this.data.jobs[id]||{};
      const allowed={};
      for(const k of ['status','note','nextAction','due','reviewed'])if(k in patch)allowed[k]=patch[k];
      if(allowed.note?.length>20000||allowed.nextAction?.length>500)throw new Error('Note or next action is too long.');
      const record={...prior,...allowed,updatedAt:new Date().toISOString()};
      if(snapshot)record.snapshot=snapshot; // encrypted recovery for vanished listings
      if(allowed.status&&allowed.status!==prior.status){
        record.history=[...(prior.history||[]),{status:allowed.status,at:record.updatedAt}];
        if(allowed.status==='applied')record.appliedAt=record.updatedAt;
      }
      this.data.jobs[id]=record;
      try{await this.persist();}catch(e){if(this.unlocked)this.data=before;throw e;}
    };
    const result=this.queue.then(operation,operation);this.queue=result.catch(()=>{});return result;
  }
  saveSearch(name,hash){
    const operation=async()=>{
      if(!this.unlocked)throw new Error('Unlock the workspace first.');
      if(!name.trim()||name.length>70)throw new Error('Name the search in 1–70 characters.');
      if(!hash.startsWith('#')||hash.length>2048)throw new Error('Invalid search URL.');
      const before=structuredClone(this.data);
      this.data.searches=[...this.data.searches.filter(s=>s.name!==name),{name,hash}].slice(-20);
      try{await this.persist();}catch(e){if(this.unlocked)this.data=before;throw e;}
    };
    const result=this.queue.then(operation,operation);this.queue=result.catch(()=>{});return result;
  }
  export(){const raw=this.storage.getItem(KEY);if(!raw)throw new Error('No workspace to export.');return raw;}
  async restore(raw,password){
    if(raw.length>14000000)throw new Error('Backup too large.');
    const e=envelope(raw),key=await derive(password,unb64(e.salt));
    try{validateWorkspace(JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(e.iv)},key,unb64(e.ciphertext)))));}
    catch{throw new Error('Backup could not be decrypted. Nothing was replaced.');}
    this.storage.setItem(KEY,JSON.stringify(e));this.lock();await this.unlock(password);
  }
}
