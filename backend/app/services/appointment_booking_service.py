"""
AppointmentBookingService - máquina de estados para reservar un turno dentro
del chat web (canal web únicamente, ver web_chat_router.py), con un widget de
calendario visual (día -> horario -> confirmar) en vez de una lista de texto
numerada.

Inspirada en el patrón de FlowState (conversation_flow_service.py), con una
diferencia deliberada: sus métodos son async porque necesitan pegarle a
devbout-appointments (list_slots/create_appointment) vía AppointmentsClient,
algo que FlowState no necesita hacer.

v2: el bot puede tener varios recursos asociados al servicio por defecto
(médicos, canchas, ventanillas...); antes del calendario se resuelve CUÁL
recurso según la "selection strategy" configurada en `Service.extra.selection`
(ver resolve_info_fields/_resolve_selection más abajo):
  - single: implícito si el servicio tiene 1 solo recurso asociado.
  - ask_by_name: lista los recursos por nombre, el cliente elige.
  - filter_then_select: pregunta un atributo (ej. especialidad) calculado
    dinámicamente entre `Resource.extra`, narrows y si queda 1 lo asigna
    directo, si quedan varios cae a ask_by_name entre los que sobrevivieron.
  - auto: asigna el recurso con el horario disponible más próximo, sin
    preguntar nada (se resuelve recién al elegir el horario).
Si el bot no tiene el servicio configurado, o el servicio no tiene recursos
asociados (setup legacy, no migrado), se cae al comportamiento histórico: un
único recurso (`resource_ids[0]`), sin ninguna pregunta de por medio.

Los datos que se piden antes del calendario (`info_fields`) también son
configurables (override por servicio -> default del bot -> el set
hardcodeado histórico nombre/apellido/DNI/WhatsApp), para adaptarse a
verticales con necesidades distintas (ej. CUIT/n° de expediente en trámites
administrativos). Detección de intención por palabra clave simple (no
tool-use de Claude, que no existe hoy en este codebase).

Cada paso devuelve, además del texto plano de siempre (content/fallback), una
clave "widget" lista para mandar tal cual como metadata del mensaje WebSocket
— así el frontend puede pintar un calendario/chips clickeables. Un click en
el widget simplemente manda como texto el valor elegido (mismo canal que si
el usuario lo hubiera tipeado), así que el protocolo cliente→servidor no
cambia.
"""

import asyncio
import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import List, Optional
from zoneinfo import ZoneInfo

from app.integrations.appointments_client import AppointmentsClient, SlotUnavailableError, get_appointments_client
from app.models.bot import Bot
from app.models.client import ClientUpdate
from app.services.client_service import get_client_service
from app.services.module_service import get_module_service

MODULE_KEY = "appointments"

BOOKING_KEYWORDS = ("turno", "turnos", "cita", "citas", "reservar", "agendar", "reserva", "/turno")
CANCEL_WORDS = ("cancelar", "cancela", "/cancelar")
BACK_WORDS = ("volver", "atras", "atrás", "back")

_KEYWORD_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(k).replace(r"\/", "/") for k in BOOKING_KEYWORDS) + r")\b",
    re.IGNORECASE,
)
_CANCEL_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in CANCEL_WORDS) + r")\b", re.IGNORECASE
)
_BACK_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in BACK_WORDS) + r")\b", re.IGNORECASE
)

_WEEKDAY_LONG = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")

# Set histórico de datos del paciente, usado como último fallback si ni el
# servicio ni el bot configuraron info_fields propios (ver resolve_info_fields)
# -- así un bot que nunca tocó esta config sigue pidiendo lo mismo que antes.
_DEFAULT_INFO_FIELDS: List[dict] = [
    {"key": "nombre", "label": "¿Cuál es tu nombre?", "type": "text"},
    {"key": "apellido", "label": "¿Y tu apellido?", "type": "text"},
    {"key": "dni", "label": "¿Tu número de DNI? (solo números)", "type": "numeric_id", "min_length": 6, "max_length": 10},
    {
        "key": "whatsapp",
        "label": "Por último, ¿tu número de WhatsApp? (para avisarte sobre el turno)",
        "type": "phone",
    },
]

