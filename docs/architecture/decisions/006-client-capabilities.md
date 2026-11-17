# ADR 006: Client Capabilities — Distinção entre Application e Capability

```
date: 2026-06-23
status: accepted
```

## Contexto

A plataforma JBoot expõe dois tipos de entidades contratáveis por cliente:

1. **Applications** — produtos com UI própria que aparecem no seletor pós-login (ex: PDV, Jurídico, Administrativo). Gerenciados por `jb_client_applications` + `jb_entitlements` no Identity Hub.
2. **Serviços internos s2s** — APIs consumidas por BFFs, sem UI própria e sem acesso direto por usuários finais (ex: svc-jboot-fiscal, svc-jboot-boleto, svc-jboot-tributacao).

O modelo anterior tratava todos os serviços como applications Identity, o que gerava entitlements de usuário desnecessários, aparição indevida no seletor pós-login e acoplamento conceitual errado: um serviço s2s não é uma aplicação que o usuário "acessa" — é uma capacidade que o cliente "contrata".

## Decisão

### Separação conceitual

| Tipo | Identity model | Aparece no seletor | Tem entitlement de usuário |
|---|---|---|---|
| Application (com UI) | `jb_client_applications` + `jb_entitlements` | Sim | Sim |
| Capability (s2s, sem UI) | `capability_registry` + `client_capabilities` | Não | Não |

### Nomenclatura de slugs de capability

O slug deve ser o nome funcional do serviço sem prefixo organizacional:
- Correto: `fiscal`, `boleto`, `tributacao`
- Errado: `svc-fiscal`, `jboot-fiscal`, `svc-jboot-fiscal`

Sub-slugs por feature interna (`fiscal:nfce`, `fiscal:nfe`) são proibidos na fundação. Sub-slugs só são criados quando houver contratos comerciais distintos por feature — essa decisão parte do negócio, não da arquitetura.

### Schema

```sql
-- capability_registry: catálogo global de capacidades disponíveis na plataforma
-- Banco: jboot_identity
CREATE TABLE capability_registry (
  slug          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  service_name  TEXT NOT NULL,   -- nome do container/serviço que implementa a capability
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- client_capabilities: quais capacidades estão habilitadas por cliente
-- Banco: jboot_identity
CREATE TABLE client_capabilities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES jb_clients(id),
  capability    TEXT NOT NULL REFERENCES capability_registry(slug),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  enabled_by    UUID REFERENCES jb_users(id),
  enabled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, capability)
);
```

### Ciclo de vida de uma capability

1. O serviço faz `INSERT INTO capability_registry` via seed SQL no bootstrap do banco.
2. O operador habilita a capability para um cliente via toggle na UI do identity-admin (Sprint futura) ou seed de dev.
3. O BFF que precisa consumir o serviço valida `client_capabilities.enabled = true` antes de chamar o serviço s2s.
4. O serviço s2s NÃO valida capabilities — ele confia no JWT s2s emitido pelo BFF autorizado.

## Racional

- Um serviço s2s não é uma aplicação que o usuário "seleciona" — é uma capacidade que o contrato do cliente habilita ou não.
- Entitlements de usuário para serviços s2s criavam permissões sem semântica de produto, poluindo o modelo de autorização.
- `capability_registry` centraliza o catálogo de serviços disponíveis; `client_capabilities` representa o contrato comercial por cliente.
- A separação permite que novos serviços s2s se registrem sem alterar o modelo de applications ou o seletor pós-login.

## Decisões futuras

- UI de toggles de capabilities no identity-admin (próxima sprint do identity-admin).
- Endpoint `GET /capabilities` no BFF Identity para que BFFs verifiquem capabilities antes de chamar serviços s2s.
- Integração do BFF PDV com a flag `fiscal` em `client_capabilities` antes de chamar svc-jboot-fiscal.
- Auditoria de quem habilitou/desabilitou uma capability (`enabled_by`, `enabled_at` já previstos no schema).
