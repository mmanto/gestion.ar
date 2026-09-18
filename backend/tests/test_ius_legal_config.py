"""
Test offline (sin LLM ni stack) del prompt canónico de iUS versionado en
docs/ius_legal_config.json -- la fuente de verdad del comportamiento del agente.

No mide al modelo: mide el artefacto. Es lo que evita la deriva que este repo ya
sufrió (reglas que decían "25" cuando había 27, reglas que filtraban por
`tiempo_desvinculacion`/`antiguedad_laboral` cuando el flow escribe
`tiempo_transcurrido`/`periodo_trabajado`, así que nunca podían cumplirse).
Cualquier edición del JSON que rompa estas invariantes falla acá, antes de
aplicar la config al bot.
"""

import json
from pathlib import Path

from app.services.ius_validator import validate_structure

CONFIG_PATH = Path(__file__).resolve().parents[2] / "docs" / "ius_legal_config.json"
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

COLORES = ("verde", "amarillo", "rojo")

# Campos de una regla que no filtran sobre state_vars (metadatos de la regla).
CAMPOS_META = {"color", "nombre", "texto", "condicion", "evaluar", "pendiente_validacion_legal",
               "precedencia"}


def test_versioned_config_has_no_structural_errors():
    issues = validate_structure(CONFIG)

    errores = [f"{i['field']}: {i['message']}" for i in issues if i["severity"] == "error"]

    assert errores == []


def test_rule_fields_reference_declared_state_vars():
    """Toda regla filtra por variables que el flow realmente escribe."""
    state_vars = CONFIG["state_vars"]
    umbrales = {u["nombre"] for u in CONFIG["priority"]["umbrales"]}

    invalidas = []
    for regla in CONFIG["priority"]["reglas"]:
        for campo, valor in regla.items():
            if campo in CAMPOS_META:
                continue
            if campo not in state_vars:
                invalidas.append(f"{regla['nombre']}.{campo}: variable inexistente en state_vars")
                continue
            admitidos = {v.strip() for v in state_vars[campo].split("|")}
            for v in valor if isinstance(valor, list) else [valor]:
                if v is None or v == "cualquiera":
                    continue
                if v not in admitidos and v not in umbrales:
                    invalidas.append(f"{regla['nombre']}.{campo}={v!r}: valor no admitido")

    assert invalidas == []


def test_rule_precedence_is_total_and_ordered():
    """El orden de las reglas es lo que hace determinista la clasificación."""
    reglas = CONFIG["priority"]["reglas"]
    precedencias = [r["precedencia"] for r in reglas]

    assert sorted(precedencias) == list(range(1, len(reglas) + 1))

    por_nombre = {r["nombre"]: r["precedencia"] for r in reglas}
    for excepcion in (
        "issste_renuncia_impugnada_con_evidencia",
        "renuncia_con_promesa_liquidacion_incumplida",
        "imss_seis_siete_semanas_renuncia_huella_voluntaria",
        "issste_catorce_quince_semanas_renuncia_huella_voluntaria",
    ):
        assert por_nombre[excepcion] < por_nombre["renuncia_voluntaria_firmada"], excepcion


def test_arbol_decision_gotos_resolve():
    """Cada rama del árbol apunta a un paso, a un terminal y a nodos del flow existentes."""
    arbol = CONFIG["arbol_decision"]
    pasos = arbol["pasos"]
    paso_ids = {p["id"] for p in pasos}
    terminal_ids = {t["id"] for t in arbol["terminales"]}
    flow_ids = {n["id"] for n in CONFIG["flow"]}

    rotas = []
    for paso in pasos:
        if paso["siguiente"] is not None and paso["siguiente"] not in paso_ids:
            rotas.append(f"{paso['id']}.siguiente -> {paso['siguiente']}")
        if paso["no"] and paso["no"]["goto"] not in terminal_ids | paso_ids:
            rotas.append(f"{paso['id']}.no.goto -> {paso['no']['goto']}")
        for nodo in paso["nodos_flow"]:
            if nodo not in flow_ids:
                rotas.append(f"{paso['id']}.nodos_flow -> {nodo}")
    for terminal in arbol["terminales"]:
        for nodo in terminal["nodos_flow"]:
            if nodo not in flow_ids:
                rotas.append(f"{terminal['id']}.nodos_flow -> {nodo}")

    assert rotas == []
    assert len(paso_ids) == len(pasos)
    assert {t["color"] for t in arbol["terminales"]} <= set(COLORES)


def test_validator_ignores_foreign_configs():
    """El mismo validador sirve a los ius_config de otros tenants (ERMA, pachoteayuda)."""
    issues = validate_structure({
        "agent_identity": {"nombre": "X", "rol": "Y", "presentacion": "Hola"},
        "flujo_de_turno": {},
    })

    ajenos = [
        i for i in issues
        if i["field"].startswith(("plazos_legales", "arbol_decision", "priority", "state_vars", "acciones_por_color"))
    ]

    assert ajenos == []
