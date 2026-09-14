# iUS — Semáforo: consulta al abogado de referencia

**Fecha:** 2026-09-14

**Qué es esto:** las definiciones jurídicas que quedaron abiertas al cerrar la suite de
calificación por semáforo de iUS. No son fallas técnicas: los 6 casos que no coinciden son
desacuerdos de definición de las reglas.

**Origen de la evidencia:** corrida de `scripts/test_ius_casos_semaforo.py` sobre los 15 casos de
`docs/qa/ius_casos_semaforo.txt` (5 rojo / 5 amarillo / 5 verde), con el prompt de producción
(27 reglas, canónico en `docs/ius_legal_config.json`). Resultado **9/15**: rojo 5/5, amarillo 3/5,
verde 1/5. Informe completo: `docs/IUS_SEMAFORO_INFORME_2026-09-11.md` §6.

**Cómo usar este documento:** responder las tres definiciones **D1–D3** y la línea
`Definición:` de cada caso. Con esa respuesta se ajusta el prompt de calificación
(`docs/ius_legal_config.json`), o el texto del caso de prueba (únicamente si la definición
confirma la regla vigente y el caso está incompleto).

**Cómo leer cada caso:** *Texto del caso* es el texto exacto que la suite le envía al bot (los
párrafos se envían en un solo mensaje). *Palabras que hacen fallar* son los fragmentos que
llevaron al bot al color equivocado, o a no calificar. *Modificación propuesta* es la redacción
que haría pasar el caso con las reglas vigentes.

**Versión interactiva:** `docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.html` — los nueve
`Definición:` de este documento son campos de respuesta (tema claro, guardado local,
descarga de las respuestas en `.md`). Se regenera desde este archivo con
`python3 scripts/build_ius_consulta_abogado.py`.

---

## Resumen

| # | Sección | Caso | Esperado | Bot | Causa medida | Definición |
|---|---|---|---|---|---|---|
| 7 | AMARILLO 2 | Samsung: rescisión por 4 faltas | amarillo | *sin calificación* | el bot pide la fecha exacta de la rescisión antes de calificar | D3c |
| 9 | AMARILLO 4 | José: despido tras reducción por COVID | amarillo | rojo | lee el cierre por COVID como fecha de terminación (≥ 2 meses) | D3b |
| 11 | VERDE 1 | PGR → PROVICTIMA | verde | amarillo | la regla verde exige copia del contrato | D1 |
| 13 | VERDE 3 | Comex: renuncia por liquidación incumplida | verde | amarillo | "copia algo ilegible del contrato" = documentación incompleta | D1 |
| 14 | VERDE 4 | Médico IMSS: rescisión por abandono | verde | amarillo | precedencia de la regla de rescisión causal cuestionable | D2 |
| 15 | VERDE 5 | Trabajadora social: no renovación | verde | amarillo | no menciona contrato ni nombramientos | D1 + D3a |

---

## D1 — ¿Qué documentación exige un caso GANABLE (verde)?

Hoy la regla verde (`verde_cinco_condiciones`) exige cinco condiciones simultáneas: desvinculación
de hasta 7 días, **copia del contrato de trabajo**, sin funciones de confianza, recibos de
nómina/talones de pago/estados de cuenta, y comprobantes de pago de utilidades, prima vacacional,
aguinaldo u otras prestaciones. Tres casos del archivo acreditan la relación laboral por otros
medios (Formatos Únicos de Personal, Nombramientos, recibos, oficios, alta ante IMSS/ISSSTE) y
caen a amarillo únicamente por la segunda condición.

- **a)** ¿La copia del contrato es requisito para el verde, o basta con acreditar la relación
  laboral por cualquier medio (nombramientos, recibos de nómina, oficios, alta ante IMSS/ISSSTE)?
- **b)** Si es requisito: ¿una copia ilegible o parcial del contrato cuenta como copia?
- **c)** Los comprobantes de prestaciones, ¿deben ser documentos aparte o basta que las
  prestaciones aparezcan desglosadas en los recibos de nómina?

