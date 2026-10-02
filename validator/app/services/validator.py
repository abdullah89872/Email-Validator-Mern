"""Core validation pipeline for a single email address.

Classification rules
--------------------
INVALID  syntax broken, or the domain does not exist (definitive NXDOMAIN),
         or the domain has neither MX nor A records.
RISKY    syntactically fine and the domain resolves, but the address is a
         disposable domain or a role-based mailbox, or the domain is a
         subdomain of a known disposable provider.
VALID    syntax fine, domain resolves, has MX (or falls back to A), and is
         neither disposable nor role-based.
UNKNOWN  DNS was inconclusive (timeout/servfail) so we refuse to guess.

mailboxVerification is always "not_checked": MX records only prove the domain
accepts mail, not that the mailbox exists. We do no SMTP probing.
"""
from __future__ import annotations

from datetime import datetime, timezone

from email_validator import (
    EmailNotValidError,
    validate_email as _email_validator,
)

from ..data.disposable_domains import is_disposable
from ..data.role_accounts import is_role_account
from .dns_service import lookup_domain

# Behavior note: we deliberately never claim mailbox existence.
MAILBOX_VERIFICATION = "not_checked"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def validate_one(raw: str) -> dict:
    """Validate a single email address and return a ValidationResult dict."""
    original = (raw or "").strip()
    reasons: list[str] = []
    checked_at = _now()

    base = {
        "email": original,
        "normalized": "",
        "syntaxValid": False,
        "domainValid": False,
        "mxFound": False,
        "disposable": False,
        "roleAccount": False,
        "mailboxVerification": MAILBOX_VERIFICATION,
        "reasons": reasons,
        "checkedAt": checked_at,
    }

    if not original:
        base.update(status="INVALID", reasons=["Empty value"])
        return base

    if len(original) > 254:
        base.update(status="INVALID", reasons=["Email exceeds 254 characters (RFC 5321)"])
        return base

    # --- 1. Syntax -------------------------------------------------------
    syntax_ok, normalized, syntax_err = _syntax_check(original)
    if not syntax_ok:
        base.update(status="INVALID", reasons=[f"Invalid syntax: {syntax_err}"])
        return base

    base["syntaxValid"] = True
    base["normalized"] = normalized or original.lower()

    local, _, domain = base["normalized"].partition("@")
    if not domain:
        base["status"] = "INVALID"
        reasons.append("Missing domain part")
        return base

    # --- 2. Disposable + role flags (independent of DNS) -----------------
    disposable = is_disposable(domain)
    role = is_role_account(base["normalized"])
    base["disposable"] = disposable
    base["roleAccount"] = role
    if disposable:
        reasons.append(f"Domain '{domain}' is a known disposable/temporary email provider")
    if role:
        reasons.append(f"Local part '{local}' is a role-based mailbox, not a person")

    # --- 3. DNS: domain existence + MX/A ---------------------------------
    dns_result = await lookup_domain(domain)

    if dns_result.inconclusive:
        # We could not resolve either way — refuse to guess.
        base.update(status="UNKNOWN", domainValid=False, mxFound=False)
        reasons.append(f"DNS lookup inconclusive for '{domain}' (timeout or server failure)")
        base["reasons"] = reasons
        return base

    if not dns_result.resolvable and not dns_result.has_mx and not dns_result.has_a:
        base.update(status="INVALID", domainValid=False, mxFound=False)
        reasons.append(f"Domain '{domain}' does not resolve (no MX or A records)")
        base["reasons"] = reasons
        return base

    base["domainValid"] = True
    base["mxFound"] = dns_result.has_mx

    if dns_result.has_mx:
        reasons.append(f"MX records found for '{domain}'")
    elif dns_result.has_a:
        # No MX: RFC 5321 fallback to the A record. Weaker signal, hence RISKY.
        reasons.append(f"No MX records for '{domain}'; fell back to A record")
    else:
        base.update(status="INVALID", domainValid=False, mxFound=False)
        reasons.append(f"Domain '{domain}' has neither MX nor A records")
        base["reasons"] = reasons
        return base

    # --- 4. Classify -----------------------------------------------------
    if disposable or role:
        # Domain is fine but the address is low quality for outreach.
        base["status"] = "RISKY"
    elif not dns_result.has_mx and dns_result.has_a:
        base["status"] = "RISKY"
        reasons.append("Domain accepts mail by A record only (no explicit MX)")
    else:
        base["status"] = "VALID"
        reasons.append(
            "Syntax and domain checks passed. MX presence does NOT prove the mailbox exists."
        )

    base["reasons"] = reasons
    return base


def _syntax_check(raw: str) -> tuple[bool, str | None, str | None]:
    """Return (ok, normalized_email, error_reason)."""
    try:
        info = _email_validator(
            raw,
            check_deliverability=False,  # we do DNS ourselves, with caching
            allow_smtputf8=False,
            allow_empty_local=False,
        )
        # `normalized` only lowercases the domain; mail providers treat the
        # local part case-insensitively in practice, and downstream dedupe keys
        # off `normalized`, so "ALICE@x.com" must collapse onto "alice@x.com".
        return True, (info.normalized or raw).lower(), None
    except EmailNotValidError as exc:
        return False, None, str(exc)
