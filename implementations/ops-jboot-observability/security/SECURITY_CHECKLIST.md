# Security Checklist — ops-jboot-observability

- review_date: 2026-08-03
- scope: foundation/local runtime
- result: passed_for_functional_foundation
- production_authorization: denied_until_sprint_4_gates

## 1. Injection

- [x] Não há query construída com input de usuário; o projeto não implementa
  endpoint de domínio nem acesso SQL customizado.
- [x] PostgreSQL é acessado somente pelo Grafana via driver próprio.
- [x] Scripts não executam input remoto. Caminhos e argumentos são quotados, e
  credenciais são consumidas como variáveis de ambiente.

## 2. Access Control

- [x] Tenancy local é estática (`jboot-local`) e aplicada no gateway; não é
  derivada de header fornecido pelo emissor.
- [x] Grafana exige autenticação, não permite signup nem acesso anônimo.
- [x] Mimir, Tempo, Loki, MinIO e OTLP não são publicados em `0.0.0.0`.
- [x] N/A DTO/ownership: não há API de domínio. Em produção, autenticação de
  workload, autorização e derivação confiável de tenant são gates bloqueantes.

## 3. Dados Sensiveis

- [x] O Collector remove atributos de CPF/CNPJ, authorization/cookie, tokens,
  senhas, bodies, `db.statement` e prompts/completions GenAI antes do storage.
- [x] Não há credencial real versionada; `.env.example` contém placeholders.
- [x] N/A hashing de senha: o projeto não armazena identidades; o hash do usuário
  Grafana é responsabilidade do próprio Grafana no PostgreSQL.

## 4. Mass Assignment

- [x] N/A: não há bind de requests a entidade ou endpoint de aplicação.

## 5. Rate Limiting E Paginação

- [x] N/A no runtime local restrito. Quotas de ingestão, limites de cardinalidade,
  query fairness e rate limiting são gates explícitos do design produtivo.

## 6. SSRF

- [x] Destinos HTTP/S3 são internos e declarados em configuração; nenhum emissor
  controla URLs de exporters ou storage.

## 7. Dependências

- [x] Imagens são fixadas e auditadas com Trivy `0.70.0`, sinais `CRITICAL`, com e
  sem `--ignore-unfixed`, em 2026-08-03.
- [x] Sem findings críticos: Mimir 3.0.6, Tempo 2.10.5, Loki 3.7.2, OTel Collector
  0.157.0 e telemetrygen 0.157.0.
- [x] PostgreSQL foi atualizado para `18.4-alpine3.24`, eliminando findings do SO.
  Exceção: CVE-2025-68121 está no binário auxiliar `gosu`; seu caminho vulnerável
  exige cliente TLS com session resumption, enquanto `gosu` apenas troca usuário
  localmente antes de iniciar PostgreSQL. Não é alcançável por tráfego de rede.
- [x] MinIO é exclusivamente local, single-node, loopback/bridge restrita, sem
  OIDC, LDAP, STS ou TLS e com dados sintéticos. Assim, CVE-2026-33322 (OIDC),
  CVE-2026-33419 (LDAP), CVE-2026-33186 (`grpc/authz`) e CVE-2025-68121 (TLS
  resumption) não têm caminho habilitado. MinIO é expressamente proibido em
  produção; produção usa object storage gerenciado.
- [x] Grafana 13.1.0 inclui `kin-openapi` afetado por GHSA-r277-6w6q-xmqw, cujo
  exploit exige usar `openapi3filter.ValidationHandler` como middleware de
  autenticação sem `AuthenticationFunc`. O Grafana não delega sua autenticação a
  esse handler; signup/anônimo estão desabilitados. Manter monitoramento até a
  imagem oficial incorporar `kin-openapi >= 0.144.0`.

## 8. Stack-Specific

- [x] Comunicação externa não existe nesta fundação local. Produção sem TLS/mTLS,
  identidade de workload e reverse proxy autenticador não pode ser promovida.
- [x] N/A frontend/mobile/desktop: apenas UI oficial do Grafana, com autenticação
  server-side e sem customização de token no browser.

## 9. Agentes De Engenharia E GenAI

- [x] Conteúdo de web, logs, repositório e tool output foi tratado como dado.
- [x] Hierarquia canônica e decisões humanas foram preservadas.
- [x] Operações seguiram a matriz: T0/T1 implícitos e pulls/scans Docker T2 sob a
  autorização explícita do usuário para implementar e prosseguir.
- [x] Nenhuma ação destrutiva externa, deploy, push ou execução de output de modelo.
- [x] Agents e skills usados têm origem versionada no repositório.
- [x] Attestation deve conter somente comandos e evidências reais, sem secrets/PII.

## Decisão

Não há item aberto para merge da fundação funcional. As exceções acima são de
alcançabilidade documentada e não autorizam produção. Qualquer exposição além de
host/bridge local, habilitação de Identity no MinIO ou topologia produtiva reabre
obrigatoriamente esta revisão.
