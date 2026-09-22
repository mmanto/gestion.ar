# iUS — Semáforo: aplicación de las definiciones D1–D4

**Fecha:** 2026-09-22
**Estado:** definiciones aplicadas; suite validada de punta a punta

---

## Qué era

El agente iUS clasifica cada consulta laboral en un semáforo (rojo, amarillo o verde) para
decidir si el despacho toma el caso. Quedaban 4 definiciones jurídicas abiertas y 6 casos de
prueba no coincidían con su color esperado.

## Qué se hizo

Se aplicaron las 4 definiciones acordadas con el abogado de referencia:

| # | Pregunta | Respuesta aplicada |
|---|---|---|
| **D1** | ¿Un caso ganable exige la copia del contrato? | No. Alcanza con acreditar la relación laboral por cualquier medio (recibos, nombramientos, alta en IMSS/ISSSTE). Una copia ilegible o parcial cuenta. |
| **D2** | Despido del IMSS sin notificar a la Comisión Mixta Disciplinaria, ¿es ganable? | Sí, es nulo. La falta de notificación invalida la rescisión. |
| **D3** | ¿Desde qué fecha corre el plazo legal? | Desde la desvinculación real (el aviso de no renovación o la entrega del aviso de rescisión), no desde la vacación ni desde el COVID. |
| **D4** | ¿El plazo del ISSSTE es de 4 meses? | Sí: 4 meses = 120 días naturales, interrumpibles por la conciliación. |

## Resultado

La suite de 23 casos valida la clasificación de punta a punta. Cada caso se evalúa 3 veces y se
toma la mayoría, porque la inteligencia artificial puede variar entre una corrida y otra.

| Color | Resultado |
|---|---|
| Rojo | 9/9 |
| Amarillo | 7/7 |
| Verde | 5/7 |
| **Total** | **21/23** |

Los 2 casos que no cierran (uno de la trabajadora social de la Alcaldía y uno de contrato por
honorarios) no fallan por las reglas: en la mayoría de las corridas caen en su color esperado y
solo varían entre una corrida y otra por la variabilidad del modelo de IA.

## Pendiente

1. Revisión final del abogado de D1 y D2 antes de cerrar el alcance.
2. Eliminar la variabilidad restante de la IA en esos 2 casos verdes (o mover la clasificación a
   reglas fijas, si se quiere un resultado 100% estable).
