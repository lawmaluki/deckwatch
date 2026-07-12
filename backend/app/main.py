from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import counties, incidents, reports

app = FastAPI(
    title="Deckwatch Kenya API",
    version="0.1.0",
    description="Public safety incident data for Kenya (seeded sample dataset).",
)

# Permissive CORS for local dev. In the BFF deployment the browser never calls
# this service directly (the Next.js routes proxy server-side), so this mainly
# helps direct API exploration.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incidents.router)
app.include_router(counties.router)
app.include_router(reports.router)


@app.get("/health")
def health():
    return {"status": "ok"}
