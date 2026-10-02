"""Runtime configuration for the EmailClean AI validation service."""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


def _str_list(name: str) -> list[str]:
    return [item.strip() for item in (os.getenv(name, "") or "").split(",") if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> dict:
    return {
        "port": _int("PORT", 8000),
        "dns_timeout": _float("DNS_TIMEOUT", 3.0),
        "max_concurrency": _int("MAX_CONCURRENCY", 50),
        "batch_size": _int("BATCH_SIZE", 100),
        "dns_cache_ttl": _int("DNS_CACHE_TTL", 600),
        "max_emails_per_request": _int("MAX_EMAILS_PER_REQUEST", 1000),
        # Empty means "use the OS-configured resolvers". Set a comma separated
        # list to override, which is useful when a LAN resolver is unreachable
        # and dnspython's rotation would otherwise fail roughly half the lookups.
        "dns_nameservers": _str_list("DNS_NAMESERVERS"),
    }


settings = get_settings()
