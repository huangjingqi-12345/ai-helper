import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        px: {
          purple: '#720DD7',
          blue: '#7773FD',
          ink: '#0B0825',
        },
        bg: {
          primary: '#0B0825',
          secondary: '#130F2F',
          tertiary: '#1B1450',
          card: '#151039',
        },
        border: {
          DEFAULT: '#2A215E',
          light: '#43338F',
        },
        text: {
          primary: '#F8F7FF',
          secondary: '#C8C3EA',
          muted: '#817AAA',
        },
        accent: {
          blue: '#7773FD',
          green: '#34D399',
          yellow: '#FBBF24',
          red: '#FB7185',
          purple: '#720DD7',
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
