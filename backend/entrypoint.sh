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

# Seed the sample dataset unless disabled (SEED_ON_START=false for a clean
# production DB that fills only from ingestion).
case "$(printf '%s' "${SEED_ON_START:-true}" | tr '[:upper:]' '[:lower:]')" in
  false|0|no) echo "SEED_ON_START disabled — skipping seed" ;;
  *) python -m app.seed ;;
esac

# Railway (and most hosts) inject $PORT; default to 8000 locally.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
