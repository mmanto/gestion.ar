"""
Extensión de chat del módulo `padron` (consulta del padrón electoral).

El LLM invoca la tool `consultar_padron` cuando el vecino pregunta dónde vota.
Como el captcha lo resuelve una persona, la tool no puede completar la consulta
dentro del mismo turno: baja el verificador, lo deja en un widget y guarda el
token en el estado de la conexión. A partir de ahí el interceptor de los turnos
siguientes conduce el resto sin volver a pasar por el LLM.

Estado por sesión de chat, en el namespace del módulo (`ns`):
- `ns["pending"]`: `{"token", "ttl", "fetched_at", "args"}` de la consulta en
  curso (lo escribe el executor y lo consume/actualiza el interceptor).
- `ns["result"]`: salida que reemplaza la narración del LLM en el turno que
  arrancó la consulta (mismo mecanismo que `appointments_ext`).

Sólo tiene sentido en canales con sesión (chat web): WhatsApp y Telegram llaman
`run_turn` sin `session` y nunca activan este módulo.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Optional

import httpx

from app.services import padron_service

logger = logging.getLogger(__name__)

PADRON_TOOL_NAME = "consultar_padron"

# El verificador del sitio es alfanumérico corto (4-8). El widget manda el
# texto tal cual, pero el usuario puede escribirlo a mano.
CODIGO_RE = re.compile(r"^[A-Za-z0-9]{4,8}$")

PEDIR_OTRO = {
    "otro",
    "otro captcha",
    "otra imagen",
    "actualizar",
    "cambiar",
    "no se lee",
    "no lo veo",
}

CAPTCHA_MESSAGE = (
    "Para consultar el padrón necesito que resuelvas el verificador. "
    "Escribí el código que ves en la imagen."
)
EXPIRED_MESSAGE = "El verificador venció. Te muestro uno nuevo: escribí el código que ves."
INVALID_CODE_MESSAGE = "El código no era correcto. Te muestro otro verificador."
NOT_A_CODE_MESSAGE = "Escribí el código que se ve en la imagen (letras y números, sin espacios)."
NOT_FOUND_MESSAGE = "No encontré esos datos en el padrón. Revisá el número de DNI y el sexo registrado."
DISTRITO_MESSAGE = "Ese distrito no está habilitado para la consulta del padrón."
FALLBACK_MESSAGE = (
    "No pude conectarme al padrón en este momento. "
    "Podés consultarlo directamente en https://www.padron.gob.ar/"
)

PADRON_TOOL_SPEC = {
    "name": PADRON_TOOL_NAME,
    "description": (
        "Consulta el padrón electoral nacional (Justicia Nacional Electoral) para saber dónde vota "
        "una persona: establecimiento, dirección, mesa y orden. Usala cuando pregunten por su lugar "
        "de votación, su mesa o su orden en el padrón. Necesita el DNI sin puntos y el sexo "
        "registrado en el DNI; si el vecino no los dio, pedíselos antes de llamarla. Requiere que el "
        "usuario resuelva un verificador (captcha) que se le muestra en el chat: no inventes el "
        "código ni llames la tool de nuevo para 'reintentar' — el flujo lo continúa solo."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "dni": {
                "type": "integer",
                "description": "Número de DNI sin puntos (6 a 8 dígitos).",
            },
            "sexo": {
                "type": "string",
                "enum": ["m", "f", "x"],
                "description": "Sexo registrado en el DNI: m (varón), f (mujer), x (no binario).",
            },
            "distrito": {
                "type": "integer",
                "description": "Distrito electoral. 2 = Buenos Aires (default).",
                "default": padron_service.DISTRITO_BUENOS_AIRES,
            },
        },
        "required": ["dni", "sexo"],
    },
}


def _validar(args: dict) -> tuple[Optional[dict], Optional[str]]:
    """Normaliza y valida los argumentos del LLM sin tocar la red."""
    dni_raw = args.get("dni")
    if isinstance(dni_raw, str) and dni_raw.strip().isdigit():
        dni_raw = int(dni_raw.strip())
    if isinstance(dni_raw, bool) or not isinstance(dni_raw, int) or not 100_000 <= dni_raw <= 99_999_999:
        return None, "El dni debe ser un número de 6 a 8 dígitos, sin puntos."

    sexo = str(args.get("sexo") or "").strip().lower()
    if sexo not in {"m", "f", "x"}:
        return None, "El sexo debe ser 'm', 'f' o 'x' (el registrado en el DNI)."

    distrito = args.get("distrito", padron_service.DISTRITO_BUENOS_AIRES)
    if isinstance(distrito, str) and distrito.strip().isdigit():
        distrito = int(distrito.strip())
    if not isinstance(distrito, int) or isinstance(distrito, bool) or distrito not in padron_service.DISTRITOS_VALIDOS:
        return None, "El distrito no existe en el padrón nacional."

    return {"dni": dni_raw, "sexo": sexo, "distrito": distrito}, None


def _iniciar(ns: dict, args: dict, mensaje: str) -> dict:
    """Baja un verificador, lo deja pendiente y devuelve el mensaje con el widget.

    El cliente se arma por llamada: el token viaja como cookie explícita en el
    POST de consulta, así que no hace falta conservar cookies entre turnos.
    """
    with padron_service.nueva_sesion() as client:
        captcha = padron_service.fetch_captcha(client)

    ns["pending"] = {
        "token": captcha.token,
        "ttl": captcha.ttl,
        "fetched_at": time.monotonic(),
        "args": args,
    }
    return {"message": mensaje, "widget": padron_service.captcha_widget(captcha)}


def _derivar(ns: dict) -> dict:
    ns.pop("pending", None)
    return {"message": FALLBACK_MESSAGE, "widget": None}


def provide_tools(bot, client, client_id, canal, ns: dict):
    """Tool de inicio: el LLM decide cuándo consultar el padrón."""

    def _executor(tool_name: str, args: dict) -> dict:
        parsed, error = _validar(args or {})
        if error:
            return {"error": error}

        try:
            resultado = _iniciar(ns, parsed, CAPTCHA_MESSAGE)
        except Exception as exc:  # el loop del LLM nunca se corta por el sitio
            logger.warning("Padrón: no se pudo pedir el verificador (%s)", type(exc).__name__)
            ns["result"] = _derivar(ns)
            return {"status": "error"}

        ns["result"] = resultado
        return {"status": "captcha_pendiente"}

    return [PADRON_TOOL_SPEC], {PADRON_TOOL_NAME: _executor}


async def intercept(bot, client_id: Optional[str], user_text: str, ns: dict) -> Optional[dict]:
    """Resuelve el turno con el código del verificador, si hay uno pendiente."""
    pending = ns.get("pending")
    if not pending:
        return None

    # Si el turno anterior dejó un `result` sin consumir, no debe reemplazar la
    # respuesta de un turno del LLM posterior.
    ns.pop("result", None)

    texto = (user_text or "").strip()
    args = pending.get("args") or {}

    if texto.lower() in PEDIR_OTRO:
        try:
            return _iniciar(ns, args, CAPTCHA_MESSAGE)
        except Exception as exc:
            logger.warning("Padrón: no se pudo refrescar el verificador (%s)", type(exc).__name__)
            return _derivar(ns)

    if not CODIGO_RE.match(texto):
        return {"message": NOT_A_CODE_MESSAGE, "widget": None}

    if time.monotonic() - pending.get("fetched_at", 0) >= pending.get("ttl", 0):
        try:
            return _iniciar(ns, args, EXPIRED_MESSAGE)
        except Exception as exc:
            logger.warning("Padrón: no se pudo renovar el verificador (%s)", type(exc).__name__)
            return _derivar(ns)

    try:
        with padron_service.nueva_sesion() as client:
            resultado = padron_service.consultar(
                client,
                token=pending["token"],
                codigo=texto,
                dni=args.get("dni"),
                distrito=args.get("distrito", padron_service.DISTRITO_BUENOS_AIRES),
                sexo=args.get("sexo"),
            )
    except (padron_service.PadronError, httpx.HTTPError) as exc:
        logger.warning("Padrón: falló la consulta (%s)", type(exc).__name__)
        return _derivar(ns)

    status = resultado.get("status")

    if status == 200:
        ns.pop("pending", None)
        return {"message": padron_service.formatear_resultado(resultado.get("data") or {}), "widget": None}

    if status in (401, 403):
        try:
            return _iniciar(ns, args, INVALID_CODE_MESSAGE)
        except Exception:
            return _derivar(ns)

    if status == 404:
        ns.pop("pending", None)
        return {"message": NOT_FOUND_MESSAGE, "widget": None}

    if status == 409:
        ns.pop("pending", None)
        return {"message": DISTRITO_MESSAGE, "widget": None}

    return _derivar(ns)
