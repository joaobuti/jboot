# Stack Agent: Desktop Tauri

## Responsabilidade

Aplicacoes desktop leves, seguras e multiplataforma com frontend web e core nativo em Rust.

## Stacks

| Stack | Usar quando |
|---|---|
| Tauri 2 + Rust + frontend web | Desktop leve, acesso a sistema operacional, seguranca, binarios pequenos |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: comando Tauri > 20 linhas ou componente frontend > 200 linhas → decompor antes de merge.
- **OCP**: extensao via modulos Rust dedicados e composicao de componentes, nao via modificacao de comando central.
- **DIP**: handler de evento depende de modulo Rust com interface clara via IPC, nao de logica de sistema inline.

### Modular Monolith — Rust Modules + Frontend Features (Grzybek, 2019)
- Rust: modulos por dominio (`mod fiscal`, `mod storage`, etc.) com `pub use` explicito da interface publica. Implementacao interna nao exportada e privada ao modulo.
- Frontend: estrutura por feature — cada feature tem seus componentes e chamadas IPC proprias. Sem importacao de componente interno de outra feature.
- Comunicacao entre modulos Rust via trait publico, nao via acesso direto a struct interna.
- Modulo Rust ou feature frontend com dependencia interna cruzada e bloqueante antes de merge.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Frontend Component → IPC Command (Tauri) → Rust Module → System/IO`.
- Componente frontend: apresentacao, eventos. Sem logica de sistema.
- Comando Tauri: ponto de entrada IPC, delega a modulo Rust. Sem logica de dominio.
- Modulo Rust: logica de dominio, acesso a sistema, IO. Testavel sem frontend.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Toda operacao de IO ou chamada a sistema externo em modulo Rust dedicado com interface clara.
- Porta de entrada: contrato IPC validado. Porta de saida: tipo Rust serializado para frontend.
- Frontend nao conhece detalhes de sistema operacional ou paths nativos.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002)
- **Facade Pattern** (GoF): comando Tauri expoe interface simples ao frontend; modulo Rust encapsula implementacao complexa.
- **Adapter Pattern** (GoF): modulo Rust adapta APIs de sistema operacional para contratos IPC uniformes.
- **Command Pattern** (GoF): cada comando Tauri e uma operacao encapsulada com entrada/saida tipada.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois comandos ou componentes → extrair funcao auxiliar ou modulo compartilhado antes de continuar.
- > 30% de sobreposicao → extrair abstração.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Comando Tauri > 20 linhas → candidato obrigatorio a revisao.
- Componente frontend > 200 linhas → candidato obrigatorio a revisao.
- Aninhamento > 3 niveis → extrair funcao auxiliar.
- Permissoes e capabilities declaradas explicitamente no manifesto Tauri.
- Assinatura, auto-update e empacotamento decididos antes da primeira release.

## Segurança Obrigatória

### Tauri Security Model + OWASP Top 10 (2021)
- **Capabilities minimas**: Declarar apenas permissoes necessarias no `tauri.conf.json`. Sem `all` em producao — cada capability deve ser justificada.
- **IPC Validation (A03)**: Todo input recebido via IPC validado antes de qualquer operacao de sistema ou dominio. Nunca executar comando de sistema com input de usuario sem sanitizacao e allowlist.
- **Secrets (A02)**: Sem segredos hardcoded em Rust ou em variaveis de ambiente do frontend. Usar keyring do sistema operacional (`keyring` crate ou Tauri Plugin Store com criptografia).
- **CSP do webview**: Content-Security-Policy configurado em `tauri.conf.json` — sem `unsafe-inline` ou `unsafe-eval` sem justificativa documentada.
- **Dados sensiveis em logs**: Sem logging de dados sensiveis em builds de release. `log::debug!` isolado por configuracao de desenvolvimento.
- **Dependencias (A06)**: `cargo audit` antes de release. Dependencias JS: `npm audit`.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `cargo check` | Sempre |
| `npx tsc --noEmit` | Sempre |
| `cargo test` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Desktop e requisito central | Dependencia de Chromium/Node completo e requisito real (usar Electron) |
| Acesso a sistema operacional, binario leve, seguranca | Quando ecossistema Electron reduzir risco mais do que o custo de footprint |
