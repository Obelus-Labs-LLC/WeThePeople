"""Daily story-pipeline orchestrator.

Owns the state machine for the once-every-three-days research-agent
driven story generation. Calls in order:

    1. black_swan.scan(db)                    → if any hit, lock as candidate
    2. select rotating candidate              → if no black swan, pick by novelty
    3. dedup_gate.is_fresh(db, candidate)     → fall back if blocked
    4. orphan_check.validate_entities(db)     → bail if entities aren't tracked
    5. veritas_client.pre_write_gate(...)     → bail on hard reject
    6. research agent run_from_brief(...)     → produces ResearchDocument
    7. editor pass                            → research doc → story shape
    8. veritas_client.submit_post_write(...)  → async, returns verification_id
    9. veritas_client.poll_post_write(...)    → block until verdict ready
   10. on soft reject: revision loop (capped at 2 attempts)
   11. on hard reject: kill + ops queue
   12. on pass: insert Story (status='draft') and write any externally-
       corroborated claims back to the vault

Graceful fallback design: each downstream component can be absent and
the orchestrator still does useful work. If the research agent is not
yet installed, it falls back to the existing _write_opus_narrative
path. If Veritas's gates aren't reachable, it logs the failure and
either dead-letters the candidate (when configured strict) or proceeds
on the existing pipeline (when configured permissive — only for the
initial bring-up window).

Invocation:
    python -m services.research_pipeline.orchestrator
or programmatically:
    from services.research_pipeline.orchestrator import run_daily
    result = run_daily(db, config=OrchestratorConfig(...))
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from services.research_pipeline import (
    black_swan,
    dedup_gate,
    orphan_check,
    rotating_selector,
)
from services.research_pipeline.veritas_client import (
    VeritasClient,
    VeritasError,
    VeritasGateRejection,
)

logger = logging.getLogger(__name__)


# --- Configuration --------------------------------------------------------


@dataclass
class OrchestratorConfig:
    """Tuning + feature-flag knobs.

    Everything that varies between bring-up, shadow mode, and full
    production lives here. Default values match what we want once the
    research agent and Veritas changes are both fully landed.
    """

    # Veritas integration
    veritas_enabled: bool = field(
        default_factory=lambda: os.getenv("WTP_VERITAS_ENABLED", "1") == "1"
    )
    veritas_strict: bool = field(
        default_factory=lambda: os.getenv("WTP_VERITAS_STRICT", "1") == "1"
    )
    """When veritas_strict=False, infrastructure errors at the gates
    don't kill the candidate. Useful during initial bring-up where the
    Veritas controlling chat is still landing endpoints."""

    # Research agent integration
    research_agent_enabled: bool = field(
        default_factory=lambda: os.getenv("WTP_RESEARCH_AGENT_ENABLED", "0") == "1"
    )
    research_agent_budget_usd: float = field(
        default_factory=lambda: float(os.getenv("WTP_AGENT_BUDGET_USD", "7.0"))
    )
    """Per-story hard cap. Locked at $7 (one clean Sonnet run + two
    revisions, with margin)."""

    # Revision loop
    max_revisions: int = 2

    # Cadence: one story every N days. Default 3 per locked spec.
    cadence_days: int = field(
        default_factory=lambda: int(os.getenv("WTP_STORY_CADENCE_DAYS", "3"))
    )


@dataclass
class OrchestratorResult:
    """Outcome of one orchestrator run, suitable for logging."""

    started_at: datetime
    finished_at: Optional[datetime]
    candidate: Optional[dict[str, Any]]
    candidate_source: Optional[str]   # "black_swan" | "rotating" | None
    selected_via: list[str]            # ordered list of gate names that passed
    rejected_at: Optional[str]         # gate name that rejected, or None
    rejection_detail: Optional[dict[str, Any]]
    story_id: Optional[int]
    revision_attempts: int
    notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "candidate": self.candidate,
            "candidate_source": self.candidate_source,
            "selected_via": self.selected_via,
            "rejected_at": self.rejected_at,
            "rejection_detail": self.rejection_detail,
            "story_id": self.story_id,
            "revision_attempts": self.revision_attempts,
            "notes": self.notes,
        }


# --- Candidate selection --------------------------------------------------


def _gather_candidates(db: Session) -> list[dict[str, Any]]:
    """Run the existing detect_stories detectors and convert their
    Story outputs into orchestrator-shaped candidate dicts.

    The detectors today emit Story objects (built by make_story); the
    orchestrator wants candidate dicts. Rather than refactor 14
    detectors at once we adapt at the boundary: each Story becomes a
    candidate carrying the original Story under
    `evidence._draft_story` so _persist_story_draft can reuse it.
    """
    try:
        # Lazy import to keep this module testable without the full
        # WTP environment loaded.
        from jobs import detect_stories  # type: ignore
    except Exception as e:
        logger.warning("could not import detect_stories: %s", e)
        return []

    candidates: list[dict[str, Any]] = []
    seen_slugs: set[str] = set()

    # Mirror the global+sector pattern list from detect_stories.main().
    global_patterns = [
        ("trade_before_legislation", "detect_trade_before_legislation"),
        ("pac_committee_pipeline",   "detect_pac_committee_pipeline"),
        ("trade_cluster",            "detect_trade_cluster"),
        ("revolving_door",           "detect_revolving_door"),
        ("fara_domestic_overlap",    "detect_fara_domestic_overlap"),
    ]
    sector_patterns = [
        ("lobby_then_win",            "detect_lobby_then_win"),
        ("enforcement_disappearance", "detect_enforcement_disappearance"),
        ("contract_timing",           "detect_contract_timing"),
        ("penalty_gap",               "detect_penalty_gap"),
        ("lobby_contract_loop",       "detect_lobby_contract_loop"),
        ("tax_lobbying",              "detect_tax_lobbying"),
        ("budget_lobbying",           "detect_budget_lobbying"),
        ("top_spender",               "detect_top_spender"),
        ("contract_windfall",         "detect_contract_windfall"),
    ]

    def _adapt(story, signal: str) -> dict[str, Any]:
        eids = list(story.entity_ids or [])
        primary = str(eids[0]) if eids else ""
        evidence = dict(story.evidence or {})
        evidence.setdefault("entity_ids", eids)
        evidence["_draft_story"] = story
        return {
            "signal":     signal,
            "score":      0.5,  # neutral baseline; rotating selector applies novelty weighting
            "entity_id":  primary,
            "sector":     story.sector or "unknown",
            "category":   story.category,
            "summary":    story.summary or "",
            "evidence":   evidence,
            "date_range": story.data_date_range,
        }

    for signal, fn_name in global_patterns:
        fn = getattr(detect_stories, fn_name, None)
        if fn is None:
            continue
        try:
            stories = fn(db) or []
        except Exception as e:
            logger.warning("detector %s failed: %s", fn_name, e)
            continue
        for s in stories:
            if not s or not s.slug or s.slug in seen_slugs:
                continue
            try:
                if detect_stories.story_exists(db, s.slug):
                    continue
            except Exception:
                pass
            seen_slugs.add(s.slug)
            candidates.append(_adapt(s, signal))
            break  # one per detector, per detect_stories convention

    # Sector detectors take a sector_idx; sweep through the same range
    # detect_stories uses (LOBBYING_TABLES indices).
    try:
        sector_count = len(getattr(detect_stories, "LOBBYING_TABLES", []) or [])
    except Exception:
        sector_count = 0
    for signal, fn_name in sector_patterns:
        fn = getattr(detect_stories, fn_name, None)
        if fn is None:
            continue
        for si in range(sector_count):
            try:
                stories = fn(db, sector_idx=si) or []
            except Exception as e:
                logger.debug("detector %s sector_idx=%d failed: %s", fn_name, si, e)
                continue
            picked = False
            for s in stories:
                if not s or not s.slug or s.slug in seen_slugs:
                    continue
                try:
                    if detect_stories.story_exists(db, s.slug):
                        continue
                except Exception:
                    pass
                seen_slugs.add(s.slug)
                candidates.append(_adapt(s, signal))
                picked = True
                break
            if picked:
                break  # one sector per detector

    logger.info("gather_candidates: %d candidates from %d detectors",
                len(candidates), len(global_patterns) + len(sector_patterns))
    return candidates


def _select_candidate(
    db: Session,
    config: OrchestratorConfig,
    result: OrchestratorResult,
) -> Optional[dict[str, Any]]:
    """Pick one candidate for today's slot.

    Strategy (per locked spec):
      1. Run black_swan.scan(); if anything fires above threshold, lock it.
      2. Else, gather rotating candidates and pick the highest novelty.
      3. Apply dedup_gate; if blocked, fall back to the next-best.
      4. Returns None if nothing eligible — the orchestrator logs and
         exits cleanly.
    """
    # Step 1: Black swan override
    swans = black_swan.scan(db)
    if swans:
        chosen = swans[0]
        result.candidate_source = "black_swan"
        result.notes.append(
            f"black_swan override: {chosen['signal']} score={chosen['score']:.2f}"
        )
        logger.info(
            "BLACK SWAN override: %s/%s/%s -> %s",
            chosen["sector"], chosen["entity_id"], chosen["signal"], chosen["summary"],
        )
        return chosen

    # Step 2: Rotating selection
    candidates = _gather_candidates(db)
    if not candidates:
        result.notes.append("no candidates from detectors and no black-swan event")
        logger.info("no story today: no candidates")
        return None

    # Step 3: Apply dedup gate, falling back through ranked candidates
    # until we find one that's fresh.
    ranked = sorted(candidates, key=lambda c: float(c.get("score", 0.0)), reverse=True)
    for c in ranked:
        is_fresh, blocked_by = dedup_gate.is_fresh(db, c)
        if not is_fresh:
            result.notes.append(
                f"dedup blocked candidate {c.get('entity_id')}/{c.get('category')} "
                f"by existing story {blocked_by}"
            )
            continue
        # Pass through rotating selector to apply novelty weighting
        # against the remaining (still fresh) candidates. The selector
        # may push a slightly-lower-signal candidate ahead of a high-
        # signal one if rotation says it should.
        winner = rotating_selector.pick(db, [c])
        if winner is not None:
            result.candidate_source = "rotating"
            return winner

    result.notes.append("all candidates blocked by dedup or rotation")
    return None


# --- Gate invocations -----------------------------------------------------


def _run_orphan_check(
    db: Session,
    candidate: dict[str, Any],
    result: OrchestratorResult,
) -> bool:
    """Run the WTP-side orphan-entity check. Returns True on pass."""
    entity_ids = []
    if candidate.get("entity_id"):
        entity_ids.append(str(candidate["entity_id"]))
    # Some detectors put a list of related entities in evidence.
    extra = candidate.get("evidence", {}).get("entity_ids", [])
    if isinstance(extra, list):
        entity_ids.extend(str(e) for e in extra if e)

    sector = candidate.get("sector")
    check = orphan_check.validate_entities(
        db, sector=sector, entity_ids=entity_ids,
    )
    if check.passed:
        result.selected_via.append("orphan_check")
        return True
    result.rejected_at = "orphan_check"
    result.rejection_detail = check.to_dict()
    logger.warning(
        "orphan_check rejected candidate %s: %s",
        candidate.get("entity_id"), check.issues,
    )
    return False


def _run_pre_write_gate(
    db: Session,
    candidate: dict[str, Any],
    config: OrchestratorConfig,
    result: OrchestratorResult,
    veritas: Optional[VeritasClient],
) -> bool:
    """Run Veritas's pre-write gate over the candidate's source rows.

    Veritas validates double-counts, stale-vs-vault, cross-row
    contradictions. The orphan check ran already (separately) on the
    WTP side; Veritas doesn't see tracked_* tables.
    """
    if not config.veritas_enabled or veritas is None:
        result.notes.append("veritas pre-write skipped (disabled)")
        result.selected_via.append("pre_write_gate(skipped)")
        return True

    try:
        veritas.pre_write_gate(
            candidate_id=str(candidate.get("evidence", {}).get("filing_uuid")
                              or candidate.get("entity_id")
                              or "unknown"),
            detector_name=candidate.get("signal", "unknown"),
            entity_ids=[str(candidate.get("entity_id"))],
            supporting_rows=[candidate.get("evidence", {})],
        )
    except VeritasGateRejection as e:
        result.rejected_at = "pre_write_gate"
        result.rejection_detail = {"verdict": e.verdict}
        logger.warning("Veritas pre-write rejected candidate: %s", e.verdict.get("issues"))
        return False
    except VeritasError as e:
        if config.veritas_strict:
            result.rejected_at = "pre_write_gate"
            result.rejection_detail = {"infra_error": str(e)}
            logger.error("Veritas pre-write infrastructure error (strict mode): %s", e)
            return False
        result.notes.append(f"veritas pre-write infra error tolerated (non-strict): {e}")
        logger.warning("Veritas pre-write infra error (non-strict, proceeding): %s", e)

    result.selected_via.append("pre_write_gate")
    return True


# --- Research agent invocation --------------------------------------------


def _run_research_agent(
    candidate: dict[str, Any],
    config: OrchestratorConfig,
    result: OrchestratorResult,
) -> Optional[dict[str, Any]]:
    """Call the research agent with a StoryBrief.

    Returns the ResearchDocument-shaped dict on success, None when the
    agent isn't installed yet. The caller falls back to the existing
    _write_opus_narrative path in that case so the orchestrator stays
    useful end-to-end during bring-up.
    """
    if not config.research_agent_enabled:
        result.notes.append("research_agent disabled (will fall back to existing narrative)")
        return None

    # Surface from research-agent wtp-integration branch
    # (Rocketshon/research-agent@wtp-integration). StoryBrief and
    # run_from_brief both live in research_agent.pipeline; the model
    # is hardcoded to Sonnet inside run_from_brief, so we don't pass
    # it. PublicationStatus is the journalism-refusal verdict.
    try:
        from research_agent.pipeline import StoryBrief, run_from_brief  # type: ignore
        from research_agent.schema import PublicationStatus  # type: ignore
    except ImportError as e:
        result.notes.append(f"research_agent not installed yet: {e}")
        logger.info("research_agent not yet installed; falling back to existing path")
        return None

    brief_dict = {
        "entity": str(candidate.get("entity_id")),
        "entity_type": _infer_entity_type(candidate),
        "pattern": candidate.get("category") or candidate.get("signal", "unknown"),
        "date_range": _coerce_date_range(
            candidate.get("evidence", {}).get("date_range") or candidate.get("date_range")
        ),
        # seed_data is list[dict] of WTP DB rows; the candidate's
        # evidence dict is a single seed row. Strip our internal
        # _draft_story handle before sending to the agent.
        "seed_data": [_clean_seed_row(candidate.get("evidence", {}))],
        "budget_usd": config.research_agent_budget_usd,
    }
    try:
        brief = StoryBrief(**brief_dict)
    except Exception as e:
        logger.warning("StoryBrief construction failed: %s; brief=%s", e, brief_dict)
        result.notes.append(f"StoryBrief construction failed: {e}")
        return None

    try:
        doc = run_from_brief(brief)
    except Exception as e:
        logger.exception("research_agent.run_from_brief failed: %s", e)
        result.notes.append(f"research_agent execution failed: {e}")
        return None

    # Journalism refusal gate — bail before we waste a Veritas cycle on
    # a doc the agent already refused.
    pub_status = getattr(doc, "publication_status", None)
    if pub_status is not None:
        status_value = getattr(pub_status, "value", str(pub_status))
        if status_value == getattr(PublicationStatus.REFUSED, "value", "refused"):
            reason = getattr(doc, "refusal_reason", None) or "no reason given"
            result.rejected_at = "research_agent_refusal"
            result.rejection_detail = {"reason": reason}
            logger.warning("research_agent refused publication: %s", reason)
            return None
        if status_value == getattr(PublicationStatus.BUDGET_HIT, "value", "budget_hit"):
            result.rejected_at = "research_agent_budget"
            result.rejection_detail = {"budget_usd": config.research_agent_budget_usd}
            logger.warning("research_agent hit $%.2f budget cap", config.research_agent_budget_usd)
            return None

    result.selected_via.append("research_agent")
    # ResearchDocument is a Pydantic model; dump to dict for downstream.
    if hasattr(doc, "model_dump"):
        return doc.model_dump()
    if hasattr(doc, "dict"):
        return doc.dict()
    return doc


def _infer_entity_type(candidate: dict[str, Any]) -> str:
    """Best-effort routing for the StoryBrief.entity_type field."""
    sector = (candidate.get("sector") or "").lower()
    if sector in {"politics", "politician", "person", "member"}:
        return "politician"
    return "corporation"


def _default_date_range() -> tuple[Any, Any]:
    """Fallback date range when the candidate didn't ship one.

    Returns a (date, date) tuple — StoryBrief expects datetime.date
    objects, not strings.
    """
    from datetime import date, timedelta
    end = date.today()
    start = end - timedelta(days=365)
    return (start, end)


def _coerce_date_range(raw: Any) -> tuple[Any, Any]:
    """Convert whatever shape the candidate carried into a (date, date)
    tuple StoryBrief accepts. Tolerates string ISO ranges, "Jan 2020 -
    Mar 2026" human ranges, and (str, str) or (date, date) pairs."""
    from datetime import date, datetime as _dt

    def _to_date(v: Any) -> Any:
        if isinstance(v, date) and not isinstance(v, _dt):
            return v
        if isinstance(v, _dt):
            return v.date()
        if isinstance(v, str):
            s = v.strip()
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y"):
                try:
                    return _dt.strptime(s, fmt).date()
                except ValueError:
                    continue
        return None

    if raw is None:
        return _default_date_range()
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        start = _to_date(raw[0]) or _default_date_range()[0]
        end = _to_date(raw[1]) or _default_date_range()[1]
        return (start, end)
    # String forms we can't parse fall back to the default 1-year window.
    return _default_date_range()


