import assert from 'node:assert/strict';
import { isNoiseFile, originalLooksTechnical } from '../core/families.mjs';

const protectedNames=[
  'desktop.ini',
  'Thumbs.db',
  'AutoCertidao Local.lnk',
  'atalho.url',
  '~$PREVISÃO DE DESPESAS CONDOMÍNIO.xlsx',
  '~$_PLANILHA_Controle_condominio.xlsx',
  '.~lock.VEM - CSMT.xlsx#',
  '.gitignore',
  '.env.example'
];
for(const name of protectedNames){
  assert.equal(isNoiseFile(name)||originalLooksTechnical(`C:\\Users\\Recife\\Desktop\\${name}`),true,`deveria proteger ${name}`);
}

const userFiles=['contrato-condominio.pdf','extrato-agosto.xlsx','foto-familia.jpg','relatorio-maria.docx'];
for(const name of userFiles){
  assert.equal(isNoiseFile(name),false,`nao deveria classificar ${name} como ruido`);
}

assert.equal(originalLooksTechnical('C:\\Users\\Recife\\RB\\Projects\\app\\node_modules\\x.js'),true);
assert.equal(originalLooksTechnical('C:\\Users\\Recife\\Desktop\\contrato-condominio.pdf'),false);
console.log('smoke-noise-protection ok');
