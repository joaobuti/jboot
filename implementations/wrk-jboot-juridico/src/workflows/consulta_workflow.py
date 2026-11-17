from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, ApplicationError

with workflow.unsafe.imports_passed_through():
    from ..activities.consulta_activity import consulta_activity
    from ..shared.contracts import ConsultaInput, WorkflowResult
    from ..shared.errors import AuthExpiredError, CaptchaDetectedError


_NON_RETRYABLE = [
    "AuthExpiredError",
    "CaptchaDetectedError",
]

_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(minutes=1),
    backoff_coefficient=5.0,
    maximum_attempts=3,
    non_retryable_error_types=_NON_RETRYABLE,
)


@workflow.defn
class ConsultaWorkflow:
    @workflow.run
    async def run(self, input: ConsultaInput) -> WorkflowResult:
        try:
            processos = await workflow.execute_activity(
                consulta_activity,
                input,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_RETRY_POLICY,
            )
            return WorkflowResult(
                status="success",
                portal_id=input.portal_id,
                client_id=input.client_id,
                result=processos,
            )
        except ActivityError as exc:
            cause = exc.cause
            if isinstance(cause, ApplicationError):
                error_type = _classify_error(cause.type or "")
                exhausted = cause.non_retryable
            else:
                error_type = "portal_unavailable"
                exhausted = True

            return WorkflowResult(
                status="failed",
                portal_id=input.portal_id,
                client_id=input.client_id,
                error_type=error_type,
                exhausted_retries=exhausted,
            )


def _classify_error(
    error_class: str,
) -> WorkflowResult.__dataclass_fields__["error_type"].type:  # type: ignore[name-defined]
    mapping = {
        "AuthExpiredError": "auth_expired",
        "CaptchaDetectedError": "captcha_detected",
        "PortalUnavailableError": "portal_unavailable",
        "ParseError": "parse_error",
    }
    return mapping.get(error_class, "portal_unavailable")  # type: ignore[return-value]
