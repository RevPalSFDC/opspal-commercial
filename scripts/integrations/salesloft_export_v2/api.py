from __future__ import annotations

import time
import random
from typing import Any, Dict, Optional, Iterable
import requests

BASE_URL = "https://api.salesloft.com/v2"
USER_AGENT = "salesloft-exporter-v2/1.0"


class RateLimiter:
    def __init__(self, rps: float = 5.0):
        self.rps = max(1.0, rps)
        self.min_interval = 1.0 / self.rps
        self._last = 0.0

    def acquire(self):
        now = time.monotonic()
        wait = self.min_interval - (now - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()


class SalesloftClient:
    def __init__(self, token: str, rps: float = 5.0, timeout: int = 30):
        self.session = requests.Session()
        self.token = token
        self.timeout = timeout
        self.rl = RateLimiter(rps=rps)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }

    def request(self, method: str, path_or_url: str, *, params: Optional[Dict[str, Any]] = None, absolute: bool = False) -> requests.Response:
        url = path_or_url if absolute else f"{BASE_URL}{path_or_url}"
        last_err = None
        for attempt in range(7):
            self.rl.acquire()
            try:
                resp = self.session.request(method, url, headers=self._headers(), params=params, timeout=self.timeout)
            except Exception as e:
                last_err = e
                self._sleep(attempt, None)
                continue

            if resp.status_code == 429 or 500 <= resp.status_code < 600:
                ra = resp.headers.get("Retry-After")
                self._sleep(attempt + 1, ra)
                last_err = Exception(f"HTTP {resp.status_code} on {method} {url}")
                continue
            return resp
        if last_err:
            raise last_err
        raise RuntimeError("Request failed after retries")

    def get_json(self, path: str, *, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        resp = self.request("GET", path, params=params)
        if resp.status_code == 404:
            return {"data": None}
        resp.raise_for_status()
        return resp.json()

    def page(self, path: str, *, params: Optional[Dict[str, Any]] = None) -> Iterable[Dict[str, Any]]:
        params = dict(params or {})
        params.setdefault("per_page", 100)
        page = 1
        while True:
            params["page"] = page
            payload = self.get_json(path, params=params)
            items = payload.get("data") or []
            for it in items:
                yield it
            meta = payload.get("metadata") or {}
            paging = meta.get("paging") or {}
            next_page = paging.get("next_page")
            if not next_page or not items:
                break
            page = int(next_page)

    def _sleep(self, attempt: int, retry_after: Optional[str]):
        if retry_after:
            try:
                delay = float(retry_after)
            except Exception:
                delay = min(60.0, 2 ** attempt)
        else:
            delay = min(60.0, 2 ** attempt)
        delay *= 0.8 + 0.4 * random.random()
        time.sleep(delay)

