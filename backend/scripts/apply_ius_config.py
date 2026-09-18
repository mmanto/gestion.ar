#!/usr/bin/env python3
"""
Aplica al bot IUS de dev/QA el prompt canónico versionado en
docs/ius_legal_config.json (fuente de verdad del agente: HOW_TO_USE,
agent_identity, config, plazos_legales, arbol_decision, matriz_documentacion,
senales_decision, intencion_pago, descarte_inmediato, acciones_por_color, flow,
rules, state_vars, priority, triggers, forbidden,
registro_automatico_calificacion).

El contenedor del backend monta ./docs -> /app/documents, así que el JSON
versionado se lee de /app/documents/ius_legal_config.json.

Merge, no reemplazo: el JSON versionado gana en las claves de primer nivel que
declara y se preservan las claves de ius_config que sólo viven en la DB
(estado_de_herramientas, regla_de_enlaces, datos_que_cambian_seguido,
mapa_urls_por_tema, ... — ver ADR-018/ADR-021).

Excepción al "preservar": las claves que el prompt canónico RENOMBRÓ
(SUPERSEDED_KEYS) se ELIMINAN del config vivo — si sobreviven, quedan como peso
muerto que ningún lector usa (hoy sólo `identity` -> `agent_identity`, ver el
rename del paso 1.1 del prompt canónico; `build_effective_system_prompt` lee
únicamente `agent_identity`).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/apply_ius_config.py --dry-run
    docker compose exec app python scripts/apply_ius_config.py --apply

Sin --bot-id el script descubre el bot: ius_config no vacío con identidad IUS
(agent_identity.nombre/identity.name con "ius", o agent_identity.rol/identity.role
con "legal"/"laboral") y auto_qualify_colors habilitado. Si hay más de uno exige
--bot-id explícito (no escribe nada).

Idempotente: re-aplicar es seguro (docs/ius_legal_config.json sigue siendo la fuente).

Producción no se toca: el destino es el bot IUS de dev/QA de este stack.
"""

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.db.database import AsyncSessionLocal
from app.db.models import Bot

DOCS_DIR = Path("/app/documents")  # el contenedor monta ./docs -> /app/documents
IUS_CONFIG_JSON = DOCS_DIR / "ius_legal_config.json"

# Claves de primer nivel que el JSON versionado declara: son las que el merge
# sobrescribe. Todo lo demás que viva en ius_config (DB) se preserva.
EXPECTED_RULES = 32
REQUIRED_KEYS = ("arbol_decision", "plazos_legales", "HOW_TO_USE")

# Claves de primer nivel que el prompt canónico RENOMBRÓ: {vieja: nueva}. La
# vieja queda superada por la nueva y por eso se ELIMINA del config vivo si
# todavía está (no es una lista de claves a preservar: las claves DB-only que el
# JSON no declara se preservan tal cual). Hoy sólo `identity` (esquema viejo,
# con goal/name/role) -> `agent_identity` (nombre/rol/aclaracion_de_rol/
# presentacion), el rename del paso 1.1 del prompt canónico.
SUPERSEDED_KEYS = {"identity": "agent_identity"}


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _identity(ius: dict) -> dict:
    """Identidad del ius_config, aceptando los dos schemas en uso
    (agent_identity del prompt canónico / identity del esquema viejo)."""
    ident = ius.get("agent_identity")
    if isinstance(ident, dict) and ident:
        return {
            "nombre": ident.get("nombre") or "",
            "rol": ident.get("rol") or "",
            "presentacion": ident.get("presentacion") or "",
        }
    ident = ius.get("identity")
    if isinstance(ident, dict):
        return {
            "nombre": ident.get("name") or "",
            "rol": ident.get("role") or "",
            "presentacion": ident.get("presentacion") or "",
        }
    return {"nombre": "", "rol": "", "presentacion": ""}


def looks_like_ius(ius: dict) -> bool:
    ident = _identity(ius)
    nombre = ident["nombre"].lower()
    rol = ident["rol"].lower()
    return "ius" in nombre or "legal" in rol or "laboral" in rol


