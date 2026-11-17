from src.shared.contracts import ConsultaInput, ProcessoEncontrado, WorkflowResult
from src.shared.errors import AuthExpiredError, CaptchaDetectedError, ParseError, PortalUnavailableError


def test_consulta_input_fields() -> None:
    inp = ConsultaInput(
        portal_id="projudi",
        client_id="client-uuid",
        credential_encrypted="encrypted-blob",
        query_type="cpf",
        query_value="000.000.000-00",
    )
    assert inp.portal_id == "projudi"
    assert inp.otel_traceparent is None


def test_workflow_result_success() -> None:
    result = WorkflowResult(
        status="success",
        portal_id="projudi",
        client_id="client-uuid",
        result=[ProcessoEncontrado(numero="0001234-56.2024.8.01.0001", tribunal="TJAC")],
    )
    assert result.status == "success"
    assert len(result.result) == 1
    assert result.error_type is None


def test_workflow_result_failure() -> None:
    result = WorkflowResult(
        status="failed",
        portal_id="projudi",
        client_id="client-uuid",
        error_type="auth_expired",
        exhausted_retries=True,
    )
    assert result.status == "failed"
    assert result.exhausted_retries is True


def test_error_types() -> None:
    assert issubclass(AuthExpiredError, Exception)
    assert issubclass(CaptchaDetectedError, Exception)
    assert issubclass(PortalUnavailableError, Exception)
    err = ParseError(portal_id="projudi", selector=".processo-row")
    assert "projudi" in str(err)
