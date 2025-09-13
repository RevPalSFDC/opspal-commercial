#!/usr/bin/env bash
set -euo pipefail
OUT_DIR=${1:-./out-v2}
INTERVAL=${2:-30}
echo "[watch_v2] Monitoring $OUT_DIR every ${INTERVAL}s"
while true; do
  REP_JSON=$(python3 -m scripts.integrations.salesloft_export_v2.main --out "$OUT_DIR" report 2>/dev/null || echo '{}')
  TP=$(python3 - <<PY
import json,sys
rep=json.loads('''$REP_JSON''')
print(rep.get('transcriptions_indexed',0), rep.get('artifacts_downloaded',0), rep.get('convmeta_enriched',0), rep.get('attendees_populated',0))
PY
)
  read T A C M <<<"$TP"
  echo "[watch_v2] report: transcriptions=$T artifacts=$A convmeta=$C attendees=$M"
  if [ "$T" -gt 0 ] && [ "$A" -ge "$T" ] && [ "$C" -ge "$T" ] && [ "$M" -ge "$T" ]; then
    echo "[watch_v2] pipeline complete; running export-lookups, enrich-local, export-links"
    python3 -m scripts.integrations.salesloft_export_v2.main --out "$OUT_DIR" export-lookups || true
    python3 -m scripts.integrations.salesloft_export_v2.main --out "$OUT_DIR" enrich-local --progress-every 2000 || true
    python3 -m scripts.integrations.salesloft_export_v2.main --out "$OUT_DIR" export-links --csv "$OUT_DIR/links.csv" || true
    echo "[watch_v2] done"
    exit 0
  fi
  sleep "$INTERVAL"
done
