import { access, readFile } from 'node:fs/promises';
for (const file of ['server.mjs','app/index.html','devhub/index.html','rb-project.json']) await access(new URL('../'+file, import.meta.url));
JSON.parse(await readFile(new URL('../rb-project.json', import.meta.url),'utf8'));
console.log('RB Workspace Intelligence: estrutura OK');
