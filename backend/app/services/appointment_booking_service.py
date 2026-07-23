"""
AppointmentBookingService - máquina de estados para reservar un turno dentro
del chat web (canal web únicamente, ver web_chat_router.py), con un widget de
calendario visual (día -> horario -> confirmar) en vez de una lista de texto
numerada.

Inspirada en el patrón de FlowState (conversation_flow_service.py), con una
diferencia deliberada: sus métodos son async porque necesitan pegarle a
devbout-appointments (list_slots/create_appointment) vía AppointmentsClient,
algo que FlowState no necesita hacer.

v1: usa siempre el primer resource_id y el default_service_id configurados en
bot.metadata["appointments"] (ver appointments_router.py) — no deja elegir
recurso por chat. Detección de intención por palabra clave simple (no
tool-use de Claude, que no existe hoy en este codebase).

Cada paso devuelve, además del texto plano de siempre (content/fallback), una
clave "widget" lista para mandar tal cual como metadata del mensaje WebSocket
— así el frontend puede pintar un calendario/chips clickeables. Un click en
el widget simplemente manda como texto la fecha/horario elegido (mismo canal
que si el usuario lo hubiera tipeado), así que el protocolo cliente→servidor
no cambia.
"""

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

# Datos del paciente que se piden antes de mostrar el calendario -- el chat
# de reserva es del canal web, así que a diferencia de whatsapp/telegram acá
# no hay ni nombre ni teléfono conocidos de antemano. Cada uno se salta si
# el Client ya lo tiene cargado (ver BookingState.__init__).
_INFO_QUESTIONS: dict[str, str] = {
    "nombre": "¿Cuál es tu nombre?",
    "apellido": "¿Y tu apellido?",
    "dni": "¿Tu número de DNI? (solo números)",
    "whatsapp": "Por último, ¿tu número de WhatsApp? (para avisarte sobre el turno)",
}

# Cubre el resto del mes actual + el mes calendario siguiente completo en una
# sola llamada a list_slots, para que el frontend pueda navegar entre esos
# dos meses en el calendario sin pedirle al backend un re-fetch.
DAYS_AHEAD = 62


def _info_result(message: str) -> dict:
    return {"message": message, "done": False, "cancelled": False, "appointment": None, "widget": None}


def detects_booking_intent(text: str) -> bool:
    return bool(_KEYWORD_PATTERN.search(text or ""))


def _is_cancel_word(text: str) -> bool:
    return bool(_CANCEL_PATTERN.search(text or ""))


def _is_back_word(text: str) -> bool:
    return bool(_BACK_PATTERN.search(text or ""))


class BookingStage(str, Enum):
    COLLECTING_INFO = "collecting_info"
    SELECTING_DAY = "selecting_day"
    SELECTING_TIME = "selecting_time"
    CONFIRMING = "confirming"