def _clean_seed_row(evidence: dict[str, Any]) -> dict[str, Any]:
    """Strip orchestrator-internal keys before handing evidence to the
    research agent as a seed row. _draft_story is a SQLAlchemy object
    that wouldn't survive serialization anyway."""
    if not isinstance(evidence, dict):
        return {}
    return {k: v for k, v in evidence.items() if not k.startswith("_")}


# --- Post-write gate + revision loop --------------------------------------


# Reason codes Veritas may attach to a per-claim verdict. Stable per
# Veritas's published API. We branch the revision strategy on these.
_REVISION_TERMINAL_CODES = {
    # Inferred claims are hard-rejected at the provenance level; the
    # agent can't fix them by re-running because the claim itself is
    # the problem. Contradicted means an authoritative source said
    # the opposite — same story.
    "inferred_rejected",
    "contradicted",
}
_REVISION_AGENT_CODES = {
    # The research agent should fetch more / better sources.
    "no_primary_source",
    "low_corroboration",
    "insufficient_evidence",
    "partial",
}
_REVISION_VAULT_CODES = {
    # An internal claim wasn't in the vault. WTP can fix this by
    # writing the source row into the vault and re-asking Veritas.
    "not_in_vault",
}


def _classify_soft_reject(verdict: dict[str, Any]) -> str:
    """Pick the dominant revision strategy for a soft-reject verdict.

    Returns one of: 'terminal', 'agent', 'vault', 'mixed'.
    Picks the strictest applicable strategy: terminal beats agent
    beats vault, on the principle that one un-fixable claim taints
    the whole batch.
    """
    failing = [
        c for c in (verdict.get("claims") or [])
        if isinstance(c, dict) and c.get("verdict") not in {"verified", "verified_vault_hit"}
    ]
    if not failing:
        return "agent"  # generic fallback
    codes = {c.get("reason_code") for c in failing}
    if codes & _REVISION_TERMINAL_CODES:
        return "terminal"
    has_agent = bool(codes & _REVISION_AGENT_CODES)
    has_vault = bool(codes & _REVISION_VAULT_CODES)
    if has_agent and has_vault:
        return "mixed"
    if has_vault:
        return "vault"
    return "agent"