# Únicos keys que se vuelcan al Client (ver _save_captured_info) porque su
# modelo los conoce. Cualquier otro key de info_fields (cuit, numero_expediente,
# obra_social, etc.) viaja en el metadata.custom_fields del Appointment.
_WELL_KNOWN_INFO_KEYS = {"nombre", "apellido", "dni", "whatsapp"}

# Cubre el resto del mes actual + el mes calendario siguiente completo en una
# sola llamada a list_slots, para que el frontend pueda navegar entre esos
# dos meses en el calendario sin pedirle al backend un re-fetch.
DAYS_AHEAD = 62


class ResourceSelectionStrategy(str, Enum):
    SINGLE = "single"
    ASK_BY_NAME = "ask_by_name"
    FILTER_THEN_SELECT = "filter_then_select"
    AUTO = "auto"


def _info_result(message: str) -> dict:
    return {"message": message, "done": False, "cancelled": False, "appointment": None, "widget": None}


def detects_booking_intent(text: str) -> bool:
    return bool(_KEYWORD_PATTERN.search(text or ""))


def _is_cancel_word(text: str) -> bool:
    return bool(_CANCEL_PATTERN.search(text or ""))


def _is_back_word(text: str) -> bool:
    return bool(_BACK_PATTERN.search(text or ""))


def resolve_info_fields(service: Optional[dict], bot_config: dict) -> List[dict]:
    """Cadena de fallback: override por servicio -> default del bot -> el set
    hardcodeado histórico, para que un bot que nunca configuró nada siga
    pidiendo exactamente lo mismo que antes."""
    service_fields = ((service or {}).get("metadata") or {}).get("info_fields")
    if service_fields:
        return service_fields
    bot_fields = bot_config.get("default_info_fields")
    if bot_fields:
        return bot_fields
    return _DEFAULT_INFO_FIELDS


def _resolve_selection(service: Optional[dict], candidate_count: int) -> dict:
    """Estrategia de selección de recurso a usar. Si hay 0-1 candidatos no
    hay nada que elegir, sin importar lo configurado -- preguntar sería
    ruido. Con 2+, usa lo configurado en Service.extra.selection.strategy,
    o ask_by_name si no hay nada configurado (o lo configurado es inválido)."""
    if candidate_count <= 1:
        return {"strategy": ResourceSelectionStrategy.SINGLE.value, "filter": {}}

    raw = ((service or {}).get("metadata") or {}).get("selection") or {}
    strategy = raw.get("strategy")
    valid_strategies = {s.value for s in ResourceSelectionStrategy}
    if strategy not in valid_strategies or strategy == ResourceSelectionStrategy.SINGLE.value:
        strategy = ResourceSelectionStrategy.ASK_BY_NAME.value
    return {"strategy": strategy, "filter": raw.get("filter") or {}}


async def _load_candidate_resources(
    client: AppointmentsClient, service_id: Optional[str], bot_resource_ids: List[str]
) -> List[dict]:
    """Recursos activos que ofrecen el servicio Y pertenecen al bot (aislamiento
    entre bots, mismo criterio que appointments_router.py). Lista vacía si no
    hay service_id, si devbout-appointments no responde, o si el servicio no
    tiene ningún recurso asociado -- el caller decide el fallback."""
    if not service_id:
        return []
    try:
        resources = await client.list_service_resources(service_id)
    except Exception:
        return []
    allowed = set(bot_resource_ids)
    return [r for r in resources if r.get("id") in allowed and r.get("is_active", True)]


