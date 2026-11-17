from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

with workflow.unsafe.imports_passed_through():
    from ..shared.process_monitoring import (
        PROCESS_MONITORING_TASK_QUEUE,
        PROCESS_PUBLICATIONS_TASK_QUEUE,
        ProcessMonitorInput,
        ProcessMonitorPlan,
        plan_process_monitor,
        purge_process_monitors,
        run_process_monitor,
        run_process_publications,
    )


# Workflows ja em execucao passam para a fila nova sem reinicio (Sprint 4).
QUEUE_PATCH = "process-monitoring-queue"


# Ciclo diario com fontes separadas (ADR 022, Sprint 7). Workflows iniciados antes seguem o ciclo antigo
# ate serem reiniciados.
DAILY_PATCH = "process-monitoring-daily-cycle"

# 7h em Brasilia (UTC-3, sem horario de verao desde 2019) = 10h UTC.
DAILY_HOUR_UTC = 10


def next_daily_tick(now: datetime) -> datetime:
    """Proximo dia util as 7h de Brasilia (so fim de semana; feriados fora, ADR 022)."""
    candidate = now.astimezone(timezone.utc).replace(hour=DAILY_HOUR_UTC, minute=0, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def process_monitor_workflow_id(client_id: str, monitor_id: str) -> str:
    return f"process-monitor:{client_id}:{monitor_id}"


@workflow.defn
class ProcessMonitorWorkflow:
    """Um workflow por acompanhamento da capacidade `monitoramento-processual` (ADR 021).

    Mesmo ciclo do `DataJudMonitorWorkflow`, que sai na Sprint 2 junto com a migracao do Juridico.
    """

    def __init__(self) -> None:
        self._stopped = False
        self._deleted = False

    @workflow.signal
    def stop(self, deleted: bool = False) -> None:
        self._stopped = True
        self._deleted = deleted

    @workflow.run
    async def run(self, input: ProcessMonitorInput) -> None:
        if workflow.patched(DAILY_PATCH):
            await self._daily_cycle(input)
        else:
            await self._legacy_cycle(input)
        if self._deleted:
            await workflow.sleep(timedelta(days=180))
            await workflow.execute_activity(
                purge_process_monitors,
                input,
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=RetryPolicy(initial_interval=timedelta(minutes=5), maximum_attempts=10),
            )

    async def _daily_cycle(self, input: ProcessMonitorInput) -> None:
        """Acorda na criacao e depois todo dia util as 7h; cada fonte vencida roda na sua fila."""
        while not self._stopped:
            plan: ProcessMonitorPlan | None = None
            try:
                plan = await workflow.execute_activity(
                    plan_process_monitor,
                    input,
                    start_to_close_timeout=timedelta(minutes=1),
                    retry_policy=RetryPolicy(initial_interval=timedelta(minutes=1), maximum_attempts=5),
                )
            except ActivityError:
                workflow.logger.warning("process monitor plan failed; waiting next tick", extra={"monitor_id": input.monitor_id})
            if plan is not None and not plan.active:
                # Pausado ou excluido sem o sinal de parada ter chegado: encerra em vez de ficar acordando.
                return
            runs = []
            if plan is not None and plan.datajud:
                runs.append(
                    workflow.execute_activity(
                        run_process_monitor,
                        input,
                        task_queue=PROCESS_MONITORING_TASK_QUEUE,
                        start_to_close_timeout=timedelta(minutes=2),
                        retry_policy=RetryPolicy(initial_interval=timedelta(minutes=10), backoff_coefficient=2.0, maximum_attempts=3),
                    )
                )
            if plan is not None and plan.djen:
                runs.append(
                    workflow.execute_activity(
                        run_process_publications,
                        input,
                        task_queue=PROCESS_PUBLICATIONS_TASK_QUEUE,
                        start_to_close_timeout=timedelta(minutes=2),
                        retry_policy=RetryPolicy(initial_interval=timedelta(minutes=10), backoff_coefficient=2.0, maximum_attempts=3),
                    )
                )
            # Uma fonte falhar nao cancela a outra; o BFF ja gravou o status de cada execucao.
            for outcome in await asyncio.gather(*runs, return_exceptions=True):
                if isinstance(outcome, BaseException):
                    workflow.logger.warning("process monitor source failed; waiting next tick", extra={"monitor_id": input.monitor_id})
            wait = next_daily_tick(workflow.now()) - workflow.now()
            try:
                await workflow.wait_condition(lambda: self._stopped, timeout=wait)
            except asyncio.TimeoutError:
                pass

    async def _legacy_cycle(self, input: ProcessMonitorInput) -> None:
        while not self._stopped:
            try:
                if workflow.patched(QUEUE_PATCH):
                    # Fila propria com ritmo controlado; a espera na fila nao conta no timeout da consulta.
                    await workflow.execute_activity(
                        run_process_monitor,
                        input,
                        task_queue=PROCESS_MONITORING_TASK_QUEUE,
                        start_to_close_timeout=timedelta(minutes=2),
                        retry_policy=RetryPolicy(
                            initial_interval=timedelta(minutes=10), backoff_coefficient=2.0, maximum_attempts=3
                        ),
                    )
                else:
                    await workflow.execute_activity(
                        run_process_monitor,
                        input,
                        start_to_close_timeout=timedelta(minutes=2),
                        retry_policy=RetryPolicy(initial_interval=timedelta(minutes=1), maximum_attempts=3),
                    )
            except ActivityError:
                # Processo ainda nao indexado (404) ou provedor fora do ar: o BFF ja gravou o status da
                # execucao; o acompanhamento segue para o proximo tick em vez de encerrar.
                workflow.logger.warning("process monitor run failed; waiting next tick", extra={"monitor_id": input.monitor_id})
            try:
                await workflow.wait_condition(lambda: self._stopped, timeout=timedelta(seconds=input.cadence_seconds))
            except asyncio.TimeoutError:
                pass
