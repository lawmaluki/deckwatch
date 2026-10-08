import { openApiSpec } from "@/lib/api-spec";
import { API_CACHE_SECONDS, apiJson } from "@/lib/api-response";

// Machine-readable description of the public API (OpenAPI 3.1). Import it into
// Postman or Swagger UI, or generate a client from it.
export function GET() {
  return apiJson(openApiSpec(), { cacheSeconds: API_CACHE_SECONDS.report });
}
