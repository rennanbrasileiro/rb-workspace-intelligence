#!/usr/bin/env python3
import json, sys, unicodedata
from pathlib import Path
from reader import extract

SUPPORTED={'.pdf','.docx','.xlsx','.pptx','.txt','.csv','.json','.md','.xml','.html','.htm','.log','.yaml','.yml'}
RULES={
  'Contratos':['contrato','aditivo','clausula','cláusula','vigencia','vigência','contratante','contratado','rescisao','rescisão'],
  'Financeiro':['nota fiscal','boleto','pagamento','fatura','extrato','darf','receita','despesa','pro labore','pró-labore','orcamento','orçamento'],
  'Reuniões':['ata','reuniao','reunião','pauta','daily','retrospectiva','alinhamento','checkpoint','comite','comitê'],
  'Relatórios':['relatorio','relatório','indicador','status report','acompanhamento','gestao','gestão','resultado','dashboard'],
  'Jurídico':['juridico','jurídico','processo','peticao','petição','sentenca','sentença','tribunal','procuracao','procuração'],
  'Manutenção':['manutencao','manutenção','elevador','ar condicionado','avcb','incendio','incêndio','extintor','preventiva','corretiva'],
  'Projetos':['projeto','sprint','backlog','requisito','historia de usuario','história de usuário','arquitetura','gitlab','github','roadmap','cronograma'],
  'Certidões':['certidao','certidão','regularidade','negativa','fgts','cnd','cndt','receita federal','sefaz'],
}

def fold(v):
    v=unicodedata.normalize('NFD',str(v or '').lower())
    return ''.join(ch for ch in v if unicodedata.category(ch)!='Mn')

def classify(name,text):
    hay=fold(name+'\n'+text)
    scores={}
    for bucket,terms in RULES.items():
        score=sum(hay.count(fold(t)) for t in terms)
        if score:scores[bucket]=score
    if not scores:return 'Documentos','low',[]
    ranked=sorted(scores.items(),key=lambda x:x[1],reverse=True)
    bucket,score=ranked[0]
    confidence='high' if score>=5 else 'medium' if score>=2 else 'low'
    return bucket,confidence,ranked[:3]

def main():
    payload=json.loads(sys.stdin.read() or '{}')
    files=payload.get('files') or []
    out=[]
    for item in files:
        p=Path(item.get('path',''))
        if p.suffix.lower() not in SUPPORTED:continue
        try:
            d=extract(str(p))
            bucket,confidence,scores=classify(d['name'],d.get('text',''))
            out.append({
                'path':d['path'],'name':d['name'],'ext':d['ext'],'sha256':d['sha256'],
                'textLength':d['textLength'],'method':d['method'],'complete':d.get('complete',True),
                'warning':d.get('warning'),'bucket':bucket,'confidence':confidence,'scores':scores
            })
        except Exception as e:
            out.append({'path':str(p),'name':p.name,'error':str(e),'bucket':'Documentos','confidence':'low'})
    print(json.dumps({'ok':True,'documents':out,'count':len(out)},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False));sys.exit(1)
