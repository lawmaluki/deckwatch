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
  const hasScore = typeof score === "number";

  return (
    <span
      // The number is a source-confidence score, not a probability that the
      // event occurred — say so on hover rather than leaving "68%" to imply it.
      title={
        hasScore
          ? `${config.blurb}. Source confidence ${score}%: how much independent ` +
            `corroboration this report has. Outlets under one owner count once.`
          : config.blurb
      }
      className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-[11px] font-medium"
      style={{
        borderColor: `${config.color}55`,
        backgroundColor: `${config.color}1a`,
        color: config.color,
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {config.label}
      {hasScore && (
        <span className="ml-0.5 flex items-center gap-1.5 rounded-full bg-black/25 px-1.5 py-0.5">
          {/* Meter makes the score legible at a glance; the number alone reads
              as a precision the score doesn't have. */}
          <span
            aria-hidden
            className="h-1 w-6 overflow-hidden rounded-full bg-white/15"
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${score}%`, backgroundColor: config.color }}
            />
          </span>
          <span className="tabular-nums opacity-90">{score}%</span>
        </span>
      )}
    </span>
  );
}
