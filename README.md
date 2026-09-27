# RB Workspace Intelligence

Aplicação **local-first** para inventariar, compreender, organizar e rastrear arquivos e documentos sem entregar controle arbitrário do computador a um SaaS.

## Instalação única no Windows

Execute `INSTALL_RB_WORKSPACE.cmd`. O instalador:

1. verifica Git, Node.js e Python;
2. usa `winget` para instalar pré-requisitos ausentes quando disponível;
3. clona/atualiza este repositório em `%USERPROFILE%\RB\Projects\rb-workspace-intelligence`;
4. valida o código;
5. instala leitores de PDF/DOCX/XLSX/PPTX;
6. cria atalhos no Desktop e Menu Iniciar;
7. abre `http://127.0.0.1:4310/`.

Depois disso, atualizações normais são feitas na **Dev Console**: Verificar GitHub → `git pull` → Reiniciar aplicação.

## Produtos separados

- `/` — **Workspace Intelligence**: Spaces, inventário, análise, BEFORE → AFTER, execução segura, histórico, rollback e Document Intelligence.
- `/devhub/` — **Dev Console / Project Launcher**: Git, build, execução, Cursor/VS Code e aprendizado. Ela gerencia projetos, mas não mistura seus códigos.
- MOLDÊ continua em `rennanbrasileiro/molde-3d-app` e só aparece como projeto independente no Launcher.

## Garantias de segurança da v1.0

- opera apenas dentro do perfil do usuário;
- bloqueia diretórios críticos do Windows;
- ignora `.git`, `node_modules`, AppData e artefatos de build no inventário;
- nunca apaga automaticamente;
- duplicados vão apenas para quarentena, com aprovação explícita;
- nunca sobrescreve arquivo de destino;
- registra hash antes/depois das movimentações;
- rollback é bloqueado se o arquivo tiver sido alterado após a operação;
- leitura de documentos preserva o original e registra proveniência.

## Formatos de documento

PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, XML, Markdown e arquivos comuns de texto/código. OCR de documentos escaneados fica para uma evolução posterior.

## Desenvolvimento

```bash
npm run build
npm run dev
```

A aplicação não possui dependências NPM externas no núcleo. Leitores de documentos usam `requirements.txt`.
