"use client";

import { createContext, useCallback, useContext, useState } from "react";

// The report's selected county, shared by the map, the county table and the
// "Your county" brief, which sit in different sections of the page.
const SelectionContext = createContext<{
  county: string;
  select: (county: string, opts?: { scroll?: boolean }) => void;
} | null>(null);

export const COUNTY_BRIEF_ID = "your-county";

export function ReportSelectionProvider({
  initialCounty,
  children,
}: {
  initialCounty: string;
  children: React.ReactNode;
}) {
  const [county, setCounty] = useState(initialCounty);
  const select = useCallback((next: string, opts?: { scroll?: boolean }) => {
    setCounty(next);
    if (opts?.scroll) {
      document.getElementById(COUNTY_BRIEF_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);
  return <SelectionContext.Provider value={{ county, select }}>{children}</SelectionContext.Provider>;
}

export function useReportSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useReportSelection must be used inside ReportSelectionProvider");
  return ctx;
}