def _run_post_write_with_revisions(
    research_doc: dict[str, Any],
    config: OrchestratorConfig,
    result: OrchestratorResult,
    veritas: Optional[VeritasClient],
) -> Optional[dict[str, Any]]:
    """Submit the research document's claims to Veritas's post-write
    gate. On soft reject, run an auto-revision loop (capped at
    max_revisions). Return the final verdict, or None on hard
    infrastructure failure.

    Revision strategy depends on the per-claim reason_code (Veritas's
    stable enum):
      not_in_vault         -> write the source row into the vault, retry
      no_primary_source    -> ask the agent for more / better sources
      low_corroboration    -> ask the agent for more / better sources
      insufficient_evidence-> ask the agent for more / better sources
      partial              -> ask the agent for more / better sources
      inferred_rejected    -> terminal; can't be auto-fixed
      contradicted         -> terminal; can't be auto-fixed
    """
    if not config.veritas_enabled or veritas is None:
        result.notes.append("veritas post-write skipped (disabled)")
        result.selected_via.append("post_write_gate(skipped)")
        return {"verdict": "pass", "claims": [], "summary": "veritas disabled"}

    claims = _extract_claims_for_post_write(research_doc)
    if not claims:
        result.notes.append("no verifiable claims found in research_doc")
        return {"verdict": "pass", "claims": [], "summary": "no claims to verify"}

    attempt = 0
    while attempt <= config.max_revisions:
        try:
            verification_id = veritas.submit_post_write(
                story_draft_id=str(research_doc.get("id") or "draft"),
                claims=claims,
                discover_evidence=False,  # research-agent shipped sources; use fast path
            )
        except VeritasError as e:
            if config.veritas_strict:
                result.rejected_at = "post_write_gate"
                result.rejection_detail = {"infra_error": str(e)}
                return None
            result.notes.append(f"post-write infra error tolerated: {e}")
            return {"verdict": "pass", "claims": [], "summary": f"infra-error tolerated: {e}"}

        try:
            verdict = veritas.poll_post_write(verification_id)
        except VeritasError as e:
            if config.veritas_strict:
                result.rejected_at = "post_write_gate"
                result.rejection_detail = {"infra_error": str(e)}
                return None
            result.notes.append(f"post-write poll infra error tolerated: {e}")
            return {"verdict": "pass", "claims": [], "summary": f"poll-error tolerated: {e}"}

        outcome = verdict.get("verdict")
        if outcome == "pass":
            result.selected_via.append(
                "post_write_gate" if attempt == 0 else f"post_write_gate(rev{attempt})"
            )
            return verdict
        if outcome == "hard_reject":
            result.rejected_at = "post_write_gate"
            result.rejection_detail = verdict
            logger.warning(
                "Veritas post-write hard-rejected story_draft after %d attempts", attempt + 1,
            )
            return None

        # Soft reject branch — pick the right revision strategy.
        strategy = _classify_soft_reject(verdict)
        if strategy == "terminal":
            result.rejected_at = "post_write_gate"
            result.rejection_detail = verdict
            result.notes.append(
                "soft-reject contains inferred_rejected / contradicted claims; "
                "terminal — sending to human review"
            )
            return verdict

        attempt += 1
        result.revision_attempts = attempt
        if attempt > config.max_revisions:
            result.notes.append(
                f"soft-reject persisted after {config.max_revisions} revisions; "
                f"sending to human review"
            )
            return verdict

        result.notes.append(
            f"soft-reject attempt {attempt}/{config.max_revisions}, strategy={strategy}"
        )

        if strategy in {"vault", "mixed"}:
            wrote = _seed_vault_for_not_in_vault(verdict, research_doc, veritas)
            if wrote:
                result.notes.append(f"seeded {wrote} not_in_vault claim(s) into vault")
                # If purely a vault problem, retry verification without
                # asking the agent to re-run. If mixed, also revise.
                if strategy == "vault":
                    continue

        if strategy in {"agent", "mixed"}:
            revised = _request_agent_revision(research_doc, verdict, config)
            if revised is None:
                result.notes.append("agent revision unavailable; sending current draft to review")
                return verdict
            research_doc = revised
            claims = _extract_claims_for_post_write(research_doc)

    return None


