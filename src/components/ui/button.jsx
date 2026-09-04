import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-base shadow-neu-flat active:shadow-neu-pressed [&_svg]:text-purple-600",
        destructive:
          "bg-destructive text-white shadow-neu-flat active:shadow-neu-pressed hover:bg-destructive/90",
        outline:
          "border border-slate-300 bg-base text-slate-700 shadow-neu-flat-sm active:shadow-neu-pressed-sm",
        secondary:
          "bg-base text-slate-700 shadow-neu-flat-sm active:shadow-neu-pressed-sm",
        ghost:
          "text-slate-600 hover:bg-slate-900/5",
        link: "text-purple-600 underline-offset-4 hover:underline hover:text-pink-600",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, children, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";

  // `default` is a neu-extruded bg-base surface with gradient *text* — a
  // single element can't show a flat bg-base fill and clip a second
  // gradient bg to its text, so the gradient lives on an inner span instead.
  const label =
    !asChild && (variant === "default" || variant === undefined) ? (
      <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        {children}
      </span>
    ) : (
      children
    );

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {label}
    </Comp>
  );
});

export { Button, buttonVariants };
