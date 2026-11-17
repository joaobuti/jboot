# Non-Conformity Records

Use um arquivo por falha de processo.

Formato sugerido:

```text
# Non-Conformity: <titulo>

date:
severity:
owner:
expected:
actual:
impact:
correction:
prevention:
status:
regression_test:
```

Estados permitidos:

- `open`: exige owner e plano de correcao;
- `corrected`: correcao e prevencao implementadas;
- `accepted`: risco aceito com justificativa e responsavel.

`recorded` nao e estado operacional e nao deve ser usado.

Toda nao conformidade `open` exige owner. Toda nao conformidade `corrected`
exige `regression_test` apontando para um eval automatizado; quando isso for
tecnicamente impossivel, o registro deve permanecer aberto ou declarar risco
aceito por humano com justificativa e data de revisao.
