import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted focus-visible:ring-ring inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-foreground transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-foreground data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[1.25rem] data-[state=unchecked]:translate-x-0.5"
        )}
      />
    </SwitchPrimitive.Root>
  );
});

export { Switch };
