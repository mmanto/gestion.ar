# Consulta de padrón electoral con captcha resuelto por el usuario (chat web)

Fecha: 2026-11-04
Estado: propuesto (pendiente de aprobación)

## Intención

Cuando un vecino pregunta en el chat de pachoteayuda dónde vota, el asistente
consulta `https://www.padron.gob.ar/` (Justicia Nacional Electoral), le muestra
el verificador (captcha de imagen) en el chat y, con el código que el usuario
escribe, devuelve el establecimiento, la mesa y el orden. Hoy el asistente sólo
puede derivar al sitio.

Sólo **chat web**: WhatsApp y Telegram llaman `run_turn` sin `session`
(`whatsapp_webhook_router.py:72`, `telegram_handlers.py:194`), y el flujo
necesita estado por conexión.

## Hallazgos verificados (2026-11-04, contra el sitio en producción)

| Paso | Request | Respuesta |
|---|---|---|
| Verificador | `POST /padron-api/captcha.jpg` | `token\|ttl\|base64JPEG` (hoy `ttl=300`) + cookie F5 `TS…` |
| Config | `GET /padron-api/config/web.json` | distritos habilitados, versión de cliente, mensajes |
| Consulta | `POST /padron-api/consulta`, form-urlencoded `c` (código), `m` (DNI), `d` (distrito), `s` (`m`/`f`/`x`), `e` (mail, opcional), Cookie `token=<token>` | `200` resultado JSON, `401` captcha inválido, `403` sesión expirada, `404` persona no encontrada, `409` distrito no habilitado, `400` campos faltantes |

Probado con curl: captcha nuevo + `c=ZZZZ` → **401** (no 400), o sea que el
servidor validó token, DNI, distrito y sexo y sólo rechazó el código. No hace
falta navegador headless: `httpx.Client` con cookies alcanza.

Distrito: el JS del sitio mapea por índice `[1]=Capital Federal, [2]=Buenos
Aires, …` → **Bolívar = 2**.

## Objetivos / no objetivos

Objetivos:

- Una consulta por vez, por conexión de chat web; reintento automático si el
  verificador vence (300 s) o el usuario pide otro.
- DNI, código y resultado viven en `session` mientras dura el flujo; no se
  cachean, no se guardan en `metadata` ni en logs. El código y el resultado
  quedan en el historial de la conversación (`conversations`) como cualquier
  mensaje del chat.
- Si el sitio falla o cambia, el chat degrada a la derivación con enlace.

No objetivos:

- WhatsApp / Telegram.
- Resolver el captcha por OCR o por servicio externo. El captcha existe para
  que lo resuelva una persona; automatizarlo choca con los términos del sitio.
- Cachear resultados (son datos personales y cambian con el padrón).
- Consultar otros datos del padrón (cambios de domicilio, etc.).

## Enfoques considerados

1. **Tool + `ns["result"]` + interceptor + widget local (elegido).** El LLM
   decide cuándo consultar y arma los argumentos; el executor baja el captcha y
   deja el widget en `ns["result"]`, que `AgentService` ya usa para reemplazar
   la narración del LLM (`agent_service.py:260-275`). El código que escribe el
   usuario lo toma el interceptor del módulo.
2. **Mensaje con el enlace y pasos.** Cero infraestructura, pero no resuelve lo
   pedido: el usuario sale del chat.
3. **Texto plano con imagen markdown.** Descartado: `ChatInterface` renderiza
   texto plano (`whitespace-pre-wrap`), no markdown ni `<img>`; habría que
   tocar el renderer igual, con menos contrato que un widget.

## Diseño

### Backend

`backend/app/services/padron_service.py` (nuevo, sin estado global):

- `fetch_captcha(client) -> Captcha(token, ttl, image_b64)` — `POST` al
  endpoint, parsea `token|ttl|b64`.
- `consultar(client, *, token, codigo, dni, distrito, sexo, email="") -> dict`
  — devuelve `{"status": 200|401|403|404|409|5xx|"error", "data": ...}`.
- `formatear_resultado(data) -> str` — establecimiento, dirección, mesa, orden,
  en texto para el chat. Los nombres exactos de los campos del `200` se
  confirman contra una consulta real durante la implementación; el formateador
  es defensivo (si falta un campo, no lo imprime).
- Constantes: `BASE_URL`, `DISTRITO_BUENOS_AIRES = 2`, `USER_AGENT` propio
  (`gestionar-pachoteayuda/1.0`), timeouts cortos.

`backend/app/modules/padron_ext.py` (nuevo):

