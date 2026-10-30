// DESHABILITADO TEMPORALMENTE — smoke test manual del panel admin federado
// (ADR-009, Fase 2). El remote de devbout-appointments inyecta su CSS global
// (Tailwind 3, preflight sin `@layer`) en el documento del host y pisa las
// utilidades de Tailwind 4; se comenta su uso hasta corregir el remote. La
// página no está ruteada (se usaba a mano), así que solo queda el aviso.
//
// import { Input } from '../components/common/Input';
// import { Button } from '../components/common/Button';
// import { Card } from '../components/common/Card';
// import { lazy, Suspense } from 'react';
// const RemoteAppointmentsWorkspace = lazy(() => import('appointments/AppointmentsWorkspace'));

export default function MfAdminTestPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>MF admin smoke test</h1>
      <p>Deshabilitado temporalmente: el remote de turnos está desactivado.</p>
    </div>
  );
}
