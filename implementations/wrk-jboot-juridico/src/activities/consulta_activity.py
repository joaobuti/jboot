from __future__ import annotations

from temporalio import activity

from ..portals.base import BasePortalAdapter
from ..shared.contracts import ConsultaInput, ProcessoEncontrado
from ..shared.errors import AuthExpiredError, CaptchaDetectedError

_REGISTRY: dict[str, BasePortalAdapter] = {}


def register_portal(adapter: BasePortalAdapter) -> None:
    _REGISTRY[adapter.portal_id] = adapter


@activity.defn
async def consulta_activity(input: ConsultaInput) -> list[ProcessoEncontrado]:
    adapter = _REGISTRY.get(input.portal_id)
    if adapter is None:
        raise ValueError(f"portal_id={input.portal_id!r} not registered")

    try:
        return await adapter.execute(input)
    except (AuthExpiredError, CaptchaDetectedError):
        raise
    except Exception as exc:
        activity.logger.error("consulta_activity failed", exc_info=exc, extra={"portal_id": input.portal_id})
        raise
