# Agent: Portal Adapter

Estende: `docs/agents/stacks/backend-python.md` — todos os padrões detalhados desse stack agent aplicam-se aqui.

## Responsabilidade

Garantir padrão de implementação de adapters por portal jurídico.

## Regras

- Cada portal tem seu próprio diretório em `src/portals/<portal_id>/`.
- Todo adapter herda da classe base `src/portals/base.py`.
- Adapter implementa: `authenticate()`, `search_by_cpf()`, `search_by_process_number()`.
- Métodos não implementados para a fase atual lançam `NotImplementedError` explícito.
- Estratégia de autenticação vem de `src/shared/auth/` — adapter não implementa auth diretamente.
- Extração e normalização de dados via `src/shared/parser/` — adapter não parseia HTML inline.
- Adapter não conhece `client_id` — recebe apenas os dados necessários para executar.

## Saída Esperada

- Adapter isolado por portal com interface consistente.
- Testes de smoke por portal (ao menos happy path e falha de autenticação).
- Sem lógica de negócio no adapter — apenas navegação e extração.