class BookingStage(str, Enum):
    COLLECTING_INFO = "collecting_info"
    SELECTING_FILTER = "selecting_filter"
    SELECTING_RESOURCE = "selecting_resource"
    SELECTING_DAY = "selecting_day"
    SELECTING_TIME = "selecting_time"
    CONFIRMING = "confirming"


class BookingState:
    def __init__(
        self,
        bot_id: str,
        client_id: Optional[str],
        service_id: Optional[str],
        candidates: List[dict],
        service: Optional[dict],
        info_fields: List[dict],
        client_name: Optional[str] = None,
        client_dni: Optional[str] = None,
        client_phone: Optional[str] = None,
        appointments_client: Optional[AppointmentsClient] = None,
    ):
        self.bot_id = bot_id
        self.client_id = client_id
        self.service_id = service_id
        self.candidates = candidates
        self.selection = _resolve_selection(service, len(candidates))
        self.resource_id: Optional[str] = None
        self._resource_pool: List[dict] = []
        self.client = appointments_client or get_appointments_client()
        self.resource_tz: ZoneInfo = ZoneInfo("UTC")
        self.days_index: dict[str, list[dict]] = {}
        self.date_from: str = ""
        self.date_to: str = ""
        self.selected_day: Optional[str] = None
        self.selected_slot: Optional[dict] = None

        # Campos de info que faltan (ver resolve_info_fields) -- se saltan los
        # "bien conocidos" que el Client ya tiene cargados (por otro medio:
        # flow, chat libre, o una reserva anterior). Los custom siempre se
        # preguntan porque el Client no tiene dónde guardarlos de antemano.
        self.info_fields: dict[str, dict] = {f["key"]: f for f in info_fields}
        self.pending_info: List[str] = []
        for field in info_fields:
            key = field["key"]
            if key in ("nombre", "apellido") and client_name:
                continue
            if key == "dni" and client_dni:
                continue
            if key == "whatsapp" and client_phone:
                continue
            self.pending_info.append(key)
        self.info_index = 0
        self.captured_info: dict[str, str] = {}

        self.stage = BookingStage.COLLECTING_INFO if self.pending_info else BookingStage.SELECTING_DAY

    # ── Helpers de timezone / formato ───────────────────────────────────

    def _to_local(self, iso_utc: str) -> datetime:
        dt_utc = datetime.fromisoformat(iso_utc.replace("Z", "+00:00"))
        return dt_utc.astimezone(self.resource_tz)

    def _local_day_key(self, slot: dict) -> str:
        return self._to_local(slot["start_at"]).date().isoformat()

    def _time_label(self, slot: dict) -> str:
        return self._to_local(slot["start_at"]).strftime("%H:%M")

    def _day_label(self, date_key: str) -> str:
        local_date = datetime.fromisoformat(date_key).date()
        weekday = _WEEKDAY_LONG[local_date.weekday()]
        return f"{weekday} {local_date.strftime('%d/%m')}"

    def _slot_dto(self, slot: dict) -> dict:
        return {"start_at": slot["start_at"], "end_at": slot["end_at"], "label": self._time_label(slot)}

    def _active_resource_ids(self) -> List[str]:
        if self.resource_id:
            return [self.resource_id]
        return [c["id"] for c in self.candidates]

    def _resource_name(self, resource_id: Optional[str]) -> Optional[str]:
        match = next((c for c in self.candidates if c.get("id") == resource_id), None)
        return (match or {}).get("name")

    # ── Selección de recurso (nuevo) ─────────────────────────────────────

    def _filter_options(self) -> List[dict]:
        attribute_path = (self.selection.get("filter") or {}).get("attribute_path") or ""
        seen: set = set()
        options: List[dict] = []
        for candidate in self.candidates:
            value = (candidate.get("metadata") or {}).get(attribute_path)
            if value and value not in seen:
                seen.add(value)
                options.append({"value": value, "label": str(value)})
        return options

    def _options_result(self, message: str, options: List[dict]) -> dict:
        return {
            "message": message,
            "done": False,
            "cancelled": False,
            "appointment": None,
            "widget": {"widget_type": "appointment_options", "options": options},
        }

    @staticmethod
    def _resolve_choice(options: List[dict], answer: str) -> Optional[dict]:
        """Acepta el value exacto (lo que manda el widget al clickear), un
        índice 1-based (fallback de texto) o el label matcheado sin importar
        mayúsculas -- mismo espíritu que _resolve_day_answer/_find_slot."""
        answer = (answer or "").strip()
        for opt in options:
            if str(opt["value"]) == answer:
                return opt
        try:
            idx = int(answer) - 1
            if 0 <= idx < len(options):
                return options[idx]
        except ValueError:
            pass
        lowered = answer.lower()
        for opt in options:
            if opt["label"].strip().lower() == lowered:
                return opt
        return None

    async def enter_resource_selection(self) -> dict:
        """Arranca (o resuelve directo) la selección de recurso según la
        estrategia configurada en el servicio. Se llama una sola vez, al
        terminar COLLECTING_INFO."""
        strategy = self.selection["strategy"]

        if strategy == ResourceSelectionStrategy.SINGLE.value:
            self.resource_id = self.candidates[0]["id"]
            return await self.load_days()

        if strategy == ResourceSelectionStrategy.AUTO.value:
            # resource_id se resuelve recién al elegir el horario (ver
            # _process_time_choice), una vez que se sabe cuál slot ganó.
            return await self.load_days()

        if strategy == ResourceSelectionStrategy.FILTER_THEN_SELECT.value:
            options = self._filter_options()
            if len(options) > 1:
                self.stage = BookingStage.SELECTING_FILTER
                question = (self.selection.get("filter") or {}).get("question") or "¿Cuál preferís?"
                return self._options_result(question, options)
            # Ningún atributo distinto entre los recursos -- no hay nada
            # real que filtrar, cae directo a elegir por nombre.

        return await self._offer_or_resolve_resource(self.candidates)

    async def _offer_or_resolve_resource(self, candidates: List[dict]) -> dict:
        if len(candidates) == 1:
            self.resource_id = candidates[0]["id"]
            return await self.load_days()
        self.stage = BookingStage.SELECTING_RESOURCE
        self._resource_pool = candidates
        options = [{"value": c["id"], "label": c.get("name") or c["id"]} for c in candidates]
        return self._options_result("Elegí una opción:", options)

    async def _process_filter_choice(self, answer: str) -> dict:
        options = self._filter_options()
        if _is_back_word(answer):
            question = (self.selection.get("filter") or {}).get("question") or "¿Cuál preferís?"
            return self._options_result(question, options)

        choice = self._resolve_choice(options, answer)
        if not choice:
            question = (self.selection.get("filter") or {}).get("question") or "¿Cuál preferís?"
            return self._options_result(f"No entendí esa opción. {question}", options)

        attribute_path = (self.selection.get("filter") or {}).get("attribute_path") or ""
        narrowed = [
            c for c in self.candidates if (c.get("metadata") or {}).get(attribute_path) == choice["value"]
        ]
        return await self._offer_or_resolve_resource(narrowed or self.candidates)

    async def _process_resource_choice(self, answer: str) -> dict:
        pool = self._resource_pool or self.candidates
        options = [{"value": c["id"], "label": c.get("name") or c["id"]} for c in pool]
        if _is_back_word(answer):
            return self._options_result("Elegí una opción:", options)

        choice = self._resolve_choice(options, answer)
        if not choice:
            return self._options_result("No entendí esa opción. Elegí una de la lista:", options)

        self.resource_id = choice["value"]
        return await self.load_days()

    # ── Carga de datos ───────────────────────────────────────────────────

    async def _resolve_tz(self) -> ZoneInfo:
        resource = None
        if self.resource_id:
            resource = next((c for c in self.candidates if c.get("id") == self.resource_id), None)
            if resource is None or "timezone" not in resource:
                try:
                    resource = await self.client.get_resource(self.resource_id)
                except Exception:
                    resource = None
        elif self.candidates:
            resource = self.candidates[0]

        tz_name = (resource or {}).get("timezone")
        try:
            return ZoneInfo(tz_name or "UTC")
        except Exception:
            return ZoneInfo("UTC")

    async def load_days(self, days_ahead: int = DAYS_AHEAD) -> dict:
        """Resuelve la tz (una sola vez), consulta slots en la ventana [hoy,
        hoy+days_ahead] -- para uno o varios recursos candidatos si la
        estrategia es "auto" -- y los agrupa por día en tz local. Sin esto,
        agrupar "por día" directo sobre UTC pondría turnos cercanos a
        medianoche en el día equivocado para resources con offset horario
        (ej. America/Argentina/Buenos_Aires, UTC-3)."""
        self.resource_tz = await self._resolve_tz()

        today_local = datetime.now(timezone.utc).astimezone(self.resource_tz).date()
        self.date_from = today_local.isoformat()
        self.date_to = (today_local + timedelta(days=days_ahead)).isoformat()

        async def _fetch(resource_id: str) -> list[dict]:
            return await self.client.list_slots(
                resource_id, self.date_from, self.date_to, service_id=self.service_id
            )

        results = await asyncio.gather(*[_fetch(rid) for rid in self._active_resource_ids()])
        slots = [slot for group in results for slot in group]

        self.days_index = {}
        for slot in slots:
            self.days_index.setdefault(self._local_day_key(slot), []).append(slot)
        for day_slots in self.days_index.values():
            day_slots.sort(key=lambda s: s["start_at"])

        self.stage = BookingStage.SELECTING_DAY
        self.selected_day = None
        self.selected_slot = None

        if not self.days_index:
            return {
                "message": "No hay turnos disponibles en los próximos días. Contactanos directamente para coordinar.",
                "done": True,
                "cancelled": True,
                "appointment": None,
                "widget": None,
            }

        return self._calendar_result(
            "Estos son los próximos días con turnos disponibles. Elegí un día en el calendario "
            "(o escribí 'cancelar' para salir)."
        )

    # ── Constructores de resultado por widget ───────────────────────────

    def _calendar_result(self, message: str) -> dict:
        return {
            "message": message,
            "done": False,
            "cancelled": False,
            "appointment": None,
            "widget": {
                "widget_type": "appointment_calendar",
                "days": sorted(self.days_index.keys()),
                "date_from": self.date_from,
                "date_to": self.date_to,
                "timezone": str(self.resource_tz),
                "today": datetime.now(timezone.utc).astimezone(self.resource_tz).date().isoformat(),
            },
        }

    def _times_result(self, message: str, date_key: str) -> dict:
        slots = self.days_index.get(date_key, [])
        return {
            "message": message,
            "done": False,
            "cancelled": False,
            "appointment": None,
            "widget": {
                "widget_type": "appointment_times",
                "date": date_key,
                "timezone": str(self.resource_tz),
                "slots": [self._slot_dto(s) for s in slots],
            },
        }

    def _confirm_result(self, message: str) -> dict:
        return {
            "message": message,
            "done": False,
            "cancelled": False,
            "appointment": None,
            "widget": {
                "widget_type": "appointment_confirm",
                "date": self.selected_day,
                "timezone": str(self.resource_tz),
                "slot": {**self._slot_dto(self.selected_slot), "label_day": self._day_label(self.selected_day)},
            },
        }

    # ── Recolección de datos del paciente ────────────────────────────────

    def _current_info_field(self) -> Optional[str]:
        if self.info_index >= len(self.pending_info):
            return None
        return self.pending_info[self.info_index]

    def _validate_info_answer(self, key: str, answer: str):
        """Valida la respuesta a una pregunta de datos según el "type"
        configurado en info_fields. Retorna (valid, value, error)."""
        field = self.info_fields[key]
        field_type = field.get("type", "text")

        if field_type == "numeric_id":
            cleaned = re.sub(r"[\s.-]", "", answer)
            min_len = field.get("min_length") or 1
            max_len = field.get("max_length") or 20
            if not cleaned.isdigit() or not (min_len <= len(cleaned) <= max_len):
                return False, None, f"Ingresá un valor válido (solo números, entre {min_len} y {max_len} dígitos)."
            return True, cleaned, None

        if field_type == "phone":
            cleaned = re.sub(r'[\s\-\(\)\+]', '', answer)
            if not cleaned.isdigit() or len(cleaned) < 7:
                return False, None, "Ingresá un número válido (ej: +54 9 11 1234-5678)."
            return True, answer, None

        # text: libre
        if len(answer.strip()) < 2:
            return False, None, "Ingresá una respuesta más completa, por favor."
        return True, answer, None

    async def _save_captured_info(self) -> None:
        """Vuelca lo recolectado (solo los keys bien conocidos) al Client. No
        pisa datos que no se preguntaron."""
        if not self.client_id or not self.captured_info:
            return

        update_kwargs: dict = {}
        nombre = self.captured_info.get("nombre")
        apellido = self.captured_info.get("apellido")
        if nombre or apellido:
            update_kwargs["name"] = " ".join(part for part in (nombre, apellido) if part)
        if "dni" in self.captured_info:
            update_kwargs["dni"] = self.captured_info["dni"]
        if "whatsapp" in self.captured_info:
            update_kwargs["phone"] = self.captured_info["whatsapp"]

        if not update_kwargs:
            return
        try:
            await get_client_service().update_client(self.client_id, ClientUpdate(**update_kwargs))
        except Exception:
            pass

    async def _process_info_answer(self, answer: str) -> dict:
        field_key = self._current_info_field()
        valid, value, error = self._validate_info_answer(field_key, answer)
        if not valid:
            return _info_result(error)

        self.captured_info[field_key] = value
        self.info_index += 1

        next_field = self._current_info_field()
        if next_field:
            return _info_result(self.info_fields[next_field]["label"])

        # Completamos los datos: guardar en el Client y pasar a resolver el
        # recurso (o directo al calendario si la estrategia no pregunta nada).
        await self._save_captured_info()
        result = await self.enter_resource_selection()
        nombre = self.captured_info.get("nombre")
        if nombre and not result["cancelled"]:
            result["message"] = f"¡Gracias, {nombre}! {result['message']}"
        return result

    # ── Dispatch ─────────────────────────────────────────────────────────

    async def process_answer(self, answer: str) -> dict:
        """
        Returns: {"message": str, "done": bool, "cancelled": bool,
                  "appointment": dict | None, "widget": dict | None}
        """
        answer = (answer or "").strip()

        if _is_cancel_word(answer):
            return {
                "message": "Listo, cancelé la reserva de turno. ¿En qué más te puedo ayudar?",
                "done": True,
                "cancelled": True,
                "appointment": None,
                "widget": None,
            }

        if self.stage == BookingStage.COLLECTING_INFO:
            return await self._process_info_answer(answer)
        if self.stage == BookingStage.SELECTING_FILTER:
            return await self._process_filter_choice(answer)
        if self.stage == BookingStage.SELECTING_RESOURCE:
            return await self._process_resource_choice(answer)
        if self.stage == BookingStage.SELECTING_DAY:
            return await self._process_day_choice(answer)
        if self.stage == BookingStage.SELECTING_TIME:
            return await self._process_time_choice(answer)
        return await self._process_confirmation(answer)

    def _resolve_day_answer(self, answer: str) -> Optional[str]:
        """Acepta la fecha ISO completa (lo que manda el widget al clickear)
        o DD/MM como fallback de texto — sin ambigüedad de año porque se
        resuelve contra las keys reales de self.days_index, no adivinando."""
        if re.match(r"^\d{4}-\d{2}-\d{2}", answer):
            return answer[:10]
        match = re.match(r"^(\d{1,2})/(\d{1,2})$", answer)
        if match:
            day, month = (int(x) for x in match.groups())
            for key in self.days_index:
                d = datetime.fromisoformat(key)
                if d.day == day and d.month == month:
                    return key
        return None

    async def _process_day_choice(self, answer: str) -> dict:
        date_key = self._resolve_day_answer(answer)
        if not date_key or date_key not in self.days_index:
            return self._calendar_result(
                "No entendí ese día. Elegí uno de los días con disponibilidad en el calendario."
            )

        self.selected_day = date_key
        self.stage = BookingStage.SELECTING_TIME
        return self._times_result(
            f"Estos son los horarios disponibles para el {self._day_label(date_key)}:", date_key
        )

    @staticmethod
    def _find_slot(day_slots: list[dict], answer: str) -> Optional[dict]:
        answer = answer.strip()
        for slot in day_slots:
            if slot["start_at"] == answer:
                return slot
        try:
            idx = int(answer) - 1
            if 0 <= idx < len(day_slots):
                return day_slots[idx]
        except ValueError:
            pass
        return None

    async def _process_time_choice(self, answer: str) -> dict:
        if _is_back_word(answer):
            self.stage = BookingStage.SELECTING_DAY
            return self._calendar_result("Dale, elegí otro día.")

        day_slots = self.days_index.get(self.selected_day, [])
        slot = self._find_slot(day_slots, answer)
        if not slot:
            return self._times_result(
                "No entendí ese horario. Elegí uno de los horarios disponibles.", self.selected_day
            )

        self.selected_slot = slot
        # Para estrategia "auto" acá es donde se termina de saber qué recurso
        # ganó (cada slot ya viene taggeado con su resource_id de origen);
        # para el resto, resource_id ya estaba resuelto y esto es un no-op.
        self.resource_id = slot.get("resource_id") or self.resource_id
        self.stage = BookingStage.CONFIRMING
        return self._confirm_result(
            f"Perfecto, confirmás el turno del {self._day_label(self.selected_day)} "
            f"a las {self._time_label(slot)}? (sí/no)"
        )

    async def _process_confirmation(self, answer: str) -> dict:
        answer_lower = answer.lower()
        is_yes = answer_lower in ("si", "sí", "1", "yes", "confirmo", "dale", "ok")
        is_no = answer_lower in ("no", "2") or _is_back_word(answer)

        if not is_yes and not is_no:
            return self._confirm_result("Respondé 'sí' para confirmar el turno o 'no' para ver otros horarios.")

        if is_no:
            self.stage = BookingStage.SELECTING_TIME
            return self._times_result(
                f"Dale, estos son los horarios del {self._day_label(self.selected_day)}:", self.selected_day
            )

        customer_ref = self.client_id or f"web-{self.bot_id}-{id(self)}"
        custom_fields = {k: v for k, v in self.captured_info.items() if k not in _WELL_KNOWN_INFO_KEYS}
        metadata = {"bot_id": self.bot_id, "client_id": self.client_id, "source": "web_chat"}
        if custom_fields:
            metadata["custom_fields"] = custom_fields

        try:
            appointment = await self.client.create_appointment(
                resource_id=self.resource_id,
                start_at=self.selected_slot["start_at"],
                end_at=self.selected_slot["end_at"],
                customer_ref=customer_ref,
                service_id=self.service_id,
                metadata=metadata,
            )
        except SlotUnavailableError:
            return await self._refresh_after_conflict()

        # El cliente ya eligió el horario y dijo que sí explícitamente en el
        # chat (a diferencia de un alta manual desde el panel, donde el
        # dueño del bot puede querer revisar antes) — no tiene sentido
        # pedirle al dueño del bot que apruebe algo que el cliente ya
        # confirmó, así que se pasa directo a "confirmed".
        try:
            appointment = await self.client.confirm_appointment(appointment["id"])
        except Exception:
            pass  # el turno ya quedó reservado (pending) aunque no se pudiera auto-confirmar

        message = (
            f"¡Listo! Tu turno para el {self._day_label(self.selected_day)} "
            f"a las {self._time_label(self.selected_slot)} quedó confirmado."
        )
        resource_name = self._resource_name(self.resource_id)
        if resource_name and len(self.candidates) > 1:
            message += f" ({resource_name})"

        return {
            "message": message,
            "done": True,
            "cancelled": False,
            "appointment": appointment,
            "widget": None,
        }

    async def _refresh_after_conflict(self) -> dict:
        """Re-consulta solo el día elegido tras un 409 al confirmar (en vez
        de recargar los ~2 meses completos), sobre el/los mismo/s recurso/s
        que ya estaban en juego para ese slot."""
        day = self.selected_day

        async def _fetch(resource_id: str) -> list[dict]:
            return await self.client.list_slots(resource_id, day, day, service_id=self.service_id)

        results = await asyncio.gather(*[_fetch(rid) for rid in self._active_resource_ids()])
        fresh_slots = [slot for group in results for slot in group]
        fresh_slots.sort(key=lambda s: s["start_at"])

        if fresh_slots:
            self.days_index[day] = fresh_slots
            self.stage = BookingStage.SELECTING_TIME
            return self._times_result(
                "Uy, ese horario ya no está disponible. Estos son los horarios que quedan para ese día:", day
            )

        self.days_index.pop(day, None)
        self.stage = BookingStage.SELECTING_DAY
        if not self.days_index:
            return {
                "message": "Uy, ese horario ya no está disponible y no quedan más turnos. Contactanos directamente para coordinar.",
                "done": True,
                "cancelled": True,
                "appointment": None,
                "widget": None,
            }
        return self._calendar_result("Uy, ese horario ya no está disponible y no quedan más ese día. Elegí otro día.")


