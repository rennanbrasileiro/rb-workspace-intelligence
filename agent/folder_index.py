#!/usr/bin/env python3
import json, re, sys, unicodedata
from collections import Counter
from pathlib import Path
from reader import extract

SUPPORTED={'.pdf','.docx','.xlsx','.pptx','.txt','.csv','.json','.md','.xml','.html','.htm','.log','.yaml','.yml','.js','.css','.ts','.tsx','.jsx'}
BUCKET_RULES={
  'Contratos':['contrato','aditivo','clausula','cláusula','vigencia','vigência','contratante','contratado','rescisao','rescisão'],
  'Financeiro':['nota fiscal','boleto','pagamento','fatura','extrato','darf','receita','despesa','pro labore','pró-labore','orcamento','orçamento'],
  'Reuniões':['ata','reuniao','reunião','pauta','daily','retrospectiva','alinhamento','checkpoint','comite','comitê'],
  'Relatórios':['relatorio','relatório','indicador','status report','acompanhamento','gestao','gestão','resultado','dashboard'],
  'Jurídico':['juridico','jurídico','processo','peticao','petição','sentenca','sentença','tribunal','procuracao','procuração'],
  'Manutenção':['manutencao','manutenção','elevador','ar condicionado','avcb','incendio','incêndio','extintor','preventiva','corretiva'],
  'Projetos':['projeto','sprint','backlog','requisito','historia de usuario','história de usuário','arquitetura','gitlab','github','roadmap','cronograma'],
  'Certidões':['certidao','certidão','regularidade','negativa','fgts','cnd','cndt','receita federal','sefaz'],
  'Artefatos Web':['<!doctype html','<html','<script','stylesheet','javascript','typescript','css']
}
AREA_RULES={
  'Condomínio':['condominio','condomínio','sudene','avcb','elevador','predial','extintor','assembleia','síndico','sindico'],
  'Financeiro':['extrato','boleto','fatura','pagamento','darf','nota fiscal','contabilidade','contábil','contabil','pro labore','pró-labore'],
  'Projetos':['github','gitlab','repository','repositorio','repositório','npm','vite','react','build','deploy','branch','commit','sprint','backlog'],
  'Trabalho':['sefaz','cliente','empresa','status report','relatorio','relatório','reuniao','reunião','contrato','gestao','gestão','projeto'],
  'Pessoal':['curriculo','currículo','cpf','rg','identidade','familia','família','certidao de nascimento','certidão de nascimento'],
}
TOPIC_RULES={
  'Impressão 3D':['impressao 3d','impressão 3d','bambu lab','filamento','pla','stl','molde 3d','moldê','molde'],
  'SEFAZ e Fiscal':['sefaz','icms','e-fisco','efisco','convenio icms','convênio icms'],
  'Certidões e Regularidade':['certidao','certidão','regularidade','cnd','cndt','fgts','receita federal'],
  'Condomínio e Predial':['condominio','condomínio','sudene','avcb','elevador','incendio','incêndio','extintor'],
  'Git e Desenvolvimento':['github','gitlab','repository','repositorio','repositório','npm','vite','react','build','deploy'],
  'Contratos':['contrato','aditivo','contratante','contratado','clausula','cláusula'],
  'Financeiro':['extrato','boleto','fatura','pagamento','darf','nota fiscal'],
  'Reuniões':['reuniao','reunião','ata','pauta','daily','checkpoint','alinhamento'],
  'Relatórios':['relatorio','relatório','status report','dashboard','indicador'],
}
STOP=set('a o e de da do das dos em para por com sem um uma uns umas no na nos nas ao aos que se sua seu suas seus meu minha meus minhas este esta isso esse essa arquivo documento final novo nova copia copy versao versão v1 v2 v3 2024 2025 2026 html pdf docx xlsx txt csv json'.split())

def fold(v):
    v=unicodedata.normalize('NFD',str(v or '').lower())
    return ''.join(ch for ch in v if unicodedata.category(ch)!='Mn')

def score_rules(hay,rules):
    scores={}
    for label,terms in rules.items():
        score=sum(hay.count(fold(t)) for t in terms)
        if score:scores[label]=score
    return sorted(scores.items(),key=lambda x:x[1],reverse=True)

def confidence(score):
    return 'high' if score>=5 else 'medium' if score>=2 else 'low'

