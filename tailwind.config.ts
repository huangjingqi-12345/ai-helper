import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
        px: {
          purple: '#00C2D6',
          blue: '#10D6E8',
          ink: '#070B12',
        },
        bg: {
          primary: '#070B12',
          secondary: '#0B1018',
          tertiary: '#111A24',
          card: '#101720',
        },
        border: {
          DEFAULT: 'var(--border)',
          light: '#304150',
        },
        text: {
          primary: '#F6FAFF',
          secondary: '#AAB6C3',
          muted: '#667482',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
          blue: '#08D4E8',
          green: '#23E6A8',
          yellow: '#F5A623',
          red: '#FF7F6E',
          purple: '#6EE7F5',
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