async def start_booking(bot: Bot, client_id: Optional[str]) -> tuple[Optional["BookingState"], dict]:
    config = (bot.metadata or {}).get("appointments") or {}
    resource_ids = config.get("resource_ids") or []
    service_id = config.get("default_service_id")

    module_enabled = await get_module_service().is_enabled(bot.bot_id, MODULE_KEY)
    if not module_enabled or not resource_ids:
        return None, {
            "message": "Por el momento no ofrecemos reserva de turnos por este medio. Contactanos directamente para coordinar.",
            "done": True,
            "cancelled": True,
            "appointment": None,
            "widget": None,
        }

    client = None
    if client_id:
        try:
            client = await get_client_service().get_client(client_id)
        except Exception:
            client = None

    appointments_client = get_appointments_client()

    service = None
    if service_id:
        try:
            service = await appointments_client.get_service(service_id)
        except Exception:
            service = None

    candidates = await _load_candidate_resources(appointments_client, service_id, resource_ids)
    if not candidates:
        # Sin service configurado, o service sin recursos asociados (setup
        # legacy no migrado): comportamiento histórico, un único recurso, sin
        # ninguna pregunta de selección de por medio.
        candidates = [{"id": resource_ids[0]}]

    state = BookingState(
        bot_id=bot.bot_id,
        client_id=client_id,
        service_id=service_id,
        candidates=candidates,
        service=service,
        info_fields=resolve_info_fields(service, config),
        client_name=client.name if client else None,
        client_dni=client.dni if client else None,
        client_phone=client.phone if client else None,
        appointments_client=appointments_client,
    )

    if state.pending_info:
        first_field = state.pending_info[0]
        return state, _info_result(
            f"Para reservar el turno necesito algunos datos. {state.info_fields[first_field]['label']}"
        )

    result = await state.enter_resource_selection()
    if result["cancelled"]:
        return None, result

    return state, result
