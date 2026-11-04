"""
Consulta del padrón electoral nacional (Justicia Nacional Electoral).

El sitio `padron.gob.ar` no tiene API pública, pero la consulta web son dos
POST sin JavaScript (verificado 2026-11-04):

- `POST /padron-api/captcha.jpg` → `token|ttl|base64JPEG` (hoy `ttl=300`) y una
  cookie de WAF que no hace falta conservar.
- `POST /padron-api/consulta` form-urlencoded `c` (código verificado), `m`
  (DNI), `d` (distrito), `s` (`m`/`f`/`x`), `e` (mail, opcional), con el token
  en la cookie `token`.

Status: `200` resultado, `401` captcha inválido, `403` sesión expirada, `404`
persona no encontrada, `409` distrito no habilitado. El token vive 300 s, así
que el flujo del chat tiene que poder pedir uno nuevo sin perder la consulta.

Este módulo no conoce el chat: recibe un cliente con `post()` (httpx.Client en
producción) y devuelve dicts serializables. Nunca lanza por un error del sitio:
el que decide qué decirle al usuario es el módulo `padron_ext`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

import httpx

BASE_URL = "https://www.padron.gob.ar"
CAPTCHA_URL = f"{BASE_URL}/padron-api/captcha.jpg"
CONSULTA_URL = f"{BASE_URL}/padron-api/consulta"

USER_AGENT = "gestionar-pachoteayuda/1.0 (+https://pachoteayuda.ar)"
HTTP_TIMEOUT = 10.0

# Distritos de la Justicia Nacional Electoral: 1 = Capital Federal,
# 2 = Buenos Aires, … 25 = Extranjeros Buenos Aires, 28 = Argentinos en el
# exterior, 31 = Extranjeros CABA (mapa del propio sitio).
DISTRITO_BUENOS_AIRES = 2
DISTRITOS_VALIDOS = frozenset({*range(1, 26), 28, 31})

# Tope de TTL aceptado: si el sitio devuelve algo absurdo, el flujo prefiere
# pedir un verificador nuevo antes que mandar uno que ya venció.
MAX_TTL = 600

STATUS_CONOCIDOS = {401, 403, 404, 409}


class PadronError(Exception):
    """El sitio no devolvió lo esperado (captcha mal formado, red caída)."""


@dataclass(frozen=True)
class Captcha:
    token: str
    ttl: int
    image_b64: str

    def vencido(self, fetched_at: float) -> bool:
        return (time.monotonic() - fetched_at) >= self.ttl


def nueva_sesion() -> httpx.Client:
    """Cliente con el UA propio: el sitio rechaza UA vacíos y el WAF se queja."""
    return httpx.Client(timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT})


def parse_captcha(body: str) -> Captcha:
    """Parte `token|ttl|base64` del endpoint del verificador."""
    partes = (body or "").strip().split("|")
    if len(partes) != 3:
        raise PadronError("respuesta del verificador con formato inesperado")

    token, ttl_raw, image_b64 = (p.strip() for p in partes)
    try:
        ttl = int(ttl_raw)
    except ValueError as exc:
        raise PadronError("ttl del verificador no numérico") from exc

    if not token or not image_b64 or ttl <= 0:
        raise PadronError("verificador incompleto")
    return Captcha(token=token, ttl=min(ttl, MAX_TTL), image_b64=image_b64)


def fetch_captcha(client) -> Captcha:
    """Pide un verificador nuevo. Levanta PadronError si el sitio no responde."""
    try:
        response = client.post(CAPTCHA_URL, params={"ts": int(time.time() * 1000)})
    except httpx.HTTPError as exc:
        raise PadronError(f"no se pudo pedir el verificador: {exc}") from exc

    if response.status_code != 200:
        raise PadronError(f"verificador: status {response.status_code}")
    return parse_captcha(response.text)


def consultar(
    client,
    *,
    token: str,
    codigo: str,
    dni: int,
    distrito: int,
    sexo: str,
    email: str = "",
) -> dict:
    """POST de la consulta. Devuelve `{"status", "data"}`; nunca levanta."""
    try:
        response = client.post(
            CONSULTA_URL,
            data={"c": codigo, "e": email, "m": dni, "d": distrito, "s": sexo},
            cookies={"token": token},
        )
    except httpx.HTTPError:
        return {"status": "error", "data": None}

    status = response.status_code
    if status == 200:
        try:
            data = response.json()
        except ValueError:
            return {"status": "error", "data": None}
        # Un 200 que no sea objeto (lista/string) no es un resultado del padrón:
        # se trata como error para que el chat derive al enlace en vez de romper.
        if not isinstance(data, dict):
            return {"status": "error", "data": None}
        return {"status": 200, "data": data}
    if status in STATUS_CONOCIDOS:
        return {"status": status, "data": None}
    return {"status": "error", "data": None}


# El sitio devuelve claves de una letra: su propio renderer lee e.d (nombre),
# e.h (establecimiento), e.i (dirección), e.t (localidad), e.f (circuito),
# e.g (sección), e.n (mesa) y e.o (orden) — ver consulta-*.js. Se aceptan
# también los nombres largos por si alguna vez cambian el contrato.
CAMPOS_RESULTADO = (
    ("Elector/a", ("d", "nombre")),
    ("Establecimiento", ("h", "establecimiento")),
    ("Dirección", ("i", "direccion")),
    ("Localidad", ("t", "localidad")),
    ("Circuito", ("f", "circuito")),
    ("Sección", ("g", "seccion")),
    ("Mesa", ("n", "mesa")),
    ("Orden", ("o", "orden")),
)

# `modo.provisorio` del sitio (hoy activo: "Elecciones nacionales 2027 —
# publicación extraordinaria del padrón provisional") no trae mesa ni orden.
NOTA_PROVISIONAL = (
    "El padrón provisional todavía no informa mesa ni orden: se publican con el "
    "padrón definitivo. Con el establecimiento y el circuito ya podés ubicar tu lugar."
)


def formatear_resultado(data: dict) -> str:
    """Texto para el chat. Sólo imprime los campos que el padrón devolvió."""
    lineas = []
    presentes = set()
    for etiqueta, claves in CAMPOS_RESULTADO:
        for clave in claves:
            valor = data.get(clave)
            if valor in (None, ""):
                continue
            presentes.add(etiqueta)
            lineas.append(f"{etiqueta}: {valor}")
            break

    if not lineas:
        return "El padrón no devolvió datos para esa consulta."

    texto = "Según el padrón electoral:\n" + "\n".join(lineas)
    if "Mesa" not in presentes and "Orden" not in presentes:
        texto += "\n\n" + NOTA_PROVISIONAL
    return texto


def captcha_widget(captcha: Captcha) -> dict:
    """Payload del widget del chat (ver frontend/.../PadronCaptchaWidget.tsx)."""
    return {
        "widget_type": "padron_captcha",
        "image": f"data:image/jpeg;base64,{captcha.image_b64}",
    }
