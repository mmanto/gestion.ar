/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:      ['Inter', 'Montserrat', 'system-ui', 'sans-serif'],
        editorial: ["'Cormorant Garamond'", 'Georgia', 'serif'],
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
