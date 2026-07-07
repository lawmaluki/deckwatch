import { riskLabel } from "@/lib/stats";

export function RiskGauge({ score }: { score: number }) {
  const { label, color } = riskLabel(score);
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative flex h-[120px] w-[120px] items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#1c2330" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-semibold text-foreground">{score}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color }}>
          {label} Risk
        </span>
      </div>
    </div>
  );
}
