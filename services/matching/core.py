# services/matching.py
"""
DEPRECATED: V1 claim-matching engine from the Public Accountability Ledger era.
Not used by the current WeThePeople civic transparency platform.
Production matching uses sector-specific SQL queries in routers/.
Kept for reference only.

Original description:
Single source of truth for claim matching and evidence framework.
Shared by API endpoints and batch jobs.
"""

import re
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from sqlalchemy import desc

from models.database import Claim, Action, SourceDocument, Vote, MemberVote, Bill, BillAction, TrackedMember, MemberBillGroundTruth
from utils.normalization import normalize_bill_id

# Import bill text helper for Phase 3.2
try:
    from services.bill_text import format_text_receipt
    BILL_TEXT_AVAILABLE = True
except ImportError:
    BILL_TEXT_AVAILABLE = False
    def format_text_receipt(*args, **kwargs):
        return None

# Import fuzzy matching (always available now)
from services.matching.similarity import fuzzy_title_match

# Lazy-load sentence-transformers (heavy import)
_SEMANTIC_MODEL = None
_SEMANTIC_AVAILABLE = None

def _get_semantic_model():
    """Lazy-load sentence-transformers model. Returns None if unavailable."""
    global _SEMANTIC_MODEL, _SEMANTIC_AVAILABLE
    if _SEMANTIC_AVAILABLE is False:
        return None
    if _SEMANTIC_MODEL is not None:
        return _SEMANTIC_MODEL
    try:
        from sentence_transformers import SentenceTransformer
        # WARNING: Loads ~500MB model into memory. May cause OOM on constrained VMs (4GB RAM).
        _SEMANTIC_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        _SEMANTIC_AVAILABLE = True
        return _SEMANTIC_MODEL
    except Exception:
        _SEMANTIC_AVAILABLE = False
        return None

logger = logging.getLogger(__name__)

STOPWORDS_BASE = {
    "the","a","an","and","or","but","if","then","so","to","of","in","on","for","with","as","at","by",
    "is","are","was","were","be","been","being","it","this","that","these","those","i","we","you","they",
    "he","she","them","his","her","our","your","their","from","will","would","can","could","should","may",
    "might","about","into","over","under","again","more","most","some","any","all","not","no","yes",
    # generic gov/legal noise
    "act","bill","resolution","joint","proposing","amendment","united","states",
    "provide","providing","consideration","relating","authority","direct","removal","purposes",
    "committee","committees","section","title","subtitle","chapter","subchapter"
}

# Boilerplate civic terms that don't prove specificity
BOILERPLATE_CIVIC_TERMS = {
    "congress","bill","act","legislation","law","house","senate","committee",
    "introduced","passed","vote","voted","voting","resolution","amendment",
    "proposing","provide","providing","consideration","relating","authority",
    "direct","removal","purposes","united","states","member","members"
}

# Policy area mapping for category-to-policy domain validation
# Maps claim categories to acceptable bill policy areas
CATEGORY_TO_POLICY_AREAS = {
    "finance_ethics": {
        "Finance and Financial Sector",
        "Economics and Public Finance",
        "Government Operations and Politics",
        "Congress",  # Congressional ethics/operations
        "Commerce",
    },
    "environment": {
        "Environmental Protection",
        "Energy",
        "Public Lands and Natural Resources",
        "Science, Technology, Communications",  # Climate tech
    },
    "healthcare": {
        "Health",
        "Labor and Employment",  # Employee health benefits
        "Economics and Public Finance",  # Healthcare funding
    },
    "immigration": {
        "Immigration",
        "International Affairs",  # Border/refugee issues
        "Labor and Employment",  # Work visas
    },
    "guns": {
        "Crime and Law Enforcement",
        "Armed Forces and National Security",  # Military weapons
        "Commerce",  # Gun sales regulation
    },
    "education": {
        "Education",
        "Labor and Employment",  # Student loans, workforce training
        "Economics and Public Finance",  # Education funding
    },
    "general": None,  # No filtering for general claims
    "unknown": None,
}

CATEGORY_PROFILES = {
    "general": {
        "stopwords_extra": set(),
        "strong_terms": set(),
        "phrase_boosts": [],
        "gate_terms": None,
        "claim_gate_terms": None,
        "min_score": 2.0,
    },
    "finance_ethics": {
        "stopwords_extra": {"congress","member","members"},
        "strong_terms": {
            "stock","stocks","trading","trade","trades","invest","investment","investments",
            "purchase","purchasing","sell","selling","financial","finance","insider","ethics",
            "conflict","conflicts","disclosure","divest","divestment",
            "prohibit","prohibiting","prohibition",
            "ban","banned","banning","restrict","restriction"
        },
        "phrase_boosts": [
            ("stock trading", 8.0),
            ("insider trading", 10.0),
            ("purchasing or selling", 8.0),
            ("certain investments", 6.0),
            ("conflict of interest", 8.0),
            ("members of congress", 3.0),
            ("financial disclosure", 6.0),
            ("blind trust", 6.0),
        ],
        "gate_terms": {
            "stock","stocks","trading","trade","investment","investments","purchase","purchasing","selling","sell",
            "financial","insider","ethics","disclosure","divest","trust"
        },
        "claim_gate_terms": {
            "stock","stocks","trading","trade","investment","investments","purchase","purchasing",
            "sell","selling","financial","insider","ethics","disclosure","divest","trust"
        },
        "min_score": 4.0,
    },
    "environment": {
        "stopwords_extra": {"congress","member","members"},
        "strong_terms": {
            "fracking","drilling","emissions","climate","carbon","oil","gas","pollution","epa","pipeline",
            "environmental","environment","fossil","renewable","solar","wind","energy",
            "ban","banned","banning","prohibit","prohibiting","restrict","restriction"
        },
        "phrase_boosts": [
            ("fracking ban", 10.0),
            ("greenhouse gas", 8.0),
            ("carbon emissions", 8.0),
            ("clean air", 6.0),
            ("clean water", 6.0),
        ],
        "gate_terms": None,
        "claim_gate_terms": None,
        "min_score": 3.0,
    },
    "healthcare": {
        "stopwords_extra": {"congress","member","members"},
        "strong_terms": {
            "healthcare","health","medical","medicine","insurance","medicare","medicaid",
            "hospital","hospitals","drug","drugs","pharmaceutical","pharma",
            "prescription","treatment","patients","doctors","nurses","coverage",
            "affordable","care","premiums","costs",
            "ban","banned","banning","prohibit","prohibiting","restrict","restriction"
        },
        "phrase_boosts": [
            ("affordable care", 10.0),
            ("health insurance", 8.0),
            ("prescription drug", 8.0),
            ("medical coverage", 8.0),
            ("medicare for all", 12.0),
            ("lower drug prices", 10.0),
            ("health care costs", 8.0),
        ],
        "gate_terms": {
            "healthcare","health","medical","insurance","medicare","medicaid",
            "drug","drugs","hospital","coverage","patients"
        },
        "claim_gate_terms": {
            "healthcare","health","medical","insurance","medicare","medicaid",
            "drug","drugs","coverage","hospital"
        },
        "min_score": 4.0,
        "weights": {"basic": 1.0, "enriched": 2.0},
    },
    "guns": {
        "stopwords_extra": {"congress","member","members"},
        "strong_terms": {
            "gun","guns","firearm","firearms","weapon","weapons",
            "background","checks","assault","rifle","rifles",
            "handgun","handguns","violence","shooting","shootings",
            "ammunition","magazine","carry","concealed","permit",
            "ban","banned","banning","prohibit","prohibiting","restrict","restriction"
        },
        "phrase_boosts": [
            ("background checks", 12.0),
            ("assault weapons", 12.0),
            ("gun violence", 10.0),
            ("universal background checks", 14.0),
            ("high capacity magazine", 10.0),
            ("concealed carry", 8.0),
        ],
        "gate_terms": {
            "gun","guns","firearm","firearms","weapon","weapons",
            "background","assault","rifle","handgun","violence"
        },
        "claim_gate_terms": {
            "gun","guns","firearm","firearms","weapon","weapons",
            "background","assault","violence"
        },
        "min_score": 4.0,
        "weights": {"basic": 1.0, "enriched": 2.0},
    },
    "immigration": {
        "stopwords_extra": {"congress","member","members"},
        "strong_terms": {
            "immigration","immigrant","immigrants","border","borders",
            "asylum","deportation","deport","visa","visas","citizenship",
            "naturalization","refugee","refugees","migrant","migrants",
            "detention","wall","customs","enforcement",
            "ban","banned","banning","prohibit","prohibiting","restrict","restriction"
        },
        "phrase_boosts": [
            ("border security", 10.0),
            ("pathway to citizenship", 12.0),
            ("immigration reform", 12.0),
            ("asylum seekers", 10.0),
            ("border wall", 8.0),
            ("deport undocumented", 10.0),
        ],
        "gate_terms": {
            "immigration","border","asylum","deport","visa",
            "citizenship","refugee","migrant","enforcement"
        },
        "claim_gate_terms": {
            "immigration","border","asylum","deport","visa",
            "citizenship","refugee","migrant"
        },
        "min_score": 4.0,
        "weights": {"basic": 1.0, "enriched": 2.0},
    },
}


