# Consulta de padrón electoral con captcha resuelto por el usuario — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el chat web de pachoteayuda consulte el padrón de `padron.gob.ar` mostrando el verificador en el chat y devolviendo establecimiento, mesa y orden con el código que escribe el usuario.

**Architecture:** Un módulo `padron` nuevo aporta una tool que el LLM invoca (`consultar_padron`) y un interceptor con estado por conexión. El executor de la tool baja el captcha y deja `ns["result"]` con un widget `padron_captcha` (mecanismo existente de `AgentService`); el interceptor toma el código del mensaje siguiente y hace el POST de consulta. Sin navegador headless: `httpx` con la cookie `token`.

**Tech Stack:** FastAPI + httpx (backend), React + Tailwind (frontend), pytest, Alembic/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-04-padron-captcha-handoff-design.md`

## Global Constraints

- Sólo chat web: el flujo usa `session`, que WhatsApp y Telegram no tienen.
- No loguear ni persistir DNI, código de captcha ni resultado; viven sólo en `session`.
- `ttl` del captcha = 300 s; el token se pasa como cookie `token=<token>`, sin otras cookies.
- Endpoints: `POST https://www.padron.gob.ar/padron-api/captcha.jpg` y `POST https://www.padron.gob.ar/padron-api/consulta` (form-urlencoded `c`, `m`, `d`, `s`, `e`).
- Distrito por defecto: `2` (Buenos Aires). Válidos: 1–25, 28, 31.
- Nunca lanzar excepción hacia el loop del LLM: la tool devuelve un dict y deja el mensaje de fallback en `ns["result"]`.
- Commits en español, formato del repo (`feat: …`, `test: …`, `docs: …`).

## Review Focus

- Código que no es un código (el usuario escribe "hola" con un captcha pendiente) → se re-pregunta sin consumir el token.
- El usuario tarda más de 300 s → captcha nuevo en vez de un error de sesión expirada.
- El sitio no responde o el WAF deja de aceptar la IP del VPS → mensaje de derivación con enlace, nunca una respuesta vacía.
- Dos consultas seguidas → la segunda reemplaza el pendiente; ningún token viejo queda vivo.
- DNI inválido (letras, 3 dígitos) o distrito fuera de rango → rechazo sin tocar la red.

---

### Task 1: Servicio del padrón

**Files:**
- Create: `backend/app/services/padron_service.py`
- Test: `backend/tests/test_padron_service.py`

**Interfaces:**
- Consumes: nada del repo.
- Produces:
  - `Captcha` (dataclass frozen: `token: str`, `ttl: int`, `image_b64: str`)
  - `PadronError(Exception)`
  - `parse_captcha(body: str) -> Captcha`
  - `fetch_captcha(client) -> Captcha` — acepta cualquier objeto con `post(url, **kwargs)` tipo `httpx.Client`
  - `consultar(client, *, token: str, codigo: str, dni: int, distrito: int, sexo: str, email: str = "") -> dict` → `{"status": 200 | 401 | 403 | 404 | 409 | "error", "data": dict | None}`
  - `formatear_resultado(data: dict) -> str`
  - `captcha_widget(captcha: Captcha) -> dict` → `{"widget_type": "padron_captcha", "image": "data:image/jpeg;base64,..."}`
  - Constantes: `CAPTCHA_URL`, `CONSULTA_URL`, `DISTRITO_BUENOS_AIRES = 2`, `DISTRITOS_VALIDOS`, `USER_AGENT`, `HTTP_TIMEOUT = 10.0`

- [ ] **Step 1: Escribir el test que falla**

