# Skill: platform-crud-ui

## Objetivo

Padronizar CRUDs administrativos da Next Platform com listagem operacional e modal de criacao/edicao em steps.

Use esta skill sempre que a tarefa criar ou alterar telas de cadastro, manutencao, configuracao ou administracao de registros em modulos da Platform.

## Referencia Canonica

Modelo primario:

- `src/app/(with-layout)/produtos/page.tsx`
- `src/modules/pdv/components/PdvAdminPage.tsx`

O cadastro de produtos do modulo PDV e a referencia de estrutura para CRUD com modal, steps, listagem e acoes.

## Padrao De Tela

1. Usar uma pagina operacional direta; nao criar landing, hero ou explicacao de funcionalidade.
2. Exibir listagem como area principal da tela.
3. Exibir acao primaria no header da listagem, com icone coerente e texto curto.
4. Criar/editar registro em modal centralizado, preferencialmente `size="xl"` quando houver steps.
5. Nao navegar para pagina separada para criar/editar registro, salvo decisao explicita no contrato do modulo.
6. Tratar estados de loading, erro, vazio e sucesso dentro da propria tela.
7. Manter densidade operacional: espacos controlados, tabelas legiveis, botoes compactos e informacao escaneavel.

## Padrao De Listagem

1. Listagem em card unico, com titulo no `CardHeader` e conteudo no `CardBody`.
2. Tabela responsiva com `table-nowrap`, `hover` e cabecalho `table-light` quando compativel.
3. Coluna de acoes alinhada a direita.
4. Acoes por linha devem ser curtas: editar, inativar/remover quando permitido e acoes essenciais do recurso.
5. Status deve usar badge com semantica visual clara.
6. Valores booleanos devem ser legiveis (`Sim`/`Nao`) ou badge quando o estado tiver peso operacional.
7. IDs tecnicos nao devem ser exibidos como valor principal; usar nomes, codigos de negocio ou labels legiveis.
8. Estado vazio deve informar que nao ha registros, sem copy longa.

## Padrao De Modal

1. Modal centralizado.
2. Header do modal: `Novo <recurso>` na criacao e `Editar <recurso>` na edicao.
3. Corpo em duas areas quando houver steps: navegacao lateral/esquerda dos steps e conteudo do step selecionado.
4. Footer fixo no final do modal com `Cancelar` e `Salvar`; `Salvar` deve ser a acao primaria.
5. Botao de salvar deve mostrar `Spinner` inline enquanto salva.
6. Fechar modal deve limpar estado de edicao/criacao quando a operacao concluir.
7. Erros de submit devem aparecer dentro da tela/modal sem quebrar fluxo.

## Padrao De Steps

1. Steps nao usam numeros.
2. Cada step usa icone coerente com o agrupamento:
   - dados gerais: `ri-file-text-line`;
   - classificacao/categoria: `ri-price-tag-3-line`;
   - endereco/localizacao: `ri-map-pin-line`;
   - estoque: `ri-stack-line` ou `ri-store-2-line`;
   - financeiro/preco: `ri-money-dollar-circle-line`;
   - fiscal/documentos: `ri-file-list-3-line`;
   - usuarios/permissoes: `ri-shield-user-line`;
   - integracoes: `ri-plug-line`;
   - observacoes: `ri-sticky-note-line`.
3. Steps devem agrupar campos por responsabilidade operacional, nao por ordem tecnica do DTO.
4. Nomes dos steps devem ser curtos e orientados ao operador.
5. Navegar entre steps nao deve salvar parcialmente, salvo regra explicita do recurso.
6. Campos extras de um step devem ficar abaixo dos campos principais do mesmo step, mantendo o agrupamento visual.

## Padrao De Campos

1. Campos devem ser declarados por metadados quando o CRUD for simples.
2. Usar secoes internas com titulo pequeno, uppercase e linha inferior para subgrupos.
3. Campo obrigatorio deve exibir `*` junto ao label.
4. FKs devem usar select/autocomplete com label legivel, nunca UUID cru.
5. Campos monetarios devem usar `CurrencyInput`.
6. CEP/endereco deve usar `CepInput` quando aplicavel.
7. Checkboxes devem ter area compacta e label claro.
8. Nao misturar regras de API diretamente no JSX quando puderem ficar no client tipado ou no mapper do payload.

## Padrao De API E Estado

1. CRUD deve consumir client tipado do modulo.
2. A pagina nao deve chamar `fetch` direto se ja houver `api-client` do modulo.
3. Normalizar payload antes de enviar: string vazia para `null` quando opcional, booleanos como booleanos e valores monetarios no formato aceito pelo backend.
4. Apos criar/editar/inativar, recarregar a listagem.
5. Nao aceitar `client_id` em payload de UI; contexto vem do JWT/backend.

## Quando Nao Usar

- Frente de caixa, board drag-and-drop, dashboard analitico, wizard de onboarding publico ou fluxo transacional que nao seja CRUD administrativo.
- Nesses casos, use a skill especifica do modulo e referencie esta skill apenas se houver subfluxo de cadastro/manutencao.

## Checklist

- [ ] Listagem padronizada com loading/empty/error.
- [ ] Modal de criacao/edicao.
- [ ] Steps sem numeros e com icones coerentes.
- [ ] Footer do modal com `Cancelar` e `Salvar`.
- [ ] Campos agrupados por responsabilidade operacional.
- [ ] API client tipado.
- [ ] Teste/validacao compativel com a mudanca.
