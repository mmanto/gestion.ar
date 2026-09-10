"""
Tests de RAGService._norm_number_variants (app/rag_service.py).

La función arma las variantes del número de norma que se buscan por metadata
exacta antes del resultado vectorial (ver ADR-016). Regresión que cubre: una
consulta con el número pelado ("ordenanza 2130", "y la 2130?") no generaba
ninguna variante — la metadata guarda "2130/2010" y el embedding no resuelve
identificadores, así que el chat respondía que no tenía la ordenanza.

No requiere ChromaDB poblado ni Docker: son sólo las variantes que se le
pasarían al filtro `numero`.
"""

from app.rag_service import RAGService

variants = RAGService._norm_number_variants


def test_numero_con_anio_usa_las_dos_formas():
    v = variants("¿qué dice la ordenanza 3142/2026?")
    assert "3142/2026" in v
    assert "3142/26" in v


def test_numero_pelado_con_palabra_de_norma():
    v = variants("dame información sobre la ordenanza 2130")
    assert "2130/2010" in v
    assert "2130/10" in v


def test_numero_pelado_sin_palabra_de_norma():
    # "y la 2130?" — el seguimiento típico cuando ya se habló de la norma.
    v = variants("y la 2130?")
    assert "2130/2010" in v
    assert "2130/10" in v


def test_anio_suelto_no_es_numero_de_norma():
    # "presupuesto 2026": 2026 es el año, no el número de una norma.
    assert variants("el presupuesto 2026") == []


def test_codigo_de_area_no_es_numero_de_norma():
    assert variants("llamo al 02314 y no atienden") == []


def test_fecha_no_es_numero_de_norma():
    assert variants("qué pasó el 12/09/2026?") == []


def test_numero_corto_solo_con_palabra_de_norma():
    assert variants("ley 5") != []
    assert variants("artículo 5") == []
