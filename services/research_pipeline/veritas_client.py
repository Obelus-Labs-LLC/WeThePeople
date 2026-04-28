"""HTTP client for Veritas verification engine.

Wraps the four endpoints we depend on:

  POST /api/v1/gate/pre-write
       Validates a candidate skeleton (data integrity, double-counts,
       stale-vs-vault, cross-row contradictions). Synchronous, fast.

  POST /api/v1/gate/post-write
       Validates a research document's claim list. Asynchronous: returns
       a verification_id immediately. Caller polls GET .../verdict.

  GET  /api/v1/gate/post-write/{verification_id}
       Polls a post-write job. Returns status=pending until verdict is
       ready, then returns the structured verdict + per-claim diagnostics.

  POST /api/v1/vault/claims
       Writes a verified-external claim into the vault with provenance
       (story_id, sources_checked, confidence). Decay policy is set to
       'unknown' on write; the daily decay-classify cron upgrades it.

Auth: API key via X-API-Key header. Loopback-only deployment on Hetzner
means no JWT, no rotation complexity (per Veritas's own audit pushback).

Behaviour on Veritas being down:
    Pre-write gate: hard fail. Story doesn't proceed.
    Post-write gate: hard fail. Story dead-letters into ops queue with
                     the agent draft preserved for retry once Veritas
                     is back.
    Vault write: queue the write locally and retry on next pipeline run.
                 A claim that pass post-write but fails to write to the
                 vault doesn't kill the story; the cache miss just costs
                 the next reference an external verification round-trip.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

import requests

logger = logging.getLogger(__name__)


# --- Configuration ---------------------------------------------------------

# Veritas runs on the same Hetzner box as the WeThePeople API. By default
# we hit it over loopback; production deployments override via env.
DEFAULT_BASE_URL = "http://127.0.0.1:8007"

# Match the rate-limit budgets Veritas declares in its audit: 30/60s for
# writes, 120/60s for reads. We don't hammer either, but be polite.
DEFAULT_REQUEST_TIMEOUT_S = 60

# Async post-write polling: total wall-clock cap for a 30-claim cold-start
# verification (Veritas estimated 3-5 min after parallelism). We cap a
# little higher for safety, then bail.
DEFAULT_POLL_TIMEOUT_S = 600
DEFAULT_POLL_INTERVAL_S = 5


class VeritasError(Exception):
    """Base class for Veritas client errors."""


class VeritasGateRejection(VeritasError):
    """Raised when a gate returns a hard-reject verdict.

    The caller catches this distinctly from infrastructure errors —
    a hard reject is a publication decision (kill the story), an
    infrastructure error is operational (retry / dead-letter).
    """

    def __init__(self, message: str, *, verdict: dict[str, Any]):
        super().__init__(message)
        self.verdict = verdict


@dataclass
class VeritasConfig:
    base_url: str = field(default_factory=lambda: os.getenv("VERITAS_BASE_URL", DEFAULT_BASE_URL))
    api_key: str = field(default_factory=lambda: os.getenv("VERITAS_API_KEY", ""))
    request_timeout_s: int = DEFAULT_REQUEST_TIMEOUT_S
    poll_timeout_s: int = DEFAULT_POLL_TIMEOUT_S
    poll_interval_s: int = DEFAULT_POLL_INTERVAL_S


class VeritasClient:
    """Thin synchronous wrapper around the Veritas gate endpoints.

    One instance per pipeline run is fine; the underlying requests
    Session pools connections.
    """

    def __init__(self, config: Optional[VeritasConfig] = None):
        self.config = config or VeritasConfig()
        if not self.config.api_key:
            logger.warning(
                "VERITAS_API_KEY not configured; calls will fail at the auth layer. "
                "Set the env var on Hetzner before relying on this client.",
            )
        self._session = requests.Session()
        self._session.headers.update({
            "X-API-Key": self.config.api_key,
            "User-Agent": "wtp-research-pipeline/1.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    # -- Pre-write gate -----------------------------------------------------

    def pre_write_gate(
        self,
        *,
        candidate_id: str,
        detector_name: str,
        entity_ids: list[str],
        supporting_rows: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Run Veritas-side pre-write checks (double-count, stale, cross-row contradiction).

        The orphan-entity check is NOT in this call; it runs WTP-side via
        services.research_pipeline.orphan_check before we even hit Veritas.
        Veritas can't see WTP's tracked_* tables and we don't want to mount
        them for it.

        Returns:
            {
                "verdict": "pass" | "fail",
                "issues": [
                    {"check": str, "row_id": str, "reason": str, ...},
                    ...
                ],
            }

        Raises:
            VeritasGateRejection: when verdict is "fail" and the caller
                wants the structured diagnostic propagated up the stack.
            VeritasError: on infrastructure failures (connection, 5xx).
        """
        payload = {
            "candidate_id": candidate_id,
            "detector": detector_name,
            "entity_ids": entity_ids,
            "rows": supporting_rows,
        }
        url = self._url("/api/v1/gate/pre-write")
        result = self._post(url, payload)
        if result.get("verdict") != "pass":
            raise VeritasGateRejection(
                f"pre-write gate rejected candidate {candidate_id}: "
                f"{len(result.get('issues', []))} issue(s)",
                verdict=result,
            )
        return result

    # -- Post-write gate (async) -------------------------------------------

    def submit_post_write(
        self,
        *,
        story_draft_id: str,
        claims: list[dict[str, Any]],
        discover_evidence: bool = False,
    ) -> str:
        """Submit a post-write verification batch, return a verification_id.

        Each claim in `claims` must conform to:
            {
                "claim_id": str,        # stable id from the research agent
                "claim_text": str,      # canonical statement
                "claim_provenance": "internal" | "external" | "inferred",
                "category": str,        # finance / lobbying / contracts / ...
                "external_record_uri": str | None,  # set for internal claims
                "supporting_sources": [str],        # URLs the agent collected
            }

        discover_evidence:
            False (default, FAST path) — Veritas trusts supporting_sources
                  as the evidence corpus. ~3-5min for a 30-claim batch.
            True  (SLOW path)         — Veritas runs assist_claim against
                  its 114 sources to discover evidence itself. 15-45s per
                  claim cold. Use when the research agent didn't pull
                  sources for a particular claim.

        Returns the Veritas-issued verification_id for polling.
        """
        payload = {
            "story_draft_id": story_draft_id,
            "claims": claims,
            "discover_evidence": bool(discover_evidence),
        }
        url = self._url("/api/v1/gate/post-write")
        result = self._post(url, payload)
        verification_id = result.get("verification_id")
        if not verification_id:
            raise VeritasError(
                f"post-write submit returned no verification_id: {result}"
            )
        return verification_id

    def poll_post_write(self, verification_id: str) -> dict[str, Any]:
        """Block until a post-write verification completes, then return the
        structured verdict.

        Returns:
            {
                "status": "complete",
                "verdict": "pass" | "soft_reject" | "hard_reject",
                "claims": [
                    {
                        "claim_id": str,
                        "verdict": "verified" | "partial" | "unknown" | "contradicted",
                        "reason_code": str,
                        "suggested_repair": {...} | None,
                        "vault_eligible": bool,
                    },
                    ...
                ],
                "summary": str,
            }

        Raises:
            VeritasError: on poll timeout or infrastructure failure.
        """
        deadline = time.monotonic() + self.config.poll_timeout_s
        url = self._url(f"/api/v1/gate/post-write/{verification_id}")
        while time.monotonic() < deadline:
            result = self._get(url)
            status = result.get("status")
            if status == "complete":
                return result
            if status == "error":
                raise VeritasError(
                    f"post-write {verification_id} errored: {result.get('error', '<no detail>')}"
                )
            time.sleep(self.config.poll_interval_s)
        raise VeritasError(
            f"post-write {verification_id} did not complete within "
            f"{self.config.poll_timeout_s}s"
        )

    # -- Vault write --------------------------------------------------------

    def write_vault_claim(
        self,
        *,
        text: str,
        category: str,
        claim_provenance: str,
        story_id: str,
        sources_checked: list[dict[str, Any]],
        confidence: float | str,
        external_record_uri: Optional[str] = None,
        evidence: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        """Write a post-write-verified external claim into the vault.

        decay_policy is intentionally NOT specified by the caller. Veritas
        sets it to 'unknown' on insert; the daily decay-classifier cron
        upgrades it later. This avoids the lookup race where vault hits
        between insert and classifier-cron miss the new claim.

        Returns the inserted vault entry, including the assigned claim_id.

        Failures here do NOT kill the story; the caller logs and moves on.
        """
        payload: dict[str, Any] = {
            "text": text,
            "category": category,
            "claim_provenance": claim_provenance,
            "story_id": story_id,
            "sources_checked": sources_checked,
            "confidence": confidence,
        }
        if external_record_uri:
            payload["external_record_uri"] = external_record_uri
        if evidence:
            payload["evidence"] = evidence
        url = self._url("/api/v1/vault/claims")
        return self._post(url, payload)

    # -- Internals ----------------------------------------------------------

    def _url(self, path: str) -> str:
        base = self.config.base_url.rstrip("/")
        return f"{base}{path}"

    def _post(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._session.post(
                url, json=payload, timeout=self.config.request_timeout_s,
            )
        except requests.RequestException as e:
            raise VeritasError(f"POST {url} failed: {e}") from e
        return self._handle_response(response, url, "POST")

    def _get(self, url: str) -> dict[str, Any]:
        try:
            response = self._session.get(url, timeout=self.config.request_timeout_s)
        except requests.RequestException as e:
            raise VeritasError(f"GET {url} failed: {e}") from e
        return self._handle_response(response, url, "GET")

    @staticmethod
    def _handle_response(response: requests.Response, url: str, method: str) -> dict[str, Any]:
        if response.status_code == 401:
            raise VeritasError(f"{method} {url}: 401 unauthorized — check VERITAS_API_KEY")
        if response.status_code == 429:
            # Veritas rate-limits at 30/60s writes, 120/60s reads. We don't
            # retry here — the caller decides whether the call is critical
            # enough to back off and try again.
            raise VeritasError(f"{method} {url}: 429 rate-limited")
        if response.status_code >= 500:
            raise VeritasError(
                f"{method} {url}: {response.status_code} server error: "
                f"{response.text[:200]}"
            )
        if not response.ok:
            raise VeritasError(
                f"{method} {url}: {response.status_code} {response.reason}: "
                f"{response.text[:200]}"
            )
        try:
            return response.json()
        except ValueError as e:
            raise VeritasError(f"{method} {url}: response not JSON: {response.text[:200]}") from e


def iter_claim_ids(claims: Iterable[dict[str, Any]]) -> list[str]:
    """Helper for test code and logging — pull out the claim_ids in order."""
    return [c.get("claim_id", "") for c in claims]
