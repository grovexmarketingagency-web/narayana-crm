/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), border: v('border'),
        text: v('text'), muted: v('muted'), accent: v('accent'), 'accent-strong': v('accent-strong'),
        'on-accent': v('on-accent'), gold: v('gold'), success: v('success'), warning: v('warning'), danger: v('danger'),
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'], display: ['"Playfair Display"', 'Georgia', 'serif'] },
      borderRadius: { sm: '6px', md: '10px', lg: '14px' },
    },
  },
  plugins: [],
}
