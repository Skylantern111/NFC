# TagBack — Light Neumorphic/Glassmorphic Redesign Plan

> Planning document only. No code changed as part of this file. Grounded against
> the actual current source (dark-first shadcn/ui tokens in `src/index.css`,
> `tailwind.config.js`, `AmbientBackground.jsx`, `GlassCard.jsx`,
> `components/ui/button.jsx`, `components/ui/input.jsx`,
> `components/nav/DashboardSidebar.jsx`, `components/nav/TopNav.jsx`).

Goal: move from the current "Dark SaaS" glass aesthetic (`#0d0a1a` void
background, purple-pink glow orbs, `bg-white/10` glass) to a bright,
tactile **Light Neumorphism + Glassmorphism hybrid** — soft extruded/pressed
surfaces on a pale base, with frosted glass cards floating above them.

---

## 0. Reference Screenshot

User-supplied reference: `TagBack Dashboard` mockup (browser-chrome-framed,
pale lavender canvas). Observed details this plan's sections below are
calibrated against:

- **Canvas**: flat pale lavender-gray (~`#EDEBF5`–`#E9EDF5` range) — matches
  the `colors.base` value proposed in §1, no change needed.
- **Sidebar**: NOT an edge-to-edge extruded panel flush with the viewport
  edge — it's a **floating white rounded-3xl card** with visible margin on
  all sides, soft drop shadow (reads closer to `shadow-lg`/`shadow-xl` than
  a two-tone neu-flat), same card language as everything else on the page.
  Logo mark: small rounded-square tile, pale purple fill, tag icon
  centered. Active nav item (`Dashboard`): soft light-purple pill fill
  (`bg-purple-100`-ish) with a filled purple dot/icon-circle on the left,
  not an inset/pressed shadow — corrects the `neu-pressed-sm` active-state
  guidance in §4 below, see adjustment note there. Inactive nav items:
  plain slate-600 text + outline icon, no background. Bottom of sidebar:
  small circular avatar placeholder + "user info" line + pill-shaped
  outlined "Logout" button.
