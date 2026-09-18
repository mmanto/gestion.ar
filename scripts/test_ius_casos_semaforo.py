#!/usr/bin/env python3
"""
Suite de integración LLM — casos de prueba del semáforo IUS (canal web/PWA).

Toma los casos de `docs/qa/ius_casos_semaforo.txt` (23 historias: 9 esperadas
ROJO, 7 AMARILLO, 7 VERDE, con fechas relativas), inicia una conversación de
chat web nueva por caso contra el bot IUS que corre en el stack, y verifica que
el agente termina registrando el color esperado vía la tool
`registrar_calificacion_prospecto` (persistido en `clients.color_semaforo`).
Con `--casos` se puede apuntar al original `~/Documentos/iUS/casos_prueba.txt`,
cuyas fechas absolutas de junio 2026 quedan fuera de las ventanas de tiempo del
prompt cuando corre con la fecha real del sistema.

Solo cubre el canal web/PWA (`/ws/chat/{bot_id}` o `/ws/chat/channel/{channel_id}`
con canal tipo web|pwa). No toca Telegram ni WhatsApp.

Requisitos del entorno:
- Stack levantado (postgres + redis + backend) — ej. `docker compose up -d`.
- El bot debe tener `ius_config` IUS (canónico: `agent_identity` + `priority.reglas`
  con el árbol de decisión) y `auto_qualify_colors` no vacío; si falta, usar
  `--enable-auto-colors` (solo en entornos de desarrollo/QA; muta la config del bot
  en la DB).
- LLM configurado en el backend (env `LLM_PROVIDER` del proceso que corre
  la app: claude, deepseek u ollama).

El resultado depende del modelo: la clasificación no es determinista, por eso
el script reporta caso por caso y termina con resumen. No es un test de pytest.

Cada caso abre una sesión nueva (device_id propio) y crea/usa un client de
prueba con `external_id = ius-sem-*` en el bot objetivo: apuntá la suite a un
bot de QA/dev, no a uno con datos reales.

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
# Fixture versionado con fechas relativas (el original de ~/Documentos/iUS usa
# fechas absolutas de junio 2026 y queda fuera de las ventanas de tiempo del
# prompt cuando corre con la fecha real del sistema). Ver --casos.
DEFAULT_CASOS = REPO_ROOT / "docs" / "qa" / "ius_casos_semaforo.txt"

# Mapas de color: sección del archivo -> valor de clients.color_semaforo
COLOR_FROM_SECTION = {
    "ROJO": "rojo",
    "AMARILLO": "amarillo",
    "VERDE": "verde",
}

SECTION_RE = re.compile(r"^ASUNTOS\s+EN\s+(ROJO|AMARILLO|VERDE)", re.IGNORECASE)
CASE_NUM_RE = re.compile(r"^\s*\d+[.)]?\s+\S")

def follow_up_messages(text: str, max_turns: int):
    """Mensajes de continuación cuando el bot no registró la calificación.

    Un usuario real, ante un bot que vuelve a pedir datos que ya dio, repite la
    información y cierra. El caso ya es completo en el primer mensaje, así que el
    segundo turno lo reenvía (ahí van la fecha relativa de desvinculación y el
    resto de los datos) y el tercero aporta lo único que el flujo pregunta aparte
    y el caso no siempre explicita: que no hubo solicitud de conciliación.

    Dos cosas que este texto NO hace, a propósito (medidas el 2026-09-18):

    - No le pide al bot que diga el color ni la palabra "semáforo": el prompt se lo
      prohíbe (`forbidden`, `registro_automatico_calificacion`) y el modelo se
      negaba a responder en vez de registrar la calificación.
    - No dice "no tengo más datos" a secas, que dejaba al bot pidiendo la fecha
      exacta con un "usuario" que nunca contestaba.
    """
    nudge_repeat = f"Te repito toda la información que tengo sobre mi caso: {text}"
    nudge_close = (
        "Mi último día de trabajo es el que te dije (hace el tiempo que te conté) y "
        "nunca presenté solicitud de conciliación ante el Centro de Conciliación "
        "Laboral, así que no hay Constancia de No Conciliación. No tengo más "
        "documentación ni más datos. Aplicá las reglas del sistema con lo que ya te "
        "di y dejá registrada la calificación ahora, sin pedirme más datos."
    )
    pool = [nudge_repeat, nudge_close]
    if max_turns - 1 > len(pool):
        pool += [nudge_close] * (max_turns - 1 - len(pool))
    return pool[: max(0, max_turns - 1)]



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
    for color in ("rojo", "amarillo", "verde"):
        if counts.get(color, 0) < 1:
            raise SystemExit(
                f"El archivo de casos no tiene casos en {color}: {counts}"
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
        """Elige el bot IUS calificable; devuelve (bot_id, channel_id|None).

        Acepta los dos schemas de ius_config en uso: el de `traffic_light`
        (plantilla de configs nuevas) y el de `priority.reglas` (prompt canónico,
        32 reglas), identificando la identidad IUS en `agent_identity` (nombre/rol)
        o en `identity` (name/role).
        """
        if args.bot_id:
            bot_id = args.bot_id
        else:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT bot_id FROM bots
                    WHERE jsonb_typeof(config->'ius_config') = 'object'
                      AND (config->'ius_config' ? 'traffic_light'
                           OR config->'ius_config' ? 'priority')
                      AND (
                        config->'ius_config'->'agent_identity'->>'nombre' ILIKE '%ius%'
                        OR config->'ius_config'->'agent_identity'->>'rol' ILIKE '%legal%'
                        OR config->'ius_config'->'identity'->>'name' ILIKE '%ius%'
                        OR config->'ius_config'->'identity'->>'role' ILIKE '%laboral%'
                      )
                      AND config->'auto_qualify_colors' IS NOT NULL
                      AND jsonb_array_length(coalesce(config->'auto_qualify_colors','[]'::jsonb)) > 0
                    ORDER BY status = 'active' DESC, updated_at DESC
                    LIMIT 1
                    """
                )
                row = cur.fetchone()
            if not row:
                raise SystemExit(
                    "No hay bot IUS con ius_config (traffic_light o priority.reglas) y "
                    "auto_qualify_colors habilitado. Pasá --bot-id explícito, o usá "
                    "--enable-auto-colors con --bot-id (dev/QA)."
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
    metas = []
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

        user_messages = [text, *follow_up_messages(text, max_turns)]
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
                    if msg.get("metadata"):
                        metas.append(msg["metadata"])
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
        "tokens_used": sum(m.get("tokens_used", 0) or 0 for m in metas),
    }


