from datetime import UTC, datetime

from juridico_data.domain.cnj import infer_tribunal, normalize_cnj
from juridico_data.domain.errors import UnsupportedTribunalError
from juridico_data.domain.models import ProcessQuery, ProcessQueryResponse, TribunalListResponse
from juridico_data.integrations.datajud import DataJudGateway
from juridico_data.integrations.tribunals import TRIBUNAL_INDICES, list_tribunals


class JuridicoDataService:
    def __init__(self, gateway: DataJudGateway) -> None:
        self._gateway = gateway

    def tribunals(self) -> TribunalListResponse:
        items = list_tribunals()
        return TribunalListResponse(items=items, total=len(items))

    async def query_process(
        self, query: ProcessQuery, request_id: str, *, background: bool = False
    ) -> ProcessQueryResponse:
        number = normalize_cnj(query.numero_processo)
        tribunal = (query.tribunal or infer_tribunal(number) or "").upper()
        if tribunal not in TRIBUNAL_INDICES:
            raise UnsupportedTribunalError
        process = await self._gateway.query_process(number, tribunal, background=background)
        return ProcessQueryResponse(
            request_id=request_id,
            captured_at=datetime.now(UTC),
            process=process,
        )
