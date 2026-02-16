"""
Pydantic Models for Congress.gov API v3

Type-safe models for API responses we consume.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class CongressBillItem(BaseModel):
    """Individual bill item from sponsored/cosponsored legislation list."""
    
    congress: Optional[int] = None
    type: Optional[str] = None  # "hr", "s", "hjres", etc. (None for amendments)
    number: Optional[int] = None
    title: Optional[str] = None
    url: Optional[str] = None
    latestAction: Optional[dict] = None
    amendmentNumber: Optional[str] = None  # Present for amendments
    
    def is_bill(self) -> bool:
        """Check if this is a bill (not an amendment)."""
        return self.type is not None and self.number is not None and self.congress is not None
    
    def to_bill_id(self) -> str:
        """Convert to our internal bill_id format: hr1234-119"""
        if not self.is_bill():
            raise ValueError("Cannot convert amendment to bill_id")
        return f"{self.type.lower()}{self.number}-{self.congress}"
    
    class Config:
        # Allow extra fields from API we don't use
        extra = "allow"


class SponsoredLegislationResponse(BaseModel):
    """Response from /member/{bioguide}/sponsored-legislation endpoint."""
    
    sponsoredLegislation: Optional[List[CongressBillItem]] = Field(default_factory=list)
    cosponsoredLegislation: Optional[List[CongressBillItem]] = Field(default_factory=list)
    
    pagination: Optional[dict] = None
    
    class Config:
        extra = "allow"


class MemberInfo(BaseModel):
    """Basic member information from Congress.gov API."""
    
    bioguideId: str
    name: Optional[str] = None
    state: Optional[str] = None
    party: Optional[str] = None
    
    class Config:
        extra = "allow"


# Evidence models for our evaluation system
class EvidenceSignal(BaseModel):
    """Individual evidence signal in claim evaluation."""
    
    type: str  # "url_match", "title_overlap", "timing", etc.
    value: str
    weight: Optional[float] = 1.0
    
    def __str__(self) -> str:
        return f"{self.type}:{self.value}"


class ClaimEvidence(BaseModel):
    """Structured evidence for a claim-bill match."""
    
    signals: List[EvidenceSignal]
    score: float
    tier: str  # "strong", "moderate", "weak", "none"
    
    def to_json_list(self) -> List[str]:
        """Convert to list of strings for database storage."""
        return [str(signal) for signal in self.signals]
    
    @classmethod
    def from_json_list(cls, data: List[str], score: float, tier: str) -> "ClaimEvidence":
        """Parse from database JSON list."""
        signals = []
        for item in data:
            if ":" in item:
                type_, value = item.split(":", 1)
                signals.append(EvidenceSignal(type=type_, value=value))
        return cls(signals=signals, score=score, tier=tier)
