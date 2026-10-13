import type { ReactNode } from 'react';

/**
 * Receta de los formularios de entidad del paquete (`@mmanto/devbout-ui`:
 * `ROW_CLASSES` + `FieldControl` en data-table/entity-form.tsx): los campos van
 * en filas —de a dos, tres si son cortos (select/color/fecha)— dentro de un
 * `@container`, así la cantidad de columnas la decide el ancho disponible
 * (modal, drawer, pantalla) y no el viewport. Cada campo es `grid gap-2` con el
 * label `text-xs font-medium` arriba.
 *
 * El paquete renderiza sus formularios con esto; las pantallas de gestion.ar que
 * necesitan controles propios (p. ej. el `AvatarPicker` de los logos) usan la
 * misma receta a mano.
 */
export const FORM_CLASSES = '@container flex flex-col gap-4';
export const ROW_2 = 'grid gap-4 @md:grid-cols-2';

/** Campo de formulario: label + control (+ ayuda), con el espaciado del paquete. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
