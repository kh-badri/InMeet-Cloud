/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // User specified exact palette:
        // Dark Mode: #FF6500, #1E3E62, #0B192C, #000000
        darkBg: '#000000',
        darkSurface: '#0B192C',
        darkCard: '#0B192C',
        darkBorder: '#1E3E62',
        darkOrange: '#FF6500',
        darkNavy: '#1E3E62',
        darkMidnight: '#0B192C',

        // Light Mode: #92B4EC, #FFFFFF, #FEA82F, #FF6701
        lightBg: '#F3F6FD',
        lightSurface: '#FFFFFF',
        lightCard: '#FFFFFF',
        lightBorder: '#92B4EC',
        lightBlue: '#92B4EC',
        lightAmber: '#FEA82F',
        lightOrange: '#FF6701',

        // Semantic brand aliases:
        brandPrimary: '#FF6701',
        brandOrange: '#FF6500',
        brandAmber: '#FEA82F',
        brandBlue: '#92B4EC',
        brandNavy: '#1E3E62',
        brandSuccess: '#10B981',
        brandDanger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pageReveal: {
          '0%': { 
            opacity: '0', 
            transform: 'translateY(8px)',
          },
          '100%': { 
            opacity: '1', 
            transform: 'translateY(0)',
          },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        indeterminateSlide: {
          '0%': { transform: 'translateX(-100%)', width: '30%' },
          '50%': { transform: 'translateX(100%)', width: '60%' },
          '100%': { transform: 'translateX(350%)', width: '30%' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.08)' },
        },
      },
      animation: {
        'page-reveal': 'pageReveal 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'indeterminate': 'indeterminateSlide 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
