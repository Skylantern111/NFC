/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Reserved deep-canvas tokens (index.html's theme-color meta only —
        // no `bg-void`/`bg-panel` call sites in src/). Left as static hex
        // since nothing renders them; not part of the light/dark token
        // system below.
        void: '#0D0A1A',
        panel: '#130E26',
        // The neumorphic canvas color. CSS-var-backed (same var as the
        // shadcn `background` token) so every `bg-base` surface — nav rails,
        // buttons, inputs, the ambient background — flips with `.dark`
        // automatically instead of needing a per-file edit.
        base: 'hsl(var(--background))',

        // shadcn/ui semantic tokens (Signal Glass palette), ported for the
        // shadcn/Radix component kit under src/components/ui. Backed by CSS
        // variables defined in src/index.css. Additive only — none of the
        // custom tokens above are touched.
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
      },
      boxShadow: {
        // Light source: top-left. Two-layer shadow (light + dark) sells the
        // "physical extrusion" — a single shadow reads flat. Colors come
        // from CSS vars (src/index.css) so `.dark` can swap the grey-shadow/
        // white-highlight light-mode pair for a black-shadow/faint-highlight
        // dark-mode pair without editing any of the ~12 files that use
        // these classes.
        'neu-flat': '8px 8px 16px var(--neu-shadow-strong), -8px -8px 16px var(--neu-shadow-strong-light)',
        'neu-flat-sm': '4px 4px 8px var(--neu-shadow-soft), -4px -4px 8px var(--neu-shadow-soft-light)',
        'neu-pressed': 'inset 6px 6px 12px var(--neu-shadow-strong), inset -6px -6px 12px var(--neu-shadow-strong-light)',
        'neu-pressed-sm': 'inset 3px 3px 6px var(--neu-shadow-soft), inset -3px -3px 6px var(--neu-shadow-soft-light)',
      },
      keyframes: {
        // Slowly drifting ambient orbs. Small translate range = cheap GPU work.
        drift1: {
          '0%,100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(4%, 5%) scale(1.08)' },
        },
        drift2: {
          '0%,100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-5%, 3%) scale(1.05)' },
        },
        drift3: {
          '0%,100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(3%, -4%) scale(1.1)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 24px rgba(239,68,68,0.35)' },
          '50%': { boxShadow: '0 0 40px rgba(239,68,68,0.6)' },
        },
        // shadcn/ui component animations (accordion, input-otp caret).
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' },
        },
      },
      animation: {
        drift1: 'drift1 18s ease-in-out infinite',
        drift2: 'drift2 22s ease-in-out infinite',
        drift3: 'drift3 15s ease-in-out infinite',
        pulseGlow: 'pulseGlow 2.2s ease-in-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