def get_profile(category: str):
    if not category:
        return CATEGORY_PROFILES["general"]
    key = category.strip().lower()
    return CATEGORY_PROFILES.get(key, CATEGORY_PROFILES["general"])


def tokenize(text: str, stopwords: set) -> List[str]:
    if not text:
        return []
    parts = re.findall(r"[a-zA-Z0-9]+", text.lower())
    return [p for p in parts if len(p) >= 3 and p not in stopwords]


def extract_bill_name_from_url(url: str) -> Optional[str]:
    """
    Extract bill name hints from source URL slug.
    
    GUARDRAILS:
    - Only accepts URLs with at least one distinctive token (length >= 5, not in stoplist)
    - Filters generic terms like "act", "bill", "press", "release", "members", "calling"
    - Removes person names to prevent false matches
    
    Examples:
        .../pass-defiance-act -> "defiance act" (ACCEPTED - "defiance" is distinctive)
        .../introducing-safe-act -> "safe act" (REJECTED - "safe" too short, not distinctive)
        .../calling-pass-act -> None (REJECTED - only stopwords + "act")
        .../infrastructure-investment-jobs-act -> "infrastructure investment jobs act" (ACCEPTED)
    
    Returns distinctive phrase (not just "act") or None.
    """
    if not url:
        return None
    
    # Extract path slug (last segment before query/fragment)
    path = url.split('?')[0].split('#')[0]
    segments = path.split('/')
    
    # Get last non-empty segment
    slug = None
    for seg in reversed(segments):
        if seg and not seg.startswith('.'):
            slug = seg
            break
    
    if not slug:
        return None
    
    # Convert hyphens to spaces, lowercase
    phrase = slug.replace('-', ' ').lower()
    
    # Must contain "act" or "bill" 
    words = phrase.split()
    if 'act' not in words and 'bill' not in words:
        return None
    
    # Remove common prefixes/suffixes and generic terms
    stop_terms = {
        'the', 'of', 'to', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'for', 
        'pass', 'passing', 'calling', 'introduces', 'introduced', 'introducing',
        'support', 'supports', 'supporting', 'advocates', 'advocate', 'advocating',
        'join', 'joins', 'joined', 'members', 'member', 'house', 'senate', 'congress',
        'press', 'release', 'releases', 'statement', 'statements',
        'ocasio', 'cortez', 'lee', 'sanders', 'bernie', 'aoc'  # Remove person names
    }
    
    # GUARDRAIL: Require at least one distinctive token (length >= 5, not in stoplist)
    has_distinctive = False
    for w in words:
        if w not in stop_terms and w not in ('act', 'bill') and len(w) >= 5:
            has_distinctive = True
            break
    
    if not has_distinctive:
        return None
    
    # Keep only meaningful words
    distinctive_words = [w for w in words if w not in stop_terms and len(w) > 2]
    
    if not distinctive_words:
        return None
    
    # If we have "act"/"bill" + distinctive words, extract just those
    # Look for pattern: [distinctive words] + act/bill
    anchor = 'act' if 'act' in words else 'bill'
    anchor_index = words.index(anchor)

    # Take 2-3 words before the anchor (if they're distinctive)
    start_index = max(0, anchor_index - 3)
    candidate_words = words[start_index:anchor_index + 1]

    # Filter to distinctive only
    final_words = [w for w in candidate_words if w not in stop_terms]
    final_words.append(anchor)  # Always include anchor word

    if len(final_words) <= 1:  # Just "act"/"bill"
        return None

    return ' '.join(final_words)


def normalize_title_for_matching(title: str) -> str:
    """
    Normalize bill title for fuzzy matching.
    - Lowercase
    - Remove punctuation
    - Remove "of 2024", "of 2025", etc.
    - Collapse whitespace
    """
    if not title:
        return ""
    
    normalized = title.lower()
    
    # Remove year suffixes
    normalized = re.sub(r'\s+of\s+20\d{2}\s*$', '', normalized)
    
    # Remove punctuation
    normalized = re.sub(r'[^\w\s]', ' ', normalized)
    
    # Collapse whitespace
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    return normalized


# -------------------------
# Bill Name Extraction from Claim Text
# -------------------------

