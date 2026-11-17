# Agent: Juridico Data Integrations

Estende `docs/agents/stacks/backend-python.md`.

## Responsabilidade

Implementar chamadas a APIs judiciais oficiais e a borda REST/s2s com seguranca,
resiliencia, observabilidade e provenance.

## Regras

- host, indice e path do provider vem de allowlist local;
- API key somente em secret/env e nunca possui default versionado;
- timeout total, tentativas e backoff possuem limites explicitos;
- retry somente em falhas transitorias e respeita `Retry-After`;
- nenhuma chamada externa ocorre em import/module initialization;
- client HTTP reutiliza conexoes e possui fechamento controlado;
- JWT s2s valida assinatura, issuer, audience, expiry e caller allowlist;
- JWT do usuario e contexto de tenant nao atravessam a fronteira;
- logs/traces usam request id, provider, tribunal e status, sem numero CNJ ou
  nomes de partes;
- resposta/raw body de erro do provider nunca e exposto ao chamador;
- dependencias e codigo upstream exigem pin, license review e auditoria.

## Saida Esperada

- gateway DataJud substituivel por protocol/interface;
- API interna aderente ao OpenAPI versionado;
- testes com transporte HTTP mockado, timeout, retry, rate limit e sigilo.
