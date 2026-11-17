# Stack Agent: Backend PHP/Laravel

## Responsabilidade

Backends, backoffices, APIs, admins e produtos web no ecossistema Laravel.

## Stacks

| Stack | Usar quando |
|---|---|
| Laravel 13 + PHP 8.4 | Produto rapido, CRUD sofisticado, fila, eventos, auth, admin |
| Laravel + Livewire/Inertia | Interface web integrada ao backend sem SPA separada |
| Laravel Boost | Desenvolvimento assistido por IA com guidelines e MCP |
| Laravel MCP | Exposicao de ferramentas, recursos e prompts via Model Context Protocol |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: metodo publico > 20 linhas ou 3+ niveis → decompor em metodos privados, Actions, Jobs ou Form Requests antes de merge.
- **OCP**: extensao via Actions e Form Requests, nao via modificacao de classe central.
- **DIP**: Service depende de interface ou Action, nao de implementacao concreta do Eloquent.

### Modular Monolith (Grzybek, 2019; Newman, Monolith to Microservices 2019)
- Deploy unitario com fronteiras de dominio verificaveis. Cada dominio/feature corresponde a um Bounded Context (DDD — Evans, 2003).
- Dominios comunicam via Events/Listeners do Laravel ou Service publico exportado. Sem importacao direta de Model ou Repository interno de outro dominio.
- Nenhum dominio acessa tabelas de outro via Eloquent relationship cross-domain.
- Dominio com dependencia de implementacao interna de outro e bloqueante antes de merge.
- Cada dominio e extraivel para servico independente sem reescrita.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Controller → Service/Action → Repository/Model`. Dependencia sempre de fora para dentro.
- Controller: recebe HTTP, valida via Form Request, delega. Sem regra de negocio.
- Service/Action: regra de negocio, validacao de invariante. Sem SQL direto.
- Model/Repository: Eloquent, queries. Sem logica de dominio.
- Form Request: validacao de contrato de entrada. Service nao lanca excecao por dado rejeitavel na borda.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Chamadas a sistema externo (HTTP, fila, storage) em classe dedicada: sufixo `Gateway`, `Adapter` ou `Client`.
- Porta de entrada: Form Request validado. Porta de saida: interface do adapter.
- Dominio nao importa detalhes de HTTP ou formato externo.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002; Richardson, Microservices Patterns 2018)
- **Gateway Pattern** (Fowler): `buildPayload`, `call`, `parseResponse` em metodos privados separados. Timeout e retry declarados por chamada.
- **Repository Pattern** (Fowler): Eloquent atras de interface ou classe de query. Service nao concatena query strings.
- **Command Pattern** (GoF): Actions encapsulam operacao de negocio como objeto invocavel.
- **Observer Pattern** (GoF): eventos Laravel para desacoplamento de side effects.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois metodos → extrair Action compartilhada ou helper privado antes de continuar.
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
- **Injection (A03)**: Queries sempre parametrizadas via Eloquent ou Query Builder. Sem string concatenation com input de usuario em SQL.
- **Broken Access Control (A01 / API1:2023)**: Policies e Gates do Laravel para verificar ownership do recurso. Sem verificacao de `$user->id === $resource->user_id` inline no controller sem Policy.
- **Broken Object Property Level (API3:2023)**: API Resource com campos explícitos na resposta. Nunca `return $model->toArray()` sem filtro de campos.
- **Mass Assignment**: `$request->validated()` sempre — nunca `$request->all()` direto em Model. `$fillable` explícito no Model.
- **Cryptographic Failures (A02)**: Senhas → `Hash::make()` (bcrypt). Sem MD5/SHA1 para dados sensiveis. TLS obrigatorio. Segredos em `.env`, nunca hardcoded.
- **Dados sensiveis em logs**: Nunca logar CPF, CNPJ, senha, token, chave de API. Usar `Log::info()` apenas com campos seguros declarados.
- **SSRF (A10 / API7:2023)**: URL construida a partir de input do usuario exige allowlist explicita.
- **Rate Limiting (API4:2023)**: Middleware `throttle` em endpoints publicos. Paginacao obrigatoria em listagens.
- **Dependencias (A06)**: `composer audit` antes de deploy em producao.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `./vendor/bin/pint --test` | Sempre |
| `./vendor/bin/pest` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Backoffice, admin, SaaS rapido, CRUD rico | Servico de IA onde Python e dominante |
| Equipe com maturidade PHP/Laravel | Servico de baixa latencia onde Go e mais apropriado |
| Aproveitar Boost/MCP e convencoes fortes para agentes | |
