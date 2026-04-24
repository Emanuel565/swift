/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        valorant: {
          red: '#ff4655',
          dark: '#0f1923',
          light: '#ece8e1',
          gray: '#768079',
          border: '#2e3843',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'], 
        val: ['Oswald', 'Impact', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
