# Stack Agent: Mobile React Native

## Responsabilidade

Apps mobile Android/iOS com React Native e Expo, aproveitando TypeScript e compartilhamento com ecossistema web.

## Stacks

| Stack | Usar quando |
|---|---|
| Expo SDK 55 + React Native 0.83 + React 19.2 | Android/iOS com velocidade, OTA updates, ecossistema JS/TS, integracao com web |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: componente > 200 linhas ou 3+ niveis JSX → decompor antes de merge.
- **OCP**: extensao via props/composicao, nao via modificacao de componente compartilhado.
- **DIP**: componente depende de hook/service, nao de fetch direto.

### Modular Monolith — Feature Modules (Grzybek, 2019)
- Estrutura por feature: `features/<feature>/screens`, `features/<feature>/hooks`, `features/<feature>/api`.
- Nenhuma screen ou componente importa de dentro de outra feature diretamente. Compartilhamento exclusivo via `shared/`.
- Cada feature e autossuficiente: tipos proprios, chamadas de API proprias, estado local proprio.
- Feature com importacao interna de outra feature e bloqueante antes de merge.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Screen → Hook/Service → API Client`.
- Screen: renderiza, trata navegacao e eventos. Sem fetch direto.
- Hook/Service: fetching, transformacao, cache, estado global.
- API Client (`api/`, `services/`): chamada HTTP, serializacao, tratamento de erro de rede.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Toda chamada a API externa em modulo de cliente dedicado. Nao fazer fetch diretamente dentro de componente ou screen.
- Porta de saida: hook retorna tipo estruturado, nao raw response.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002)
- **Repository Pattern** (Fowler): API client abstrai endpoint. Hook nao conhece URL.
- **Observer Pattern** (GoF): estado reativo. Screen assina estado, nao poleia.
- **Facade Pattern** (GoF): hook agrega multiplas chamadas em interface simples para a screen.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois componentes ou hooks → extrair hook compartilhado ou funcao auxiliar antes de continuar.
- > 30% de sobreposicao → extrair abstração.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Componente > 200 linhas → candidato obrigatorio a revisao.
- Aninhamento JSX > 3 niveis → extrair sub-componente.
- Hook com > 3 responsabilidades detectaveis → decompor.
- New Architecture como premissa. Expo Modules para integracao nativa.

## Segurança Obrigatória

### OWASP Mobile Top 10 (2024)
- **Secrets no bundle (M1:2024)**: Sem API keys, tokens ou segredos hardcoded no codigo ou em arquivos de configuracao incluidos no build. Usar `expo-constants` apenas para config publica.
- **Storage inseguro (M9:2024)**: Dados sensiveis (tokens, PII) em `expo-secure-store` (Keychain/KeyStore nativo) — nunca em `AsyncStorage` sem criptografia.
- **Comunicacao insegura (M5:2024)**: TLS em toda comunicacao. Certificate pinning para APIs criticas com dados financeiros ou sensiveis.
- **Validacao insuficiente (M4:2024)**: Input do usuario validado antes de qualquer operacao. Nunca confiar em dados do servidor sem validacao de schema.
- **Dados sensiveis em logs**: Nunca logar CPF, senha, token, numero de cartao. Remover `console.log` com dados sensiveis antes de release.
- **Dependencias**: `npm audit` antes de cada release. Sem pacotes sem manutencao com CVE critico.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `npx tsc --noEmit` | Sempre |
| `npx eslint src --max-warnings=0` | Sempre |
| `npx expo export --platform all --dev false` | Sempre |
| `npx jest --passWithNoTests` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Time forte em React/TypeScript | App com maximo controle nativo e SDKs proprietarios sem wrappers maduros |
| Compartilhar componentes e conhecimento com web | |
| App com integracoes nativas moderadas e OTA updates | |
