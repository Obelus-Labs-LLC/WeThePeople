"""
Claim matching engine — ported from V1 services/matching/core.py + new V2 matchers.

Exports used by routers/politics.py:
  - compute_matches_for_claim
  - auto_classify_claim
  - detect_intent
  - score_action_against_claim
  - get_profile  (+ CATEGORY_PROFILES)
  - contains_gate_signal
  - contains_claim_signal
  - STOPWORDS_BASE

New V2 matchers for expanded data:
  - match_against_votes
  - match_against_trades
  - match_against_lobbying
  - match_against_contracts
  - match_against_enforcement
  - match_against_donations
  - match_against_committee_positions
  - match_against_sec_filings
"""

import re
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from sqlalchemy import desc

from models.database import (
    Claim, Action, SourceDocument, Vote, MemberVote, Bill, BillAction,
    TrackedMember, MemberBillGroundTruth, CongressionalTrade,
)
from utils.normalization import normalize_bill_id

# Import bill text helper
try:
    from services.bill_text import format_text_receipt
    BILL_TEXT_AVAILABLE = True
except ImportError:
    BILL_TEXT_AVAILABLE = False
    def format_text_receipt(*args, **kwargs):
        return None

# Import fuzzy matching
from services.claims.similarity import fuzzy_title_match

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
        _SEMANTIC_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        _SEMANTIC_AVAILABLE = True
        return _SEMANTIC_MODEL
    except Exception:
        _SEMANTIC_AVAILABLE = False
        return None

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stopwords & boilerplate
# ---------------------------------------------------------------------------

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

BOILERPLATE_CIVIC_TERMS = {
    "congress","bill","act","legislation","law","house","senate","committee",
    "introduced","passed","vote","voted","voting","resolution","amendment",
    "proposing","provide","providing","consideration","relating","authority",
    "direct","removal","purposes","united","states","member","members"
}

# ---------------------------------------------------------------------------
# Policy area mapping
# ---------------------------------------------------------------------------

CATEGORY_TO_POLICY_AREAS = {
    "finance_ethics": {
        "Finance and Financial Sector",
        "Economics and Public Finance",
        "Government Operations and Politics",
        "Congress",
        "Commerce",
    },
    "environment": {
        "Environmental Protection",
        "Energy",
        "Public Lands and Natural Resources",
        "Science, Technology, Communications",
    },
    "healthcare": {
        "Health",
        "Labor and Employment",
        "Economics and Public Finance",
    },
    "immigration": {
        "Immigration",
        "International Affairs",
        "Labor and Employment",
    },
    "guns": {
        "Crime and Law Enforcement",
        "Armed Forces and National Security",
        "Commerce",
    },
    "education": {
        "Education",
        "Labor and Employment",
        "Economics and Public Finance",
    },
    "general": None,
    "unknown": None,
}

# ---------------------------------------------------------------------------
# Category profiles
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Tokenization helpers
# ---------------------------------------------------------------------------

def tokenize(text: str, stopwords: set) -> List[str]:
    if not text:
        return []
    parts = re.findall(r"[a-zA-Z0-9]+", text.lower())
    return [p for p in parts if len(p) >= 3 and p not in stopwords]


# ---------------------------------------------------------------------------
# Bill name extraction from URL
# ---------------------------------------------------------------------------

def extract_bill_name_from_url(url: str) -> Optional[str]:
    """Extract bill name hints from source URL slug."""
    if not url:
        return None
    path = url.split('?')[0].split('#')[0]
    segments = path.split('/')
    slug = None
    for seg in reversed(segments):
        if seg and not seg.startswith('.'):
            slug = seg
            break
    if not slug:
        return None
    phrase = slug.replace('-', ' ').lower()
    words = phrase.split()
    if 'act' not in words and 'bill' not in words:
        return None
    stop_terms = {
        'the', 'of', 'to', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'for',
        'pass', 'passing', 'calling', 'introduces', 'introduced', 'introducing',
        'support', 'supports', 'supporting', 'advocates', 'advocate', 'advocating',
        'join', 'joins', 'joined', 'members', 'member', 'house', 'senate', 'congress',
        'press', 'release', 'releases', 'statement', 'statements',
        'ocasio', 'cortez', 'lee', 'sanders', 'bernie', 'aoc'
    }
    has_distinctive = False
    for w in words:
        if w not in stop_terms and w not in ('act', 'bill') and len(w) >= 5:
            has_distinctive = True
            break
    if not has_distinctive:
        return None
    distinctive_words = [w for w in words if w not in stop_terms and len(w) > 2]
    if not distinctive_words:
        return None
    anchor = 'act' if 'act' in words else 'bill'
    anchor_index = words.index(anchor)
    start_index = max(0, anchor_index - 3)
    candidate_words = words[start_index:anchor_index + 1]
    final_words = [w for w in candidate_words if w not in stop_terms]
    final_words.append(anchor)
    if len(final_words) <= 1:
        return None
    return ' '.join(final_words)


