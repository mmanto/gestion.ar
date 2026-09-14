#!/usr/bin/env python3
"""
Habilita las fuentes públicas en vivo en el chat de pachoteayuda (pachoteayuda.ar,
el chat embebido en la landing de César Pacho):

  1. Agrega `config.public_sources` al bot — es la bandera que hace que el chat
     web le ofrezca al LLM las tools del Boletín Oficial Municipal (SIBOM), de
     la farmacia de turno, de las autoridades y de la recolección de residuos
     del sitio del municipio (ver BotConfig / PublicSourcesConfig y
     app/services/public_sources_service.py).
  2. Marca las herramientas del bloque `ius_config.estado_de_herramientas` como
     implementadas, agrega las que no existían (`buscar_norma_publicada`,
     `autoridades_municipales` y `recoleccion_de_residuos`) y completa
     `datos_que_cambian_seguido` con el tema, el mapa tema → herramienta y las
     instrucciones de uso. Sin esto la tool funciona igual, pero el prompt le
     prohíbe al agente usarlas o mencionarlas (`regla_si_no_implementada`) y,
     para los temas de `datos_que_cambian_seguido`, el agente no tiene cómo
     saber qué herramienta consultar: el vecino seguiría recibiendo la
     derivación. Además reemplaza la documentación obsoleta del bloque
     (describía cómo extraer el dato del HTML a mano, cuando ahora lo devuelve
     la tool).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/enable_pachoteayuda_public_sources.py

Idempotente: re-ejecutarlo es seguro (ya aplicado → no cambia nada).
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.db.database import AsyncSessionLocal
from app.db.models import Bot

# pachoteayuda.ar — único tenant de Pacho en prod (id verificado 2026-08-16).
PACHOTEAYUDA_TENANT_IDS = [
    "tenant_2fc38a44e696",
]

# San Carlos de Bolívar en SIBOM (city_id verificado contra el buscador del sitio).
PUBLIC_SOURCES = {
    "sibom_city_id": 15,
    "municipal_url": "https://www.bolivar.gob.ar/",
}

FARMACIA_FUENTE = (
    "https://www.bolivar.gob.ar/ — listado #listafarmacias con día, farmacia, "
    "dirección y teléfono (renderizado en el servidor)"
)
FARMACIA_PATRON = "Últimas 48 h: {{nombre}}|DIRECCIÓN|TELÉFONO"

# La tool de SIBOM también tiene que figurar en estado_de_herramientas: el
# prompt del bot decide "consultar en vivo" sólo por las herramientas listadas
# ahí (ver prioridad_de_respuesta), así que sin esta entrada el agente deriva al
# vecino a mirar el boletín por su cuenta en vez de buscarlo — el mismo rechazo
# que se está corrigiendo con las fuentes públicas.
SIBOM_HERRAMIENTA = {
    "implementada": True,
    "fuente": (
        "https://sibom.slyt.gba.gob.ar/ — búsqueda de normas del Partido de Bolívar con el "
        "boletín, la fecha de publicación y el texto completo de cada una"
    ),
    "cuando": (
        "Cuando pregunten si una norma está publicada, en qué boletín o en qué fecha salió, o "
        "pidan su texto (tema 'boletín oficial' de datos_que_cambian_seguido). Sólo publica desde "
        "2016: para normas anteriores responde la base de conocimiento."
    ),
}

# Igual que la de SIBOM: el prompt decide "consultar en vivo" según lo que figura
# en estado_de_herramientas (ver prioridad_de_respuesta).
AUTORIDADES_HERRAMIENTA = {
    "implementada": True,
    "fuente": (
        "https://www.bolivar.gob.ar/autoridades/ — intendente, y por área secretarios, directores "
        "y jefes, con su cargo, dirección y teléfonos"
    ),
    "cuando": (
        "Cuando pregunten quién es el intendente, un secretario, un director o un jefe de área, o "
        "pidan el listado de funcionarios (tema 'nombre del intendente, secretarios y directores' "
        "de datos_que_cambian_seguido). No incluye concejales: el Concejo Deliberante tiene su "
        "propio sitio."
    ),
}

# La grilla de residuos es de la misma página del municipio que la farmacia y las
# autoridades: el chat ya prometía en `menu_de_capacidades` responder "cuándo pasa
# el camión de la basura · reciclado y puntos verdes · dónde tirar pilas,
# electrónicos, aceite usado o neumáticos" sin tener de dónde.
RESIDUOS_HERRAMIENTA = {
    "implementada": True,
    "fuente": (
        "https://www.bolivar.gob.ar/bolivarverde/ — días, horarios y zonas de la recolección de "
        "residuos gruesos, domiciliarios y secos, el barrido, los puntos verdes y dónde llevar los "
        "residuos especiales (pilas, RAAEs, aceite vegetal usado, neumáticos), con los teléfonos de "
        "las áreas responsables"
    ),
    "cuando": (
        "Cuando pregunten qué día o a qué hora pasa la recolección, dónde llevar un residuo (pilas, "
        "electrónicos, aceite usado, neumáticos) o qué se recicla (temas de 'recolección de "
        "residuos', 'residuos especiales' y 'puntos verdes' de datos_que_cambian_seguido). Los días, "
        "horarios y puntos de recepción vigentes no están en la base de conocimiento: no los "
        "deduzcas de las normas."
    ),
    "cache_sugerido_minutos": 1440,
}

HERRAMIENTAS_EXTRA = {
    "buscar_norma_publicada": SIBOM_HERRAMIENTA,
    "autoridades_municipales": AUTORIDADES_HERRAMIENTA,
    "recoleccion_de_residuos": RESIDUOS_HERRAMIENTA,
}

# Qué herramienta corresponde a cada tema de `datos_que_cambian_seguido`. El
# prompt pide consultar en vivo "cuando el tema figura en datos_que_cambian_seguido
# Y la herramienta correspondiente está implementada" (prioridad_de_respuesta,
# paso 2) pero no nombra la herramienta: sin este mapa el agente deriva al vecino
# (paso 3) aunque la tool exista — verificado en vivo: ante "¿en qué boletín se
# publicó la ordenanza 2459?" contestaba que el dato lo tenía el Concejo y la
# tool nunca se llamaba (sin consultas ni entradas de caché).
DATOS_QUE_CAMBIAN_EXTRA = {
    "herramienta_por_tema": {
        "boletín oficial": "buscar_norma_publicada",
        "farmacia de turno": "farmacia_de_turno_en_vivo",
        "nombre del intendente, secretarios y directores": "autoridades_municipales",
        "recolección de residuos": "recoleccion_de_residuos",
        "residuos especiales (pilas, electrónicos, aceite usado, neumáticos)": "recoleccion_de_residuos",
        "puntos verdes y separación de residuos secos": "recoleccion_de_residuos",
    },
    "como_consultar_en_vivo": (
        "Para el boletín oficial, la fecha de publicación o el texto de una norma, llamá a la "
        "herramienta que indica 'herramienta_por_tema' ANTES de responder y respondé con el enlace "
        "oficial que devuelva. Aunque el texto de la norma ya esté en la base, el número de boletín "
        "y la fecha de publicación NO están ahí y no se deducen del texto. Sólo publica normas "
        "desde 2016; para las anteriores la respuesta sale de la base de conocimiento."
    ),
    "como_consultar_autoridades": (
        "Cuando pregunten por el intendente, un secretario, un director o un jefe de área, o pidan "
        "el listado de funcionarios, llamá a 'autoridades_municipales' ANTES de responder: los "
        "nombres y los cargos no están en la base y respondé con los que devuelva la herramienta. "
        "No incluye concejales ni bloques del Concejo Deliberante: eso está en el sitio del Concejo."
    ),
    "como_consultar_residuos": (
        "Cuando pregunten qué día o a qué hora pasa la recolección, por dónde llevar un residuo "
        "(pilas, electrónicos, aceite usado, neumáticos) o por qué se recicla, llamá a "
        "'recoleccion_de_residuos' ANTES de responder y respondé con la grilla y el enlace oficial "
        "que devuelva. Los días, horarios y puntos de recepción vigentes NO están en la base de "
        "conocimiento: las ordenanzas y los anexos de presupuesto describen el servicio (unidades, "
        "turnos, zonas) pero no la grilla ni dónde se recibe cada residuo — no los deduzcas del "
        "texto legal ni los supongas por lo que recuerdes. La grilla distingue planta urbana "
        "(paralelas y perpendiculares a Av. San Martín) y barrios: si el vecino pregunta por un "
        "barrio puntual, dale el horario de barrios y el teléfono de Espacios Públicos para "
        "confirmarlo."
    ),
}

# El paso 2 de `prioridad_de_respuesta` pide el tema en
# `datos_que_cambian_seguido.temas` Y la herramienta del mapa implementada: con
# la entrada sólo en el mapa, la tool existe pero el tema no dispara la consulta
# en vivo (mismo cableado que SIBOM y autoridades, ver ADR-018).
#
# Los temas de residuos van separados y con las palabras del vecino: con una
# sola entrada genérica ("recolección de residuos") y el corpus del HCD
# conteniendo anexos de presupuesto que describen el servicio, el agente
# contestaba "dónde llevo el aceite usado y las pilas" sin consultar nada
# (verificado en el chat: cero claves nuevas en la caché y una respuesta
# genérica con "puntos verdes" para el aceite, que en la grilla oficial va a la
# Escuela Nº 501).
TEMAS_EXTRA = (
    "recolección de residuos",
    "residuos especiales (pilas, electrónicos, aceite usado, neumáticos)",
    "puntos verdes y separación de residuos secos",
)

# Documentación del bloque que quedó obsoleta al pasar la consulta a una tool
# del backend (`regex_sugerida` describía cómo extraer el nombre del farmacia
# del encabezado del sitio a mano).
FARMACIA_CLAVES_OBSOLETAS = ("regex_sugerida",)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Bot).where(Bot.tenant_id.in_(PACHOTEAYUDA_TENANT_IDS))
        )
        bots = result.scalars().all()

        if not bots:
            print(f"⚠️  No hay bots para los tenants {PACHOTEAYUDA_TENANT_IDS} — nada que aplicar.")
            return

        actualizados = 0
        for row in bots:
            config = dict(row.config or {})
            cambios = []

            if config.get("public_sources") != PUBLIC_SOURCES:
                config["public_sources"] = dict(PUBLIC_SOURCES)
                cambios.append("public_sources")

            ius_config = config.get("ius_config")
            herramientas = ius_config.get("estado_de_herramientas") if isinstance(ius_config, dict) else None
            if isinstance(herramientas, dict):
                for nombre in ("consultar_sitio_oficial", "farmacia_de_turno_en_vivo"):
                    herramienta = herramientas.get(nombre)
                    if isinstance(herramienta, dict) and herramienta.get("implementada") is not True:
                        herramienta["implementada"] = True
                        cambios.append(f"ius_config.{nombre}.implementada")

                farmacia = herramientas.get("farmacia_de_turno_en_vivo")
                if isinstance(farmacia, dict):
                    if farmacia.get("fuente") != FARMACIA_FUENTE:
                        farmacia["fuente"] = FARMACIA_FUENTE
                        cambios.append("ius_config.farmacia_de_turno_en_vivo.fuente")
                    if farmacia.get("patron_exacto") != FARMACIA_PATRON:
                        farmacia["patron_exacto"] = FARMACIA_PATRON
                        cambios.append("ius_config.farmacia_de_turno_en_vivo.patron_exacto")
                    for clave in FARMACIA_CLAVES_OBSOLETAS:
                        if clave in farmacia:
                            del farmacia[clave]
                            cambios.append(f"ius_config.farmacia_de_turno_en_vivo.{clave} (eliminada)")

                for nombre, entrada in HERRAMIENTAS_EXTRA.items():
                    herramienta = herramientas.get(nombre)
                    if not isinstance(herramienta, dict):
                        herramientas[nombre] = dict(entrada)
                        cambios.append(f"ius_config.estado_de_herramientas.{nombre}")
                        continue
                    for clave, valor in entrada.items():
                        if herramienta.get(clave) != valor:
                            herramienta[clave] = valor
                            cambios.append(f"ius_config.estado_de_herramientas.{nombre}.{clave}")

            datos_cambian = ius_config.get("datos_que_cambian_seguido") if isinstance(ius_config, dict) else None
            if isinstance(datos_cambian, dict):
                for clave, valor in DATOS_QUE_CAMBIAN_EXTRA.items():
                    if datos_cambian.get(clave) != valor:
                        datos_cambian[clave] = valor
                        cambios.append(f"ius_config.datos_que_cambian_seguido.{clave}")

                temas = datos_cambian.get("temas")
                if isinstance(temas, list):
                    for tema in TEMAS_EXTRA:
                        if tema not in temas:
                            temas.append(tema)
                            cambios.append(f"ius_config.datos_que_cambian_seguido.temas['{tema}']")

            if not cambios:
                print(f"   bot {row.bot_id} ({row.name}): sin cambios (ya aplicado)")
                continue

            row.config = config
            # `config` es JSONB y los cambios de este script son, en una
            # re-ejecución sobre un bot ya configurado, SÓLO anidados
            # (ius_config.estado_de_herramientas.*): sin flag_modified
            # SQLAlchemy no incluye la columna en el UPDATE y el cambio se
            # pierde en silencio (verificado en prod 2026-09-10: el commit
            # informa éxito y la clave no queda en la base).
            flag_modified(row, "config")
            await session.commit()
            actualizados += 1
            print(f"✅ bot {row.bot_id} ({row.name}) — tenant {row.tenant_id}: {', '.join(cambios)}")

        if actualizados:
            print(f"✅ {actualizados} bot(s) de pachoteayuda con fuentes públicas en vivo")
        else:
            print("✅ Nada que hacer: los bots de pachoteayuda ya tenían las fuentes públicas habilitadas")


if __name__ == "__main__":
    asyncio.run(main())
