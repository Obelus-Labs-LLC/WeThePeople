# Leverage Stack: Validation and Usage Rules

**Updated:** February 5, 2026  
**Status:** ✅ Validated via PHASE 0 audit

## Package Inventory

### Required Packages (Must Be Wired)

#### 1. python-dotenv
**Purpose:** Environment variable management  
**Rule:** Load early in central config module, never sprinkled ad-hoc  
**Current Status:** ✅ COMPLIANT
- Installed: Yes
- Used in: 9 files
- Primary location: `utils/config.py` (centralized)
- Secondary usage: Test files, main.py (proper bootstrap)

**Architecture:**
```
utils/config.py → loads .env via load_dotenv()
↓
All other modules → import from config
```

**Violation indicators to watch:**
- ❌ `load_dotenv()` called in multiple places
- ❌ `os.getenv()` scattered throughout code without going through config
- ✅ Current state: Centralized in utils/config.py

---

#### 2. loguru (or std logging)
**Purpose:** Structured logging  
**Rule:** One logger setup, imported everywhere  
**Current Status:** ℹ️ NOT INSTALLED (optional)

**Planned architecture:**
```
utils/logger.py → configure loguru once
↓
All modules → from utils.logger import logger
```

**When to add:**
- Phase 1+ when Bronze/Silver/Gold layers need audit logs
- When debugging async operations
- When tracking lineage/provenance

**What to avoid:**
- Multiple logger configurations
- Direct print() statements in production code (OK in scripts)
- Logging to different files without coordination

---

#### 3. rich
**Purpose:** Terminal output formatting  
**Rule:** Only used in CLI layer for display, don't pollute core logic  
**Current Status:** ✅ COMPLIANT
- Installed: Yes
- Used in: 5 files
- **CLI layer:** cli/health_cmd.py, cli/groundtruth_cmd.py
- **Scripts:** scripts/audit_dependencies.py, jobs/sync_groundtruth_v2.py
- **Core logic:** ❌ NOT PRESENT (correct isolation)

**Architecture:**
```
cli/*.py → uses rich.Console, rich.Table for display
scripts/*.py → uses rich.progress for long-running operations
services/*.py → NO RICH (returns data, doesn't display)
models/*.py → NO RICH (pure data)
```

**Violation indicators to watch:**
- ❌ rich imports in services/ or models/
- ❌ rich.print() in matching logic
- ❌ Progress bars in reusable functions
- ✅ Current state: Properly contained in presentation layer

---

#### 4. typer
**Purpose:** CLI framework  
**Rule:** Single CLI entrypoint (python -m cli ...)  
**Current Status:** ✅ COMPLIANT
- Installed: Yes (0.21.1)
- Used in: 3 files
- **Entrypoint:** cli/__main__.py
- **Subcommands:** cli/health_cmd.py, cli/groundtruth_cmd.py

**Architecture:**
```
cli/__main__.py (main Typer app)
├── cli/health_cmd.py (health subcommands)
│   ├── health check
│   └── health deps
├── cli/groundtruth_cmd.py (groundtruth subcommands)
│   ├── groundtruth sync
│   └── groundtruth stats
└── [future] cli/quality_cmd.py, cli/cluster_cmd.py, etc.
```

**Command structure:**
```bash
python -m cli <group> <command> [options]
```

**Violation indicators to watch:**
- ❌ Multiple Typer apps in different files
- ❌ argparse mixed with Typer
- ❌ Direct sys.argv parsing in CLI commands
- ✅ Current state: Clean single-app architecture

---

#### 5. httpx + tenacity + diskcache
**Purpose:** Resilient HTTP client with retries and caching  
**Rule:** Central HTTP client wrapper, used everywhere for external APIs  
**Current Status:** ⚠️ PARTIAL
- **tenacity:** ✅ Installed, used in 1 file (utils/http_client.py)
- **diskcache:** ✅ Installed, used in 1 file (utils/http_client.py)
- **httpx:** ⚠️ Installed but unused (using requests instead)

**Architecture:**
```
utils/http_client.py (HTTPClient class)
├── diskcache → MD5 keying, 24hr TTL
├── tenacity → @retry decorator (exponential backoff)
└── requests → current HTTP library (could migrate to httpx)
```

**Usage pattern:**
```python
from utils.http_client import http_client

# API calls automatically get:
# - Retry logic (429/503 → retry, 401/403 → fail fast)
# - Disk caching (avoid redundant API calls)
# - Error handling (AuthError, RateLimitError, etc.)
data = http_client.get_congress_api("member/O000172/sponsored-legislation")
```

**Violation indicators to watch:**
- ❌ Direct `requests.get()` calls for Congress.gov API
- ❌ Manual retry loops
- ❌ Custom caching implementations
- ✅ Current state: Properly centralized in utils/http_client.py

**Future consideration:**
- Could migrate requests → httpx for async support
- Currently using requests (sync only)
- httpx installed but not wired yet

