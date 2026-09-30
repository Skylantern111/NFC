import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef(function RadioGroup(
  { className, ...props },
  ref
) {
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
});

const RadioGroupItem = React.forwardRef(function RadioGroupItem(
  { className, ...props },
  ref
) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-slot="radio-group-item"
      className={cn(
        "border-2 border-foreground bg-card text-primary focus-visible:ring-ring aria-invalid:border-destructive aspect-square size-5 shrink-0 rounded-full outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="fill-primary text-primary absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});

export { RadioGroup, RadioGroupItem };