```python
import httpx
import pytest

from app.services import padron_service as mod
from app.services.padron_service import (
    Captcha,
    PadronError,
    captcha_widget,
    consultar,
    formatear_resultado,
    parse_captcha,
)


class _Resp:
    def __init__(self, status_code, body, payload=None):
        self.status_code = status_code
        self.text = body
        self._payload = payload or {}

    def json(self):
        return self._payload


class _Client:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


def test_parse_captcha_extrae_token_ttl_e_imagen():
    captcha = parse_captcha("abc123|300|/9j/4AAQSkZJRg==")
    assert captcha == Captcha(token="abc123", ttl=300, image_b64="/9j/4AAQSkZJRg==")


def test_parse_captcha_rechaza_respuesta_inesperada():
    with pytest.raises(PadronError):
        parse_captcha("no-es-el-formato")


def test_captcha_widget_arma_data_url_jpeg():
    widget = captcha_widget(Captcha(token="t", ttl=300, image_b64="AAA"))
    assert widget == {
        "widget_type": "padron_captcha",
        "image": "data:image/jpeg;base64,AAA",
    }


def test_consultar_manda_token_como_cookie_y_form():
    client = _Client(_Resp(401, ""))
    resultado = consultar(client, token="tok", codigo="ZZZZ", dni=12345678, distrito=2, sexo="m")
    assert resultado == {"status": 401, "data": None}
    url, kwargs = client.calls[0]
    assert url == mod.CONSULTA_URL
    assert kwargs["cookies"] == {"token": "tok"}
    assert kwargs["data"] == {"c": "ZZZZ", "e": "", "m": 12345678, "d": 2, "s": "m"}


def test_consultar_devuelve_data_en_200():
    client = _Client(_Resp(200, "", {"mesa": 12}))
    assert consultar(client, token="t", codigo="AAAA", dni=1, distrito=2, sexo="f") == {
        "status": 200,
        "data": {"mesa": 12},
    }


def test_consultar_mapea_error_de_red():
    client = _Client(_Resp(500, "boom"))
    assert consultar(client, token="t", codigo="AAAA", dni=1, distrito=2, sexo="x") == {
        "status": "error",
        "data": None,
    }


def test_formatear_resultado_arma_texto_legible():
    texto = formatear_resultado(
        {
            "nombre": "JUAN PEREZ",
            "establecimiento": "ESCUELA 1",
            "direccion": "SAN MARTIN 100",
            "mesa": 42,
            "orden": 7,
        }
    )
    assert "ESCUELA 1" in texto
    assert "SAN MARTIN 100" in texto
    assert "42" in texto
    assert "7" in texto


def test_formatear_resultado_omite_campos_ausentes_sin_imprimir_none():
    texto = formatear_resultado({"mesa": 42})
    assert "None" not in texto
    assert "42" in texto
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && python -m pytest tests/test_padron_service.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.services.padron_service'`

- [ ] **Step 3: Implementar `padron_service.py`**

Encabezado de módulo explicando el contrato del sitio (token de 300 s, cookie `token`, status 401/403/404/409). `parse_captcha` parte por `|` y exige 3 partes, `ttl` entero positivo e imagen no vacía. `consultar` postea `{"c","e","m","d","s"}` con `cookies={"token": token}`, `timeout=HTTP_TIMEOUT`, `headers={"User-Agent": USER_AGENT}`, y mapea: `200` → `{"status": 200, "data": response.json()}`; `401/403/404/409` → `{"status": <code>, "data": None}`; cualquier otro o `httpx.HTTPError` → `{"status": "error", "data": None}` (sin excepción). `formatear_resultado` arma líneas sólo para los campos presentes, con etiquetas: establecimiento, dirección, mesa, orden; si no hay nada, devuelve `"El padrón no devolvió datos para esa consulta."`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && python -m pytest tests/test_padron_service.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/padron_service.py backend/tests/test_padron_service.py
git commit -m "feat: servicio de consulta del padrón electoral con captcha"
```

---

### Task 2: Módulo `padron` (tool + interceptor + manifiesto)

**Files:**
- Create: `backend/app/modules/padron_ext.py`
- Modify: `backend/app/modules/manifest.py` (agregar `padron` a `MODULE_MANIFESTS`)
- Test: `backend/tests/test_padron_ext.py`

**Interfaces:**
- Consumes: `padron_service.Captcha`, `fetch_captcha`, `consultar`, `captcha_widget`, `DISTRITO_BUENOS_AIRES`, `DISTRITOS_VALIDOS`, `PadronError` (Task 1).
- Produces:
  - `PADRON_TOOL_NAME = "consultar_padron"`, `PADRON_TOOL_SPEC` (formato `{"name","description","parameters"}`, como `SIBOM_TOOL_SPEC`)
  - `provide_tools(bot, client, client_id, canal, ns) -> ([PADRON_TOOL_SPEC], {PADRON_TOOL_NAME: executor})`
  - `intercept(bot, client_id, user_text, ns) -> dict | None`
  - Estado en `ns`: `ns["pending"] = {"token","ttl","fetched_at","args"}`; `ns["result"] = {"message","widget"}`

- [ ] **Step 1: Escribir el test que falla**

```python
import pytest

from app.modules import padron_ext as mod
from app.services.padron_service import Captcha


class _Bot:
    config = None


