# OpenAI BYOK

Selecionar OpenAI (GPT) em Configuracoes -> IA -> Credenciais e informar a chave
da API OpenAI. Salvar cifra a chave e consulta Models pelo SDK oficial, sem
prompt ou inferencia. Editar substitui e revalida mantendo o ID dos agentes.
Criar API key no painel oficial; nao usar senha, cookie ou assinatura ChatGPT.

O backend envia a chave somente a `https://api.openai.com/v1`. Organization e
project nao sao herdados de variaveis de ambiente: a chave pertence ao cliente.
Chave restrita precisa de permissao para Models; 403 nao significa chave invalida.

Em Agentes, selecionar a credencial e um modelo listado para essa conta. A
listagem nao prova disponibilidade de saldo, acesso a Responses ou compatibilidade
com structured outputs. Operacao deve aprovar somente modelos de texto compativeis
na allowlist `AI_GATEWAY_OPENAI_ALLOWED_MODELS`, separada da allowlist Anthropic.

Execucao usa Responses API, `store:false`, JSON Schema estrito, validacao local
Ajv, sem tools, redirects, logging de SDK ou retry automatico de inferencia.
Reusa ledger, quotas e kill switch do gateway; custo desconhecido permanece NULL.
`store:false` nao promete Zero Data Retention: politica de dados OpenAI/DPA
continua sendo um gate proprio antes de liberar dados de negocio.

Smoke real: cadastrar chave na UI, testar e conferir modelos; depois aprovar
budget/modelo e executar input sem PII, capturando resposta anonimizada com
endpoint, identificador/modelo e data. Nunca salvar API keys em chat ou fixture.
Nenhuma resposta de sucesso externa foi inventada para esta implementacao.

Fontes: https://developers.openai.com/api/reference/typescript,
https://developers.openai.com/api/docs/guides/structured-outputs,
https://developers.openai.com/api/reference/resources/models/methods/list.