def normalize_title_for_matching(title: str) -> str:
    if not title:
        return ""
    normalized = title.lower()
    normalized = re.sub(r'\s+of\s+20\d{2}\s*$', '', normalized)
    normalized = re.sub(r'[^\w\s]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


# ---------------------------------------------------------------------------
# Bill Name Extraction from Claim Text
# ---------------------------------------------------------------------------

_ACT_NAME_STANDARD = re.compile(
    r'\b((?:[A-Z][A-Za-z-]+(?:\s+(?:and|for|of|the|on|in|to)\s+|\s+)){0,7}[A-Z][A-Za-z-]+\s+Act)\b'
)
_ACT_NAME_ACRONYM = re.compile(
    r'\b((?:[A-Z]{2,}\s+)*[A-Z]{2,}\s+Act)\b'
)
_ACT_NAME_PAREN = re.compile(
    r'\(([A-Z]{2,})\)\s*Act\b'
)
_BILL_NUMBER_PATTERN = re.compile(
    r'\b(H\.?\s*R\.?|S\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?)\s*(\d{1,5})\b',
    re.IGNORECASE,
)


def extract_bill_names_from_text(text: str) -> List[str]:
    """Extract bill names and numbers directly from claim text."""
    if not text:
        return []
    results = []
    seen = set()

    def _add(name: str):
        normalized = normalize_title_for_matching(name)
        if normalized and normalized not in seen and len(normalized.split()) >= 2:
            words = normalized.split()
            distinctive = [w for w in words if w not in STOPWORDS_BASE and len(w) >= 3]
            if distinctive:
                seen.add(normalized)
                results.append(normalized)

    for m in _ACT_NAME_STANDARD.finditer(text):
        _add(m.group(1).strip())
    for m in _ACT_NAME_ACRONYM.finditer(text):
        _add(m.group(1).strip())
    for m in _ACT_NAME_PAREN.finditer(text):
        _add(f"{m.group(1)} Act")
    for m in _BILL_NUMBER_PATTERN.finditer(text):
        bill_type = re.sub(r'[\s.]', '', m.group(1)).lower()
        bill_num = m.group(2)
        results.append(f"{bill_type}{bill_num}")
    return results


# ---------------------------------------------------------------------------
# Gate signal helpers (used by politics.py)
# ---------------------------------------------------------------------------

def contains_gate_signal(text: str, gate_terms: set, stopwords: set) -> bool:
    toks = set(tokenize(text or "", stopwords))
    return len(toks.intersection(gate_terms)) > 0


def contains_claim_signal(claim_text: str, claim_gate_terms: set, stopwords: set) -> bool:
    toks = set(tokenize(claim_text or "", stopwords))
    return len(toks.intersection(claim_gate_terms)) > 0


# ---------------------------------------------------------------------------
# Procedural action detection
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Scoring: action vs claim
# ---------------------------------------------------------------------------

def score_action_against_claim(
    claim_text: str,
    action_title: str,
    action_summary: str,
    meta: dict,
    profile: dict,
    claim_source_url: str = None,
    skip_semantic: bool = False,
) -> dict:
    """Score how well an action matches a claim."""
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

    # URL-based bill name matching
    url_boost = 0.0
    url_hint = None
    if claim_source_url:
        url_hint = extract_bill_name_from_url(claim_source_url)
        if url_hint:
            normalized_title = normalize_title_for_matching(title)
            normalized_hint = normalize_title_for_matching(url_hint)
            if normalized_hint in normalized_title or normalized_title in normalized_hint:
                url_boost = 50.0
                phrase_hits.append(f"url_match:{url_hint}")
            else:
                hint_words = set(normalized_hint.split())
                title_words = set(normalized_title.split())
                overlap = hint_words.intersection(title_words)
                if len(overlap) >= 2:
                    url_boost = 25.0
                    phrase_hits.append(f"url_partial:{url_hint}")
    score += url_boost

    # Fuzzy title matching
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
                threshold=0.65,
                method="token_sort_ratio",
            )
            if fuzzy_result["matched"]:
                fuzzy_boost = min(fuzzy_result["score"] * 30.0, 25.0)
                phrase_hits.append(f"fuzzy_title_match:{fuzzy_result['score']:.2f}:{fuzzy_result['threshold']}")
    score += fuzzy_boost

    # Bill name extraction from claim text
    claim_bill_boost = 0.0
    extracted_names = extract_bill_names_from_text(claim_text)
    if extracted_names and full_title:
        normalized_full_title = normalize_title_for_matching(full_title)
        for name in extracted_names:
            if name in normalized_full_title or normalized_full_title in name:
                claim_bill_boost = 40.0
                phrase_hits.append(f"claim_text_bill_name:{name}")
                break
            name_words = set(name.split()) - STOPWORDS_BASE
            title_words = set(normalized_full_title.split()) - STOPWORDS_BASE
            shared = name_words.intersection(title_words)
            if len(shared) >= 2:
                claim_bill_boost = 25.0
                phrase_hits.append(f"claim_text_bill_name:{name}")
                break
    score += claim_bill_boost

    # Semantic similarity (lazy-loaded)
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
                    semantic_boost = min(cosine_score * 30.0, 20.0)
                    phrase_hits.append(f"semantic_similarity:{cosine_score:.2f}")
            except Exception:
                pass
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


# ---------------------------------------------------------------------------
# Evidence framework
# ---------------------------------------------------------------------------

LEGISLATIVE_PROGRESS_ORDER = [
    "introduced",
    "passed_committee",
    "passed_chamber",
    "enacted",
]


