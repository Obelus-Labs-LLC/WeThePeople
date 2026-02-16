"""
Regression tests for URL-based bill matching.

These tests lock in the behavior where claim source URLs can provide
strong evidence for bill matching, even when claim text lacks explicit mentions.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.matching import (
    extract_bill_name_from_url,
    normalize_title_for_matching,
    score_action_against_claim,
    CATEGORY_PROFILES,
)


def test_url_title_match_promotes_tier():
    """
    Test that URL-derived bill name matches promote tier to moderate+.
    
    Scenario: Claim text has no bill-title overlap, but source URL contains
    distinctive bill name that matches the bill title.
    
    Expected: High score, tier should be moderate or higher.
    """
    print("\n" + "="*70)
    print("TEST 1: URL Title Match Promotes Tier")
    print("="*70)
    
    # Claim text mentions "this legislation" but not "DEFIANCE"
    claim_text = "I also want to shoutout Omny Miranda Martone, founder and CEO of the Sexual Violence Prevention Association, who has been essential in crafting and advocating for this legislation"
    
    # URL contains distinctive bill name
    claim_source_url = "https://ocasio-cortez.house.gov/media/press-releases/ocasio-cortez-lee-join-house-members-and-advocates-calling-pass-defiance-act"
    
    # Bill title
    bill_title = "DEFIANCE Act of 2025"
    bill_summary = ""
    
    profile = CATEGORY_PROFILES["general"]
    
    # Score the match
    result = score_action_against_claim(
        claim_text, 
        bill_title, 
        bill_summary, 
        {}, 
        profile, 
        claim_source_url
    )
    
    print(f"Claim text: {claim_text[:80]}...")
    print(f"URL: {claim_source_url}")
    print(f"Bill title: {bill_title}")
    print(f"\nScore: {result['score']}")
    print(f"URL hint: {result.get('url_hint')}")
    print(f"Phrase hits: {result.get('phrase_hits', [])}")
    print(f"Overlap (basic): {result.get('overlap_basic', [])}")
    
    # Assertions
    assert result['score'] >= 50.0, f"Expected score >= 50.0, got {result['score']}"
    assert any('url_match:' in p for p in result.get('phrase_hits', [])), "Expected url_match in phrase_hits"
    
    print("\n[PASS] URL title match correctly promotes score")


def test_url_boost_no_false_positives():
    """
    Test that generic URL tokens don't create false positive matches.
    
    Scenario: URL contains only generic terms like "act", "bill", "press-release".
    Bill title contains nothing distinctive.
    
    Expected: No URL boost, low/zero score.
    """
    print("\n" + "="*70)
    print("TEST 2: URL Boost Does Not Create False Positives")
    print("="*70)
    
    claim_text = "I am committed to working for the American people"
    
    # Generic URL with no distinctive bill name
    claim_source_url = "https://example.house.gov/press-releases/member-statement"
    
    # Generic bill title
    bill_title = "To provide for the consideration of certain matters"
    bill_summary = ""
    
    profile = CATEGORY_PROFILES["general"]
    
    result = score_action_against_claim(
        claim_text,
        bill_title,
        bill_summary,
        {},
        profile,
        claim_source_url
    )
    
    print(f"Claim text: {claim_text}")
    print(f"URL: {claim_source_url}")
    print(f"Bill title: {bill_title}")
    print(f"\nScore: {result['score']}")
    print(f"URL hint: {result.get('url_hint')}")
    print(f"Phrase hits: {result.get('phrase_hits', [])}")
    
    # Should have no URL boost (generic terms filtered out)
    url_boost = result.get('url_boost', 0.0)
    assert url_boost == 0.0, f"Expected no URL boost for generic URL, got {url_boost}"
    
    # Score should be low (only generic overlap if any)
    assert result['score'] < 5.0, f"Expected low score for generic match, got {result['score']}"
    
    print("\n[PASS] Generic URL correctly ignored")


def test_weak_match_rejection():
    """
    Test that weak matches are properly rejected.
    
    Scenario: Minimal overlap from generic sponsor connection,
    no strong evidence signals.
    
    Expected: This is validated at the tier resolution level, not scoring.
    But we can verify that low scores don't get artificial boosts.
    """
    print("\n" + "="*70)
    print("TEST 3: Weak Match Detection (Low Score)")
    print("="*70)
    
    claim_text = "I support healthcare for all Americans"
    
    # URL with no distinctive bill name
    claim_source_url = "https://example.house.gov/press/statement"
    
    # Unrelated bill
    bill_title = "National Park Service Authorization Act"
    bill_summary = "To authorize appropriations for the National Park Service"
    
    profile = CATEGORY_PROFILES["general"]
    
    result = score_action_against_claim(
        claim_text,
        bill_title,
        bill_summary,
        {},
        profile,
        claim_source_url
    )
    
    print(f"Claim text: {claim_text}")
    print(f"URL: {claim_source_url}")
    print(f"Bill title: {bill_title}")
    print(f"\nScore: {result['score']}")
    print(f"Overlap (basic): {result.get('overlap_basic', [])}")
    
    # Score should be very low (minimal/no overlap)
    assert result['score'] < 2.0, f"Expected score < 2.0 for weak match, got {result['score']}"
    
    print("\n[PASS] Weak match correctly has low score")


def test_url_extraction():
    """
    Test URL bill name extraction with various formats.
    """
    print("\n" + "="*70)
    print("TEST 4: URL Bill Name Extraction")
    print("="*70)
    
    test_cases = [
        (
            "https://example.gov/press/pass-defiance-act",
            "defiance act act",
            "Should extract 'defiance act' (distinctive token: 'defiance' >= 5 chars)"
        ),
        (
            "https://example.gov/news/introducing-safe-act-2025",
            None,
            "Should reject 'safe act' ('safe' only 4 chars, not distinctive enough)"
        ),
        (
            "https://example.gov/press/member-statement",
            None,
            "Should reject generic URL (no 'act')"
        ),
        (
            "https://example.gov/press/calling-pass-act",
            None,
            "Should reject URL with only 'act' and stopwords"
        ),
        (
            "https://example.gov/press/infrastructure-investment-jobs-act",
            "infrastructure investment jobs act act",
            "Should extract multi-word bill name (multiple distinctive tokens)"
        ),
    ]
    
    for url, expected, description in test_cases:
        result = extract_bill_name_from_url(url)
        print(f"\nURL: {url}")
        print(f"Expected: {expected}")
        print(f"Got: {result}")
        print(f"Test: {description}")
        
        if expected is None:
            assert result is None, f"Expected None, got '{result}'"
        else:
            assert result is not None, f"Expected '{expected}', got None"
            # Normalize whitespace for comparison
            result_normalized = ' '.join(result.split())
            expected_normalized = ' '.join(expected.split())
            assert expected_normalized in result_normalized or result_normalized in expected_normalized, \
                f"Expected '{expected_normalized}' in result '{result_normalized}'"
        
        print("[PASS]")


def test_title_normalization():
    """
    Test bill title normalization for fuzzy matching.
    """
    print("\n" + "="*70)
    print("TEST 5: Title Normalization")
    print("="*70)
    
    test_cases = [
        ("DEFIANCE Act of 2025", "defiance act"),
        ("Stop AI Price Gouging and Wage Fixing Act of 2025", "stop ai price gouging and wage fixing act"),
        ("National Infrastructure Bank Act of 2024", "national infrastructure bank act"),
        ("H.R. 1234 - Test Act", "h r 1234 test act"),
    ]
    
    for title, expected_core in test_cases:
        result = normalize_title_for_matching(title)
        print(f"\nTitle: {title}")
        print(f"Normalized: {result}")
        
        assert expected_core in result, f"Expected '{expected_core}' in '{result}'"
        assert "2024" not in result and "2025" not in result, "Year should be removed"
        
        print("[PASS]")


if __name__ == "__main__":
    print("\n" + "="*70)
    print("URL-BASED MATCHING REGRESSION TESTS")
    print("="*70)
    
    try:
        test_url_title_match_promotes_tier()
        test_url_boost_no_false_positives()
        test_weak_match_rejection()
        test_url_extraction()
        test_title_normalization()
        
        print("\n" + "="*70)
        print("ALL TESTS PASSED")
        print("="*70)
        
    except AssertionError as e:
        print(f"\n[FAIL] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
