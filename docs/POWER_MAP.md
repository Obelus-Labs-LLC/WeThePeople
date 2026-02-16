# Power Map (Phase L3)

Date: 2026-02-05

## Purpose

The Power Map is a *derived* graph view designed for downstream use (analytics, API clients).

Constraints:
- **No invention**: every node/edge must be traceable to canonical ledger data.
- **No network calls**: must be deterministic in local SQLite.
- **Additive**: does not break existing endpoints/pipelines.

Gold (`gold_ledger`) is the canonical input for evaluation outputs.

## API

### `GET /powermap/person/{person_id}`

Query params:
- `limit` (default 200): max number of Gold rows to include.

Response contract:
```json
{
  "person_id": "chuck_schumer",
  "nodes": [
    {"id": "person:chuck_schumer", "type": "person", "label": "chuck_schumer"},
    {"id": "claim:123", "type": "claim", "label": "...", "tier": "moderate", "score": 50.0},
    {"id": "bill:hr3562-119", "type": "bill", "label": "DEFIANCE Act of 2025"},
    {"id": "policy:crime_and_law_enforcement", "type": "policy_area", "label": "Crime and Law Enforcement"}
  ],
  "edges": [
    {"source": "person:chuck_schumer", "target": "claim:123", "type": "made_claim"},
    {"source": "claim:123", "target": "bill:hr3562-119", "type": "matched_bill", "tier": "moderate", "score": 50.0},
    {"source": "claim:123", "target": "policy:crime_and_law_enforcement", "type": "policy_area"},
    {"source": "person:chuck_schumer", "target": "bill:hr3562-119", "type": "linked_to_bill", "count": 3, "score_sum": 151.0}
  ],
  "stats": {"gold_rows": 12, "nodes": 34, "edges": 60, "matched_bills": 5}
}
```

## Implementation

- Graph builder: `services/power_map/core.py` (`build_person_power_map()`)
- Endpoint: `main.py` (`/powermap/person/{person_id}`)

## Validation

- Unit test: `test_power_map_contract.py`
  - Enforces node/edge shape
  - Ensures no dangling edge references
- Invariants: `scripts/check_power_map_invariants.py`
  - Runs the builder for all `gold_ledger.person_id` values
  - Fails on duplicate node ids or dangling edges