def _captcha(i):
    return Captcha(token=f"tok{i}", ttl=300, image_b64="AAA")


def test_tool_guarda_pendiente_y_widget(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(1))
    ns = {}
    tools, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    assert tools == [mod.PADRON_TOOL_SPEC]
    resultado = executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m"})
    assert resultado["status"] == "captcha_pendiente"
    assert ns["pending"]["token"] == "tok1"
    assert ns["pending"]["args"] == {"dni": 12345678, "sexo": "m", "distrito": 2}
    assert ns["result"]["widget"]["widget_type"] == "padron_captcha"


def test_segunda_consulta_reemplaza_el_pendiente(monkeypatch):
    tokens = iter([_captcha(1), _captcha(2)])
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: next(tokens))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m"})
    executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "f"})
    assert ns["pending"]["token"] == "tok2"
    assert ns["pending"]["args"]["sexo"] == "f"


def test_tool_rechaza_dni_invalido_sin_tocar_la_red(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: llamado.append(1))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    resultado = executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": "abc", "sexo": "m"})
    assert "dni" in resultado["error"].lower()
    assert llamado == []
    assert "pending" not in ns


def test_tool_degrada_a_derivacion_si_el_sitio_falla(monkeypatch):
    def _boom(client):
        raise mod.padron_service.PadronError("caido")

    monkeypatch.setattr(mod.padron_service, "fetch_captcha", _boom)
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m"})
    assert "padron.gob.ar" in ns["result"]["message"]
    assert ns["result"]["widget"] is None


async def test_intercept_sin_pendiente_no_interviene():
    assert await mod.intercept(_Bot(), None, "hola", {}) is None


async def test_intercept_repregunta_si_el_texto_no_es_codigo(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: llamado.append(1))
    ns = {"pending": {"token": "t", "ttl": 300, "fetched_at": mod.time.monotonic(), "args": {}}}
    resultado = await mod.intercept(_Bot(), None, "hola, qué tal", ns)
    assert resultado["message"]
    assert "pending" in ns
    assert llamado == []


async def test_intercept_401_pide_captcha_nuevo_y_reemplaza_token(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: {"status": 401, "data": None})
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(2))
    ns = {
        "pending": {
            "token": "tok1",
            "ttl": 300,
            "fetched_at": mod.time.monotonic(),
            "args": {"dni": 12345678, "sexo": "m", "distrito": 2},
        }
    }
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert resultado["widget"]["widget_type"] == "padron_captcha"
    assert ns["pending"]["token"] == "tok2"


async def test_intercept_200_devuelve_resultado_y_limpia_estado(monkeypatch):
    monkeypatch.setattr(
        mod.padron_service,
        "consultar",
        lambda *a, **k: {"status": 200, "data": {"establecimiento": "ESCUELA 1", "mesa": 42, "orden": 7}},
    )
    ns = {
        "pending": {
            "token": "tok1",
            "ttl": 300,
            "fetched_at": mod.time.monotonic(),
            "args": {"dni": 12345678, "sexo": "m", "distrito": 2},
        }
    }
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert "ESCUELA 1" in resultado["message"]
    assert "pending" not in ns


async def test_intercept_vencido_pide_captcha_nuevo(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(3))
    llamado = []
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: llamado.append(1))
    ns = {
        "pending": {
            "token": "tok1",
            "ttl": 300,
            "fetched_at": mod.time.monotonic() - 301,
            "args": {"dni": 12345678, "sexo": "m", "distrito": 2},
        }
    }
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert resultado["widget"]["widget_type"] == "padron_captcha"
    assert ns["pending"]["token"] == "tok3"
    assert llamado == []


async def test_intercept_404_avisa_que_no_figura(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: {"status": 404, "data": None})
    ns = {
        "pending": {
            "token": "tok1",
            "ttl": 300,
            "fetched_at": mod.time.monotonic(),
            "args": {"dni": 12345678, "sexo": "m", "distrito": 2},
        }
    }
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert "padrón" in resultado["message"]
    assert "pending" not in ns
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && python -m pytest tests/test_padron_ext.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.modules.padron_ext'`

- [ ] **Step 3: Implementar `padron_ext.py` y registrar el módulo**

`provide_tools` arma un `httpx.Client(timeout=padron_service.HTTP_TIMEOUT, headers={"User-Agent": padron_service.USER_AGENT})` por llamada (el token viaja como cookie explícita, no hace falta conservar el cliente), valida `dni` (entero 100000–99999999), `sexo` en `{"m","f","x"}` y `distrito` en `DISTRITOS_VALIDOS` (default 2); si inválido devuelve `{"error": "..."}` sin red. Si `fetch_captcha`/`PadronError` falla, deja `ns["result"]` con la derivación y devuelve `{"status": "error"}`.

