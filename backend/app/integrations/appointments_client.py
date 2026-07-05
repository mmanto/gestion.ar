"""Cliente HTTP para devbout-appointments (microservicio genérico de turnos).

Primer consumo de un microservicio interno propio en gestion.ar (hasta ahora
solo se hablaba con APIs de terceros — Meta/Twilio/Telegram/Ollama — o con
Nango vía devbout-oauth). Auth por API key de tenant, sin JWT ni identidad
de usuario final compartida entre servicios.
"""
import os

import httpx


class SlotUnavailableError(Exception):
    pass


class AppointmentsClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout: float = 5.0):
        self._base_url = (base_url or os.getenv("APPOINTMENTS_API_BASE_URL", "")).rstrip("/")
        self._api_key = api_key or os.getenv("APPOINTMENTS_API_KEY", "")
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            resp = await client.request(
                method,
                path,
                headers={"Authorization": f"Bearer {self._api_key}"},
                **kwargs,
            )
            if resp.status_code == 409:
                raise SlotUnavailableError(resp.json().get("detail", "Horario no disponible"))
            resp.raise_for_status()
            return resp

    async def list_slots(
        self, resource_id: str, date_from: str, date_to: str, service_id: str | None = None
    ) -> list[dict]:
        params = {"resource_id": resource_id, "date_from": date_from, "date_to": date_to}
        if service_id:
            params["service_id"] = service_id
        resp = await self._request("GET", "/api/v1/slots", params=params)
        return resp.json()["items"]

    async def create_appointment(
        self,
        resource_id: str,
        start_at: str,
        end_at: str,
        customer_ref: str,
        service_id: str | None = None,
        metadata: dict | None = None,
    ) -> dict:
        payload = {
            "resource_id": resource_id,
            "start_at": start_at,
            "end_at": end_at,
            "customer_ref": customer_ref,
            "service_id": service_id,
            "metadata": metadata or {},
        }
        resp = await self._request("POST", "/api/v1/appointments", json=payload)
        return resp.json()

    async def cancel_appointment(self, appointment_id: str, reason: str | None = None) -> dict:
        resp = await self._request(
            "POST", f"/api/v1/appointments/{appointment_id}/cancel", json={"reason": reason}
        )
        return resp.json()

    async def get_appointment(self, appointment_id: str) -> dict:
        resp = await self._request("GET", f"/api/v1/appointments/{appointment_id}")
        return resp.json()

    async def list_appointments(
        self,
        resource_id: str | None = None,
        customer_ref: str | None = None,
        status: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> dict:
        params = {"page": page, "page_size": page_size}
        if resource_id:
            params["resource_id"] = resource_id
        if customer_ref:
            params["customer_ref"] = customer_ref
        if status:
            params["status"] = status
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        resp = await self._request("GET", "/api/v1/appointments", params=params)
        return resp.json()

    async def reschedule_appointment(
        self, appointment_id: str, start_at: str, end_at: str, metadata: dict | None = None
    ) -> dict:
        payload: dict = {"start_at": start_at, "end_at": end_at}
        if metadata is not None:
            payload["metadata"] = metadata
        resp = await self._request("PATCH", f"/api/v1/appointments/{appointment_id}", json=payload)
        return resp.json()

    async def confirm_appointment(self, appointment_id: str) -> dict:
        resp = await self._request("POST", f"/api/v1/appointments/{appointment_id}/confirm")
        return resp.json()

    async def complete_appointment(self, appointment_id: str) -> dict:
        resp = await self._request("POST", f"/api/v1/appointments/{appointment_id}/complete")
        return resp.json()

    async def mark_no_show(self, appointment_id: str) -> dict:
        resp = await self._request("POST", f"/api/v1/appointments/{appointment_id}/no-show")
        return resp.json()

    # ── Resources ────────────────────────────────────────────────────────

    async def create_resource(
        self,
        name: str,
        category: str | None = None,
        capacity: int = 1,
        timezone: str | None = None,
        metadata: dict | None = None,
    ) -> dict:
        payload = {
            "name": name,
            "category": category,
            "capacity": capacity,
            "timezone": timezone,
            "metadata": metadata or {},
        }
        resp = await self._request("POST", "/api/v1/resources", json=payload)
        return resp.json()

    async def list_resources(
        self, category: str | None = None, is_active: bool | None = None, page: int = 1, page_size: int = 20
    ) -> dict:
        params: dict = {"page": page, "page_size": page_size}
        if category is not None:
            params["category"] = category
        if is_active is not None:
            params["is_active"] = is_active
        resp = await self._request("GET", "/api/v1/resources", params=params)
        return resp.json()

    async def get_resource(self, resource_id: str) -> dict:
        resp = await self._request("GET", f"/api/v1/resources/{resource_id}")
        return resp.json()

    async def update_resource(self, resource_id: str, **fields) -> dict:
        resp = await self._request("PATCH", f"/api/v1/resources/{resource_id}", json=fields)
        return resp.json()

    async def deactivate_resource(self, resource_id: str) -> None:
        await self._request("DELETE", f"/api/v1/resources/{resource_id}")

    # ── Services ─────────────────────────────────────────────────────────

    async def create_service(
        self,
        name: str,
        duration_minutes: int,
        buffer_before_minutes: int = 0,
        buffer_after_minutes: int = 0,
        min_cancellation_notice_minutes: int | None = None,
        metadata: dict | None = None,
    ) -> dict:
        payload = {
            "name": name,
            "duration_minutes": duration_minutes,
            "buffer_before_minutes": buffer_before_minutes,
            "buffer_after_minutes": buffer_after_minutes,
            "min_cancellation_notice_minutes": min_cancellation_notice_minutes,
            "metadata": metadata or {},
        }
        resp = await self._request("POST", "/api/v1/services", json=payload)
        return resp.json()

    async def list_services(self, is_active: bool | None = None, page: int = 1, page_size: int = 20) -> dict:
        params: dict = {"page": page, "page_size": page_size}
        if is_active is not None:
            params["is_active"] = is_active
        resp = await self._request("GET", "/api/v1/services", params=params)
        return resp.json()

    async def get_service(self, service_id: str) -> dict:
        resp = await self._request("GET", f"/api/v1/services/{service_id}")
        return resp.json()

    async def update_service(self, service_id: str, **fields) -> dict:
        resp = await self._request("PATCH", f"/api/v1/services/{service_id}", json=fields)
        return resp.json()

    async def deactivate_service(self, service_id: str) -> None:
        await self._request("DELETE", f"/api/v1/services/{service_id}")

    async def attach_resource_to_service(self, service_id: str, resource_id: str) -> None:
        await self._request("POST", f"/api/v1/services/{service_id}/resources", json={"resource_id": resource_id})

    async def list_service_resources(self, service_id: str) -> list[dict]:
        resp = await self._request("GET", f"/api/v1/services/{service_id}/resources")
        return resp.json()

    async def detach_resource_from_service(self, service_id: str, resource_id: str) -> None:
        await self._request("DELETE", f"/api/v1/services/{service_id}/resources/{resource_id}")

    # ── Availability rules ──────────────────────────────────────────────

    async def create_availability_rule(
        self,
        resource_id: str,
        weekday: int,
        start_time: str,
        end_time: str,
        valid_from: str | None = None,
        valid_until: str | None = None,
    ) -> dict:
        payload = {
            "weekday": weekday,
            "start_time": start_time,
            "end_time": end_time,
            "valid_from": valid_from,
            "valid_until": valid_until,
        }
        resp = await self._request("POST", f"/api/v1/resources/{resource_id}/availability-rules", json=payload)
        return resp.json()

    async def list_availability_rules(self, resource_id: str) -> list[dict]:
        resp = await self._request("GET", f"/api/v1/resources/{resource_id}/availability-rules")
        return resp.json()

    async def delete_availability_rule(self, resource_id: str, rule_id: str) -> None:
        await self._request("DELETE", f"/api/v1/resources/{resource_id}/availability-rules/{rule_id}")


_client_instance: AppointmentsClient | None = None


def get_appointments_client() -> AppointmentsClient:
    global _client_instance
    if _client_instance is None:
        _client_instance = AppointmentsClient()
    return _client_instance
