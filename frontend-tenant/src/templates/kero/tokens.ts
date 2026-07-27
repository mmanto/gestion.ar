// Constantes de color del template Kero para usos `style={{}}` (avatares, etc.).
//
// El acento (antes un terracota ad-hoc, #da624a) ahora es el blue-600 de la
// paleta estándar de Tailwind (#2563eb) — en los componentes se usa la clase
// `blue-600` directamente (bg-blue-600, text-blue-600, ring-blue-600/30,
// etc.), nunca interpolando este valor en un className (Tailwind JIT
// necesita strings literales en el código fuente para generar la clase — un
// `` `bg-[${KERO_ACCENT}]` `` no genera CSS). Esta constante es solo para
// los pocos casos que necesitan el hex en `style={{}}`.
export const KERO_ACCENT = '#2563eb';
export const KERO_PAGE_BG = '#F8F9FD';
export const KERO_BORDER = '#dee2e6';