- **Stat tiles** (`Items Tagged` / `In Lost Mode` / `Open Reports`): three
  equal white rounded-2xl cards in a row, each with a small pale icon
  badge (rounded-square, tinted fill matching the stat's semantic color)
  top-left of a bold large number, label below in slate-500. This is a
  cleaner/simpler version of the existing `Dashboard.jsx` stat-tile loop —
  §5 sweep should add the icon badge, not just recolor text.
- **Hero incident card**: white rounded-3xl card, NOT tinted red — only
  two small pill badges carry the alert color: an outlined `REPORT OPEN`
  pill (pink/red outline, red text) and a filled `ACTIVE FOUND-ITEM
  REPORT` pill (solid pink-100 fill, red-600 text), both top-aligned,
  small caps. This is lighter-touch than §1/§3's `border-red-400
  bg-red-50/60` full-card tint — reference favors badge-carries-the-alert
  over card-carries-the-alert. Below: centered layout — small "LOST ITEM"
  eyebrow label, bold item name, italic quoted last-message, a centered
  "LOST STATUS" outline pill, and a centered purple "Open chat →" text
  link (not a filled button) with an arrow glyph. §4.5/Dashboard hero card
  in the current codebase is left-aligned/split-row — reference uses a
  fully centered stacked layout instead.
- **Privacy card**: plain white rounded-3xl card, bold slate-800 heading,
  slate-600 body paragraph — matches §5's `text-slate-600` body-copy
  target already, no further change.
- **Overall shadow language**: every surface in the reference reads as
  soft-UI (single soft drop shadow, white fill, rounded-3xl) rather than
  true two-tone neumorphism (light+dark dual shadow implying a shared-color
  extrusion from the canvas). Treat `shadow-neu-flat`/`shadow-neu-pressed`
  from §1 as available primitives for a few tactile accents (buttons,
  toggle switches, the active-nav affordance if revisited) — but the
  dominant card idiom across the app should be **glass/soft-UI first**
  (`bg-white/70`–`bg-white` + soft shadow), matching this reference, not
  neumorphism-everywhere. Adjust §3 `GlassCard`/`card.jsx` guidance
  accordingly: `bg-white/30` (heavy translucency) reads darker/muddier
  against the lavender canvas than this reference's near-opaque white
  cards — prefer `bg-white/70` or `bg-white/80` with `backdrop-blur-xl`
  when this gets implemented.

---

## 1. Global Configuration

### `tailwind.config.js`

Additive changes only — existing `colors.void`/`colors.panel` and the
shadcn semantic tokens (`background`, `card`, `sidebar`, etc.) stay, since
those are driven by CSS variables in `index.css` and get repointed there
(see §1 `index.css` below), not hardcoded here.

Add to `theme.extend`:

```js
theme: {
  extend: {
    colors: {
      // ...existing tokens unchanged...
      base: '#E9EDF5', // neumorphic canvas — slightly cooler than #E0E5EC to
                        // keep contrast against white glass cards on top of it
    },
    boxShadow: {
      // Light source: top-left. Two-layer shadow (light + dark) is what
      // sells the "physical extrusion" — a single shadow reads as flat.
      'neu-flat': '8px 8px 16px rgba(163,177,198,0.6), -8px -8px 16px rgba(255,255,255,0.8)',
      'neu-flat-sm': '4px 4px 8px rgba(163,177,198,0.55), -4px -4px 8px rgba(255,255,255,0.75)',
      'neu-pressed': 'inset 6px 6px 12px rgba(163,177,198,0.6), inset -6px -6px 12px rgba(255,255,255,0.8)',
      'neu-pressed-sm': 'inset 3px 3px 6px rgba(163,177,198,0.55), inset -3px -3px 6px rgba(255,255,255,0.75)',
    },
  },
},
```

Notes:
- Shadow colors are hardcoded rgba (not CSS vars) since neumorphism is
  light-mode-only by design here — no dark-mode neu variant is in scope.
- `neu-flat-sm` / `neu-pressed-sm` cover small controls (inputs, nav pills)
  where the 8px spread reads as too heavy.

### `src/index.css`

Repoint the shadcn CSS variables from the current dark "Signal Glass"
palette to a light set, and swap the hardcoded `body` background/color.
`.dark` block stays as a fallback/escape hatch (unused unless a theme
toggle is reintroduced later) but is no longer what `:root` mirrors.

```css
:root {
  color-scheme: light;

  --background: 220 33% 92%;       /* ≈ #E9EDF5 */
  --foreground: 222 20% 24%;       /* ≈ slate-800 */
  --card: 0 0% 100%;
  --card-foreground: 222 20% 24%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 20% 24%;
  --primary: 273 67% 60%;          /* purple-500 */
  --primary-foreground: 0 0% 100%;
  --secondary: 220 20% 88%;
  --secondary-foreground: 222 20% 24%;
  --muted: 220 24% 88%;
  --muted-foreground: 220 9% 46%;  /* ≈ slate-500 */
  --accent: 328 73% 62%;           /* pink-500 */
  --accent-foreground: 0 0% 100%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --border: 220 20% 82%;
  --input: 220 20% 82%;
  --ring: 273 67% 60%;
  --radius: 0.65rem;
  /* --chart-*, --sidebar-* : same remap pattern, omitted here for brevity —
     sidebar-* should match the new sidebar treatment in §4 (light/white). */
}
```

```css
body {
  margin: 0;
  background-color: #e9edf5; /* matches colors.base */
  color: #1e293b;            /* slate-800 */
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

The `.glass` / `.glass-legible` component classes in `@layer components`
get redefined in §3 (GlassCard) rather than here, since their new values
depend on the neu canvas color chosen above.

---

## 2. Global Background — `src/components/AmbientBackground.jsx`

Full rewrite. Drop the gradient wash + blurred glow orbs; replace with
`neu-flat`-shadowed geometric shapes stamped into the flat `base` canvas.
Keep the `memo()` wrapper (same reasoning as today: chat/state churn must
never restart these).

```jsx
import { memo } from 'react';

// Static neumorphic "wallpaper" — abstract shapes extruded from the base
// canvas via neu-flat. Replaces the dark glow-orb treatment. No animation:
// neumorphic shadows read as physical surfaces, and drifting/scaling them
// breaks that illusion (a "solid" object shouldn't visibly deform).
function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-base" aria-hidden="true">
      <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-base shadow-neu-flat opacity-90" />
      <div className="absolute top-1/4 -right-24 h-96 w-96 rounded-[3rem] bg-base shadow-neu-flat opacity-80" />
      <div className="absolute bottom-10 left-1/5 h-56 w-40 rounded-full bg-base shadow-neu-flat opacity-70" />
      <div className="absolute -bottom-24 right-1/4 h-80 w-80 rounded-[4rem] bg-base shadow-neu-flat opacity-80" />
      <div className="absolute top-1/2 left-1/3 h-24 w-24 -translate-y-1/2 rounded-3xl bg-base shadow-neu-flat-sm opacity-60" />
    </div>
  );
}

export default memo(AmbientBackground);
```

Positioning stays asymmetric/off-grid on purpose (mirrors the current
orb placement) so the canvas doesn't look like a repeating tile pattern.

---

## 3. Core UI Primitives — `src/components/ui/`

### `button.jsx`

Rewrite the `default` variant to a tactile neu button; keep `destructive`
mostly as-is (solid fill is correct for a warning action) but move it onto
the light palette. `:active` swap uses Tailwind's `active:` pseudo-class
directly on `shadow-neu-flat` → `shadow-neu-pressed` (no JS state needed —
CSS `:active` already exists per click).

```js
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default:
          "bg-base text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 shadow-neu-flat active:shadow-neu-pressed [&_svg]:text-purple-600",
        // ^ text gradient via bg-clip-text on the *button's own* background
        // conflicts with the neu bg-base fill — in practice this needs a
        // nested <span className="bg-clip-text ..."> wrapping the label
        // rather than applying bg-clip-text to the button itself, since a
        // single element can't both show a flat bg-base fill *and* clip a
        // second gradient bg to its text. Flag for implementation, not
        // solvable as a single className string.
        destructive:
          "bg-destructive text-white shadow-neu-flat active:shadow-neu-pressed hover:bg-destructive/90",
        outline:
          "border border-slate-300 bg-base text-slate-700 shadow-neu-flat-sm active:shadow-neu-pressed-sm",
        secondary:
          "bg-base text-slate-700 shadow-neu-flat-sm active:shadow-neu-pressed-sm",
        ghost:
          "text-slate-600 hover:bg-slate-900/5",
        link:
          "text-purple-600 underline-offset-4 hover:underline hover:text-pink-600",
      },
      size: { /* unchanged */ },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

Implementation note carried into the code above: `bg-clip-text` needs the
gradient text on an inner `<span>`, not the button root, because the root
must keep a solid `bg-base` for the neu shadow illusion to work. Correct
JSX shape:

```jsx
<Button>
  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
    Claim a tag
  </span>
</Button>
```
...or fold that span into `buttonVariants` render output directly (wrap
`children` in the `Button` component body) so call sites don't need to
remember to add it. Decide at implementation time — flagging here so it
isn't discovered mid-refactor.

### `input.jsx`

Swap the shadcn default (`border-input`, `shadow-xs`, `bg-transparent`)
for an inset neu-pressed field. `dark:bg-input/30` branch is dead weight
now (no dark mode target) — drop it.

```js
className={cn(
  "placeholder:text-slate-400 selection:bg-purple-200 selection:text-purple-900 h-9 w-full min-w-0 rounded-xl border-none bg-base px-3.5 py-1 text-base text-slate-800 shadow-neu-pressed-sm outline-none transition-shadow disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  "focus-visible:shadow-neu-pressed focus-visible:ring-2 focus-visible:ring-purple-400/40",
  "aria-invalid:ring-destructive/30 aria-invalid:shadow-none aria-invalid:border aria-invalid:border-destructive",
  className
)}
```

`Textarea` (`components/ui/textarea.jsx`, not explicitly listed but shares
the pattern) should get the identical treatment for visual consistency —
flag as an implementation-time companion change even though not in the
original 5-file list.

### `GlassCard.jsx` / `card.jsx`

Shift `.glass` from dark (`bg-white/10` on a dark void) to light glass
floating on the new neu canvas. Update the `@layer components` block in
`index.css` (§1) alongside this component:

```css
@layer components {
  .glass {
    @apply bg-white/30 backdrop-blur-xl border border-white/60 shadow-lg rounded-3xl;
  }
  .glass-legible {
    /* Dark localized-contrast overlay no longer applies on a light bg —
       drop the before:bg-gradient-to-b black wash entirely. Text contrast
       comes from the slate-800/slate-500 sweep in §5 instead. */
  }
}
```

`GlassCard.jsx` itself needs no structural change beyond the CSS above —
it already just composes `.glass .glass-legible`. The `lost` variant's
`bg-red-900/20` + neon glow (built for a dark backdrop) needs a light
equivalent:

```jsx
const base =
  'glass glass-legible p-6 transition-colors ' +
  (lost
    ? 'border-red-400 border-2 bg-red-50/60 shadow-[0_0_24px_rgba(239,68,68,0.25)] animate-pulseGlow'
    : '');
```

`components/ui/card.jsx` (the shadcn primitive, separate from
`GlassCard.jsx`) inherits its look for free once `--card`/`--card-foreground`
are repointed in §1 — no direct edit expected there.

---

## 4. App Shell & Navigation — `src/components/nav/`

### `DashboardSidebar.jsx`

Redesign as a large neu-extruded panel (not glass — a sidebar is a fixed
structural element, better sold as "carved from the same canvas" than
"floating over it"). Active nav item becomes a pressed pill.

```jsx
<aside className="fixed inset-y-0 left-0 z-20 flex w-56 shrink-0 flex-col bg-base shadow-neu-flat">
  <Link to="/dashboard" className="flex items-center gap-2.5 px-5 py-6">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
      <Tag className="h-5 w-5 text-white" />
    </span>
    <div className="min-w-0">
      <p className="truncate text-base font-extrabold leading-tight text-slate-800">TagBack</p>
      <p className="truncate text-xs text-slate-500">NFC Lost &amp; Found</p>
    </div>
  </Link>

  <nav className="flex-1 space-y-1.5 px-3">
    {navItems.map(({ to, label, icon: Icon, end }) => (
      <NavLink
        key={to}
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            isActive
              ? 'bg-base text-purple-600 shadow-neu-pressed-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{label}</span>
        {to === '/dashboard/notifications' && unreadCount > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-1 text-[11px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </NavLink>
    ))}
  </nav>

  <div className="px-3 py-4">
    <Link
      to="/dashboard/settings"
      className="block truncate rounded-xl px-3 py-2 text-xs text-slate-500 transition-colors hover:text-slate-800"
      title="Account settings"
    >
      {user?.email || 'Signed in'}
    </Link>
    <button
      type="button"
      onClick={onLogout}
      className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-red-500"
    >
      <LogOut className="h-4 w-4" />
      Logout
    </button>
  </div>
</aside>
```

Dropped the `border-r border-white/10` divider (a neu-flat shadow already
separates the panel from the canvas — a hard border line fights that) and
the hover background washes (`hover:bg-white/5`) in favor of text-color-only
hover, since a translucent hover fill reads oddly over a solid neu surface.

### `TopNav.jsx`

Simple frosted bar, per the brief:

```jsx
<header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between border-b border-white/50 bg-white/40 px-4 py-5 backdrop-blur-md sm:px-6">
  <Link to="/" className="flex items-center gap-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
      <Tag className="h-4 w-4 text-white" />
    </span>
    <span className="text-lg font-extrabold text-slate-800">TagBack</span>
  </Link>

  {variant === 'landing' ? (
    <nav className="flex items-center gap-4">
      <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
        Login
      </Link>
      <Link
        to="/register"
        className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-neu-flat-sm hover:from-purple-400 hover:to-pink-400"
      >
        Get Started
      </Link>
    </nav>
  ) : (
    <BackButton fallback={fallback} />
  )}
</header>
```

`BackButton.jsx` (not in the original 5-file list) will need its own
color sweep to match §5 — currently likely styled for dark text/icons.
Flag for implementation-time check.

---

## 5. Page-Level Typography & Contrast Sweep

Scope: `src/pages/**/*.jsx` (Landing, auth, dashboard/*, public/*, admin/*)
plus any component not already covered above that still carries dark-theme
utility classes (`BackButton.jsx`, `ManusDialog.jsx`, `Map.jsx` popups,
`components/ui/*` files beyond button/input/card if audit turns up more).

### Find-and-replace table

| From | To | Where |
|---|---|---|
| `text-white` | `text-slate-800` | headings, labels, primary copy |
| `text-slate-200` | `text-slate-800` | primary copy on former-dark surfaces |
| `text-slate-300` | `text-slate-600` | secondary copy |
| `text-slate-400` | `text-slate-500` | tertiary/meta copy (timestamps, hints) |
| `text-slate-500` | *(leave — already correct target)* | — |
| `bg-white/5`, `bg-white/10` (surface fills, not glass cards) | `bg-slate-900/5` | hover states, dividers on light bg |
| `border-white/10`, `border-white/15`, `border-white/20` | `border-slate-200` or drop (see neu no-border note in §4) | dividers |
| `divide-white/10` | `divide-slate-200/70` | list rows (Messages, Notifications) |
| `bg-red-900/20` (lost-mode alert fill) | `bg-red-50` | `Items.jsx`, `GlassCard.jsx` lost variant |
| `border-red-500` (lost-mode alert border) | `border-red-400` | same |
| `shadow-[0_0_30px_rgba(239,68,68,0.4)]` | `shadow-[0_0_24px_rgba(239,68,68,0.25)]` | same — lighter glow reads better on light bg |

This is a plain text substitution sweep, **not** a blind regex-replace-all
across the repo — several matches need manual judgment:
- `text-white` used *inside* a solid gradient pill (e.g. the purple-pink
  "Get Started" button, unread-count badges) must stay `text-white` —
  those surfaces stay dark/saturated on purpose. Only convert `text-white`
  sitting on what is now a light `bg-base`/glass surface.
- `bg-red-900/20`/`border-red-500` also appear on the `Switch` "Lost mode"
  state in `Items.jsx` and the `Dashboard.jsx` hero incident card — sweep
  both, not just `GlassCard.jsx`.

### Status badge treatment

Convert `Badge` usages (`components/ui/badge.jsx` variants, and the
inline `Badge variant="destructive"|"outline"|"secondary"` calls in
`Items.jsx`, `Messages.jsx`, `Notifications.jsx`) to light glass pills:

```
bg-white/50 backdrop-blur-sm border border-white/70 text-{color}-600 font-semibold
```

concrete mapping:
- **Safe** → `bg-emerald-50/80 border-emerald-200 text-emerald-600`
- **Lost** → `bg-red-50/80 border-red-200 text-red-600`
- **Found reported** → `bg-amber-50/80 border-amber-200 text-amber-600`
- **Open** (chat) → `bg-white/50 border-white/70 text-slate-600`
- **Resolved** (chat) → `bg-emerald-50/80 border-emerald-200 text-emerald-600`

### Per-page checklist

- [ ] `pages/Landing.jsx` — hero copy, feature cards, CTA buttons
- [ ] `pages/auth/Login.jsx`, `Register.jsx` — form labels/inputs (inherit
      from Input primitive sweep, verify no hardcoded overrides)
- [ ] `pages/dashboard/Dashboard.jsx` — stat tiles, hero incident card,
      stale nudge card, privacy blurb card
- [ ] `pages/dashboard/Items.jsx` — item rows, lost-mode alert styling,
      arm-lost dialog
- [ ] `pages/dashboard/Messages.jsx` — chat list rows, unread dot color
      (currently `bg-purple-400` — fine on light bg, keep)
- [ ] `pages/dashboard/Notifications.jsx` — notification rows
- [ ] `pages/dashboard/NfcSetup.jsx`, `ClaimTag.jsx`, `Settings.jsx`
- [ ] `pages/public/NfcLanding.jsx`, `Chat.jsx` — message bubbles need a
      light pass too: `bg-white/15 text-slate-100` (finder bubble) →
      `bg-white/60 text-slate-800`; `bg-purple-600/80 text-white` (owner
      bubble) can stay as-is (saturated bubble, correct on light bg)
- [ ] `pages/admin/Inventory.jsx`, `Moderation.jsx`, `AdminLayout.jsx`
- [ ] `components/ManusDialog.jsx`, `ErrorBoundary.jsx`, `Map.jsx` (Leaflet
      popup theming — `.leaflet-container` background in `index.css` line
      118 is still `#130e26`, needs its own light swap)

---

## Sequencing recommendation for implementation (not part of this plan's scope to execute)

1. §1 (tokens/shadows) + §2 (AmbientBackground) first — nothing renders
   correctly until the canvas color and shadow utilities exist.
2. §3 (Button/Input/GlassCard) — primitives used everywhere else.
3. §4 (Sidebar/TopNav) — shell chrome, high-visibility, low page-count.
4. §5 (page sweep) last, page-by-page against the checklist, visually
   verified in-browser per page (not a mechanical find-replace commit).