En `manifest.py`, agregar:

```python
    "padron": ModuleManifest(
        module_key="padron",
        name="Padrón electoral",
        description="Consulta del padrón nacional con verificador resuelto por el usuario.",
        version="1.0.0",
        scope="entitled",
        chat=ChatContribution(
            tools_provider="app.modules.padron_ext:provide_tools",
            interceptor="app.modules.padron_ext:intercept",
            widget_types=("padron_captcha",),
        ),
    ),
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && python -m pytest tests/test_padron_ext.py tests/test_padron_service.py -v`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/padron_ext.py backend/app/modules/manifest.py backend/tests/test_padron_ext.py
git commit -m "feat: módulo padron con tool e interceptor de captcha"
```

---

### Task 3: Migración del catálogo y habilitación para pachoteayuda

**Files:**
- Create: `backend/alembic/versions/20261104_1200_add_padron_module.py` (revision `a1b2c3d4e5f6`, `down_revision = "e7c4b1f0a935"`)
- Create: `backend/scripts/enable_pachoteayuda_padron.py`
- Modify: `ENV.md` (fila de `ENABLED_MODULES`: agregar `padron` a la lista de ejemplo)

**Interfaces:**
- Consumes: el manifiesto de Task 2 (el `module_key` `padron`).
- Produces: fila en `modules` y en `bot_modules` (granted + enabled) para el bot de pachoteayuda.

- [ ] **Step 1: Escribir la migración**

`upgrade()`: `op.execute("INSERT INTO modules (module_key, name, description) VALUES ('padron', 'Padrón electoral', 'Consulta del padrón nacional con verificador resuelto por el usuario') ON CONFLICT (module_key) DO NOTHING")`. `downgrade()`: borrar `bot_modules` y `modules` de `padron`.

- [ ] **Step 2: Verificar que sube y baja limpio**

Run: `docker compose exec app alembic upgrade head && docker compose exec app alembic downgrade -1 && docker compose exec app alembic upgrade head`
Expected: tres comandos sin error; `modules` contiene `padron` al final.

- [ ] **Step 3: Escribir el script de habilitación**

Copiar el patrón de `backend/scripts/enable_pachoteayuda_public_sources.py`: buscar bots de `PACHOTEAYUDA_TENANT_IDS` (`["tenant_2fc38a44e696"]`), insertar/actualizar `bot_modules(bot_id, "padron", granted=True, enabled=True)`, e idempotente. Sin tocar `ius_config` salvo que exista `estado_de_herramientas`: en ese caso agregar `"consultar_padron"` a las implementadas con la descripción de `PADRON_TOOL_SPEC`.

- [ ] **Step 4: Correr el script dos veces**

Run: `docker compose exec app python scripts/enable_pachoteayuda_padron.py` (dos veces)
Expected: la segunda corrida informa "ya habilitado" y no cambia nada.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/20261104_1200_add_padron_module.py backend/scripts/enable_pachoteayuda_padron.py ENV.md
git commit -m "feat: habilita el módulo padron para pachoteayuda"
```

---

### Task 4: Widget de captcha en el chat web

**Files:**
- Create: `frontend/src/components/chat/PadronCaptchaWidget.tsx`
- Modify: `frontend/src/types/chat.types.ts` (tipo `PadronCaptchaWidgetData`, unión `ChatWidgetData`, `parseChatWidget`)
- Modify: `frontend/src/components/chat/ChatWidget.tsx` (prop `widget: ChatWidgetData`)
- Modify: `frontend/src/components/chat/ChatInterface.tsx:3,69` (`parseChatWidget`)
- Modify: `frontend/src/modules/chatWidgets.tsx` (entrada `padron_captcha`)

**Interfaces:**
- Consumes: `result.widget` = `{"widget_type": "padron_captcha", "image": string}` (Task 2).
- Produces: componente que envía el código como texto plano por `onSelectOption`.

- [ ] **Step 1: Extender los tipos y el parser**

