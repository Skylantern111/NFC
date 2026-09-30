import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

// Neo-brutalist buttons: flat color blocks, 2px black border, hard offset
// shadow, hover lifts (translate up-left, shadow grows), active presses
// (translate down-right into the shadow). No gradients.
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold tracking-tight",
    "border-2 border-foreground transition-all duration-100",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "aria-invalid:border-destructive",
    // The signature interaction, shared by all filled/outlined variants.
    "shadow-brut hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brut-lg active:translate-x-0 active:translate-y-0 active:shadow-brut-sm",
  ].join(" "),
  {
    variants: {
      variant: {
        // Neutral white block — the default.
        default: "bg-card text-foreground",
        // The one main action on a screen: cobalt fill, white text.
        primary: "bg-primary text-primary-foreground",
        // The loud CTA: electric yellow, black text.
        accent: "bg-accent text-accent-foreground",
        success: "bg-success text-success-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        // Same frame as default but the paper canvas instead of white.
        outline: "bg-background text-foreground",
        secondary: "bg-muted text-foreground",
        // No frame / no shadow — quiet inline actions.
        ghost:
          "border-transparent shadow-none hover:translate-x-0 hover:translate-y-0 hover:shadow-none hover:bg-foreground/5 active:bg-foreground/10",
        // Textual link.
        link: "border-transparent shadow-none hover:translate-x-0 hover:translate-y-0 hover:shadow-none font-semibold text-primary underline-offset-4 hover:underline",
      },
      // 44px default/icon: comfortable touch targets. `sm` for dense rows only.
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3.5 text-xs has-[>svg]:px-3",
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

  // `loading`: spinner first, disabled, and aria-busy, so every async button
  // behaves the same.
  const content =
    loading && !asChild ? (
      <>
        <Loader2 className="animate-spin" aria-hidden="true" />
        {children}
      </>
    ) : (
      children
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
      {content}
    </Comp>
  );
});

export { Button, buttonVariants };
