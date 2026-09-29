import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-base shadow-neu-flat active:shadow-neu-pressed [&_svg]:text-purple-600",
        // Solid brand fill with white text — for the one main action on a
        // screen (UI_UX_IMPROVEMENT_PLAN.md DS1/BUG2).
        primary:
          "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-neu-flat-sm active:shadow-neu-pressed-sm hover:from-purple-500 hover:to-pink-500",
        success:
          "bg-emerald-600 text-white shadow-neu-flat-sm active:shadow-neu-pressed-sm hover:bg-emerald-500",
        destructive:
          "bg-destructive text-destructive-foreground shadow-neu-flat active:shadow-neu-pressed hover:bg-destructive/90",
        outline:
          "border border-slate-300 dark:border-slate-700 bg-base text-slate-700 dark:text-slate-200 shadow-neu-flat-sm active:shadow-neu-pressed-sm",
        secondary:
          "bg-base text-slate-700 dark:text-slate-200 shadow-neu-flat-sm active:shadow-neu-pressed-sm",
        ghost:
          "text-slate-600 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5",
        link: "text-purple-600 underline-offset-4 hover:underline hover:text-pink-600",
      },
      // 44 px default/icon: comfortable touch targets
      // (UI_UX_IMPROVEMENT_PLAN.md DS11). `sm` is for dense rows only.
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";

  // `default` is a neu-extruded bg-base surface with gradient *text* — a
  // single element can't show a flat bg-base fill and clip a second
  // gradient bg to its text, so the gradient lives on an inner span instead.
  // That span needs its own inline-flex row: Tailwind's preflight sets
  // `svg { display: block }`, and a block-level icon inside a plain
  // (non-flex) span forces the text after it onto its own line — i.e. the
  // icon renders above the label instead of beside it, on every default-
  // variant button with an icon (Sign in, Look up owner, etc). Non-default
  // variants don't hit this since their children go straight into the
  // outer inline-flex button.
  //
  // A caller that paints its own fill (`bg-red-600`, `bg-gradient-…`) on a
  // default button would get invisible gradient text on that fill
  // (UI_UX_IMPROVEMENT_PLAN.md BUG2), so those keep plain text instead.
  const ownFill = /(^|\s)bg-(?!base\b|transparent\b|clip-)/.test(className || "");
  //
  // `loading` (UI_UX_IMPROVEMENT_PLAN.md B.6): spinner first, disabled, and
  // aria-busy, so every async button behaves the same.
  const content =
    loading && !asChild ? (
      <>
        <Loader2 className="animate-spin" aria-hidden="true" />
        {children}
      </>
    ) : (
      children
    );
  const label =
    !asChild && !ownFill && (variant === "default" || variant === undefined) ? (
      <span className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        {content}
      </span>
    ) : (
      content
    );

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {label}
    </Comp>
  );
});

export { Button, buttonVariants };
