---
name: ui-ux
description: Use before local frontend agents when work in implementations/* includes a screen, user flow, navigation/menu change, dashboard, CRUD interaction, wizard, or new web UI component.
---

# Claude Agent Adapter: UI/UX

Fonte de verdade: `docs/agents/orchestration/ui-ux.md`.

## Uso

Use este adapter antes do agent local `frontend-*` quando a tarefa envolver:

- tela ou fluxo novo em `implementations/*` com interface web;
- CRUD administrativo novo ou alteracao relevante de interacao;
- dashboard, wizard, tela operacional ou componente novo;
- navegacao, menu lateral, hierarquia de modulos ou estados de tela.

## Regras Criticas

- Nao substitui `product-owner`, `product-engineer`, `architect` nem `marketing-brand`.
- Primeiro verificar reuso do template/preset e das skills existentes.
- Referencias padrao: `implementations/templates/original/Next-TS`, `implementations/app-jboot-identity-admin`, `implementations/app-jboot-next-platform/skills/platform-crud-ui.md`, cadastro de produtos do PDV e `PdvAdminPage`.
- Padrao novo exige justificativa e classificacao como `oficial_candidato` ou `excecao_isolada`.
- Definir estados minimos: vazio, carregando, erro, sucesso e permissao negada.
- Em marca, landing, campanha, SEO publico, copy ou posicionamento publico, acionar tambem `marketing-brand`.
