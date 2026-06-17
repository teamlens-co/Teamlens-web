from __future__ import annotations

import os
from typing import Any

import posthog


def _init_client() -> posthog.Client | None:
    api_key = os.getenv("POSTHOG_API_KEY", "")
    host = os.getenv("POSTHOG_HOST", "")
    if not api_key or not host:
        return None
    client = posthog.Client(
        api_key=api_key,
        host=host,
        on_error=lambda status, msg: None,
    )
    return client


_client: posthog.Client | None = _init_client()


def capture(distinct_id: str, event: str, properties: dict[str, Any] | None = None) -> None:
    if _client is None:
        return
    _client.capture(distinct_id=distinct_id, event=event, properties=properties or {})


def shutdown() -> None:
    if _client is not None:
        _client.shutdown()
