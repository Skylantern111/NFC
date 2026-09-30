/** @type {import('tailwindcss').Config} */
export default {
  // Light-only now — no `.dark` theme. `darkMode: 'class'` kept harmless so any
  // leftover `dark:` utility never matches (class is never applied).
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // The paper canvas. CSS-var-backed (same var as the shadcn
        // `background` token) so every `bg-base` surface flips together.
        base: 'hsl(var(--background))',

        // shadcn/ui semantic tokens (neo-brutalist palette). Backed by CSS
        // variables in src/index.css.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          soft: 'hsl(var(--destructive-soft))',
        },
        // State roles — use these instead of raw emerald/amber/sky.
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
          soft: 'hsl(var(--success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
          soft: 'hsl(var(--warning-soft) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
          soft: 'hsl(var(--info-soft) / <alpha-value>)',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Neo-brutalist hard offset shadows (no blur), cast in ink (black).
        // The signature "sticker peeling off the paper" look.
        brut: '4px 4px 0 0 hsl(var(--foreground))',
        'brut-sm': '2px 2px 0 0 hsl(var(--foreground))',
        'brut-lg': '6px 6px 0 0 hsl(var(--foreground))',
        'brut-xl': '8px 8px 0 0 hsl(var(--foreground))',
        // Legacy neu-* names repointed to brutalist equivalents so the files
        // that still reference them render correctly until migrated. `pressed`
        // collapses the offset (used with a translate on :active).
        'neu-flat': '4px 4px 0 0 hsl(var(--foreground))',
        'neu-flat-sm': '2px 2px 0 0 hsl(var(--foreground))',
        'neu-pressed': '0 0 0 0 hsl(var(--foreground))',
        'neu-pressed-sm': '0 0 0 0 hsl(var(--foreground))',
        card: '4px 4px 0 0 hsl(var(--foreground))',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
