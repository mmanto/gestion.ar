"""
Regresión: las tools que el LLM invoca (reserva de turnos, calificación por
semáforo) corren dentro de un thread aparte (ver DeepSeekService/
ClaudeService.sync_generate -> asyncio.to_thread) y necesitan puentear a
código async que usa el engine de Postgres compartido de toda la app
(AsyncSessionLocal). Antes usaban asyncio.run(...), que crea un event loop
NUEVO en ese thread -- como las conexiones pooleadas del engine quedan
atadas al loop en el que se usan, eso las corrompía (sesiones "idle in
transaction" colgadas para siempre, bloqueando el resto de la app con locks;
incidente de producción 2026-07-31). El fix usa
asyncio.run_coroutine_threadsafe sobre el loop principal en su lugar.

Estos tests no tocan DB/HTTP real: verifican que la corrutina realmente se
ejecuta en el loop principal (el mismo que corría cuando se armó el
executor) y no en uno nuevo creado dentro del thread worker.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services import appointment_booking_service, prospect_auto_qualify_service


async def _run_executor_in_worker_thread(executor, tool_name: str, args: dict) -> dict:
    """Simula exactamente cómo sync_generate invoca la tool: de forma
    síncrona, dentro de un thread que no tiene su propio event loop
    corriendo (equivalente a asyncio.to_thread, que es justo lo que se usa
    acá -- a diferencia de un threading.Thread + join síncrono, esto NO
    bloquea el loop principal, así que run_coroutine_threadsafe puede
    resolverse ahí en vez de deadlockear)."""
    return await asyncio.wait_for(
        asyncio.to_thread(executor, tool_name, args), timeout=5
    )


@pytest.mark.asyncio
async def test_booking_tool_executor_runs_coroutine_on_main_loop_not_a_new_one():
    main_loop = asyncio.get_running_loop()
    seen_loop = {}

    async def fake_start_booking(bot, client_id):
        seen_loop["loop"] = asyncio.get_running_loop()
        return "fake-state", {"message": "ok", "widget": None}

    bot = SimpleNamespace(bot_id="bot_test", metadata={})
    output: dict = {}

    with patch.object(appointment_booking_service, "start_booking", fake_start_booking):
        executor = appointment_booking_service.build_booking_tool_executor(bot, "client_1", output)
        result = await _run_executor_in_worker_thread(
            executor, appointment_booking_service.BOOKING_TOOL_NAME, {}
        )

    assert result == {"iniciado": True}
    assert output["state"] == "fake-state"
    assert output["result"] == {"message": "ok", "widget": None}
    # La parte que importa: la corrutina corrió en el MISMO loop que ya
    # estaba corriendo cuando se armó el executor -- no uno nuevo (asyncio.run
    # crearía uno distinto acá, y eso es justamente lo que rompía conexiones
    # pooleadas del engine compartido).
    assert seen_loop["loop"] is main_loop


@pytest.mark.asyncio
async def test_qualification_tool_executor_runs_coroutine_on_main_loop_not_a_new_one():
    main_loop = asyncio.get_running_loop()
    seen_loop = {}

    async def fake_update_client(client_id, client_update):
        seen_loop["loop"] = asyncio.get_running_loop()
        return SimpleNamespace(client_id=client_id)

    fake_client_service = SimpleNamespace(update_client=fake_update_client)
    client = SimpleNamespace(client_id="client_1", name="Ya tiene nombre", email=None)

    with patch.object(
        prospect_auto_qualify_service, "get_client_service", lambda: fake_client_service
    ):
        executor = prospect_auto_qualify_service.build_qualification_tool_executor(
            client=client, canal="web", allowed_colors=["verde", "amarillo", "rojo"]
        )
        result = await _run_executor_in_worker_thread(
            executor,
            prospect_auto_qualify_service.QUALIFICATION_TOOL_NAME,
            {"color": "verde", "nombre": "Juana", "resumen_caso": "resumen"},
        )

    assert result == {"registered": True, "client_id": "client_1"}
    assert seen_loop["loop"] is main_loop
