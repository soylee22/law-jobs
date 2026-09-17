// Internal helper: input arrives through stdin, not command-line arguments.
import {Vault} from '../web/vault.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
try{
  const {password,jobs}=JSON.parse(raw);let stored=null;
  const v=new Vault({getItem(){return stored;},setItem(_key,value){stored=value;}});
  await v.create(password);v.data.jobs=jobs;await v.persist();v.lock();
  // Round-trip through the validator before emitting anything.
  await v.unlock(password);v.lock();process.stdout.write(stored);
}catch(error){process.stderr.write('Could not create a valid encrypted backup: '+error.message+'\n');process.exitCode=1;}