# Pattern A: Capitalized words (with lowercase connectors) ending in "Act"
# Handles: "Inflation Reduction Act", "Anti-Corruption and Public Integrity Act"
_ACT_NAME_STANDARD = re.compile(
    r'\b((?:[A-Z][A-Za-z-]+(?:\s+(?:and|for|of|the|on|in|to)\s+|\s+)){0,7}[A-Z][A-Za-z-]+\s+Act)\b'
)

# Pattern B: ALL-CAPS acronym(s) + "Act"
# Handles: "CARES Act", "TAKE IT DOWN Act", "DEFIANCE Act"
_ACT_NAME_ACRONYM = re.compile(
    r'\b((?:[A-Z]{2,}\s+)*[A-Z]{2,}\s+Act)\b'
)

# Pattern C: Parenthetical acronym before "Act"
# Handles: "...Essentials (AWARE) Act" -> extracts "AWARE Act"
_ACT_NAME_PAREN = re.compile(
    r'\(([A-Z]{2,})\)\s*Act\b'
)

# Pattern: explicit bill numbers like "H.R. 3562", "S. 1234", "H.J.Res. 5"
_BILL_NUMBER_PATTERN = re.compile(
    r'\b(H\.?\s*R\.?|S\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?)\s*(\d{1,5})\b',
    re.IGNORECASE,
)

def extract_bill_names_from_text(text: str) -> List[str]:
    """
    Extract bill names and numbers directly from claim text.

    Returns normalized lowercase names suitable for fuzzy matching against bill titles.
    Examples:
        "I fought for the DEFIANCE Act" -> ["defiance act"]
        "We passed H.R. 3562" -> ["hr3562"]
        "the Inflation Reduction Act of 2022" -> ["inflation reduction act"]
        "the (AWARE) Act" -> ["aware act"]
        "Anti-Corruption and Public Integrity Act" -> ["anti-corruption and public integrity act"]
    """
    if not text:
        return []

    results = []
    seen = set()

    def _add(name: str):
        normalized = normalize_title_for_matching(name)
        if normalized and normalized not in seen and len(normalized.split()) >= 2:
            # Skip if only stopwords + Act
            words = normalized.split()
            distinctive = [w for w in words if w not in STOPWORDS_BASE and len(w) >= 3]
            if distinctive:
                seen.add(normalized)
                results.append(normalized)

    # Pattern A: Standard capitalized names with connectors
    for m in _ACT_NAME_STANDARD.finditer(text):
        _add(m.group(1).strip())

    # Pattern B: ALL-CAPS acronym names
    for m in _ACT_NAME_ACRONYM.finditer(text):
        _add(m.group(1).strip())

    # Pattern C: Parenthetical acronyms -> "ACRONYM Act"
    for m in _ACT_NAME_PAREN.finditer(text):
        _add(f"{m.group(1)} Act")

    # Extract explicit bill numbers
    for m in _BILL_NUMBER_PATTERN.finditer(text):
        bill_type = re.sub(r'[\s.]', '', m.group(1)).lower()  # "H.R." -> "hr"
        bill_num = m.group(2)
        results.append(f"{bill_type}{bill_num}")

    return results


def contains_gate_signal(text: str, gate_terms: set, stopwords: set) -> bool:
    toks = set(tokenize(text or "", stopwords))
    return len(toks.intersection(gate_terms)) > 0


def contains_claim_signal(claim_text: str, claim_gate_terms: set, stopwords: set) -> bool:
    toks = set(tokenize(claim_text or "", stopwords))
    return len(toks.intersection(claim_gate_terms)) > 0


PROCEDURAL_PHRASES = [
    "providing for the consideration of",
    "rule provides for consideration of",
    "waiving a requirement",
    "waiving the requirement",
    "providing for proceedings",
    "providing for debate",
    "on agreeing to the resolution",
    "house resolution",
]


def is_procedural_action(action: dict) -> bool:
    title = (action.get("title") or "").lower()
    return any(p in title for p in PROCEDURAL_PHRASES)


