import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { MOCK_INCIDENTS } from "@/lib/data/mock-incidents";
import { COUNTIES } from "@/lib/data/counties";
import { HOTSPOTS } from "@/lib/data/hotspots";

// Exports the canonical seeded dataset (fixed timestamps anchored to
// DATA_REFERENCE_TIME) so the FastAPI backend seeds byte-identical data
// rather than re-implementing the TS PRNG. Run: npm run export-seed
const outDir = resolve(process.cwd(), "backend/fixtures");
mkdirSync(outDir, { recursive: true });

writeFileSync(
  resolve(outDir, "incidents.json"),
  JSON.stringify(MOCK_INCIDENTS, null, 2) + "\n"
);
writeFileSync(
  resolve(outDir, "counties.json"),
  JSON.stringify(COUNTIES, null, 2) + "\n"
);
writeFileSync(
  resolve(outDir, "hotspots.json"),
  JSON.stringify(HOTSPOTS, null, 2) + "\n"
);

console.log(
  `Wrote ${MOCK_INCIDENTS.length} incidents, ${COUNTIES.length} counties, ` +
    `and ${HOTSPOTS.length} hotspots to ${outDir}`
);
