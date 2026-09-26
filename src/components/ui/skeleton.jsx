import { cn } from "@/lib/utils";

// Was `bg-accent` — that token is the brand "signal" pink at 50% lightness
// (see index.css), meant for badges/highlights, not a shimmer placeholder.
// Reused here it read as a bright hot-pink flash instead of a loading
// placeholder — swapped for a dedicated light pink in both themes.
function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-pink-100 dark:bg-pink-500/10 animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
