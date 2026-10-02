"""Role-based (non-personal) mailbox local-parts.

`info@`, `admin@`, `support@` etc. address a team or function, not a person.
They are usually valid mailboxes but poor personalization targets, so they are
flagged RISKY rather than INVALID.
"""

ROLE_LOCALPARTS: frozenset[str] = frozenset(
    {
        "info", "information", "admin", "administrator", "root", "support",
        "help", "helpdesk", "contact", "sales", "marketing", "team", "staff",
        "office", "billing", "accounts", "accounting", "finance", "hr",
        "jobs", "careers", "recruit", "recruiting", "legal", "abuse",
        "postmaster", "webmaster", "hostmaster", "noreply", "no-reply",
        "donotreply", "do-not-reply", "mail", "mailer-daemon", "daemon",
        "security", "privacy", "compliance", "service", "services", "orders",
        "shipping", "support-team", "feedback", "press", "media", "partners",
        "vendor", "vendors", "procurement", "lab", "itsupport", "it",
        "system", "sysadmin", "webmaster", "trouble", "troubleticket",
        "newsletter", "subscribe", "unsubscribe", "bounce", "postmaster",
        "hostmaster", "usenet", "news", "newsletter", "PR", "promo",
        "returns", "refunds", "info2", "general", "enquiries", "inquiries",
        "service2", "notification", "notifications", "alerts", "alert",
    }
)

# Case-insensitive check on the local-part (before the "@").
def is_role_account(email: str) -> bool:
    local = email.split("@", 1)[0].strip().lower()
    if not local:
        return False
    if local in ROLE_LOCALPARTS:
        return True
    # Catch patterns like "sales1", "support-team", "info.desk".
    base = local.rstrip("0123456789")
    base = base.split(".", 1)[0].split("-", 1)[0].split("_", 1)[0]
    return base in ROLE_LOCALPARTS and base != ""
