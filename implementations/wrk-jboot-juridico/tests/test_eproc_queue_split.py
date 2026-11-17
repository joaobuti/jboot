import inspect
import asyncio
import uuid

import pytest

from src.portals.eproc import adapter as eproc_adapter
from src.portals.eproc import api as eproc_api
from src.portals.eproc.adapter import EprocTjscAdapter
from src.shared.errors import PortalUnavailableError


def test_batch_consultation_does_not_enrich_details_by_default() -> None:
    signature = inspect.signature(EprocTjscAdapter.execute_batch)

    assert signature.parameters["enrich_details"].default is False


@pytest.mark.asyncio
async def test_bounded_portal_operation_converts_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eproc_adapter, "OPERATION_TIMEOUT_SECONDS", 0)

    with pytest.raises(PortalUnavailableError, match="eProc operation timed out"):
        await eproc_adapter._bounded_portal_operation("test-operation", asyncio.sleep(1))


def test_fallback_parties_are_extracted_from_result_row() -> None:
    adapter = EprocTjscAdapter()

    parties = adapter._fallback_parties_from_result(
        {
            "autor": "<b>GILSON DA COSTA CARVALHO</b>",
            "reu": "ESTADO DE SANTA CATARINA",
        }
    )

    assert parties == [
        {
            "role": "autor",
            "label": "AUTOR",
            "name": "GILSON DA COSTA CARVALHO",
            "text": "GILSON DA COSTA CARVALHO",
            "source": "result_row",
        },
        {
            "role": "reu",
            "label": "RÉU",
            "name": "ESTADO DE SANTA CATARINA",
            "text": "ESTADO DE SANTA CATARINA",
            "source": "result_row",
        },
    ]


def test_keyword_match_persists_only_matching_processes() -> None:
    decisions = eproc_api._process_persistence_decisions(
        [
            {"numero": "1", "data_autuacao": "2099-01-01", "raw_data": {"reu": "Banco Crefisa"}},
            {"numero": "2", "data_autuacao": "2099-01-01", "raw_data": {"reu": "Outro banco"}},
        ],
        "crefisa",
    )

    assert [decision["should_persist"] for decision in decisions] == [True, False]


def test_keyword_without_match_falls_back_to_last_five_years() -> None:
    decisions = eproc_api._process_persistence_decisions(
        [
            {"numero": "1", "data_autuacao": "2099-01-01", "raw_data": {"reu": "Outro banco"}},
            {"numero": "2", "data_autuacao": "2000-01-01", "raw_data": {"reu": "Outro banco"}},
        ],
        "crefisa",
    )

    assert [decision["should_persist"] for decision in decisions] == [True, False]


class _RecordingConnection:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[object, ...]]] = []

    async def execute(self, query: str, *args: object) -> str:
        self.executed.append((query, args))
        return "UPDATE 1"


@pytest.mark.asyncio
async def test_failed_or_cancelled_job_releases_done_consultations_for_retry() -> None:
    conn = _RecordingConnection()

    await eproc_api._release_job_retriable_consultations(conn, str(uuid.uuid4()))

    query = conn.executed[0][0]

    assert "status IN ('pending', 'running', 'done')" in query
    assert "last_consulted_at = CASE WHEN status = 'done' THEN NULL ELSE last_consulted_at END" in query
    assert "error_message = NULL" in query


@pytest.mark.asyncio
async def test_reconsulted_process_always_reopens_detail_enrichment_job() -> None:
    conn = _RecordingConnection()

    await eproc_api._enqueue_process_enrichment(conn, str(uuid.uuid4()), str(uuid.uuid4()))

    query = conn.executed[0][0]

    assert "ON CONFLICT (process_id) DO UPDATE" in query
    assert "SET status = 'pending'" in query
    assert "last_error = NULL" in query
    assert "WHEN juridico_eproc_process_enrichment_jobs.status = 'done'" not in query


def test_detail_enrichment_requires_detail_page_source() -> None:
    assert eproc_api._has_detail_page_parties(
        [{"source": "detail_page", "name": "PARTE", "representatives": []}]
    )
    assert not eproc_api._has_detail_page_parties(
        [{"source": "result_row", "name": "PARTE"}]
    )
