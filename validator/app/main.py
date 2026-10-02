"""EmailClean AI — Python FastAPI validation service.

Endpoints
---------
GET  /health          service + dependency status
POST /validate/batch  validate a list of emails

This service is called by the Node/Express backend only. The React app never
talks to it directly.
"""
from __future__ import annotations

import asyncio
import platform
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .schemas import BatchRequest, BatchResponse, HealthResponse
from .services.batch import validate_batch

app = FastAPI(
    title="EmailClean AI Validation Service",
    description=(
        "Syntax, DNS/MX, disposable-domain and role-account checks. "
        "MX presence does NOT prove a mailbox exists; no SMTP probing is performed."
    ),
    version="1.0.0",
)

# The Node backend is the only intended client.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    checks: dict[str, str | None] = {}

    # DNS availability (quick, cached-friendly).
    try:
        from .services.dns_service import lookup_domain

        result = await asyncio.wait_for(lookup_domain("example.com"), timeout=5.0)
        checks["dns"] = "ok" if result.resolvable else "degraded"
    except Exception as exc:  # pragma: no cover
        checks["dns"] = f"error: {type(exc).__name__}"

    try:
        import email_validator  # noqa: F401

        checks["email_validator"] = "ok"
    except Exception as exc:  # pragma: no cover
        checks["email_validator"] = f"error: {type(exc).__name__}"

    return HealthResponse(
        status="ok",
        service="emailclean-validator",
        version="1.0.0",
        python=sys.version.split()[0],
        checks=checks,
    )


@app.post("/validate/batch", response_model=BatchResponse)
async def validate_batch_endpoint(payload: BatchRequest) -> BatchResponse:
    emails = payload.emails
    if not emails:
        return BatchResponse(count=0, results=[])
    if len(emails) > settings["max_emails_per_request"]:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Too many emails in one request "
                f"({len(emails)} > {settings['max_emails_per_request']})."
            ),
        )

    results = await validate_batch(emails)
    return BatchResponse(count=len(results), results=results)


@app.get("/")
async def root() -> dict:
    return {
        "service": "emailclean-validator",
        "endpoints": ["/health", "/validate/batch"],
        "platform": platform.system(),
    }