```ts
export interface PadronCaptchaWidgetData {
  widget_type: 'padron_captcha';
  image: string; // data URL image/jpeg
}

export type ChatWidgetData = AppointmentWidget | PadronCaptchaWidgetData;

export function parseChatWidget(metadata: Record<string, unknown> | undefined): ChatWidgetData | null {
  // …switch existente, y un caso nuevo:
  // case 'padron_captcha': return typeof metadata.image === 'string' ? (metadata as unknown as PadronCaptchaWidgetData) : null;
}
```

Renombrar `parseAppointmentWidget` → `parseChatWidget` en su definición y en `ChatInterface.tsx:69`.

- [ ] **Step 2: Crear el componente**

```tsx
export function PadronCaptchaWidget({
  widget,
  onSelectOption,
}: {
  widget: PadronCaptchaWidgetData;
  onSelectOption: (value: string) => void;
}) {
  const [codigo, setCodigo] = useState('');
  // <img src={widget.image} alt="Código verificador" /> dentro de un contenedor
  // Tailwind (w-full, rounded-lg, border, bg-white), input controlado y dos
  // botones: "Consultar" (disabled si !codigo.trim(), onClick={() => onSelectOption(codigo.trim())})
  // y "Otro verificador" (onClick={() => onSelectOption('otro captcha')}).
}
```

Sólo clases Tailwind, sin estilos inline.

- [ ] **Step 3: Registrar en `CHAT_WIDGETS`**

```ts
import { PadronCaptchaWidget } from '../components/chat/PadronCaptchaWidget';
// …
export const CHAT_WIDGETS: Record<string, ChatWidgetComponent> = {
  padron_captcha: PadronCaptchaWidget as unknown as ChatWidgetComponent,
};
```

El cast es el mismo patrón que usaban los remotes de `appointments` (el host pasa todos los handlers; el widget consume los suyos).

- [ ] **Step 4: Typecheck y build**

Run: `cd frontend && npm run build`
Expected: `tsc -b` sin errores y build de Vite OK.

- [ ] **Step 5: Smoke en el navegador**

Abrir el chat de pachoteayuda en dev, pedir "¿dónde voto?", verificar que aparece la imagen del verificador, que "Consultar" está deshabilitado sin código, y que "Otro verificador" trae una imagen distinta. Sin un DNI real la consulta termina en 404: eso también es parte del smoke (mensaje de "no figura en el padrón").

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/PadronCaptchaWidget.tsx frontend/src/types/chat.types.ts \
  frontend/src/components/chat/ChatWidget.tsx frontend/src/components/chat/ChatInterface.tsx \
  frontend/src/modules/chatWidgets.tsx
git commit -m "feat: widget de captcha del padrón en el chat web"
```

---

### Task 5: Documentación y verificación de punta a punta

**Files:**
- Modify: `CHANGELOG.md` (sección `Agregado`)
- Modify: `docs/dev/API.md` (integración saliente + widget `padron_captcha`)
- Modify: `docs/dev/DECISIONS.md` (ADR-039: captcha resuelto por el usuario, sin navegador headless)

**Interfaces:**
- Consumes: Todo lo anterior.

- [ ] **Step 1: Escribir ADR-039**

Decisión: integrar `padron.gob.ar` desde `httpx` con el captcha resuelto por el usuario en el chat web; sin OCR, sin servicio externo, sin sesión fuera de `session`. Alternativas descartadas: derivación al sitio (no resuelve) y navegador headless (innecesario y peor para el WAF). Consecuencia: si el sitio cambia, el módulo degrada al enlace.

- [ ] **Step 2: Actualizar API.md y CHANGELOG.md**

API.md: tabla de los tres endpoints externos, el widget `padron_captcha` y el módulo `padron` (entitled). CHANGELOG: entrada del feature con el flujo y el límite (sólo chat web).

- [ ] **Step 3: Smoke con un DNI real**

En el chat web de dev, con un DNI y sexo reales (`docker compose exec app curl -sS -X POST -o /dev/null -w '%{http_code}' https://www.padron.gob.ar/padron-api/captcha.jpg` debe dar `200` también desde el VPS; si da challenge del WAF, esto es lo primero a resolver): resolver el captcha y confirmar que el mensaje devuelve establecimiento, dirección, mesa y orden. Si los campos del `200` no coinciden con los que lee `formatear_resultado`, ajustar el formateador con un test primero (Task 1, Step 1) y volver a correrlo.

- [ ] **Step 4: Correr la suite del backend**

Run: `cd backend && python -m pytest tests/test_padron_service.py tests/test_padron_ext.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/dev/API.md docs/dev/DECISIONS.md
git commit -m "docs: consulta del padrón con captcha en el chat web"
```
