/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          90: 'rgb(var(--color-ink) / 0.9)',
          55: 'rgb(var(--color-ink) / 0.55)',
          40: 'rgb(var(--color-ink) / 0.4)',
          30: 'rgb(var(--color-ink) / 0.3)',
          10: 'rgb(var(--color-ink) / 0.1)',
          6: 'rgb(var(--color-ink) / 0.06)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          warm: 'rgb(var(--color-surface-warm) / <alpha-value>)',
          soft: 'rgb(var(--color-surface-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-surface-deep) / <alpha-value>)',
        },
        brand: {
          DEFAULT: '#f54e00',
          hover: '#e04800',
          on: '#ffffff',
        },
        danger: '#cf2d56',
        success: '#22a574',
        warn: '#eab308',
        stage: {
          new: '#6b6560',
          design: '#4a7eb8',
          production: '#d4922a',
          install: '#22a574',
          collection: '#d07a4a',
          completed: '#5c5a52',
        },
        'stage-col': {
          design: 'rgb(var(--stage-col-design) / <alpha-value>)',
          production: 'rgb(var(--stage-col-production) / <alpha-value>)',
          install: 'rgb(var(--stage-col-install) / <alpha-value>)',
          collection: 'rgb(var(--stage-col-collection) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', 'system-ui', '-apple-system', 'Helvetica Neue', 'Arial', 'sans-serif'],
        body: ['"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        ring: 'var(--shadow-ring)',
        raised: 'var(--shadow-raised)',
        focus: 'var(--shadow-focus)',
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      borderRadius: {
        pill: '9999px',
      },
      letterSpacing: {
        display: '-0.03em',
        caps: '0.08em',
      },
    },
  },
  plugins: [],
};
