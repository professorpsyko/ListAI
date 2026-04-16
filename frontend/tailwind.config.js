/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'progress-pulse': {
          '0%':   { width: '10%', marginLeft: '0%' },
          '50%':  { width: '60%', marginLeft: '20%' },
          '100%': { width: '10%', marginLeft: '90%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'progress-pulse': 'progress-pulse 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
