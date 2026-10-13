"""Knowledge ingestion service supporting multi-format files, GitHub sync, LinkedIn export,
normalization, conflict detection, and safe re-indexing."""

from __future__ import annotations

import base64
import io
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.schemas.ingestion import (
    ConflictItem,
    ConflictType,
    FactItem,
    FactVerificationStatus,
    IngestionResult,
    IngestionStatusResponse,
)
from app.services.knowledge import (
    clear_knowledge_cache,
    get_profile,
    get_projects,
)

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"
INGESTED_FACTS_FILE = KNOWLEDGE_DIR / "ingested_facts.json"

# File patterns to exclude during sync for safety
SECRET_PATTERNS = [
    re.compile(r"(api[_-]?key|secret|password|token|bearer|private[_-]?key)\s*[:=]\s*['\"][^'\"]+['\"]", re.IGNORECASE),
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),
    re.compile(r"gsk_[a-zA-Z0-9]{32,}"),
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_text(text: str) -> str:
    """Mask potential secrets and remove binary noise."""
    sanitized = text
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub("[REDACTED_SECRET]", sanitized)
    return sanitized.strip()


# =========================================================================
# File Extractors: PDF, DOCX, TXT, Markdown, JSON
# =========================================================================

def extract_text_from_file(filename: str, content: bytes) -> str:
    """Extract clean text from supported document types."""
    lower_name = filename.lower()

    if lower_name.endswith(".pdf"):
        return _extract_from_pdf(content)
    elif lower_name.endswith(".docx"):
        return _extract_from_docx(content)
    elif lower_name.endswith(".json"):
        return _extract_from_json(content)
    else:
        # Default: TXT, Markdown, etc.
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("latin-1", errors="replace")


def _extract_from_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        text_parts = []
        for idx, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text.strip())
        return "\n\n".join(text_parts)
    except Exception as exc:
        logger.warning("pypdf extraction failed: %s", exc)
        return ""


def _extract_from_docx(content: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(content))
        text_parts = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    text_parts.append(row_text)
        return "\n\n".join(text_parts)
    except Exception as exc:
        logger.warning("python-docx extraction failed: %s", exc)
        return ""


def _extract_from_json(content: bytes) -> str:
    try:
        data = json.loads(content.decode("utf-8"))
        if isinstance(data, dict):
            # If structured profile format
            lines = []
            for k, v in data.items():
                if isinstance(v, (str, int, float)):
                    lines.append(f"{k}: {v}")
                elif isinstance(v, list):
                    lines.append(f"{k}:\n" + "\n".join(f"- {item}" for item in v))
                elif isinstance(v, dict):
                    lines.append(f"{k}: {json.dumps(v, indent=2)}")
            return "\n\n".join(lines)
        return json.dumps(data, indent=2)
    except Exception as exc:
        logger.warning("json extraction failed: %s", exc)
        return ""


# =========================================================================
# LinkedIn Export Parser
# =========================================================================

def parse_linkedin_export(text: str, filename: str) -> List[FactItem]:
    """Parse text from a LinkedIn PDF/Text export into structured facts."""
    facts: List[FactItem] = []
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    now = _now_iso()

    current_section = "general"
    section_buffers: Dict[str, List[str]] = {
        "summary": [],
        "experience": [],
        "education": [],
        "skills": [],
        "certifications": [],
    }

    section_keywords = {
        "summary": ["summary", "about"],
        "experience": ["experience", "work experience"],
        "education": ["education"],
        "skills": ["skills", "top skills"],
        "certifications": ["certifications", "licenses & certifications", "courses"],
    }

    for line in lines:
        lower = line.lower()
        matched_section = None
        for sec, kw_list in section_keywords.items():
            if lower in kw_list:
                matched_section = sec
                break

        if matched_section:
            current_section = matched_section
            continue

        if current_section in section_buffers:
            section_buffers[current_section].append(line)

    # Process summary
    if section_buffers["summary"]:
        summary_text = " ".join(section_buffers["summary"])
        facts.append(
            FactItem(
                id=f"li-summary-{int(datetime.now().timestamp())}",
                entity_type="summary",
                title="LinkedIn Profile Summary",
                content=_sanitize_text(summary_text),
                source="linkedin_export",
                source_url_or_file=filename,
                import_date=now,
                verification_status=FactVerificationStatus.PENDING_REVIEW,
            )
        )

    # Process experience entries
    exp_lines = section_buffers["experience"]
    if exp_lines:
        exp_chunks = _chunk_experience_lines(exp_lines)
        for idx, chunk in enumerate(exp_chunks):
            facts.append(
                FactItem(
                    id=f"li-exp-{idx}-{int(datetime.now().timestamp())}",
                    entity_type="experience",
                    title=chunk.get("title", f"Experience Entry {idx + 1}"),
                    content=_sanitize_text(chunk.get("description", "")),
                    source="linkedin_export",
                    source_url_or_file=filename,
                    import_date=now,
                    verification_status=FactVerificationStatus.PENDING_REVIEW,
                    metadata=chunk,
                )
            )

    # Process education entries
    edu_lines = section_buffers["education"]
    if edu_lines:
        facts.append(
            FactItem(
                id=f"li-edu-{int(datetime.now().timestamp())}",
                entity_type="education",
                title="LinkedIn Education Details",
                content=_sanitize_text("\n".join(edu_lines)),
                source="linkedin_export",
                source_url_or_file=filename,
                import_date=now,
                verification_status=FactVerificationStatus.PENDING_REVIEW,
            )
        )

    # Process skills
    skill_lines = section_buffers["skills"]
    if skill_lines:
        facts.append(
            FactItem(
                id=f"li-skills-{int(datetime.now().timestamp())}",
                entity_type="skill",
                title="LinkedIn Skills",
                content=_sanitize_text(", ".join(skill_lines)),
                source="linkedin_export",
                source_url_or_file=filename,
                import_date=now,
                verification_status=FactVerificationStatus.PENDING_REVIEW,
                metadata={"skills": skill_lines},
            )
        )

    return facts


