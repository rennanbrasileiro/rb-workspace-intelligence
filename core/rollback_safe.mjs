import { mkdir, copyFile, access, open, rename, rm } from 'node:fs/promises';
import { createReadStream, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readState, updateTransaction } from './storage.mjs';
import { assertAllowedPath } from './workspace.mjs';

function now(){return new Date().toISOString();}
async function exists(p){try{await access(p);return true}catch{return false}}
async function hashFile(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=createReadStream(file);s.on('data',d=>h.update(d));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));});}
async function syncFile(file){const h=await open(file,'r');try{await h.sync();}finally{await h.close();}}

async function restoreOriginalCopy(current,original,expectedHash){
  if(!(await exists(current)))throw new Error('Arquivo atual não foi encontrado.');
  const currentHash=await hashFile(current);
  if(expectedHash&&currentHash!==expectedHash)throw new Error('Arquivo foi alterado após a organização; restauração automática bloqueada. Use o Recovery Center para revisar o checkpoint.');

  if(await exists(original)){
    const originalHash=await hashFile(original).catch(()=>null);
    if(originalHash&&originalHash===currentHash)return{status:'original_already_restored',currentHash,originalHash};
    throw new Error('O caminho original já está ocupado por conteúdo diferente; nenhum arquivo foi sobrescrito.');
  }

  await mkdir(path.dirname(original),{recursive:true});
  const tmp=path.join(path.dirname(original),`.${path.basename(original)}.rbwi-rollback-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try{
    await copyFile(current,tmp,fsConstants.COPYFILE_EXCL);
    await syncFile(tmp);
    const tempHash=await hashFile(tmp);
    if(tempHash!==currentHash)throw new Error('A cópia de restauração não passou na validação SHA-256.');
    if(await exists(original))throw new Error('O caminho original foi ocupado durante a restauração; nenhum arquivo foi sobrescrito.');
    await rename(tmp,original);
    await syncFile(original);
    const restoredHash=await hashFile(original);
    if(restoredHash!==currentHash){await rm(original,{force:true}).catch(()=>{});throw new Error('O arquivo restaurado não passou na validação SHA-256.');}
    return{status:'original_restored_by_copy',currentHash,restoredHash};
  }catch(e){
    await rm(tmp,{force:true}).catch(()=>{});
    throw e;
  }
}

export async function rollbackTransactionSafe(txId){
  const state=await readState(),tx=state.transactions.find(t=>t.id===txId);
  if(!tx)throw new Error('Transação não encontrada.');
  if(tx.status==='rolled_back')throw new Error('Essa transação já foi restaurada.');
  const results=[];
  for(const op of [...(tx.operations||[])].reverse()){
    if(op.status!=='completed'||!op.after||!op.before)continue;
    try{
      const current=assertAllowedPath(op.after),original=assertAllowedPath(op.before);
      const restored=await restoreOriginalCopy(current,original,op.afterHash||op.beforeHash||null);
      results.push({operationId:op.id,...restored,from:current,to:original,organizedCopyPreserved:true});
    }catch(e){results.push({operationId:op.id,status:'failed',error:e.message});}
  }
  const failed=results.some(r=>r.status==='failed');
  return updateTransaction(txId,{status:failed?'rollback_with_errors':'rolled_back',rollbackAt:now(),rollbackMode:'copy_verify_preserve_organized',rollbackResults:results});
}
