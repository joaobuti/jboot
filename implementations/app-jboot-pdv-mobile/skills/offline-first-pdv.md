# Skill Local: offline-first-pdv

## Uso

Aplicar em fluxos offline-first do app PDV.

## Regras

- Venda offline e requisito central, nao fallback.
- Persistir carrinho, venda, pagamentos e eventos antes de considerar operacao concluida.
- Sincronizar em background quando possivel.
- Mostrar status de pendencia/sync/conflito.
- Reprocessamento deve ser idempotente.

