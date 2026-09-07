"""Shared HTTP client.

Every source hits a public API with its own etiquette rules. Centralising the
client means the User-Agent, timeout, retry and rate-limit policy are set once
and can't drift per-source.

SEC in particular *requires* a descriptive User-Agent with contact info and
asks for <=10 req/sec; violating that gets an IP blocked.
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

CONTACT = os.environ.get("TRACKER_CONTACT_EMAIL", "startup-tracker@example.com")
USER_AGENT = f"startup-tracker/0.1 ({CONTACT})"

DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class RateLimiter:
    """Simple monotonic-clock spacer: guarantees >= ``interval`` between calls."""

    def __init__(self, per_second: float) -> None:
        self.interval = 1.0 / per_second if per_second > 0 else 0.0
        self._last = 0.0

    def wait(self) -> None:
        if not self.interval:
            return
        elapsed = time.monotonic() - self._last
        if elapsed < self.interval:
            time.sleep(self.interval - elapsed)
        self._last = time.monotonic()


def client(**kwargs: Any) -> httpx.Client:
    headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}
    headers.update(kwargs.pop("headers", {}))
    return httpx.Client(headers=headers, timeout=DEFAULT_TIMEOUT, follow_redirects=True, **kwargs)


def get_with_retry(
    c: httpx.Client,
    url: str,
    *,
    attempts: int = 3,
    backoff: float = 2.0,
    limiter: RateLimiter | None = None,
    **kwargs: Any,
) -> httpx.Response | None:
    """GET with exponential backoff. Returns None if all attempts fail.

    Sources are best-effort: one flaky endpoint must not abort a whole run.
    """
    for attempt in range(attempts):
        if limiter:
            limiter.wait()
        try:
            resp = c.get(url, **kwargs)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"retryable status {resp.status_code}", request=resp.request, response=resp
                )
            return resp
        except (httpx.HTTPError, httpx.HTTPStatusError):
            if attempt == attempts - 1:
                return None
            time.sleep(backoff**attempt)
    return None
