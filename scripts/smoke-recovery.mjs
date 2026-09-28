import { mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRecoveryCheckpoint, restoreRecoveryCheckpoint, recoveryRoot } from '../core/recovery_center.mjs';

const base=path.join(os.homedir(),`.rbwi-recovery-smoke-${Date.now()}`),source=path.join(base,'original','important.txt'),target=path.join(base,'organized','important.txt');
await mkdir(path.dirname(source),{recursive:true});
await writeFile(source,'conteudo-importante-nao-pode-sumir','utf8');
let checkpoint=null;
try{
  checkpoint=await createRecoveryCheckpoint({planId:'smoke-plan',operations:[{id:'op-smoke',type:'MOVE_FILE',before:source,after:target}]});
  assert.equal(checkpoint.status,'ready');assert.equal(checkpoint.totalFiles,1);
  await mkdir(path.dirname(target),{recursive:true});await rename(source,target);
  const dry=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:true});
  assert.equal(dry.summary.wouldRestore,1);
  const restored=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:false});
  assert.equal(restored.summary.restored,1);
  assert.equal(await readFile(source,'utf8'),'conteudo-importante-nao-pode-sumir');
  assert.equal(await readFile(target,'utf8'),'conteudo-importante-nao-pode-sumir');
  console.log('smoke-recovery ok',checkpoint.id);
}finally{
  await rm(base,{recursive:true,force:true});
  if(checkpoint?.id)await rm(path.join(recoveryRoot,'checkpoints',checkpoint.id),{recursive:true,force:true});
}