def classify(name,text):
    hay=fold(name+'\n'+text)
    ranked=score_rules(hay,BUCKET_RULES)
    if not ranked:return 'Documentos','low',[]
    bucket,score=ranked[0]
    return bucket,confidence(score),ranked[:3]

def classify_area(name,text):
    ranked=score_rules(fold(name+'\n'+text),AREA_RULES)
    if not ranked:return None,'low'
    label,score=ranked[0]
    return label,confidence(score)

def known_topic(name,text):
    ranked=score_rules(fold(name+'\n'+text[:120000]),TOPIC_RULES)
    if not ranked:return None,'low'
    label,score=ranked[0]
    return label,confidence(score)

def html_title(text):
    m=re.search(r'<title[^>]*>(.*?)</title>',text or '',re.I|re.S)
    if not m:m=re.search(r'<h1[^>]*>(.*?)</h1>',text or '',re.I|re.S)
    if not m:return ''
    return re.sub(r'<[^>]+>',' ',m.group(1)).strip()

def topic_tokens(name,text,title=''):
    stem=Path(name).stem
    source=fold(stem+' '+title+' '+(text[:18000] if text else ''))
    words=re.findall(r'[a-z0-9][a-z0-9-]{3,}',source)
    counts=Counter(w for w in words if w not in STOP and not w.isdigit())
    name_words=set(re.findall(r'[a-z0-9][a-z0-9-]{3,}',fold(stem+' '+title)))
    return counts,name_words

def clean_label(words):
    return ' '.join(w.replace('-',' ').title() for w in words[:3]).strip()

def main():
    payload=json.loads(sys.stdin.read() or '{}')
    files=payload.get('files') or []
    raw=[]
    total=sum(1 for x in files if Path(x.get('path','')).suffix.lower() in SUPPORTED)
    processed=0
    for item in files:
        p=Path(item.get('path',''))
        if p.suffix.lower() not in SUPPORTED:continue
        processed+=1
        try:
            d=extract(str(p)); text=d.get('text','')
            bucket,bucket_conf,scores=classify(d['name'],text)
            area,area_conf=classify_area(d['name'],text)
            topic,topic_conf=known_topic(d['name'],text)
            title=html_title(text) if p.suffix.lower() in {'.html','.htm'} else ''
            counts,name_words=topic_tokens(d['name'],text,title)
            raw.append({
                'path':d['path'],'name':d['name'],'ext':d['ext'],'sha256':d['sha256'],
                'textLength':d['textLength'],'method':d['method'],'complete':d.get('complete',True),
                'warning':d.get('warning'),'bucket':bucket,'confidence':bucket_conf,'scores':scores,
                'area':area,'areaConfidence':area_conf,'topic':topic,'topicConfidence':topic_conf,
                '_counts':counts,'_nameWords':list(name_words),'title':title
            })
        except Exception as e:
            raw.append({'path':str(p),'name':p.name,'error':str(e),'bucket':'Documentos','confidence':'low'})
        print('RB_PROGRESS '+json.dumps({'processed':processed,'total':total,'file':p.name},ensure_ascii=False),file=sys.stderr,flush=True)

    df=Counter()
    for d in raw:
        if d.get('error'):continue
        for token in d.get('_counts',{}):df[token]+=1
    max_df=max(2,int(max(1,len(raw))*0.55))
    for d in raw:
        if d.get('error'):continue
        if not d.get('topic'):
            counts=d.get('_counts',{})
            names=set(d.get('_nameWords',[]))
            shared=[(t,(8 if t in names else 0)+counts.get(t,0),df[t]) for t in counts if 2<=df[t]<=max_df]
            shared.sort(key=lambda x:(x[1],-x[2]),reverse=True)
            if shared:
                picked=[]
                for t,_,_ in shared:
                    if t not in picked:picked.append(t)
                    if len(picked)==2:break
                d['topic']=clean_label(picked); d['topicConfidence']='medium'
            elif names:
                ranked=sorted(names,key=lambda t:counts.get(t,0),reverse=True)
                d['topic']=clean_label(ranked[:2]); d['topicConfidence']='low'
            else:
                d['topic']=d.get('bucket') or 'Geral'; d['topicConfidence']='low'
        d.pop('_counts',None);d.pop('_nameWords',None)

    print(json.dumps({'ok':True,'documents':raw,'count':len(raw)},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False));sys.exit(1)
