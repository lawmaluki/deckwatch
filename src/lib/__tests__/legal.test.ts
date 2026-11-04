import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL } from "@/lib/constants";
import { reportProblemHref } from "@/lib/legal";

describe("reportProblemHref", () => {
  it("opens an email to the contact address with the incident identified", () => {
    const href = reportProblemHref({ id: "ing-1a2b3c4d", title: "Bus & lorry collide near Mtito Andei" });
    const url = new URL(href);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(CONTACT_EMAIL);
    expect(url.searchParams.get("subject")).toBe("Problem with incident ing-1a2b3c4d");
    const body = url.searchParams.get("body")!;
    // An "&" in a headline must not cut the body short.
    expect(body).toContain("Incident: Bus & lorry collide near Mtito Andei");
    expect(body).toContain("/api/incidents/ing-1a2b3c4d");
  });
});
