import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const root=path.join(os.homedir(),`rbwi-inventory-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-inventory-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;

try{
  const {ensureState,saveScan,savePlan,readState}=await import('../core/storage.mjs');
  const {getAnalyzedInventory}=await import('../core/inventory_review.mjs');
  await ensureState();await mkdir(root,{recursive:true});
  const pdf=path.join(root,'relatorio.pdf'),html=path.join(root,'painel.html'),txt=path.join(root,'anotacoes.txt');
  await writeFile(pdf,'pdf fixture');await writeFile(html,'<html>painel</html>');await writeFile(txt,'sem acao');
  const scan={id:'scan-inventory',spaceId:'pessoal',root,createdAt:new Date().toISOString(),fileCount:3,folderCount:0,truncated:false,files:[
    {id:'f1',path:pdf,relativePath:'relatorio.pdf',name:'relatorio.pdf',ext:'.pdf',size:11,modifiedAt:new Date().toISOString(),category:'PDFs',depth:0},
    {id:'f2',path:html,relativePath:'painel.html',name:'painel.html',ext:'.html',size:20,modifiedAt:new Date().toISOString(),category:'Artefatos Web',depth:0},
    {id:'f3',path:txt,relativePath:'anotacoes.txt',name:'anotacoes.txt',ext:'.txt',size:8,modifiedAt:new Date().toISOString(),category:'Documentos',depth:0}
  ],skipped:{technicalCount:4,repositoryCount:2,systemCount:1}};
  await saveScan(scan);
  await savePlan({id:'plan-inventory',scanId:scan.id,spaceId:'pessoal',spaceName:'Pessoal',root,createdAt:new Date().toISOString(),destinationRoot:path.join(root,'Organizado'),status:'preview',findings:[],groups:{},operations:[
    {id:'op1',type:'MOVE_FILE',before:pdf,after:path.join(root,'Organizado','Trabalho','relatorio.pdf'),reason:'Trabalho → Relatórios',confidence:'high',recommended:true,area:'Trabalho',family:'Relatórios',subject:'Relatórios',subtopic:'Mensal',category:'PDFs'},
    {id:'op2',type:'MOVE_FILE',before:html,after:path.join(root,'Organizado','Web','painel.html'),reason:'Web → Painel',confidence:'medium',recommended:false,area:'Projetos',family:'Painel',subject:'Painel',category:'Artefatos Web'}
  ],documentIntelligence:{documents:[
    {path:pdf,name:'relatorio.pdf',topic:'Relatório mensal',area:'Trabalho',bucket:'PDFs',summary:'Relatório financeiro mensal',method:'fixture',complete:true,textLength:1200},
    {path:txt,name:'anotacoes.txt',topic:'Notas',area:'Pessoal',bucket:'Documentos',summary:'Anotações pessoais sem movimentação',method:'fixture',complete:true,textLength:80}
  ]}});

  const before=JSON.stringify(await readState());
  let inv=await getAnalyzedInventory();assert.equal(inv.readOnly,true);assert.equal(inv.counts.total,3);assert.equal(inv.counts.withSuggestion,2);assert.equal(inv.counts.noAction,1);assert.equal(inv.counts.pending,2);assert.equal(inv.counts.references,1);assert.equal(inv.protected.projects,2);assert.equal(inv.protected.technical,4);assert.equal(inv.protected.system,1);assert.equal(inv.items.length,3);
  const noAction=inv.items.find(i=>i.name==='anotacoes.txt');assert.equal(noAction.hasSuggestion,false);assert.equal(noAction.reviewStatus,'no_action');assert.match(noAction.document.summary,/sem movimentação/i);
  const web=inv.items.find(i=>i.name==='painel.html');assert.equal(web.referenceRisk,true);assert.equal(web.operationId,'op2');

  inv=await getAnalyzedInventory({status:'no_action'});assert.equal(inv.matched,1);assert.equal(inv.items[0].name,'anotacoes.txt');
  inv=await getAnalyzedInventory({status:'reference'});assert.equal(inv.matched,1);assert.equal(inv.items[0].name,'painel.html');
  inv=await getAnalyzedInventory({q:'financeiro'});assert.equal(inv.matched,1);assert.equal(inv.items[0].name,'relatorio.pdf');
  inv=await getAnalyzedInventory({status:'suggestion',offset:0,limit:1});assert.equal(inv.items.length,1);assert.equal(inv.matched,2);assert.equal(inv.hasMore,true);
  const after=JSON.stringify(await readState());assert.equal(after,before,'Consulta de acervo deve ser estritamente somente leitura');
  console.log('Inventory smoke OK · all analyzed files · no-action visibility · content search · reference filter · pagination · zero state mutation');
} finally {await rm(root,{recursive:true,force:true});await rm(data,{recursive:true,force:true});}
