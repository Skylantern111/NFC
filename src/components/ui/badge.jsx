import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Neo-brutalist badges: small solid blocks with a 2px black frame.
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border-2 border-foreground px-2 py-0.5 text-xs font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:border-destructive overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-card text-foreground",
        destructive: "bg-destructive-soft text-foreground",
        outline: "bg-background text-foreground",
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
