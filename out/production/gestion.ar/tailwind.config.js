/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // fontSize y fontWeight NO van dentro de "extend": son reemplazos
    // completos de la escala default de Tailwind, apuntando a las variables
    // CSS definidas en :root (src/index.css) — cambiar el look & feel de
    // toda la app es cuestión de editar ese único archivo.
    fontSize: {
      xs:   'var(--text-xs)',
      sm:   'var(--text-sm)',
      base: 'var(--text-base)',
      lg:   'var(--text-lg)',
      xl:   'var(--text-xl)',
      '2xl': 'var(--text-2xl)',
      '3xl': 'var(--text-3xl)',
      '4xl': 'var(--text-4xl)',
      '5xl': 'var(--text-5xl)',
      '6xl': 'var(--text-6xl)',
      '7xl': 'var(--text-7xl)',
    },
    // Paleta limitada a 4 pesos — font-thin/extralight/light/extrabold/black
    // quedan deshabilitados a propósito.
    fontWeight: {
      normal:   'var(--font-normal)',
      medium:   'var(--font-medium)',
      semibold: 'var(--font-semibold)',
      bold:     'var(--font-bold)',
    },
    extend: {
      fontFamily: {
        sans:      ['Montserrat', 'system-ui', 'sans-serif'],
        editorial: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#2793b4',
          50:  '#eef8fc',
          100: '#d4eef6',
          200: '#a3dae2',
          300: '#6bbdd0',
          400: '#2ca6a8',
          500: '#2793b4',
          600: '#2184c3',
          700: '#1f75ca',
          800: '#175a9e',
          900: '#0f3d70',
        },
        secondary: {
          DEFAULT: '#37c88e',
          50:  '#edfaf5',
          100: '#d1f5e8',
          200: '#a3e8cc',
          300: '#6dd9b0',
          400: '#37c88e',
          500: '#4eaa9c',
          600: '#2ca6a8',
          700: '#237f85',
          800: '#1a5d63',
          900: '#113b40',
        },
        accent: {
          DEFAULT: '#a3dae2',
          light: '#ceeef3',
          dark:  '#4eaa9c',
        },
        gradient: {
          from: '#37c88e',
          via:  '#2793b4',
          to:   '#1f75ca',
        },
      },
    },
  },
  plugins: [],
}
