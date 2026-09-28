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

  const alreadySafe=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:true});
  assert.equal(alreadySafe.summary.originalMatchesCheckpoint,1);
  assert.equal(alreadySafe.summary.originalChanged,0);

  await writeFile(source,'conteudo-alterado-depois-do-checkpoint','utf8');
  const changed=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:true});
  assert.equal(changed.summary.originalChanged,1);
  assert.equal(changed.summary.originalMatchesCheckpoint,0);
  assert.equal(await readFile(source,'utf8'),'conteudo-alterado-depois-do-checkpoint');

  const applyChanged=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:false});
  assert.equal(applyChanged.summary.originalChanged,1);
  assert.equal(applyChanged.summary.restored,0);
  assert.equal(await readFile(source,'utf8'),'conteudo-alterado-depois-do-checkpoint');

  // Se o próprio backup físico for alterado, a restauração precisa parar por SHA-256.
  await rm(source,{force:true});
  await writeFile(checkpoint.entries[0].backup,'backup-corrompido-depois-do-checkpoint','utf8');
  const backupChanged=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:true});
  assert.equal(backupChanged.summary.backupChanged,1);
  assert.equal(backupChanged.summary.wouldRestore,0);
  const blockedRestore=await restoreRecoveryCheckpoint(checkpoint.id,{dryRun:false});
  assert.equal(blockedRestore.summary.backupChanged,1);
  assert.equal(blockedRestore.summary.restored,0);
  await assert.rejects(()=>readFile(source,'utf8'));

  console.log('smoke-recovery ok · missing restore · original changed protected · backup hash divergence blocked',checkpoint.id);
}finally{
  await rm(base,{recursive:true,force:true});
  if(checkpoint?.id)await rm(path.join(recoveryRoot,'checkpoints',checkpoint.id),{recursive:true,force:true});
}
