# Security Checklist — Sprint 3

- [x] SQL parametrizado e filtrado por `client_id`/`database_ref`.
- [x] Simulação usa `juridico:write`; catálogo e overrides usam `juridico:admin`.
- [x] DTOs explícitos; `client_id` não é recebido do cliente.
- [x] Nenhum processo, parte, token ou segredo é persistido no cálculo.
- [x] URL de provenance exige HTTPS e é apenas metadado, sem fetch arbitrário.
- [x] Override preserva histórico e exige justificativa.
- [x] Resultado explicita confirmação humana obrigatória.

Resultado: sem pendências bloqueantes para o escopo assistivo.