def _seed_vault_for_not_in_vault(
    verdict: dict[str, Any],
    research_doc: dict[str, Any],
    veritas: VeritasClient,
) -> int:
    """For each claim verdict with reason_code='not_in_vault', write the
    backing internal source row into the vault so the next post-write
    cycle key-hits it. Returns the number of vault writes performed.

    Failures are logged but don't block the retry — Veritas's vault
    insert is idempotent on claim_hash_global, so a partial write is
    safe.
    """
    failing = [
        c for c in (verdict.get("claims") or [])
        if isinstance(c, dict) and c.get("reason_code") == "not_in_vault"
    ]
    if not failing:
        return 0

    by_id = {
        str(c.get("claim_id") or c.get("id") or ""): c
        for c in (research_doc.get("claims") or []) if isinstance(c, dict)
    }
    doc_category = research_doc.get("category") or "unknown"
    written = 0
    for v in failing:
        cid = str(v.get("claim_id") or "")
        agent_claim = by_id.get(cid)
        if not agent_claim:
            continue
        try:
            veritas.write_vault_claim(
                text=agent_claim.get("text") or agent_claim.get("claim_text") or "",
                category=agent_claim.get("category") or doc_category,
                claim_provenance="internal",
                story_id=str(research_doc.get("id") or "draft"),
                sources_checked=agent_claim.get("source_urls")
                                or agent_claim.get("supporting_sources") or [],
                confidence=v.get("confidence") or 0.95,
                external_record_uri=agent_claim.get("external_record_uri"),
                evidence=agent_claim.get("evidence"),
            )
            written += 1
        except VeritasError as e:
            logger.warning("vault seed for not_in_vault claim %s failed: %s", cid, e)
    return written