**Definición:**

---

## D2 — Rescisión por causal cuestionable: ¿amarillo o verde?

Caso 14: al médico del IMSS le entregan un "Aviso de Rescisión" por supuesto abandono de trabajo,
sin notificar a la Comisión Mixta Disciplinaria, y con fotografías que acreditan que estuvo en la
fuente de trabajo. Hoy la regla más específica lo manda a amarillo
(`imss_rescision_causal_cuestionable`). El archivo lo marca GANABLE (verde).

- **a)** ¿Un despido con rescisión causal cuestionable y sin aviso a la Comisión Mixta
  Disciplinaria es verde (nulo) o amarillo (revisable)?
- **b)** ¿Cambia el color si el trabajador es sindicalizado de base, con Contrato Colectivo?

**Definición:**

---

## D3 — ¿Desde qué fecha corre la ventana de tiempo del semáforo?

- **a)** Caso 15: el aviso de no renovación es de hace cuatro días, el último día laborable es a fin
  de mes y el periodo vacacional autorizado corre hasta esa fecha. ¿La ventana corre desde el
  aviso, desde el último día trabajado, o desde que se agota la vacación autorizada?
- **b)** Caso 9: la historia tiene dos fechas — la pandemia (baja ante el IMSS y reducción
  salarial) y el rompimiento real (hace 5 semanas, cuando le retiran gafete y herramientas).
  ¿Cuál es la fecha de desvinculación que debe usarse?
- **c)** Caso 7: si la persona dice "hoy me entregaron el Aviso de Rescisión", ¿la desvinculación
  es de ese día (0 días) y por lo tanto ventana "pocos días"?

**Definición:**

---

## Caso 7 — AMARILLO 2 · Samsung: rescisión por 4 faltas

- **Esperado / bot:** amarillo / *sin calificación* (el bot pidió la fecha exacta de la rescisión
  antes de calificar).
- **Regla que corresponde:** `imss_rescision_causal_cuestionable` (amarillo): aviso de rescisión
  por causal debatible o desproporcionada — faltas aisladas, no consecutivas ni reiterativas.
- **Pregunta:** ¿alcanza con que el aviso de rescisión sea de hoy para tener la desvinculación
  dentro de la ventana, sin otra fecha?

**Texto del caso (exacto, como lo envía la suite):**

> 2 Trabajo para Samsung de México, tengo 5 años de antigüedad, cuento con recibos de nómina y constancias
> laborales, de reconocimiento a productividad y empleado del mes. Desde el inicio firmé contrato de trabajo (soy
> de planta, no eventual) mi puesto era auxiliar contable. Hace una semana tuve que faltar 4 dias por temas
> personales, al reintegrarme le traté de explicar a mi Jefe que tuve una situación en casa y ese era el motivo de
> mis faltas, que podría trabajar tiempo extra sin goce de sueldo para compensar esos días, pero mi jefe inmediato
> en ese momento me entregó un citatorio porque se me levantaría una acta, después de 3 dias me levantaron esa
> "Acta Administrativa" y hoy me ha sido entregado un documento que dice "Aviso de Rescisión sin responsabilidad
> para el patrón" en donde dicen que como falta 4 dias en un periodo de 30 dias, me rescindían ¿puedo demandar un
> despido injustificado?

**Palabras que hacen fallar el test:**

- `"Hace una semana tuve que faltar 4 dias"` — única fecha de la historia, y se refiere a las
  faltas, no a la terminación: el modelo no encuentra el dato de tiempo de desvinculación.
- `"hoy me ha sido entregado un documento"` — el "hoy" queda pegado a la entrega del documento,
  no se lee como fecha de desvinculación.
- `"después de 3 dias me levantaron esa "Acta Administrativa""` — tercer anclaje temporal; refuerza
  la ambigüedad en lugar de resolverla.

**Modificación propuesta (para que el caso pase):** agregar al final del caso:

> El Aviso de Rescisión me lo entregaron el día de hoy: mi desvinculación es de hoy (hace menos de
> un día). Las 4 faltas fueron días aislados, no consecutivos, y avisé el motivo el día que me
> reintegré.

