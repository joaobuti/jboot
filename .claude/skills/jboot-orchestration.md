---
name: jboot-orchestration
description: Use for JBoot architectural planning, project routing, target_project/target_module selection, Agent Activation, sprint gates, and contract-first execution before coding.
---

# Claude Skill Adapter: JBoot Orchestration

Fonte de verdade:

- `AGENTS.md`
- `docs/architecture/implementation-contracts.md`
- `docs/agents/orchestration/product-engineer.md`
- `docs/agents/orchestration/architect.md`
- `docs/agents/orchestration/marketing-brand.md`
- `docs/agents/orchestration/ui-ux.md`
- `docs/agents/stacks/*`

## Estilo De Resposta

- Responder questionamentos com precisao tecnica acima de concordancia social.
- Nao usar empatia performatica, elogios ou validacao generica como substituto de analise.
- Se a premissa do usuario estiver incorreta, incompleta, ambigua ou arriscada, sugerir correcao direta e explicar brevemente o fundamento tecnico, risco evitado ou tradeoff envolvido.

## Procedimento

1. Ler `AGENTS.md`.
2. Ler `docs/architecture/implementation-contracts.md`.
3. Determinar `execution_mode`.
4. Determinar `target_project`.
5. Se platform modular, determinar `target_module`.
6. Pedidos para mapear implementacao, planejar implementacao, desenhar arquitetura, criar servico, nova integracao, integrar produtos ou feature cross-module em `implementations/*` sao planejamento governado mesmo antes de editar arquivos. Antes de recomendacao tecnica/arquitetural fechada, emitir `PE Decision`, `Stack Fit Gate` quando aplicavel, `sprint_artifact`, `sprint_gate`, `open_questions` e `blocking_status`.
7. Se a tarefa criar projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao em `implementations/*`, executar `PO -> PE -> Architect -> confirmacao humana` antes de criar contrato, agents, skills ou codigo.
8. Para novo projeto/modulo/produto/landing/app/BFF/worker/servico/integracao, executar `Stack Fit Gate` antes de recomendar stack: PE classifica o tipo real da entrega; Architect compara stacks candidatas por fit de escopo, SEO/interatividade quando aplicavel, runtime, deploy, manutencao, testes e evolucao. Baseline do repositorio e fallback justificado, nao escolha automatica. Para site estatico, documentacao, portfolio, landing ou marketing tecnico com pouca interatividade, comparar Astro antes de Next.js.
9. Apos a confirmacao humana e antes de criar `PROJECT_CONTRACT.md`, `MODULE_CONTRACT.md`, diretorios, agents, skills ou codigo para novo projeto/modulo/produto/landing/app/BFF/worker/servico/integracao, criar/trocar automaticamente para uma branch Git dedicada seguindo as convencoes ja existentes no repositorio.
10. Nao misturar projetos/features sem relacao na mesma branch de implementacao.
11. Resolver toda pergunta aberta de PO/PE/Architect antes de materializar trabalho: resposta do usuario, pendencia nao bloqueante aprovada, ou premissa temporaria aprovada com risco registrado.
12. Se a tarefa afetar marca, landing publica, site institucional, SEO publico, campanha, copy comercial ou posicionamento publico, exigir `docs/agents/orchestration/marketing-brand.md` antes da implementacao visual/textual. Usar `docs/mkt/jb-cyan.jpg` como default visual da marca JBoot e `docs/mkt/jb-cyan-white.png` para contextos clean/claros, salvo decisao humana em contrario.
13. Para assets visuais principais, exigir integracao pratica no sistema visual: tokens, paleta, linhas, componentes, secoes, CTAs ou narrativa derivados dele. Imagem isolada no hero nao e identidade visual suficiente.
14. Se a entrega em `implementations/*` incluir tela, fluxo de usuario ou componente novo de interface web, exigir `docs/agents/orchestration/ui-ux.md` antes do agent local `frontend-*`.
15. Usar `docs/agents/stacks/*` como subagents de referencia para Stack Fit Gate e revisao/criacao de agents locais; nao usar stack agent como executor principal quando houver `target_project`.
16. Ler `PROJECT_CONTRACT.md` do projeto.
17. Se aplicavel, ler `MODULE_CONTRACT.md`.
18. Se a tarefa criar projeto/modulo ou alterar infra local/dev-up, usar `dev-runtime-profile`.
19. Emitir `Agent Activation` antes de codigo.

## Bloco Obrigatorio Antes De Codigo

```text
Agent Activation:
  project:
  module:
  using_agent:
  using_skill:
  referenced_only:
  not_using:
```

Sem esse bloco, a execucao e nao-conforme.
