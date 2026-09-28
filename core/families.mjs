import path from 'node:path';

export function fold(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export function cleanSegment(v){return String(v||'Geral').replace(/[<>:"/\\|?*]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Geral';}

const genericParents=new Set(['downloads','download','desktop','area de trabalho','documents','documentos','onedrive','pictures','imagens','videos','music','musica','organizado','pessoal','trabalho','financeiro','condominio','projetos','entrada','midia pessoal','geral']);
const systemProfileFolders=new Set(['3d objects','contacts','favorites','links','saved games','searches','cookies','local settings','netHood','printhood','recent','sendto','start menu','templates']);
const technicalNames=new Set(['desktop.ini','thumbs.db','.ds_store','package-lock.json','pnpm-lock.yaml','yarn.lock','.gitignore','.gitattributes','.gitmodules','.env','.env.example','.gitkeep','.rb-bridge-job.json']);
const technicalPathParts=new Set(['.git','node_modules','vendor','wheels','site-packages','.venv','venv','dist','build','.next','.cache','.bun','.npm','.pnpm-store','.yarn','.cargo','.rustup','.gradle','.m2','.nuget','.cursor','.vscode','.idea','coverage','target','__pycache__']);
const strongProjectMarkers=new Set(['.git','package.json','pyproject.toml','pom.xml','build.gradle','build.gradle.kts','composer.json','cargo.toml','go.mod','requirements.txt']);
const secondaryProjectMarkers=new Set(['.gitignore','.env','.env.example','package-lock.json','pnpm-lock.yaml','yarn.lock','src','vendor','scripts','app','readme.md','readme.txt']);
const noiseWords=new Set('final novo nova copy copia arquivo documento download downloads desktop index main temp tmp teste test versao version compliance portable source setup local app windows win64 x64 amd64 rev revisado corrigido backup'.split(' '));

export function isSystemProfileFolder(name){return systemProfileFolders.has(fold(name));}
export function isNoiseFile(name){const n=fold(name);return technicalNames.has(n)||n.startsWith('~$')||n.startsWith('.~lock')||n.endsWith('.lnk')||n.endsWith('.url');}
export function isTechnicalLeaf(name,fullPath=''){
  const n=fold(name),parts=String(fullPath||'').split(/[\\/]+/).map(fold);
  if(technicalNames.has(n)||n.startsWith('.')||n.endsWith('.whl')||n.endsWith('.pyc')||n.endsWith('.pyo'))return true;
  return parts.some(p=>technicalPathParts.has(p));
}
export function projectLikeEntries(entries){
  const names=new Set((entries||[]).map(e=>fold(e.name)));
  if([...names].some(n=>n.endsWith('.sln')||n.endsWith('.csproj')))return true;
  if([...strongProjectMarkers].some(x=>names.has(x)))return true;
  let secondary=0;for(const x of secondaryProjectMarkers)if(names.has(x))secondary++;
  if(secondary>=2)return true;
  const hasCode=[...names].some(n=>/\.(py|js|ts|tsx|jsx|java|cs|go|rs|php|rb)$/.test(n));
  return hasCode&&(names.has('.gitignore')||names.has('requirements.txt')||names.has('src'));
}
export function originalLooksTechnical(originalPath){
  const parts=String(originalPath||'').split(/[\\/]+/).filter(Boolean),name=parts.at(-1)||'';
  if(isNoiseFile(name)||isTechnicalLeaf(name,originalPath))return true;
  return parts.map(fold).some(p=>technicalPathParts.has(p));
}

function knownProfile(file,doc){
  const hay=fold(`${file?.path||''} ${file?.name||''} ${doc?.title||''} ${doc?.topic||''}`);
  const ext=fold(file?.ext||path.extname(file?.name||''));
  if(/autocertidao|auto certidao|souza[-_ ]?melo[-_ ]?certid|certidoes[-_ ]?app/.test(hay)){
    let topic='Projeto e versões';
    if(/\.zip$|\.exe$|setup|installer|portable|compliance|\br\d+\b/.test(hay))topic='Builds e versões';
    if(/vendor|wheels|requirements|\.gitignore|\.env/.test(hay))topic='Artefatos técnicos';
    return{area:'Trabalho',family:'AutoCertidão',topic};
  }
  if(/certidao|certidão|\bcndt?\b|\bfgts\b|regularidade|sefaz negativa|receita federal/.test(hay)){
    let topic='Outras certidões';
    if(/fgts/.test(hay))topic='FGTS';else if(/trabalh|cndt/.test(hay))topic='Trabalhistas';else if(/sefaz|icms/.test(hay))topic='SEFAZ';else if(/recife|mercantil/.test(hay))topic='Recife';else if(/federal|pgfn|receita/.test(hay))topic='Federais';
    return{area:'Condomínio',family:'Certidões',topic};
  }
  if(/rb[_ -]?hub|\brbhub\b/.test(hay)){
    let topic='Geral';if(/agent|agente/.test(hay))topic='Agentes';else if(/proposta/.test(hay))topic='Propostas';else if(/preview|\.html?$/.test(hay))topic='Previews';else if(/control|controle/.test(hay))topic='Controle';
    return{area:'Trabalho',family:'RB Hub',topic};
  }
  if(/financehub|financeflow/.test(hay)){
    let topic=/backup/.test(hay)?'Backups':/transa(c|ç)[aã]o|transactions?/.test(hay)?'Transações':'Geral';
    return{area:'Trabalho',family:'FinanceHub',topic};
  }
  if(/ecohub/.test(hay))return{area:'Trabalho',family:'EcoHub',topic:/bakeoff/.test(hay)?'Bakeoff':'Geral'};
  if(/fabi(?:ana)?[ _-]?makeup/.test(hay))return{area:'Trabalho',family:'Fabiana Makeup',topic:'Materiais'};
  if(/condominio|condomínio|souza[ &_-]?melo|sudene|avcb|predial|sindico|síndico/.test(hay)){
    let topic='Geral';
    if(/prestacao|prestação|balancete|demonstrativo/.test(hay))topic='Prestação de contas';
    else if(/fatura|boleto/.test(hay))topic='Faturas e boletos';
    else if(/previsao|previsão|despesa/.test(hay))topic='Previsão de despesas';
    else if(/extrato|transa(c|ç)[aã]o|receita|finance/.test(hay))topic='Financeiro';
    else if(/avcb|elevador|manutenc|incendio|extintor/.test(hay))topic='Manutenção';
    return{area:'Condomínio',family:'Gestão Condominial',topic};
  }
  if(/proposta/.test(hay))return{area:'Trabalho',family:'Propostas',topic:'Documentos e previews'};
  if(/\bpreview\b/.test(hay)&&['.html','.htm'].includes(ext))return{area:'Trabalho',family:'Previews HTML',topic:'Previews'};
  if(/impressao 3d|impressão 3d|bambu|\.stl$|molde 3d|moldê/.test(hay))return{area:'Projetos',family:'Impressão 3D',topic:'Modelos e produção'};
  return null;
}

function canonicalTokens(name){
  let s=fold(path.parse(name||'').name).replace(/[_]+/g,' ').replace(/[^a-z0-9]+/g,' ');
  const raw=s.split(/\s+/).filter(Boolean),out=[];
  for(const t of raw){
    if(noiseWords.has(t)||/^r\d+$/.test(t)||/^v\d+$/.test(t)||/^\d{4}$/.test(t)||/^\d{6,}$/.test(t)||/^[a-f0-9]{8,}$/.test(t)||/^\d+[.-]\d+/.test(t))continue;
    if(/^\d+$/.test(t))continue;
    out.push(t);
  }
  return out.slice(0,3);
}
function titleTokens(tokens){return tokens.map(t=>t.replace(/\b\w/g,c=>c.toUpperCase())).join(' ');}
function meaningfulParent(root,file){
  const rel=path.relative(root,path.dirname(file.path)).split(path.sep).filter(Boolean).map(cleanSegment);
  return rel.find(x=>!genericParents.has(fold(x))&&!technicalPathParts.has(fold(x))&&!/^\d{4}$/.test(x))||'';
}
export function buildFamilyClusters(files,docs=[],root=''){
  const docBy=new Map((docs||[]).map(d=>[path.resolve(d.path),d])),keys=new Map(),counts=new Map();
  for(const f of files||[]){
    const known=knownProfile(f,docBy.get(path.resolve(f.path)));if(known){keys.set(f.path,{label:known.family,known});continue;}
    const parent=meaningfulParent(root,f);if(parent){const k=`parent:${fold(parent)}`;keys.set(f.path,{key:k,label:parent});counts.set(k,(counts.get(k)||0)+1);continue;}
    const toks=canonicalTokens(f.name);if(toks.length){const k=`name:${toks.slice(0,2).join('|')}`;keys.set(f.path,{key:k,label:titleTokens(toks.slice(0,2))});counts.set(k,(counts.get(k)||0)+1);}
  }
  const map=new Map();
  for(const f of files||[]){const item=keys.get(f.path);if(!item)continue;if(item.known){map.set(f.path,item.known);continue;}if((counts.get(item.key)||0)>=3)map.set(f.path,{family:cleanSegment(item.label)});}
  return map;
}
export function familyProfile(file,doc,cluster){return knownProfile(file,doc)||cluster||null;}

export function normalizeTopic(family,topic,bucket=''){
  const fam=fold(family),t=cleanSegment(topic||'');if(!t||fold(t)==='geral'||fold(t)===fam)return'';
  if(['reunioes','relatorios','contratos','financeiro','certidoes','projetos','artefatos web','documentos'].includes(fold(t))&&fold(bucket)===fold(t))return'';
  return t;
}