**Definición (D3c):**

---

## Caso 9 — AMARILLO 4 · José: despido tras reducción por COVID

- **Esperado / bot:** amarillo / rojo.
- **Regla que se disparó:** rojo por plazo (`imss_mas_dos_meses`: desvinculación de 61+ días).
  Corresponde amarillo por `imss_uno_dos_meses` (22–60 días) — el rompimiento real es de hace
  5 semanas (35 días).
- **Pregunta:** ¿la desvinculación es la del COVID (baja ante el IMSS) o la del rompimiento de
  hace 5 semanas (retiro de gafete y herramientas)?

**Texto del caso (exacto, como lo envía la suite):**

> 4 Me llamo José, desde los 16 años tuve que buscar trabajo para ayudarle a mi mamá, un vecino que tiene una
> empresa que se dedica al transporte me ofreció trabajar para él en el área de diseño, al principio me pagaba en
> efectivo cada semana y no me pudo registrar ante el IMSS porque era menor de edad y podrían "multarlo" mi
> horario era de 3 a 10 p.m de lunes a sábado. Cuando le decía que necesitaba ir al IMSS por alguna cortadura o
> golpe que me hacía en el trabajo él me mandaba con su médico particular, me decía que él lo que quería era
> ayudar pero que no podía darme IMSS. Cuando cumplí 20 años me ascendieron a Encargado del Área de Diseño, me
> aumentaron mi salario, me dieron de alta en el IMSS pero se me seguía pagando en efectivo. Con motivo del cierre
> de todo por el COVID-19 me mandó un msj via WhatsApp diciéndome que para que la empresa siguiera, debía bajarme
> el salario a la mitad y además darme de baja ante el INSS pero que tenía que firmar un documento. Hace 2 años le
> pedí de manera verbal que me regresara a mi salario completo, pero él se molestó mucho, me gritó enfrente de
> todos mis compañeros de trabajo que era un "malagradecido" y que le entregara las herramientas que me habia dado
> para trabajar y el gafete de la empresa, ante los insultos y amenazas de que pudiera hablarle a una patrulla le
> entregué lo que me pidió, esto ocurrió hace 5 semanas. ¿Puedo demandar? No me pagó mi salario semanal que
> trabajé, tampoco mi prima vacacional y mi caja de ahorro. Solo cuento con algunas transferencias bancarias (como
> 10) que me hacía desde la cuenta de la empresa por concepto de "viáticos" ya que salía a diferentes estados de
> la República Mexicana y una vez me hizo una transferencia bajo el concepto de "aguinaldo", no tengo talones de
> pago y menos recibos de pago, pero si tengo gafetes que me dio desde que entré a trabajar, son como 5, menos el
> último que me quitó hace 5 semanas cuando le entregué todo.

**Palabras que hacen fallar el test:**

- `"darme de baja ante el INSS"` con `"Con motivo del cierre de todo por el COVID-19"` — el modelo
  toma ese episodio (baja ante el INSS + reducción salarial) como fecha de terminación de la
  relación.
- `"Hace 2 años le pedí de manera verbal que me regresara a mi salario completo"` — refuerza la
  lectura de "más de dos meses".
- `"esto ocurrió hace 5 semanas"` — la única fecha del rompimiento real, pero cierra una frase con
  tres hechos (grito, entrega de herramientas, amenaza) y el modelo no la usa como fecha de
  desvinculación.

**Modificación propuesta (para que el caso pase):** agregar, después del párrafo del COVID:

> Aclaro las fechas: durante el COVID me bajaron el salario y me dieron de baja del IMSS, pero la
> relación laboral continuó, en el mismo puesto y con el mismo horario, hasta hace 5 semanas
> (hace 35 días). Lo de hace 2 años fue solo mi reclamo del salario completo. Mi último día de
> trabajo fue hace 5 semanas, cuando me quitó el gafete y las herramientas y me sacó de la
> empresa.

**Definición (D3b):**

---

