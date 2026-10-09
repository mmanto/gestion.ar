import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Tabla de clases portada verbatim de devbout-ui/base (components/ui/button.tsx,
 * estilo base-mira). No se usa `@base-ui/react/button` para no romper la API
 * existente de gestion.ar.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs/relaxed font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline:
          'border-border hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          "h-7 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 rounded-sm px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-xs': "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
        'icon-sm': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-lg': "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type BaseVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type BaseSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

/** Los alias `primary`/`danger` son contrato con el remoto de turnos (MF). */
export type ButtonVariant = BaseVariant | 'primary' | 'danger';
export type ButtonSize = BaseSize | 'md';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Opcional: las primitivas portadas de base pasan el `Button` como `render`
   * de `@base-ui/react` (dialog/sheet) y los hijos llegan por merge de props.
   */
  children?: React.ReactNode;
}

/**
 * Traduce los nombres heredados de gestion.ar a los de base-mira. Los alias se
 * mantienen porque `ButtonProps` se inyecta al remoto `appointments` vía Module
 * Federation (ver src/types/federation-remotes.d.ts), que construye botones con
 * la nomenclatura vieja.
 */
function resolveVariant(variant: ButtonVariant): BaseVariant {
  if (variant === 'primary') return 'default';
  if (variant === 'danger') return 'destructive';
  return variant;
}

function resolveSize(size: ButtonSize): BaseSize {
  return size === 'md' ? 'default' : size;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className,
  ...props
}) => (
  <button
    data-slot="button"
    disabled={disabled || loading}
    className={cn(
      buttonVariants({
        variant: resolveVariant(variant),
        size: resolveSize(size),
      }),
      fullWidth && 'w-full',
      className
    )}
    {...props}
  >
    {loading && (
      <svg
        className="-ml-1 mr-2 size-3.5 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    )}
    {children}
  </button>
);
