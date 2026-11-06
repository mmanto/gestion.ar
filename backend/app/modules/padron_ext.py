"""
Extensión de chat del módulo `padron` (consulta del padrón electoral).

El LLM invoca la tool `consultar_padron` cuando el vecino pregunta dónde vota.
Como el captcha lo resuelve una persona, la tool no puede completar la consulta
dentro del mismo turno: baja el verificador, lo deja en un widget y guarda el
token en el estado de la conexión. A partir de ahí el interceptor de los turnos
siguientes conduce el resto sin volver a pasar por el LLM. Mientras junta el DNI
y el sexo (`ns["collect"]`), sólo se queda con los turnos que aportan alguno de
esos datos: cualquier otra consulta suelta la recolección y sigue al LLM.

Estado por sesión de chat, en el namespace del módulo (`ns`):
- `ns["pending"]`: `{"token", "ttl", "fetched_at", "args"}` de la consulta en
  curso (lo escribe el executor y lo consume/actualiza el interceptor).
- `ns["result"]`: salida que reemplaza la narración del LLM en el turno que
  arrancó la consulta (mismo mecanismo que `appointments_ext`).

Sólo tiene sentido en canales con sesión (chat web): WhatsApp y Telegram llaman
`run_turn` sin `session` y nunca activan este módulo.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import unicodedata
from typing import Optional

import httpx

from app.services import padron_service

logger = logging.getLogger(__name__)

SOLICITAR_TOOL_NAME = "solicitar_datos_padron"
PADRON_TOOL_NAME = "consultar_padron"

# El verificador del sitio es alfanumérico corto (4-8). El widget manda el
# texto tal cual, pero el usuario puede escribirlo a mano.
CODIGO_RE = re.compile(r"^[A-Za-z0-9]{4,8}$")

# El texto libre no siempre es el código: un "hola" de 4 letras matchea el
# regex del verificador y, sin esta lista, gastaría el token en un POST que el
# sitio responde 401. No se puede exigir dígito: el captcha del sitio puede ser
# sólo letras.
PALABRAS_DE_CHAT = frozenset({
    "hola",
    "holas",
    "buenas",
    "buen",
    "dias",
    "tardes",
    "noches",
    "gracias",
    "dale",
    "listo",
    "okay",
    "perfecto",
    "genial",
    "ayuda",
    "menu",
    "bueno",
    "bien",
    "claro",
    "seguro",
    "espera",
    "momento",
    "captcha",
    "capcha",
    "imagen",
})

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

SOLICITAR_TOOL_SPEC = {
    "name": SOLICITAR_TOOL_NAME,
    "description": (
        "Inicia la consulta del padrón electoral (dónde vota una persona). Usala como PRIMER "
        "paso siempre que pregunten por su lugar de votación, su mesa o su orden, aunque no "
        "tengas ningún dato: pasale sólo lo que el vecino ya dijo y la tool le pide en el chat "
        "lo que falte (DNI y sexo registrado). No inventes DNI ni sexo."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "dni": {
                "type": "integer",
                "description": "DNI sin puntos, sólo si el vecino ya lo dio.",
            },
            "sexo": {
                "type": "string",
                "enum": ["m", "f", "x"],
                "description": "Sexo registrado, sólo si el vecino ya lo dijo: m (varón), f (mujer), x (no binario).",
            },
            "distrito": {
                "type": "integer",
                "description": "Distrito electoral, sólo si el vecino mencionó otra provincia. 2 = Buenos Aires.",
            },
        },
        "required": [],
    },
}

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
    """Normaliza y valida los campos presentes, sin exigir que estén todos."""
    campos: dict = {}

    dni_raw = args.get("dni")
    if dni_raw not in (None, ""):
        if isinstance(dni_raw, str) and dni_raw.strip().isdigit():
            dni_raw = int(dni_raw.strip())
        if isinstance(dni_raw, bool) or not isinstance(dni_raw, int) or not 100_000 <= dni_raw <= 99_999_999:
            return None, "El dni debe ser un número de 6 a 8 dígitos, sin puntos."
        campos["dni"] = dni_raw

    sexo = str(args.get("sexo") or "").strip().lower()
    if sexo:
        if sexo not in {"m", "f", "x"}:
            return None, "El sexo debe ser 'm', 'f' o 'x' (el registrado en el DNI)."
        campos["sexo"] = sexo

    distrito = args.get("distrito")
    if distrito is not None:
        if isinstance(distrito, str) and distrito.strip().isdigit():
            distrito = int(distrito.strip())
        if (
            not isinstance(distrito, int)
            or isinstance(distrito, bool)
            or distrito not in padron_service.DISTRITOS_VALIDOS
        ):
            return None, "El distrito no existe en el padrón nacional."
        campos["distrito"] = distrito

    return campos, None


PREGUNTA_AMBOS = (
    "Para consultar el padrón necesito tu número de DNI (sin puntos) y el sexo que figura "
    "en el documento: varón, mujer o no binario."
)
PREGUNTA_DNI = "¿Cuál es tu número de DNI? (sin puntos)"
PREGUNTA_SEXO = "¿Qué sexo figura en tu documento? varón, mujer o no binario."
CANCELADO = "Listo, cancelé la consulta del padrón. Si querés retomarla, pedímela de nuevo."

CANCELAR = {
    "cancelar",
    "cancela",
    "salir",
    "dejalo",
    "dejalo estar",
    "no quiero",
    "olvidalo",
}

DNI_RE = re.compile(r"\b(\d{6,8})\b")


def _sin_tildes(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c))


def _preguntar_faltantes(datos: dict) -> str:
    falta_dni = "dni" not in datos
    falta_sexo = "sexo" not in datos
    if falta_dni and falta_sexo:
        return PREGUNTA_AMBOS
    if falta_dni:
        return PREGUNTA_DNI
    return PREGUNTA_SEXO


def _extraer_dni(texto: str) -> Optional[int]:
    match = DNI_RE.search(texto.replace(".", ""))
    return int(match.group(1)) if match else None


def _extraer_sexo(texto: str) -> Optional[str]:
    """Reconoce el sexo escrito en lenguaje natural ("soy mujer", "varón", "x")."""
    normalizado = _sin_tildes(texto).strip()
    if normalizado in {"m", "f", "x"}:
        return normalizado
    if "no binari" in normalizado:
        return "x"
    if re.search(r"\b(mujer|femenin[oa])\b", normalizado):
        return "f"
    if re.search(r"\b(varon|hombre|masculin[oa])\b", normalizado):
        return "m"
    return None


def _iniciar_solicitud(ns: dict, campos: dict) -> tuple[dict, str]:
    """Con los datos completos baja el captcha; si faltan, los pide en el chat."""
    if "dni" in campos and "sexo" in campos:
        argumentos = {
            "dni": campos["dni"],
            "sexo": campos["sexo"],
            "distrito": campos.get("distrito", padron_service.DISTRITO_BUENOS_AIRES),
        }
        ns.pop("collect", None)
        return _iniciar(ns, argumentos, CAPTCHA_MESSAGE), "captcha_pendiente"

    ns["collect"] = dict(campos)
    return {"message": _preguntar_faltantes(campos), "widget": None}, "datos_pendientes"


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


def _consultar(pending: dict, texto: str, args: dict) -> dict:
    """POST de la consulta con un cliente propio (corre en un hilo aparte)."""
    with padron_service.nueva_sesion() as client:
        return padron_service.consultar(
            client,
            token=pending["token"],
            codigo=texto,
            dni=args.get("dni"),
            distrito=args.get("distrito", padron_service.DISTRITO_BUENOS_AIRES),
            sexo=args.get("sexo"),
        )


def _derivar(ns: dict) -> dict:
    ns.pop("pending", None)
    return {"message": FALLBACK_MESSAGE, "widget": None}


def provide_tools(bot, client, client_id, canal, ns: dict):
    """Tools del padrón: iniciar pidiendo datos y consultar con los datos completos."""

    def _executor_solicitar(tool_name: str, args: dict) -> dict:
        campos, error = _validar(args or {})
        if error:
            return {"error": error}

        try:
            resultado, status = _iniciar_solicitud(ns, campos)
        except Exception as exc:  # el loop del LLM nunca se corta por el sitio
            logger.warning("Padrón: no se pudo pedir el verificador (%s)", type(exc).__name__)
            ns["result"] = _derivar(ns)
            return {"status": "error"}

        ns["result"] = resultado
        return {"status": status, "message": resultado["message"]}

    def _executor_consultar(tool_name: str, args: dict) -> dict:
        campos, error = _validar(args or {})
        if error:
            return {"error": error}
        if "dni" not in campos or "sexo" not in campos:
            return {"error": "Faltan datos: usá solicitar_datos_padron para pedirlos en el chat."}

        try:
            resultado = _iniciar(
                ns,
                {
                    "dni": campos["dni"],
                    "sexo": campos["sexo"],
                    "distrito": campos.get("distrito", padron_service.DISTRITO_BUENOS_AIRES),
                },
                CAPTCHA_MESSAGE,
            )
        except Exception as exc:  # el loop del LLM nunca se corta por el sitio
            logger.warning("Padrón: no se pudo pedir el verificador (%s)", type(exc).__name__)
            ns["result"] = _derivar(ns)
            return {"status": "error"}

        ns.pop("collect", None)
        ns["result"] = resultado
        return {"status": "captcha_pendiente"}

    return (
        [SOLICITAR_TOOL_SPEC, PADRON_TOOL_SPEC],
        {SOLICITAR_TOOL_NAME: _executor_solicitar, PADRON_TOOL_NAME: _executor_consultar},
    )


async def _resolver_datos(
    ns: dict, collect: dict, texto: str
) -> Optional[dict]:
    """Completa los datos que el vecino escribe en el chat, uno o varios por turno."""
    ns.pop("result", None)

    if _sin_tildes(texto).strip() in CANCELAR:
        ns.pop("collect", None)
        return {"message": CANCELADO, "widget": None}

    datos = dict(collect)
    dni = _extraer_dni(texto)
    if dni is not None and "dni" not in datos:
        datos["dni"] = dni
    sexo = _extraer_sexo(texto)
    if sexo is not None and "sexo" not in datos:
        datos["sexo"] = sexo

    if dni is None and sexo is None:
        # El mensaje no aporta ninguno de los datos que faltan: es otra consulta
        # (o un "no sé"). Se suelta la recolección y el turno sigue al LLM, que
        # puede volver a pedirlos; si no, el chat quedaría repitiendo la misma
        # pregunta en cada mensaje y parecería trabado.
        ns.pop("collect", None)
        return None

    if "dni" in datos and "sexo" in datos:
        ns.pop("collect", None)
        try:
            return await asyncio.to_thread(_iniciar, ns, {
                "dni": datos["dni"],
                "sexo": datos["sexo"],
                "distrito": datos.get("distrito", padron_service.DISTRITO_BUENOS_AIRES),
            }, CAPTCHA_MESSAGE)
        except Exception as exc:
            logger.warning("Padrón: no se pudo pedir el verificador (%s)", type(exc).__name__)
            return _derivar(ns)

    ns["collect"] = datos
    return {"message": _preguntar_faltantes(datos), "widget": None}


async def intercept(bot, client_id: Optional[str], user_text: str, ns: dict) -> Optional[dict]:
    """Resuelve el turno con el código del verificador, si hay uno pendiente."""
    pending = ns.get("pending")
    if not pending:
        collect = ns.get("collect")
        if collect is not None:
            return await _resolver_datos(ns, collect, (user_text or "").strip())
        return None

    # Si el turno anterior dejó un `result` sin consumir, no debe reemplazar la
    # respuesta de un turno del LLM posterior.
    ns.pop("result", None)

    texto = (user_text or "").strip()
    args = pending.get("args") or {}

    if texto.lower() in PEDIR_OTRO:
        try:
            return await asyncio.to_thread(_iniciar, ns, args, CAPTCHA_MESSAGE)
        except Exception as exc:
            logger.warning("Padrón: no se pudo refrescar el verificador (%s)", type(exc).__name__)
            return _derivar(ns)

    if texto.lower() in PALABRAS_DE_CHAT or not CODIGO_RE.match(texto):
        return {"message": NOT_A_CODE_MESSAGE, "widget": None}

    if time.monotonic() - pending.get("fetched_at", 0) >= pending.get("ttl", 0):
        try:
            return await asyncio.to_thread(_iniciar, ns, args, EXPIRED_MESSAGE)
        except Exception as exc:
            logger.warning("Padrón: no se pudo renovar el verificador (%s)", type(exc).__name__)
            return _derivar(ns)

    try:
        # httpx es bloqueante y el interceptor corre en el event loop: el POST
        # va a un hilo para no congelar el resto de los chats del worker.
        resultado = await asyncio.to_thread(_consultar, pending, texto, args)
    except (padron_service.PadronError, httpx.HTTPError) as exc:
        logger.warning("Padrón: falló la consulta (%s)", type(exc).__name__)
        return _derivar(ns)

    status = resultado.get("status")

    if status == 200:
        ns.pop("pending", None)
        return {"message": padron_service.formatear_resultado(resultado.get("data") or {}), "widget": None}

    if status in (401, 403):
        try:
            return await asyncio.to_thread(_iniciar, ns, args, INVALID_CODE_MESSAGE)
        except Exception:
            return _derivar(ns)

    if status == 404:
        ns.pop("pending", None)
        return {"message": NOT_FOUND_MESSAGE, "widget": None}

    if status == 409:
        ns.pop("pending", None)
        return {"message": DISTRITO_MESSAGE, "widget": None}

    return _derivar(ns)
