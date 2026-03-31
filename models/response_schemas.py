"""
Pydantic response models for the WeThePeople API.

These models document the exact shape of API responses and are used as
``response_model`` on endpoint decorators so that OpenAPI/Swagger docs
expose accurate schemas.  They intentionally mirror the dicts already
returned by each endpoint -- no behaviour changes.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 1. GET /health
# ---------------------------------------------------------------------------

class DatabaseStatus(BaseModel):
    connected: bool

class HealthResponse(BaseModel):
    status: str
    database: DatabaseStatus


# ---------------------------------------------------------------------------
# 2. GET /politics/dashboard/stats (alias: /dashboard/stats on politics router)
# ---------------------------------------------------------------------------

class PoliticsDashboardStats(BaseModel):
    total_people: int
    total_claims: int
    total_actions: int
    total_bills: int
    by_tier: Dict[str, int]
    match_rate: float


# ---------------------------------------------------------------------------
# 3. GET /people  (politics people directory)
# ---------------------------------------------------------------------------

class PersonListItem(BaseModel):
    person_id: str
    display_name: Optional[str] = None
    chamber: Optional[str] = None
    state: Optional[str] = None
    party: Optional[str] = None
    is_active: bool
    photo_url: Optional[str] = None
    ai_profile_summary: Optional[str] = None
    sanctions_status: Optional[str] = None

class PeopleListResponse(BaseModel):
    total: int
    people: List[PersonListItem]
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# 4. GET /people/{person_id}
# ---------------------------------------------------------------------------

class PersonDetailResponse(BaseModel):
    person_id: str
    display_name: Optional[str] = None
    bioguide_id: Optional[str] = None
    chamber: Optional[str] = None
    state: Optional[str] = None
    party: Optional[str] = None
    is_active: bool
    photo_url: Optional[str] = None
    ai_profile_summary: Optional[str] = None
    sanctions_status: Optional[str] = None


# ---------------------------------------------------------------------------
# 5. GET /finance/dashboard/stats
# ---------------------------------------------------------------------------

class FinanceDashboardStats(BaseModel):
    total_institutions: int
    total_filings: int
    total_financials: int
    total_complaints: int
    total_fred_observations: int
    total_press_releases: int
    total_lobbying: int
    total_lobbying_spend: float
    total_contracts: int
    total_contract_value: float
    total_enforcement: int
    total_penalties: float
    total_insider_trades: int
    by_sector: Dict[str, int]


# ---------------------------------------------------------------------------
# 6. GET /influence/stats
# ---------------------------------------------------------------------------

class SectorInfluenceBreakdown(BaseModel):
    lobbying: float
    contracts: float
    enforcement: int

class InfluenceStatsResponse(BaseModel):
    total_lobbying_spend: float
    total_contract_value: float
    total_enforcement_actions: int
    politicians_connected: int
    by_sector: Dict[str, SectorInfluenceBreakdown]


# ---------------------------------------------------------------------------
# 7. GET /search
# ---------------------------------------------------------------------------

class SearchPolitician(BaseModel):
    person_id: str
    name: Optional[str] = None
    state: Optional[str] = None
    party: Optional[str] = None
    chamber: Optional[str] = None
    photo_url: Optional[str] = None

class SearchCompany(BaseModel):
    entity_id: str
    name: Optional[str] = None
    ticker: Optional[str] = None
    sector: str

class SearchResponse(BaseModel):
    politicians: List[SearchPolitician]
    companies: List[SearchCompany]
    query: str


# ---------------------------------------------------------------------------
# 8. POST /claims/verify
# ---------------------------------------------------------------------------

class VerificationEvaluation(BaseModel):
    tier: str
    score: Optional[float] = None
    relevance: Optional[float] = None
    progress: Optional[float] = None
    timing: Optional[float] = None

class VerificationItem(BaseModel):
    """A single claim verification result."""
    claim_id: Optional[int] = None
    text: Optional[str] = None
    evaluation: Optional[VerificationEvaluation] = None
    extracted: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"

class TierCounts(BaseModel):
    strong: int = 0
    moderate: int = 0
    weak: int = 0
    unverified: int = 0

class VerificationResponse(BaseModel):
    entity_id: str
    entity_type: str
    entity_name: Optional[str] = None
    source_url: Optional[str] = None
    claims_extracted: int
    tier_counts: Optional[TierCounts] = None
    verifications: List[VerificationItem] = Field(default_factory=list)
    summary: str
    auth_tier: Optional[str] = None


# ---------------------------------------------------------------------------
# 9. POST /chat/ask  (ChatResponse already exists in routers/chat.py,
#    re-exported here for completeness)
# ---------------------------------------------------------------------------

class ChatActionSchema(BaseModel):
    type: str
    path: Optional[str] = None
    query: Optional[str] = None

class ChatResponseSchema(BaseModel):
    answer: str
    action: Optional[ChatActionSchema] = None
    cached: bool = False


# ---------------------------------------------------------------------------
# 10. GET /stories/latest
# ---------------------------------------------------------------------------

class StoryItem(BaseModel):
    id: int
    title: Optional[str] = None
    slug: Optional[str] = None
    summary: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    sector: Optional[str] = None
    entity_ids: Optional[list] = None
    data_sources: Optional[list] = None
    published_at: Optional[str] = None

class StoriesListResponse(BaseModel):
    stories: List[StoryItem]
