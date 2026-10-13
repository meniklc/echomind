"""Schemas for data ingestion, normalization, conflict detection, and admin review."""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FactVerificationStatus(str, Enum):
    VERIFIED = "verified"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"


class ConflictType(str, Enum):
    DATE_MISMATCH = "date_mismatch"
    DUPLICATE = "duplicate"
    UNSUPPORTED_CLAIM = "unsupported_claim"


class ConflictItem(BaseModel):
    conflict_type: ConflictType
    description: str
    existing_value: Optional[str] = None
    proposed_value: Optional[str] = None
    severity: str = "warning"  # "warning" | "blocker"


class FactItem(BaseModel):
    id: str
    entity_type: str = Field(description="project | experience | education | skill | summary | certification")
    title: str
    content: str
    source: str = Field(description="github | linkedin_export | resume_file | manual")
    source_url_or_file: str
    import_date: str
    verification_status: FactVerificationStatus = FactVerificationStatus.PENDING_REVIEW
    metadata: Dict[str, Any] = Field(default_factory=dict)
    conflicts: List[ConflictItem] = Field(default_factory=list)


class IngestionResult(BaseModel):
    source: str
    imported_count: int
    pending_count: int
    conflicts_detected: int
    status: str
    details: List[FactItem] = Field(default_factory=list)


class GitHubSyncRequest(BaseModel):
    username: str = "meniklc"
    token: Optional[str] = None
    include_readmes: bool = True


class AdminReviewRequest(BaseModel):
    fact_id: str
    action: str = Field(description="approve | reject")
    note: Optional[str] = None


class IngestionStatusResponse(BaseModel):
    total_facts: int
    verified_facts: int
    pending_review_facts: int
    last_sync_time: Optional[str] = None
    sources_summary: Dict[str, int] = Field(default_factory=dict)