COLOR_ORDEN = ("rojo", "amarillo", "verde")  # desempate estable del consenso


def consensus(runs):
    """Consenso de un caso a partir de sus corridas (colores o None).

    Devuelve (color, estabilidad, conteo). `estabilidad` es la fracción de
    corridas que dieron ese color. El desempate entre colores con la misma
    cantidad sigue COLOR_ORDEN para que el reporte sea reproducible.
    """
    colores = [c for c in runs if c]
    if not colores:
        return None, 0.0, {}
    conteo = {}
    for c in colores:
        conteo[c] = conteo.get(c, 0) + 1
    color = sorted(conteo, key=lambda c: (-conteo[c], COLOR_ORDEN.index(c)))[0]
    return color, conteo[color] / len(runs), conteo


def main():
    ap = argparse.ArgumentParser(description="Suite LLM casos de semáforo IUS (canal web)")
    ap.add_argument("--casos", type=Path, default=DEFAULT_CASOS, help="Archivo de casos")
    ap.add_argument("--ws-url", default="ws://127.0.0.1:8000")
    ap.add_argument("--bot-id", default=None)
    ap.add_argument("--channel-id", default=None)
    ap.add_argument("--limit", type=int, default=None, help="Correr solo los primeros N casos")
    ap.add_argument("--max-turns", type=int, default=3)
    ap.add_argument("--turn-timeout", type=int, default=180)
    ap.add_argument("--repetitions", type=int, default=1,
                    help="Corridas por caso. Con >1 reporta el consenso y la estabilidad: "
                         "el modelo no es determinista (ver docs/qa/TESTING.md)")
    ap.add_argument("--db-host", default="127.0.0.1")
    ap.add_argument("--db-port", type=int, default=5433)
    ap.add_argument("--enable-auto-colors", action="store_true", help="(dev/QA) habilita los 3 colores en el bot")
    args = ap.parse_args()

    if not args.casos.exists():
        raise SystemExit(f"No existe el archivo de casos: {args.casos}")

    casos = parse_casos(args.casos)
    if args.limit:
        casos = casos[: args.limit]
    print(f"[casos] {len(casos)} cargados desde {args.casos}"
          + (f" | {args.repetitions} corridas por caso" if args.repetitions > 1 else ""))

    db = DB(args)
    bot_id, channel_id = db.find_bot(args)
    print(f"[target] bot={bot_id} canal_web={'sí' if channel_id else 'no (ruta por bot)'}")

    # por caso: dict con expected, corridas (colores), estados individuales
    resultados = []
    for idx, (expected, text) in enumerate(casos, start=1):
        corridas = []
        estados = []
        for _ in range(args.repetitions):
            session_id = f"ius-sem-{uuid.uuid4().hex[:10]}"
            try:
                r = run_case(
                    args.ws_url, bot_id, channel_id, session_id, text,
                    db, args.max_turns, args.turn_timeout,
                )
                corridas.append(r["color"])
                if r["color"] is None:
                    estados.append("SIN_CALIFICACIÓN" + (f" ({r['error']})" if r["error"] else ""))
                else:
                    estados.append(r["color"])
                ultima = (r["last_reply"] or "").replace("\n", " ")[:110] or "(respuesta vacía)"
            except Exception as exc:  # noqa: BLE001 — un caso no debe tumbar la suite
                corridas.append(None)
                estados.append(f"ERROR: {exc}")
                ultima = "(error)"
        consenso, estabilidad, conteo = consensus(corridas)
        if consenso is None:
            estado = "SIN_CALIFICACIÓN"
        elif consenso == expected:
            estado = "OK"
        else:
            estado = "MISMATCH"
        detalle = " ".join(f"{k}×{v}" for k, v in sorted(conteo.items(), key=lambda kv: -kv[1])) or "—"
        print(f"[{idx}/{len(casos)}] esperado={expected} … {estado}  consenso={consenso or '—'}"
              f"  ({detalle} de {len(corridas)})")
        if args.repetitions == 1 or len(set(estados)) > 1:
            print(f"      corridas: {' | '.join(estados)}")
            if args.repetitions == 1:
                print(f"      respuesta: {ultima}")
        resultados.append({
            "expected": expected, "consenso": consenso, "estado": estado,
            "estabilidad": estabilidad, "corridas": corridas,
        })

    ok = sum(1 for r in resultados if r["estado"] == "OK")
    estables = sum(1 for r in resultados if len(set(r["corridas"])) == 1)
    print("\n=== Consenso por caso ===")
    for i, r in enumerate(resultados, start=1):
        detalle = " ".join(f"{k}×{v}" for k, v in
                           [(c, r["corridas"].count(c)) for c in sorted(set(r["corridas"]), key=lambda c: (c is None, c))])
        print(f"{i:>2}. esperado={r['expected']:<8} consenso={r['consenso'] or '—':<8}"
              f" ({detalle or '—'})  {r['estado']}")
    print(f"\nOK por consenso {ok}/{len(resultados)}")
    if args.repetitions > 1:
        print(f"Casos con el mismo resultado en las {args.repetitions} corridas: {estables}/{len(resultados)}")
        por_corrida = {i: sum(1 for r in resultados if r["corridas"][i] == r["expected"])
                       for i in range(args.repetitions)}
        print("OK por corrida individual (ruido del modelo): "
              + ", ".join(f"corrida {i + 1}: {v}/{len(resultados)}" for i, v in por_corrida.items()))
    if ok < len(resultados):
        print("Hubo casos cuyo consenso no coincide con el color esperado (ver arriba). "
              "La clasificación depende del LLM configurado en el backend.")
        sys.exit(1)


if __name__ == "__main__":
    main()