## Caso 11 — VERDE 1 · PGR → PROVICTIMA

- **Esperado / bot:** verde / amarillo.
- **Regla que se disparó:** la condición `copia_contrato: si` de `verde_cinco_condiciones` no se
  cumple; la historia respalda la relación laboral con otros documentos.
- **Pregunta:** ¿alcanza con los Formatos Únicos de Personal, los recibos de nómina de todos los
  años y el alta ante el ISSSTE, o el verde exige copia del contrato?

**Texto del caso (exacto, como lo envía la suite):**

> 1 Ingresé a laborar para la Procuraduría General de la República (ahora denominada Fiscalía General de la
> República) el 01 de febrero del 2000 en el puesto de Jefe de Departamento, nivel O11, adscrita al Centro de
> Atención a Víctimas en Oaxaca. El 6 de septiembre del 2011 se creó mediante Decreto un Organismo Descentralizado
> llamado PROVICTIMA, por lo que el 07 de ese mismo mes y año el área de RH de PGR me notificó un oficio de
> “cambio de adscripción”, en donde señala que derivado de la creación del organismo descentralizado yo estaría
> adscrita al mismo, sin que se perdieran mis derechos laborales. La nueva área de RH de PROVICTIMA me hizo firmar
> un nuevo Formato Único de Personal, bajo el argumento que ahora mi patrón ya no era PGR sino ellos, por lo que
> firmé dicho documento. Hace tres días, un lunes, mi Director de Área me mandó a llamar a su oficina y me dijo
> que tenía muchas quejas hacia mi persona por parte de usuarios que yo atendía, y que por ese motivo me pedía que
> firmara mi renuncia con efectos a fin de mes, a cambio, me pagarían la quincena completa (de la segunda mitad
> del mes) y además, la cantidad de $50,000 pesos, pero que debía primero firmarle el escrito de renuncia.
> Obviamente no firmé nada, entonces mi jefe inmediato mandó a llamar a elementos de la policía estatal para que
> me sacaran de la fuente de trabajo. Es preciso señalar que grabé (en audio) todo lo sucedido. Cuento con recibos
> de nómina de todos los años en PGR y PROVICTIMA, oficios de comisión, el audio donde me están corriendo, alta
> ante el ISSSTE, foto de mi registro de entrada en las listas de asistencia de esa semana, correos en versión
> .pdf en los que mi jefe me solicitaba trabajar los fines de semana y también oficios en donde nos pedían hacer
> “guardias” en días festivos y/o fuera del horario de labores y todos los Formatos únicos de Personal que me
> entregaron ambas dependencias de gobierno.

**Palabras que hacen fallar el test:**

- Cierre de la historia: `"todos los Formatos únicos de Personal"` — el respaldo enumerado no
  incluye **copia del contrato de trabajo**.
- `"en el puesto de Jefe de Departamento, nivel O11"` — puesto de jefatura: riesgo de que se lea
  como función de mando, y el verde exige "no realizaba funciones ni actividades de confianza".

**Modificación propuesta (si D1a confirma que la copia del contrato es requisito):** agregar al
cierre del caso:

> Cuento además con copia de mi Contrato Individual de Trabajo, y con comprobantes de pago de
> aguinaldo y prima vacacional. No ejercía funciones de confianza: mis funciones eran operativas y
> de atención a usuarios, sin dirección de personal, mando ni manejo de recursos.

*Si D1a responde que basta acreditar la relación laboral por otros medios, la corrección es en el
prompt (regla verde) y este caso de prueba queda como está.*

**Definición (D1a):**

---

## Caso 13 — VERDE 3 · Comex: renuncia por liquidación incumplida

- **Esperado / bot:** verde / amarillo.
- **Regla que corresponde:** `renuncia_con_promesa_liquidacion_incumplida` (verde) exige
  documentación completa; el amarillo entra por documentación incompleta.
- **Pregunta:** ¿una copia ilegible del contrato cuenta como copia para el verde?

**Texto del caso (exacto, como lo envía la suite):**

