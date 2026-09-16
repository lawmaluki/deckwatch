import clsx from "clsx";

/** Placeholder block for route-level loading states. */
export function Shimmer({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-surface-raised", className)} />;
}

/** The page chrome every data route shares, so a skeleton lands its heading in
 * the same place the real page will and the swap doesn't jump. */
export function PageSkeletonFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Shimmer className="mb-2 h-6 w-56" />
          <Shimmer className="h-4 w-80 max-w-full" />
        </div>
        {children}
      </div>
    </div>
  );
}
