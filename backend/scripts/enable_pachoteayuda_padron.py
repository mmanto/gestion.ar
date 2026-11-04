#!/usr/bin/env python3
"""
Habilita el módulo `padron` en el chat de pachoteayuda (pachoteayuda.ar).

El módulo (ver `app/modules/padron_ext.py` y `app.modules.manifest`) aporta la
tool `consultar_padron` y el interceptor que resuelve el verificador con el
usuario. Está `scope="entitled"`: el deploy no lo enciende solo, hay que
otorgarlo y habilitarlo por bot.

Este script:

  1. Se asegura de que el catálogo `modules` tenga la fila (`padron`), por si
     la migración todavía no corrió.
  2. Otorga (`granted`) y habilita (`enabled`) el módulo para los bots de
     pachoteayuda.
  3. Si el bot tiene `ius_config.estado_de_herramientas`, agrega la tool como
     implementada — sin eso el prompt puede seguir prohibiéndole al agente
     mencionarla (`regla_si_no_implementada`).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/enable_pachoteayuda_padron.py

En dev el tenant de pachoteayuda tiene otro id: los ids se pueden pasar como
argumentos (`... enable_pachoteayuda_padron.py tenant_7099f777c4d8`).

Idempotente: re-ejecutarlo es seguro (ya aplicado → no cambia nada).
"""

import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.db.database import AsyncSessionLocal
from app.db.models import Bot
from app.db.models import BotModule as BotModuleModel
from app.db.models import Module as ModuleModel
from app.services.padron_service import DISTRITO_BUENOS_AIRES

# pachoteayuda.ar — único tenant de Pacho en prod (id verificado 2026-08-16).
PACHOTEAYUDA_TENANT_IDS = [
    "tenant_2fc38a44e696",
]

MODULE_KEY = "padron"
MODULE_NAME = "Padrón electoral"
MODULE_DESCRIPTION = "Consulta del padrón nacional con verificador resuelto por el usuario"

HERRAMIENTAS_PADRON = {
    "solicitar_datos_padron": {
        "implementada": True,
        "descripcion": (
            "Inicia la consulta del padrón electoral y pide en el chat el DNI y el sexo "
            "registrado que falten. Es el primer paso de cualquier consulta del padrón."
        ),
    },
    "consultar_padron": {
        "implementada": True,
        "descripcion": (
            "Consulta el padrón electoral nacional por DNI: establecimiento, dirección, mesa y orden. "
            "El usuario resuelve el verificador (captcha) en el chat. Distrito por defecto: "
            f"{DISTRITO_BUENOS_AIRES} (Buenos Aires)."
        ),
    },
}


async def main() -> None:
    async with AsyncSessionLocal() as session:
        catalogo = await session.get(ModuleModel, MODULE_KEY)
        if catalogo is None:
            session.add(
                ModuleModel(
                    module_key=MODULE_KEY,
                    name=MODULE_NAME,
                    description=MODULE_DESCRIPTION,
                )
            )
            print(f"✅ catálogo: módulo '{MODULE_KEY}' agregado")
        else:
            print(f"ℹ️  catálogo: módulo '{MODULE_KEY}' ya existe")

        tenant_ids = sys.argv[1:] or PACHOTEAYUDA_TENANT_IDS
        result = await session.execute(
            select(Bot).where(Bot.tenant_id.in_(tenant_ids))
        )
        bots = result.scalars().all()

        if not bots:
            print(f"⚠️  No hay bots para los tenants {tenant_ids} — nada que habilitar.")
            await session.commit()
            return

        for row in bots:
            cambios = []

            permiso = await session.get(BotModuleModel, (row.bot_id, MODULE_KEY))
            if permiso is None:
                session.add(
                    BotModuleModel(
                        bot_id=row.bot_id,
                        module_key=MODULE_KEY,
                        granted=True,
                        enabled=True,
                        granted_at=datetime.now(timezone.utc),
                    )
                )
                cambios.append("módulo otorgado y habilitado")
            else:
                if not permiso.granted:
                    permiso.granted = True
                    cambios.append("granted")
                if not permiso.enabled:
                    permiso.enabled = True
                    cambios.append("enabled")

            cambios_config = False
            config = row.config if isinstance(row.config, dict) else {}
            ius_config = config.get("ius_config")
            herramientas = ius_config.get("estado_de_herramientas") if isinstance(ius_config, dict) else None
            if isinstance(herramientas, dict):
                for nombre, entrada in HERRAMIENTAS_PADRON.items():
                    actual = herramientas.get(nombre)
                    if not isinstance(actual, dict) or any(
                        actual.get(clave) != valor for clave, valor in entrada.items()
                    ):
                        herramientas[nombre] = dict(entrada)
                        cambios.append(f"ius_config.estado_de_herramientas.{nombre}")
                        cambios_config = True

            if cambios_config:
                row.config = config
                # JSONB: sin flag_modified la mutación anidada no entra en el
                # UPDATE y el commit informa éxito igual (mismo bug documentado
                # en enable_pachoteayuda_public_sources.py).
                flag_modified(row, "config")

            if cambios:
                await session.commit()
                print(f"✅ bot {row.bot_id} ({row.name}): {', '.join(cambios)}")
            else:
                print(f"   bot {row.bot_id} ({row.name}): sin cambios (ya habilitado)")

        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
