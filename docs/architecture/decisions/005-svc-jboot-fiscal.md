# ADR 005: svc-jboot-fiscal

```
date: 2026-06-23
status: accepted
project: implementations/svc-jboot-fiscal
sprint_scope: Sprint 1 (NFC-e + NF-e)
```

## Contexto

A plataforma JBoot necessita emitir documentos fiscais eletrônicos (NFC-e, NF-e e futuramente NFS-e)
em nome de múltiplos clientes (multi-tenant). O serviço não pode ter custo por emissão (descartado SaaS),
deve suportar múltiplos tipos de nota e ser consumível por qualquer módulo da plataforma.

## Decisões e racionais

### Stack: PHP 8.3 + Laravel 13 + nfephp-org/sped-nfe

`nfephp-org/sped-nfe` é a biblioteca PHP mais madura e mantida para emissão de NF-e/NFC-e no Brasil
(NF-e 4.00, comunicação SOAP com webservices SEFAZ, assinatura XML via xmlseclibs).
Alternativas em Node/Go/Java para o ecossistema fiscal brasileiro são menos maduras e teriam custo
maior de manutenção regulatória. PHP como stack principal elimina a camada de tradução entre
linguagens (sem NestJS wrapper).

Libs Sprint 1: `sped-nfe` (NF-e/NFC-e), `sped-da` (DANFE em PDF), `sped-gtin` (validação GTIN).
Sprint 2 adiciona `sped-nfse` para NFS-e (alta complexidade municipal — decisão de provider/abordagem pendente).

### Container: PHP-FPM + Nginx (não Laravel Octane)

Octane (Swoole/RoadRunner) mantém workers persistentes com estado entre requests. Certificados PFX
descriptografados em memória num worker Octane poderiam vazar entre requests de tenants diferentes
se o código não tiver limpeza de estado perfeita. PHP-FPM isola cada request em processo separado —
o PFX existe apenas no stack daquele processo e é descartado no fim. O custo (cold-start por request)
é aceitável para um serviço de emissão, que não é endpoint de alta frequência por natureza.

### Certificados A1: bytea AES-256-GCM no PostgreSQL

Uma chave mestra do serviço (`FISCAL_CERT_ENCRYPTION_KEY`) criptografa todos os .pfx dos clientes
em repouso. Cada row em `fiscal_certificates` tem IV e tag únicos (AES-GCM). A chave mestra não é
por cliente — é do serviço, gerida pela infra. HashiCorp Vault foi descartado para Sprint 1 por
adicionar infraestrutura operacional sem ganho proporcional em ambiente de desenvolvimento; deve ser
reavaliado antes do primeiro go-live em produção.

### Numeração atômica: UPDATE ... RETURNING

`UPDATE fiscal_document_sequences SET ultimo_numero = ultimo_numero + 1 RETURNING ultimo_numero`
é atômico em uma operação. `SELECT FOR UPDATE` exigiria duas roundtrips com janela de race condition
entre elas. Advisory Lock do PostgreSQL foi descartado por complexidade de gerenciamento de liberação.

### DB::transaction() envolve chamada SEFAZ

A transação de banco cobre: reserva de número → INSERT pending → transmissão SEFAZ → UPDATE status →
evento de auditoria. Se o UPDATE pós-autorização falhar, o rollback desfaz a reserva de número também,
evitando o estado pior: documento autorizado na SEFAZ sem registro local. Tradeoff: conexão de banco
fica aberta durante a chamada SEFAZ (até ~30s em degradação). Mitigado com `statement_timeout=35s` e
timeout por tentativa de 10s (não 30s total por tentativa). Sprint 2 deve avaliar arquitetura de duas
fases se o volume de contingências simultâneas for alto.

### Listener de auditoria síncrono (não ShouldQueue)

Auditoria fiscal é obrigação legal (5 anos). Perder um evento de auditoria em falha de fila é
inaceitável. O Listener é síncrono e faz INSERT dentro da mesma transação do domínio — se a auditoria
falhar, a transação toda reverte. Sprint 1 sem broker externo (sem Redis, sem RabbitMQ).

