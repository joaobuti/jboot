# ADR 001 — Plataforma De Observabilidade

- status: accepted
- date: 2026-08-03
- approved_by: human

## Contexto

O JBoot terá produtos, clientes e estratégias de isolamento de banco diferentes.
Qualidade global exige telemetria consultável por produto, tenant, versão, serviço
e `database_ref`, sem acoplar os produtos a um fornecedor específico.

## Decisão

Adotar OpenTelemetry Collector como gateway e a stack Grafana LGTM:

- Mimir para métricas Prometheus multi-tenant;
- Tempo para traces;
- Loki para logs;
- Grafana para consulta, visualização e alertas;
- object storage para persistência dos sinais;
- PostgreSQL somente para o plano de controle do Grafana;
- MinIO somente no runtime local.

MongoDB e PostgreSQL são rejeitados como armazenamento de telemetria bruta.
MongoDB permanece disponível para domínios documentais, mas não participa do
runtime mínimo desta capability.

O desenvolvimento usa componentes monolíticos com as mesmas APIs e formatos dos
modos distribuídos. Isso não autoriza promover a topologia clássica local para
produção. Para Mimir, a arquitetura `ingest storage` com Kafka é o baseline
preferencial a avaliar no design produtivo. A produção será definida após escolha
de provedor e medição de ingestão, cardinalidade e retenção.

## Alternativas Rejeitadas

- Prometheus + Jaeger: menor complexidade inicial, mas pior fit para retenção
  longa, logs e multi-tenancy na escala pretendida;
- Elastic Observability: completa, porém mais cara e acoplada;
- SigNoz/ClickHouse: boa integração, mas concentra os sinais e adiciona uma
  dependência analítica não necessária;
- MongoDB time-series: exigiria pipeline, PromQL, rules, alertas, compactação e
  controles de cardinalidade próprios;
- banco relacional: inadequado para ingestão e consulta massiva dos três sinais.

## Consequências

- storage barato e desacoplado dos nós de consulta;
- evolução monolítica para distribuída sem alterar o contrato OTLP;
- operação de mais componentes especializados;
- necessidade de quotas, recording rules e governança de cardinalidade;
- necessidade de autenticação externa para os headers de tenancy em produção.

## Rollback

Aplicações continuam emitindo OTLP e podem trocar exporters sem alterar domínio.
Os backends podem ser substituídos gradualmente enquanto o Collector duplica ou
redireciona sinais. Buckets são independentes e não devem ser compartilhados.
