# Decision Records

Use um arquivo por decisao relevante.

Formato sugerido:

```text
# Decision: <titulo>

date:
status:
agents:
skills:
context:
decision:
rationale:
tradeoffs:
validation:
follow_up:
```

## Decisoes Registradas

- `2026-08-02-explicit-technical-follow-ups-deferred.md`: pendencias tecnicas e
  roadmaps explicitamente adiados por decisao humana.
- `../../../architecture/decisions/011-payments-service-go.md`: backend do
  servico independente de pagamentos confirmado em Go + PostgreSQL.
- `../../../architecture/decisions/012-infinitepay-pilot.md`: InfinitePay como
  primeiro provider, BYOA por tenant e Checkout Pix recomendado para a PoC.
- `2026-09-17-api-contract-graph.md`: grafo proprio de contratos HTTP (rota x
  consumidor) em vez de adotar o `code-review-graph`.
- `2026-10-06-architecture-graph-engineering.md`: Graph Engineering transversal,
  viewer local proprio e manutencao obrigatoria de nodes/edges em novas
  implementacoes; prevalece em conflitos de escopo com a decisao anterior.
- `2026-10-06-domain-integrations-priority.md`: `domain-integrations` como
  prioridade ativa, modulo embutido e fronteira de autorizacao/contexto entre
  produtos, com adapters por fluxo e recuperacao cross-database explicita.