def classify_progress(action: dict) -> str:
    text = (action.get("latest_action_text") or "").lower()
    if not text:
        return "unknown"
    if "became public law" in text or "became law" in text or "signed by the president" in text:
        return "enacted"
    if "passed house" in text or "passed the house" in text or "passed senate" in text or "passed the senate" in text:
        return "passed_chamber"
    if "committee" in text or "ordered to be reported" in text or "reported to" in text:
        return "passed_committee"
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
    overlap_basic = overlap_basic or []
    overlap_enriched = overlap_enriched or []
    phrase_hits = phrase_hits or []
    has_basic = len(overlap_basic) > 0
    has_enriched = len(overlap_enriched) > 0
    has_overlap = has_basic or has_enriched

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

    if has_claim_bill or has_url_match:
        return "high"
    if has_fuzzy or has_semantic_high:
        return "high"
    if has_enriched:
        return "high"
    has_semantic_any = any(p.startswith('semantic_similarity:') for p in phrase_hits)
    if has_semantic_any and has_overlap:
        return "high"
    if has_semantic_any:
        return "medium"
    if not has_overlap:
        return "low" if score and score > 0 else "none"
    if has_basic:
        return "medium"
    return "none"


def resolve_evidence_tier(relevance, progress, timing, score, overlap_basic, overlap_enriched, phrase_hits=None):
    overlap_basic = overlap_basic or []
    overlap_enriched = overlap_enriched or []
    phrase_hits = phrase_hits or []
    has_overlap = (len(overlap_basic) + len(overlap_enriched)) > 0

    has_url_match = any(p.startswith('url_match:') for p in phrase_hits)
    if has_url_match and score and score >= 50.0:
        has_overlap = True

    has_fuzzy = any(p.startswith('fuzzy_title_match:') for p in phrase_hits)
    has_claim_bill = any(p.startswith('claim_text_bill_name:') for p in phrase_hits)
    has_semantic = any(p.startswith('semantic_similarity:') for p in phrase_hits)
    if has_fuzzy or has_claim_bill or has_semantic:
        has_overlap = True

    phrase_only = (not has_overlap) and (len(phrase_hits) > 0)

    if (
        relevance == "high"
        and progress in {"passed_committee", "passed_chamber", "enacted"}
        and timing == "follow_through"
    ):
        return "strong"

    if progress in {"introduced", "passed_committee", "passed_chamber", "enacted"}:
        if not has_overlap:
            return "weak" if (score and score > 0) else "none"
        if relevance == "high" or (score is not None and score >= 4.0):
            return "moderate"
        return "weak" if (score and score > 0) else "none"

    if relevance == "low" or phrase_only:
        return "weak" if (score and score > 0) else "none"

    return "none"


def apply_boilerplate_guardrail(tier, claim, overlap_basic, overlap_enriched, phrase_hits=None):
    phrase_hits = phrase_hits or []

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

    if claim.category not in {"general", "unknown"} and claim.intent:
        return tier

    all_overlap = set(overlap_basic + overlap_enriched)
    non_boilerplate = all_overlap - BOILERPLATE_CIVIC_TERMS
    if tier in {"moderate", "strong"} and non_boilerplate:
        tier = "moderate" if tier == "strong" else tier
    elif tier in {"moderate", "strong"}:
        tier = "weak"

    all_overlap = set(overlap_basic + overlap_enriched)
    non_boilerplate = all_overlap - BOILERPLATE_CIVIC_TERMS
    if all_overlap and not non_boilerplate:
        return "none"

    return tier


def apply_policy_area_mismatch_filter(tier, claim, policy_area):
    if not claim.category or claim.category in {"general", "unknown"}:
        return tier
    if not policy_area:
        return tier
    valid_areas = CATEGORY_TO_POLICY_AREAS.get(claim.category)
    if valid_areas is None:
        return tier
    if policy_area not in valid_areas:
        return "none"
    return tier


# ---------------------------------------------------------------------------
# Intent detection & auto-classification
# ---------------------------------------------------------------------------

INTENT_PATTERNS = {
    "sponsored": ["introduced", "sponsored", "authored", "co-sponsored"],
    "voted_for": ["voted for", "supported", "backed", "championed"],
    "voted_against": ["voted against", "opposed", "blocked", "rejected"],
    "funded": ["funded", "allocated", "secured funding"],
    "passed": ["passed", "enacted", "got through"],
}


def auto_classify_claim(claim_text: str) -> List[Tuple[str, float]]:
    """Returns sorted [(category, confidence), ...]"""
    text_lower = (claim_text or "").lower()
    tokens = set(tokenize(claim_text or "", STOPWORDS_BASE))
    raw_scores: Dict[str, float] = {}

    for category, profile in CATEGORY_PROFILES.items():
        if category == "general":
            continue
        signal_terms = profile.get("strong_terms") or set()
        overlap = tokens.intersection(signal_terms)
        token_score = float(len(overlap))
        phrase_score = 0.0
        for phrase, boost in profile.get("phrase_boosts", []):
            if phrase in text_lower:
                phrase_score += 1.0
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


# ---------------------------------------------------------------------------
# Vote matching (Phase 2)
# ---------------------------------------------------------------------------

