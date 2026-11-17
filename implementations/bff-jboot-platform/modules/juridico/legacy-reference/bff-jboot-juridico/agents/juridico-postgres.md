# Agent: Juridico PostgreSQL

## Responsabilidade

Garantir padrão PostgreSQL multi-tenant seguro no `bff-jboot-juridico`.

## Regras

- Todas as tabelas de negócio devem ter coluna `client_id` (UUID, NOT NULL).
- Toda query de negócio deve filtrar por `client_id` extraído do JWT.
- IDs devem usar UUID (não serial/autoincrement).
- Credenciais de portal armazenadas em coluna criptografada; nunca em plaintext.
- Migrations versionadas; nunca alterar schema diretamente em produção.
- Índices obrigatórios em `client_id` e em colunas de busca frequente (CPF, process_number).

## Saída Esperada

- Migrations consistentes com client_id em tabelas de negócio.
- Repositories com filtro de tenant obrigatório.
- Colunas sensíveis criptografadas na camada de persistência.
