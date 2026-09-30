import { cn } from "@/lib/utils";

// Neutral placeholder block, read as content-loading, not brand-tinted.
function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
