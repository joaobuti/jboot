from __future__ import annotations

import asyncio
import json
from typing import Any

import asyncpg
from temporalio import activity


async def update_phase(
    conn: asyncpg.Connection,
    setup_id: str,
    phase: str,
    *,
    available_profiles: list[dict[str, str]] | None = None,
    error_message: str | None = None,
) -> None:
    await conn.execute(
        """UPDATE juridico_eproc_sessions
           SET phase = $2,
               available_profiles = $3::jsonb,
               error_message = $4,
               updated_at = now()
           WHERE id = $1""",
        setup_id,
        phase,
        json.dumps(available_profiles) if available_profiles is not None else None,
        error_message,
    )


async def save_session(conn: asyncpg.Connection, setup_id: str, encrypted: bytes) -> None:
    await conn.execute(
        """UPDATE juridico_eproc_sessions
           SET phase = 'completed',
               session_state_enc = $2,
               encryption_key_ref = 'hmac-v1',
               updated_at = now()
           WHERE id = $1""",
        setup_id,
        encrypted,
    )


async def poll_for_field(
    conn: asyncpg.Connection,
    setup_id: str,
    field: str,
    *,
    timeout_seconds: int = 600,
    poll_interval: float = 4.0,
) -> str:
    """Polls the DB for a field to be populated.

    This helper is used by both HTTP-driven setup flows and Temporal activities.
    Temporal heartbeat is only valid inside an activity context.
    """
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    while True:
        try:
            activity.heartbeat({"waiting_for": field})
        except RuntimeError as exc:
            if str(exc) != "Not in activity context":
                raise
        row: asyncpg.Record | None = await conn.fetchrow(
            f"SELECT {field} FROM juridico_eproc_sessions WHERE id = $1",
            setup_id,
        )
        value: Any = row[field] if row else None
        if value:
            return str(value)
        if asyncio.get_event_loop().time() >= deadline:
            raise TimeoutError(f"Timeout waiting for field '{field}' on setup {setup_id}")
        await asyncio.sleep(poll_interval)


async def get_active_session(
    conn: asyncpg.Connection,
    client_id: str,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """SELECT id, session_state_enc, encryption_key_ref, created_at
           FROM juridico_eproc_sessions
           WHERE client_id = $1 AND phase = 'completed'
           ORDER BY created_at DESC
           LIMIT 1""",
        client_id,
    )
    if not row:
        return None
    return dict(row)
