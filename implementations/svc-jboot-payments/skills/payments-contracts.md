# Skill: Payments Contracts

## Objetivo

Preservar contratos provider-neutral e invariantes financeiros.

## Regras

1. Dinheiro e inteiro em minor units; nunca float.
2. Tenant vem do contexto autenticado, nunca do body.
3. Toda nova cobranca exige idempotency key.
4. Mesmo payload retorna a cobranca existente; payload divergente retorna 409.
5. Callback nao confirma `received`.
6. `received` exige verificacao positiva, integral e correlacionada.
7. Estado e outbox mudam na mesma transacao.
8. DTO de provider fica no adapter.

## Validacao

- testes de idempotencia e concorrencia;
- testes de tenant isolation;
- testes da maquina de estados;
- contract test do OpenAPI.