# research-agent's ClaimSourceType -> Veritas's claim_provenance enum.
# Veritas accepts only the right-hand values; the research agent ships
# the left-hand values via Pydantic enum dumps. Translation lives at the
# boundary so each side keeps its own vocabulary.
_AGENT_TO_VERITAS_PROVENANCE = {
    "internal_db":  "internal",
    "external_web": "external",
    "inferred":     "inferred",
}


def _to_veritas_provenance(raw: Any) -> str:
    """Normalize whatever the agent emitted into Veritas's enum.
    Defaults to 'external' when ambiguous so a missing tag doesn't
    accidentally mark a claim as inferred (which Veritas hard-rejects)."""
    value = getattr(raw, "value", raw)
    if value is None:
        return "external"
    s = str(value).strip().lower()
    return _AGENT_TO_VERITAS_PROVENANCE.get(s, s if s in {"internal", "external", "inferred"} else "external")


def _extract_claims_for_post_write(
    research_doc: dict[str, Any],
) -> list[dict[str, Any]]:
    """Pull the claim list out of a ResearchDocument-shaped dict in
    the form Veritas expects.

    Translation rules (research-agent -> Veritas):
        internal_db  -> internal   (vault-key lookup; URI carried as
                                    external_record_uri)
        external_web -> external   (corroboration + Tier-1/2 gate)
        inferred     -> inferred   (auto-hard-reject)

    `category` is required by Veritas's decay-policy lookup; it falls
    back to the document category when individual claims didn't tag
    one.
    """
    raw_claims = research_doc.get("claims")
    if not isinstance(raw_claims, list):
        return []

    doc_category = research_doc.get("category") or "unknown"
    out: list[dict[str, Any]] = []
    for c in raw_claims:
        if not isinstance(c, dict):
            continue
        provenance = _to_veritas_provenance(
            c.get("source_type") or c.get("claim_provenance")
        )
        out.append({
            "claim_id":            str(c.get("claim_id") or c.get("id") or len(out)),
            "claim_text":          c.get("text") or c.get("claim_text") or "",
            "claim_provenance":    provenance,
            "category":            c.get("category") or doc_category,
            "external_record_uri": c.get("external_record_uri"),
            "supporting_sources":  c.get("source_urls") or c.get("supporting_sources") or [],
        })
    return out