def match_votes_for_claim(claim: Claim, db, limit: int = 25) -> Dict[str, Any]:
    """Match vote claims against actual roll call vote records."""
    intent = claim.intent or detect_intent(claim.text)
    expected_position = "Yea" if intent == "voted_for" else "Nay"
    claim_tokens = set(tokenize(claim.text, STOPWORDS_BASE))

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

    scored = []
    for member_vote, vote in results:
        vote_text = f"{vote.question or ''} {vote.related_bill_type or ''} {vote.related_bill_number or ''}"
        vote_tokens = set(tokenize(vote_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(vote_tokens)
        score = len(overlap)
        position_match = member_vote.position == expected_position
        if position_match:
            score += 2.0
        progress = "voted"
        timing = classify_timing(
            claim.claim_date.isoformat() if claim.claim_date else None,
            vote.vote_date.isoformat() if vote.vote_date else None
        )
        if len(overlap) >= 2:
            relevance = "high"
        elif len(overlap) >= 1:
            relevance = "medium"
        else:
            relevance = "low"
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


# ---------------------------------------------------------------------------
# Main matching function
# ---------------------------------------------------------------------------

def compute_matches_for_claim(
    claim: Claim,
    db,
    limit: int = 25,
) -> Dict[str, Any]:
    """Single source of truth for matching a claim to actions."""
    profile = get_profile(claim.category)
    stopwords = STOPWORDS_BASE.union(profile["stopwords_extra"])

    # Vote claims require vote records
    intent = claim.intent or detect_intent(claim.text)
    if intent in ("voted_for", "voted_against"):
        return match_votes_for_claim(claim, db, limit)

    # Check claim-side gate
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

    # Pull candidate actions
    member = db.query(TrackedMember).filter(TrackedMember.person_id == claim.person_id).first()
    bioguide_id = member.bioguide_id if member else None

    ground_truth_bill_ids = None
    if bioguide_id:
        gt_records = db.query(MemberBillGroundTruth.bill_id).filter(
            MemberBillGroundTruth.bioguide_id == bioguide_id
        ).all()
        if gt_records:
            ground_truth_bill_ids = {r[0] for r in gt_records}

    query = (
        db.query(Action, SourceDocument.url)
          .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
          .filter(Action.person_id == claim.person_id)
    )

    rows = []
    if ground_truth_bill_ids:
        for action, url in query.order_by(desc(Action.date)).limit(2000).all():
            if action.bill_congress and action.bill_type and action.bill_number:
                action_bill_id = f"{action.bill_type.lower()}{action.bill_number}-{action.bill_congress}"
                if action_bill_id in ground_truth_bill_ids:
                    rows.append((action, url))
    else:
        rows = query.order_by(desc(Action.date)).limit(2000).all()

    # Ground truth fallback
    if not rows and ground_truth_bill_ids:
        gt_bill_list = list(ground_truth_bill_ids)[:500]
        fallback_query = (
            db.query(Action, SourceDocument.url)
              .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
        )
        from sqlalchemy import or_, and_
        bill_conditions = []
        for gt_bill_id in gt_bill_list:
            m = re.match(r'^([a-z]+)(\d+)-(\d+)$', gt_bill_id)
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
        combined_text = f"{a.title or ''} {a.summary or ''} {enriched.get('title') or ''} {a.policy_area or ''} {a.latest_action_text or ''}"

        if profile["gate_terms"] is not None:
            if not contains_gate_signal(combined_text, profile["gate_terms"], stopwords):
                continue
        if is_procedural_action({"title": a.title}):
            continue

        s = score_action_against_claim(claim.text, a.title, a.summary, meta, profile, claim.claim_source_url, skip_semantic=True)

        # Bill reference match
        bill_ref_match = False
        bill_ref_evidence = None
        if claim.bill_refs_json and a.bill_congress and a.bill_type and a.bill_number:
            try:
                bill_refs = json.loads(claim.bill_refs_json)
                if bill_refs and 'normalized' in bill_refs:
                    action_bill_norm = f"{a.bill_type.lower()}{a.bill_number}"
                    if action_bill_norm in bill_refs['normalized']:
                        bill_ref_match = True
                        idx = bill_refs['normalized'].index(action_bill_norm)
                        display_ref = bill_refs['display'][idx] if idx < len(bill_refs['display']) else action_bill_norm.upper()
                        bill_ref_evidence = f"bill_ref:{display_ref}"
                        s["score"] += 50.0
                        if bill_ref_evidence not in s["phrase_hits"]:
                            s["phrase_hits"].append(bill_ref_evidence)
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

        # Evidence classification
        progress = classify_progress({
            "latest_action_text": a.latest_action_text,
            "title": a.title,
        })
        timing = classify_timing(
            claim.claim_date.isoformat() if claim.claim_date else None,
            a.date.isoformat() if a.date else None
        )
        relevance = classify_relevance(
            s["score"], s["overlap_basic"], s["overlap_enriched"], s["phrase_hits"],
        )
        evidence_tier = resolve_evidence_tier(
            relevance, progress, timing, float(s["score"]),
            s.get("overlap_basic", []), s.get("overlap_enriched", []),
            s.get("phrase_hits", []),
        )
        evidence_tier = apply_boilerplate_guardrail(
            evidence_tier, claim,
            s.get("overlap_basic", []), s.get("overlap_enriched", []),
            s.get("phrase_hits", [])
        )

        # Look up enriched Bill data
        bill_data = None
        bill_actions = []
        if a.bill_congress and a.bill_type and a.bill_number:
            bill_id = normalize_bill_id(a.bill_congress, a.bill_type, a.bill_number)
            bill_data = db.query(Bill).filter(Bill.bill_id == bill_id).first()
            if bill_data:
                bill_actions = db.query(BillAction).filter(
                    BillAction.bill_id == bill_id
                ).order_by(BillAction.action_date.desc()).limit(3).all()

        latest_action_text = bill_data.latest_action_text if bill_data else a.latest_action_text
        latest_action_date = bill_data.latest_action_date if bill_data else a.latest_action_date
        policy_area = bill_data.policy_area if bill_data else a.policy_area

        evidence_tier = apply_policy_area_mismatch_filter(evidence_tier, claim, policy_area)

        if evidence_tier == "weak":
            if s["score"] < 2.0:
                evidence_tier = "none"
            elif timing == "retroactive_credit":
                evidence_tier = "none"

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
                "policy_area": policy_area,
                "latest_action_text": latest_action_text,
                "latest_action_date": latest_action_date_str,
            }
        }

        if s["score"] >= profile["min_score"]:
            if BILL_TEXT_AVAILABLE and a.bill_congress and a.bill_type and a.bill_number:
                text_receipt = format_text_receipt(a.bill_congress, a.bill_type, a.bill_number)
                if text_receipt:
                    action_data["action"]["bill_text"] = text_receipt
            scored.append(action_data)
        elif s["score"] > 0:
            weak_candidates.append(action_data)

    scored.sort(key=lambda x: x["score"], reverse=True)

    # Second pass: semantic similarity on top candidates
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
                scored.sort(key=lambda x: x["score"], reverse=True)
        except Exception:
            pass

    # URL-only match guardrail
    url_only_matches = [
        m for m in scored
        if m["score"] >= 45.0
        and any(p.startswith("url_match:") for p in m["why"].get("phrase_hits", []))
        and not m["why"].get("overlap_basic")
        and not m["why"].get("overlap_enriched")
    ]
    if len(url_only_matches) > 1:
        most_recent = None
        most_recent_date = None
        for m in url_only_matches:
            action_date = m["action"].get("date")
            if action_date:
                if most_recent_date is None or action_date > most_recent_date:
                    most_recent = m
                    most_recent_date = action_date
        for m in url_only_matches:
            if m != most_recent:
                m["evidence"]["tier"] = "none"

    # Soft fallback
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


