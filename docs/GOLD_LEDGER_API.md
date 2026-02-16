# Gold Ledger API (L4)

This phase adds **Gold-backed** API endpoints that read from the materialized `gold_ledger` table (see `jobs/build_gold_ledger.py`). These endpoints are **additive** and do not change existing legacy routes.

## Endpoints

### `GET /ledger/person/{person_id}`

Returns ledger entries for a single person.

Query params:
- `tier` (optional): filter entries by tier (e.g. `strong`, `moderate`, `weak`, `none`)
- `limit` (default `50`, max `500`)
- `offset` (default `0`)

Ordering:
- Deterministic order is: `claim_date` descending (NULLs last), then `claim_id` descending.

Pagination invariants:
- `total` reflects the total rows matching the filter (ignores `limit`/`offset`).
- `entries` may be empty when `offset >= total`.

Tier enum:
- Allowed values: `strong`, `moderate`, `weak`, `none`.
- Invalid `tier` returns HTTP 422 with a structured error payload.

Response shape:
```json
{
  "person_id": "...",
  "total": 123,
  "limit": 50,
  "offset": 0,
  "entries": [
    {
      "id": 1,
      "claim_id": "...",
      "evaluation_id": 1,
      "person_id": "...",
      "claim_date": "YYYY-MM-DD" ,
      "source_url": "...",
      "normalized_text": "...",
      "intent_type": "...",
      "policy_area": "...",
      "matched_bill_id": "...",
      "best_action_id": 123,
      "score": 0.0,
      "tier": "...",
      "relevance": "...",
      "progress": "...",
      "timing": "...",
      "evidence": { "...": "..." },
      "why": { "...": "..." },
      "created_at": "YYYY-MM-DDTHH:MM:SS"
    }
  ]
}
```

Notes:
- `evidence` and `why` are parsed from `evidence_json` / `why_json` when valid JSON; otherwise `null`.
- This endpoint is read-only and depends on `gold_ledger` being built.

### `GET /ledger/summary`

Returns a small aggregate summary.

Query params:
- `person_id` (optional): limit aggregation to a single person

Response shape:
```json
{
  "total": 123,
  "by_tier": {
    "strong": 10,
    "moderate": 20,
    "weak": 30,
    "none": 63
  }
}
```

## Gate coverage

- Contract tests: `python test_api_gold_ledger_contract.py`
- Wired into the quality gate: `scripts/run_gate.ps1`

## Testing note (no network)

FastAPI `TestClient` triggers startup events; the test suite sets `DISABLE_STARTUP_FETCH=1` to prevent any network calls during gate runs.
