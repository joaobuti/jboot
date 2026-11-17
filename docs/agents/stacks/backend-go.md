# Stack Agent: Backend Go

## Responsabilidade

Gateways, CLIs, workers, sidecars e servicos de alta concorrencia ou baixa latencia.

## Stacks

| Stack | Usar quando |
|---|---|
| Go 1.25+ | Servico simples, estaticamente tipado, binario pequeno, concorrencia forte, operacao previsivel |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: funcao > 20 linhas ou 3+ niveis → decompor em funcoes auxiliares antes de merge.
- **OCP**: extensao via interfaces, nao via modificacao de funcao central.
- **DIP**: handler e service dependem de interface, nao de struct concreta do adapter.

### Modular Monolith (Grzybek, 2019; Newman, Monolith to Microservices 2019)
- Deploy unitario com fronteiras de pacote Go verificaveis. Cada pacote corresponde a um Bounded Context (DDD — Evans, 2003).
- Interface publica do pacote (identificadores exportados com letra maiuscula) e o contrato entre modulos. Tipos nao exportados sao privados ao modulo.
- Comunicacao entre dominios via interface exportada, nao via acesso direto a struct interna de outro pacote.
- Importacao circular entre pacotes e erro de compilacao — indicador direto de violacao de fronteira.
- Cada pacote e extraivel para servico independente sem reescrita.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Handler → Service → Repository/Client`. Dependencia sempre de fora para dentro.
- Handler: recebe HTTP/evento, valida, delega. Sem logica de dominio.
- Service: logica de negocio, validacao de invariante. Sem acesso direto a storage.
- Repository/Client: SQL, HTTP externo, storage. Sem logica de dominio.
- Validacao de contrato de entrada na borda. Funcoes internas nao retornam erro por dado ja validavel externamente.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Chamadas a sistema externo (HTTP, fila, storage) em tipo dedicado com interface clara.
- Porta de entrada: struct validada. Porta de saida: interface do adapter.
- Dominio nao importa detalhes de HTTP client ou formato externo.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002; Richardson, Microservices Patterns 2018)
- **Gateway Pattern** (Fowler): encapsula chamada externa com interface clara. `context.Context` em toda chamada com IO.
- **Repository Pattern** (Fowler): acesso a dados atras de interface. Service nao constroi query SQL.
- **Adapter Pattern** (GoF): converte interface incompativel sem alterar dominio.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre duas funcoes do mesmo pacote → extrair funcao compartilhada antes de continuar.
- > 30% de sobreposicao → extrair funcao auxiliar.

### Observabilidade (OpenTelemetry — CNCF, 2021)
- Traces, metricas e logs via SDK OpenTelemetry. Sem vendor lock-in — exportar para Jaeger, Prometheus, OTLP.
- Span em toda chamada externa: atributos `http.method`, `http.url`, `db.statement` (sem dados sensiveis), flag `error`.
- Logs estruturados em JSON: campos `level`, `timestamp`, `trace_id`, `span_id`, `message`. Sem string concatenation.
- Metricas de negocio como instrumentos OTel (Counter, Histogram). Nao usar logs de texto como substituto de metrica.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Funcao > 20 linhas → candidata obrigatoria a revisao de SRP.
- Cognitive Complexity > 15 → decompor (SonarQube default).
- Aninhamento > 3 niveis → extrair funcao auxiliar.
- `context.Context` em toda funcao com IO. Timeout declarado explicitamente por chamada externa. Sem dependencia de timeout default.

## Segurança Obrigatória

### OWASP Top 10 (2021) + OWASP API Security Top 10 (2023)
- **Injection (A03)**: Queries sempre com placeholders (`$1`, `?`). Sem `fmt.Sprintf` com input de usuario em SQL ou OS commands.
- **Broken Access Control (A01 / API1:2023)**: Verificar ownership do recurso no handler antes de qualquer operacao. Contexto de autorizacao propagado via `context.Context`.
- **Broken Object Property Level (API3:2023)**: Struct de resposta declarada explicitamente por endpoint — sem retornar struct de dominio completa via `json.Marshal`.
- **Cryptographic Failures (A02)**: Senhas → `golang.org/x/crypto/bcrypt`. Sem MD5/SHA1. `crypto/rand` para geracao de tokens — nunca `math/rand`. Segredos via variavel de ambiente.
- **Dados sensiveis em logs**: Nunca logar CPF, CNPJ, senha, token, chave de API. Sem `log.Printf("%+v", user)` em struct com campos sensiveis.
- **SSRF (A10 / API7:2023)**: URL construida a partir de input do usuario exige allowlist explicita.
- **Rate Limiting (API4:2023)**: Rate limiting em endpoints publicos. Paginacao obrigatoria em listagens.
- **Dependencias (A06)**: `govulncheck ./...` antes de deploy em producao.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `go vet ./...` | Sempre |
| `go test ./...` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Gateway, proxy, worker, CLI, webhook receiver, sidecar | Produto web/IA onde TypeScript ou Python entregam maior velocidade de iteracao |
| Alta concorrencia, baixa complexidade de dominio | Dominio com alta necessidade de metaprogramacao ou SDKs de IA imaturos em Go |
| Deploy com binario unico, footprint minimo | |
