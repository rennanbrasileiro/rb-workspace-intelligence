#!/usr/bin/env python3
import hashlib, json, re, sys
from pathlib import Path
TEXT_EXTS={'.txt','.md','.csv','.json','.xml','.html','.htm','.log','.ini','.cfg','.yaml','.yml','.js','.ts','.tsx','.jsx','.py','.java','.cs','.sql','.css','.scss','.ps1','.bat','.cmd'}
MAX_TEXT=300_000
def sha256_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
def clean(text):
    text=str(text or '').replace('\x00',' ');text=re.sub(r'\r\n?','\n',text);text=re.sub(r'\n{4,}','\n\n\n',text);return text[:MAX_TEXT]
def read_text(path):
    raw=Path(path).read_bytes()[:MAX_TEXT*4]
    for enc in ('utf-8','utf-8-sig','cp1252','latin-1'):
        try:return clean(raw.decode(enc))
        except UnicodeDecodeError:pass
    return clean(raw.decode('utf-8','replace'))
def read_pdf(path):
    from pypdf import PdfReader
    return clean('\n\n'.join((p.extract_text() or '') for p in PdfReader(path).pages))
def read_docx(path):
    from docx import Document
    d=Document(path);parts=[p.text for p in d.paragraphs]
    for table in d.tables:
        for row in table.rows:parts.append(' | '.join(c.text for c in row.cells))
    return clean('\n'.join(parts))
def read_xlsx(path):
    from openpyxl import load_workbook
    wb=load_workbook(path,read_only=True,data_only=True);out=[];total=0
    for ws in wb.worksheets:
        out.append(f'## {ws.title}')
        for row in ws.iter_rows(values_only=True):
            vals=['' if v is None else str(v) for v in row]
            if any(vals):line=' | '.join(vals);out.append(line);total+=len(line)
            if total>MAX_TEXT:break
        if total>MAX_TEXT:break
    wb.close();return clean('\n'.join(out))
def read_pptx(path):
    from pptx import Presentation
    out=[]
    for i,slide in enumerate(Presentation(path).slides,1):
        out.append(f'## Slide {i}')
        for shape in slide.shapes:
            if hasattr(shape,'text') and shape.text:out.append(shape.text)
    return clean('\n'.join(out))
def extract(path):
    p=Path(path).resolve()
    if not p.is_file():raise FileNotFoundError(str(p))
    ext=p.suffix.lower();text='';method='metadata-only';warning=None
    try:
        if ext in TEXT_EXTS:text=read_text(p);method='text'
        elif ext=='.pdf':text=read_pdf(p);method='pypdf'
        elif ext=='.docx':text=read_docx(p);method='python-docx'
        elif ext=='.xlsx':text=read_xlsx(p);method='openpyxl'
        elif ext=='.pptx':text=read_pptx(p);method='python-pptx'
        else:warning='Formato sem extrator textual nesta versão; metadados e hash foram preservados.'
    except ImportError as e:warning=f'Dependência opcional não instalada: {e.name}. Execute o instalador novamente ou use pip install -r requirements.txt.'
    st=p.stat();return{'path':str(p),'name':p.name,'ext':ext,'size':st.st_size,'modifiedAt':st.st_mtime,'sha256':sha256_file(p),'method':method,'text':text,'textLength':len(text),'warning':warning,'provenance':{'source':'local_file','readOnly':True,'originalUntouched':True}}
if __name__=='__main__':
    try:
        path=sys.argv[1] if len(sys.argv)>1 else '';print(json.dumps({'ok':True,'document':extract(path)},ensure_ascii=False))
    except Exception as e:print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False));sys.exit(1)
