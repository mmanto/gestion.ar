# UrbanVoice backoffice — Entrega 2: Partners

Fecha: 2026-11-17
Estado: implementado

## Intento

Sumar al backoffice del tema UrbanVoice el item **Partners** de la demo
(`/home/mmanto/tmp/urbanvoice/administracion/`), sobre el mismo shell y store
de demo de la entrega 1 (`docs/superpowers/specs/2026-11-14-urbanvoice-backoffice-clientes-design.md`).

La demo es la referencia de qué se ve y qué se puede hacer. Los datos siguen
siendo de ejemplo en `localStorage` (`uv-admin-db`): la integración con la API
real del producto es una etapa posterior.

## Alcance

- **Listado** `/partners`: KPIs (partners activos, abonos de cartera por mes,
  comisiones por liquidar, demos sin partner), tabla de partners (clientes,
  abonos, comisión, mes anterior con estado de liquidación, por liquidar) y
  barras de lo cobrado en el mes por partner.
- **Ficha** `/partners/:partnerId`: cabecera con responsable, ciudad y
  comisión; suspender/reactivar; KPIs (clientes activos, MRR, comisión del mes
  anterior, por liquidar/ya pagado); pestañas Cartera, Comisiones, Solicitudes
  y Equipo y datos.
- **Acciones**: alta y edición de partner, liquidar la comisión de un mes
  cerrado (con medio y referencia), ver el detalle por cliente de ese mes,
  suspender/reactivar y pasar un cliente de un partner a otro desde la ficha
  del cliente.
- **Integración con Clientes**: el menú suma Partners, el listado de Clientes
  suma el botón Partners y el Resumen del cliente suma «Cambiar partner».
- **Datos de demo**: se agregan `liq` (liquidaciones) y `leads` (pedidos de
  demo) al store, con sus seeds. `ensureDemoDb` completa una base guardada sin
  perder cambios ni resembrar.

## Fuera de alcance

- Panel del partner (`panel-partner/` de la demo): en el producto no existe.
  Por eso la ficha no muestra «Entrar a su panel», el alta no pide contraseña
  inicial ni muestra la tarjeta de credenciales.
- Página **Solicitudes**: la pestaña Solicitudes del partner es de sólo
  lectura (leads asignados o llegados por el link). No hay UI para asignar
  leads ni para gestionar pedidos de partner.
- Backend/API de partners, cobros y comisiones.
- Otros items del menú (Cobros, Soporte, Avisos, Reportes, Planes, Equipo,
  Registro).

## Decisiones

### D1 · Dataset de comisiones

`Liquidation { id, pid, ym, amount, at, method, ref }` y `DemoDb.liq`. El seed
replica la regla de la demo: los 12 meses anteriores ya están liquidados salvo
el mes anterior de Andes (`pt3`), que queda «por liquidar» para poder probar la
acción. `pDebt` suma las comisiones de los últimos 12 meses cerrados sin
liquidación; `pComm = pColl × pct`; `pColl` es lo cobrado a los clientes del
partner en el mes.

### D2 · Leads

`Lead` con `partner?`, `ref?` (código del link) y `status`. `leadPartner`
resuelve el partner asignado a mano o el del link (`?p=código`). La pestaña
Solicitudes y el KPI «Demos sin partner» consumen sólo lectura. No se porta
`op-leads` aparte: van dentro del mismo `uv-admin-db`.

### D3 · Migración del store

La versión sigue en `1`. `loadDb` aplica `ensureDemoDb`, que agrega `partners`,
`liq` y `leads` si faltan y asigna partner a clientes sin él. Una base de la
entrega 1 conserva pagos, notas y ediciones.

### D4 · Rutas y guard

`pages/PartnersRoute.tsx` monta `UrbanVoicePartners` con el tema `urbanvoice`;
en los demás temas `/partners` redirige a `/dashboard`. El guard del shell
permite `/partners` además de `/clients` y `/settings`. `/partners/:partnerId`
sólo tiene sentido en el tema.

### D5 · Permisos

`admin` ve y hace todo. `operativo` (mapeado a «Ventas») ve Partners, crea y
edita partners y reasigna clientes; no liquida comisiones (`perms.pay`) ni
suspende/reactiva partners (`perms.plan`). Los importes de las tablas de
Partners se muestran igual que en la demo para ambos roles: son comisiones de
venta, no el abono del cliente.

### D6 · Corte de controles sin destino

Todo control visible funciona sobre el store. Se omiten los que dependen de
módulos inexistentes (panel del partner, credenciales de acceso, envío de
acceso, asignación de leads). «Avisar» en liquidar abre WhatsApp con el texto
de la demo; no registra nada.

## Archivos

```
frontend-tenant/src/
  App.tsx                                    # rutas /partners y /partners/:partnerId
  pages/PartnersRoute.tsx                    # despacho por tema
  templates/urbanvoice/AppLayout.tsx         # item del menú + guard
  templates/urbanvoice/partners/
    UrbanVoicePartners.tsx                   # listado | ficha por URL
    PartnersList.tsx
    PartnerDetail.tsx
    PartnerLogo.tsx
    modals/PartnerModal.tsx                  # alta/edición
    modals/SettlementModal.tsx               # liquidar comisión
    modals/SettlementDetailModal.tsx         # detalle por cliente
    modals/ReassignPartnerModal.tsx          # cambiar partner de un cliente
  templates/urbanvoice/clients/ClientsList.tsx      # botón Partners
  templates/urbanvoice/clients/tabs/SummaryTab.tsx  # Cambiar partner
  templates/urbanvoice/demo/{types,seed,store,selectors,actions}.ts
```

## Verificación

1. `cd frontend-tenant && npx tsc -b` y `npm run build` sin errores; `eslint`
   sobre los archivos tocados sin errores.
2. Harness temporal (MemoryRouter + Auth/Template context de prueba) sobre el
   tema: listado, ficha, pestañas Cartera/Comisiones/Solicitudes/Equipo, alta
   de partner con navegación a su ficha, liquidación de la comisión pendiente
   de Andes y cambio de partner desde la ficha de un cliente. Desktop 1440 px
   y mobile 390 px.
3. El harness se borra al terminar; no queda ruta de preview en el repo.

## Pendiente para la próxima entrega

Cobros y abonos, que habilita comprobantes del tab Abono; luego Soporte y
avisos. La página Solicitudes y el panel del partner siguen sin existir.
