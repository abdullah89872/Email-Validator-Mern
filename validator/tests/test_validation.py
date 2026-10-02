"""Unit tests for the EmailClean AI validation service.

Run from the `validator/` directory:

    python -m pytest -q

Syntax-level tests run offline. DNS-dependent tests are marked `dns` and are
skipped automatically when no resolver is reachable, so the suite is stable in
CI/sandboxed environments.
"""
from __future__ import annotations

import asyncio

import pytest

from app.services.validator import validate_one
from app.services.batch import validate_batch
from app.data.disposable_domains import is_disposable
from app.data.role_accounts import is_role_account


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Syntax handling
# ---------------------------------------------------------------------------

class TestSyntax:
    def test_valid_email_is_valid(self):
        result = run(validate_one("alice@example.com"))
        assert result["syntaxValid"] is True
        assert result["email"] == "alice@example.com"
        assert result["normalized"] == "alice@example.com"

    @pytest.mark.parametrize("bad", [
        "not-an-email",
        "missing-at-sign.com",
        "@no-local.com",
        "spaces in@example.com",
        "double@@example.com",
        "trailing-dot@example.",
        "",
    ])
    def test_invalid_syntax_is_invalid(self, bad):
        result = run(validate_one(bad))
        assert result["status"] == "INVALID", f"{bad} should be INVALID"
        assert result["syntaxValid"] is False
        assert result["reasons"], "an INVALID result must carry reasons"

    def test_oversized_email_is_invalid(self):
        local = "a" * 300
        result = run(validate_one(f"{local}@example.com"))
        assert result["status"] == "INVALID"
        assert any("254" in r for r in result["reasons"])

    def test_mailbox_verification_is_always_not_checked(self):
        result = run(validate_one("alice@example.com"))
        assert result["mailboxVerification"] == "not_checked"

    def test_uppercase_is_normalized_to_lowercase(self):
        result = run(validate_one("ALICE@EXAMPLE.COM"))
        assert result["normalized"] == "alice@example.com"


# ---------------------------------------------------------------------------
# Role accounts and disposable domains (pure functions)
# ---------------------------------------------------------------------------

class TestFlags:
    @pytest.mark.parametrize("addr", [
        "info@example.com", "support@x.io", "admin@site.org",
        "noreply@notifications.app", "sales1@corp.com", "billing@shop.dev",
    ])
    def test_role_accounts_detected(self, addr):
        assert is_role_account(addr) is True, addr

    @pytest.mark.parametrize("addr", [
        "alice@example.com", "john.doe@company.co", "bob+tag@x.io",
    ])
    def test_personal_accounts_not_role(self, addr):
        assert is_role_account(addr) is False, addr

    @pytest.mark.parametrize("domain", [
        "mailinator.com", "tempmail.com", "10minutemail.com", "yopmail.com",
        "guerrillamail.com",
    ])
    def test_disposable_domains(self, domain):
        assert is_disposable(domain) is True, domain

    @pytest.mark.parametrize("domain", [
        "example.com", "gmail.com", "company.co.uk",
    ])
    def test_regular_domains_not_disposable(self, domain):
        assert is_disposable(domain) is False, domain


# ---------------------------------------------------------------------------
# Classification (DNS-backed) — skipped when offline
# ---------------------------------------------------------------------------

def _dns_available() -> bool:
    """Probe whether MX resolution works so tests can self-skip offline.

    This must exercise the same code path the validator uses (dnspython),
    not ``socket.getaddrinfo``. The OS resolver and dnspython can disagree:
    on Windows the stub resolver may answer while direct DNS queries to the
    configured nameservers are blocked, which would make these tests fail
    instead of skipping.
    """
    import asyncio

    from app.services.dns_service import lookup_domain

    try:
        result = asyncio.run(lookup_domain("example.com"))
    except Exception:
        return False
    return not result.inconclusive and bool(result.mx_hosts)


needs_dns = pytest.mark.skipif(
    not _dns_available(),
    reason="No DNS resolver reachable — skipping network-dependent checks.",
)


@needs_dns
class TestClassification:
    def test_resolved_domain_with_mx_is_valid(self):
        # example.com has MX records and is not disposable/role-based.
        result = run(validate_one("someone@example.com"))
        assert result["status"] == "VALID", result["reasons"]
        assert result["domainValid"] is True
        assert result["mxFound"] is True
        assert result["reasons"]

    def test_disposable_domain_is_risky_not_invalid(self):
        result = run(validate_one("user@mailinator.com"))
        assert result["status"] == "RISKY", result["reasons"]
        assert result["disposable"] is True
        assert result["domainValid"] is True

    def test_role_account_is_risky(self):
        result = run(validate_one("info@example.com"))
        assert result["status"] == "RISKY", result["reasons"]
        assert result["roleAccount"] is True

    def test_nonexistent_domain_is_invalid(self):
        result = run(validate_one(
            "user@thisdomainshouldnotexist-xyzzy-98765.example"
        ))
        assert result["status"] == "INVALID", result["reasons"]
        assert result["domainValid"] is False
        assert any("resolve" in r.lower() or "records" in r.lower() for r in result["reasons"])

    def test_never_claims_mailbox_exists(self):
        result = run(validate_one("someone@example.com"))
        assert result["mailboxVerification"] == "not_checked"
        joined = " ".join(result["reasons"]).lower()
        assert "mailbox exists" in joined or "mx" in joined


# ---------------------------------------------------------------------------
# Batch behaviour
# ---------------------------------------------------------------------------

class TestBatch:
    def test_batch_returns_one_result_per_input_in_order(self):
        emails = [
            "alice@example.com",
            "not-an-email",
            "info@example.com",
        ]
        results = run(validate_batch(emails))
        assert len(results) == len(emails)
        assert [r["email"] for r in results] == emails

    def test_empty_batch_returns_empty(self):
        assert run(validate_batch([])) == []

    @needs_dns
    def test_batch_statuses_are_from_allowed_set(self):
        allowed = {"VALID", "INVALID", "RISKY", "UNKNOWN"}
        emails = [
            "alice@example.com",
            "broken@@example.com",
            "info@example.com",
            "user@thisdomainshouldnotexist-xyzzy-98765.example",
        ]
        results = run(validate_batch(emails))
        assert {r["status"] for r in results} <= allowed
        for r in results:
            assert r["reasons"], f"{r['email']} must include reasons"

    @needs_dns
    def test_every_result_carries_required_fields(self):
        results = run(validate_batch(["alice@example.com", "junk"]))
        for r in results:
            for key in ("email", "status", "syntaxValid", "domainValid", "mxFound",
                        "disposable", "roleAccount", "mailboxVerification",
                        "reasons", "checkedAt"):
                assert key in r, f"missing {key}"
