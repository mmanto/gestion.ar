// Constantes de color del template Kero para usos `style={{}}` (avatares, etc.).
//
// IMPORTANTE: no interpolar estos valores dentro de un className (Tailwind JIT
// necesita strings literales en el código fuente, ej. `bg-[#da624a]`, para
// generar la clase — un `` `bg-[${KERO_ACCENT}]` `` no genera CSS). Los
// literales `text-[#da624a]`, `bg-[#f5f5f5]`, etc. en los componentes deben
// mantenerse escritos a mano, coincidiendo con estos valores.
export const KERO_ACCENT = '#da624a';
export const KERO_PAGE_BG = '#F1F5F9';
export const KERO_BORDER = '#dee2e6';
