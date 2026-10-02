"""DNS helpers: A/MX lookups with timeouts and a small TTL cache.

IMPORTANT: a domain having MX (or A) records proves only that the DOMAIN is
configured to accept mail. It says nothing about whether a specific mailbox
exists. We never claim otherwise, and we never do SMTP probing here.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import dns.asyncresolver
import dns.exception
import dns.resolver

from ..config import settings

_TIMEOUT = settings["dns_timeout"]
_TTL = settings["dns_cache_ttl"]


@dataclass
class DomainDnsResult:
    domain: str
    resolvable: bool = False
    has_mx: bool = False
    has_a: bool = False
    mx_hosts: tuple[str, ...] = ()
    error: str | None = None
    # True when DNS itself failed (timeout/servfail) — we cannot decide, so
    # the caller should return UNKNOWN rather than INVALID.
    inconclusive: bool = False


# domain -> (expires_at, DomainDnsResult)
_cache: dict[str, tuple[float, DomainDnsResult]] = {}


def _make_resolver() -> dns.asyncresolver.Resolver:
    # Must be the *async* resolver: _resolve() awaits resolve(), and the
    # synchronous dns.resolver.Resolver returns an Answer that cannot be awaited.
    resolver = dns.asyncresolver.Resolver(configure=True)
    # Only override when explicitly configured; otherwise keep the OS resolvers.
    override = settings.get("dns_nameservers") or []
    if override:
        resolver.nameservers = list(override)
    resolver.timeout = _TIMEOUT
    resolver.lifetime = _TIMEOUT
    return resolver


async def _resolve(domain: str, rdtype: str) -> tuple[list[str] | None, str | None]:
    """Return (records, error). records is None when the lookup failed."""
    resolver = _make_resolver()
    try:
        answer = await resolver.resolve(domain, rdtype)
        return [str(r.exchange).rstrip(".") if rdtype == "MX" else str(r) for r in answer], None
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers) as exc:
        # Definitive "no such record" answers are not inconclusive.
        return None, type(exc).__name__
    except (dns.exception.Timeout, dns.exception.DNSException) as exc:
        return None, f"timeout:{type(exc).__name__}"
    except Exception as exc:  # pragma: no cover - defensive
        return None, f"error:{type(exc).__name__}:{exc}"


async def lookup_domain(domain: str) -> DomainDnsResult:
    """Resolve MX and A records for a domain, with caching."""
    key = domain.lower().strip(".")
    cached = _cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    mx_records, mx_err = await _resolve(key, "MX")
    a_records, a_err = await _resolve(key, "A")

    inconclusive = False
    if mx_err and mx_err.startswith(("timeout:", "error:")):
        inconclusive = True
    if a_err and a_err.startswith(("timeout:", "error:")):
        inconclusive = True
    # If everything failed for reasons other than NXDOMAIN/NoAnswer, be unsure.
    if mx_records is None and a_records is None and inconclusive:
        result = DomainDnsResult(domain=key, resolvable=False, inconclusive=True, error=mx_err or a_err)
    elif mx_records is None and a_records is None and not inconclusive:
        # Domain does not exist at all (NXDOMAIN on both).
        result = DomainDnsResult(domain=key, resolvable=False, inconclusive=False, error=mx_err or a_err)
    else:
        result = DomainDnsResult(
            domain=key,
            resolvable=True,
            has_mx=bool(mx_records),
            has_a=bool(a_records),
            mx_hosts=tuple(mx_records or ()),
            error=None if (mx_records or a_records) else (mx_err or a_err),
        )

    _cache[key] = (time.monotonic() + _TTL, result)
    return result


async def warm_cache(domains: list[str]) -> None:
    """Pre-resolve a set of unique domains concurrently (bounded)."""
    unique = list({d.lower().strip(".") for d in domains if d})
    if not unique:
        return
    semaphore = asyncio.Semaphore(settings["max_concurrency"])

    async def _one(domain: str) -> None:
        async with semaphore:
            await lookup_domain(domain)

    await asyncio.gather(*(_one(d) for d in unique))


def clear_cache() -> None:
    _cache.clear()
