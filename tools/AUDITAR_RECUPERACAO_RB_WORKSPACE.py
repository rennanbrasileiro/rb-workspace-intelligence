import csv, json, os
from collections import defaultdict, deque
from datetime import datetime

home=os.path.expanduser('~')
state_file=os.path.join(home,'.rb-workspace-intelligence','state.json')
stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
out_dir=os.path.join(home,'Desktop',f'RB_AUDITORIA_RECOVERY_{stamp}')
os.makedirs(out_dir,exist_ok=True)
csv_file=os.path.join(out_dir,'cadeias_de_arquivos.csv')
txt_file=os.path.join(out_dir,'resumo.txt')
def norm(p):return os.path.normcase(os.path.abspath(str(p)))
if not os.path.isfile(state_file):raise SystemExit(f'state.json não encontrado: {state_file}')
with open(state_file,'r',encoding='utf-8') as f:state=json.load(f)
edges=defaultdict(set);display={};edge_meta=[]
for tx in state.get('transactions',[]):
  for op in tx.get('operations',[]):
    if op.get('status')!='completed' or not op.get('before') or not op.get('after'):continue
    a,b=norm(op['before']),norm(op['after']);display.setdefault(a,op['before']);display.setdefault(b,op['after']);edges[a].add(b);edges[b].add(a);edge_meta.append((a,b,tx.get('createdAt',''),op.get('afterHash') or op.get('beforeHash'),op.get('type','')))
seen=set();components=[]
for node in list(edges):
  if node in seen:continue
  q=deque([node]);seen.add(node);nodes=[]
  while q:
    x=q.popleft();nodes.append(x)
    for y in edges[x]:
      if y not in seen:seen.add(y);q.append(y)
  metas=[m for m in edge_meta if m[0] in nodes or m[1] in nodes];components.append((nodes,metas))
rows=[]
for idx,(nodes,metas) in enumerate(components,1):
  existing=[display[n] for n in nodes if os.path.exists(display[n])];dated=sorted(metas,key=lambda m:m[2] or '');original=display[dated[0][0]] if dated else display[nodes[0]];hashes=sorted({m[3] for m in metas if m[3]});types=sorted({m[4] for m in metas if m[4]});status='NO_ORIGINAL' if os.path.exists(original) else 'EM_CAMINHO_HISTORICO' if existing else 'NAO_LOCALIZADO_NOS_CAMINHOS_CONHECIDOS';rows.append({'cadeia':idx,'status':status,'caminho_original_candidato':original,'caminhos_existentes':' | '.join(existing),'qtd_caminhos_historicos':len(nodes),'qtd_operacoes_historicas':len(metas),'hashes_registrados':' | '.join(hashes),'tipos':' | '.join(types),'todos_caminhos_historicos':' | '.join(display[n] for n in nodes)})
fields=['cadeia','status','caminho_original_candidato','caminhos_existentes','qtd_caminhos_historicos','qtd_operacoes_historicas','hashes_registrados','tipos','todos_caminhos_historicos']
with open(csv_file,'w',newline='',encoding='utf-8-sig') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
counts=defaultdict(int)
for r in rows:counts[r['status']]+=1
summary=[f'Transações: {len(state.get("transactions",[]))}',f'Operações concluídas: {len(edge_meta)}',f'Cadeias de arquivo: {len(rows)}',f'Já no caminho original: {counts["NO_ORIGINAL"]}',f'Em outro caminho histórico: {counts["EM_CAMINHO_HISTORICO"]}',f'Não localizado nos caminhos conhecidos: {counts["NAO_LOCALIZADO_NOS_CAMINHOS_CONHECIDOS"]}',f'CSV: {csv_file}']
with open(txt_file,'w',encoding='utf-8') as f:f.write('\n'.join(summary))
print('\n'.join(summary))