def score_action_against_claim(claim_text: str, action_title: str, action_summary: str, meta: dict, profile: dict, claim_source_url: str = None, skip_semantic: bool = False) -> dict:
    """
    Score how well an action matches a claim.
    
    Now includes:
    - URL-based bill name hints
    - Exact/fuzzy title matching
    - Original token overlap scoring
    """
    stopwords = STOPWORDS_BASE.union(profile["stopwords_extra"])
    strong_terms = profile["strong_terms"]
    phrase_boosts = profile["phrase_boosts"]

    claim_tokens = set(tokenize(claim_text, stopwords))

    title = (action_title or "")
    summary = (action_summary or "")
    hay = f"{title} {summary}".lower()
    hay_tokens = set(tokenize(hay, stopwords))

    enriched = (meta or {}).get("enriched") if isinstance(meta, dict) else None
    enriched_text = ""
    if isinstance(enriched, dict):
        policy_area = enriched.get("policy_area") or ""
        latest = enriched.get("latest_action") or {}
        latest_text = latest.get("text") if isinstance(latest, dict) else ""
        enriched_title = enriched.get("title") or ""
        enriched_text = f"{policy_area} {latest_text} {enriched_title}".lower()

    enriched_tokens = set(tokenize(enriched_text, stopwords))

    overlap_basic = claim_tokens.intersection(hay_tokens)
    overlap_enriched = claim_tokens.intersection(enriched_tokens)

    def weighted(tokens: set) -> float:
        s = 0.0
        for t in tokens:
            s += 2.0 if t in strong_terms else 1.0
        return s

    score = weighted(overlap_basic) * 1.0 + weighted(overlap_enriched) * 2.0

    combined = (hay + " " + enriched_text).lower()
    phrase_hits = []
    for phrase, boost in phrase_boosts:
        if phrase in combined:
            score += boost
            phrase_hits.append(phrase)
    
    # NEW: URL-based bill name matching
    url_boost = 0.0
    url_hint = None
    if claim_source_url:
        url_hint = extract_bill_name_from_url(claim_source_url)
        if url_hint:
            # Normalize both title and URL hint
            normalized_title = normalize_title_for_matching(title)
            normalized_hint = normalize_title_for_matching(url_hint)
            
            # Check for exact phrase match
            if normalized_hint in normalized_title or normalized_title in normalized_hint:
                url_boost = 50.0  # Strong boost for URL-title match
                phrase_hits.append(f"url_match:{url_hint}")
            # Check for substantial word overlap
            else:
                hint_words = set(normalized_hint.split())
                title_words = set(normalized_title.split())
                overlap = hint_words.intersection(title_words)
                if len(overlap) >= 2:  # At least 2 distinctive words match
                    url_boost = 25.0  # Moderate boost
                    phrase_hits.append(f"url_partial:{url_hint}")
    
    score += url_boost

    # NEW: Fuzzy title matching (claim text vs action/bill title)
    fuzzy_boost = 0.0
    full_title = title
    if isinstance(enriched, dict) and enriched.get("title"):
        full_title = enriched.get("title") or title
    if full_title and claim_text:
        normalized_claim = normalize_title_for_matching(claim_text)
        normalized_full_title = normalize_title_for_matching(full_title)
        if normalized_claim and normalized_full_title:
            fuzzy_result = fuzzy_title_match(
                normalized_claim, normalized_full_title,
                threshold=0.65,  # Moderate threshold to catch more matches
                method="token_sort_ratio",
            )
            if fuzzy_result["matched"]:
                fuzzy_boost = min(fuzzy_result["score"] * 30.0, 25.0)  # Up to 25 pts
                phrase_hits.append(f"fuzzy_title_match:{fuzzy_result['score']:.2f}:{fuzzy_result['threshold']}")
    score += fuzzy_boost

    # NEW: Bill name extraction from claim text
    claim_bill_boost = 0.0
    extracted_names = extract_bill_names_from_text(claim_text)
    if extracted_names and full_title:
        normalized_full_title = normalize_title_for_matching(full_title)
        for name in extracted_names:
            # Check if extracted name matches action title
            if name in normalized_full_title or normalized_full_title in name:
                claim_bill_boost = 40.0
                phrase_hits.append(f"claim_text_bill_name:{name}")
                break
            # Check partial word overlap (at least 2 distinctive words)
            name_words = set(name.split()) - STOPWORDS_BASE
            title_words = set(normalized_full_title.split()) - STOPWORDS_BASE
            shared = name_words.intersection(title_words)
            if len(shared) >= 2:
                claim_bill_boost = 25.0
                phrase_hits.append(f"claim_text_bill_name:{name}")
                break
    score += claim_bill_boost

    # NEW: Semantic similarity (lazy-loaded, 0 cost if unavailable)
    # Skipped on first pass for performance; applied in second pass on top candidates only
    semantic_boost = 0.0
    if not skip_semantic:
        model = _get_semantic_model()
        if model is not None and claim_text and (title or summary):
            try:
                from sentence_transformers import util as st_util
                action_text = f"{title or ''} {summary or ''}"
                embeddings = model.encode([claim_text, action_text], convert_to_tensor=True)
                cosine_score = st_util.cos_sim(embeddings[0], embeddings[1]).item()
                if cosine_score >= 0.55:
                    semantic_boost = min(cosine_score * 30.0, 20.0)  # Up to 20 pts
                    phrase_hits.append(f"semantic_similarity:{cosine_score:.2f}")
            except Exception:
                pass  # Graceful degradation
    score += semantic_boost

    return {
        "score": score,
        "claim_tokens": sorted(list(claim_tokens))[:50],
        "overlap_basic": sorted(list(overlap_basic))[:25],
        "overlap_enriched": sorted(list(overlap_enriched))[:25],
        "phrase_hits": phrase_hits[:25],
        "url_boost": url_boost,
        "url_hint": url_hint,
        "fuzzy_boost": fuzzy_boost,
        "claim_bill_boost": claim_bill_boost,
        "semantic_boost": semantic_boost,
    }


# -------------------------
# Evidence Framework Logic
# -------------------------

LEGISLATIVE_PROGRESS_ORDER = [
    "introduced",
    "passed_committee",
    "passed_chamber",
    "enacted",
]


def classify_progress(action: dict) -> str:
    """
    Best-effort classification using latest_action_text.
    If we don't have action text, return 'unknown' (do not guess).
    """
    text = (action.get("latest_action_text") or "").lower()

    if not text:
        return "unknown"

    if "became public law" in text or "became law" in text or "signed by the president" in text:
        return "enacted"

    if "passed house" in text or "passed the house" in text or "passed senate" in text or "passed the senate" in text:
        return "passed_chamber"

    if "committee" in text or "ordered to be reported" in text or "reported to" in text:
        return "passed_committee"

    # fallback: if we have action text but no stronger signal
    return "introduced"


def classify_timing(claim_date, action_date):
    try:
        c = datetime.fromisoformat(claim_date)
        a = datetime.fromisoformat(action_date)
    except Exception:
        return "unknown"

    if a >= c:
        return "follow_through"
    return "retroactive_credit"


def classify_relevance(score, overlap_basic, overlap_enriched, phrase_hits):
    """
    Relevance is about semantic connection between claim and action.
    Now recognizes fuzzy, bill name, and semantic signals as evidence of relevance.
    """
    overlap_basic = overlap_basic or []
    overlap_enriched = overlap_enriched or []
    phrase_hits = phrase_hits or []

    has_basic = len(overlap_basic) > 0
    has_enriched = len(overlap_enriched) > 0
    has_overlap = has_basic or has_enriched

    # New signal types that prove relevance even without token overlap
    has_fuzzy = any(p.startswith('fuzzy_title_match:') for p in phrase_hits)
    has_claim_bill = any(p.startswith('claim_text_bill_name:') for p in phrase_hits)
    has_url_match = any(p.startswith('url_match:') for p in phrase_hits)
    def _safe_parse_score(p):
        try:
            return float(p.split(':')[1])
        except (IndexError, ValueError):
            return 0.0

    has_semantic_high = any(
        p.startswith('semantic_similarity:') and _safe_parse_score(p) >= 0.70
        for p in phrase_hits
        if p.startswith('semantic_similarity:')
    )

    # Strong signals prove high relevance
    if has_claim_bill or has_url_match:
        return "high"

    if has_fuzzy or has_semantic_high:
        return "high"

    # Enriched token overlap is high relevance
    if has_enriched:
        return "high"

    # Moderate semantic similarity (0.55-0.70) + any overlap is medium
    has_semantic_any = any(p.startswith('semantic_similarity:') for p in phrase_hits)
    if has_semantic_any and has_overlap:
        return "high"

    if has_semantic_any:
        return "medium"

    # Phrase-only with no overlap is low relevance
    if not has_overlap:
        return "low" if score and score > 0 else "none"

    # Basic-only overlap
    if has_basic:
        return "medium"

    return "none"


