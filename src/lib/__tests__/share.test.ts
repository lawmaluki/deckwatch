import { describe, expect, it } from "vitest";
import { incidentPath, incidentShareText, incidentShareUrl } from "@/lib/share";

describe("incident sharing", () => {
  it("builds the incident's own path, escaping the id", () => {
    expect(incidentPath("ing-1a2b3c4d")).toBe("/incident/ing-1a2b3c4d");
    expect(incidentPath("a/b c")).toBe("/incident/a%2Fb%20c");
  });

  it("makes the link absolute against the given origin", () => {
    expect(incidentShareUrl("ing-1", "https://preview.example.app/")).toBe(
      "https://preview.example.app/incident/ing-1"
    );
    expect(incidentShareUrl("ing-1")).toMatch(/^https?:\/\/[^/]+\/incident\/ing-1$/);
  });

  it("names the place, so the text stands alone without a preview", () => {
    expect(
      incidentShareText({ title: "Lorry overturns", locationName: "Salgaa", county: "Nakuru" })
    ).toBe("Lorry overturns — Salgaa, Nakuru County");
  });
});
