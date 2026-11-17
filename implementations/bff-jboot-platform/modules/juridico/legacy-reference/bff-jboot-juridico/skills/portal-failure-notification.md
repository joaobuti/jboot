# Skill: portal-failure-notification

## Objetivo

Receber falha de workflow Temporal após retries esgotados e criar notificação in-app para o tenant.

## Procedimento

1. BFF mantém Temporal client que escuta resultados de workflows de scraping.
2. Quando workflow completa com `status: "failed"` e `exhausted_retries: true`:
   a. Mapear `error_type` para mensagem legível (ver agent `juridico-portal-failure.md`).
   b. Inserir registro em `portal_notifications` com `client_id`, `portal_id`, `type`, `message`, `created_at`.
   c. Se `error_type === captcha_detected`: marcar scheduling do portal como `suspended` até intervenção manual.
3. Expor `GET /notifications?unread=true` para o frontend verificar ao carregar o painel.
4. Expor `PATCH /notifications/:id/read` para marcar como lida.
5. Registrar evento de falha em log estruturado com `trace_id`, `workflow_id`, `portal_id`, `error_type` — sem dados sensíveis.

## Retry Policy do Worker (definida em `wrk-jboot-juridico`)

```python
ActivityOptions(
    start_to_close_timeout=timedelta(minutes=5),
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(minutes=1),
        backoff_coefficient=5.0,  # 1min, 5min, 25min
        non_retryable_error_types=["AuthExpiredError", "CaptchaDetectedError"],
    )
)
```

`AuthExpiredError` e `CaptchaDetectedError` são não-retryable — notificação imediata sem esperar 3 tentativas.

## Restrições

- Não enviar e-mail nesta fase — apenas in-app.
- Não cancelar scheduling automaticamente exceto para `captcha_detected`.
- Deduplicar notificações: não criar múltiplos registros para o mesmo `client_id` + `portal_id` + `type` no mesmo ciclo.
