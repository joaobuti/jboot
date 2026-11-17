from __future__ import annotations

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

with workflow.unsafe.imports_passed_through():
    from ..shared.monitoring import MonitorInput, purge_expired_monitors, run_datajud_monitor


@workflow.defn
class DataJudMonitorWorkflow:
    def __init__(self) -> None:
        self._stopped = False
        self._deleted = False

    @workflow.signal
    def stop(self, deleted: bool = False) -> None:
        self._stopped = True
        self._deleted = deleted

    @workflow.run
    async def run(self, input: MonitorInput) -> None:
        while not self._stopped:
            try:
                await workflow.execute_activity(
                    run_datajud_monitor,
                    input,
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=RetryPolicy(initial_interval=timedelta(minutes=1), maximum_attempts=3),
                )
            except ActivityError:
                # Falha de uma execucao nao encerra o acompanhamento: processo
                # recem-protocolado ainda nao indexado no DataJud (404
                # process_not_found) ou provedor fora do ar. O BFF ja registrou
                # o status da execucao; o loop segue para o proximo tick. Sem
                # isso o workflow falhava e o monitor ficava `active` sem rodar.
                workflow.logger.warning("datajud monitor run failed; waiting next tick", extra={"monitor_id": input.monitor_id})
            try:
                await workflow.wait_condition(lambda: self._stopped, timeout=timedelta(seconds=input.cadence_seconds))
            except asyncio.TimeoutError:
                # O timeout representa o próximo tick de cadência, não uma falha.
                pass
        if self._deleted:
            await workflow.sleep(timedelta(days=180))
            await workflow.execute_activity(
                purge_expired_monitors,
                input,
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=RetryPolicy(initial_interval=timedelta(minutes=5), maximum_attempts=10),
            )