def _chunk_experience_lines(lines: List[str]) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    current_entry: Dict[str, Any] = {"title": "", "organization": "", "description": ""}

    for line in lines:
        if " at " in line or " · " in line:
            if current_entry["title"]:
                chunks.append(current_entry)
                current_entry = {"title": "", "organization": "", "description": ""}
            current_entry["title"] = line
        else:
            if current_entry["description"]:
                current_entry["description"] += "\n" + line
            else:
                current_entry["description"] = line

    if current_entry["title"] or current_entry["description"]:
        chunks.append(current_entry)

    return chunks


# =========================================================================
# GitHub Sync: Repository Metadata & README Parsing
# =========================================================================

async def sync_github_profile(
    username: str = "meniklc",
    token: Optional[str] = None,
    include_readmes: bool = True,
) -> List[FactItem]:
    """Sync public repositories and documentation from GitHub profile."""
    facts: List[FactItem] = []
    now = _now_iso()

    headers = {
        "User-Agent": "EchoMind-Agent/1.0",
        "Accept": "application/vnd.github.v3+json",
    }
    if token and token.strip():
        headers["Authorization"] = f"Bearer {token.strip()}"

    async with httpx.AsyncClient(timeout=25.0) as client:
        # Fetch public repos
        url = f"https://api.github.com/users/{username}/repos?per_page=100&type=owner&sort=updated"
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning("GitHub API returned status %s for user %s", resp.status_code, username)
                return []
            repos = resp.json()
        except Exception as exc:
            logger.warning("GitHub sync request failed: %s", exc)
            return []

        for repo in repos:
            if repo.get("fork"):
                continue  # focus on original projects

            name = repo.get("name", "")
            desc = repo.get("description") or "No description provided."
            html_url = repo.get("html_url", "")
            language = repo.get("language")
            topics = repo.get("topics", [])
            stars = repo.get("stargazers_count", 0)
            forks = repo.get("forks_count", 0)
            updated_at = repo.get("updated_at", "")

            readme_text = ""
            if include_readmes:
                readme_url = f"https://api.github.com/repos/{username}/{name}/readme"
                try:
                    r_resp = await client.get(readme_url, headers=headers)
                    if r_resp.status_code == 200:
                        content_b64 = r_resp.json().get("content", "")
                        if content_b64:
                            readme_raw = base64.b64decode(content_b64).decode("utf-8", errors="replace")
                            readme_text = _sanitize_text(readme_raw)[:3000]
                except Exception as exc:
                    logger.debug("Could not fetch README for %s: %s", name, exc)

            # Build fact content
            content_parts = [
                f"Repository: {name}",
                f"Description: {desc}",
                f"Primary Language: {language or 'Unspecified'}",
                f"Topics/Tags: {', '.join(topics) if topics else 'None'}",
                f"Stars: {stars} | Forks: {forks}",
                f"Last Updated: {updated_at}",
            ]
            if readme_text:
                content_parts.append(f"\n--- README Documentation ---\n{readme_text}")

            full_content = "\n".join(content_parts)

            facts.append(
                FactItem(
                    id=f"gh-{name.lower()}",
                    entity_type="project",
                    title=f"GitHub Repository: {name}",
                    content=_sanitize_text(full_content),
                    source="github",
                    source_url_or_file=html_url,
                    import_date=now,
                    verification_status=FactVerificationStatus.VERIFIED,
                    metadata={
                        "name": name,
                        "description": desc,
                        "language": language,
                        "topics": topics,
                        "stars": stars,
                        "forks": forks,
                        "updated_at": updated_at,
                        "html_url": html_url,
                    },
                )
            )

    return facts


# =========================================================================
# Conflict Detection Engine
# =========================================================================