class BookingState:
    def __init__(
        self,
        bot_id: str,
        client_id: Optional[str],
        resource_id: str,
        service_id: Optional[str],
        client_name: Optional[str] = None,
        client_dni: Optional[str] = None,
        client_phone: Optional[str] = None,
        appointments_client: Optional[AppointmentsClient] = None,
    ):
        self.bot_id = bot_id
        self.client_id = client_id
        self.resource_id = resource_id
        self.service_id = service_id
        self.client = appointments_client or get_appointments_client()
        self.resource_tz: ZoneInfo = ZoneInfo("UTC")
        self.days_index: dict[str, list[dict]] = {}
        self.date_from: str = ""
        self.date_to: str = ""
        self.selected_day: Optional[str] = None
        self.selected_slot: Optional[dict] = None

        # Datos del paciente que faltan (ver _INFO_QUESTIONS) -- se saltan
        # los que el Client ya tiene cargados (por otro medio: flow, chat
        # libre, o una reserva anterior).
        self.pending_info: List[str] = []
        if not client_name:
            self.pending_info.extend(["nombre", "apellido"])
        if not client_dni:
            self.pending_info.append("dni")
        if not client_phone:
            self.pending_info.append("whatsapp")
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

    # ── Carga de datos ───────────────────────────────────────────────────

    async def load_days(self, days_ahead: int = DAYS_AHEAD) -> dict:
        """Resuelve la tz del resource (una sola vez), consulta slots en la
        ventana [hoy, hoy+days_ahead] y los agrupa por día en tz local. Sin
        esto, agrupar "por día" directo sobre UTC pondría turnos cercanos a
        medianoche en el día equivocado para resources con offset horario
        (ej. America/Argentina/Buenos_Aires, UTC-3)."""
        try:
            resource = await self.client.get_resource(self.resource_id)
            self.resource_tz = ZoneInfo(resource.get("timezone") or "UTC")
        except Exception:
            self.resource_tz = ZoneInfo("UTC")

        today_local = datetime.now(timezone.utc).astimezone(self.resource_tz).date()
        self.date_from = today_local.isoformat()
        self.date_to = (today_local + timedelta(days=days_ahead)).isoformat()

        slots = await self.client.list_slots(
            self.resource_id, self.date_from, self.date_to, service_id=self.service_id
        )

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

    def _validate_info_answer(self, field: str, answer: str):
        """Valida la respuesta a una pregunta de datos. Retorna (valid, value, error)."""
        if field == "dni":
            cleaned = re.sub(r"[\s.-]", "", answer)
            if not cleaned.isdigit() or not (6 <= len(cleaned) <= 10):
                return False, None, "Ingresá un DNI válido (solo números, sin puntos)."
            return True, cleaned, None

        if field == "whatsapp":
            cleaned = re.sub(r'[\s\-\(\)\+]', '', answer)
            if not cleaned.isdigit() or len(cleaned) < 7:
                return False, None, "Ingresá un número de WhatsApp válido (ej: +54 9 11 1234-5678)."
            return True, answer, None

        # nombre / apellido: texto libre
        if len(answer) < 2:
            return False, None, f"Decime tu {field} completo, por favor."
        return True, answer, None

    async def _save_captured_info(self) -> None:
        """Vuelca lo recolectado al Client. No pisa datos que no se preguntaron."""
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
        field = self._current_info_field()
        valid, value, error = self._validate_info_answer(field, answer)
        if not valid:
            return _info_result(error)

        self.captured_info[field] = value
        self.info_index += 1

        next_field = self._current_info_field()
        if next_field:
            return _info_result(_INFO_QUESTIONS[next_field])

        # Completamos los datos: guardar en el Client y pasar al calendario.
        await self._save_captured_info()
        result = await self.load_days()
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
        try:
            appointment = await self.client.create_appointment(
                resource_id=self.resource_id,
                start_at=self.selected_slot["start_at"],
                end_at=self.selected_slot["end_at"],
                customer_ref=customer_ref,
                service_id=self.service_id,
                metadata={"bot_id": self.bot_id, "client_id": self.client_id, "source": "web_chat"},
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

        return {
            "message": (
                f"¡Listo! Tu turno para el {self._day_label(self.selected_day)} "
                f"a las {self._time_label(self.selected_slot)} quedó confirmado."
            ),
            "done": True,
            "cancelled": False,
            "appointment": appointment,
            "widget": None,
        }

    async def _refresh_after_conflict(self) -> dict:
        """Re-consulta solo el día elegido tras un 409 al confirmar (en vez
        de recargar los ~2 meses completos)."""
        day = self.selected_day
        fresh_slots = await self.client.list_slots(self.resource_id, day, day, service_id=self.service_id)
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

    state = BookingState(
        bot_id=bot.bot_id,
        client_id=client_id,
        resource_id=resource_ids[0],
        service_id=service_id,
        client_name=client.name if client else None,
        client_dni=client.dni if client else None,
        client_phone=client.phone if client else None,
    )

    if state.pending_info:
        first_field = state.pending_info[0]
        return state, _info_result(
            f"Para reservar el turno necesito algunos datos. {_INFO_QUESTIONS[first_field]}"
        )

    result = await state.load_days()
    if result["cancelled"]:
        return None, result

    return state, result