async def discover_bots(session) -> list[Bot]:
    rows = (await session.execute(select(Bot))).scalars().all()
    found = []
    for row in rows:
        config = row.config or {}
        ius = config.get("ius_config")
        if not isinstance(ius, dict) or not ius:
            continue
        colors = config.get("auto_qualify_colors") or []
        if not isinstance(colors, list) or not colors:
            continue
        if looks_like_ius(ius):
            found.append(row)
    return found


def describe_bot(row: Bot) -> str:
    return f"{row.bot_id} | {row.name} | tenant {row.tenant_id}"


def _rules(ius: dict) -> list:
    reglas = (ius.get("priority") or {}).get("reglas")
    return reglas if isinstance(reglas, list) else []


def apply_live_presentacion(versionado: dict, ius_actual: dict) -> str | None:
    """Si el bot vivo trae un agent_identity.presentacion distinto del del JSON
    versionado (= flow[0].msg), se preserva el texto vivo para no cambiar el
    saludo del bot. Devuelve el texto vivo usado, o None si no hay desvío."""
    live = (_identity(ius_actual).get("presentacion") or "").strip()
    ver_ident = versionado.get("agent_identity")
    if not isinstance(ver_ident, dict):
        return None
    versionado_pres = (ver_ident.get("presentacion") or "").strip()
    if live and live != versionado_pres:
        ver_ident["presentacion"] = live
        return live
    return None


def drop_superseded_keys(nuevo_ius: dict) -> list:
    """Elimina del merge las claves que el prompt canónico renombró
    (SUPERSEDED_KEYS) cuando la clave nueva ya está presente: la vieja quedaría
    como peso muerto que ningún lector usa. Devuelve los nombres eliminados."""
    eliminadas = sorted(
        vieja
        for vieja, nueva in SUPERSEDED_KEYS.items()
        if vieja in nuevo_ius and nueva in nuevo_ius
    )
    for vieja in eliminadas:
        del nuevo_ius[vieja]
    return eliminadas


def print_report(ius_actual: dict, versionado: dict, nuevo: dict, renombradas: list) -> None:
    old_keys = set(ius_actual)
    ver_keys = set(versionado)
    # Las claves renombradas no cuentan como "preservadas": se eliminan del merge.
    preservadas = sorted(old_keys - ver_keys - set(renombradas))
    sobrescritas = sorted(old_keys & ver_keys)
    nuevas = sorted(ver_keys - old_keys)

    print("── Claves de primer nivel de ius_config ──")
    print(f"   sobrescritas ({len(sobrescritas)}): {sobrescritas}")
    print(f"   preservadas  ({len(preservadas)}): {preservadas}")
    print(f"   nuevas       ({len(nuevas)}): {nuevas}")

    flow_ver = versionado.get("flow") if isinstance(versionado.get("flow"), list) else []
    flow_db = ius_actual.get("flow") if isinstance(ius_actual.get("flow"), list) else []
    reglas_ver = _rules(versionado)
    reglas_db = _rules(ius_actual)
    print("── Conteos ──")
    print(f"   flow (JSON versionado): {len(flow_ver)} nodos | flow (DB): {len(flow_db)} nodos")
    print(f"   priority.reglas:        {len(reglas_ver)} reglas (JSON) | {len(reglas_db)} reglas (DB)")

    pendientes = [r.get("nombre") for r in reglas_ver if isinstance(r, dict) and r.get("pendiente_validacion_legal")]
    print(f"── Reglas con pendiente_validacion_legal ({len(pendientes)}) ──")
    for nombre in pendientes:
        print(f"   - {nombre}")

    if nuevo == ius_actual:
        print("── Merge ──")
        print("   El merge es idéntico a lo que ya está en la DB (ya aplicado).")