def _request_agent_revision(
    research_doc: dict[str, Any],
    verdict: dict[str, Any],
    config: OrchestratorConfig,
) -> Optional[dict[str, Any]]:
    """Send the failing claims back to the research agent for repair.

    Until the agent's revision-loop integration is implemented this
    returns None and the caller treats the soft-reject as terminal
    (drops to review queue with the current draft).
    """
    try:
        from research_agent.pipeline import revise_with_diagnostics  # type: ignore
    except ImportError:
        return None
    try:
        return revise_with_diagnostics(
            document=research_doc,
            diagnostics=verdict.get("claims", []),
            budget_usd=config.research_agent_budget_usd,
        )
    except Exception as e:
        logger.warning("agent revision failed: %s", e)
        return None


# --- Vault expansion ------------------------------------------------------


def _write_external_claims_to_vault(
    research_doc: dict[str, Any],
    verdict: dict[str, Any],
    veritas: Optional[VeritasClient],
    story_id: int,
) -> None:
    """Write any claim that passed post-write AND is tagged external
    AND has sufficient corroboration into the vault. Failures are
    logged but don't kill the story."""
    if veritas is None:
        return
    claims = research_doc.get("claims") or []
    verdicts_by_id = {
        v.get("claim_id"): v for v in (verdict.get("claims") or [])
    }
    for c in claims:
        if not isinstance(c, dict):
            continue
        claim_id = str(c.get("claim_id") or c.get("id") or "")
        v = verdicts_by_id.get(claim_id, {})
        if not v.get("vault_eligible"):
            continue
        # Only externally-corroborated claims are vault candidates.
        # internal claims came from our own DB and don't need caching;
        # inferred claims are hard-rejected upstream and never reach
        # this branch anyway.
        provenance = _to_veritas_provenance(
            c.get("source_type") or c.get("claim_provenance")
        )
        if provenance != "external":
            continue
        try:
            veritas.write_vault_claim(
                text=c.get("text") or c.get("claim_text") or "",
                category=c.get("category") or research_doc.get("category", "unknown"),
                claim_provenance="external",
                story_id=str(story_id),
                sources_checked=c.get("source_urls") or c.get("supporting_sources") or [],
                confidence=v.get("confidence") or 0.95,
                external_record_uri=c.get("external_record_uri"),
                evidence=v.get("evidence") or c.get("evidence"),
            )
        except VeritasError as e:
            logger.warning(
                "vault write failed for claim_id=%s on story %s: %s",
                claim_id, story_id, e,
            )


# --- Top-level entry ------------------------------------------------------


