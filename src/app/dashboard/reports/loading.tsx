import { Shimmer, PageSkeletonFrame } from "@/components/layout/Shimmer";

export default function MonthlyReportLoading() {
  return (
    <PageSkeletonFrame>
      <Shimmer className="mb-4 h-4 w-40 rounded" />
      <Shimmer className="mb-3 h-14 w-2/3 rounded-lg" />
      <Shimmer className="mb-8 h-5 w-1/2 rounded" />
      <Shimmer className="mb-10 h-24 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Shimmer className="h-80 rounded-2xl" />
        <Shimmer className="h-80 rounded-2xl" />
      </div>
    </PageSkeletonFrame>
  );
}
