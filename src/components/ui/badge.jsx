import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-white/70 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm text-slate-600 dark:text-slate-300 font-semibold [a&]:hover:bg-white/70 dark:hover:bg-white/10",
        destructive:
          "border-red-200 bg-red-50/80 backdrop-blur-sm text-red-600 font-semibold [a&]:hover:bg-red-50",
        outline:
          "border-white/70 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm text-slate-600 dark:text-slate-300 font-semibold [a&]:hover:bg-white/70 dark:hover:bg-white/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
