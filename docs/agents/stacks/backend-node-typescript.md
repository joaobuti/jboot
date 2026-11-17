# Stack Agent: Backend Node/TypeScript

## Responsabilidade

APIs, BFFs, gateways, workers, realtime, ferramentas MCP e servicos proximos do frontend em TypeScript.

## Stacks

| Stack | Usar quando |
|---|---|
| Node.js LTS + TypeScript + NestJS 11 | Backend estruturado, modular, enterprise |
| Node.js LTS + Fastify/Hono | API enxuta, alta performance, menor cerimonia |
| tRPC | Monorepo TS full-stack, contrato HTTP publico nao e prioridade |
| OpenAPI | Multiplos clientes, stacks heterogeneas, integracao externa |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: metodo publico > 20 linhas ou 3+ niveis de aninhamento → decompor em metodos privados antes de merge.
- **OCP**: extensao via injecao de dependencia, nao via modificacao de classe central.
- **DIP**: service depende de interface, nao de implementacao concreta de repository ou adapter.

### Modular Monolith (Grzybek, 2019; Newman, Monolith to Microservices 2019)
- Deploy unitario com fronteiras de modulo verificaveis. Cada modulo corresponde a um Bounded Context (DDD — Evans, 2003).
- NestJS `@Module({ exports: [...] })` e o mecanismo de fronteira. Importar Repository de outro modulo sem exportacao explicita e violacao de fronteira.
- Nenhum modulo acessa tabela ou repositorio de outro modulo diretamente. Comunicacao via Service exportado ou evento (EventEmitter2).
- Modulo com dependencia de implementacao interna de outro modulo e bloqueante antes de merge.
- Cada modulo e extraivel para microsservico independente sem reescrita de dominio.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Controller → Service → Repository`. Dependencia sempre de fora para dentro.
- Controller: recebe HTTP, delega, retorna. Sem SQL, sem regra de negocio.
- Service: regra de negocio, orquestracao, validacao de invariante. Sem SQL direto.
- Repository: SQL, ORM, storage. Sem logica de dominio.
- DTO/schema: validacao de contrato de entrada. Service nao rejeita dado que deveria ter sido barrado na borda.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Chamadas a sistema externo (HTTP, fila, storage) em classe dedicada: sufixo `Gateway`, `Adapter` ou `Client`.
- Porta de entrada: DTO validado. Porta de saida: interface tipada do adapter.
- Dominio nao importa detalhes de HTTP, headers ou formato externo.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002; Richardson, Microservices Patterns 2018)
- **Gateway Pattern** (Fowler): `buildPayload`, `call`, `parseResponse` em metodos privados separados. Timeout e retry declarados por chamada.
- **Repository Pattern** (Fowler): acesso a dados atras de interface. Service nao conhece SQL.
- **Data Mapper Pattern** (Fowler): ORM/query result → domain object na camada de repository.
- **Adapter Pattern** (GoF): converte interface incompativel sem alterar dominio.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois metodos da mesma classe → extrair helper privado antes de continuar.
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
- Timeout e retry declarados explicitamente por chamada externa. Sem dependencia de timeout default de biblioteca.

## Segurança Obrigatória

### OWASP Top 10 (2021) + OWASP API Security Top 10 (2023)
- **Injection (A03)**: Queries sempre parametrizadas. Sem string concatenation com input de usuario em SQL, LDAP ou OS commands.
- **Broken Access Control (A01 / API1:2023)**: Verificar que o recurso pertence ao tenant/usuario autenticado no inicio de cada endpoint. Authorization != Authentication — checar ambos.
- **Broken Object Property Level (API3:2023)**: DTO de saida explicito por endpoint — sem `return entity` diretamente. Nunca serializar entidade completa na resposta da API.
- **Mass Assignment**: class-validator com campos explícitos no DTO. Nunca `Object.assign(entity, body)` sem whitelist de campos permitidos.
- **Cryptographic Failures (A02)**: Senhas → bcrypt ou Argon2. Sem MD5/SHA1 para dados sensiveis. `crypto.randomBytes` para tokens — nunca `Math.random()`. Segredos em variavel de ambiente, nunca no codigo.
- **Dados sensiveis em logs**: Nunca logar CPF, CNPJ, senha, token, chave de API, numero de cartao. Mascarar antes de qualquer output de log.
- **SSRF (A10 / API7:2023)**: URL construida a partir de input do usuario exige allowlist explicita. Sem fetch para URL arbitraria fornecida pelo cliente.
- **Rate Limiting (API4:2023)**: Rate limiting e paginacao obrigatorios em endpoints publicos ou que retornam listas. Sem query sem LIMIT.
- **Dependencias (A06)**: `npm audit` antes de merge em producao.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `npx tsc --noEmit` | Sempre |
| `npx eslint src --max-warnings=0` | Sempre |
| `npx jest --passWithNoTests` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| BFF para frontend web | Dominio IA com bibliotecas Python-only indispensaveis |
| APIs com alta integracao JS/TS | Servico onde Go entrega menor footprint com mesma performance |
| Orquestracao, realtime, tool calling | |
| Monorepo com compartilhamento forte de tipos | |
