#!/usr/bin/env sh
set -e

# Wait for Postgres, then initialize schema, seed, and serve.
python - <<'PY'
import os, time
import psycopg

url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
attempts = 8
for attempt in range(attempts):
    try:
        psycopg.connect(url, connect_timeout=10).close()
        print("database is ready")
        break
    except Exception as exc:
        # A pooled host (e.g. Supabase) can rate-limit or circuit-break after
        # a burst of failed connections, so a bad DATABASE_URL should fail
        # fast rather than hammer it with retries every second.
        print(f"waiting for database... ({exc})")
        time.sleep(5)
else:
    raise SystemExit(f"database not reachable after {attempts} attempts")
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
