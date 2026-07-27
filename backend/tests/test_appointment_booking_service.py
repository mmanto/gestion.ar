"""
Tests unitarios de appointment_booking_service.py -- la lógica conversacional
más compleja del sistema, que hasta ahora no tenía cobertura. Se mockea
AppointmentsClient (nunca pega a devbout-appointments real) y los servicios
de módulo/cliente cuando hace falta (start_booking).

No requiere Mongo/Redis/Docker: son tests puros de lógica, no de infraestructura
(a diferencia de tests/test_infrastructure.py en la raíz del repo).
"""

from types import SimpleNamespace

import pytest

from app.services.appointment_booking_service import (
    _DEFAULT_INFO_FIELDS,
    BookingStage,
    BookingState,
    _load_candidate_resources,
    resolve_info_fields,
)


class FakeAppointmentsClient:
    """Doble de AppointmentsClient -- implementa solo lo que
    appointment_booking_service.py consume."""

    def __init__(self, service=None, resources=None, slots_by_resource=None):
        self._service = service
        self._resources = resources or []
        self._slots_by_resource = slots_by_resource or {}
        self.created_appointments: list[dict] = []
        self.confirmed_ids: list[str] = []

    async def get_service(self, service_id):
        if self._service is None:
            raise Exception("service not found")
        return self._service

    async def list_service_resources(self, service_id):
        return self._resources

    async def get_resource(self, resource_id):
        return next(r for r in self._resources if r["id"] == resource_id)

    async def list_slots(self, resource_id, date_from, date_to, service_id=None):
        return self._slots_by_resource.get(resource_id, [])

    async def create_appointment(self, resource_id, start_at, end_at, customer_ref, service_id=None, metadata=None):
        appointment = {
            "id": "appt-1",
            "resource_id": resource_id,
            "start_at": start_at,
            "end_at": end_at,
            "customer_ref": customer_ref,
            "service_id": service_id,
            "metadata": metadata or {},
            "status": "pending",
        }
        self.created_appointments.append(appointment)
        return appointment

    async def confirm_appointment(self, appointment_id):
        self.confirmed_ids.append(appointment_id)
        return {"id": appointment_id, "status": "confirmed"}


def _make_state(candidates, service=None, info_fields=None, client=None, **client_kwargs):
    return BookingState(
        bot_id="bot1",
        client_id=None,
        service_id="svc1",
        candidates=candidates,
        service=service,
        info_fields=info_fields or [],
        appointments_client=client or FakeAppointmentsClient(resources=candidates, **client_kwargs),
    )


# ── resolve_info_fields ──────────────────────────────────────────────────


def test_resolve_info_fields_defaults_to_hardcoded_set():
    assert resolve_info_fields(None, {}) == _DEFAULT_INFO_FIELDS


def test_resolve_info_fields_uses_bot_default_over_hardcoded():
    bot_fields = [{"key": "cuit", "label": "¿CUIT?", "type": "numeric_id"}]
    assert resolve_info_fields(None, {"default_info_fields": bot_fields}) == bot_fields


def test_resolve_info_fields_service_override_wins_over_bot_default():
    bot_fields = [{"key": "cuit", "label": "¿CUIT?", "type": "numeric_id"}]
    service_fields = [{"key": "obra_social", "label": "¿Obra social?", "type": "text"}]
    service = {"metadata": {"info_fields": service_fields}}
    assert resolve_info_fields(service, {"default_info_fields": bot_fields}) == service_fields


# ── _validate_info_answer ────────────────────────────────────────────────


def test_validate_numeric_id_accepts_digits_within_range_and_strips_separators():
    state = _make_state(
        [{"id": "r1"}], info_fields=[{"key": "cuit", "label": "?", "type": "numeric_id", "min_length": 10, "max_length": 11}]
    )
    valid, value, error = state._validate_info_answer("cuit", "20-12345678-3")
    assert valid and value == "20123456783" and error is None


def test_validate_numeric_id_rejects_wrong_length():
    state = _make_state(
        [{"id": "r1"}], info_fields=[{"key": "cuit", "label": "?", "type": "numeric_id", "min_length": 10, "max_length": 11}]
    )
    valid, value, error = state._validate_info_answer("cuit", "123")
    assert not valid and value is None and error


def test_validate_phone_rejects_non_numeric():
    state = _make_state([{"id": "r1"}], info_fields=[{"key": "whatsapp", "label": "?", "type": "phone"}])
    valid, _, error = state._validate_info_answer("whatsapp", "no tengo")
    assert not valid and error


