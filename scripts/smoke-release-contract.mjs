import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';

const root=path.join(os.homedir(),`rbwi-v19-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-v19-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;

try{
  const { ensureState, saveTransaction }=await import('../core/storage.mjs');
  const { rollbackTransactionSafe }=await import('../core/rollback_safe.mjs');
  const { validateOrganizerScope }=await import('../core/organizer_v17.mjs');
  const { executionPreflight }=await import('../core/execution_jobs.mjs');
  const { executePlan, rollbackTransaction, scanFolder }=await import('../core/workspace.mjs');
  await ensureState();

  const original=path.join(root,'original','documento.txt');
  const organized=path.join(root,'organizado','documento.txt');
  await mkdir(path.dirname(organized),{recursive:true});
  const content='conteudo-validado-v19';
  await writeFile(organized,content,'utf8');
  const hash=crypto.createHash('sha256').update(content).digest('hex');
  await saveTransaction({id:'tx-v19',planId:'plan-v19',spaceId:'pessoal',checkpointId:'cp-v19',createdAt:new Date().toISOString(),status:'completed',operations:[{id:'op-v19',type:'MOVE_FILE',before:original,after:organized,beforeHash:hash,afterHash:hash,status:'completed'}],summary:{requested:1,completed:1,failed:0}});
  const rolled=await rollbackTransactionSafe('tx-v19');
  assert.equal(rolled.status,'rolled_back');
  assert.equal(await readFile(original,'utf8'),content);
  assert.equal(await readFile(organized,'utf8'),content);
  assert.equal(rolled.rollbackResults[0].organizedCopyPreserved,true);
  assert.equal(typeof executionPreflight,'function');

  // O perfil inteiro é bloqueado nos dois motores e só o Organizer novo aceita reconhecimento avançado explícito.
  assert.throws(()=>validateOrganizerScope(os.homedir()),/bloqueado por padrão/i);
  const advanced=validateOrganizerScope(os.homedir(),{allowProfileRoot:true});
  assert.equal(advanced.advanced,true);
  await assert.rejects(()=>scanFolder(os.homedir(),'pessoal'),/perfil inteiro está bloqueada/i);

  // Motores legados destrutivos não podem voltar a executar nem por import direto.
  await assert.rejects(()=>executePlan(),/desativada permanentemente/i);
  await assert.rejects(()=>rollbackTransaction(),/desativado permanentemente/i);

  const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const organizerUi=await readFile(new URL('../app/v11/files.js',import.meta.url),'utf8');
  const launcher=await readFile(new URL('../tools/RB_WORKSPACE_LATEST.ps1',import.meta.url),'utf8');
  const installer=await readFile(new URL('../tools/INSTALAR_RB_WORKSPACE_ULTIMA_VERSAO.ps1',import.meta.url),'utf8');
  const bootstrap=await readFile(new URL('../tools/BOOTSTRAP_RB_WORKSPACE.ps1',import.meta.url),'utf8');
  const rootInstaller=await readFile(new URL('../INSTALL_RB_WORKSPACE.cmd',import.meta.url),'utf8');
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));

  assert.equal(pkg.version,'1.9.0');
  assert.match(server,/rollbackTransactionSafe/);
  assert.match(server,/retentionMode:b\.retentionMode/);
  assert.match(server,/executionPreflight/);
  assert.match(server,/\/api\/execution\/preflight/);
  assert.match(server,/packageInfo\.version/);
  assert.match(server,/fullProfileAnalysisBlockedByDefault:true/);
  assert.match(server,/executionPreflight:true/);
  assert.match(server,/buildCommit/);
  assert.match(organizerUi,/REVISÃO DE SEGURANÇA/);
  assert.match(organizerUi,/preserve_original/);
  assert.match(organizerUi,/Centro de Recuperação/);
  assert.match(launcher,/last-valid\.json/);
  assert.match(launcher,/Modo offline/);
  assert.match(launcher,/buildCommit -eq \$sha/);
  assert.match(launcher,/RB\\Runtime\\rb-workspace-intelligence/);
  assert.match(installer,/raw\.githubusercontent\.com/);
  assert.doesNotMatch(installer,/\$launcherContent\s*=/);
  assert.match(bootstrap,/actions\/runs/);
  assert.match(bootstrap,/Git\.Git/);
  assert.match(bootstrap,/OpenJS\.NodeJS\.LTS/);
  assert.doesNotMatch(rootInstaller,/RB\\Projects/);
  assert.doesNotMatch(rootInstaller,/START_RB_WORKSPACE\.cmd/);
  assert.match(rootInstaller,/BOOTSTRAP_RB_WORKSPACE\.ps1/);

  console.log('Release contract OK · v1.9 · preflight · safe rollback · recovery center · legacy engines retired · profile guard · offline launcher · canonical bootstrap');
} finally {
  await rm(root,{recursive:true,force:true});
  await rm(data,{recursive:true,force:true});
}
