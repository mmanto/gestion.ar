import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Une clases condicionales y resuelve conflictos de Tailwind (la última gana).
 * Equivalente al helper `cn` que devbout-ui/base importa del paquete `cn@0.4`;
 * acá se resuelve con clsx + tailwind-merge para no arrastrar su plugin de Vite.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
