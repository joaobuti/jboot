# Stack Agent: Mobile Flutter

## Responsabilidade

Apps multiplataforma Android/iOS/web/desktop com UI consistente e alta portabilidade.

## Stacks

| Stack | Usar quando |
|---|---|
| Flutter 3.41+ + Dart 3.10+ | Android, iOS, web e desktop a partir de um codebase app-first |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: widget > 200 linhas ou 3+ niveis de aninhamento → decompor antes de merge.
- **OCP**: extensao via composicao de widgets e parametros, nao via modificacao de widget compartilhado.
- **DIP**: widget de apresentacao depende de repository/service via injecao, nao de implementacao concreta.

### Modular Monolith — Feature Packages (Grzybek, 2019)
- Cada feature e um package Dart com exports explícitos via `library` e `export`. Implementacao interna e privada ao package.
- Nenhum widget importa de dentro de outro package de feature diretamente. Compartilhamento via package `shared/`.
- Comunicacao entre features via interface publica exportada ou estado compartilhado explicito.
- Feature com dependencia de implementacao interna de outra feature e bloqueante antes de merge.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Widget → State (BLoC/Riverpod/Provider) → Repository → Datasource`.
- Widget: renderiza UI, dispara eventos. Sem fetch, sem transformacao de dado.
- State: logica de apresentacao, transformacao de dado, estado reativo.
- Repository: orquestra datasources, devolve entidade de dominio.
- Datasource: HTTP, local storage, device API. Sem logica de negocio.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Toda chamada a API externa em classe dedicada com sufixo `Repository`, `Datasource` ou `Client`. Nao fazer requisicao HTTP diretamente dentro de widget.
- Porta de saida: repository retorna tipo de dominio, nao raw JSON.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002)
- **Repository Pattern** (Fowler): datasource atras de interface. State/BLoC nao conhece URL.
- **Observer Pattern** (GoF): Stream/ValueNotifier para reatividade. Widget assina estado, nao poleia.
- **Strategy Pattern** (GoF): troca de implementacao de datasource via injecao.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois widgets ou classes → extrair widget compartilhado ou funcao auxiliar antes de continuar.
- > 30% de sobreposicao → extrair abstração.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Widget > 200 linhas → candidato obrigatorio a revisao.
- Aninhamento > 3 niveis → extrair sub-widget.
- Golden tests para UI critica. Testes de widget e integracao para fluxos principais.

## Segurança Obrigatória

### OWASP Mobile Top 10 (2024)
- **Secrets no bundle (M1:2024)**: Sem API keys, tokens ou segredos hardcoded no codigo ou em `pubspec.yaml`. Configuracoes sensiveis via backend ou `flutter_secure_storage`.
- **Storage inseguro (M9:2024)**: Dados sensiveis em `flutter_secure_storage` (Keychain/KeyStore nativo) — nunca em `SharedPreferences` sem criptografia.
- **Comunicacao insegura (M5:2024)**: TLS em toda comunicacao. Certificate pinning para APIs criticas.
- **Privacidade insuficiente (M6:2024)**: Sem `print()` com dados sensiveis em producao. Usar `kDebugMode` para isolar logs de desenvolvimento.
- **Dependencias**: `dart pub audit` antes de cada release. Sem pacotes abandonados em dependencias criticas.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `dart analyze` | Sempre |
| `flutter test` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Produto app-first multiplataforma | Web altamente SEO/content-first |
| UI consistente em multiplas plataformas | Produto onde ecossistema React/Next e requisito forte |
| Equipe investida em Dart/Flutter | |
