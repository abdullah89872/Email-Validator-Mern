"""Batch orchestration: bounded concurrency over a list of emails.

Unique domains are resolved once and cached, so validating 10k emails from a
handful of domains does not trigger 10k DNS lookups.
"""
from __future__ import annotations

import asyncio

from ..config import settings
from .dns_service import warm_cache
from .validator import validate_one


def _domain_of(email: str) -> str:
    return email.rsplit("@", 1)[-1].strip().lower() if "@" in email else ""


async def validate_batch(emails: list[str]) -> list[dict]:
    """Validate a batch with controlled concurrency and a pre-warmed DNS cache."""
    if not emails:
        return []

    # Pre-resolve unique domains concurrently (bounded), which also warms the
    # cache used inside validate_one.
    try:
        await warm_cache([_domain_of(e) for e in emails])
    except Exception:
        # A cache-warm failure must never fail the batch; validate_one will
        # retry lookups on its own and can return UNKNOWN.
        pass

    limit = max(1, settings["max_concurrency"])
    semaphore = asyncio.Semaphore(limit)

    async def _run(email: str) -> dict:
        async with semaphore:
            try:
                return await validate_one(email)
            except Exception as exc:  # defensive: never lose a row
                return {
                    "email": email,
                    "normalized": email.strip().lower(),
                    "status": "UNKNOWN",
                    "syntaxValid": False,
                    "domainValid": False,
                    "mxFound": False,
                    "disposable": False,
                    "roleAccount": False,
                    "mailboxVerification": "not_checked",
                    "reasons": [f"Validator error: {type(exc).__name__}: {exc}"],
                    "checkedAt": "",
                }

    return list(await asyncio.gather(*(_run(e) for e in emails)))


async def validate_batch_chunked(emails: list[str], chunk_size: int | None = None) -> list[dict]:
    """Validate in fixed-size sub-chunks so peak memory stays bounded."""
    size = chunk_size or settings["batch_size"]
    results: list[dict] = []
    for i in range(0, len(emails), size):
        results.extend(await validate_batch(emails[i:i + size]))
    return results