def test_validate_phone_accepts_formatted_number():
    state = _make_state([{"id": "r1"}], info_fields=[{"key": "whatsapp", "label": "?", "type": "phone"}])
    valid, value, _ = state._validate_info_answer("whatsapp", "+54 9 11 1234-5678")
    assert valid and value == "+54 9 11 1234-5678"


def test_validate_text_rejects_too_short():
    state = _make_state([{"id": "r1"}], info_fields=[{"key": "nombre", "label": "?", "type": "text"}])
    valid, _, error = state._validate_info_answer("nombre", "J")
    assert not valid and error


# ── _load_candidate_resources ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_load_candidate_resources_filters_by_ownership_and_active():
    resources = [
        {"id": "r1", "name": "A", "is_active": True},
        {"id": "r2", "name": "B", "is_active": True},
        {"id": "r3", "name": "C", "is_active": False},
    ]
    client = FakeAppointmentsClient(resources=resources)
    candidates = await _load_candidate_resources(client, "svc1", ["r1", "r3"])
    # r2 no pertenece a este bot (no está en resource_ids), r3 está inactivo
    assert [c["id"] for c in candidates] == ["r1"]


@pytest.mark.asyncio
async def test_load_candidate_resources_empty_without_service_id():
    client = FakeAppointmentsClient(resources=[{"id": "r1", "is_active": True}])
    assert await _load_candidate_resources(client, None, ["r1"]) == []


# ── Estrategia ask_by_name ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ask_by_name_lists_options_then_resolves_by_index():
    candidates = [
        {"id": "r1", "name": "Dr. García", "metadata": {}},
        {"id": "r2", "name": "Dra. Pérez", "metadata": {}},
    ]
    service = {"metadata": {"selection": {"strategy": "ask_by_name"}}}
    slot = {"resource_id": "r2", "start_at": "2026-08-01T13:00:00+00:00", "end_at": "2026-08-01T13:30:00+00:00"}
    client = FakeAppointmentsClient(resources=candidates, slots_by_resource={"r2": [slot]})
    state = _make_state(candidates, service=service, client=client)

    result = await state.enter_resource_selection()
    assert state.stage == BookingStage.SELECTING_RESOURCE
    assert [o["label"] for o in result["widget"]["options"]] == ["Dr. García", "Dra. Pérez"]

    result = await state.process_answer("2")
    assert state.resource_id == "r2"
    assert state.stage == BookingStage.SELECTING_DAY
    assert "2026-08-01" in state.days_index


@pytest.mark.asyncio
async def test_ask_by_name_resolves_by_clicked_value():
    candidates = [{"id": "r1", "name": "Cancha 1"}, {"id": "r2", "name": "Cancha 2"}]
    service = {"metadata": {"selection": {"strategy": "ask_by_name"}}}
    client = FakeAppointmentsClient(resources=candidates, slots_by_resource={"r1": [], "r2": []})
    state = _make_state(candidates, service=service, client=client)

    await state.enter_resource_selection()
    await state.process_answer("r1")  # value exacto, como manda el widget al clickear
    assert state.resource_id == "r1"


# ── Estrategia filter_then_select ────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_then_select_narrows_to_single_candidate_auto_resolves():
    candidates = [
        {"id": "r1", "name": "Dr. García", "metadata": {"specialty": "clinica"}},
        {"id": "r2", "name": "Dra. Pérez", "metadata": {"specialty": "cardiologia"}},
    ]
    service = {
        "metadata": {
            "selection": {
                "strategy": "filter_then_select",
                "filter": {"attribute_path": "specialty", "question": "¿Especialidad?"},
            }
        }
    }
    client = FakeAppointmentsClient(resources=candidates, slots_by_resource={"r2": []})
    state = _make_state(candidates, service=service, client=client)

    result = await state.enter_resource_selection()
    assert state.stage == BookingStage.SELECTING_FILTER
    assert {o["value"] for o in result["widget"]["options"]} == {"clinica", "cardiologia"}

    result = await state.process_answer("cardiologia")
    assert state.resource_id == "r2"
    assert state.stage == BookingStage.SELECTING_DAY


