# Stack Agent: Mobile Kotlin/Compose

## Responsabilidade

Apps nativos Android/iOS com qualidade nativa, compartilhamento Kotlin e forte controle de plataforma.

## Stacks

| Stack | Usar quando |
|---|---|
| Kotlin Multiplatform + Compose Multiplatform 1.10+ | Compartilhamento de logica e UI, Compose em multiplas plataformas |
| Kotlin Multiplatform + SwiftUI | Compartilhar dominio e manter UI nativa por plataforma |
| Android nativo com Jetpack Compose | Android como plataforma dominante |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: composable > 200 linhas ou 3+ niveis → decompor antes de merge.
- **OCP**: extensao via parametros e slots de composable, nao via modificacao de composable compartilhado.
- **DIP**: composable depende de ViewModel/UseCase, nao de implementacao concreta de repository.

### Modular Monolith — Gradle Modules por Feature (Grzybek, 2019)
- Cada feature e um modulo Gradle dedicado (`:feature:pdv`, `:feature:juridico`, etc.).
- `commonMain` compartilha apenas contratos (interfaces e DTOs), nunca implementacoes concretas.
- Nenhum modulo de feature acessa classe interna de outro modulo diretamente. Violacao gera erro de compilacao.
- Comunicacao entre modulos via interface publica ou evento compartilhado em `:core:domain`.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Composable → ViewModel → UseCase → Repository → Datasource`.
- Composable: renderiza, emite eventos. Sem logica de negocio.
- ViewModel: estado de UI, orquestracao de UseCases. Sem acesso direto a datasource.
- UseCase: uma operacao de negocio por classe. Testavel sem UI ou rede.
- Repository: abstrai datasource, retorna entidade de dominio.
- Datasource: HTTP, Room, device API. Sem logica de negocio.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Toda chamada a API externa em classe com sufixo `Repository`, `Datasource` ou `Client`. Nao fazer requisicao HTTP em ViewModel ou composable.
- Porta de saida: repository retorna `Result<T>`, nao raw response.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002)
- **Repository Pattern** (Fowler): datasource atras de interface. ViewModel nao conhece URL.
- **Observer Pattern** (GoF): StateFlow/SharedFlow para reatividade. Composable coleta Flow, nao poleia.
- **Strategy Pattern** (GoF): troca de datasource via injecao (Koin/Hilt).

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois composables ou classes → extrair composable compartilhado ou funcao auxiliar antes de continuar.
- > 30% de sobreposicao → extrair abstração.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Composable > 200 linhas → candidato obrigatorio a revisao.
- Aninhamento > 3 niveis → extrair sub-composable.
- Testes multiplataforma para logica em `commonMain`. APIs `expect/actual` somente quando necessario.

## Segurança Obrigatória

### OWASP Mobile Top 10 (2024)
- **Secrets no bundle (M1:2024)**: Sem API keys, tokens ou segredos em `BuildConfig`, `local.properties` ou codigo fonte. Usar Android KeyStore para dados sensiveis.
- **Storage inseguro (M9:2024)**: Dados sensiveis em `EncryptedSharedPreferences` ou Android KeyStore — nunca em `SharedPreferences` plain text.
- **Comunicacao insegura (M5:2024)**: TLS em toda comunicacao. Certificate pinning via `OkHttp CertificatePinner` para APIs criticas.
- **Criptografia insuficiente (M10:2024)**: Sem algoritmos obsoletos (DES, RC4, MD5). AES-256 com IV aleatorio para criptografia local.
- **Dados sensiveis em logs**: Sem `Log.d` com dados sensiveis. ProGuard/R8 habilitado em release builds para ofuscacao.
- **Dependencias**: `./gradlew dependencyCheckAnalyze` antes de release. Sem CVE critico sem justificativa documentada.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `./gradlew compileDebugKotlin` | Sempre |
| `./gradlew check` / `./gradlew test` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| App com exigencia de qualidade nativa | Time sem maturidade Kotlin/Compose |
| Equipe Kotlin/JVM forte | App onde Flutter entrega UI mais rapida sem perda de qualidade |
| Necessidade de compartilhar core sem abrir mao de integracoes nativas | |
