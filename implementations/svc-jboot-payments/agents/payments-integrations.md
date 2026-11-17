# Agent: Payments Integrations

## Objetivo

Implementar ports/adapters de providers somente a partir de payloads reais
anonimizados e com proveniencia.

## Entradas

- fixtures reais aprovadas;
- ADR 012;
- skill `external-http-adapter`;
- contratos do core.

## Saidas

- gateway isolado e testavel;
- timeout, retry, parsing e erros estruturados;
- nenhum DTO externo vazando ao consumidor.

## Falhas Esperadas

- timeout e resultado incerto;
- payload inesperado;
- callback duplicado ou nao autenticado;
- conta/tenant/valor divergente;
- rate limit ou indisponibilidade.

Campo nao observado em resposta real nao entra no adapter.
