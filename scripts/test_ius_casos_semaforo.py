#!/usr/bin/env python3
"""
Suite de integración LLM — casos de prueba del semáforo IUS (canal web/PWA).

Toma los casos reales de `~/Documentos/iUS/casos_prueba.txt` (15 historias:
5 esperadas ROJO, 5 AMARILLO, 5 VERDE), inicia una conversación de chat web
nueva por caso contra el bot IUS que corre en el stack, y verifica que el
agente termina registrando el color esperado vía la tool
`registrar_calificacion_prospecto` (persistido en `clients.color_semaforo`).

Solo cubre el canal web/PWA (`/ws/chat/{bot_id}` o `/ws/chat/channel/{channel_id}`
con canal tipo web|pwa). No toca Telegram ni WhatsApp.

Requisitos del entorno:
- Stack levantado (postgres + redis + backend) — ej. `docker compose up -d`.
- El bot debe tener `ius_config` moderno (con `traffic_light`) y
  `auto_qualify_colors` no vacío; si falta, usar `--enable-auto-colors`
  (solo en entornos de desarrollo/QA; muta la config del bot en la DB).
- LLM configurado en el backend (env `LLM_PROVIDER` del proceso que corre
  la app: claude, deepseek u ollama).

El resultado depende del modelo: la clasificación no es determinista, por eso
el script reporta caso por caso y termina con resumen. No es un test de pytest.

Uso:
  python scripts/test_ius_casos_semaforo.py [--casos RUTA] [--ws-url URL]
      [--bot-id ID] [--channel-id ID] [--limit N] [--max-turns 3]
      [--enable-auto-colors] [--db-host H] [--db-port P]
"""

import argparse
import json
import os
import re
import sys
import uuid
from pathlib import Path

import psycopg2
import websockets.sync.client
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CASOS = Path.home() / "Documentos" / "iUS" / "casos_prueba.txt"

# Mapas de color: sección del archivo -> valor de clients.color_semaforo
COLOR_FROM_SECTION = {
    "ROJO": "rojo",
    "AMARILLO": "amarillo",
    "VERDE": "verde",
}

SECTION_RE = re.compile(r"^ASUNTOS\s+EN\s+(ROJO|AMARILLO|VERDE)", re.IGNORECASE)
CASE_NUM_RE = re.compile(r"^\s*\d+[.)]?\s+\S")

FOLLOW_UP_TURNS = [
    # Segundo mensaje: el caso ya está completo en el primer mensaje; se le
    # pide avanzar sin aportar datos nuevos (igual que un usuario real al que
    # el bot le pide más datos que ya dio).
    "Esa es toda la información de mi caso, no tengo nada más que agregar. "
    "Clasificá mi caso y registrá la calificación final ahora.",
    "Clasificá mi caso ahora mismo con la información que ya te di y registrá "
    "la calificación del semáforo.",
]


def parse_casos(path: Path):
    """Parsea el archivo de casos en [(color_esperado, texto), ...].

    Formato: secciones `ASUNTOS EN <COLOR> (…)` con casos numerados 1..N.
    Los párrafos sin número se anexan al caso en curso; si aparecen antes del
    primer caso de la sección (o entre un caso y el siguiente pero describen
    al siguiente, como en el caso 4 de AMARILLO), se adjuntan al caso que
    les sigue.
    """
    casos = []  # (color, [paragraphs])
    current_color = None
    current_case = None  # dict color/text_parts
    pending = []  # párrafos sin número esperando al próximo caso numerado

    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            m = SECTION_RE.search(line)
            if m:
                if current_case is not None:
                    casos.append((current_color, current_case["parts"]))
                current_color = COLOR_FROM_SECTION[m.group(1).upper()]
                current_case = None
                pending = []
                continue
            if current_color is None:
                continue
            if CASE_NUM_RE.match(line):
                if current_case is not None:
                    casos.append((current_color, current_case["parts"]))
                current_case = {"color": current_color, "parts": []}
                if pending:
                    current_case["parts"].extend(pending)
                    pending = []
                current_case["parts"].append(line)
            elif current_case is not None:
                # Continuación/evidencia del caso en curso
                current_case["parts"].append(line)
            else:
                # Párrafo suelto antes del primer caso numerado de la sección
                pending.append(line)

    if current_case is not None:
        casos.append((current_color, current_case["parts"]))

    # Normalizar: texto plano del caso, colapsando saltos de línea en espacios
    out = []
    for color, parts in casos:
        text = " ".join(parts)
        text = re.sub(r"\s+", " ", text).strip()
        out.append((color, text))

    counts = {}
    for color, _ in out:
        counts[color] = counts.get(color, 0) + 1
    expected = {"rojo": 5, "amarillo": 5, "verde": 5}
    if counts != expected:
        raise SystemExit(
            f"El archivo de casos no tiene 5 por color: {counts} (esperado {expected})"
        )
    return out


