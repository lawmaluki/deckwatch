import { Shimmer, PageSkeletonFrame } from "@/components/layout/Shimmer";

export default function CountyLoading() {
  return (
    <PageSkeletonFrame>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Shimmer key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Shimmer className="h-64 rounded-2xl" />
          <Shimmer className="h-72 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Shimmer className="h-64 rounded-2xl" />
        </div>
      </div>
    </PageSkeletonFrame>
  );
}
