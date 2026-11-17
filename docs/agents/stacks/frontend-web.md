# Stack Agent: Frontend Web

## Responsabilidade

Dashboards, consoles, fluxos de analise, paineis de IA, ferramentas de revisao e interfaces administrativas para operadores.

## Stacks

| Stack | Usar quando |
|---|---|
| React 19 + Next.js 16 + TypeScript | Produto web complexo, SSR/RSC, streaming, dashboards |
| Angular 21 + TypeScript | Enterprise, equipes grandes, padroes estritos, ciclo de suporte previsivel |
| Vue 3.5 + Nuxt 4 | Produtividade, menor cerimonial, SSR moderno |
| Svelte/SvelteKit | Produto menor, interfaces performaticas, baixa verbosidade |
| Astro 5 | Sites de conteudo, documentacao, marketing tecnico, paginas com ilhas interativas |

## Padrões Obrigatórios

### SOLID (Robert Martin, 2002)
- **SRP**: componente > 200 linhas ou 3+ niveis de aninhamento JSX → decompor antes de merge.
- **OCP**: extensao via props/slots/composables, nao via modificacao de componente compartilhado.
- **DIP**: componente de apresentacao depende de hook/service, nao de fetch direto.

### Modular Monolith — Feature Modules (Grzybek, 2019; Fowler, MonolithFirst)
- Estrutura por feature: `features/<feature>/components`, `features/<feature>/hooks`, `features/<feature>/api`.
- Nenhum componente importa de dentro de outra feature diretamente. Compartilhamento exclusivo via `shared/` ou `common/`.
- Cada feature e autossuficiente: tipos proprios, chamadas de API proprias, estado local proprio.
- Feature com importacao de componente interno de outra feature e bloqueante antes de merge.

### Clean Architecture (Robert Martin, 2017)
- Camadas: `Component → Hook/Service → API Client`.
- Component: renderiza, trata eventos. Sem fetch direto, sem transformacao de dado.
- Hook/Service: fetching, transformacao, cache, estado global.
- API Client (`api/`, `services/`, `gateways/`): chamada HTTP, serializacao, tratamento de erro de rede.
- Validacao de formulario em schema/validator declarativo. Componente nao reimplementa validacao coberta pelo contrato com o backend.

### Hexagonal Architecture / Ports & Adapters (Cockburn, 2005; Hombergs, 2023)
- Toda chamada a API externa em modulo de cliente dedicado. Nao fazer fetch diretamente dentro de componente.
- Porta de entrada: props tipados. Porta de saida: hook retorna tipo estruturado, nao raw response.

### Padrões Estruturais (GoF 1994; Fowler PoEAA 2002)
- **Repository Pattern** (Fowler): API client abstrai endpoint. Hook nao conhece URL nem headers.
- **Observer Pattern** (GoF): estado reativo via hook/store. Componente assina estado, nao poleia.
- **Facade Pattern** (GoF): hook agrega multiplas chamadas em interface simples para o componente.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)
- Duplicacao de logica entre dois componentes ou hooks → extrair hook compartilhado ou funcao auxiliar antes de continuar.
- > 30% de sobreposicao → extrair abstração.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)
- Componente > 200 linhas → candidato obrigatorio a revisao.
- Aninhamento JSX > 3 niveis → extrair sub-componente.
- Hook com > 3 responsabilidades detectaveis → decompor.

## Padrões Obrigatórios: Domínio Brasileiro

Aplicar proativamente sem aguardar instrucao do usuario. Antes de criar tela, revisar se ja existe tela com a mesma responsabilidade.

**CPF/CNPJ como chave de formulario:**
- Lookup automatico ao completar digitos (11 CPF, 14 CNPJ) — sem exigir blur ou submit.
- Prefill de campos dependentes (nome, e-mail, telefone) se documento ja existe no sistema.
- Spinner no campo durante lookup; submit desabilitado ate terminar.
- Banner nao bloqueante ao encontrar registro existente; campos editaveis pelo usuario.
- Reset de campos dependentes ao editar o documento apos prefill; novo lookup disparado.
- Falha de rede ou 404 → campos em branco, formulario nao bloqueado.
- Troca CPF ↔ CNPJ → limpar numero digitado e estado de prefill.

**Validacao de documentos:**
- Aceitar entrada com ou sem mascara; remover nao-digitos antes de enviar ao backend.
- Nao aplicar validacao de digito verificador no frontend — API e fonte de verdade.

## Identidade Visual Obrigatória

Aplicar proativamente sem aguardar instrucao do usuario.

- Todo projeto frontend em `implementations/*` deve usar o mesmo favicon da marca JBoot. Fonte canonica: `implementations/site-jboot-landing/public/favicon.ico`.
- Ao criar ou revisar um projeto frontend, copiar esse arquivo para os locais que o framework espera (Next.js App Router: `src/app/favicon.ico`; demais frameworks: `public/favicon.ico` ou equivalente da convencao de metadata do framework).
- Nao usar o favicon padrao de template (Velzon ou outro) nem gerar um novo icone sem essa fonte.
- Se o asset canonico mudar, replicar a mudanca em todos os projetos frontend na mesma sessao de trabalho que a alterou.

## Segurança Obrigatória

### OWASP Top 10 (2021) + OWASP Cheat Sheet Series
- **XSS (A03)**: Sem `dangerouslySetInnerHTML` sem sanitizacao explicita (DOMPurify). Sem construcao de HTML por string concatenation com dado de usuario.
- **Secrets no bundle (A02)**: Nenhuma chave de API, token ou segredo no codigo ou em variaveis com prefixo publico (`NEXT_PUBLIC_`, `VITE_`). Segredos somente server-side.
- **Autenticacao insegura (A07)**: Token de autenticacao em httpOnly cookie — nunca em localStorage ou sessionStorage.
- **Broken Access Control (A01)**: Ocultar elemento de UI nao substitui verificacao no backend. Frontend e apresentacao, nao gate de seguranca.
- **Dados sensiveis no cliente**: Sem armazenar CPF, numero de cartao ou senha em estado de componente por mais tempo do que necessario para a operacao imediata.
- **CSP**: Content-Security-Policy configurado no servidor — sem `unsafe-inline` ou `unsafe-eval` sem justificativa documentada.
- **Dependencias (A06)**: `npm audit` antes de deploy em producao.

## Validação Obrigatória

| Comando | Quando executar |
|---|---|
| `npx tsc --noEmit` | Sempre |
| `npx eslint src --max-warnings=0` | Sempre |
| `npx jest --passWithNoTests` / `npx vitest run` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Produto web complexo com SSR, streaming ou dashboards | SPA pura sem SSR quando SEO ou primeira renderizacao importam |
| Dashboard operacional, admin, console interno | Framework experimental em workflow operacional critico |
