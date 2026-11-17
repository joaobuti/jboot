# UIUX Decision: Fundacao Juridica Do Flow

```yaml
date: 2026-10-13
status: accepted
human_confirmation: approved_existing_pattern
confirmed_at: 2026-10-13
target_project: implementations/app-jboot-next-platform
target_module: modules/kanban
http_contract: docs/api/flow-juridico-foundation-openapi.yaml
```

## Clientes

```text
UIUX Decision:
  objective: operar o cadastro mestre compartilhado dentro do contexto Flow
  scenario_classification: covered_by_skill
  template_sources_checked:
    - implementations/app-jboot-next-platform/skills/platform-crud-ui.md
    - implementations/app-jboot-next-platform/src/app/(with-layout)/produtos/page.tsx
    - implementations/app-jboot-next-platform/src/modules/pdv/components/PdvAdminPage.tsx
  route: /flow/clientes
  navigation_impact: item "Clientes" no menu Flow, antes de "Escritorios"
  local_agent: modules/kanban/agents/kanban-board-ui.md
  local_skills: [platform-crud-ui, api-client, platform-design-system]
  decision_status: approved_existing_pattern
```

### Hierarquia E Fluxo

1. Header operacional com titulo, busca e acao primaria `Novo cliente`.
2. Card principal com tabela paginada: nome, CPF minimizado, escritorios,
   status, quantidade de cards visiveis e acoes.
3. Criacao/edicao em modal `xl`, steps sem numeros:
   - `Dados gerais` (`ri-file-text-line`);
   - `Juridico` (`ri-file-list-3-line`);
   - `Escritorios` (`ri-map-pin-line`).
4. Detalhe lateral/modal mostra somente cards visiveis e acao `Criar card`.
5. `Criar card` abre modal compacto com quadro, coluna inicial, escritorio e
   titulo. Reenvio preserva a mesma chave de idempotencia ate resposta final.

### Estados Obrigatorios

- `loading`: skeleton da tabela; acoes destrutivas/submit desabilitadas.
- `empty`: mensagem curta e `Novo cliente` quando autorizado.
- `success`: tabela; feedback inline/toast apos mutacao e recarga.
- `error`: erro sanitizado com `Tentar novamente`; nunca exibir payload bruto.
- `permission_denied`: estado 403 explicito sem renderizar dados parciais.
- `not_found`: detalhe/card tratado como inexistente, inclusive cross-tenant ou
  cross-office.
- `conflict`: WIP, ACL, CPF existente invisivel e idempotency conflict possuem
  mensagem operacional por `error.code`, sem inferir existencia protegida.

CPF aparece mascarado na listagem. Valor completo fica restrito ao formulario
autorizado; busca envia o valor no body/query contratada, nunca em log ou URL de
navegacao. A UI nao envia `client_id`.

## Configuracoes — Google Drive

```text
UIUX Decision:
  objective: configurar replica opcional sem confundir com storage canonico
  scenario_classification: covered_by_skill
  route: /flow/configuracoes/google-drive
  navigation_impact: submenu "Configuracoes" > "Google Drive"
  local_agent: modules/kanban/agents/kanban-board-ui.md
  local_skills: [platform-crud-ui, api-client, platform-design-system]
  decision_status: approved_existing_pattern
```

### Hierarquia E Fluxo

1. Status no topo: `Desconectado`, `Ativo`, `Pausado` ou `Configuracao invalida`.
2. Formulario administrativo com modo de credencial, referencia write-only e
   pasta raiz. Segredo salvo nunca retorna; a tela mostra somente
   `Credencial configurada: Sim/Nao`.
3. Acoes: `Conectar/Salvar`, `Testar`, `Ativar`, `Pausar` e `Desconectar`.
4. Card de operacao: ultimo sucesso, ultima falha sanitizada, backlog e link
   para itens falhos com acao `Reprocessar`.
5. Aviso fixo: “O Drive e uma replica opcional. Os arquivos canonicos
   permanecem no CRM.”

### Estados Obrigatorios

- `loading`: skeleton e acoes desabilitadas.
- `empty/disconnected`: formulario inicial sem inferir modo de credencial.
- `success`: status, timestamps e diagnosticos sanitizados.
- `error`: codigo traduzido, sem token, private key, folder metadata sensivel ou
  resposta integral do provider.
- `permission_denied`: somente `flow:admin`/scope aprovado acessa a pagina.
- `paused`: leitura de diagnostico permitida; novos syncs claramente suspensos.

## Componentes

Reutilizar `Card`, `CardHeader`, `CardBody`, tabela responsiva, `Modal`, `Nav`
de steps, badges, spinner e alertas existentes. Nenhum novo padrao visual e
necessario. Componentes de dominio novos (`FlowCustomersPage`,
`GoogleDriveSettingsPage`) sao composicoes locais, nao candidatos a alterar o
design system.

## Riscos E Gates

- Frontend so inicia depois do OpenAPI aprovado e backend/cliente tipado
  congelados e commitados.
- Ocultar botao nao substitui autorizacao backend.
- Status de sync nao faz polling ilimitado; intervalo/backoff vem do contrato
  operacional aprovado.
- Testes devem cobrir menu, loading, vazio, sucesso, erro, 403, 404 indistinto,
  segredo write-only e replay de `Criar card`.

## Confirmacao Humana

Em 2026-10-13, o usuario determinou que UI/UX deve seguir o padrao ja
existente. Isso aprova o reuso de `platform-crud-ui`, do design system e dos
componentes atuais descritos neste documento. A confirmacao nao decide scopes,
modelo relacional, credencial Drive, retencao, RPO/RTO ou provider de IA.
