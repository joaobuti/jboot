import asyncio
import os

import uvicorn
from temporalio.client import Client
from temporalio.worker import Worker

from ..activities.consulta_activity import consulta_activity, register_portal
from ..otel import setup_otel
from ..portals.eproc import EprocTjscAdapter
from ..workflows.consulta_workflow import ConsultaWorkflow
from ..workflows.datajud_monitor_workflow import DataJudMonitorWorkflow
from ..shared.monitoring import purge_expired_monitors, run_datajud_monitor
from ..shared.process_monitoring import (
    PROCESS_MONITORING_TASK_QUEUE,
    PROCESS_PUBLICATIONS_TASK_QUEUE,
    plan_process_monitor,
    process_monitoring_max_concurrency,
    process_monitoring_rate_per_second,
    process_publications_max_concurrency,
    process_publications_rate_per_second,
    purge_process_monitors,
    run_process_monitor,
    run_process_publications,
)
from ..workflows.process_monitor_workflow import ProcessMonitorWorkflow

TEMPORAL_ADDRESS = os.getenv("TEMPORAL_ADDRESS", "temporal:7233")
TASK_QUEUE = "juridico-scraping"
WORKER_API_PORT = int(os.getenv("JBOOT_WORKER_API_PORT", "8020"))


async def _run_temporal_worker(client: Client) -> None:
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[ConsultaWorkflow, DataJudMonitorWorkflow, ProcessMonitorWorkflow],
        activities=[consulta_activity, run_datajud_monitor, purge_expired_monitors, run_process_monitor, purge_process_monitors, plan_process_monitor],
    )
    # Consultas do acompanhamento: fila propria, uma por vez e com ritmo limitado na fila inteira.
    monitoring_worker = Worker(
        client,
        task_queue=PROCESS_MONITORING_TASK_QUEUE,
        activities=[run_process_monitor],
        max_concurrent_activities=process_monitoring_max_concurrency(),
        max_task_queue_activities_per_second=process_monitoring_rate_per_second(),
    )
    # Publicacoes do DJEN (ADR 022): fila propria, para nao esperar atras das consultas lentas do DataJud.
    publications_worker = Worker(
        client,
        task_queue=PROCESS_PUBLICATIONS_TASK_QUEUE,
        activities=[run_process_publications],
        max_concurrent_activities=process_publications_max_concurrency(),
        max_task_queue_activities_per_second=process_publications_rate_per_second(),
    )
    print(
        f"Temporal worker conectado em {TEMPORAL_ADDRESS} — "
        f"queues={TASK_QUEUE},{PROCESS_MONITORING_TASK_QUEUE},{PROCESS_PUBLICATIONS_TASK_QUEUE}"
    )
    await asyncio.gather(worker.run(), monitoring_worker.run(), publications_worker.run())


async def _run_api_server() -> None:
    from ..portals.eproc.api import app as worker_api
    from ..monitoring_api import process_monitors_router
    from ..monitoring_api import router as monitoring_router

    worker_api.include_router(monitoring_router)
    worker_api.include_router(process_monitors_router)

    config = uvicorn.Config(worker_api, host="0.0.0.0", port=WORKER_API_PORT, log_level="info")
    server = uvicorn.Server(config)
    print(f"Worker API rodando em http://0.0.0.0:{WORKER_API_PORT}")
    await server.serve()


async def _connect_temporal_worker() -> None:
    try:
        client = await Client.connect(TEMPORAL_ADDRESS)
        await _run_temporal_worker(client)
    except Exception as exc:
        print(f"[worker] Temporal indisponível em {TEMPORAL_ADDRESS}: {exc}")
        print("[worker] API continua rodando sem Temporal worker")


async def main() -> None:
    setup_otel()

    register_portal(EprocTjscAdapter())

    await asyncio.gather(
        _connect_temporal_worker(),
        _run_api_server(),
    )


if __name__ == "__main__":
    asyncio.run(main())