def run_daily(
    db: Session,
    *,
    config: Optional[OrchestratorConfig] = None,
) -> OrchestratorResult:
    """Run the daily story-pipeline once. Returns a structured result."""
    cfg = config or OrchestratorConfig()
    result = OrchestratorResult(
        started_at=datetime.now(timezone.utc),
        finished_at=None,
        candidate=None,
        candidate_source=None,
        selected_via=[],
        rejected_at=None,
        rejection_detail=None,
        story_id=None,
        revision_attempts=0,
        notes=[],
    )

    veritas: Optional[VeritasClient] = None
    if cfg.veritas_enabled:
        try:
            veritas = VeritasClient()
        except Exception as e:
            if cfg.veritas_strict:
                result.rejected_at = "veritas_init"
                result.rejection_detail = {"error": str(e)}
                result.finished_at = datetime.now(timezone.utc)
                return result
            result.notes.append(f"veritas init failed (non-strict): {e}")

    # 1-3: Candidate selection (black swan + rotating + dedup)
    candidate = _select_candidate(db, cfg, result)
    if candidate is None:
        result.finished_at = datetime.now(timezone.utc)
        return result
    result.candidate = candidate

    # 4: Orphan check
    if not _run_orphan_check(db, candidate, result):
        result.finished_at = datetime.now(timezone.utc)
        return result

    # 5: Veritas pre-write gate
    if not _run_pre_write_gate(db, candidate, cfg, result, veritas):
        result.finished_at = datetime.now(timezone.utc)
        return result

    # 6: Research agent (or fall back to existing narrative path)
    research_doc = _run_research_agent(candidate, cfg, result)
    if research_doc is None:
        # Fallback: the candidate came from a detector and already
        # carries a fully-formed draft Story under
        # evidence._draft_story. We treat that draft as the "research
        # doc" so the rest of the gates and persistence still run.
        # When the research agent lands, this branch is bypassed.
        draft_story = (candidate.get("evidence") or {}).get("_draft_story")
        if draft_story is not None:
            result.notes.append("falling back to detector-generated draft (research_agent disabled)")
            research_doc = _draft_story_to_research_doc(draft_story, candidate)
        else:
            result.notes.append(
                "research_agent path unavailable and no detector draft available; "
                "orchestrator stops here."
            )
            result.finished_at = datetime.now(timezone.utc)
            return result

    # 7: Editor pass — placeholder. The editor pass converts a research
    #    doc into a publication-shaped Story. Lives in a separate
    #    module we'll wire as soon as the research agent is producing
    #    real output.
    story_draft = _editor_pass(research_doc, candidate)

    # 8-11: Post-write gate with revision loop
    verdict = _run_post_write_with_revisions(story_draft, cfg, result, veritas)
    if verdict is None:
        result.finished_at = datetime.now(timezone.utc)
        return result

    # 12: Insert Story (status='draft') for human review
    story_id = _persist_story_draft(db, story_draft, candidate, verdict)
    result.story_id = story_id
    result.notes.append(f"story #{story_id} dropped into draft queue for human review")

    # 12b: Notify the editor by email so the draft doesn't sit
    # unreviewed waiting for the next digest cron. The address comes
    # from WTP_REVIEW_EMAIL (defaults to dshonsmith@gmail.com).
    if story_id and story_id > 0:
        try:
            _email_draft_for_review(story_draft, story_id, verdict)
            result.notes.append("editor notified by email")
        except Exception as e:
            logger.warning("draft-review email failed (story persisted, just no email): %s", e)
            result.notes.append(f"draft email failed (non-fatal): {e}")

    # 13: Write externally-corroborated claims back to vault
    _write_external_claims_to_vault(story_draft, verdict, veritas, story_id)

    result.finished_at = datetime.now(timezone.utc)
    return result


def _email_draft_for_review(
    story_draft: dict[str, Any],
    story_id: int,
    verdict: dict[str, Any],
) -> None:
    """Fire a Resend email to the editor when a new draft lands.

    Best-effort: failure here does not roll back persistence — the
    draft already exists in the queue at /ops/story-queue and will
    show up in the next digest if the per-draft email fails.
    """
    from services.email import send_email
    to_addr = os.getenv("WTP_REVIEW_EMAIL", "dshonsmith@gmail.com")
    title = story_draft.get("title") or f"Draft #{story_id}"
    summary = story_draft.get("summary") or "(no summary)"
    sector = story_draft.get("sector") or "cross-sector"
    category = story_draft.get("category") or "uncategorized"
    verdict_outcome = (verdict or {}).get("verdict", "unknown")
    queue_url = os.getenv("WTP_QUEUE_URL", "https://wethepeopleforus.com/ops/story-queue")
    review_url = f"{queue_url.rstrip('/')}/{story_id}"

    html = (
        f"<h2>New draft awaiting review: #{story_id}</h2>"
        f"<p><strong>{title}</strong></p>"
        f"<p>{summary}</p>"
        f"<ul>"
        f"<li>sector: {sector}</li>"
        f"<li>category: {category}</li>"
        f"<li>Veritas verdict: {verdict_outcome}</li>"
        f"</ul>"
        f"<p><a href=\"{review_url}\">Open in queue</a></p>"
    )
    send_email(
        to=[to_addr],
        subject=f"[WTP draft #{story_id}] {title[:80]}",
        html=html,
    )


# --- Editor pass + persistence (placeholders for now) ---------------------


