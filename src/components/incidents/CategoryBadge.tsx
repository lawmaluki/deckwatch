import { CATEGORIES } from "@/lib/data/categories";
import type { Category } from "@/lib/types";

export function CategoryBadge({ category }: { category: Category }) {
  const config = CATEGORIES[category];
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{
        borderColor: `${config.color}55`,
        backgroundColor: `${config.color}1a`,
        color: config.color,
      }}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
