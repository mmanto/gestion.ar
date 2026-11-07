import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/utils';
import { Textarea } from '../ui/textarea';

/**
 * Contenedor de un formulario: aporta el contexto de tamaño que consumen las
 * variantes de contenedor (`@md`, `@2xl`) de la rejilla canónica.
 */
export const FORM_CLASSES = '@container flex flex-col gap-4';

/**
 * Rejilla canónica de formularios (docs/design/DESIGN.md §9.1 del hub):
 * 1 columna por defecto, 2 cuando el contenedor llega a 28rem (`@md`) y 3
 * cuando llega a 42rem (`@2xl`). Los campos multilínea ocupan 2 columnas; si
 * quedan solos en su fila, ocupan las 3.
 */
export const FORM_GRID = 'grid gap-4 @md:grid-cols-2 @2xl:grid-cols-3';

/** Campo multilínea: 2 columnas en las rejillas de 2 y de 3. */
const SPAN_WIDE = '@md:col-span-2 @2xl:col-span-2';
/** Campo multilínea solo en su fila: las 3 columnas de la rejilla ancha. */
const SPAN_WIDE_FULL = '@md:col-span-2 @2xl:col-span-3';

/** Props que la rejilla lee de cada campo. */
type GridChildProps = {
  wide?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Campos que ocupan 2 columnas en la rejilla ancha: los que se marcan `wide`
 * o los que envuelven un `Textarea` (el caso normal). Un campo multilínea no
 * se decide por su ancho intrínseco sino por ser multilínea.
 */
function isWideField(element: ReactElement<GridChildProps>): boolean {
  if (element.props.wide !== undefined) return element.props.wide;
  return Children.toArray(element.props.children).some(
    (child) => isValidElement(child) && child.type === Textarea,
  );
}

/**
 * Reparte los campos de la rejilla de 3 columnas y devuelve la clase de ancho
 * de cada uno. Los multilínea ocupan 2 columnas; pasan a 3 cuando arrancarían
 * una fila y el campo siguiente también es multilínea (o no hay siguiente),
 * así no queda un hueco de una columna al lado.
 */
export function formSpanClasses(wide: readonly boolean[]): string[] {
  const classes: string[] = [];
  // Columnas ocupadas en la fila actual de la rejilla ancha (0, 1 o 2).
  let column = 0;

  for (let index = 0; index < wide.length; index += 1) {
    if (!wide[index]) {
      classes.push('');
      column = (column + 1) % 3;
      continue;
    }

    // Un campo de 2 columnas no entra si sólo queda una libre: arranca la fila
    // siguiente, donde se reevalúa el ancho.
    if (column === 2) column = 0;

    const nextIsWide = wide[index + 1] !== false;
    const full = column === 0 && nextIsWide;
    classes.push(full ? SPAN_WIDE_FULL : SPAN_WIDE);
    column = (column + (full ? 3 : 2)) % 3;
  }

  return classes;
}

/**
 * Rejilla canónica de un formulario. Los campos se declaran en orden y la
 * rejilla decide el ancho de cada uno; no hay que agruparlos en filas.
 */
export function FormGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children);
  const spans = formSpanClasses(
    items.map((item) => isValidElement<GridChildProps>(item) && isWideField(item)),
  );

  return (
    <div className={cn(FORM_GRID, className)}>
      {items.map((item, index) =>
        isValidElement<GridChildProps>(item) && spans[index]
          ? cloneElement(item, {
              className: cn(item.props.className, spans[index]),
            })
          : item,
      )}
    </div>
  );
}

/**
 * Campo de formulario: label + control (+ ayuda), con el espaciado del
 * paquete. `wide` fuerza el ancho de 2 columnas para un control que no sea un
 * `Textarea`; dentro de un `FormGrid` el ancho lo calcula la rejilla.
 */
export function Field({
  label,
  htmlFor,
  hint,
  reserveHint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  /**
   * Reserva el área de ayuda (dos líneas) aunque el campo no tenga texto, para
   * que los campos de su misma fila queden alineados aunque la ayuda de uno
   * ocupe más de una línea.
   */
  reserveHint?: boolean;
  /** Ancho de 2 columnas aunque el control no sea multilínea. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {hint || reserveHint ? (
        <p className={cn('text-xs text-muted-foreground', reserveHint && 'min-h-8')}>
          {hint || '\u00A0'}
        </p>
      ) : null}
    </div>
  );
}