---

#### 6. pydantic
**Purpose:** Schema validation for API responses and evidence objects  
**Rule:** Validate at boundary (API responses, JSON fields)  
**Current Status:** ✅ COMPLIANT
- Installed: Yes (2.12.5)
- Used in: 1 file (utils/models.py)

**Current models:**
```python
# utils/models.py
class CongressBillItem(BaseModel):
    congress: int
    type: str
    number: int
    
    def to_bill_id(self) -> str:
        return f"{self.type.lower()}{self.number}-{self.congress}"

class SponsoredLegislationResponse(BaseModel):
    sponsoredLegislation: Optional[List[CongressBillItem]]
    cosponsoredLegislation: Optional[List[CongressBillItem]]

class EvidenceSignal(BaseModel):
    type: str
    value: str
    weight: int

class ClaimEvidence(BaseModel):
    signals: List[EvidenceSignal]
    score: float
    tier: str
```

**Planned expansion (Phase 4):**
```python
# Structured evidence objects
class URLMatchEvidence(EvidenceSignal):
    type: Literal["url_match"]
    bill_name: str
    confidence: float

class TimingEvidence(EvidenceSignal):
    type: Literal["timing"]
    category: Literal["retroactive_credit", "concurrent", "anticipatory"]
```

**Architecture:**
```
API boundary:
  Congress.gov JSON → Pydantic model → validated data

Evidence boundary:
  Matching logic → EvidenceSignal objects → structured JSON
```

**Violation indicators to watch:**
- ❌ Manual dict validation instead of Pydantic
- ❌ Pydantic models scattered across codebase
- ❌ Skipping validation for "trusted" sources
- ✅ Current state: Centralized in utils/models.py

---

## Compliance Summary

| Package | Required | Installed | Usage | Compliance |
|---------|----------|-----------|-------|------------|
| python-dotenv | Yes | ✅ | 9 files | ✅ Centralized |
| loguru | Optional | ❌ | 0 files | ℹ️ Not needed yet |
| rich | Yes | ✅ | 5 files | ✅ CLI layer only |
| typer | Yes | ✅ | 3 files | ✅ Single entrypoint |
| httpx | Optional | ✅ | 0 files | ℹ️ Not wired yet |
| tenacity | Yes | ✅ | 1 file | ✅ Isolated |
| diskcache | Yes | ✅ | 1 file | ✅ Isolated |
| pydantic | Yes | ✅ | 1 file | ✅ Centralized |

**Overall architecture health:** ✅ EXCELLENT

## Best Practices Checklist

### ✅ DO:
- [x] Import dotenv in utils/config.py only
- [x] Use rich only in CLI and scripts (presentation layer)
- [x] Use Typer for all CLI commands (single app)
- [x] Use http_client wrapper for all external APIs
- [x] Validate API responses with Pydantic models
- [x] Keep leverage stack imports isolated to specific modules

### ❌ DON'T:
- [ ] Scatter `load_dotenv()` calls throughout code
- [ ] Use rich in services/ or models/ (core logic)
- [ ] Create multiple Typer apps or mix with argparse
- [ ] Bypass http_client for direct API calls
- [ ] Use plain dicts for structured data (use Pydantic)
- [ ] Import leverage packages everywhere (keep isolated)

## Phase-by-Phase Wiring Plan

### Phase 0 (Current)
- ✅ Validated current usage with audit script
- ✅ Confirmed architecture compliance
- ✅ No sprawl detected

### Phase 1 (Bronze/Silver/Gold)
- Wire loguru for extraction pipeline logging
- Add Pydantic models for Silver documents
- Use rich.progress for Bronze/Silver batch processing

### Phase 2 (Source Quality)
- Pydantic models for quality_score_json
- Rich tables for quality reports
- CLI commands: `python -m cli quality score`

### Phase 3 (Provenance)
- Pydantic models for pipeline_runs
- CLI commands: `python -m cli runs latest`

### Phase 4 (Explainability)
- Pydantic models for structured evidence
- Rich JSON rendering for evidence display
- CLI commands: `python -m cli explain claim --id X`

### Phase 5 (Drift Detection)
- Loguru for drift alerts
- Rich diff tables for comparisons
- CLI commands: `python -m cli drift report`

### Phase 6 (Entity Resolution)
- Pydantic models for entity clusters
- CLI commands: `python -m cli cluster claims`

## Monitoring Guidelines

**Run dependency audit before each phase:**
```bash
python -m cli health deps
```

**Watch for violations:**
1. Installed but unused (dead dependencies)
2. Used but not in required list (missing validation)
3. Imports in wrong layers (architecture drift)

**Quality gate integration:**
- Dependency audit runs as Test 0
- Fails if required packages missing
- Warns if architecture violations detected (future enhancement)

---

**Last validated:** February 5, 2026  
**Next review:** After Phase 1 implementation