> 3 Soy una persona de la Tercera Edad, actualmente tengo 59 años y trabajo para Comex en el puesto de Vendedor en
> una sucursal que está dentro de un centro comercial al Sur de la Ciudad de México desde hace 15 años. Hace 2
> semanas el Gerente de la Sucursal me comentó que había recorte de personal y lamentablemente yo estaba en la
> lista, pero que él buscaría que me liquidaran conforme a la Ley, pero que tenía que firmar mi renuncia con
> efectos al último día de este mes cosa que hice, a cambio, mi jefe me autorizó gozar de mi periodo vacacional,
> mismo que termina a fin de mes ¿sino me pagan lo que me prometió mi jefe (liquidación), puedo demandar aún
> teniendo esa renuncia firmada? Cuento con todos y cada uno de los talones de pago y recibos de nómina (ahora
> denominados CFDI) de los 15 años laborados para COMEX que no solo señalan mi salario, sino el pago de las
> prestaciones a que tenía derecho como utilidades, prima vacacional, aguinaldo, copia algo ilegible de mi
> Contrato Individual de Trabajo y hoja rosa (alta ante el IMSS).

**Palabras que hacen fallar el test:**

- `"copia algo ilegible de mi Contrato Individual de Trabajo"` — "ilegible" se lee como
  documentación incompleta y desarma la condición de documentación completa de la regla verde.
- `"¿sino me pagan lo que me prometió mi jefe (liquidación), puedo demandar...?"` — la pregunta es
  hipotética: el caso no afirma que la liquidación prometida no se haya pagado, y la regla verde
  exige promesa incumplida.
- *No es causa de fallo:* `"Hace 2 semanas"` (14 días) cae en la ventana `una_a_tres_semanas`, que
  la regla verde acepta.

**Modificación propuesta (para que el caso pase):**

> Cuento con ... copia **legible y completa** de mi Contrato Individual de Trabajo y hoja rosa
> (alta ante el IMSS). ... El Gerente prometió liquidarme conforme a la Ley y
> **no me ha pagado nada** de esa liquidación.

**Definición (D1b):**

---

## Caso 14 — VERDE 4 · Médico IMSS: rescisión por abandono

- **Esperado / bot:** verde / amarillo.
- **Regla que se disparó:** `imss_rescision_causal_cuestionable` (amarillo), que aplica con
  `tiempo_desvinculacion: cualquiera` y tiene precedencia sobre la ventana de tiempo del verde.
- **Pregunta:** ¿un despido con rescisión causal cuestionable, sin aviso a la Comisión Mixta
  Disciplinaria, es verde o amarillo?

**Texto del caso (exacto, como lo envía la suite):**

