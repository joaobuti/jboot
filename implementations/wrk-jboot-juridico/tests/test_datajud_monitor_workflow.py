"""Regressao: falha de uma execucao do monitor DataJud nao encerra o workflow.

Antes da correcao (Sprint 2 de docs/product/flow-card-actions-sprints.md), um
processo recem-protocolado e ainda nao indexado no DataJud fazia a activity
falhar (404 `process_not_found`), a excecao encerrava o workflow e o monitor
ficava `active` no banco sem nunca mais rodar.
"""

from __future__ import annotations

import uuid

from temporalio import activity
from temporalio.client import WorkflowFailureError
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from src.shared.monitoring import MonitorInput
from src.workflows.datajud_monitor_workflow import DataJudMonitorWorkflow

TASK_QUEUE = "test-datajud-monitor"


async def test_failed_run_waits_next_tick_instead_of_failing_workflow() -> None:
    calls: list[str] = []

    @activity.defn(name="run_datajud_monitor")
    async def flaky_run(input: MonitorInput) -> None:
        calls.append(input.monitor_id)
        if len(calls) == 1:
            raise ApplicationError("process_not_found", non_retryable=True)

    @activity.defn(name="purge_expired_monitors")
    async def purge(input: MonitorInput) -> None:
        return None

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue=TASK_QUEUE, workflows=[DataJudMonitorWorkflow], activities=[flaky_run, purge]):
            handle = await env.client.start_workflow(
                DataJudMonitorWorkflow.run,
                MonitorInput(monitor_id="m-1", client_id="c-1", database_ref="db", cadence_seconds=86_400),
                id=f"datajud-monitor-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            # Pula o tick diario: a segunda execucao so acontece se o loop sobreviveu a primeira falha.
            await env.sleep(86_400 + 60)
            assert len(calls) >= 2
            await handle.signal(DataJudMonitorWorkflow.stop)
            try:
                await handle.result()
            except WorkflowFailureError as error:  # pragma: no cover - falha do teste
                raise AssertionError("workflow nao deveria falhar") from error
