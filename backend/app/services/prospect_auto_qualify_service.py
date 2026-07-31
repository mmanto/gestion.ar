"""
Prospect Auto-Qualify Service

Define la tool que el LLM puede invocar para reportar la calificación por
semáforo (verde/amarillo/rojo) de un caso — ver bot.config.auto_qualify_colors
y el JSON de ius_config (traffic_light/priority) de bots tipo IUS. El LLM no
tiene forma de "avisarle" a código Python qué color determinó salvo mediante
tool calling: esta tool es el puente.

La tool se ofrece SIEMPRE que el bot tenga al menos un color habilitado
(bot.config.auto_qualify_colors no vacío), pero el executor solo aplica la
calificación si el color reportado está efectivamente en esa lista — así el
modelo puede seguir clasificando y llamando la tool sin que el prompt tenga
que replicar la política de "qué colores están habilitados".

La calificación se guarda sobre el Client ya resuelto de la conversación (ver
docs/dev/DECISIONS.md sobre la unificación de Prospect en Client) — no crea
un registro nuevo desconectado.
"""

import asyncio
from typing import Callable, List

from app.models.client import Client, ClientUpdate
from app.services.client_service import get_client_service

QUALIFICATION_TOOL_NAME = "registrar_calificacion_prospecto"

QUALIFICATION_TOOL_SPEC = {
    "name": QUALIFICATION_TOOL_NAME,
    "description": (
        "Registra la calificación final (semáforo: verde, amarillo o rojo) del caso del "
        "usuario junto con un resumen de la información recopilada, para crear el "
        "prospecto correspondiente. Llamala UNA SOLA VEZ por conversación, cuando ya "
        "determinaste con confianza el color según las reglas de 'priority'/'traffic_light' "
        "del JSON de configuración y contás con el nombre del usuario. No hace falta "
        "preguntar el teléfono ni el canal de contacto: ya se conocen del lado del sistema."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "color": {
                "type": "string",
                "enum": ["verde", "amarillo", "rojo"],
                "description": "Color del semáforo determinado para este caso.",
            },
            "nombre": {
                "type": "string",
                "description": "Nombre del usuario, tal como lo mencionó en la conversación.",
            },
            "email": {
                "type": "string",
                "description": "Email del usuario, solo si lo mencionó explícitamente.",
            },
            "resumen_caso": {
                "type": "string",
                "description": (
                    "Resumen breve del caso: tipo de problema, institución (IMSS/ISSSTE), "
                    "tiempo transcurrido desde el hecho, documentación disponible, y "
                    "cualquier otro dato relevante recopilado durante la conversación."
                ),
            },
        },
        "required": ["color", "nombre", "resumen_caso"],
    },
}


def build_qualification_tool_executor(
    client: Client,
    canal: str,
    allowed_colors: List[str],
) -> Callable[[str, dict], dict]:
    """
    Arma la función síncrona que ejecuta la tool cuando el LLM la invoca.

    Corre dentro del thread de asyncio.to_thread en el que vive sync_generate
    (sin event loop propio) — por eso puentea al método async de
    ClientService vía run_coroutine_threadsafe sobre el loop principal
    (capturado acá, en build_qualification_tool_executor, que se llama desde
    _build_llm_tools -- async, corre en el loop principal). Antes se usaba
    asyncio.run(), que crea un loop NUEVO en el thread: como ClientService
    usa el engine de Postgres compartido de toda la app (AsyncSessionLocal),
    cuyas conexiones quedan atadas al loop en el que se usan, eso corrompía
    conexiones pooleadas del engine principal -- mismo bug identificado y
    arreglado en appointment_booking_service.py (incidente 2026-07-31).
    """
    main_loop = asyncio.get_running_loop()

    def _executor(tool_name: str, args: dict) -> dict:
        if tool_name != QUALIFICATION_TOOL_NAME:
            return {"error": f"Tool desconocida: {tool_name}"}

        color = args.get("color")
        if color not in ("verde", "amarillo", "rojo"):
            return {"error": "El campo 'color' debe ser 'verde', 'amarillo' o 'rojo'."}

        nombre = (args.get("nombre") or "").strip()
        if not nombre:
            return {"error": "Falta el nombre del usuario."}

        if color not in allowed_colors:
            return {
                "registered": False,
                "reason": f"El color '{color}' no está habilitado para conversión automática en este bot.",
            }

        email = args.get("email")
        client_update = ClientUpdate(
            color_semaforo=color,
            notas=args.get("resumen_caso"),
            # No pisar datos ya cargados por el cliente en la conversación.
            name=nombre if not client.name else None,
            email=email if (email and not client.email) else None,
        )

        future = asyncio.run_coroutine_threadsafe(
            get_client_service().update_client(client.client_id, client_update), main_loop
        )
        future.result()
        return {"registered": True, "client_id": client.client_id}

    return _executor
