"""Workflow da capacidade de acompanhamento (ADR 021): falha de uma execucao nao encerra o
acompanhamento, e a rota de start usa o id `process-monitor:{client_id}:{monitor_id}`."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from temporalio import activity
from temporalio.client import WorkflowFailureError
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from datetime import datetime, timezone

from src.shared.process_monitoring import (
    PROCESS_MONITORING_TASK_QUEUE,
    PROCESS_PUBLICATIONS_TASK_QUEUE,
    ProcessMonitorInput,
    ProcessMonitorPlan,
)
from src.workflows.process_monitor_workflow import ProcessMonitorWorkflow, next_daily_tick, process_monitor_workflow_id


def _plan(active: bool = True, datajud: bool = True, djen: bool = False):
    @activity.defn(name="plan_process_monitor")
    async def plan(input: ProcessMonitorInput) -> ProcessMonitorPlan:
        return ProcessMonitorPlan(active=active, datajud=datajud, djen=djen)

    return plan

TASK_QUEUE = "test-process-monitor"


async def test_failed_run_waits_next_tick_and_stop_ends_cleanly() -> None:
    calls: list[str] = []

    @activity.defn(name="run_process_monitor")
    async def flaky_run(input: ProcessMonitorInput) -> None:
        calls.append(input.monitor_id)
        if len(calls) == 1:
            raise ApplicationError("process_not_found", non_retryable=True)

    @activity.defn(name="purge_process_monitors")
    async def purge(input: ProcessMonitorInput) -> None:
        return None

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue=TASK_QUEUE, workflows=[ProcessMonitorWorkflow], activities=[purge, _plan()]), Worker(
            env.client, task_queue=PROCESS_MONITORING_TASK_QUEUE, activities=[flaky_run]
        ):
            handle = await env.client.start_workflow(
                ProcessMonitorWorkflow.run,
                ProcessMonitorInput(monitor_id="m-1", client_id="c-1", cadence_seconds=86_400),
                id=f"process-monitor-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            await env.sleep(4 * 86_400)
            assert len(calls) >= 2
            await handle.signal(ProcessMonitorWorkflow.stop)
            try:
                await handle.result()
            except WorkflowFailureError as error:  # pragma: no cover - falha do teste
                raise AssertionError("workflow nao deveria falhar") from error


def test_workflow_id_is_scoped_by_client_and_monitor() -> None:
    assert process_monitor_workflow_id("c-1", "m-1") == "process-monitor:c-1:m-1"


def test_start_route_rejects_caller_without_internal_secret(monkeypatch) -> None:
    from fastapi import FastAPI

    from src.monitoring_api import process_monitors_router

    monkeypatch.setenv("JBOOT_JURIDICO_WORKER_INTERNAL_SECRET", "secret")
    app = FastAPI()
    app.include_router(process_monitors_router)
    response = TestClient(app).post(
        "/process-monitors",
        json={"monitor_id": "m-1", "client_id": "c-1", "cadence_seconds": 86_400},
        headers={"x-jboot-worker-secret": "wrong"},
    )
    assert response.status_code == 401


async def test_legacy_monitor_activity_no_longer_calls_the_bff(monkeypatch) -> None:
    import httpx
    from temporalio.testing import ActivityEnvironment

    from src.shared.monitoring import MonitorInput, run_datajud_monitor

    def fail(*_args, **_kwargs):  # pragma: no cover - so dispara em regressao
        raise AssertionError("activity legada nao deve chamar o BFF")

    monkeypatch.setattr(httpx.AsyncClient, "post", fail)
    await ActivityEnvironment().run(run_datajud_monitor, MonitorInput(monitor_id="m", client_id="c", database_ref="d", cadence_seconds=86_400))


async def test_runs_go_to_monitoring_queue_and_rate_limit_retries_later() -> None:
    """A consulta roda na fila propria; recusa por excesso tenta de novo so depois de 10 min."""
    attempts: list[int] = []

    @activity.defn(name="run_process_monitor")
    async def limited(input: ProcessMonitorInput) -> None:
        attempts.append(activity.info().attempt)
        if len(attempts) == 1:
            raise ApplicationError("rate limited")

    @activity.defn(name="purge_process_monitors")
    async def purge(input: ProcessMonitorInput) -> None:
        return None

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue=TASK_QUEUE, workflows=[ProcessMonitorWorkflow], activities=[purge, _plan()]), Worker(
            env.client, task_queue=PROCESS_MONITORING_TASK_QUEUE, activities=[limited]
        ):
            handle = await env.client.start_workflow(
                ProcessMonitorWorkflow.run,
                ProcessMonitorInput(monitor_id="m-2", client_id="c-1", cadence_seconds=86_400),
                id=f"process-monitor-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            await env.sleep(5 * 60)
            assert attempts == [1]
            await env.sleep(6 * 60)
            assert attempts == [1, 2]
            await handle.signal(ProcessMonitorWorkflow.stop)
            await handle.result()


class _Response:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        import httpx

        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=httpx.Request("POST", "http://bff"), response=httpx.Response(self.status_code))


async def _run_with_status(monkeypatch, status_code: int) -> None:
    import httpx
    from temporalio.testing import ActivityEnvironment

    from src.shared import process_monitoring

    async def token() -> str:
        return "t"

    async def post(*_args, **_kwargs) -> _Response:
        return _Response(status_code)

    monkeypatch.setattr(process_monitoring, "_service_token", token)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    await ActivityEnvironment().run(
        process_monitoring.run_process_monitor, ProcessMonitorInput(monitor_id="m", client_id="c", cadence_seconds=86_400)
    )


async def test_not_found_is_final_and_rate_limit_is_retryable(monkeypatch) -> None:
    import httpx
    import pytest

    with pytest.raises(ApplicationError) as final:
        await _run_with_status(monkeypatch, 404)
    assert final.value.non_retryable
    with pytest.raises(httpx.HTTPStatusError):
        await _run_with_status(monkeypatch, 429)


def test_queue_pace_comes_from_config(monkeypatch) -> None:
    from src.shared.process_monitoring import process_monitoring_max_concurrency, process_monitoring_rate_per_second

    assert process_monitoring_max_concurrency() == 1
    assert process_monitoring_rate_per_second() == 1.0
    monkeypatch.setenv("JBOOT_PROCESS_MONITORING_MAX_CONCURRENCY", "3")
    monkeypatch.setenv("JBOOT_PROCESS_MONITORING_RATE_PER_SECOND", "0.5")
    assert process_monitoring_max_concurrency() == 3
    assert process_monitoring_rate_per_second() == 0.5


# ---- Sprint 7 (ADR 022): ciclo diario e fontes separadas ----


def test_next_daily_tick_is_7h_brasilia_on_business_days() -> None:
    friday_after = datetime(2026, 11, 6, 11, 0, tzinfo=timezone.utc)
    assert next_daily_tick(friday_after) == datetime(2026, 11, 9, 10, 0, tzinfo=timezone.utc)
    monday_before = datetime(2026, 11, 9, 9, 0, tzinfo=timezone.utc)
    assert next_daily_tick(monday_before) == datetime(2026, 11, 9, 10, 0, tzinfo=timezone.utc)
    saturday = datetime(2026, 11, 7, 8, 0, tzinfo=timezone.utc)
    assert next_daily_tick(saturday) == datetime(2026, 11, 9, 10, 0, tzinfo=timezone.utc)


async def test_each_due_source_runs_on_its_queue_and_one_failure_does_not_block_the_other() -> None:
    datajud_calls: list[str] = []
    djen_calls: list[str] = []

    @activity.defn(name="run_process_monitor")
    async def datajud(input: ProcessMonitorInput) -> None:
        datajud_calls.append(activity.info().task_queue)
        raise ApplicationError("datajud down", non_retryable=True)

    @activity.defn(name="run_process_publications")
    async def djen(input: ProcessMonitorInput) -> None:
        djen_calls.append(activity.info().task_queue)

    @activity.defn(name="purge_process_monitors")
    async def purge(input: ProcessMonitorInput) -> None:
        return None

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client, task_queue=TASK_QUEUE, workflows=[ProcessMonitorWorkflow], activities=[purge, _plan(djen=True)]
        ), Worker(env.client, task_queue=PROCESS_MONITORING_TASK_QUEUE, activities=[datajud]), Worker(
            env.client, task_queue=PROCESS_PUBLICATIONS_TASK_QUEUE, activities=[djen]
        ):
            handle = await env.client.start_workflow(
                ProcessMonitorWorkflow.run,
                ProcessMonitorInput(monitor_id="m-3", client_id="c-1", cadence_seconds=86_400),
                id=f"process-monitor-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            await env.sleep(60)
            assert datajud_calls == [PROCESS_MONITORING_TASK_QUEUE]
            assert djen_calls == [PROCESS_PUBLICATIONS_TASK_QUEUE]
            await handle.signal(ProcessMonitorWorkflow.stop)
            await handle.result()


async def test_inactive_plan_ends_the_workflow_without_running_sources() -> None:
    ran: list[str] = []

    @activity.defn(name="run_process_monitor")
    async def datajud(input: ProcessMonitorInput) -> None:
        ran.append("datajud")

    @activity.defn(name="purge_process_monitors")
    async def purge(input: ProcessMonitorInput) -> None:
        return None

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client, task_queue=TASK_QUEUE, workflows=[ProcessMonitorWorkflow], activities=[purge, _plan(active=False)]
        ), Worker(env.client, task_queue=PROCESS_MONITORING_TASK_QUEUE, activities=[datajud]):
            handle = await env.client.start_workflow(
                ProcessMonitorWorkflow.run,
                ProcessMonitorInput(monitor_id="m-4", client_id="c-1", cadence_seconds=86_400),
                id=f"process-monitor-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            await handle.result()
    assert ran == []


async def test_publications_activity_not_found_is_final(monkeypatch) -> None:
    import httpx
    import pytest
    from temporalio.testing import ActivityEnvironment

    from src.shared import process_monitoring

    async def token() -> str:
        return "t"

    async def post(*_args, **_kwargs) -> _Response:
        return _Response(404)

    monkeypatch.setattr(process_monitoring, "_service_token", token)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    with pytest.raises(ApplicationError) as final:
        await ActivityEnvironment().run(
            process_monitoring.run_process_publications, ProcessMonitorInput(monitor_id="m", client_id="c", cadence_seconds=86_400)
        )
    assert final.value.non_retryable
