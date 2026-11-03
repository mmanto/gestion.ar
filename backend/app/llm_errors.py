"""
Errores de resolución de LLM (ADR-038: proveedor + key por tenant).

Viven en un módulo propio para que los importe cualquier capa (servicios de
dominio, routers, el runtime del agente) sin arrastrar el servicio de Claude ni
el cliente de Postgres.
"""


class LLMProviderError(RuntimeError):
    """El proveedor rechazó la llamada (key inválida, modelo inexistente,
    crédito agotado, error de red). El mensaje se muestra tal cual en la UI de
    Ajustes, así que nunca debe incluir la key."""


class LLMNotConfiguredError(RuntimeError):
    """El tenant no tiene proveedor de IA configurado: el agente no responde.

    No hay fallback a las keys de plataforma (`ANTHROPIC_API_KEY` /
    `DEEPSEEK_API_KEY`): esas quedan sólo para paths sin tenant.
    """