def detect_conflicts(fact: FactItem, existing_facts: List[FactItem]) -> List[ConflictItem]:
    """Detect contradictory dates, duplicate claims, or unsupported metrics."""
    conflicts: List[ConflictItem] = []

    # 1. Duplicate check (title or url match)
    for existing in existing_facts:
        if existing.id == fact.id:
            continue
        if existing.source_url_or_file and existing.source_url_or_file == fact.source_url_or_file:
            conflicts.append(
                ConflictItem(
                    conflict_type=ConflictType.DUPLICATE,
                    description=f"Duplicate source location already indexed in '{existing.title}'.",
                    existing_value=existing.source_url_or_file,
                    proposed_value=fact.source_url_or_file,
                    severity="warning",
                )
            )
            break

    # 2. Date mismatch in Education / Experience
    if fact.entity_type in ("education", "experience"):
        # Check against baseline profile data
        profile = get_profile()
        if fact.entity_type == "education":
            for edu in profile.get("education", []):
                expected_end = edu.get("end_year")
                if expected_end:
                    # Look for conflicting 4-digit years in the proposed fact
                    years_found = [int(y) for y in re.findall(r"\b(20[1-3][0-9])\b", fact.content)]
                    for y in years_found:
                        if y != expected_end and "diploma" not in fact.content.lower():
                            conflicts.append(
                                ConflictItem(
                                    conflict_type=ConflictType.DATE_MISMATCH,
                                    description=(
                                        f"Proposed graduation year ({y}) contradicts verified UVCE completion ({expected_end})."
                                    ),
                                    existing_value=str(expected_end),
                                    proposed_value=str(y),
                                    severity="blocker",
                                )
                            )

    # 3. Unsupported claim check: exaggerated metric claims without source confirmation
    suspect_metrics = re.findall(r"\b(\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:k|m|b|\%|\s*million|\s*users))\b", fact.content, re.IGNORECASE)
    if suspect_metrics and fact.source not in ("github", "verified_profile"):
        conflicts.append(
            ConflictItem(
                conflict_type=ConflictType.UNSUPPORTED_CLAIM,
                description=f"Contains numerical claims ({', '.join(suspect_metrics[:3])}) requiring administrative verification.",
                proposed_value=str(suspect_metrics[:3]),
                severity="warning",
            )
        )

    return conflicts


# =========================================================================
# Ledger Storage, Review & Safe Incremental Re-indexing
# =========================================================================

def load_ingested_facts() -> List[FactItem]:
    if not INGESTED_FACTS_FILE.exists():
        return []
    try:
        data = json.loads(INGESTED_FACTS_FILE.read_text(encoding="utf-8"))
        return [FactItem(**item) for item in data]
    except Exception as exc:
        logger.warning("Could not read ingested facts file: %s", exc)
        return []


def save_ingested_facts(facts: List[FactItem]) -> None:
    data = [f.model_dump() for f in facts]
    INGESTED_FACTS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def store_and_reindex_facts(new_facts: List[FactItem]) -> IngestionResult:
    """Store new facts, flag conflicts, and safely update the retrieval index."""
    existing_facts = load_ingested_facts()
    fact_map = {f.id: f for f in existing_facts}

    imported = 0
    pending = 0
    conflicts_count = 0
    processed_details: List[FactItem] = []

    for fact in new_facts:
        conflicts = detect_conflicts(fact, existing_facts)
        fact.conflicts = conflicts
        if conflicts:
            conflicts_count += len(conflicts)
            # If any blocker conflict, force pending review
            if any(c.severity == "blocker" for c in conflicts):
                fact.verification_status = FactVerificationStatus.PENDING_REVIEW

        if fact.verification_status == FactVerificationStatus.PENDING_REVIEW:
            pending += 1
        else:
            imported += 1

        fact_map[fact.id] = fact
        processed_details.append(fact)

    save_ingested_facts(list(fact_map.values()))

    # Invalidate knowledge cache so updated facts are loaded immediately
    clear_knowledge_cache()

    return IngestionResult(
        source="batch_ingest",
        imported_count=imported,
        pending_count=pending,
        conflicts_detected=conflicts_count,
        status="success",
        details=processed_details,
    )


def review_fact(fact_id: str, action: str, note: Optional[str] = None) -> Optional[FactItem]:
    """Admin review step to approve or reject pending facts."""
    facts = load_ingested_facts()
    target: Optional[FactItem] = None

    for f in facts:
        if f.id == fact_id:
            if action.lower() == "approve":
                f.verification_status = FactVerificationStatus.VERIFIED
            elif action.lower() == "reject":
                f.verification_status = FactVerificationStatus.REJECTED
            target = f
            break

    if target:
        save_ingested_facts(facts)
        clear_knowledge_cache()

    return target


def get_ingestion_status() -> IngestionStatusResponse:
    """Return real-time summary of the knowledge ingestion ledger."""
    facts = load_ingested_facts()
    verified = sum(1 for f in facts if f.verification_status == FactVerificationStatus.VERIFIED)
    pending = sum(1 for f in facts if f.verification_status == FactVerificationStatus.PENDING_REVIEW)

    sources_summary: Dict[str, int] = {}
    last_sync = None
    for f in facts:
        sources_summary[f.source] = sources_summary.get(f.source, 0) + 1
        if not last_sync or f.import_date > last_sync:
            last_sync = f.import_date

    return IngestionStatusResponse(
        total_facts=len(facts),
        verified_facts=verified,
        pending_review_facts=pending,
        last_sync_time=last_sync,
        sources_summary=sources_summary,
    )