- `provide_tools(bot, client, client_id, canal, ns)` → dos tools:
  `solicitar_datos_padron(dni?, sexo?, distrito?)`, que inicia el flujo y pide
  en el chat los datos faltantes completándolos con el texto libre de los
  turnos siguientes, y `consultar_padron(dni: int, sexo: "m"|"f"|"x",
  distrito: int = 2)` para la consulta directa con ambos datos. El
  executor:
  1. valida argumentos (DNI 6-8 dígitos, sexo válido, distrito permitido);
  2. `fetch_captcha`;
  3. guarda `ns["pending"] = {token, ttl, args, fetched_at}`;
  4. deja `ns["result"] = {"message": "...", "widget": {"widget_type":
     "padron_captcha", "image": "data:image/jpeg;base64,…"}}`.
- `intercept(bot, client_id, user_text, ns)`:
  - sin `ns["pending"]` → `None` (el turno sigue al LLM normal);
  - `user_text` normalizado a código (`[A-Za-z0-9]{4,8}`); si no matchea,
    re-pregunta sin consumir el token;
  - si pasaron > `ttl` segundos → baja captcha nuevo y lo devuelve con aviso;
  - pide "otro"/"actualizar" → captcha nuevo;
  - llama `consultar`; `401`/`403` → captcha nuevo + reintento; `404` → "no
    figura en el padrón"; `409` → distrito no habilitado; `200` → mensaje con
    el resultado y `ns.pop("pending")`.
  - Un segundo pedido mientras hay uno pendiente reemplaza el estado (un solo
    captcha vivo por conexión).

`backend/app/modules/manifest.py`: módulo `padron` (`scope="entitled"`,
`chat=ChatContribution(tools_provider=..., interceptor=..., widget_types=("padron_captcha",))`).

Migración nueva: inserta `('padron', 'Padrón electoral', 'Consulta del padrón
con verificador resuelto por el usuario')` en `modules` (como
`20260706_0232` para `lead_funnel`).

Script `backend/scripts/enable_pachoteayuda_padron.py`: otorga y habilita el
módulo para el bot de pachoteayuda (patrón de
`enable_pachoteayuda_public_sources.py`), y agrega la tool a
`ius_config.estado_de_herramientas` si el bloque existe en prod (sin eso el
prompt puede seguir prohibiendo mencionarla).

`ENABLED_MODULES` en prod: si el deploy lo define explícitamente, hay que
sumarle `padron`; si está ausente, no aplica.

### Frontend

- `frontend/src/components/chat/PadronCaptchaWidget.tsx`: `<img>` del data URL,
  input del código, botón "Consultar" (→ `onSelectOption(codigo)`) y "Otro
  verificador" (→ `onSelectOption("otro captcha")`).
- `frontend/src/modules/chatWidgets.tsx`: registrar `padron_captcha` (componente
  local, sin Module Federation — el registry de `appointments` sigue vacío por
  el problema de CSS global).
- `frontend/src/types/chat.types.ts`: `PadronCaptchaWidget` en la unión de
  widgets y caso en el parser; `ChatWidget.tsx` pasa a `ChatWidgetData`.

### Riesgos

- **F5 ASM**: el sitio setea cookie `TS…`. Desde una IP residencial respondió
  200; hay que probar desde el VPS antes de prometer el feature. Si challengea,
  el fallback es el enlace oficial.
- **Términos del sitio**: el captcha está para que lo resuelva una persona; el
  flujo mantiene al humano en el loop y no lo automatiza. No se cachea ni se
  reutiliza el token.
- **Datos personales** (Ley 25.326): DNI y resultado no se loguean ni se
  guardan; sólo viven en la sesión del WebSocket.
- **Cambios del sitio**: es una integración no oficial; si cambian los
  endpoints, el módulo degrada al enlace.

## Verificación

- `backend/tests/test_padron_service.py`: parseo de captcha, mapeo de status,
  formateo (sin red, con transporte falso).
- `backend/tests/test_padron_ext.py`: pendiente → 401 → captcha nuevo;
  vencimiento; éxito limpia `ns["pending"]`; segundo pedido reemplaza estado.
- Smoke: chat web real de pachoteayuda con un DNI de prueba, verificando que la
  imagen se ve, que un código erróneo pide otro y que un código correcto
  devuelve el resultado.

## Documentación (al cerrar)

`CHANGELOG.md`, `docs/dev/API.md` (integración saliente + widget), ADR en
`docs/dev/DECISIONS.md`, `ENV.md` si toca `ENABLED_MODULES`.
