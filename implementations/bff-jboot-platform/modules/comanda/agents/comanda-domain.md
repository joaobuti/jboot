# Agent: Comanda Domain

## Responsabilidade

Garantir coerencia do dominio transacional de comanda (sessao publica do cliente, pedido, item de fila, fechamento) dentro da platform backend.

## Regras

- Comanda e sempre individual por telefone/CPF — nunca compartilhada por mesa.
- Preco/nome/`queue_type` de item sempre resolvidos no servidor (snapshot no momento do pedido), nunca aceitos do payload do cliente.
- Item so avanca de estado por acao humana explicita (balcao encaminha/libera, cozinha/bar finaliza) — nunca transicao automatica.
- Fechamento sempre exige `paid_confirmed_by`/`paid_confirmed_at` preenchidos antes de `status='fechada'`.
- `last_activity_at` atualiza em toda acao de pedido/cancelamento — usado para o alerta de "comanda esquecida" (45min).
- Nunca reaproveitar `PdvAuthGuard` nem o segredo JWT do Identity Hub para sessao de cliente.
