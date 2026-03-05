#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timezone


PATTERNS = [
    ("COUNT(DISTINCT)", "COUNT\(DISTINCT", "Use GROUP BY + row count or AggregateResult size; see shared audit/data-pulse.sh."),
    ("CASE in aggregate", "COUNT( CASE|SUM( CASE|AVG( CASE", "Use formula field + SUM or split WHERE queries."),
    ("Tooling object without flag", "sObject type 'ValidationRule'|not supported|INVALID_TYPE", "Append --use-tooling-api (auto-detected by SafeQueryExecutor)."),
    ("Duplicate alias: Name", "duplicate alias: Name|DUPLICATE_ALIAS", "Alias relationship Name fields (e.g., CreatedBy.Name CreatedByName)."),
    ("Datetime tz mismatch", "offset-naive|naive and aware|fromisoformat", "Use parse_sf_datetime() to normalize to tz-aware UTC."),
    ("Date arithmetic not supported", "DATEADD|DATEDIFF|DATE_SUB|DATE_ADD", "Use SOQL date literals or compute deltas in code."),
]

SUGGESTIONS = {
    "COUNT(DISTINCT)": "Prefer `SELECT field FROM ...` then unique count; or AggregateResult size.",
    "CASE in aggregate": "Create IF(...,1,0) formula and SUM; or run separate WHERE queries.",
    "Tooling object without flag": "Use --use-tooling-api; SafeQueryExecutor adds this automatically.",
    "Duplicate alias: Name": "Append aliases: `Relation.Name RelationName`.",
    "Datetime tz mismatch": "Use scripts/lib/error_prevention.parse_sf_datetime().",
    "Date arithmetic not supported": "Use LAST_N_DAYS:n, NEXT_N_MONTHS:n, etc.; or compute in code.",
}


def main():
    log_path = Path('.claude/logs/query-errors.jsonl')
    if not log_path.exists():
        print("No query-errors.jsonl found; nothing to report.")
        return

    rows = []
    with log_path.open('r', encoding='utf-8') as f:
        for line in f:
            try:
                rows.append(json.loads(line))
            except Exception:
                continue

    counts = Counter()
    examples = defaultdict(list)
    for r in rows:
        err = (r.get('error') or '').lower()
        for title, regex_any, _ in PATTERNS:
            import re
            if re.search(regex_any, r.get('error', ''), flags=re.IGNORECASE):
                counts[title] += 1
                if len(examples[title]) < 3:
                    examples[title].append({
                        'desc': r.get('desc'),
                        'query': r.get('query'),
                        'error': r.get('error'),
                        'ts': r.get('ts')
                    })

    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    out_dir = Path('reports')
    out_dir.mkdir(parents=True, exist_ok=True)
    out_md = out_dir / f'KNOWN_FIXES_REPORT_{ts}.md'

    with out_md.open('w', encoding='utf-8') as w:
        w.write(f"# Known Fixes Report\n\nDate: {ts}\n\n")
        if not counts:
            w.write("No errors logged in .claude/logs/query-errors.jsonl.\n")
        else:
            total = sum(counts.values())
            w.write(f"Total error entries: {total}\n\n")
            for title, count in counts.most_common():
                suggestion = SUGGESTIONS.get(title, "See docs.")
                w.write(f"## {title} — {count}\n\n")
                w.write(f"Suggested fix: {suggestion}\n\n")
                for ex in examples[title]:
                    w.write("- Example:\n")
                    w.write(f"  - ts: {ex.get('ts')}\n")
                    w.write(f"  - desc: {ex.get('desc')}\n")
                    w.write(f"  - error: {ex.get('error')}\n")
                    q = ex.get('query') or ''
                    if len(q) > 200:
                        q = q[:200] + '...'
                    w.write(f"  - query: `{q}`\n\n")
            w.write("\n---\n\nReferences: \n- Shared Tools: platforms/SFDC/shared/README.md\n- Error Catalog: platforms/SFDC/docs/ERROR_CATALOG.md\n")

    print(f"Report written to: {out_md}")


if __name__ == '__main__':
    main()

