#!/usr/bin/env bash
set -e
PID_FILE=populate_attendees.pid
while kill -0 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null; do sleep 10; done
. .venv/bin/activate
python -u salesloft_export.py --out ./out --enrich-from-lookups --no-enrich --progress-every 1000 > local_enrich_from_lookups.log 2>&1 || true
echo 'LOCAL_MATCH_DONE' >> local_enrich_from_lookups.log || true
