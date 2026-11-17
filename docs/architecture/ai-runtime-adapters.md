# AI Runtime Adapters

## Objetivo

Padronizar como ferramentas de IA como Codex, Claude, Cursor e GitHub Copilot devem consumir a arquitetura de agents, skills e contratos do JBoot.

## Fonte De Verdade

```text
AGENTS.md
docs/agents/orchestration/*
docs/agents/stacks/*
docs/architecture/implementation-contracts.md
implementations/<project>/PROJECT_CONTRACT.md
implementations/<project>/modules/<module>/MODULE_CONTRACT.md
implementations/<project>/agents/*
implementations/<project>/skills/*
implementations/<project>/modules/<module>/agents/*
implementations/<project>/modules/<module>/skills/*
```

Diretorios/arquivos de runtime como `.codex.d`, `.claude`, `.cursor` e `.github/copilot-instructions.md` sao adapters. Eles nao podem contradizer os contratos.

Nota: neste ambiente, `.codex` existe como arquivo reservado pelo runtime. Por isso o adapter Codex do repositorio fica em `.codex.d`.

## Regra De Precedencia

Quando houver conflito:

1. `AGENTS.md`
2. `PROJECT_CONTRACT.md`
3. `MODULE_CONTRACT.md`
4. agents/skills locais
5. adapter do runtime

O adapter deve ser corrigido se divergir da fonte de verdade.

## Runtimes

| Runtime | Diretorio | Responsabilidade |
|---|---|---|
| Codex | `.codex.d/*` | Skills e instrucoes operacionais para Codex neste repositorio. |
| Claude | `.claude/*` | Instrucoes e agents espelhados para Claude. |
| Cursor | `.cursor/*` | Rules para IDE/editor. |
| GitHub Copilot | `.github/copilot-instructions.md` | Instrucoes de contexto para Copilot. |

## Ativacao Obrigatoria

Qualquer runtime deve emitir antes de codigo funcional:

```text
Agent Activation:
  project:
  module:
  using_agent:
  using_skill:
  referenced_only:
  not_using:
```

Sem esse bloco, a execucao deve ser tratada como feita sem agents/skills.

## Politica De Sincronizacao

- Criar/alterar contrato primeiro.
- Atualizar agents/skills locais.
- Atualizar adapters `.codex.d`, `.claude`, `.cursor`, `.github/copilot-instructions.md`.
- Registrar se a mudanca afeta guia/manual.

Adapters nao devem ser editados como fonte primaria de decisao arquitetural.

Adapters devem preservar explicitamente:

- `marketing-brand` para marca, landing, SEO publico, campanha, copy e posicionamento publico;
- `ui-ux` antes de agent local `frontend-*` quando houver tela, fluxo de usuario ou componente novo de interface web;
- `docs/agents/stacks/*` como subagents de referencia para Stack Fit Gate e revisao/criacao de agents locais, nao como executores padrao de projeto.

## Conformidade Executavel

Todos os adapters ativos devem conter os controles bloqueantes declarados em
`docs/ai-governance/conformance/ai-first.yaml`. A verificacao e semantica por
identificador estavel de controle; presenca de palavras-chave isoladas nao e
suficiente. Execute `make ai-conformance` apos qualquer mudanca.
