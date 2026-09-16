import { Shimmer, PageSkeletonFrame } from "@/components/layout/Shimmer";

export default function CountiesLoading() {
  return (
    <PageSkeletonFrame>
      <div className="space-y-1.5">
        {Array.from({ length: 12 }, (_, i) => (
          <Shimmer key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </PageSkeletonFrame>
  );
}
