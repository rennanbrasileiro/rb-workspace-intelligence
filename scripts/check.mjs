import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const required=['server.mjs','app/index.html','devhub/index.html','rb-project.json','projects.registry.json','agent/reader.py','INSTALL_RB_DEV_HUB.cmd','START_RB_DEV_HUB.cmd'];
for (const file of required) await access(new URL('../'+file, import.meta.url));
const syntaxCritical=['server.mjs','core/execution_jobs.mjs','core/recovery_center.mjs','core/organizer_v17.mjs','core/rollback_safe.mjs','app/v11/files.js','app/v11/recovery.js','app/v11/main.js'];
for(const file of syntaxCritical){const target=fileURLToPath(new URL('../'+file,import.meta.url)),r=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});if(r.status!==0)throw new Error(`Falha de sintaxe em ${file}: ${r.stderr||r.stdout}`);}
const project=JSON.parse(await readFile(new URL('../rb-project.json', import.meta.url),'utf8'));
const registry=JSON.parse(await readFile(new URL('../projects.registry.json', import.meta.url),'utf8'));
if(!project.id||!project.localUrl) throw new Error('rb-project.json incompleto');
if(!Array.isArray(registry.projects)||registry.projects.length<1) throw new Error('projects.registry.json sem projetos');
for(const p of registry.projects){if(!p.id||!p.repository||!p.directory)throw new Error('Projeto inválido no registry');}
console.log(`RB Workspace Intelligence: estrutura + sintaxe crítica OK · ${registry.projects.length} projeto(s) registrado(s)`);