@pytest.mark.asyncio
async def test_filter_then_select_narrows_to_multiple_falls_back_to_ask_by_name():
    candidates = [
        {"id": "r1", "name": "Dr. A", "metadata": {"specialty": "clinica"}},
        {"id": "r2", "name": "Dr. B", "metadata": {"specialty": "clinica"}},
        {"id": "r3", "name": "Dr. C", "metadata": {"specialty": "cardiologia"}},
    ]
    service = {
        "metadata": {"selection": {"strategy": "filter_then_select", "filter": {"attribute_path": "specialty"}}}
    }
    client = FakeAppointmentsClient(resources=candidates)
    state = _make_state(candidates, service=service, client=client)

    await state.enter_resource_selection()
    result = await state.process_answer("clinica")
    assert state.stage == BookingStage.SELECTING_RESOURCE
    assert {o["value"] for o in result["widget"]["options"]} == {"r1", "r2"}


@pytest.mark.asyncio
async def test_filter_then_select_skips_question_when_no_variation():
    # Los dos recursos comparten el mismo valor de "specialty" -- no hay nada
    # real que filtrar, debería caer directo a elegir por nombre.
    candidates = [
        {"id": "r1", "name": "Dr. A", "metadata": {"specialty": "clinica"}},
        {"id": "r2", "name": "Dr. B", "metadata": {"specialty": "clinica"}},
    ]
    service = {
        "metadata": {"selection": {"strategy": "filter_then_select", "filter": {"attribute_path": "specialty"}}}
    }
    client = FakeAppointmentsClient(resources=candidates)
    state = _make_state(candidates, service=service, client=client)

    result = await state.enter_resource_selection()
    assert state.stage == BookingStage.SELECTING_RESOURCE
    assert {o["value"] for o in result["widget"]["options"]} == {"r1", "r2"}


# ── Estrategia auto ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_auto_strategy_merges_slots_and_resolves_resource_on_pick():
    candidates = [{"id": "r1", "name": "Cancha 1"}, {"id": "r2", "name": "Cancha 2"}]
    service = {"metadata": {"selection": {"strategy": "auto"}}}
    slot_r1 = {"resource_id": "r1", "start_at": "2026-08-01T13:00:00+00:00", "end_at": "2026-08-01T13:30:00+00:00"}
    slot_r2 = {"resource_id": "r2", "start_at": "2026-08-01T14:00:00+00:00", "end_at": "2026-08-01T14:30:00+00:00"}
    client = FakeAppointmentsClient(resources=candidates, slots_by_resource={"r1": [slot_r1], "r2": [slot_r2]})
    state = _make_state(candidates, service=service, client=client)

    result = await state.enter_resource_selection()
    assert state.resource_id is None  # todavía no se sabe qué cancha va a ganar
    assert state.stage == BookingStage.SELECTING_DAY
    assert len(state.days_index["2026-08-01"]) == 2

    await state.process_answer("2026-08-01")
    assert state.stage == BookingStage.SELECTING_TIME

    await state.process_answer(slot_r2["start_at"])
    assert state.resource_id == "r2"
    assert state.stage == BookingStage.CONFIRMING

    result = await state.process_answer("si")
    assert result["done"] is True
    assert client.created_appointments[0]["resource_id"] == "r2"
    assert "Cancha 2" in result["message"]


# ── Estrategia single (implícita) ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_single_candidate_skips_any_question():
    candidates = [{"id": "r1", "name": "Único recurso"}]
    client = FakeAppointmentsClient(resources=candidates, slots_by_resource={"r1": []})
    state = _make_state(candidates, service=None, client=client)

    result = await state.enter_resource_selection()
    assert state.resource_id == "r1"
    assert state.stage == BookingStage.SELECTING_DAY
    assert result["widget"] is None or result["widget"]["widget_type"] != "appointment_options"


# ── Campos custom -> metadata.custom_fields, no al Client ────────────────


@pytest.mark.asyncio
async def test_custom_info_field_goes_to_appointment_metadata_not_client():
    candidates = [{"id": "r1", "name": "Ventanilla 1"}]
    slot = {"resource_id": "r1", "start_at": "2026-08-01T13:00:00+00:00", "end_at": "2026-08-01T13:30:00+00:00"}
    client = FakeAppointmentsClient(resources=candidates, slots_by_resource={"r1": [slot]})
    state = _make_state(
        candidates,
        info_fields=[{"key": "numero_expediente", "label": "?", "type": "numeric_id", "min_length": 3, "max_length": 10}],
        client=client,
    )
    state.captured_info["numero_expediente"] = "12345"
    await state.load_days()
    await state.process_answer("2026-08-01")
    await state.process_answer(slot["start_at"])
    await state.process_answer("si")

    assert client.created_appointments[0]["metadata"]["custom_fields"] == {"numero_expediente": "12345"}