### Contingência: Laravel Scheduler a cada 5min (sem fila externa)

Sprint 1 não tem broker externo por decisão de simplificação de infra. Contingência SEFAZ
tipicamente dura minutos a horas — reenvio a cada 5 minutos é suficiente para o SLA esperado.
Sprint 2 deve avaliar Laravel Horizon + Redis se o volume simultâneo de documentos em contingência
for alto.

### Auth s2s: JWT via Identity Hub JWKS (firebase/php-jwt)

`firebase/php-jwt` para validação com JWKS remoto. `lcobucci/jwt` é melhor para emissão; como este
serviço apenas valida JWTs (nunca emite), `firebase/php-jwt` é mais simples. JWKS cacheado por 5min.

### Isolamento de tenant: duas camadas

1. Middleware `InjectClientContext` extrai `client_id` do JWT e injeta no Request.
2. Service layer valida `body.client_id === jwt.client_id` antes de qualquer query — toda query
   filtra por `client_id` do JWT, nunca do body.

## Estrutura de diretórios

```
implementations/svc-jboot-fiscal/
  app/
    Http/
      Controllers/
        EmissaoController.php
        DocumentoController.php
        NumeracaoController.php
        HealthController.php
      Middleware/
        ValidateServiceJwt.php
        InjectClientContext.php
  Domain/
    Fiscal/
      Services/
        EmissaoService.php
        CancelamentoService.php
        InutilizacaoService.php
        CceService.php
      Repositories/
        FiscalDocumentRepository.php
        FiscalCertificateRepository.php
        FiscalSequenceRepository.php
      Events/
        DocumentoAutorizado.php
        DocumentoRejeitado.php
        ContingenciaAtivada.php
        DocumentoCancelado.php
        DocumentoInutilizado.php
      Listeners/
        RegistrarEventoAuditoria.php
  Infrastructure/
    Sefaz/
      SefazGateway.php
      ContingenciaManager.php
    Crypto/
      CertificateCrypto.php
    Http/
      Requests/
        EmissaoNfceRequest.php
        EmissaoNfeRequest.php
        CancelamentoRequest.php
        InutilizacaoRequest.php
        CceRequest.php
  config/
    fiscal.php
  routes/
    api.php
  database/
    migrations/
    seeders/
  tools/
    encrypt-pfx.php
```

## Ciclo de vida de um documento fiscal

```
PENDING → [SefazGateway.transmitir()] → AUTHORIZED
                                       → REJECTED
                                       → CONTINGENCY → [Scheduler retry] → AUTHORIZED
AUTHORIZED → [cancelamento] → CANCELLED
AUTHORIZED → [cce NF-e only] → (sem mudança de status; evento gravado)
```

`DENEGADA` é mapeada do código SEFAZ (110, 301, 302) pelo `SefazGateway`.
Documento denegado não pode ser cancelado ou inutilizado.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Transação aberta durante SEFAZ (até 30s) | statement_timeout=35s; timeout por tentativa 10s |
| PFX descriptografado em stack trace | Handler de exceção sanitiza namespace Domain\Fiscal; LOG_LEVEL=warning em produção |
| Lacuna de numeração por falha de INSERT | UPDATE e INSERT na mesma DB::transaction(); assert(transactionLevel > 0) em nextNumber() |

## Decisões futuras pendentes

- `svc-jboot-tributacao`: se a complexidade de cálculo tributário (ICMS por regime, PIS/COFINS,
  substituição tributária) justificar, um serviço dedicado pode ser introduzido para calcular e
  repassar valores ao fiscal. Não implementar agora — o fiscal recebe impostos pré-calculados.
- NFS-e (Sprint 2): alta variabilidade municipal exige decisão de abordagem (integração direta por
  prefeitura vs provider agregador) antes da implementação.
- Rotação da chave `FISCAL_CERT_ENCRYPTION_KEY`: exige campo `encryption_key_version` e script de
  re-encriptação em lote. TBD pós Sprint 1.
- Estratégia de archival de `fiscal_document_events` após 5 anos: partição por ano vs tabela de
  arquivo. TBD antes do go-live em produção.
