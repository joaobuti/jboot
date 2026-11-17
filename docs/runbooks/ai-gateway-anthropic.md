# Anthropic BYOK

## Cadastro

Em Configuracoes -> IA -> Credenciais, selecionar Claude (Anthropic) e informar
a chave de API. O gateway cifra a chave e valida o acesso consultando os modelos
da conta. Falha de rede nao converte uma chave valida em invalida. Nunca colocar
chaves em chat, Git, fixture, log ou screenshot.

Em Agentes, selecionar a credencial ativa e um modelo carregado da conta. O
nome e o prompt sao gerenciados pelo JBoot. A referencia externa e informativa.

## Execucao

O endpoint s2s existente permanece fechado por default. Antes de habilitar,
registrar politica de dados Anthropic e modelos aprovados no gate da sprint;
configurar `AI_GATEWAY_EXECUTION_ENABLED=true` e
`AI_GATEWAY_ANTHROPIC_ALLOWED_MODELS=<IDs separados por virgula>` no ambiente.
Conferir `docker compose config` sem expor secrets; recriar o container jboot
para aplicar novas variaveis e reiniciar os processos via targets do projeto.

O executor usa o prompt versionado, sem tools, exige JSON e valida o schema
localmente. Nao altera cards. O ledger guarda hashes e metadados, nao o texto
completo. Ate a Sprint 12 definir a politica de efeitos, conteudo produzido
nao e devolvido para automacao de dominio.

Limites iniciais: 64 KiB de input, 4096 tokens de output, 60 segundos, duas
execucoes simultaneas e vinte tentativas/24h por owner+tenant. Limites sao
conservadores; budgets monetarios e circuit breaker distribuido ainda pendem.

Repetir a mesma idempotency key retorna o ledger, sem nova inferencia. Alterar
owner, agente, origem ou input com a mesma chave retorna conflito. Em timeout
nao reenviar automaticamente com outra chave: o provider pode ter cobrado.

## Validacao Externa Pendente

Com credencial de teste real cadastrada pela UI, capturar resposta anonimizada
do endpoint oficial (origem, modelo/identificador, data), executar smoke sem PII
com budget acordado e conferir tokens/estado no ledger. Nenhum teste com stub
prova sucesso externo. Nao promover `production_ready` ate fechar o gate.
