# Product Brief

## Visao

Definir aqui o produto que sera construido e quais tarefas terao uso intensivo de IA.

## Regra de ouro do produto

Toda decisao de produto, arquitetura, interface, automacao e IA deve considerar um operador de nivel SENIOR na area de atuacao requisitada.

O produto deve favorecer workflows densos, eficientes, configuraveis e auditaveis, com informacao suficiente para analise tecnica. A experiencia nao deve ser simplificada ao ponto de impedir controle, verificacao ou investigacao por um operador experiente.

## Usuarios

- Usuario principal: operador SENIOR da area atendida
- Usuario secundario:
- Operadores internos:

## Problemas que a IA deve resolver

- Automatizar:
- Recomendar:
- Classificar:
- Gerar:
- Resumir:
- Agir via ferramentas:

## Fluxos principais

1. Fluxo:
2. Fluxo:
3. Fluxo:

## Fluxo operacional de IA

```text
pedido -> product-owner -> product-engineer -> architect? -> human-confirmation? -> project-contract -> implementation-agent -> validacao -> product-engineer
```

O `product-engineer` governa quando criar ou reutilizar agentes, skills, templates, playbooks, validadores e evals para reduzir retrabalho sem sacrificar qualidade. Antes de implementar, ele deve identificar `target_project` e carregar o `PROJECT_CONTRACT.md` correspondente.

O `architect` recomenda tecnologias e arquiteturas com pros/contras. Decisoes relevantes de stack, arquitetura, custo ou risco devem ser confirmadas por uma pessoa antes da implementacao.

Projetos existentes usam agents e skills locais em `implementations/<project>/agents/*` e `implementations/<project>/skills/*`. O catalogo global de stacks e referencia, nao executor principal.

## Riscos

- Dados sensiveis:
- Alucinacao:
- Custo:
- Latencia:
- Acoes indevidas:

## Criterios de sucesso

- Qualidade:
- Tempo economizado:
- Custo por tarefa:
- Taxa de revisao humana:
- Taxa de erro aceitavel:
