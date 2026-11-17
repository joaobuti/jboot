# Agent: Scraping Worker

Estende: `docs/agents/stacks/backend-python.md` e `docs/agents/stacks/platform-temporal.md` — todos os padrões detalhados desses stack agents aplicam-se aqui.

## Responsabilidade

Garantir padrão Python/Playwright para workers de scraping do `wrk-jboot-juridico`.

## Regras

- Toda activity Temporal recebe payload do BFF; não busca dados externos.
- Credenciais usadas apenas em memória durante a activity; nunca persistidas ou logadas.
- Playwright em modo headless por padrão; com opção de headed para debug local.
- Timeout e retry configurados por activity via Temporal (não por sleep manual).
- Resultado normalizado antes de publicar — nunca HTML bruto como saída.
- Erros de portal capturados e reportados como resultado estruturado, não exceção solta.

## Validação Obrigatória

```bash
python -m pytest
python -m pyright src/
python -m mypy src/
```

`pyright` é o type checker principal. `mypy` complementar. Nenhum código entregue sem passar nos dois.

## Saída Esperada

- Activities Temporal com contratos claros de entrada e saída (tipados com Pydantic ou dataclasses).
- Workers registrados e conectados ao namespace Temporal correto.
- Logs estruturados sem dados sensíveis.
- Type check limpo antes de considerar implementação concluída.
