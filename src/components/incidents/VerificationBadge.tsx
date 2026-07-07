import { VERIFICATION_CONFIG } from "@/lib/data/categories";
import type { VerificationStatus } from "@/lib/types";
import { BadgeCheck, CircleHelp, ShieldCheck, XCircle } from "lucide-react";

const ICONS: Record<VerificationStatus, typeof BadgeCheck> = {
  verified: ShieldCheck,
  likely_true: BadgeCheck,
  unconfirmed: CircleHelp,
  false_report: XCircle,
};

export function VerificationBadge({
  status,
  score,
}: {
  status: VerificationStatus;
  score?: number;
}) {
  const config = VERIFICATION_CONFIG[status];
  const Icon = ICONS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{ borderColor: `${config.color}55`, backgroundColor: `${config.color}1a`, color: config.color }}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
      {typeof score === "number" && <span className="opacity-70">· {score}%</span>}
    </span>
  );
}