# ===========================================================================
# NEW V2 MATCHERS — match claims against expanded data sources
# ===========================================================================

def match_against_votes(claim_text: str, person_id: str, db, limit: int = 20) -> list:
    """
    Search MemberVote/Vote for votes related to claim text.
    Returns list of dicts with vote info and relevance score.
    """
    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    results = (
        db.query(MemberVote, Vote)
          .join(Vote, MemberVote.vote_id == Vote.id)
          .filter(MemberVote.person_id == person_id)
          .order_by(desc(Vote.vote_date))
          .limit(500)
          .all()
    )

    scored = []
    for member_vote, vote in results:
        vote_text = f"{vote.question or ''} {vote.related_bill_type or ''} {vote.related_bill_number or ''}"
        if hasattr(vote, 'description') and vote.description:
            vote_text += f" {vote.description}"
        vote_tokens = set(tokenize(vote_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(vote_tokens)
        if not overlap:
            continue
        score = float(len(overlap))
        scored.append({
            "type": "vote",
            "score": score,
            "overlap": sorted(list(overlap)),
            "data": {
                "vote_id": vote.id,
                "congress": vote.congress,
                "chamber": vote.chamber,
                "roll_number": vote.roll_number,
                "question": vote.question,
                "vote_date": vote.vote_date.isoformat() if vote.vote_date else None,
                "result": vote.result,
                "position": member_vote.position,
                "related_bill": f"{vote.related_bill_type} {vote.related_bill_number}" if vote.related_bill_type else None,
            },
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]


def match_against_trades(claim_text: str, person_id: str, db, limit: int = 20) -> list:
    """
    Search CongressionalTrade for trades related to claim text.
    Returns list of dicts with trade info and relevance score.
    """
    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    trades = (
        db.query(CongressionalTrade)
          .filter(CongressionalTrade.person_id == person_id)
          .order_by(desc(CongressionalTrade.transaction_date))
          .limit(500)
          .all()
    )

    scored = []
    for trade in trades:
        trade_text = f"{trade.ticker or ''} {trade.asset_description or ''} {trade.asset_type or ''}"
        trade_tokens = set(tokenize(trade_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(trade_tokens)
        if not overlap:
            continue
        score = float(len(overlap))
        scored.append({
            "type": "trade",
            "score": score,
            "overlap": sorted(list(overlap)),
            "data": {
                "trade_id": trade.id,
                "ticker": trade.ticker,
                "asset_description": trade.asset_description,
                "transaction_type": trade.transaction_type,
                "transaction_date": trade.transaction_date.isoformat() if trade.transaction_date else None,
                "amount_range": trade.amount,
                "person_id": trade.person_id,
            },
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]


def match_against_lobbying(claim_text: str, entity_id: str, entity_type: str, db, limit: int = 20) -> list:
    """
    Search lobbying records for lobbying related to claim text.
    Supports all sector lobbying tables based on entity_type.

    entity_type: "tech" | "finance" | "health" | "energy"
    """
    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    # Select the right model and FK column based on entity_type
    if entity_type == "tech":
        from models.tech_models import LobbyingRecord as LobbyModel
        fk_col = LobbyModel.company_id
    elif entity_type == "finance":
        from models.finance_models import FinanceLobbyingRecord as LobbyModel
        fk_col = LobbyModel.institution_id
    elif entity_type == "health":
        from models.health_models import HealthLobbyingRecord as LobbyModel
        fk_col = LobbyModel.company_id
    elif entity_type == "energy":
        from models.energy_models import EnergyLobbyingRecord as LobbyModel
        fk_col = LobbyModel.company_id
    else:
        return []

    records = (
        db.query(LobbyModel)
          .filter(fk_col == entity_id)
          .order_by(desc(LobbyModel.filing_year))
          .limit(500)
          .all()
    )

    scored = []
    for rec in records:
        lobby_text = f"{rec.client_name or ''} {rec.registrant_name or ''} {getattr(rec, 'specific_issues', '') or ''}"
        lobby_tokens = set(tokenize(lobby_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(lobby_tokens)
        if not overlap:
            continue
        score = float(len(overlap))
        scored.append({
            "type": "lobbying",
            "score": score,
            "overlap": sorted(list(overlap)),
            "data": {
                "id": rec.id,
                "client_name": rec.client_name,
                "registrant_name": rec.registrant_name,
                "filing_year": rec.filing_year,
                "filing_period": getattr(rec, "filing_period", None),
                "income": getattr(rec, "income", None),
                "specific_issues": getattr(rec, "specific_issues", None),
            },
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]


def match_against_contracts(claim_text: str, entity_id: str, entity_type: str, db, limit: int = 20) -> list:
    """
    Search government contracts for an entity and match against claim text.
    Supports all sector contract tables based on entity_type.

    entity_type: "tech" | "finance" | "health" | "energy"

    Useful for claims like "We never got government contracts" or
    "We work with the Department of Defense."
    """
    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    # Select the right model and FK column based on entity_type
    if entity_type == "tech":
        from models.tech_models import GovernmentContract as ContractModel
        fk_col = ContractModel.company_id
    elif entity_type == "finance":
        from models.finance_models import FinanceGovernmentContract as ContractModel
        fk_col = ContractModel.institution_id
    elif entity_type == "health":
        from models.health_models import HealthGovernmentContract as ContractModel
        fk_col = ContractModel.company_id
    elif entity_type == "energy":
        from models.energy_models import EnergyGovernmentContract as ContractModel
        fk_col = ContractModel.company_id
    else:
        return []

    records = (
        db.query(ContractModel)
          .filter(fk_col == entity_id)
          .order_by(desc(ContractModel.start_date))
          .limit(500)
          .all()
    )

    scored = []
    for rec in records:
        contract_text = f"{rec.description or ''} {rec.awarding_agency or ''} {rec.contract_type or ''}"
        contract_tokens = set(tokenize(contract_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(contract_tokens)
        if not overlap:
            continue
        score = float(len(overlap))
        # Boost for specific agency mentions
        if rec.awarding_agency:
            agency_lower = rec.awarding_agency.lower()
            claim_lower = claim_text.lower()
            if agency_lower in claim_lower or any(
                word in claim_lower for word in agency_lower.split() if len(word) >= 4
            ):
                score += 3.0
        scored.append({
            "type": "contract",
            "description": f"${rec.award_amount:,.0f} contract from {rec.awarding_agency}" if rec.award_amount and rec.awarding_agency else f"Contract: {(rec.description or 'N/A')[:80]}",
            "date": rec.start_date.isoformat() if rec.start_date else None,
            "source_url": None,
            "relevance_score": score,
            "overlap": sorted(list(overlap)),
            "data": {
                "id": rec.id,
                "award_id": rec.award_id,
                "award_amount": rec.award_amount,
                "awarding_agency": rec.awarding_agency,
                "description": rec.description,
                "start_date": rec.start_date.isoformat() if rec.start_date else None,
                "end_date": rec.end_date.isoformat() if rec.end_date else None,
                "contract_type": rec.contract_type,
            },
        })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:limit]


def match_against_enforcement(claim_text: str, entity_id: str, entity_type: str, db, limit: int = 20) -> list:
    """
    Search enforcement actions for an entity and match against claim text.
    Supports all sector enforcement tables based on entity_type.

    entity_type: "tech" | "finance" | "health" | "energy"

    Useful for claims like "We've never been fined" or "Our safety record is clean."
    """
    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    if entity_type == "tech":
        from models.tech_models import FTCEnforcement as EnfModel
        fk_col = EnfModel.company_id
    elif entity_type == "finance":
        from models.finance_models import FinanceEnforcement as EnfModel
        fk_col = EnfModel.institution_id
    elif entity_type == "health":
        from models.health_models import HealthEnforcement as EnfModel
        fk_col = EnfModel.company_id
    elif entity_type == "energy":
        from models.energy_models import EnergyEnforcement as EnfModel
        fk_col = EnfModel.company_id
    else:
        return []

    records = (
        db.query(EnfModel)
          .filter(fk_col == entity_id)
          .order_by(desc(EnfModel.case_date))
          .limit(500)
          .all()
    )

    scored = []
    for rec in records:
        enf_text = f"{rec.case_title or ''} {rec.description or ''} {rec.enforcement_type or ''} {rec.source or ''}"
        enf_tokens = set(tokenize(enf_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(enf_tokens)
        if not overlap:
            continue
        score = float(len(overlap))
        # Boost for penalty-related claims
        penalty_terms = {"fine", "fined", "penalty", "penalized", "settlement", "violation"}
        if claim_tokens.intersection(penalty_terms) and rec.penalty_amount:
            score += 5.0
        scored.append({
            "type": "enforcement",
            "description": f"{rec.enforcement_type or 'Enforcement'}: {rec.case_title}" if rec.case_title else "Enforcement action",
            "date": rec.case_date.isoformat() if rec.case_date else None,
            "source_url": rec.case_url,
            "relevance_score": score,
            "overlap": sorted(list(overlap)),
            "data": {
                "id": rec.id,
                "case_title": rec.case_title,
                "case_date": rec.case_date.isoformat() if rec.case_date else None,
                "case_url": rec.case_url,
                "enforcement_type": rec.enforcement_type,
                "penalty_amount": rec.penalty_amount,
                "description": rec.description,
                "source": rec.source,
            },
        })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:limit]


def match_against_donations(claim_text: str, person_id: str, db, limit: int = 20) -> list:
    """
    Search CompanyDonation for donations TO a politician.
    Useful for claims like "I don't take money from Big Pharma" --
    cross-reference against all donations from health sector entities.
    """
    from models.database import CompanyDonation

    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    donations = (
        db.query(CompanyDonation)
          .filter(CompanyDonation.person_id == person_id)
          .order_by(desc(CompanyDonation.donation_date))
          .limit(500)
          .all()
    )

    # Sector keywords for detecting sector-specific denial claims
    sector_keywords = {
        "finance": {"bank", "banks", "banking", "financial", "wall street", "finance"},
        "health": {"pharma", "pharmaceutical", "drug", "health", "healthcare", "hospital", "insurance", "medical"},
        "tech": {"tech", "technology", "silicon valley", "big tech", "software", "platform"},
        "energy": {"oil", "gas", "energy", "fossil", "coal", "petroleum", "pipeline"},
    }

    # Detect which sectors the claim is about
    claim_lower = claim_text.lower()
    claimed_sectors = set()
    for sector, keywords in sector_keywords.items():
        if any(kw in claim_lower for kw in keywords):
            claimed_sectors.add(sector)

    scored = []
    for don in donations:
        donation_text = f"{don.committee_name or ''} {don.candidate_name or ''} {don.entity_type or ''} {don.entity_id or ''}"
        donation_tokens = set(tokenize(donation_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(donation_tokens)
        score = float(len(overlap))
        # Boost if donation is from a sector the claim mentions
        if don.entity_type and don.entity_type in claimed_sectors:
            score += 5.0
        if score <= 0:
            continue
        scored.append({
            "type": "donation",
            "description": f"${don.amount:,.0f} from {don.committee_name or don.entity_id} ({don.entity_type})" if don.amount else f"Donation from {don.committee_name or don.entity_id}",
            "date": don.donation_date.isoformat() if don.donation_date else None,
            "source_url": don.source_url,
            "relevance_score": score,
            "overlap": sorted(list(overlap)) if overlap else [],
            "data": {
                "id": don.id,
                "entity_type": don.entity_type,
                "entity_id": don.entity_id,
                "committee_name": don.committee_name,
                "committee_id": don.committee_id,
                "candidate_name": don.candidate_name,
                "amount": don.amount,
                "cycle": don.cycle,
                "donation_date": don.donation_date.isoformat() if don.donation_date else None,
            },
        })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:limit]


def match_against_committee_positions(claim_text: str, person_id: str, db, limit: int = 20) -> list:
    """
    Search CommitteeMembership + Committee for a politician's committee positions.
    Useful for claims about committee membership, oversight authority, etc.
    """
    from models.committee_models import Committee, CommitteeMembership

    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    memberships = (
        db.query(CommitteeMembership, Committee)
          .join(Committee, CommitteeMembership.committee_thomas_id == Committee.thomas_id)
          .filter(CommitteeMembership.person_id == person_id)
          .all()
    )

    scored = []
    for membership, committee in memberships:
        committee_text = f"{committee.name or ''} {committee.jurisdiction or ''} {membership.role or ''}"
        committee_tokens = set(tokenize(committee_text, STOPWORDS_BASE))
        overlap = claim_tokens.intersection(committee_tokens)
        if not overlap:
            continue
        score = float(len(overlap))
        # Boost for leadership roles
        if membership.role in ("chair", "ranking_member", "vice_chair"):
            score += 3.0
        scored.append({
            "type": "committee_position",
            "description": f"{membership.role.replace('_', ' ').title() if membership.role else 'Member'} of {committee.name}",
            "date": membership.created_at.isoformat() if membership.created_at else None,
            "source_url": committee.url,
            "relevance_score": score,
            "overlap": sorted(list(overlap)),
            "data": {
                "committee_thomas_id": committee.thomas_id,
                "committee_name": committee.name,
                "chamber": committee.chamber,
                "role": membership.role,
                "rank": membership.rank,
                "party": membership.party,
                "jurisdiction": committee.jurisdiction,
                "parent_thomas_id": committee.parent_thomas_id,
            },
        })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:limit]


def match_against_sec_filings(claim_text: str, entity_id: str, entity_type: str, db, limit: int = 20) -> list:
    """
    Search SEC filings (insider trades for finance, regular filings for all sectors)
    for relevant financial disclosures.

    entity_type: "tech" | "finance" | "health" | "energy"

    Useful for claims about financial positions, stock transactions, etc.
    """
    claim_tokens = set(tokenize(claim_text, STOPWORDS_BASE))
    if not claim_tokens:
        return []

    scored = []

    if entity_type == "finance":
        from models.finance_models import SECFiling, SECInsiderTrade

        # Insider trades
        trades = (
            db.query(SECInsiderTrade)
              .filter(SECInsiderTrade.institution_id == entity_id)
              .order_by(desc(SECInsiderTrade.transaction_date))
              .limit(300)
              .all()
        )
        for trade in trades:
            trade_text = f"{trade.filer_name or ''} {trade.filer_title or ''} {trade.transaction_type or ''}"
            trade_tokens = set(tokenize(trade_text, STOPWORDS_BASE))
            overlap = claim_tokens.intersection(trade_tokens)
            if not overlap:
                continue
            score = float(len(overlap))
            scored.append({
                "type": "sec_insider_trade",
                "description": f"{trade.filer_name} ({trade.filer_title or 'insider'}) {trade.transaction_type or ''} ${trade.total_value:,.0f}" if trade.total_value else f"Insider trade by {trade.filer_name}",
                "date": trade.transaction_date.isoformat() if trade.transaction_date else None,
                "source_url": trade.filing_url,
                "relevance_score": score,
                "overlap": sorted(list(overlap)),
                "data": {
                    "id": trade.id,
                    "filer_name": trade.filer_name,
                    "filer_title": trade.filer_title,
                    "transaction_date": trade.transaction_date.isoformat() if trade.transaction_date else None,
                    "transaction_type": trade.transaction_type,
                    "shares": trade.shares,
                    "price_per_share": trade.price_per_share,
                    "total_value": trade.total_value,
                    "filing_url": trade.filing_url,
                },
            })

        # SEC filings
        filings = (
            db.query(SECFiling)
              .filter(SECFiling.institution_id == entity_id)
              .order_by(desc(SECFiling.filing_date))
              .limit(200)
              .all()
        )
        for filing in filings:
            filing_text = f"{filing.form_type or ''} {filing.description or ''}"
            filing_tokens = set(tokenize(filing_text, STOPWORDS_BASE))
            overlap = claim_tokens.intersection(filing_tokens)
            if not overlap:
                continue
            score = float(len(overlap))
            scored.append({
                "type": "sec_filing",
                "description": f"SEC {filing.form_type}: {(filing.description or 'N/A')[:80]}",
                "date": filing.filing_date.isoformat() if filing.filing_date else None,
                "source_url": filing.filing_url or filing.primary_doc_url,
                "relevance_score": score,
                "overlap": sorted(list(overlap)),
                "data": {
                    "id": filing.id,
                    "accession_number": filing.accession_number,
                    "form_type": filing.form_type,
                    "filing_date": filing.filing_date.isoformat() if filing.filing_date else None,
                    "description": filing.description,
                    "filing_url": filing.filing_url,
                    "primary_doc_url": filing.primary_doc_url,
                },
            })

    elif entity_type == "tech":
        from models.tech_models import SECTechFiling

        filings = (
            db.query(SECTechFiling)
              .filter(SECTechFiling.company_id == entity_id)
              .order_by(desc(SECTechFiling.filing_date))
              .limit(200)
              .all()
        )
        for filing in filings:
            filing_text = f"{filing.form_type or ''} {filing.description or ''}"
            filing_tokens = set(tokenize(filing_text, STOPWORDS_BASE))
            overlap = claim_tokens.intersection(filing_tokens)
            if not overlap:
                continue
            score = float(len(overlap))
            scored.append({
                "type": "sec_filing",
                "description": f"SEC {filing.form_type}: {(filing.description or 'N/A')[:80]}",
                "date": filing.filing_date.isoformat() if filing.filing_date else None,
                "source_url": filing.filing_url or filing.primary_doc_url,
                "relevance_score": score,
                "overlap": sorted(list(overlap)),
                "data": {
                    "id": filing.id,
                    "accession_number": filing.accession_number,
                    "form_type": filing.form_type,
                    "filing_date": filing.filing_date.isoformat() if filing.filing_date else None,
                    "description": filing.description,
                    "filing_url": filing.filing_url,
                    "primary_doc_url": filing.primary_doc_url,
                },
            })

    elif entity_type == "health":
        from models.health_models import SECHealthFiling

        filings = (
            db.query(SECHealthFiling)
              .filter(SECHealthFiling.company_id == entity_id)
              .order_by(desc(SECHealthFiling.filing_date))
              .limit(200)
              .all()
        )
        for filing in filings:
            filing_text = f"{filing.form_type or ''} {filing.description or ''}"
            filing_tokens = set(tokenize(filing_text, STOPWORDS_BASE))
            overlap = claim_tokens.intersection(filing_tokens)
            if not overlap:
                continue
            score = float(len(overlap))
            scored.append({
                "type": "sec_filing",
                "description": f"SEC {filing.form_type}: {(filing.description or 'N/A')[:80]}",
                "date": filing.filing_date.isoformat() if filing.filing_date else None,
                "source_url": filing.filing_url or filing.primary_doc_url,
                "relevance_score": score,
                "overlap": sorted(list(overlap)),
                "data": {
                    "id": filing.id,
                    "accession_number": filing.accession_number,
                    "form_type": filing.form_type,
                    "filing_date": filing.filing_date.isoformat() if filing.filing_date else None,
                    "description": filing.description,
                    "filing_url": filing.filing_url,
                    "primary_doc_url": filing.primary_doc_url,
                },
            })

    elif entity_type == "energy":
        from models.energy_models import SECEnergyFiling

        filings = (
            db.query(SECEnergyFiling)
              .filter(SECEnergyFiling.company_id == entity_id)
              .order_by(desc(SECEnergyFiling.filing_date))
              .limit(200)
              .all()
        )
        for filing in filings:
            filing_text = f"{filing.form_type or ''} {filing.description or ''}"
            filing_tokens = set(tokenize(filing_text, STOPWORDS_BASE))
            overlap = claim_tokens.intersection(filing_tokens)
            if not overlap:
                continue
            score = float(len(overlap))
            scored.append({
                "type": "sec_filing",
                "description": f"SEC {filing.form_type}: {(filing.description or 'N/A')[:80]}",
                "date": filing.filing_date.isoformat() if filing.filing_date else None,
                "source_url": filing.filing_url or filing.primary_doc_url,
                "relevance_score": score,
                "overlap": sorted(list(overlap)),
                "data": {
                    "id": filing.id,
                    "accession_number": filing.accession_number,
                    "form_type": filing.form_type,
                    "filing_date": filing.filing_date.isoformat() if filing.filing_date else None,
                    "description": filing.description,
                    "filing_url": filing.filing_url,
                    "primary_doc_url": filing.primary_doc_url,
                },
            })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:limit]
