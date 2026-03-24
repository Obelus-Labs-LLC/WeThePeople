# Services Architecture — Bounded Contexts (DDD)

This document maps the `services/` directory to Domain-Driven Design bounded
contexts. Files are NOT physically moved (that would break imports everywhere),
but this document records which context each file belongs to, its public API,
and the dependency rules between contexts.

---

## 1. Influence Context (`services/influence/`)

**Purpose**: Cross-sector relationship discovery — who lobbies whom, who
trades what, how money flows from industry to politics.

**Files**:
| File | Public API | Description |
|------|-----------|-------------|
| `influence_network.py` | `build_network(entity_id, depth)` | Force-directed graph of donations, lobbying, trades, bills, contracts |
| `closed_loop_detection.py` | `detect_closed_loops(db)` | Lobbying -> bill -> committee -> donations pipeline detection |
| `enrichment/bill_timeline.py` | `enrich_bill_timeline(bill_id)` | Augment bills with sponsor, committee, and vote timeline data |
| `enrichment/__init__.py` | — | Package init |

**Domain Events** (produced):
- `InfluenceEdgeDiscovered` — new relationship link found
- `ClosedLoopDetected` — full lobbying-to-donation cycle identified

**Dependencies**:
- Reads from: `models/database.py` (all entity and relationship tables)
- Reads from: `connectors/` (on-demand enrichment)
- No dependency on Verification or Auth contexts

---

## 2. Verification Context (`services/verification/`)

**Purpose**: Claim verification pipeline — accept user-submitted claims,
extract structured assertions via LLM, match against 9 data sources,
score and tier the evidence.

**Files**:
| File | Public API | Description |
|------|-----------|-------------|
| `claims/__init__.py` | — | Package init |
| `claims/pipeline.py` | `run_pipeline(claim_text, url)` | End-to-end orchestrator: ingest -> match -> evaluate |
| `claims/ingest.py` | `extract_claims(text)` | Claude-powered claim extraction from text/URL |
| `claims/match.py` | `match_claim(claim, db)` | 9 matchers: actions, votes, trades, lobbying, contracts, enforcement, donations, committees, SEC filings |
| `claims/evaluate.py` | `evaluate_claim(claim, matches)` | Scoring + tier computation (Strong/Moderate/Weak/Unverified) |
| `claims/similarity.py` | `fuzzy_title_match(a, b, threshold)` | Fuzzy string matching for evidence alignment |
| `evidence/validate.py` | `validate_evidence(evidence)` | Evidence quality checks |
| `evidence/__init__.py` | — | Package init |
| `extraction/extract_main_text.py` | `extract_main_text(url)` | Web page main content extraction |
| `extraction/__init__.py` | — | Package init |
| `llm/client.py` | `call_llm(prompt, model)` | Anthropic API client (Sonnet/Haiku) |
| `llm/prompts.py` | `CLAIM_EXTRACTION_PROMPT`, ... | Prompt templates |
| `llm/__init__.py` | — | Package init |

**Domain Events** (produced):
- `ClaimSubmitted` — new claim entered the pipeline
- `ClaimEvaluated` — claim scored and tiered

**Dependencies**:
- Reads from: `models/database.py` (claim + evaluation tables, entity data for matching)
- Calls: `connectors/` indirectly via match.py data queries
- Uses: `services/budget.py` for LLM cost tracking
- No dependency on Influence or Auth contexts

---

## 3. Sync Context (`services/sync/`)

**Purpose**: Data pipeline coordination — connectors, sync jobs, scheduling,
data quality, dead-letter queue, circuit breakers.

**Files**:
| File | Public API | Description |
|------|-----------|-------------|
| `circuit_breaker.py` | `get_breaker(name)`, `CircuitBreaker.call()` | Circuit breaker pattern for external API resilience |
| `budget.py` | `check_budget(project)`, `record_spend()` | Shared AI API budget ledger |
| `bill_text.py` | `fetch_bill_text(bill_id)` | Bill full-text retrieval from Congress.gov |
| `rate_limit.py` | `get_limiter()` | Rate limiting configuration |
| `rate_limit_store.py` | `RateLimitStore` | Persistent rate limit state |
| `data_retention.py` | `enforce_retention(db)` | Data retention policy enforcement |

**Related (not in services/ but part of this context)**:
| File | Description |
|------|-------------|
| `connectors/_base.py` | `@with_circuit_breaker` decorator |
| `connectors/*.py` | 30+ external API connectors |
| `jobs/*.py` | 45+ sync/ingestion scripts |
| `jobs/scheduler.py` | FastScheduler daemon |

**Dependencies**:
- Reads/writes: `models/database.py` (all data tables)
- Calls: external APIs via `connectors/`
- No dependency on Influence, Verification, or Auth contexts

---

## 4. Auth Context (`services/auth/`)

**Purpose**: Authentication, authorization, API key management, audit trail.

**Files**:
| File | Public API | Description |
|------|-----------|-------------|
| `auth.py` | `verify_api_key(key)`, `get_press_tier()` | Press-tier + enterprise API key verification |
| `jwt_auth.py` | `create_token(user)`, `verify_token(token)` | JWT token creation and validation |
| `rbac.py` | `check_permission(user, action)` | Role-based access control |
| `audit.py` | `log_audit_event(event)` | Audit trail logging |

**Related (not in services/ but part of this context)**:
| File | Description |
|------|-------------|
| `routers/auth.py` | Auth API endpoints |
| `middleware/security.py` | Security headers middleware |
| `middleware/tracing.py` | Request tracing middleware |
| `models/auth_models.py` | User, Role, APIKey models |

**Dependencies**:
- Reads/writes: `models/auth_models.py` (auth-specific tables)
- No dependency on Influence, Verification, or Sync contexts

---

## Dependency Rules

```
                    +-----------+
                    |   Auth    |
                    +-----+-----+
                          |
              (authenticates requests to)
                          |
          +-------+-------+--------+
          |       |                |
    +-----+--+ +--+------+ +------+------+
    |Influence| |  Verify | |    Sync     |
    +---------+ +---------+ +-------------+
```

1. **Auth is orthogonal** — it gates access to any context's endpoints but
   does not import from or depend on domain logic in other contexts.

2. **Influence and Verification are independent** — they share the same
   underlying database models but do not call each other's services.

3. **Sync feeds everyone** — connectors and jobs populate the data that
   Influence and Verification query. Sync never calls Influence or
   Verification services directly.

4. **Shared Kernel** — `models/database.py` and `utils/` are shared
   infrastructure used by all contexts. Changes to shared models require
   coordination across contexts.

5. **Anti-corruption layers** — each context accesses external APIs only
   through `connectors/`, wrapped by circuit breakers. Raw HTTP calls
   outside of connectors are prohibited.

---

## Future: Physical Separation

When the codebase grows large enough to warrant it, each context could
become its own Python package:

```
services/
  influence/
    __init__.py
    network.py
    closed_loop.py
    enrichment/
  verification/
    __init__.py
    pipeline.py
    claims/
    evidence/
    extraction/
    llm/
  sync/
    __init__.py
    circuit_breaker.py
    budget.py
    rate_limit.py
  auth/
    __init__.py
    jwt.py
    rbac.py
    audit.py
```

This would require updating all imports project-wide. Until then, this
document serves as the canonical reference for which files belong to
which bounded context.