def resolve_evidence_tier(relevance, progress, timing, score, overlap_basic, overlap_enriched, phrase_hits=None):
    """
    Conservative tier classification:
    - strong requires: high relevance + meaningful progress + follow_through
    - moderate requires: real overlap AND (score >= 4 OR relevance is high)
    - phrase-only matches cap at weak
    
    URL matches (url_match: prefix in phrase_hits) are treated as strong evidence.
    """
    overlap_basic = overlap_basic or []
    overlap_enriched = overlap_enriched or []
    phrase_hits = phrase_hits or []

    has_overlap = (len(overlap_basic) + len(overlap_enriched)) > 0

    # URL matches with exact bill name are treated as strong evidence
    has_url_match = any(p.startswith('url_match:') for p in phrase_hits)
    if has_url_match and score and score >= 50.0:
        has_overlap = True

    # Fuzzy title match, claim text bill name, and semantic similarity count as overlap
    has_fuzzy = any(p.startswith('fuzzy_title_match:') for p in phrase_hits)
    has_claim_bill = any(p.startswith('claim_text_bill_name:') for p in phrase_hits)
    has_semantic = any(p.startswith('semantic_similarity:') for p in phrase_hits)
    if has_fuzzy or has_claim_bill or has_semantic:
        has_overlap = True
    
    phrase_only = (not has_overlap) and (len(phrase_hits) > 0)

    # Strong: high relevance + real progress + follow-through
    if (
        relevance == "high"
        and progress in {"passed_committee", "passed_chamber", "enacted"}
        and timing == "follow_through"
    ):
        return "strong"

    # Moderate: requires overlap (no exceptions)
    if progress in {"introduced", "passed_committee", "passed_chamber", "enacted"}:
        if not has_overlap:
            # Phrase-only or zero-signal: never moderate
            return "weak" if (score and score > 0) else "none"

        # If overlap exists, require either strong score or high relevance
        if relevance == "high" or (score is not None and score >= 4.0):
            return "moderate"

        # Overlap exists but weak signal
        return "weak" if (score and score > 0) else "none"

    # Low relevance never above weak
    if relevance == "low" or phrase_only:
        return "weak" if (score and score > 0) else "none"

    return "none"


def apply_boilerplate_guardrail(tier: str, claim: Claim, overlap_basic: List[str], overlap_enriched: List[str], phrase_hits: List[str] = None) -> str:
    """
    Boilerplate overlap guardrail for general/unknown intent claims.
    
    Prevents false matches on generic civic terms like "congress", "legislation", "bill".
    
    Rule:
    - If claim.category in {"general","unknown"} OR claim.intent is null:
      - Disallow moderate and strong entirely
      - Allow weak only if overlap contains at least one domain-specific token
      - If overlap is only boilerplate → tier = none
    
    Exception: URL matches (url_match: in phrase_hits) bypass this guardrail.
    
    Args:
        tier: Computed tier from resolve_evidence_tier
        claim: Claim object
        overlap_basic: Basic token overlap
        overlap_enriched: Enriched token overlap
        phrase_hits: Phrase matches (for URL match detection)
        
    Returns:
        Adjusted tier (downgraded if necessary)
    """
    phrase_hits = phrase_hits or []
    
    # Strong evidence signals bypass boilerplate guardrail
    has_url_match = any(p.startswith('url_match:') for p in phrase_hits)
    has_claim_bill = any(p.startswith('claim_text_bill_name:') for p in phrase_hits)
    has_fuzzy = any(p.startswith('fuzzy_title_match:') for p in phrase_hits)
    def _safe_parse_score_boilerplate(p):
        try:
            return float(p.split(':')[1])
        except (IndexError, ValueError):
            return 0.0

    has_semantic = any(
        p.startswith('semantic_similarity:') and _safe_parse_score_boilerplate(p) >= 0.70
        for p in phrase_hits
        if p.startswith('semantic_similarity:')
    )
    if has_url_match or has_claim_bill or has_fuzzy or has_semantic:
        return tier

    # Only apply guardrail to general/unknown claims or claims with no intent
    if claim.category not in {"general", "unknown"} and claim.intent:
        return tier

    # For general/unknown: allow moderate if overlap has domain-specific tokens
    # (not just boilerplate civic terms)
    all_overlap = set(overlap_basic + overlap_enriched)
    non_boilerplate = all_overlap - BOILERPLATE_CIVIC_TERMS
    if tier in {"moderate", "strong"} and non_boilerplate:
        # Has real domain-specific overlap, allow moderate (cap strong→moderate)
        tier = "moderate" if tier == "strong" else tier
    elif tier in {"moderate", "strong"}:
        tier = "weak"
    
    # Check if overlap is only boilerplate
    all_overlap = set(overlap_basic + overlap_enriched)
    non_boilerplate = all_overlap - BOILERPLATE_CIVIC_TERMS
    
    # If only boilerplate overlap, downgrade to none
    if all_overlap and not non_boilerplate:
        return "none"
    
    return tier


def apply_policy_area_mismatch_filter(tier: str, claim: Claim, policy_area: Optional[str]) -> str:
    """
    Policy area mismatch filter - blocks matches from unrelated policy domains.
    
    Prevents matching bills that are clearly in the wrong policy area.
    Example: finance_ethics claim should not match "International Affairs" bills.
    
    Rule:
    - If claim has a specific category AND bill has a policy_area
    - Check if policy_area is in the valid set for that category
    - If mismatch: hard-block by returning tier="none"
    
    This is defensible: not judging truth, just filtering wrong policy domains.
    
    Args:
        tier: Current evidence tier
        claim: Claim object
        policy_area: Bill's policy area (from Congress.gov)
        
    Returns:
        Adjusted tier (downgraded to "none" if policy mismatch)
    """
    # Skip if no category, general category, or no policy area to check
    if not claim.category or claim.category in {"general", "unknown"}:
        return tier
    
    if not policy_area:
        # No policy area on bill - can't verify, allow through
        return tier
    
    # Get valid policy areas for this category
    valid_areas = CATEGORY_TO_POLICY_AREAS.get(claim.category)
    
    if valid_areas is None:
        # Category not in mapping - allow through
        return tier
    
    # Check if policy area matches
    if policy_area not in valid_areas:
        # Hard block: wrong policy domain
        return "none"
    
    return tier


# -------------------------
# Auto-Classification & Intent Detection
# -------------------------

INTENT_PATTERNS = {
    "sponsored": ["introduced", "sponsored", "authored", "co-sponsored"],
    "voted_for": ["voted for", "supported", "backed", "championed"],
    "voted_against": ["voted against", "opposed", "blocked", "rejected"],
    "funded": ["funded", "allocated", "secured funding"],
    "passed": ["passed", "enacted", "got through"],
}


