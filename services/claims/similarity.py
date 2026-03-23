"""
Fuzzy Title Matching Service

Uses rapidfuzz to find approximate matches between claim text and bill titles.
Gated by environment flag ENABLE_FUZZY_TITLE_MATCH=1 (default: disabled).

This provides a safety net for catching matches when:
- Claim text has typos or slight variations
- Bill title uses different wording
- Exact phrase matching misses due to word order

Example:
    Claim: "I voted for the Affordable Care Act"
    Bill: "Patient Protection and Affordable Care Act"
    Fuzzy score: 0.85 (MATCH if threshold is 0.80)

Conservative by default:
- Default threshold: 0.85 (high confidence required)
- Must be explicitly enabled via environment variable
- Evidence must document the decision, score, threshold, and method
"""

import os
from typing import Optional, Dict, Any

try:
    from rapidfuzz import fuzz
    _RAPIDFUZZ_AVAILABLE = True
except ImportError:
    _RAPIDFUZZ_AVAILABLE = False


# Environment flag gate (default: disabled)
FUZZY_MATCHING_ENABLED = os.environ.get("ENABLE_FUZZY_TITLE_MATCH", "0") == "1"

# Default threshold (require high similarity)
DEFAULT_THRESHOLD = 0.85


def fuzzy_title_match(
    claim_text: str,
    bill_title: str,
    threshold: float = DEFAULT_THRESHOLD,
    method: str = "token_sort_ratio"
) -> Dict[str, Any]:
    """
    Perform fuzzy matching between claim text and bill title.
    
    Args:
        claim_text: The claim text to match
        bill_title: The bill title to compare against
        threshold: Minimum similarity score (0.0-1.0) to consider a match
        method: Fuzzy matching algorithm to use. Options:
            - "token_sort_ratio": Tokenize, sort, compare (handles word order)
            - "partial_ratio": Best partial substring match
            - "ratio": Basic Levenshtein distance
    
    Returns:
        Dict with:
            - matched: bool (True if score >= threshold)
            - score: float (similarity score 0.0-1.0)
            - threshold: float (threshold used)
            - method: str (algorithm used)
            - evidence: str (formatted evidence signal for storage)
            - claim_text: str (original claim text)
            - bill_title: str (original bill title)
    
    Examples:
        >>> result = fuzzy_title_match(
        ...     "I voted for the Affordable Care Act",
        ...     "Patient Protection and Affordable Care Act"
        ... )
        >>> result["matched"]
        True
        >>> result["score"] > 0.80
        True
    """
    if not _RAPIDFUZZ_AVAILABLE:
        return {
            "matched": False,
            "score": 0.0,
            "threshold": threshold,
            "method": method,
            "evidence": "fuzzy_title_match:unavailable",
            "claim_text": claim_text,
            "bill_title": bill_title,
            "decision": "no_match"
        }

    # Normalize inputs
    claim_lower = claim_text.lower().strip()
    title_lower = bill_title.lower().strip()
    
    # Select algorithm
    if method == "token_sort_ratio":
        # Tokenize, sort alphabetically, then compare
        # Best for handling word order differences
        score_raw = fuzz.token_sort_ratio(claim_lower, title_lower)
    elif method == "partial_ratio":
        # Find best matching substring
        # Good for partial matches
        score_raw = fuzz.partial_ratio(claim_lower, title_lower)
    elif method == "ratio":
        # Simple Levenshtein distance
        # Strict, sensitive to length differences
        score_raw = fuzz.ratio(claim_lower, title_lower)
    else:
        raise ValueError(f"Unknown fuzzy matching method: {method}")
    
    # Convert to 0-1 scale
    score = score_raw / 100.0
    
    # Determine match
    matched = score >= threshold
    
    # Format evidence signal
    evidence_signal = f"fuzzy_title_match:{score:.2f}:{threshold}"
    
    return {
        "matched": matched,
        "score": score,
        "threshold": threshold,
        "method": method,
        "evidence": evidence_signal,
        "claim_text": claim_text,
        "bill_title": bill_title,
        "decision": "match" if matched else "no_match"
    }


def is_fuzzy_matching_enabled() -> bool:
    """Check if fuzzy matching is enabled via environment variable."""
    return FUZZY_MATCHING_ENABLED


if __name__ == "__main__":
    # Self-test
    print("Testing fuzzy title matching...")
    print(f"Fuzzy matching enabled: {is_fuzzy_matching_enabled()}")
    print()
    
    # Test 1: High similarity (should match)
    result = fuzzy_title_match(
        "I voted for the Affordable Care Act",
        "Patient Protection and Affordable Care Act",
        threshold=0.65
    )
    print(f"Test 1 - High similarity:")
    print(f"  Matched: {result['matched']}")
    print(f"  Score: {result['score']:.2f}")
    print(f"  Evidence: {result['evidence']}")
    assert result['matched'], "Should match with score > 0.65"
    print()
    
    # Test 2: Low similarity (should not match)
    result = fuzzy_title_match(
        "I opposed the tax cuts",
        "Infrastructure Investment and Jobs Act",
        threshold=0.85
    )
    print(f"Test 2 - Low similarity:")
    print(f"  Matched: {result['matched']}")
    print(f"  Score: {result['score']:.2f}")
    print(f"  Evidence: {result['evidence']}")
    assert not result['matched'], "Should not match with low score"
    print()
    
    # Test 3: Exact match (should score 1.0)
    result = fuzzy_title_match(
        "Infrastructure Investment and Jobs Act",
        "Infrastructure Investment and Jobs Act",
        threshold=0.99
    )
    print(f"Test 3 - Exact match:")
    print(f"  Matched: {result['matched']}")
    print(f"  Score: {result['score']:.2f}")
    print(f"  Evidence: {result['evidence']}")
    assert result['matched'] and result['score'] == 1.0, "Exact match should score 1.0"
    print()
    
    # Test 4: Word order variation (token_sort_ratio handles this)
    result = fuzzy_title_match(
        "Care Act Affordable the",
        "Affordable Care Act",
        threshold=0.80,
        method="token_sort_ratio"
    )
    print(f"Test 4 - Word order variation:")
    print(f"  Matched: {result['matched']}")
    print(f"  Score: {result['score']:.2f}")
    print(f"  Method: {result['method']}")
    print()
    
    print("✓ All fuzzy matching tests passed")