class DB:
    def __init__(self, args):
        # El shell puede traer DB_* de otros proyectos; el .env.dev del repo
        # define las credenciales del stack dev y manda.
        load_dotenv(REPO_ROOT / ".env.dev", override=True)
        self.conn = psycopg2.connect(
            host=args.db_host,
            port=args.db_port,
            dbname=os.getenv("DB_NAME", "gestionar"),
            user=os.getenv("DB_USER", "gestionar_user"),
            password=os.getenv("DB_PASSWORD", "gestionar_dev_password"),
        )
        self.conn.autocommit = True

    def find_bot(self, args):
        """Elige el bot IUS con ius_config moderno; devuelve (bot_id, channel_id|None)."""
        if args.bot_id:
            bot_id = args.bot_id
        else:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT bot_id FROM bots
                    WHERE jsonb_typeof(config->'ius_config') = 'object'
                      AND config->'ius_config' ? 'traffic_light'
                      AND (
                        config->'ius_config'->'agent_identity'->>'nombre' ILIKE '%ius%'
                        OR config->'ius_config'->'agent_identity'->>'rol' ILIKE '%legal%'
                      )
                      AND status = 'active'
                    ORDER BY jsonb_array_length(coalesce(config->'auto_qualify_colors','[]'::jsonb)) DESC
                    LIMIT 1
                    """
                )
                row = cur.fetchone()
            if not row:
                raise SystemExit(
                    "No hay bot IUS activo con ius_config moderno (traffic_light). "
                    "Pasá --bot-id explícito o creá el bot de QA."
                )
            bot_id = row[0]

        if args.enable_auto_colors:
            with self.conn.cursor() as cur:
                cur.execute(
                    "UPDATE bots SET config = jsonb_set(config,'{auto_qualify_colors}',"
                    " '[\"verde\",\"amarillo\",\"rojo\"]'::jsonb) WHERE bot_id = %s",
                    (bot_id,),
                )
            print(f"[setup] auto_qualify_colors habilitados en {bot_id}")

        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT config->'auto_qualify_colors' FROM bots WHERE bot_id = %s",
                (bot_id,),
            )
            colors = cur.fetchone()[0]
            cur.execute(
                "SELECT channel_id FROM channels "
                "WHERE bot_id = %s AND channel_type IN ('web','pwa') AND status = 'active' "
                "ORDER BY channel_type = 'pwa' DESC LIMIT 1",
                (bot_id,),
            )
            ch = cur.fetchone()

        if not colors:
            raise SystemExit(
                f"{bot_id} no tiene auto_qualify_colors. Usá --enable-auto-colors "
                "(solo dev/QA) o activalos desde el panel del tenant."
            )
        channel_id = args.channel_id or (ch[0] if ch else None)
        return bot_id, channel_id

    def client_color(self, bot_id, session_id):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT color_semaforo FROM clients WHERE bot_id = %s AND external_id = %s",
                (bot_id, session_id),
            )
            row = cur.fetchone()
        return row[0] if row else None


def run_case(ws_url, bot_id, channel_id, session_id, text, db, max_turns, turn_timeout):
    """Corre una historia; devuelve dict con color registrado, turnos y cola de diálogo."""
    path = (
        f"/ws/chat/channel/{channel_id}?device_id={session_id}"
        if channel_id
        else f"/ws/chat/{bot_id}?device_id={session_id}"
    )
    endpoint = f"{ws_url}{path}"
    messages = []
    color = None
    turns = 0
    error = None

    with websockets.sync.client.connect(endpoint, open_timeout=30) as ws:
        # Consumir el welcome (y cualquier frame previo) hasta tener la bienvenida
        while True:
            raw = ws.recv(timeout=turn_timeout)
            msg = json.loads(raw)
            if msg.get("type") == "welcome":
                break

        user_messages = [text, *FOLLOW_UP_TURNS[: max_turns - 1]]
        for turn_idx, user_text in enumerate(user_messages):
            turns += 1
            ws.send(json.dumps({"type": "message", "content": user_text}))
            reply = None
            while True:
                raw = ws.recv(timeout=turn_timeout)
                msg = json.loads(raw)
                mtype = msg.get("type")
                if mtype == "message" and msg.get("role") == "assistant":
                    reply = msg.get("content") or reply
                    messages.append(reply)
                elif mtype == "error":
                    error = msg.get("message")
                    break
                elif mtype == "typing" and msg.get("status") is False:
                    # fin del turno (el servidor siempre manda typing false en finally)
                    break
            if error:
                break
            color = db.client_color(bot_id, session_id)
            if color:
                break

    return {
        "color": color,
        "turns": turns,
        "error": error,
        "last_reply": (messages[-1] if messages else ""),
    }


def main():
    ap = argparse.ArgumentParser(description="Suite LLM casos de semáforo IUS (canal web)")
    ap.add_argument("--casos", type=Path, default=DEFAULT_CASOS, help="Archivo de casos")
    ap.add_argument("--ws-url", default="ws://127.0.0.1:8000")
    ap.add_argument("--bot-id", default=None)
    ap.add_argument("--channel-id", default=None)
    ap.add_argument("--limit", type=int, default=None, help="Correr solo los primeros N casos")
    ap.add_argument("--max-turns", type=int, default=3)
    ap.add_argument("--turn-timeout", type=int, default=180)
    ap.add_argument("--db-host", default="127.0.0.1")
    ap.add_argument("--db-port", type=int, default=5433)
    ap.add_argument("--enable-auto-colors", action="store_true", help="(dev/QA) habilita los 3 colores en el bot")
    args = ap.parse_args()

    if not args.casos.exists():
        raise SystemExit(f"No existe el archivo de casos: {args.casos}")

    casos = parse_casos(args.casos)
    if args.limit:
        casos = casos[: args.limit]
    print(f"[casos] {len(casos)} cargados desde {args.casos}")

    db = DB(args)
    bot_id, channel_id = db.find_bot(args)
    via = f"channel/{channel_id}" if channel_id else f"bot/{bot_id}"
    print(f"[target] bot={bot_id} canal_web={'sí' if channel_id else 'no (ruta por bot)'}")

    results = []
    for idx, (expected, text) in enumerate(casos, start=1):
        session_id = f"ius-sem-{uuid.uuid4().hex[:10]}"
        print(f"[{idx}/{len(casos)}] esperado={expected} … ", end="", flush=True)
        try:
            r = run_case(
                args.ws_url, bot_id, channel_id, session_id, text,
                db, args.max_turns, args.turn_timeout,
            )
            got = r["color"]
            if got is None:
                state = "SIN_CALIFICACIÓN" + (f" ({r['error']})" if r["error"] else "")
            elif got == expected:
                state = "OK"
            else:
                state = "MISMATCH"
            tail = (r["last_reply"] or "").replace("\n", " ")[:110]
            print(f"{state}  obtenido={got or '—'}  turnos={r['turns']}")
            print(f"      respuesta: {tail}")
        except Exception as exc:  # noqa: BLE001 — un caso no debe tumbar la suite
            got = None
            state = f"ERROR: {exc}"
            print(state)
        results.append((expected, got, state))

    ok = sum(1 for _, _, s in results if s == "OK")
    print("\n=== Resumen ===")
    for i, (expected, got, state) in enumerate(results, start=1):
        print(f"{i:>2}. esperado={expected:<8} obtenido={got or '—':<8} {state}")
    print(f"\nOK {ok}/{len(results)}")
    if ok < len(results):
        print("Hubo casos no clasificados correctamente (ver arriba). "
              "La clasificación depende del LLM configurado en el backend.")
        sys.exit(1)


if __name__ == "__main__":
    main()