def auto_classify_claim(claim_text: str) -> List[Tuple[str, float]]:
    """
    Returns sorted [(category, confidence), ...]

    Uses strong_terms + phrase matching from category profiles to detect category signals.
    Improved to catch claims with phrase-level signals even when individual tokens miss.
    """
    text_lower = (claim_text or "").lower()
    tokens = set(tokenize(claim_text or "", STOPWORDS_BASE))
    raw_scores: Dict[str, float] = {}

    for category, profile in CATEGORY_PROFILES.items():
        if category == "general":
            continue

        # Token-level: strong_terms overlap
        signal_terms = profile.get("strong_terms") or set()
        overlap = tokens.intersection(signal_terms)
        token_score = float(len(overlap))

        # Phrase-level: check phrase_boosts against full claim text
        phrase_score = 0.0
        for phrase, boost in profile.get("phrase_boosts", []):
            if phrase in text_lower:
                phrase_score += 1.0  # Count matched phrases (not boost magnitude)

        raw_scores[category] = token_score + phrase_score

    total = sum(raw_scores.values())

    if total == 0:
        return [("general", 1.0)]

    results = [
        (cat, score / total)
        for cat, score in raw_scores.items()
        if score > 0
    ]

    return sorted(results, key=lambda x: x[1], reverse=True)


def detect_intent(claim_text: str) -> str:
    text = (claim_text or "").lower()
    for intent, patterns in INTENT_PATTERNS.items():
        if any(p in text for p in patterns):
            return intent
    return "unknown"


# -------------------------
# Vote Matching (Phase 2)
# -------------------------

def match_votes_for_claim(claim: Claim, db, limit: int = 25) -> Dict[str, Any]:
    """
    Match vote claims against actual roll call vote records.
    
    Args:
        claim: Claim object with vote intent
        db: Database session
        limit: Max matches to return
        
    Returns:
        Dictionary with claim, matches, and metadata
    """
    intent = claim.intent or detect_intent(claim.text)
    expected_position = "Yea" if intent == "voted_for" else "Nay"
    
    # Tokenize claim for matching against vote questions
    claim_tokens = set(tokenize(claim.text, STOPWORDS_BASE))
    
    # Query member votes for this person
    results = (
        db.query(MemberVote, Vote)
          .join(Vote, MemberVote.vote_id == Vote.id)
          .filter(MemberVote.person_id == claim.person_id)
          .order_by(desc(Vote.vote_date))
          .limit(500)
          .all()
    )
    
    if not results:
        return {
            "claim": {
                "id": claim.id,
                "person_id": claim.person_id,
                "text": claim.text,
                "category": claim.category,
                "intent": intent,
                "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                "claim_source_url": claim.claim_source_url,
            },
            "matches": [],
            "note": f"Vote claim detected (intent={intent}). No votes found for {claim.person_id} in database."
        }
    
    # Score each vote
    scored = []
    for member_vote, vote in results:
        # Basic scoring: tokenize vote question + related bill info
        vote_text = f"{vote.question or ''} {vote.related_bill_type or ''} {vote.related_bill_number or ''}"
        vote_tokens = set(tokenize(vote_text, STOPWORDS_BASE))
        
        overlap = claim_tokens.intersection(vote_tokens)
        score = len(overlap)
        
        # Bonus if vote position matches expected intent
        position_match = member_vote.position == expected_position
        if position_match:
            score += 2.0
        
        # Classify evidence
        progress = "voted"  # All of these are votes
        
        timing = classify_timing(
            claim.claim_date.isoformat() if claim.claim_date else None,
            vote.vote_date.isoformat() if vote.vote_date else None
        )
        
        # Relevance based on overlap
        if len(overlap) >= 2:
            relevance = "high"
        elif len(overlap) >= 1:
            relevance = "medium"
        else:
            relevance = "low"
        
        # Tier classification for votes
        tier = "none"
        if position_match and relevance in ("high", "medium"):
            if vote.result in ("Passed", "Agreed to"):
                tier = "strong"
            else:
                tier = "moderate"
        elif position_match:
            tier = "weak"
        
        scored.append({
            "score": score,
            "vote": {
                "id": vote.id,
                "congress": vote.congress,
                "chamber": vote.chamber,
                "roll_number": vote.roll_number,
                "question": vote.question,
                "vote_date": vote.vote_date.isoformat() if vote.vote_date else None,
                "result": vote.result,
                "related_bill": f"{vote.related_bill_type} {vote.related_bill_number}" if vote.related_bill_type else None,
                "source_url": vote.source_url,
                "yea_count": vote.yea_count,
                "nay_count": vote.nay_count,
            },
            "member_position": member_vote.position,
            "position_match": position_match,
            "evidence": {
                "tier": tier,
                "relevance": relevance,
                "progress": progress,
                "timing": timing,
            },
            "why": {
                "claim_tokens": list(claim_tokens),
                "vote_tokens": list(vote_tokens),
                "overlap": list(overlap),
                "expected_position": expected_position,
                "actual_position": member_vote.position,
            }
        })
    
    # Sort by score
    scored.sort(key=lambda x: x["score"], reverse=True)
    
    return {
        "claim": {
            "id": claim.id,
            "person_id": claim.person_id,
            "text": claim.text,
            "category": claim.category,
            "intent": intent,
            "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            "claim_source_url": claim.claim_source_url,
        },
        "matches": scored[:limit],
        "total_votes_available": len(results),
        "note": f"Vote evidence matched. Expected position: {expected_position}."
    }


# -------------------------
# Main Matching Function
# -------------------------

