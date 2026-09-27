import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const dataDir = process.env.RBWI_DATA_DIR || path.join(os.homedir(), '.rb-workspace-intelligence');
const stateFile = path.join(dataDir, 'state.json');

function now(){ return new Date().toISOString(); }
export function id(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }

const defaultSpaces = [
  { id:'pessoal', name:'Pessoal', description:'Documentos e arquivos pessoais', basePath:'', policy:'Organizar por ano e tipo. Preservar originais. Não mover arquivos de software ou repositórios.', createdAt:now() },
  { id:'rb-hub', name:'RB Hub', description:'Administrativo, financeiro e produtos RB Hub', basePath:'', policy:'Separar por área, ano e tipo documental. Contratos, financeiro e projetos devem ficar claramente identificados.', createdAt:now() },
  { id:'condominio', name:'Condomínio', description:'Souza Melo Tower e gestão condominial', basePath:'', policy:'Separar contratos, financeiro, manutenção, fornecedores, AVCB e comunicações por ano.', createdAt:now() },
  { id:'projetos', name:'Projetos', description:'Projetos profissionais e técnicos', basePath:'', policy:'Preservar estruturas Git. Organizar documentos de gestão por projeto, ano e tipo. Nunca alterar node_modules, .git ou artefatos de build.', createdAt:now() },
];

function baseState(){
  return {
    schemaVersion: 2,
    createdAt: now(),
    spaces: defaultSpaces,
    scans: [],
    plans: [],
    transactions: [],
    customProjects: [],
    settings: { maxScanFiles: 5000, hashDuplicateCandidates: true }
  };
}

export async function ensureState(){
  await mkdir(dataDir, { recursive:true });
  try {
    const state=JSON.parse(await readFile(stateFile, 'utf8'));
    let dirty=false;
    if(!state.schemaVersion||state.schemaVersion<2){state.schemaVersion=2;dirty=true;}
    if(!Array.isArray(state.customProjects)){state.customProjects=[];dirty=true;}
    if(dirty) await writeState(state);
  }
  catch { await writeState(baseState()); }
}

export async function readState(){ await ensureState(); return JSON.parse(await readFile(stateFile, 'utf8')); }
export async function writeState(state){ await mkdir(dataDir, { recursive:true }); const tmp = `${stateFile}.tmp`; await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8'); await rename(tmp, stateFile); return state; }
export async function mutate(mutator){ const state = await readState(); const result = await mutator(state); await writeState(state); return result; }

export async function upsertSpace(input){
  return mutate((state)=>{
    const existing = input.id ? state.spaces.find(s=>s.id===input.id) : null;
    const space = existing || { id:id('space'), createdAt:now() };
    space.name = String(input.name||space.name||'Novo Space').trim().slice(0,80);
    space.description = String(input.description||'').trim().slice(0,300);
    space.basePath = String(input.basePath||'').trim();
    space.policy = String(input.policy||'').trim().slice(0,4000);
    space.updatedAt = now();
    if(!existing) state.spaces.push(space);
    return space;
  });
}

export async function removeSpace(spaceId){
  return mutate((state)=>{
    if(['pessoal','rb-hub','condominio','projetos'].includes(spaceId)) throw new Error('Spaces padrão não podem ser removidos; edite-os se necessário.');
    const before=state.spaces.length; state.spaces=state.spaces.filter(s=>s.id!==spaceId); return before!==state.spaces.length;
  });
}

export async function saveScan(scan){ return mutate((state)=>{ state.scans.unshift(scan); state.scans = state.scans.slice(0,20); return scan; }); }
export async function savePlan(plan){ return mutate((state)=>{ state.plans.unshift(plan); state.plans = state.plans.slice(0,30); return plan; }); }
export async function saveTransaction(tx){ return mutate((state)=>{ state.transactions.unshift(tx); state.transactions = state.transactions.slice(0,100); return tx; }); }
export async function updateTransaction(txId, patch){ return mutate((state)=>{ const tx=state.transactions.find(t=>t.id===txId); if(!tx) throw new Error('Transação não encontrada.'); Object.assign(tx, patch, { updatedAt:now() }); return tx; }); }

export async function registerProject(project){
  return mutate((state)=>{
    const key=String(project.id||project.name||'').trim();
    if(!key) throw new Error('Informe um identificador de projeto.');
    const existing=state.customProjects.find(p=>p.id===key);
    const normalized={
      id:key,
      name:String(project.name||key).slice(0,120),
      repository:String(project.repository||'').trim(),
      directory:String(project.directory||'').trim(),
      localPath:String(project.localPath||'').trim(),
      fallbackUrl:String(project.fallbackUrl||'').trim(),
      role:'independent-app',
      updatedAt:now()
    };
    if(existing) Object.assign(existing, normalized); else state.customProjects.push({...normalized,createdAt:now()});
    return existing||normalized;
  });
}
