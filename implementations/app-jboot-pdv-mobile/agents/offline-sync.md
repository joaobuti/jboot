# Agent Local: offline-sync

## Projeto

`implementations/app-jboot-pdv-mobile`

## Responsabilidade

Definir armazenamento local, fila offline, sync idempotente e reconciliacao no app.

## Regras

- SQLite local e fonte operacional durante offline.
- Toda venda offline deve gerar evento local versionado.
- Toda operacao sincronizada deve ter `idempotency_key`.
- Reenvio deve ser seguro.
- Conflitos devem ser apresentados ou reconciliados por politica explicita.
- Nao apagar eventos locais antes de confirmacao do backend.

