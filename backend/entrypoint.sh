#!/usr/bin/env sh
set -e

# Wait for Postgres, then initialize schema, seed, and serve.
python - <<'PY'
import os, time
import psycopg

url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
for attempt in range(60):
    try:
        psycopg.connect(url).close()
        print("database is ready")
        break
    except Exception as exc:
        print(f"waiting for database... ({exc})")
        time.sleep(1)
else:
    raise SystemExit("database not reachable after 60s")
PY

python -m app.init_db
python -m app.seed

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