async def run(bot_id: str | None, do_apply: bool) -> int:
    if not IUS_CONFIG_JSON.exists():
        print(f"❌ No existe {IUS_CONFIG_JSON} — nada que aplicar.")
        return 1
    versionado = load_json(IUS_CONFIG_JSON)
    if not isinstance(versionado, dict) or not versionado:
        print(f"❌ {IUS_CONFIG_JSON} no es un objeto JSON con contenido — nada que aplicar.")
        return 1

    async with AsyncSessionLocal() as session:
        if bot_id:
            row = await session.get(Bot, bot_id)
            if row is None:
                print(f"❌ Bot {bot_id} no encontrado — nada que aplicar.")
                return 1
        else:
            candidatos = await discover_bots(session)
            if not candidatos:
                print(
                    "❌ No hay bot IUS de dev/QA descubrible (ius_config no vacío + "
                    "identidad IUS + auto_qualify_colors habilitado). "
                    "Pasá --bot-id explícito."
                )
                return 1
            if len(candidatos) > 1:
                print(f"⚠️  {len(candidatos)} bots IUS candidatos — pasá --bot-id explícito:")
                for c in candidatos:
                    print(f"   - {describe_bot(c)}")
                return 1
            row = candidatos[0]

        config = dict(row.config or {})
        ius_actual = config.get("ius_config") or {}

        live_pres = apply_live_presentacion(versionado, ius_actual)
        nuevo_ius = {**ius_actual, **versionado}
        renombradas = drop_superseded_keys(nuevo_ius)

        print(f"── Bot objetivo ──")
        print(f"   {describe_bot(row)}")
        print(f"   fuente: {IUS_CONFIG_JSON}")
        if live_pres:
            print("   agent_identity.presentacion: se preserva el texto vivo del bot (≠ flow[0].msg del JSON).")
            print(f"      texto vivo usado: {live_pres!r}")
        print_report(ius_actual, versionado, nuevo_ius, renombradas)

        if not do_apply:
            print(f"   claves renombradas que se eliminarían: {renombradas}")
            print("DRY-RUN: sin escribir.")
            return 0

        print(f"   claves renombradas eliminadas: {renombradas}")
        if nuevo_ius == ius_actual:
            print("✅ Sin cambios que escribir: el bot ya tiene el ius_config versionado.")
        else:
            config["ius_config"] = nuevo_ius
            row.config = config
            # `config` es JSONB: sin flag_modified SQLAlchemy puede no incluir la
            # columna en el UPDATE cuando el cambio es sólo anidado (mismo cuidado
            # que enable_pachoteayuda_public_sources.py).
            flag_modified(row, "config")
            await session.commit()

        # Verificación releyendo el bot (no el objeto en memoria)
        await session.refresh(row)
        ius_db = (row.config or {}).get("ius_config") or {}
        faltantes = [k for k in REQUIRED_KEYS if k not in ius_db]
        n_reglas = len(_rules(ius_db))
        renombradas_presentes = sorted(k for k in SUPERSEDED_KEYS if k in ius_db)
        print("── Verificación post-commit (relectura de la DB) ──")
        print(f"   claves presentes: {[k for k in REQUIRED_KEYS if k in ius_db]}")
        if faltantes:
            print(f"❌ Faltan claves en ius_config: {faltantes}")
            return 1
        if renombradas_presentes:
            print(f"❌ Claves renombradas que sobreviven en ius_config: {renombradas_presentes}")
            return 1
        print(f"   claves renombradas ausentes: {sorted(SUPERSEDED_KEYS)}")
        if n_reglas != EXPECTED_RULES:
            print(f"❌ priority.reglas: {n_reglas} (esperado {EXPECTED_RULES})")
            return 1
        print(f"   priority.reglas: {n_reglas}")
        print(f"   agent_identity.nombre: {(ius_db.get('agent_identity') or {}).get('nombre')!r}")
        print(f"APLICADO: {row.bot_id} ({row.name}) — tenant {row.tenant_id}")
        return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Aplica docs/ius_legal_config.json al bot IUS de dev/QA")
    ap.add_argument("--bot-id", default=None, help="bot_id destino (default: descubrir el bot IUS de dev/QA)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="sólo informar, sin escribir (default)")
    mode.add_argument("--apply", action="store_true", help="escribir el merge en la DB")
    args = ap.parse_args()

    raise SystemExit(asyncio.run(run(args.bot_id, do_apply=args.apply)))


if __name__ == "__main__":
    main()
