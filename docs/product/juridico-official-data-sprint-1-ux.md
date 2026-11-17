# Juridico Data Sprint 1 UI/UX Decision

## Status

```yaml
decision_status: approved_existing_pattern
date: 2026-08-27
target_project: implementations/app-jboot-next-platform
target_module: modules/juridico
route: /juridico/consultas/processo
```

## Classificacao

`scenario_classification: covered_by_template`

A tela e uma consulta operacional autenticada. Usa shell, cards, alerts,
formularios, badges, spinner e tabelas ja presentes na Platform/Reactstrap. Nao
e CRUD administrativo; `platform-crud-ui` nao se aplica. Nenhum novo padrao
oficial de Platform e necessario.

Fontes verificadas:

- `implementations/app-jboot-next-platform/src/app/(with-layout)/juridico/pje/page.tsx`;
- `implementations/app-jboot-next-platform/src/modules/juridico/components/PjePanel.tsx`;
- `implementations/app-jboot-next-platform/src/modules/juridico/components/PjeComunicacoesList.tsx`;
- `implementations/app-jboot-next-platform/src/app/juridico/page.tsx`;
- `implementations/app-jboot-next-platform/skills/platform-design-system.md`;
- preset Velzon `minimal`, dark sidebar/topbar da Platform.

## Navegacao

- manter a rota contratada `/juridico/consultas/processo`;
- adicionar entrada `Consulta processual` no menu Juridico somente quando a
  rota funcional estiver entregue;
- adicionar card correspondente na home `/juridico`;
- nao criar seletor de application ou contexto `platform`;
- DataJud e fonte implicita da rota na Sprint 1; nao exibir seletor de provider.

## Hierarquia Da Tela

1. Titulo `Consulta processual`.
2. Alert informativo persistente: fonte DataJud e possivel defasagem em relacao
   ao tribunal de origem.
3. Card de consulta:
   - numero CNJ, com mascara progressiva e suporte a colar 20 digitos;
   - tribunal opcional com busca no catalogo;
   - botao primario `Consultar processo`.
4. Metadados do resultado: fonte, capturado em, ultima atualizacao e tribunal.
5. Card resumo: classe, orgao, grau, ajuizamento e assuntos.
6. Partes, com densidade operacional e sem truncamento destrutivo de nome.
7. Movimentacoes em ordem decrescente, com data, nome e complementos
   normalizados.

Nao exibir na Sprint 1:

- resumo por IA;
- prazo sugerido;
- botao de monitoramento;
- exportacao, download ou acao com efeito juridico;
- payload JSON bruto.

## Estados

### Inicial/vazio

- card de consulta visivel;
- area de resultado ausente;
- texto curto orienta formato CNJ e tribunal opcional.

### Catalogo carregando

- select de tribunal desabilitado com spinner pequeno;
- numero CNJ continua editavel;
- consulta pode seguir sem tribunal somente se o backend suportar busca limitada
  conforme contrato congelado.

### Consulta carregando

- botao desabilitado, spinner e texto `Consultando...`;
- campos preservados;
- impedir duplo submit;
- `aria-live=polite` anuncia progresso.

### Sucesso

- foco programatico no heading do resultado;
- metadados de freshness antes do conteudo;
- movimentacoes em lista/tabela responsiva;
- nova consulta substitui o resultado somente apos sucesso; durante loading, o
  resultado anterior fica marcado como desatualizado ou oculto de forma
  consistente, sem misturar dados.

### Validacao

- erro inline junto ao numero CNJ;
- botao permanece disponivel apos correcao;
- nenhum request em numero com digito verificador invalido.

### Nao encontrado

- alert `warning` com tribunal consultado e orientacao para revisar numero ou
  remover/alterar tribunal;
- nao tratar como falha tecnica.

### Restrito/sigiloso

- alert neutro `Processo indisponivel para consulta por restricao de acesso`;
- nao confirmar detalhes de sigilo nem mostrar dado parcial.

### Rate limit

- alert com tempo de nova tentativa quando `Retry-After` existir;
- retry sempre manual na Sprint 1.

### Indisponivel/timeout

- alert `danger` com request id copiavel para suporte;
- botao `Tentar novamente`, sem loop automatico.

### Permissao negada

- shell autenticado preservado;
- estado `403` sem formulario ou dados anteriores;
- orientar contato com administrador do modulo.

## Componentes

Reuso:

- `Container`, `Row`, `Col`, `Card`, `Alert`, `Input`, `Button`, `Badge`,
  `Spinner` e `Table` do padrao atual;
- page title e spacing da rota PJe;
- client tipado `src/modules/juridico/lib/juridico-api.ts`;
- componentes de erro/loading da Platform quando equivalentes existirem.

Componentes de dominio planejados:

- `DataJudProcessQueryPanel`;
- `DataJudProcessSummary`;
- `DataJudMovementList`.

Sao componentes locais do modulo, classificados como `excecao_isolada`: o
conteudo e especifico do dominio juridico e nao cria novo design pattern.

## Responsividade E Acessibilidade

- desktop: formulario em uma linha, resumo em grid e movimentacoes densas;
- mobile: campos e botao empilhados, tabela transformada em blocos legiveis;
- labels explicitos, navegacao completa por teclado e foco visivel;
- alerts com role apropriado e nao dependentes apenas de cor;
- spinner possui texto acessivel;
- mascara nao impede colar/copiar nem leitura por screen reader;
- datas exibidas no timezone do operador, preservando valor ISO no contrato.

## Execucao Futura

Agent local:

- `implementations/app-jboot-next-platform/modules/juridico/agents/juridico-web.md`;
- `implementations/app-jboot-next-platform/modules/juridico/agents/juridico-api-client.md`.

Skills:

- `implementations/app-jboot-next-platform/skills/platform-design-system.md`;
- `implementations/app-jboot-next-platform/skills/api-client.md`;
- `implementations/app-jboot-next-platform/modules/juridico/skills/juridico-web-ui.md`;
- `implementations/app-jboot-next-platform/modules/juridico/skills/juridico-api-client.md`.

Nao exige nova confirmacao visual porque aplica o preset existente sem alterar
design system ou criar padrao oficial.
