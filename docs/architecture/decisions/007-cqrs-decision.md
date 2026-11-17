# ADR 007 — CQRS: Decisão de Adiamento e Estratégia Futura

**Status**: Adiado — PostgreSQL only até evidência de carga  
**Data**: 2026-06-26  
**Decisão**: Manter PostgreSQL como única fonte de leitura e escrita em todos os módulos. CQRS não será implementado até que métricas de produção justifiquem a promoção.

---

## Contexto

JBoot opera como Modular Monolith multi-tenant com dois modelos de isolamento:

- **Shared DB**: múltiplos clientes no mesmo banco, particionados por `client_id`
- **Dedicated DB**: banco exclusivo por cliente (ex: fiscal)

Cada módulo tem perfil de carga desconhecido até que clientes reais o utilizem. Pré-projetar infraestrutura de leitura separada antes dessa evidência viola YAGNI e adiciona custo operacional sem retorno comprovado.

---

## Decisão

**PostgreSQL é a única fonte de leitura e escrita por padrão em todos os módulos.**

Separação estrutural de Command/Query (Tier 1 — separação em `CommandService` / `QueryService` no código) é adotada como padrão de organização, sem custo de infraestrutura.

Promoção para infraestrutura de leitura separada (Tier 2+) exige evidência de carga medida via OpenTelemetry.

---

## Espectro CQRS e Critérios de Promoção

| Tier | O que muda | Custo infra | Critério de ativação |
|---|---|---|---|
| **1 — Separação estrutural** | `CommandService` / `QueryService` distintos. Mesmo banco. | Zero | Padrão obrigatório em todos os módulos |
| **2 — Query otimizada** | Views materializadas ou read replica. Mesmo cluster. | Baixo | p95 leitura > 200 ms por 2 semanas em produção |
| **3 — Read store separado** | MongoDB como read store via svc de projeção. | Alto | Read:write ratio > 10:1 **e** Tier 2 não absorveu latência |
| **4 — Event Sourcing full** | Eventos como fonte de verdade. Projeções reconstruíveis. | Muito alto | Requisito de auditoria imutável ou replay de estado — decisão de negócio, não de carga |

---

## Arquitetura Proposta para Tier 3 (quando necessário)

### svc-jboot-projections

Serviço interno s2s. Não é application Identity — registrado em `capability_registry` com slug `projections`.

**Responsabilidade**: replicar dados do PostgreSQL para MongoDB como read store desnormalizado, particionado por `client_id + application_slug`.

**Fluxo de ativação por módulo:**

1. Módulo declara **contrato de projeção**: shape do documento MongoDB, tabelas de origem, regras de mapeamento (não cópia 1:1 de linhas — desnormalização obrigatória para eliminar JOINs em leitura).
2. svc-jboot-projections recebe eventos de mudança via CDC (PostgreSQL logical replication / LISTEN-NOTIFY ou Debezium) e mantém o read store atualizado.
3. Módulo migra queries de leitura pesadas para MongoDB com **fallback explícito para PostgreSQL** protegido por circuit breaker — não fallback transparente.
4. Lag de sincronização exposto como métrica OTel (`projections.lag_ms` por `application_slug + client_id`).

**Restrições obrigatórias:**

- Consistência eventual declarada: queries que não toleram lag (saldo financeiro, status em tempo real) permanecem no PostgreSQL.
- Projeção por módulo define o shape do documento — sem copiar schema relacional diretamente.
- Fallback para PostgreSQL usa circuit breaker (não pode receber thundering herd se MongoDB cair sob carga).
- Ativação por módulo é opt-in via configuração — nunca automática.

---

## Riscos Registrados

| Risco | Mitigação |
|---|---|
| Consistência eventual não declarada ao consumidor | Contrato de projeção documenta quais queries toleram lag |
| Schema migration não refletida na projeção | svc-jboot-projections recebe notificação de migration antes de aplicar em produção |
| Thundering herd no fallback | Circuit breaker obrigatório no cliente do MongoDB |
| Projeção como cópia relacional (sem ganho real) | Contrato de projeção exige desnormalização antes de aprovação |

---

## Consequências

- Nenhuma mudança de infraestrutura imediata.
- Todos os módulos atuais e futuros nascem em Tier 1 (separação estrutural no código).
- Promoção para Tier 2+ exige proposta técnica com métricas OTel de produção + aprovação via ADR específico do módulo.
- Quando Tier 3 for necessário, o fluxo PO → PE → Architect → confirmação humana é obrigatório antes de criar o contrato de svc-jboot-projections.
