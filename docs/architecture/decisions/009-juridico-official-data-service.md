# ADR 009: Servico De Dados Juridicos Oficiais

```yaml
date: 2026-08-27
status: accepted
project: implementations/svc-jboot-juridico-data
decision_owner: human
```

## Contexto

O modulo Juridico precisa consultar processos e movimentacoes na API publica
DataJud/CNJ. O repositorio externo `DeHor-Labs/mcp-juridico-brasil` ja possui
client HTTP, providers, schemas Pydantic, validadores de numero CNJ e testes que
podem reduzir retrabalho.

O frontend Platform nao pode consumir esse projeto diretamente: as operacoes
publicadas sao tools MCP, nao endpoints REST de produto, e o upstream nao possui
o contexto JBoot de Identity, scopes, tenant, `database_ref` ou auditoria.

## Stack Fit Gate

| Alternativa | Vantagens | Riscos/custos | Decisao |
|---|---|---|---|
| Incorporar no `wrk-jboot-juridico` | Menor custo operacional | Mistura APIs oficiais sincronas com scraping/Playwright e amplia uma fronteira que ja possui excecoes | Rejeitada como desenho principal |
| Executar o MCP upstream e fazer o BFF falar MCP | Maior reuso literal | Protocolo inadequado para UI deterministica, sessao MCP, auth e tenancy ausentes | Rejeitada |
| Portar para NestJS no BFF | Um runtime a menos | Reescrita dos componentes Python e acoplamento da integracao ao modular monolith | Rejeitada |
| Servico interno Python/FastAPI baseado no upstream | Alto reuso, REST tipado, deploy e observabilidade isolados | Um processo adicional e adaptacao de seguranca/proveniencia | Escolhida |

## Decisao

Criar `implementations/svc-jboot-juridico-data`, servico interno e stateless
para APIs judiciais oficiais e calculos juridicos deterministas.

Fluxo da Sprint 1:

```text
app-jboot-next-platform/modules/juridico
  -> bff-jboot-platform/modules/juridico
    -> svc-jboot-juridico-data
      -> DataJud/CNJ
```

Regras de fronteira:

- o frontend nunca chama o servico diretamente;
- o BFF valida JWT do usuario, `juridico:read`, tenant e `database_ref`;
- o servico valida JWT s2s com audience propria e nao recebe JWT do usuario;
- o BFF registra auditoria no banco juridico dedicado do tenant;
- o servico nao persiste dados processuais na Sprint 1;
- MCP nao e interface de produto e fica fora da Sprint 1;
- Playwright, sessoes de portal e Temporal continuam no `wrk-jboot-juridico`;
- confirmacao de leitura de intimacao ou outra mutacao com efeito juridico fica
  proibida ate decisao e gate especificos.

## Stack

- Python 3.12+;
- FastAPI + Uvicorn para REST interno;
- Pydantic v2 para contratos;
- HTTPX para DataJud;
- Tenacity para retry controlado;
- Structlog e OpenTelemetry para diagnostico;
- sem banco, cache distribuido ou Temporal na Sprint 1.

## Proveniencia Upstream

- repositorio: `https://github.com/DeHor-Labs/mcp-juridico-brasil`;
- licenca: MIT;
- baseline aprovada: tag `v0.1.0`;
- commit fixado: `dcc1e4dfa0534809958eec05ad094be415ff2ce1`;
- estrategia: clone temporario para auditoria e port seletivo; nenhum nested Git,
  subtree ou dependencia flutuante em `main`;
- cada arquivo derivado deve registrar origem e preservar os avisos exigidos
  pela MIT.

## Consequencias

- o target Juridico passa a depender do processo `juridico-data-service` para a
  rota `/juridico/consultas/processo`;
- a porta local reservada e `8030`;
- o servico e capability interna `juridico-data`, nao `application` Identity;
- a capability deve entrar em `capability_registry`, sem entitlement de usuario;
- migracao de PJe/DJEN do worker para este servico e candidata futura, nao parte
  da Sprint 1.

## Riscos

- DataJud pode ter defasagem de horas ou dias: a UI deve exibir fonte, captura e
  ultima atualizacao reportada;
- o upstream e pre-alpha: nenhum codigo e confiado sem review, testes locais e
  auditoria de dependencias;
- numero processual e nomes de partes sao dados pessoais/contextuais: nao entram
  em logs, traces ou attestation;
- ausencia de tenant no servico reduz superficie de vazamento, mas torna o BFF
  responsavel por toda persistencia e auditoria.
