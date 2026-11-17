# Non-Conformity: Frontend Agent Omitiu Padrao de Autocomplete CPF/CNPJ

date: 2026-06-23
severity: medium
status: corrected
owner: frontend-platform
regression_test: AIF-EVAL-NC-002 in docs/ai-governance/evals/scenarios.yaml

## Expected

O agente de stack `frontend-web` deve sugerir proativamente padroes de UX estabelecidos para o dominio antes de qualquer implementacao de formulario. Em contexto brasileiro, formularios com CPF/CNPJ como chave identificadora devem obrigatoriamente implementar lookup automatico + prefill dos campos dependentes.

## Actual

O modulo de cadastro de usuarios (`ModuleUserManager`) foi implementado com o `UserFormModal` sem lookup de CPF. O agente nao sugeriu o padrao. O gap foi identificado pelo usuario apos o modulo estar em uso — quando cadastrou o mesmo CPF em dois modulos e percebeu que os campos nao eram preenchidos automaticamente na segunda vez.

Agravante: o Claude Code (orquestrador) implementou o componente diretamente sem ativar o agente `frontend-web`, violando tambem a regra de Agent Activation do CLAUDE.md.

## Impact

- UX degradada: usuario precisou preencher manualmente os mesmos dados em um segundo modulo para um CPF ja cadastrado.
- Padrao teve que ser implementado reativamente, apos entrega.
- Erosao de confianca no pipeline AI-First: se padroes basicos nao sao sugeridos proativamente, o valor do agente especializado e questionado.

## Root Cause

Dois problemas independentes que se combinaram:

1. **Ausencia de Agent Activation**: o orquestrador foi direto para implementacao sem passar pelo agente `frontend-web`. Se o agente tivesse sido ativado, haveria ao menos a chance de o padrao ser aplicado.

2. **Padrao nao estava documentado no contrato do agente**: mesmo que o agente tivesse sido ativado, o arquivo `docs/agents/stacks/frontend-web.md` nao continha o padrao de CPF/CNPJ autocomplete. Agente sem contexto de dominio = agente generico.

## Correction

- Padrao de CPF/CNPJ como chave de formulario adicionado em `docs/agents/stacks/frontend-web.md` como obrigatorio, com todos os comportamentos esperados especificados.
- Endpoint `GET /manager/users/lookup?documentNumber=` implementado no identity.
- `UserFormModal` atualizado com lookup automatico, prefill, spinner e banner informativo.

## Prevention

- O agente `frontend-web` deve, ao receber qualquer formulario para implementar, verificar se ha campos CPF/CNPJ e aplicar o padrao documentado sem esperar instrucao.
- O orquestrador (Claude Code) deve ativar `frontend-web` antes de implementar qualquer componente de UI, conforme CLAUDE.md.
- Em revisoes de sprint gate, verificar se formularios com documento como chave implementam o padrao de lookup.