> 4. Soy Médico y trabajaba para la Clínica 29 del IMSS, ingresé a través de la bolsa de trabajo del Sindicato
> Nacional de Trabajadores del Seguro Social con sede en CDMX en el año de 1998 y mi última categoría es MED TER
> INT 080, es decir, médico de ambulancia de terapia intensiva Nivel 080, era personal sindicalizado desde mi
> ingreso y en cada talón de pago se me descontaba la “cuota sindical”. Mi jornada de trabajo es lunes, miércoles
> y viernes de 8 pm. a 8 a.m del día siguiente (jornada nocturna). Como mi insumo principal de trabajo era estar
> arriba de una ambulancia y la Clínica no cuenta con una desde hace 6 años, el Director de la Clínica me pidió de
> manera verbal que estuviera en el área de terapia intensiva, pero como eso no está dentro del profesiograma del
> CCT IMSS-SNTSS le dije que no lo haría sino a través de mi representación sindical. He tenido varios “roces” y
> quejas en contra y de parte del Director, ya que me quiere fuera del IMSS pero todo esto lo he documentado ante
> mi delegado sindical. Hace seis semanas me notificaron un citatorio porque supuestamente abandoné mi trabajo en
> la madrugada, acudí al citatorio (con menos de 36 horas de anticipación) y alegué que estuve en la fuente de
> trabajo, exhibí fotografías de mí en el área de comida, en el área de terapia intensiva y en la zona de
> “biométricos) de la clínica, aún así me levantaron el acta, en la cual participó mi delegada sindical (es una
> enfermera). Hace unos días, de noche, una persona sin identificarse quiso notificarme un documento, pero sin
> entregarme copia del mismo, razón por la que no lo recibí y de inmediato acudí con mi representación sindical.
> Ellos me dijeron que era mi rescisión de contrato, pero al ser beneficiario del CCT del IMSS-SNTSS y por mi
> antigüedad, no me despedirían. Hace tres noches me volvieron a notificar un citatorio (que se desahogó anteayer)
> porque otra vez “supuestamente” abandoné la fuente de trabajo la madrugada anterior, hecho que no es cierto, y
> hoy se me entregó un documento que señala que, al haber incurrido en una causal de rescisión (abandono de
> trabajo) ese era mi último día laborable. En ambos procedimientos, el IMSS no notificó a la Comisión Mixta
> Disciplinaria de esta medida que me fue aplicada. Pregunta ¿puedo demandar despido injustificado aunque haya
> recibido el documento “Aviso de Rescisión”? Cuento con casi todos mis recibos de nómina (CFDI) en los que se
> señalan la prestaciones que por CCT IMSS-SNTSS gozaba, copia de mi Nombramiento, copia de reconocimientos por
> alta productividad (trayectos en ambulancia) durante 5 años contínuos y Alta ante el IMSS.

**Palabras que hacen fallar el test:**

- `"hoy se me entregó un documento"` — la fecha es la correcta (0–7 días), pero el documento es el
  Aviso de Rescisión: dispara la regla amarilla de rescisión causal cuestionable, que no filtra por
  tiempo.
- `"copia de mi Nombramiento"` — la lista de documentos no incluye copia del contrato.
- `"Hace seis semanas me notificaron un citatorio"` — anclaje temporal de 6 semanas que puede
  arrastrar la lectura fuera de la ventana "pocos días".
- **Riesgo no confirmado:** el hecho que sostiene la nulidad —
  `"el IMSS no notificó a la Comisión Mixta Disciplinaria"` — no lo recoge ninguna regla verde.

**Modificación — dos caminos, según D2:**

1. **Si el abogado responde "amarillo" (regla vigente correcta):** el caso de prueba debe
   re-etiquetarse a AMARILLO en `docs/qa/ius_casos_semaforo.txt`; no se toca el texto.
2. **Si responde "verde" (nulo):** el ajuste es en el prompt — regla verde de nulidad por falta de
   aviso a la Comisión Mixta Disciplinaria, con precedencia sobre
   `imss_rescision_causal_cuestionable` — y además el caso debe completar sus condiciones:

> Cuento con copia de mi Contrato Individual de Trabajo y del Contrato Colectivo de Trabajo, con
> casi todos mis recibos de nómina (CFDI), con comprobantes de aguinaldo y prima vacacional, y con
> Alta ante el IMSS. No tengo funciones de confianza: soy personal sindicalizado de base, sin
> personal a mi mando.

*Solo cambiando el texto, con las reglas vigentes, este caso no llega a verde.*

**Definición (D2a/D2b):**

---

## Caso 15 — VERDE 5 · Trabajadora social: no renovación

- **Esperado / bot:** verde / amarillo.
- **Regla que se disparó:** `contrato_sin_documentacion` (amarillo).
- **Preguntas:** ¿qué documentos hacen falta (D1)? ¿la ventana corre desde el aviso de no
  renovación o desde que se agota la vacación autorizada (D3a)?

**Texto del caso (exacto, como lo envía la suite):**

