from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional


@dataclass
class ConsultaInput:
    portal_id: str
    client_id: str
    credential_encrypted: str
    query_type: Literal["cpf", "process_number"]
    query_value: str
    session_state_json: Optional[str] = None
    otel_traceparent: Optional[str] = None


@dataclass
class ProcessoEncontrado:
    numero: str
    tribunal: str
    assunto: Optional[str] = None
    data_distribuicao: Optional[str] = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowResult:
    status: Literal["success", "failed"]
    portal_id: str
    client_id: str
    result: list[ProcessoEncontrado] = field(default_factory=list)
    error_type: Optional[
        Literal["auth_expired", "captcha_detected", "portal_unavailable", "parse_error"]
    ] = None
    exhausted_retries: bool = False
