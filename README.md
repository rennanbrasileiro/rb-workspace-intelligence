# RB Workspace Intelligence

SaaS + agente local para inventariar, compreender e organizar arquivos e documentos com segurança, rastreabilidade e rollback.

## Visão do produto

O RB Workspace Intelligence conecta máquinas autorizadas a uma aplicação SaaS. Um agente local Windows inventaria apenas as pastas explicitamente autorizadas, extrai metadados e, quando permitido, conteúdo textual de documentos. O SaaS analisa esse inventário, identifica problemas de organização e propõe planos de reorganização antes de qualquer alteração no filesystem.

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

## Operações do agente

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

1. SaaS navegável e modelo de domínio
2. Agente Windows
3. Pareamento máquina ↔ SaaS
4. Inventário real de pastas autorizadas
5. Leitura real de documentos
6. Análise e organização assistida
7. Execução tipada e rollback
8. Integrações de e-mail e cloud drives
9. Busca semântica sobre documentos
10. Integração com outros produtos RB

## Status

Projeto em desenvolvimento. Dados apresentados em ambientes de demonstração devem ser claramente marcados como DEMO até que máquinas e fontes reais estejam conectadas.
