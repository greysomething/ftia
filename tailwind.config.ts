import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1a3a5c',
          dark: '#122840',
          light: '#2a5a8c',
        },
        accent: {
          DEFAULT: '#009BDE',
          dark: '#007ab5',
          light: '#33b5e8',
        },
        charcoal: {
          DEFAULT: '#262626',
          light: '#3a3a3a',
        },
        status: {
          'pre-production': '#2563eb',
          'in-production': '#16a34a',
          'post-production': '#9333ea',
          'completed': '#6b7280',
          'development': '#d97706',
          'casting': '#dc2626',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
