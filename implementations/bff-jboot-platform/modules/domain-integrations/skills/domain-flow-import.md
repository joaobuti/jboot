# Skill: domain-flow-import

## Objetivo

Implementar importacoes de dados de dominios do Hub para cards do Flow.

## Procedimento

1. Identificar origem, destino e contrato versionado da sprint.
2. Validar contexto autenticado e `client_id` sem aceitar sobrescrita por
   payload.
3. Validar que o cliente possui Flow contratado.
4. Validar acesso ao registro de origem.
5. Validar acesso ao board destino.
6. Resolver a coluna padrao do board no backend.
7. Transformar origem em titulo, descricao e referencia estruturada.
8. Criar ou recuperar card de forma idempotente.
9. Retornar identificadores e URL navegavel do card.
10. Cobrir comportamento com teste automatizado.

## Bloqueios

- Sem coluna padrao recuperavel no board.
- Sem teste de cliente sem Flow contratado.
- Sem referencia externa estruturada no card.
- Sem contrato OpenAPI atualizado.