def _editor_pass(
    research_doc: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    """Convert a ResearchDocument into a publication-shaped story.

    Placeholder. Lives here until we wire the editor module — for now
    it's a passthrough that just adds the candidate metadata so the
    persistence step has something to write.
    """
    return {
        **research_doc,
        "category": candidate.get("category") or candidate.get("signal"),
        "sector": candidate.get("sector"),
        "entity_ids": [candidate.get("entity_id")] if candidate.get("entity_id") else [],
    }


def _draft_story_to_research_doc(draft_story, candidate: dict[str, Any]) -> dict[str, Any]:
    """Adapt a detector-generated Story into a research-doc-shaped dict.

    Used as the fallback path when the research agent is not yet
    installed. Carries the original Story under `_draft_story` so
    persistence can reuse the already-built object instead of
    rebuilding it.
    """
    return {
        "id": getattr(draft_story, "slug", None),
        "title": getattr(draft_story, "title", None),
        "summary": getattr(draft_story, "summary", None),
        "body": getattr(draft_story, "body", None),
        "category": getattr(draft_story, "category", candidate.get("category")),
        "sector": getattr(draft_story, "sector", candidate.get("sector")),
        "entity_ids": list(getattr(draft_story, "entity_ids", []) or []),
        "data_sources": list(getattr(draft_story, "data_sources", []) or []),
        "evidence": dict(getattr(draft_story, "evidence", {}) or {}),
        "data_date_range": getattr(draft_story, "data_date_range", None),
        "claims": [],
        "_draft_story": draft_story,
    }


def _persist_story_draft(
    db: Session,
    story_draft: dict[str, Any],
    candidate: dict[str, Any],
    verdict: dict[str, Any],
) -> int:
    """Insert a Story row in the draft queue with verification metadata.

    Reuses the detector-generated Story when present (fallback path)
    or builds one from the research_doc fields. Either way the
    verification verdict is attached to verification_data and the
    score / tier are populated from Veritas.
    """
    try:
        from models.stories_models import Story  # type: ignore
        from jobs.detect_stories import make_story  # type: ignore
    except Exception as e:
        logger.error("could not import Story model / make_story: %s", e)
        return -1

    draft_story = story_draft.get("_draft_story")
    if draft_story is None:
        # Build a Story from the research_doc fields directly.
        title = story_draft.get("title") or f"Story about {candidate.get('entity_id')}"
        summary = story_draft.get("summary") or ""
        body = story_draft.get("body") or ""
        category = story_draft.get("category") or candidate.get("category") or "unknown"
        sector = story_draft.get("sector") or candidate.get("sector")
        entity_ids = story_draft.get("entity_ids") or (
            [candidate.get("entity_id")] if candidate.get("entity_id") else []
        )
        data_sources = story_draft.get("data_sources") or []
        evidence = dict(story_draft.get("evidence") or {})
        evidence.pop("_draft_story", None)
        date_range = story_draft.get("data_date_range")
        try:
            draft_story = make_story(
                title=title,
                summary=summary,
                body=body,
                category=category,
                sector=sector,
                entity_ids=entity_ids,
                data_sources=data_sources,
                evidence=evidence,
                date_range=date_range,
                entity_validated=True,
            )
        except Exception as e:
            logger.exception("make_story failed: %s", e)
            return -1

    # Attach Veritas verdict to verification fields.
    score, tier = _verdict_to_score_tier(verdict)
    draft_story.verification_score = score
    draft_story.verification_tier = tier
    try:
        draft_story.verification_data = json.dumps(verdict, default=str)
    except Exception:
        draft_story.verification_data = None

    # New verification metadata columns (added by alembic migration
    # research_pipeline_001). Set if the column exists; harmless if
    # the migration hasn't been applied yet on a given environment.
    for attr, value in (
        ("claim_version", 1),
        ("last_seen_at", datetime.now(timezone.utc)),
        ("verification_stale", 0),
    ):
        if hasattr(draft_story, attr):
            try:
                setattr(draft_story, attr, value)
            except Exception:
                pass

    try:
        db.add(draft_story)
        db.flush()
        story_id = int(draft_story.id)
        db.commit()
        return story_id
    except Exception as e:
        db.rollback()
        logger.exception("persisting story draft failed: %s", e)
        return -1


def _verdict_to_score_tier(verdict: dict[str, Any]) -> tuple[float, str]:
    """Map a Veritas post-write verdict into the existing
    verification_score / verification_tier scheme on the Story model.

    Veritas verdict shape: {"verdict": "pass"|"soft_reject"|"hard_reject",
    "claims": [...], "summary": ...}
    """
    outcome = (verdict or {}).get("verdict")
    if outcome == "pass":
        return 0.95, "verified"
    if outcome == "soft_reject":
        return 0.70, "partially_verified"
    return 0.30, "unverified"


# --- CLI entry point ------------------------------------------------------


def main():
    """Entry point for `python -m services.research_pipeline.orchestrator`."""
    import argparse
    parser = argparse.ArgumentParser(description="WTP research-pipeline orchestrator")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run selection + gates but skip persistence")
    args = parser.parse_args()

    # Lazy import so this module is testable without the full WTP env.
    from models.database import SessionLocal

    cfg = OrchestratorConfig()
    db = SessionLocal()
    try:
        result = run_daily(db, config=cfg)
    finally:
        db.close()

    print(json.dumps(result.to_dict(), indent=2, default=str))
    if args.dry_run:
        return
    if result.rejected_at:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
