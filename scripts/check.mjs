import { access, readFile } from 'node:fs/promises';
const required=['server.mjs','app/index.html','devhub/index.html','rb-project.json','projects.registry.json','agent/reader.py','INSTALL_RB_DEV_HUB.cmd','START_RB_DEV_HUB.cmd'];
for (const file of required) await access(new URL('../'+file, import.meta.url));
const project=JSON.parse(await readFile(new URL('../rb-project.json', import.meta.url),'utf8'));
const registry=JSON.parse(await readFile(new URL('../projects.registry.json', import.meta.url),'utf8'));
if(!project.id||!project.localUrl) throw new Error('rb-project.json incompleto');
if(!Array.isArray(registry.projects)||registry.projects.length<1) throw new Error('projects.registry.json sem projetos');
for(const p of registry.projects){if(!p.id||!p.repository||!p.directory)throw new Error('Projeto inválido no registry');}
console.log(`RB Workspace Intelligence: estrutura OK · ${registry.projects.length} projeto(s) registrado(s)`);
