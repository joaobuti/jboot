# Skill: portal-failure-handling

## Objetivo

Padronizar tratamento e classificação de falhas de portal no worker para que o BFF receba resultado estruturado e acionável.

## Tipos De Erro (Exceções Python)

```python
class AuthExpiredError(Exception): pass       # credencial inválida ou sessão expirada
class CaptchaDetectedError(Exception): pass   # CAPTCHA ou bloqueio anti-bot detectado
class PortalUnavailableError(Exception): pass # portal fora do ar ou timeout
class ParseError(Exception): pass             # extração falhou — layout alterado
```

## Procedimento

1. Cada adapter captura exceções específicas do Playwright e reclassifica para os tipos acima.
2. `AuthExpiredError` e `CaptchaDetectedError`: lançar imediatamente — são não-retryable no Temporal.
3. `PortalUnavailableError` e `ParseError`: lançar — Temporal faz retry conforme policy.
4. Após esgotar retries, workflow captura a exceção e retorna payload estruturado:

```python
@dataclass
class WorkflowResult:
    status: Literal["success", "failed"]
    portal_id: str
    error_type: Optional[str]  # "auth_expired" | "captcha_detected" | "portal_unavailable" | "parse_error"
    exhausted_retries: bool
    result: Optional[list]  # processos encontrados, se success
```

5. Workflow nunca propaga exceção não tratada — sempre retorna `WorkflowResult`.

## Restrições

- Nunca incluir credencial, HTML bruto ou stack trace completo em `WorkflowResult`.
- `ParseError` deve incluir apenas `portal_id` e nome do seletor que falhou — suficiente para diagnóstico sem dado sensível.
