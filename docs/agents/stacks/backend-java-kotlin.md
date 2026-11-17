# Stack Agent: Backend Java/Kotlin

## Responsabilidade

Servicos enterprise, APIs robustas, workloads de alta confiabilidade e dominios com contratos fortes no ecossistema JVM.

## Stacks

| Stack | Usar quando |
|---|---|
| Java 25 + Spring Boot 4 | Enterprise, observabilidade, seguranca, transacoes, integracoes corporativas |
| Kotlin + Spring Boot 4 | Concisao, null-safety, interoperabilidade JVM |
| Kotlin + Ktor | APIs enxutas com menor peso de framework |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: metodo publico > 20 linhas ou 3+ niveis → decompor em metodos privados ou classes auxiliares antes de merge.
- **OCP**: extensao via interfaces e injecao de dependencia, nao via modificacao de classe central.
- **DIP**: service depende de interface, nao de implementacao concreta de repository ou adapter.

### Modular Monolith (Grzybek, 2019; Newman, Monolith to Microservices 2019; Spring Modulith 2023)
- Deploy unitario com fronteiras de modulo verificaveis. Cada modulo corresponde a um Bounded Context (DDD — Evans, 2003).
- Spring Modulith: `@ApplicationModule` verifica violacoes de fronteira automaticamente em tempo de teste.
- Nenhum modulo acessa Entity, Repository ou classe interna de outro modulo diretamente.
- Comunicacao entre modulos via `ApplicationEventPublisher` (evento) ou servico publico exportado.
- Cada modulo e extraivel para microsservico independente sem reescrita de dominio.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Controller → Service → Repository`. Dependencia sempre de fora para dentro.
- Controller: recebe HTTP, delega, retorna DTO. Sem SQL, sem regra de negocio.
- Service: regra de negocio, validacao de invariante, orquestracao. Sem SQL direto.
- Repository/DAO: persistencia, queries. Sem logica de dominio.
- DTO/Request: validacao de contrato de entrada. Service nao lanca excecao por dado rejeitavel na borda.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Chamadas a sistema externo (HTTP, fila, storage) em classe dedicada: sufixo `Gateway`, `Adapter` ou `Client`.
- Porta de entrada: DTO validado. Porta de saida: interface tipada do adapter.
- Dominio nao importa detalhes de HTTP client, headers ou formato externo.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002; Richardson, Microservices Patterns 2018)
- **Gateway Pattern** (Fowler): `buildPayload`, `call`, `parseResponse` em metodos privados separados. Timeout e retry declarados por chamada.
- **Repository Pattern** (Fowler): persistencia atras de interface. Service nao constroi query SQL.
- **Data Mapper Pattern** (Fowler): ORM/query result → domain object na camada de repository.
- **Circuit Breaker / Retry** (Nygard, Release It! 2nd ed. 2018): politica de resiliencia declarada por chamada externa. Sem dependencia de timeout default.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois metodos da mesma classe → extrair helper privado ou componente compartilhado antes de continuar.
- > 30% de sobreposicao entre dois metodos publicos → extrair metodo compartilhado.

### Observabilidade (OpenTelemetry — CNCF, 2021)
- Traces, metricas e logs via SDK OpenTelemetry. Sem vendor lock-in — exportar para Jaeger, Prometheus, OTLP.
- Span em toda chamada externa: atributos `http.method`, `http.url`, `db.statement` (sem dados sensiveis), flag `error`.
- Logs estruturados em JSON: campos `level`, `timestamp`, `trace_id`, `span_id`, `message`. Sem string concatenation.
- Metricas de negocio como instrumentos OTel (Counter, Histogram). Nao usar logs de texto como substituto de metrica.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Metodo publico > 20 linhas → candidato obrigatorio a revisao de SRP.
- Cognitive Complexity > 15 → decompor (SonarQube default).
- Aninhamento > 3 niveis → extrair metodo auxiliar.

## Segurança Obrigatória

### OWASP Top 10 (2021) + OWASP API Security Top 10 (2023)
- **Injection (A03)**: Queries sempre parametrizadas via JPA/Hibernate ou named parameters. Sem string concatenation com input de usuario em JPQL ou SQL nativo.
- **Broken Access Control (A01 / API1:2023)**: `@PreAuthorize` ou verificacao explicita de ownership por tenant/usuario. Sem confiar apenas no filtro do Spring Security sem verificacao de ownership do recurso.
- **Broken Object Property Level (API3:2023)**: DTO de saida explicito por endpoint — sem retornar entidade JPA diretamente. `@JsonIgnore` em campos sensiveis.
- **Mass Assignment**: `@RequestBody` sempre mapeado para DTO — nunca diretamente para entidade JPA.
- **Cryptographic Failures (A02)**: Senhas → `BCryptPasswordEncoder`. Sem MD5/SHA1. `SecureRandom` para geracao de tokens. Segredos via variavel de ambiente ou Vault.
- **Dados sensiveis em logs**: Nunca logar CPF, CNPJ, senha, token, chave de API. Override de `toString()` em entidades para omitir campos sensiveis.
- **SSRF (A10 / API7:2023)**: URL construida a partir de input do usuario exige allowlist explicita.
- **Rate Limiting (API4:2023)**: Rate limiting em endpoints publicos. Paginacao obrigatoria via `Pageable`.
- **Dependencias (A06)**: `./mvnw dependency-check:check` / `./gradlew dependencyCheckAnalyze` antes de deploy em producao.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `./mvnw compile -q` / `./gradlew compileJava` | Sempre |
| `./mvnw verify -q` / `./gradlew check` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Sistemas corporativos ou regulados | Produto rapido onde Laravel/Node entregam maior velocidade de iteracao |
| Alta necessidade de estabilidade operacional | Servico simples onde Go tem menor footprint |
| Dominio transacional complexo | |
| Integracao com ecossistema Java existente | |
