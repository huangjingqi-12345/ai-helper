import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0f',
          secondary: '#12121a',
          tertiary: '#1a1a25',
          card: '#13131d',
        },
        border: {
          DEFAULT: '#1e1e2e',
          light: '#2a2a3a',
        },
        text: {
          primary: '#ffffff',
          secondary: '#a0a0b0',
          muted: '#555566',
        },
        accent: {
          blue: '#3b82f6',
          green: '#22c55e',
          yellow: '#f59e0b',
          red: '#ef4444',
          purple: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'kpi': ['28px', { lineHeight: '1.2', fontWeight: '700' }],
      },
      spacing: {
        'sidebar': '260px',
        'header': '56px',
      },
      borderRadius: {
        'card': '12px',
      },
      animation: {
        'pulse-skeleton': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
