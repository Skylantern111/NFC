import { cn } from "@/lib/utils";

// Neutral, not brand-tinted: a pink placeholder read as content
// (UI_UX_IMPROVEMENT_PLAN.md DS8).
function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-slate-200/80 dark:bg-white/5 animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
