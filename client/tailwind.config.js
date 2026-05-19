/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vigia: {
          900: '#0f0f1a',
          800: '#1a1a2e',
          700: '#16213e',
          600: '#0f3460',
          accent: '#6366f1',
          'accent-hover': '#4f46e5',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
        }
      }
    }
  },
  plugins: []
};
