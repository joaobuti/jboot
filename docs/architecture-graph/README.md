# JBoot Architecture Graph

O Architecture Graph e o indice arquitetural tipado do repositorio. Ele agrega
fontes canonicas existentes, o registry explicito e o API Contract Graph sem
substituir nenhum desses contratos.

## Fontes

- `registry.yaml`: identidade e relacoes que nao podem ser inferidas;
- `PROJECT_CONTRACT.md` e `MODULE_CONTRACT.md`: projetos, modulos e lifecycle;
- `docs/agents` e `docs/skills`: governanca operacional;
- agents/skills locais: ownership de execucao;
- decision records, sprints e attestations: rastreabilidade;
- `tools/ai/api-graph.py`: subgrafo HTTP.

## Comandos

```bash
make ai-architecture-graph
make ai-architecture-graph-gate
make ai-architecture-context NODE=module:bff-jboot-platform/pdv
make ai-architecture-impact NODE=project:bff-jboot-platform
make ai-architecture-graph-viewer
```

O artefato agregado e gerado em `tmp/ai/architecture-graph/graph.json`. O viewer
e local, read-only e escuta somente em loopback por default.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `make ai-architecture-graph-viewer`
  - purpose: explorar localmente o Architecture Graph em modo read-only;
  - containers:
    - required: nenhum;
    - optional: nenhum;
    - forbidden_by_default: todos;
  - app_processes:
    - required: servidor HTTP Python em loopback;
    - build: Node.js 24+ no host ou container efemero `jboot-jboot`;
    - optional: nenhum;
    - forbidden_by_default: APIs, bancos, filas e workers JBoot;
  - ports: `127.0.0.1:${PORT:-4174}`;
  - healthchecks: HTTP `GET /` e carregamento de `/graph.json`;
  - seed_dependencies: nenhuma;
  - expected_resource_profile: servidor estatico Python e renderizacao WebGL no navegador.

O comando nao deve usar `--host 0.0.0.0`. A alteracao de porta e explicita por
`PORT=<porta>` e nao afeta Identity, CORS ou qualquer BFF.

O target executa `npm ci` e `npm run build` antes de servir. Quando o host nao
tem Node.js 24+, usa a imagem de desenvolvimento `jboot-jboot` apenas como
container efemero de build; nenhum container permanece no runtime do viewer.

## Manutencao

Novos projetos e modulos sao extraidos de seus contratos. Capabilities, tools e
relacoes nao inferiveis devem entrar no registry no mesmo change que introduz o
componente. Nunca edite o JSON agregado.

O viewer permanece read-only. Agents executores atualizam contratos/registry no
mesmo diff; o `ai-graph-architect` revisa semantica e gates pelos triggers de seu
contrato sem assumir a escrita exclusiva. Sincronizacao cloud e banco de grafos estao
formalmente adiados conforme a decision de 2026-10-06 e nao fazem parte do
runtime atual.