def compute_matches_for_claim(
    claim: Claim,
    db,
    limit: int = 25,
) -> Dict[str, Any]:
    """
    Single source of truth for matching a claim to actions.
    Returns the exact structure the /claims/{id}/matches endpoint returns.
    
    Intent-aware: vote claims require vote records, not bill sponsorships.
    """
    profile = get_profile(claim.category)
    stopwords = STOPWORDS_BASE.union(profile["stopwords_extra"])
    
    # INTENT GATING: Vote claims require vote records (Phase 2 safety)
    intent = claim.intent or detect_intent(claim.text)
    if intent in ("voted_for", "voted_against"):
        # Vote claims must match against vote records, not bill sponsorships
        return match_votes_for_claim(claim, db, limit)

    # Check claim-side gate (category-specific signal terms)
    claim_gate_terms = profile.get("claim_gate_terms")
    if claim_gate_terms is not None:
        if not contains_claim_signal(claim.text, claim_gate_terms, stopwords):
            return {
                "claim": {
                    "id": claim.id,
                    "person_id": claim.person_id,
                    "text": claim.text,
                    "category": claim.category,
                    "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                    "claim_source_url": claim.claim_source_url,
                },
                "profile_used": claim.category or "general",
                "min_score": float(profile.get("min_score", 2.0)),
                "matches": [],
                "note": "Claim missing category signal terms; refusing to match vague claim."
            }

    # Pull candidate actions: same person_id, with source_url joined in
    # GROUND TRUTH RAIL: Constrain to member's actual bills when available
    
    # Get member's bioguide_id
    member = db.query(TrackedMember).filter(TrackedMember.person_id == claim.person_id).first()
    bioguide_id = member.bioguide_id if member else None
    
    # Get ground truth bill_ids if available
    ground_truth_bill_ids = None
    if bioguide_id:
        gt_records = db.query(MemberBillGroundTruth.bill_id).filter(
            MemberBillGroundTruth.bioguide_id == bioguide_id
        ).all()
        if gt_records:
            ground_truth_bill_ids = {r[0] for r in gt_records}
    
    # Base query: same person_id
    query = (
        db.query(Action, SourceDocument.url)
          .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
          .filter(Action.person_id == claim.person_id)
    )

    # Apply ground truth constraint if available
    rows = []
    if ground_truth_bill_ids:
        # Build bill_id from action columns
        # Filter to only bills in the ground truth set
        for action, url in query.order_by(desc(Action.date)).limit(2000).all():
            if action.bill_congress and action.bill_type and action.bill_number:
                action_bill_id = f"{action.bill_type.lower()}{action.bill_number}-{action.bill_congress}"
                if action_bill_id in ground_truth_bill_ids:
                    rows.append((action, url))
    else:
        # No ground truth available, use all actions for this person
        rows = query.order_by(desc(Action.date)).limit(2000).all()

    # GROUND TRUTH FALLBACK: If person has 0 actions but has ground truth bills,
    # search for actions on those bills from ANY person. This covers members like
    # Elizabeth Warren and Ron Wyden who have ground truth bills but 0 Action rows
    # under their person_id.
    if not rows and ground_truth_bill_ids:
        gt_bill_list = list(ground_truth_bill_ids)[:500]  # Cap for performance
        fallback_query = (
            db.query(Action, SourceDocument.url)
              .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
        )
        # Filter to ground truth bills in SQL instead of loading all rows
        from sqlalchemy import or_, and_
        bill_conditions = []
        for gt_bill_id in gt_bill_list:
            # Parse "typenumber-congress" format
            import re as _re
            m = _re.match(r'^([a-z]+)(\d+)-(\d+)$', gt_bill_id)
            if m:
                bill_conditions.append(and_(
                    Action.bill_type == m.group(1),
                    Action.bill_number == int(m.group(2)),
                    Action.bill_congress == int(m.group(3)),
                ))
        if bill_conditions:
            fallback_query = fallback_query.filter(or_(*bill_conditions))
        fallback_rows_raw = fallback_query.order_by(desc(Action.date)).limit(5000).all()
        for action, url in fallback_rows_raw:
            if action.bill_congress and action.bill_type and action.bill_number:
                action_bill_id = f"{action.bill_type.lower()}{action.bill_number}-{action.bill_congress}"
                if action_bill_id in ground_truth_bill_ids:
                    rows.append((action, url))
            if len(rows) >= 500:
                break

    scored = []
    weak_candidates = []

    for a, url in rows:
        meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
        enriched = (meta.get("enriched") or {}) if isinstance(meta, dict) else {}

        # Use column data first (faster), fallback to metadata_json
        combined_text = f"{a.title or ''} {a.summary or ''} {enriched.get('title') or ''} {a.policy_area or ''} {a.latest_action_text or ''}"

        if profile["gate_terms"] is not None:
            if not contains_gate_signal(combined_text, profile["gate_terms"], stopwords):
                continue
        
        # Skip procedural actions
        if is_procedural_action({"title": a.title}):
            continue

        s = score_action_against_claim(claim.text, a.title, a.summary, meta, profile, claim.claim_source_url, skip_semantic=True)

        # Check for bill reference match (Step 2-lite enhancement)
        bill_ref_match = False
        bill_ref_evidence = None
        if claim.bill_refs_json and a.bill_congress and a.bill_type and a.bill_number:
            try:
                bill_refs = json.loads(claim.bill_refs_json)
                if bill_refs and 'normalized' in bill_refs:
                    # Build normalized bill ID from action (e.g., "hr3562")
                    action_bill_norm = f"{a.bill_type.lower()}{a.bill_number}"
                    
                    # Check if this bill is in the claim's extracted references
                    if action_bill_norm in bill_refs['normalized']:
                        bill_ref_match = True
                        # Find the display version for evidence
                        idx = bill_refs['normalized'].index(action_bill_norm)
                        display_ref = bill_refs['display'][idx] if idx < len(bill_refs['display']) else action_bill_norm.upper()
                        bill_ref_evidence = f"bill_ref:{display_ref}"
                        
                        # Apply hard boost for direct bill reference
                        s["score"] += 50.0
                        if bill_ref_evidence not in s["phrase_hits"]:
                            s["phrase_hits"].append(bill_ref_evidence)
            except (json.JSONDecodeError, KeyError, TypeError):
                pass  # Invalid JSON, skip bill ref matching
        
        # Evidence classification - use column data
        progress = classify_progress({
            "latest_action_text": a.latest_action_text,
            "title": a.title,
        })
        timing = classify_timing(
            claim.claim_date.isoformat() if claim.claim_date else None,
            a.date.isoformat() if a.date else None
        )
        relevance = classify_relevance(
            s["score"],
            s["overlap_basic"],
            s["overlap_enriched"],
            s["phrase_hits"],
        )
        evidence_tier = resolve_evidence_tier(
            relevance,
            progress,
            timing,
            float(s["score"]),
            s.get("overlap_basic", []),
            s.get("overlap_enriched", []),
            s.get("phrase_hits", []),
        )
        
        # Apply boilerplate guardrail for general/unknown claims
        evidence_tier = apply_boilerplate_guardrail(
            evidence_tier,
            claim,
            s.get("overlap_basic", []),
            s.get("overlap_enriched", []),
            s.get("phrase_hits", [])
        )
        
        # Look up enriched Bill data (if available)
        bill_data = None
        bill_actions = []
        if a.bill_congress and a.bill_type and a.bill_number:
            bill_id = normalize_bill_id(a.bill_congress, a.bill_type, a.bill_number)
            bill_data = db.query(Bill).filter(Bill.bill_id == bill_id).first()
            
            # Get recent BillAction timeline for context
            if bill_data:
                bill_actions = db.query(BillAction).filter(
                    BillAction.bill_id == bill_id
                ).order_by(BillAction.action_date.desc()).limit(3).all()
        
        # Use enriched Bill data if available, fallback to Action table
        latest_action_text = bill_data.latest_action_text if bill_data else a.latest_action_text
        latest_action_date = bill_data.latest_action_date if bill_data else a.latest_action_date
        policy_area = bill_data.policy_area if bill_data else a.policy_area
        
        # Apply policy area mismatch filter
        evidence_tier = apply_policy_area_mismatch_filter(
            evidence_tier,
            claim,
            policy_area
        )
        
        # CRITICAL: Reject weak matches with low scores or retroactive timing
        # Prevents "hallucinating" wrong bills with weak evidence
        if evidence_tier == "weak":
            # Reject weak matches below score threshold
            if s["score"] < 2.0:
                evidence_tier = "none"
            # Reject weak retroactive matches (claiming credit for old bills)
            elif timing == "retroactive_credit":
                evidence_tier = "none"
        
        # Normalize latest_action_date to isoformat string (handle both datetime and string)
        latest_action_date_str = None
        if latest_action_date:
            if hasattr(latest_action_date, 'isoformat'):
                latest_action_date_str = latest_action_date.isoformat()
            else:
                latest_action_date_str = str(latest_action_date)
        
        action_data = {
            "score": s["score"],
            "why": {
                "claim_tokens": s["claim_tokens"],
                "overlap_basic": s["overlap_basic"],
                "overlap_enriched": s["overlap_enriched"],
                "phrase_hits": s.get("phrase_hits", []),
                # Add enriched evidence context
                "latest_action_text": latest_action_text,
                "latest_action_date": latest_action_date_str,
                "progress_bucket": bill_data.status_bucket if bill_data else None,
                "status_reason": bill_data.status_reason if bill_data else None,
                "timeline_count": len(bill_actions) if bill_actions else None,
                "recent_actions": [
                    {
                        "date": ba.action_date.isoformat(),
                        "text": ba.action_text[:80] + "..." if len(ba.action_text) > 80 else ba.action_text,
                        "chamber": ba.chamber
                    }
                    for ba in bill_actions
                ] if bill_actions else None,
            },
            "evidence": {
                "tier": evidence_tier,
                "relevance": relevance,
                "progress": progress,
                "timing": timing,
            },
            "action": {
                "id": a.id,
                "person_id": a.person_id,
                "bill_congress": a.bill_congress,
                "bill_type": a.bill_type,
                "bill_number": a.bill_number,
                "title": a.title,
                "summary": a.summary,
                "date": a.date.isoformat() if a.date else None,
                "source_url": url,
                # Use enriched Bill data (receipt-backed)
                "policy_area": policy_area,
                "latest_action_text": latest_action_text,
                "latest_action_date": latest_action_date_str,
            }
        }
        
        if s["score"] >= profile["min_score"]:
            # WARNING: Makes HTTP call per match. Consider caching or batching bill text fetches.
            # Phase 3.2: Add bill text receipt only for matched actions (expensive HTTP call)
            if BILL_TEXT_AVAILABLE and a.bill_congress and a.bill_type and a.bill_number:
                text_receipt = format_text_receipt(a.bill_congress, a.bill_type, a.bill_number)
                if text_receipt:
                    action_data["action"]["bill_text"] = text_receipt
            scored.append(action_data)
        elif s["score"] > 0:
            weak_candidates.append(action_data)

    scored.sort(key=lambda x: x["score"], reverse=True)

    # SECOND PASS: Apply semantic similarity to top-20 candidates only (performance)
    model = _get_semantic_model()
    if model is not None and claim.text:
        try:
            from sentence_transformers import util as st_util
            top_n = scored[:20]
            if top_n:
                claim_embedding = model.encode([claim.text], convert_to_tensor=True)[0]
                for match in top_n:
                    act = match["action"]
                    action_text = f"{act.get('title') or ''} {act.get('summary') or ''}"
                    if action_text.strip():
                        action_embedding = model.encode([action_text], convert_to_tensor=True)[0]
                        cosine_score = st_util.cos_sim(claim_embedding, action_embedding).item()
                        if cosine_score >= 0.55:
                            semantic_boost = min(cosine_score * 30.0, 20.0)
                            match["score"] += semantic_boost
                            match["why"]["phrase_hits"].append(f"semantic_similarity:{cosine_score:.2f}")
                            # Re-evaluate tier with new evidence
                            relevance = classify_relevance(
                                match["score"],
                                match["why"].get("overlap_basic", []),
                                match["why"].get("overlap_enriched", []),
                                match["why"]["phrase_hits"],
                            )
                            match["evidence"]["relevance"] = relevance
                            evidence_tier = resolve_evidence_tier(
                                relevance,
                                match["evidence"]["progress"],
                                match["evidence"]["timing"],
                                float(match["score"]),
                                match["why"].get("overlap_basic", []),
                                match["why"].get("overlap_enriched", []),
                                match["why"]["phrase_hits"],
                            )
                            match["evidence"]["tier"] = evidence_tier
                # Re-sort after semantic boost
                scored.sort(key=lambda x: x["score"], reverse=True)
        except Exception:
            pass  # Graceful degradation

    # GUARDRAIL: If multiple bills have URL-only evidence (same score, same URL phrase),
    # require secondary evidence (keyword overlap or sponsor link) OR choose the most recent
    url_only_matches = [
        m for m in scored 
        if m["score"] >= 45.0  # URL boost threshold
        and any(p.startswith("url_match:") for p in m["why"].get("phrase_hits", []))
        and not m["why"].get("overlap_basic")  # No keyword overlap
        and not m["why"].get("overlap_enriched")  # No enriched overlap
    ]
    
    if len(url_only_matches) > 1:
        # Multiple bills match same URL phrase with no secondary evidence
        # Strategy: Keep ONLY the most recent bill (by date), downgrade others to none
        # This handles cases like "DEFIANCE Act of 2024" vs "DEFIANCE Act of 2025"
        most_recent = None
        most_recent_date = None
        
        for m in url_only_matches:
            action_date = m["action"].get("date")
            if action_date:
                if most_recent_date is None or action_date > most_recent_date:
                    most_recent = m
                    most_recent_date = action_date
        
        # Downgrade all except the most recent
        for m in url_only_matches:
            if m != most_recent:
                m["evidence"]["tier"] = "none"
    
    # Soft fallback: if no strong matches, return top 1-2 weak candidates
    if not scored and weak_candidates:
        weak_candidates.sort(key=lambda x: x["score"], reverse=True)
        fallback_matches = weak_candidates[:2]
        for match in fallback_matches:
            match["weak_evidence"] = True
        
        return {
            "claim": {
                "id": claim.id,
                "person_id": claim.person_id,
                "text": claim.text,
                "category": claim.category,
                "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                "claim_source_url": claim.claim_source_url,
            },
            "profile_used": claim.category or "general",
            "min_score": profile["min_score"],
            "matches": fallback_matches,
            "note": f"No matches met min_score threshold of {profile['min_score']}. Showing top weak candidates for reference."
        }

    return {
        "claim": {
            "id": claim.id,
            "person_id": claim.person_id,
            "text": claim.text,
            "category": claim.category,
            "intent": claim.intent,
            "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            "claim_source_url": claim.claim_source_url,
        },
        "profile_used": claim.category or "general",
        "min_score": profile["min_score"],
        "matches": scored[:limit],
    }
