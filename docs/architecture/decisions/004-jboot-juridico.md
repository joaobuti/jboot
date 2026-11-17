# ADR 004: JBoot Juridico — Automação de Portais Jurídicos

## Status

Aceita. Confirmada pelo usuário em 2026-06-09.

## Contexto

Produto SaaS multi-tenant para escritórios de direito.

Funcionalidades centrais:
- Fase 1: consulta de processos por CPF em portais jurídicos (Projudi, ESAJ, EPROC e outros).
- Fase 2: acompanhamento de andamento por número de processo com polling configurável.
- Portais modulares com controle de acesso por contrato de tenant.
- Portais com autenticação simples, token ou 2FA.
- Clientes configuram intervalo de polling: diário, semanal, quinzenal, mensal.

## Decisão

```text
bff-jboot-platform/modules/juridico
  -> API NestJS/TypeScript: banco dedicado por cliente, portal registry,
     credential management, scheduling config, integração com Temporal

wrk-jboot-juridico
  -> Workers Python + Playwright: scrapers por portal, integração Temporal,
     execução de consultas por CPF e por número de processo

app-jboot-next-platform/modules/juridico
  -> Frontend Next.js dentro da Platform: painel do cliente, menu de portais contratados,
     consulta, acompanhamento, configuração de credenciais e agendamento
```

## Stack

| Componente | Tecnologia |
|---|---|
| API | NestJS / TypeScript / Node.js |
| Workers | Python + Playwright |
| Orquestração | Temporal |
| Banco | PostgreSQL dedicado por cliente, com `client_id` em todas tabelas de negócio |
| Cache / Fila | Redis / Valkey |
| Frontend | Next.js / TypeScript (preset app-jboot-identity-admin) |
| Auth | Consome JWT do bff-jboot-identity |
| Credenciais portais | Colunas criptografadas por tenant (fase 1, sem vault externo) |

## Regras

- `bff-jboot-platform/modules/juridico` consome JWT do `bff-jboot-identity`; não autentica diretamente.
- Cada cliente do Juridico possui banco fisico dedicado; `database_ref` deve apontar para o banco autorizado.
- Credenciais de portal são criptografadas por tenant; nunca trafegam em log.
- Workers recebem credenciais do BFF via payload seguro; não acessam banco diretamente.
- Portal registry define quais portais existem; contratos de tenant definem quais estão ativos.
- Cada portal é um adapter independente em `wrk-jboot-juridico`.
- Temporal gerencia scheduling, retry e visibilidade de workflows.
- Todas as tabelas de negócio têm `client_id` (UUID).

## Riscos

- Portais jurídicos podem alterar layout/anti-bot sem aviso — adapters devem ser isolados.
- 2FA exige estratégia de sessão persistente ou TOTP; definir por portal na sprint correspondente.
- Credenciais de portal são dado sensível — criptografia e auditoria obrigatórias desde sprint 1.
- Mudança de IP pode invalidar sessões em alguns portais — avaliar IP fixo ou proxy na sprint de hardening.

## Consequências

- Juridico web/backend roda como modulo da Platform; workers continuam runtime separado.
- Workers Python exigem runtime separado (container dedicado).
- Temporal requer cluster próprio ou serviço gerenciado.
- Novos portais são adicionados apenas como adapters em `wrk-jboot-juridico` sem alterar BFF.
