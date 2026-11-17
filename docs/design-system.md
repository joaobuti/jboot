# JBoot Design System

## Objetivo

Manter identidade visual consistente entre web, app e futuros produtos sem acoplar componentes de runtimes diferentes.

O template web existente pode ser reutilizado diretamente somente quando a stack escolhida para o novo projeto for compativel com o template. Apps React Native/Expo nao devem tentar reutilizar componentes React/DOM; devem reutilizar tokens, padroes visuais e componentes equivalentes.

## Fonte Inicial

Fonte visual inicial ja disponivel neste repositorio:

```text
implementations/templates/original/Next-TS
```

Esse template deve ser usado diretamente apenas para projetos web baseados em React + Next.js + TypeScript.

Para outras stacks, a referencia visual deve vir de uma versao equivalente do template na tecnologia escolhida, partindo de um diretorio raiz de templates ainda nao adicionado ao repositorio.

Diretorio raiz esperado quando houver necessidade:

```text
implementations/templates/original/<stack-template>
```

Exemplos futuros:

```text
implementations/templates/original/Angular
implementations/templates/original/Vue
implementations/templates/original/Laravel
implementations/templates/original/React-TS
```

Regra:

- nao editar o template original;
- derivar projetos web a partir de copia propria do template compativel com a stack escolhida;
- extrair tokens e padroes para uso compartilhado;
- implementar componentes equivalentes no app.

## Camadas

```text
template web original
  -> design tokens
  -> componentes web do projeto
  -> componentes mobile equivalentes
```

## Tokens Compartilhados

Todo projeto com web + app deve declarar ou consumir tokens para:

- cores;
- tema claro/escuro;
- tipografia;
- escala de espacamento;
- raios de borda;
- sombras/elevacao;
- icones;
- estados: default, hover, active, disabled, loading, error, success;
- densidade de telas operacionais;
- breakpoints web e tamanhos alvo mobile/tablet.

## Contrato Web

Projetos web devem reaproveitar o template compativel com sua stack.

Projetos React + Next.js + TypeScript podem reaproveitar diretamente o `Next-TS`:

- layout base;
- menus;
- tabelas;
- formularios;
- cards/painels;
- modais;
- componentes de feedback;
- tema `minimal` + `dark` quando aplicavel.

## Preset Padrao JBoot Web

O `app-jboot-identity-admin` define o preset visual padrao para consoles web JBoot derivados do Velzon.

Defaults obrigatorios para novos BFFs/apps web JBoot compativeis com Velzon:

- layout vertical;
- tema Velzon `minimal`;
- modo `dark`;
- sidebar `dark`;
- topbar `dark`;
- sem imagem de sidebar;
- largura fluida;
- menu lateral com apenas rotas reais do produto, sem itens demonstrativos do template como navegacao principal.

Projetos existentes devem alinhar esses defaults quando forem tocados por tarefas de template, sidebar, tema ou criacao de projeto. Divergencias exigem justificativa no `PROJECT_CONTRACT.md`.

Para outras stacks, nao adaptar o `Next-TS` diretamente. Use a versao do template correspondente a tecnologia escolhida. Se ela ainda nao existir no repositorio, registrar a necessidade no fluxo do PE antes de criar o projeto.

Cada projeto deve copiar/adaptar o template compativel para seu proprio diretorio em `implementations/*`.

## Contrato App

Projetos mobile/tablet devem criar componentes nativos equivalentes:

- `Button`;
- `Input`;
- `Select` ou picker;
- `Card`;
- `List`;
- `DataRow`;
- `Modal`;
- `Toast/Alert`;
- `TopBar`;
- `BottomBar` ou navigation;
- componentes especificos do dominio.

Nao reutilizar componentes que dependam de DOM, Bootstrap, Reactstrap ou Next.js.

## Regra Para Novos Projetos

Se um novo projeto tiver web e app:

1. identificar stack escolhida;
2. identificar template visual compativel com essa stack;
3. se o template compativel ainda nao existir no repositorio, registrar pendencia antes da implementacao;
4. definir design tokens compartilhados;
5. criar skill local de UI no projeto web;
6. criar skill local de UI no projeto app;
7. declarar no `PROJECT_CONTRACT.md` como a identidade visual sera preservada;
8. validar telas equivalentes em desktop, mobile e tablet.

## Criterio Senior

Consistencia visual nao deve sacrificar ergonomia nativa.

O web pode ser mais denso e orientado a tabelas. O app deve ser otimizado para toque, operacao rapida, baixa conectividade e leitura em tela menor.
