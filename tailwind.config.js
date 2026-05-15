/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#C45C1A',
          hover: '#d96b28',
          dim: 'rgba(196,92,26,0.15)'
        },
        surface: {
          base: '#111111',
          panel: '#181818',
          elevated: '#1f1f1f',
          hover: '#252525',
          active: '#2a2a2a'
        },
        border: {
          subtle: '#262626',
          DEFAULT: '#333333',
          strong: '#444444'
        },
        text: {
          primary: '#d4d4d4',
          secondary: '#8a8a8a',
          muted: '#555555'
        },
        status: {
          idle: '#555555',
          probing: '#7b7bff',
          queued: '#4a9eda',
          rendering: '#3dc47e',
          paused: '#f0a030',
          done: '#3dc47e',
          error: '#e04040'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace']
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '17px'],
        base: ['13px', '18px']
      }
    }
  },
  plugins: []
}
