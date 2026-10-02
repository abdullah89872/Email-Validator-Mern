"""Pydantic request/response models for the validation service."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Status = Literal["VALID", "INVALID", "RISKY", "UNKNOWN"]


class BatchRequest(BaseModel):
    emails: list[str] = Field(..., description="Email addresses to validate.")

    @field_validator("emails")
    @classmethod
    def _limit_and_coerce(cls, value: list[str]) -> list[str]:
        if not isinstance(value, list):
            raise ValueError("emails must be a list of strings")
        cleaned: list[str] = []
        for item in value:
            if item is None:
                continue
            cleaned.append(str(item).strip())
        return cleaned


class ValidationResult(BaseModel):
    email: str
    normalized: str = ""
    status: Status
    syntaxValid: bool = False
    domainValid: bool = False
    mxFound: bool = False
    disposable: bool = False
    roleAccount: bool = False
    # Always "not_checked" unless a mailbox-verification provider is wired up.
    mailboxVerification: str = "not_checked"
    reasons: list[str] = []
    checkedAt: str = ""


class BatchResponse(BaseModel):
    count: int
    results: list[ValidationResult]


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    python: str
    checks: dict[str, Optional[str]]
