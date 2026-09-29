/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wood: {
          light: '#D7BA89',
          DEFAULT: '#8B5E3C',
          dark: '#5D3A1A',
        }
      }
    },
  },
  plugins: [],
}
