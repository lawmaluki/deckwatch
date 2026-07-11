import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "@/lib/search";

describe("parseSearchQuery", () => {
  it("detects categories from keywords", () => {
    expect(parseSearchQuery("robbery downtown").categories).toEqual(["crime"]);
    expect(parseSearchQuery("flooding on the road").categories).toEqual(["flood"]);
  });

  it("detects multiple categories without duplicates", () => {
    const parsed = parseSearchQuery("crime and theft near a fire");
    expect(parsed.categories).toContain("crime");
    expect(parsed.categories).toContain("fire");
    expect(new Set(parsed.categories).size).toBe(parsed.categories.length);
  });

  it("detects categories from display labels", () => {
    expect(parseSearchQuery("road accident on highway").categories).toContain(
      "traffic_accident"
    );
  });

  it("detects a county by name, case-insensitively", () => {
    expect(parseSearchQuery("protests in NAIROBI").county).toBe("Nairobi");
    expect(parseSearchQuery("mombasa fires").county).toBe("Mombasa");
  });

  it("detects time ranges", () => {
    expect(parseSearchQuery("crime today").hours).toBe(24);
    expect(parseSearchQuery("floods yesterday").hours).toBe(48);
    expect(parseSearchQuery("unrest this week").hours).toBe(24 * 7);
    expect(parseSearchQuery("accidents past month").hours).toBe(24 * 30);
  });

  it("returns nulls and empty categories for unstructured text", () => {
    const parsed = parseSearchQuery("something happened");
    expect(parsed.categories).toEqual([]);
    expect(parsed.county).toBeNull();
    expect(parsed.hours).toBeNull();
    expect(parsed.freeText).toBe("something happened");
  });

  it("trims the free text", () => {
    expect(parseSearchQuery("  hello  ").freeText).toBe("hello");
  });
});