> 5. Soy Trabajadora Social y fui contratada por el Área de Personal de la Alcaldía Álvaro Obregón en la CDMX el
> 01 de enero de 2020, desde el inicio se me señaló que era personal catalogada de “confianza”, sin embargo mis
> actividades eran hacer estudios socioeconómicos a usuarios que acudían a la Alcaldía a solicitar apoyos
> sociales. Los primeros 3 años se me daba a firma dos veces al año un Nombramiento, que señalaba que mi
> contratación era “Eventual”, desde el año 2023 debía firmar este documento cada 3 meses y actualmente es cada
> primero de mes, mi pago es a mes vencido y se me deposita mi quincena vía nómina por transferencia bancaria.
> Hace cuatro días el particular del Alcalde me comentó que no se me renovaría mi contrato, siendo mi último día
> el último día de este mes, pero que con la finalidad de “ayudarme” me autorizaba gozar de mi primer periodo
> vacacional del año, que consiste en 10 días hábiles, razón por la que hice mi formato, lo firmé y se lo entregué
> a esta persona, quien el mismo día 16 de junio al término de mi jornada laboral, me entregó mi acuse. Quiero
> demandar por despido injustificado, pero en este momento sigo gozando de mi periodo vacacional ¿cómo tengo que
> proceder?, ¿debo presentarme a laborar el mes que viene o ya puedo considerar que me despidieron desde ahorita?.
> Cuento con recibos de nómina del año 2020, 2023, 2025 y lo que va del año 2026, también oficios de autorización
> de vacaciones, correos electrónicos donde mis jefes me daban instrucciones dentro y fuera de la jornada laboral.

**Palabras que hacen fallar el test:**

- `"Cuento con recibos de nómina del año 2020, 2023, 2025"`, más oficios de autorización de
  vacaciones y correos electrónicos: **falta el contrato y los nombramientos firmados**.
- `"era personal catalogada de “confianza”"` — etiqueta que roza la regla roja
  `personal_confianza_sector_publico` (ya ajustada para mirar funciones reales, no la etiqueta:
  conviene dejar asentado que sus funciones eran operativas).
- `"siendo mi último día el último día de este mes"` + `"sigo gozando de mi periodo vacacional"` —
  no hay desvinculación consumada: la ventana "pocos días" del verde no puede cumplirse.
- `"quien el mismo día 16 de junio al término de mi jornada laboral, me entregó mi acuse"` —
  **fecha absoluta sin normalizar en el fixture** (hoy es 2026-09-14): puede leerse como una
  desvinculación de hace 3 meses.

**Modificación propuesta (para que el caso pase):**

> Cuento con copia de mi Contrato Individual de Trabajo y de todos los Nombramientos que firmé
> desde 2020, con recibos de nómina de 2020 a 2026, con oficios de autorización de vacaciones, con
> correos electrónicos donde mis jefes me daban instrucciones dentro y fuera de la jornada, y con
> comprobantes de pago de aguinaldo, prima vacacional y demás prestaciones. Mis actividades siempre
> fueron operativas: estudios socioeconómicos y atención al público, sin dirección de personal ni
> manejo de recursos.
>
> Hace cuatro días me comunicaron la no renovación y ese mismo día me retiraron de la fuente de
> trabajo: mi último día laborable fue hace cuatro días. La vacación autorizada (10 días hábiles)
> corre por separado.

*El segundo párrafo agrega un hecho (el retiro de la fuente de trabajo el mismo día del aviso). Si
el caso real no lo tuvo, la vía no es cambiar el caso sino la definición D3a: contar la ventana
desde el aviso de no renovación.*

**Definición (D1 + D3a):**

---

## Qué se hace con cada respuesta

| Definición | Si responde | Acción |
|---|---|---|
| D1 | La copia del contrato es requisito | Ajustar los casos 11, 13 y 15 (`docs/qa/ius_casos_semaforo.txt`) |
| D1 | Basta otro medio de prueba | Ajustar la regla verde en `docs/ius_legal_config.json` |
| D2 | Amarillo (revisable) | Re-etiquetar el caso 14 a AMARILLO en el fixture |
| D2 | Verde (nulo) | Regla verde de nulidad por falta de aviso a la Comisión Mixta Disciplinaria |
| D3 | Depende del caso | Corregir las fechas de los casos 7, 9 y 15 en el fixture |

Con las definiciones aplicadas, la expectativa de la suite es 15/15 (hoy: 9/15).
