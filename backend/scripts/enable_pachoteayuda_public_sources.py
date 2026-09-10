#!/usr/bin/env python3
"""
Habilita las fuentes públicas en vivo en el chat de pachoteayuda (pachoteayuda.ar,
el chat embebido en la landing de César Pacho):

  1. Agrega `config.public_sources` al bot — es la bandera que hace que el chat
     web le ofrezca al LLM las tools del Boletín Oficial Municipal (SIBOM) y de
     la farmacia de turno del sitio del municipio (ver BotConfig /
     PublicSourcesConfig y app/services/public_sources_service.py).
  2. Marca las herramientas del bloque `ius_config.estado_de_herramientas` como
     implementadas y agrega la búsqueda de normas publicadas
     (`buscar_norma_publicada`, que no existía). Sin esto la tool funciona
     igual, pero el prompt le prohíbe al agente usarlas o mencionarlas
     (`regla_si_no_implementada`) y, para los temas de
     `datos_que_cambian_seguido`, sólo consulta en vivo las herramientas
     listadas ahí: el vecino seguiría recibiendo el rechazo. Además reemplaza
     la documentación obsoleta del bloque (describía cómo extraer el dato del
     HTML a mano, cuando ahora lo devuelve la tool).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/enable_pachoteayuda_public_sources.py

Idempotente: re-ejecutarlo es seguro (ya aplicado → no cambia nada).
"""

import asyncio

from sqlalchemy import select

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

                sibom = herramientas.get("buscar_norma_publicada")
                if not isinstance(sibom, dict):
                    herramientas["buscar_norma_publicada"] = dict(SIBOM_HERRAMIENTA)
                    cambios.append("ius_config.estado_de_herramientas.buscar_norma_publicada")
                else:
                    for clave, valor in SIBOM_HERRAMIENTA.items():
                        if sibom.get(clave) != valor:
                            sibom[clave] = valor
                            cambios.append(
                                f"ius_config.estado_de_herramientas.buscar_norma_publicada.{clave}"
                            )

            if not cambios:
                print(f"   bot {row.bot_id} ({row.name}): sin cambios (ya aplicado)")
                continue

            row.config = config
            await session.commit()
            actualizados += 1
            print(f"✅ bot {row.bot_id} ({row.name}) — tenant {row.tenant_id}: {', '.join(cambios)}")

        if actualizados:
            print(f"✅ {actualizados} bot(s) de pachoteayuda con fuentes públicas en vivo")
        else:
            print("✅ Nada que hacer: los bots de pachoteayuda ya tenían las fuentes públicas habilitadas")


if __name__ == "__main__":
    asyncio.run(main())
