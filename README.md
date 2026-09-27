# RB Workspace Intelligence

SaaS + agente local para inventariar, compreender e organizar arquivos e documentos com segurança, rastreabilidade e rollback.

## Rodar localmente no Windows

1. Instale Git, Node.js LTS e VS Code.
2. Clone este repositório.
3. Execute `START_RB_DEV_HUB.cmd`.
4. O dashboard abre em `http://127.0.0.1:4310` e o Dev Hub em `http://127.0.0.1:4310/devhub/`.

O **RB Dev Hub** é o ponto único para seus projetos locais. Ele verifica Git/Node/VS Code/Python e permite clonar/atualizar, abrir em uma nova janela do VS Code, instalar dependências, buildar, rodar e abrir no navegador. Cada projeto pode descrever seu próprio ciclo por `rb-project.json`, evitando um processo diferente para cada stack.

Projetos já cadastrados no Dev Hub:

- `rennanbrasileiro/rb-workspace-intelligence`
- `rennanbrasileiro/molde-3d-app`

## Visão do produto

O RB Workspace Intelligence conecta máquinas autorizadas a uma aplicação SaaS. Um agente local Windows inventaria apenas as pastas explicitamente autorizadas, extrai metadados e, quando permitido, conteúdo textual de documentos. O SaaS analisa esse inventário, identifica problemas de organização e propõe planos de reorganização antes de qualquer alteração no filesystem.

## MVP local atual

O MVP local já consegue inventariar, em modo somente leitura, uma pasta explicitamente informada dentro do perfil do usuário. Diretórios críticos de sistema são bloqueados e `.git`, `node_modules` e Lixeira não são percorridos. Nenhuma ação de mover, renomear ou apagar arquivo foi habilitada nesta etapa.

## Princípios de segurança

- Nunca apagar arquivos automaticamente.
- O SaaS não recebe acesso arbitrário ao filesystem.
- O agente executa somente operações tipadas e auditáveis.
- Toda operação deve registrar estado anterior e posterior.
- Usar hash quando disponível para validar integridade.
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

## Arquitetura inicial

```text
Windows / arquivos locais
        ↓
Local Agent
        ↓
Inventário + extração autorizada
        ↓
RB Workspace Intelligence SaaS
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

Cada organização pode manter contextos independentes, por exemplo:

- RB Hub
- Condomínio
- Projetos
- Pessoal

Cada Space pode possuir regras próprias de estrutura, nomenclatura, ano/mês, tipos documentais, caminhos protegidos e futuramente regras de e-mail e armazenamento em nuvem.

## Document Intelligence

Formatos planejados para leitura e classificação:

- PDF
- DOCX
- XLSX
- PPTX
- TXT
- CSV
- arquivos de texto e código

O texto extraído deve ser armazenado separadamente do arquivo original, mantendo proveniência e referência ao documento-fonte. Imagens e documentos escaneados entram posteriormente por OCR opcional.

## Roadmap

1. MVP local + Dev Hub
2. Agente Windows e pareamento máquina ↔ SaaS
3. Inventário persistente de pastas autorizadas
4. Leitura real de documentos
5. Spaces, Policies e Findings
6. Organization Plan BEFORE → AFTER
7. Execução tipada e rollback
8. Integrações de e-mail e cloud drives
9. Busca semântica sobre documentos
10. Integração com outros produtos RB

## Ambiente publicado

Existe um ambiente web inicial de demonstração no Replit. O acesso real ao filesystem continua necessariamente no agente/processo local; uma página hospedada não recebe acesso livre ao disco do usuário.

## Status

Projeto em desenvolvimento. Dados apresentados em ambientes de demonstração devem ser claramente marcados como DEMO até que máquinas e fontes reais estejam conectadas.
