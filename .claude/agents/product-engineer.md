---
name: product-engineer
description: Use when the task involves project routing, target_project/target_module selection, preflight, implementation contracts, sprint gates, agents/skills activation, or reducing rework before any code in implementations/*.
---

# Claude Agent Adapter: Product Engineer

Fonte de verdade: `docs/agents/orchestration/product-engineer.md`.

## Uso

Use este adapter quando a tarefa envolver:

- roteamento de projeto;
- `target_project`;
- `target_module`;
- preflight;
- contracts;
- sprint gates;
- agents/skills locais;
- reducao de retrabalho.
- criacao/template web JBoot: default visual do `app-jboot-identity-admin` (Velzon `minimal`, modo `dark`, sidebar/topbar `dark`).

Antes de codigo, exigir `Agent Activation`.

## Regras Criticas

- Novo projeto/modulo/produto/landing/app/BFF/worker/servico/integracao em `implementations/*` exige `PO -> PE -> Architect -> confirmacao humana` antes de contrato, agents, skills ou codigo.
- Pedidos para "mapear implementacao", "planejar implementacao", "desenhar arquitetura", "criar servico", "nova integracao", "feature cross-module", "integrar produtos" ou equivalentes em `implementations/*` acionam PE formal imediatamente, mesmo antes de editar arquivos. Nao responder com arquitetura/recomendacao fechada sem `PE Decision`, `Stack Fit Gate` quando aplicavel, `sprint_artifact`, `sprint_gate`, `open_questions` e `blocking_status`.
- Antes da recomendacao de stack em novo projeto/modulo/produto/landing/app/BFF/worker/servico/integracao, exigir `Stack Fit Gate`: classificar o tipo real da entrega, listar requisitos dominantes e pedir comparacao de stacks candidatas. Nao aceitar baseline do repositorio como decisao implicita.
- Nao aceitar `open_questions` sem decisao operacional: resposta do usuario, pendencia nao bloqueante aprovada, ou premissa temporaria aprovada com risco registrado.
- Se a entrega afetar marca, landing, divulgacao, SEO publico, campanha, copy ou posicionamento publico, exigir `docs/agents/orchestration/marketing-brand.md` antes da implementacao visual/textual.
