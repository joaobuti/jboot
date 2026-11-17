# /jboot-new-module

## Objetivo

Governar a criacao de novo modulo, produto modular ou capability com contrato proprio em `implementations/*`.

Este comando existe porque novo modulo afeta produto, arquitetura, Identity, seeds, runtime, contratos, agents, skills, testes e operacao.

## Uso

```text
/jboot-new-module target=<project> module=<module> goal="<objetivo>"
```

Exemplos:

```text
/jboot-new-module target=implementations/bff-jboot-platform module=modules/financeiro goal="modulo financeiro operacional"
/jboot-new-module target=implementations/app-jboot-next-platform module=modules/financeiro goal="interface web do financeiro"
```

## Entradas

Obrigatorias:

- `target`: projeto alvo.
- `module`: modulo a criar.
- `goal`: objetivo operacional.

Opcionais:

- `kind`: `platform-module`, `standalone-module`, `internal-capability`.
- `runtime_impact`: impacto esperado em runtime.
- `identity_application_slug`: slug de application quando aplicavel.

## Fluxo Obrigatorio

1. Acionar PO.
2. Acionar PE.
3. Preparar `Stack Fit Gate` com PE.
4. Acionar Architect para comparar stacks candidatas e concluir o `Stack Fit Gate`.
5. Classificar triggers de `ai-graph-architect`; aciona-lo somente se a nova
   fronteira/relacao exigir semantica nao coberta ou houver mudanca estrutural.
6. Resolver perguntas abertas.
7. Obter confirmacao humana.
8. Criar ou trocar para branch dedicada.
9. Criar/atualizar contratos.
10. Criar/atualizar agents e skills locais.
11. Criar/atualizar seeds, runtime e codigo minimo aprovado.
12. Criar/atualizar nodes e edges do Architecture Graph, com lifecycle, owner e provenance.
13. Validar gates, testes e runtime, incluindo `make ai-architecture-graph-gate`.

## Agents E Skills

Usar:

- `docs/agents/orchestration/product-owner.md`
- `docs/agents/orchestration/product-engineer.md`
- `docs/agents/orchestration/architect.md`
- `docs/agents/orchestration/ai-graph-architect.md`: somente quando os triggers
  estruturais do contrato forem satisfeitos; criar um modulo por si so nao
  transfere ao steward a escrita do grafo.

Usar quando aplicavel:

- `docs/agents/orchestration/marketing-brand.md`: marca, landing, SEO, campanha, copy comercial ou posicionamento publico.
- `docs/skills/dev-runtime-profile/SKILL.md`: qualquer impacto em Docker, Makefile, dev-up, seeds, healthchecks, portas, workers ou dependencias de runtime.
- `docs/skills/security-checklist/SKILL.md`: endpoints, auth, autorizacao, queries, logs, DTOs, storage ou dependencias.

## Regras Identity/Platform

Quando o novo modulo/app tiver `application_slug`:

- criar seed de dev com entitlement ativo para `Operador Senior`;
- usar `identities.document_number = '00000000191'`;
- usar cliente `JBoot` com `clients.document_number = '63784101000110'`;
- conceder tambem admin do modulo ao `Usuario Teste` (`identities.document_number = '00011122233'`) no cliente `Demo JBoot` (`clients.document_number = '22345678000199'`), exceto `identity-admin`;
- incluir scopes e roles administrativos;
- incluir obrigatoriamente `users:manage`;
- usar nome do produto/modulo sem prefixo `JBoot`.

Quando for servico interno s2s sem UI:

- nao criar application Identity;
- nao conceder entitlement de usuario;
- registrar no `capability_registry` com slug funcional sem prefixo organizacional.

## Regras Para Modulo Web

Todo novo modulo com interface web deve entregar na sprint de fundacao:

- rota `/<modulo>/usuarios`;
- item "Usuarios" no sidebar do modulo;
- componente `ModuleUserManager` em `src/components/Common/ModuleUserManager`.

## Bloqueios

Bloquear criacao quando:

- nao houver fluxo `PO -> PE -> Architect -> confirmacao humana`;
- nao houver `Stack Fit Gate` com comparacao de stacks candidatas e decisao explicita sobre baseline versus fit do escopo;
- nao houver decisao operacional para perguntas abertas relevantes;
- nao houver branch dedicada antes de materializar arquivos/codigo;
- runtime impactado nao tiver `dev-runtime-profile`;
- modulo/app Identity nao tiver entitlement dev e `users:manage`;
- modulo web nao incluir gestao de usuarios obrigatoria.
- Architecture Graph gate falhar ou o novo modulo nao possuir node e relacoes basicas.

## Saida Esperada

```text
AI Command:
  command: /jboot-new-module
  target_project:
  target_module:
  mode: module-creation
  status:

Governance:
  po_summary:
  pe_summary:
  stack_fit_gate:
  architect_summary:
  human_confirmation:
  branch:
  open_questions:

Artifacts:
  contracts:
  agents:
  skills:
  seeds:
  runtime:
  architecture_graph:
  tests:
  validations:
```

## Nao Faz

- Nao cria arquivos antes da confirmacao humana.
- Nao mistura projetos/features sem relacao na mesma branch.
- Nao usa `platform:*` como permissao generica para liberar produto.
