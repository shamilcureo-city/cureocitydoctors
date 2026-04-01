import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cureocity: {
          primary: '#0F766E',    // Teal - medical/trust
          secondary: '#1E40AF',  // Deep blue
          accent: '#F59E0B',     // Amber for alerts
          danger: '#DC2626',     // Red alerts
          success: '#16A34A',    // Green confirmations
          bg: '#F8FAFC',         // Light background
          card: '#FFFFFF',
          text: '#1E293B',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
