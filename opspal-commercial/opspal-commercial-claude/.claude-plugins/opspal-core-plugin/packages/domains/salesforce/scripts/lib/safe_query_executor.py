from __future__ import annotations
import json
import subprocess
import time
from typing import List, Dict, Optional

from .error_prevention import needs_tooling_api, deduplicate_name_aliases


class SafeQueryExecutorPy:
    def __init__(self, org_alias: str, retries: int = 2, backoff: float = 0.75):
        self.org_alias = org_alias
        self.retries = retries
        self.backoff = backoff

    def run(self, query: str, description: str = "", paginate: bool = False, batch_size: int = 2000) -> List[Dict]:
        q = deduplicate_name_aliases(query)
        all_records: List[Dict] = []
        offset = 0
        attempt = 0

        while True:
            paged_q = q if not paginate else f"{q} LIMIT {batch_size} OFFSET {offset}"
            res = self._execute_once(paged_q, description)
            all_records.extend(res)

            if not paginate or len(res) < batch_size:
                break
            offset += batch_size

        return all_records

    def _execute_once(self, query: str, description: str = "") -> List[Dict]:
        attempt = 0
        last_err: Optional[Exception] = None
        while attempt <= self.retries:
            try:
                cmd = ['sf', 'data', 'query', '--query', query]
                if needs_tooling_api(query):
                    cmd.append('--use-tooling-api')
                cmd += ['--target-org', self.org_alias, '--json']

                result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
                if result.returncode == 0:
                    data = json.loads(result.stdout)
                    return data.get('result', {}).get('records', []) or []

                raise RuntimeError(result.stderr.strip() or 'SF CLI query failed')
            except Exception as e:
                last_err = e
                # log compact error pattern
                try:
                    from pathlib import Path
                    import json as _json
                    from datetime import datetime as _dt, timezone as _tz
                    log_dir = Path.cwd() / '.claude' / 'logs'
                    log_dir.mkdir(parents=True, exist_ok=True)
                    log_path = log_dir / 'query-errors.jsonl'
                    entry = {
                        'ts': _dt.now(_tz.utc).isoformat(),
                        'org': self.org_alias,
                        'desc': description,
                        'query': (query[:240] + '...') if len(query) > 240 else query,
                        'error': str(e)
                    }
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(_json.dumps(entry) + "\n")
                except Exception:
                    pass
                time.sleep(self.backoff * (attempt + 1))
                attempt += 1
        # Exhausted
        if last_err:
            raise last_err
        return []
