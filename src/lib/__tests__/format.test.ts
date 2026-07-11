import { describe, expect, it } from "vitest";
import { formatDateTime, relativeTime } from "@/lib/format";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from "@/lib/constants";

function isoBefore(ms: number): string {
  return new Date(DATA_REFERENCE_TIME.getTime() - ms).toISOString();
}

describe("relativeTime", () => {
  it("handles each band and its boundaries", () => {
    expect(relativeTime(isoBefore(0))).toBe("just now");
    expect(relativeTime(isoBefore(30 * 1000))).toBe("just now");
    expect(relativeTime(isoBefore(MS_PER_MINUTE))).toBe("1m ago");
    expect(relativeTime(isoBefore(59 * MS_PER_MINUTE))).toBe("59m ago");
    expect(relativeTime(isoBefore(MS_PER_HOUR))).toBe("1h ago");
    expect(relativeTime(isoBefore(23 * MS_PER_HOUR))).toBe("23h ago");
    expect(relativeTime(isoBefore(MS_PER_DAY))).toBe("1d ago");
    expect(relativeTime(isoBefore(29 * MS_PER_DAY))).toBe("29d ago");
    expect(relativeTime(isoBefore(30 * MS_PER_DAY))).toBe("1mo ago");
    expect(relativeTime(isoBefore(65 * MS_PER_DAY))).toBe("2mo ago");
  });
});

describe("formatDateTime", () => {
  it("renders in Nairobi time (UTC+3)", () => {
    // 09:00 UTC → 12:00 in Africa/Nairobi
    const out = formatDateTime("2026-07-02T09:00:00Z");
    expect(out).toContain("2026");
    expect(out).toContain("Jul");
    expect(out).toMatch(/12:00/);
  });
});
