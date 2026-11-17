# Agents

Este diretorio define os agentes globais de orquestracao e referencias de stack. Agentes executores de projeto ficam dentro de cada implementacao.

## Grupos

| Grupo | Local | Uso |
|---|---|---|
| Orquestracao | `docs/agents/orchestration/*` | PO, PE, Architect, Marketing/Brand, UI/UX, decisao assistida, governanca e fluxo. |
| Referencia de stack | `docs/agents/stacks/*` | Subagents/catalogo tecnico para Stack Fit Gate e para criar/atualizar agents locais. |
| Implementacao | `implementations/<project>/agents/*` | Execucao concreta no projeto alvo. |
| Skills locais | `implementations/<project>/skills/*` | Procedimentos repetiveis do projeto alvo. |

## Fluxo Principal

```text
pedido -> product-owner -> product-engineer -> architect? -> ai-graph-architect? -> marketing-brand? -> ui-ux? -> human-confirmation? -> project-contract -> implementation-agent -> validacao -> product-engineer
```

- `product-owner`: detalha tarefa, criterios de aceite, restricoes e ambiguidades.
- `product-engineer`: identifica modo de execucao, `target_project`, contratos, agents e skills locais.
- `architect`: compara alternativas e recomenda stack/arquitetura quando houver decisao tecnica relevante.
- `ai-graph-architect`: steward condicional do Architecture Graph; entra somente
  em mudanca estrutural, semantica ambigua, drift nao mecanico ou evolucao do
  proprio graph/runtime, sem substituir a escrita pelos agents executores.
- `marketing-brand`: define posicionamento publico, mensagem, copy, SEO publico, tom de voz e diretrizes de marca quando a entrega afetar divulgacao ou percepcao publica.
- `ui-ux`: define fluxo de interacao, hierarquia de informacao, estados, navegacao e reuso de template/preset antes de tela, fluxo de usuario ou componente novo de interface web.
- `stack-reference agents`: subagents em `docs/agents/stacks/*` usados pelo Stack Fit Gate e por atualizacao/criacao de agents locais; nao executam diretamente quando existe `target_project`.
- `human-confirmation`: confirma stack, arquitetura, custo ou risco relevante antes da implementacao.
- `project-contract`: `implementations/<project>/PROJECT_CONTRACT.md`, fonte de verdade para execucao.
- `implementation-agent`: agente local do projeto, nao um agente global generico.
- `validacao`: confirma qualidade tecnica, contratos, testes, smoke, custo/token budget e aderencia ao fluxo.

## Preflight Obrigatorio

Antes de qualquer codigo em `implementations/*`, o `product-engineer` deve declarar:

- modo de execucao;
- projeto alvo;
- contratos carregados;
- gate da sprint usado, quando houver;
- agents locais usados;
- skills locais usadas;
- ordem de execucao;
- validacoes esperadas;
- fora de escopo.

Esse preflight evita executar no projeto errado, ignorar contratos ou usar contexto generico. Ele e parte da qualidade minima, nao burocracia opcional.

## Fluxo Revisado Ponta A Ponta

1. `pedido`: entrada do usuario ou demanda operacional.
2. `product-owner`: transforma pedido em escopo funcional, regras, restricoes e aceite.
3. `product-engineer`: define modo, projeto alvo, escopo de contexto, agents/skills locais e validacoes.
4. `architect`: entra quando stack, arquitetura, custo, risco ou contrato estrutural exigirem decisao assistida.
5. `ai-graph-architect`: entra pelos triggers de `docs/agents/orchestration/ai-graph-architect.md`; atualizacao rotineira permanece com o executor.
6. `marketing-brand`: entra quando marca, landing, site institucional, SEO publico, campanha, copy ou posicionamento publico forem afetados.
7. `ui-ux`: entra antes de agent local `frontend-*` quando houver tela, fluxo de usuario ou componente novo de interface web.
8. `human-confirmation`: usuario confirma ou ajusta recomendacao relevante.
9. `project-contract`: contrato local guia entrypoints, restricoes e comandos.
10. `implementation-agent`: implementa conforme contrato e skills locais.
11. `validacao`: executa testes, typecheck/build, smoke, evals e revisao de riscos.
12. `product-engineer`: revisa se o fluxo gerou qualidade sem retrabalho evitavel e atualiza memoria operacional quando necessario.

## Regras de ouro

Todos os agentes criados neste projeto devem obedecer estas regras globais:

1. Reduzir ao MAXIMO o numero de tokens consumidos, sem prejuizo da execucao correta da tarefa.
2. Agir sempre como operador SENIOR na area envolvida.
3. Priorizar qualidade, manutencao e coerencia arquitetural sobre velocidade.
4. Evitar atalhos que gerem retrabalho previsivel.

Isso implica respostas objetivas, sem repeticao inutil, com tradeoffs explicitos, criterios verificaveis, rastreabilidade, controle tecnico e recusa a simplificacoes que escondam risco relevante.

Concisao nao autoriza omitir informacao necessaria para decisao, implementacao, validacao, seguranca ou auditoria.

## Artefatos de saida esperados

- recomendacao de stack com justificativa e status de confirmacao humana;
- alternativas rejeitadas;
- tabela de pros/contras das tecnologias e arquiteturas consideradas;
- fluxo de agentes e skills definido pelo `product-engineer`;
- `target_project` e contratos de implementacao consultados;
- agents e skills locais usados;
- contratos de entrada e saida;
- limites arquiteturais;
- plano de implementacao;
- riscos, testes e avaliacao;
- agente local responsavel pela execucao.

## Boost operacional

Use `docs/agents/productivity.md` para decidir quando criar skills, playbooks, templates, schemas, evals e validadores para aumentar produtividade dos agentes sem aumentar custo de contexto desnecessariamente.

O `product-engineer` e o dono dessa decisao. Sempre que agente, skill ou fluxo mudar, revise o caminho completo de `pedido` ate validacao final.

Antes de criar tela, rota, CRUD ou menu, revise as responsabilidades existentes no escopo relevante. Se o usuario indicar uma tela, rota ou arquivo como referencia, limite a verificacao a esse alvo e ao entorno indispensavel; revisao ampla so deve ocorrer quando nao houver referencia especifica ou quando uma dependencia real exigir.

Quando houver projeto alvo em `implementations/*`, carregue primeiro o `PROJECT_CONTRACT.md` e depois apenas os agents/skills locais necessarios. Use `docs/agents/stacks/*` como referencia, nao como executor principal.
