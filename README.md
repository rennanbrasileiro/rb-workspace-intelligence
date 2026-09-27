# RB Workspace Intelligence

SaaS + agente local para inventariar, compreender e organizar arquivos e documentos com segurança, rastreabilidade e rollback.

## Jeito mais fácil no Windows

Baixe e execute `INSTALL_RB_DEV_HUB.cmd`.

Ele cria `%USERPROFILE%\RB\Projects`, clona/atualiza o RB Workspace Intelligence, abre `RB.code-workspace` no VS Code quando o comando `code` estiver disponível e inicia o Dev Hub em `http://127.0.0.1:4310/devhub/`.

O Dev Hub passa a ser o ponto único para clonar/atualizar, abrir no VS Code, instalar dependências, buildar, rodar e abrir aplicações. Cada projeto declara seu próprio ciclo em `rb-project.json`, então o Hub não precisa conhecer previamente o stack.

Projetos iniciais:

- `rennanbrasileiro/rb-workspace-intelligence`
- `rennanbrasileiro/molde-3d-app`

## Rodar depois de instalado

Execute `START_RB_DEV_HUB.cmd` ou abra `RB.code-workspace` no VS Code.

Dashboard: `http://127.0.0.1:4310`

Dev Hub: `http://127.0.0.1:4310/devhub/`

## Document Intelligence real

O agente local possui extração somente leitura para:

- TXT, Markdown, CSV, JSON, XML, HTML e arquivos de texto/código: nativo;
- PDF: `pypdf`;
- DOCX: `python-docx`;
- XLSX: `openpyxl`;
- PPTX: `python-pptx`.

Para habilitar os extratores Office/PDF, execute `INSTALL_AGENT_DEPS.cmd` ou use o botão **Dependências** do projeto no Dev Hub. A leitura gera texto separado, SHA-256 e proveniência; o original não é sobrescrito.

## MVP local atual

O dashboard consegue:

- inventariar uma pasta explicitamente autorizada dentro do perfil do usuário;
- bloquear caminhos críticos de sistema;
- ignorar `.git`, `node_modules`, Lixeira e `AppData` durante o inventário básico;
- identificar nomes pouco claros por regras iniciais;
- gerar uma proposta `BEFORE → AFTER` por ano e categoria para arquivos soltos;
- ler documentos suportados em modo somente leitura.

O plano é **preview apenas** neste estágio. Nenhum `MOVE_FILE`, `RENAME_FILE` ou exclusão é executado pelo dashboard atual.

## Princípios de segurança

- Nunca apagar arquivos automaticamente.
- O SaaS não recebe acesso arbitrário ao filesystem.
- O agente executa somente operações tipadas e auditáveis.
- Toda operação futura deve registrar estado anterior e posterior.
- Usar hash para validar integridade quando aplicável.
- Permitir rollback de operações elegíveis.
- Proteger por padrão diretórios críticos do sistema.
- Preservar repositórios de código conforme política do Space.
- Nunca sobrescrever o conteúdo original durante extração de documentos.

## Operações previstas do agente

- `CREATE_DIRECTORY`
- `MOVE_FILE`
- `RENAME_FILE`
- `COPY_FILE`
- `QUARANTINE_FILE`
- `RESTORE_OPERATION`

## Arquitetura

```text
Windows / arquivos locais
        ↓
Local Agent
        ↓
Inventário + Document Intelligence autorizado
        ↓
RB Workspace Intelligence
        ↓
Spaces + Policies + Findings
        ↓
Organization Plan (BEFORE → AFTER)
        ↓
Aprovação humana
        ↓
Operações tipadas no agente
        ↓
Audit Log + rollback
```

## Spaces

A estrutura está preparada para contextos independentes como RB Hub, Condomínio, Projetos e Pessoal, cada um com políticas próprias de hierarquia, nomenclatura, ano/mês, documentos, caminhos protegidos e futuramente regras de e-mail/cloud.

## Roadmap

1. MVP local + Dev Hub
2. Inventário persistente e máquina vinculada
3. Spaces, Policies e classificação contextual
4. Findings avançados, duplicidades e versões
5. Organization Plan com aprovação granular
6. Execução tipada + journal + rollback
7. Integrações de e-mail e cloud drives
8. Busca semântica sobre documentos
9. Integração com outros produtos RB

## Ambiente hospedado

Existe um ambiente web inicial de demonstração no Replit. O acesso real ao filesystem continua necessariamente no agente/processo local; uma página hospedada não recebe acesso livre ao disco do usuário.
