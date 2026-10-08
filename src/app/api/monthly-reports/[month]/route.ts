import type { NextRequest } from "next/server";
import { getMonthlyReport, isMonth } from "@/lib/monthly-reports";
import { API_CACHE_SECONDS, apiJson } from "@/lib/api-response";

// One monthly safety report, as rendered at /dashboard/reports/{month}.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!isMonth(month)) {
    return apiJson({ error: `Invalid month "${month}". Expected YYYY-MM.` }, { status: 400 });
  }
  const report = await getMonthlyReport(month);
  if (!report) return apiJson({ error: "Report not found" }, { status: 404 });
  return apiJson(report, { cacheSeconds: API_CACHE_SECONDS.report });
}
