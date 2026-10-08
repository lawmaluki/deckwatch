import { listMonthlyReports } from "@/lib/monthly-reports";
import { API_CACHE_SECONDS, apiJson } from "@/lib/api-response";

// Every published monthly safety report, newest first: a summary of each.
// Reads through the same loader as the report pages, so a report bundled with
// the app is listed even before the backend has stored it.
export async function GET() {
  const results = await listMonthlyReports();
  return apiJson({ count: results.length, results }, { cacheSeconds: API_CACHE_SECONDS.reportList });
}
