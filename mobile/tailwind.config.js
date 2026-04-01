/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#141414',
        'surface-2': '#1e1e1e',
        border: '#2a2a2a',
        primary: '#9945FF',
        'primary-dark': '#7a35d4',
        accent: '#14F195',
        muted: '#6b7280',
        destructive: '#ef4444',
      },
    },
  },
};
