"""
Test bill reference extraction and link filtering.

Tests:
1. Bill reference extraction from text
2. Link extraction filters out anchor links
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import extract_bill_references, extract_article_links
from bs4 import BeautifulSoup


def test_bill_reference_extraction():
    """Test extraction of bill references from text."""
    print("=" * 70)
    print("TEST: Bill Reference Extraction")
    print("=" * 70)
    
    # Test case 1: Multiple bill formats
    text1 = """
    Senator Warren introduced H.R. 1234 and cosponsored S. 5678.
    The bill H.R.3562 passed committee. I also support HR 999 and S 111.
    We need to pass H R 2025 immediately.
    """
    
    refs1 = extract_bill_references(text1)
    print("\nTest 1: Multiple bill formats")
    print(f"Input: {text1.strip()}")
    print(f"Display: {refs1['display']}")
    print(f"Normalized: {refs1['normalized']}")
    
    expected_display = ["H.R. 1234", "H.R. 2025", "H.R. 3562", "H.R. 999", "S. 111", "S. 5678"]
    expected_norm = ["hr1234", "hr2025", "hr3562", "hr999", "s111", "s5678"]
    assert refs1['display'] == expected_display, f"Expected {expected_display}, got {refs1['display']}"
    assert refs1['normalized'] == expected_norm, f"Expected {expected_norm}, got {refs1['normalized']}"
    print("✅ PASS")
    
    # Test case 2: No bill references
    text2 = "This is a statement about policy with no specific bills mentioned."
    refs2 = extract_bill_references(text2)
    print("\nTest 2: No bill references")
    print(f"Extracted: {refs2}")
    assert refs2['display'] == [], f"Expected empty list, got {refs2['display']}"
    assert refs2['normalized'] == [], f"Expected empty list, got {refs2['normalized']}"
    print("✅ PASS")
    
    # Test case 3: Real-world Senate press release excerpt
    text3 = """
    Senators Ron Wyden and Jeff Merkley (both D-Ore.) said today they have 
    introduced a pair of bills that would prevent January 6 rioters from 
    receiving taxpayer-funded payouts. The bills are S. 1123 and H.R. 3562.
    """
    refs3 = extract_bill_references(text3)
    print("\nTest 3: Real-world excerpt")
    print(f"Display: {refs3['display']}")
    print(f"Normalized: {refs3['normalized']}")
    expected_display3 = ["H.R. 3562", "S. 1123"]
    expected_norm3 = ["hr3562", "s1123"]
    assert refs3['display'] == expected_display3, f"Expected {expected_display3}, got {refs3['display']}"
    assert refs3['normalized'] == expected_norm3, f"Expected {expected_norm3}, got {refs3['normalized']}"
    print("✅ PASS")
    
    # Test case 4: Case insensitivity
    text4 = "The h.r. 2020 and s. 3030 bills were discussed."
    refs4 = extract_bill_references(text4)
    print("\nTest 4: Case insensitivity")
    print(f"Display: {refs4['display']}")
    print(f"Normalized: {refs4['normalized']}")
    expected_display4 = ["H.R. 2020", "S. 3030"]
    expected_norm4 = ["hr2020", "s3030"]
    assert refs4['display'] == expected_display4, f"Expected {expected_display4}, got {refs4['display']}"
    assert refs4['normalized'] == expected_norm4, f"Expected {expected_norm4}, got {refs4['normalized']}"
    print("✅ PASS")
    
    print("\n" + "=" * 70)
    print("✅ ALL BILL EXTRACTION TESTS PASSED")
    print("=" * 70)


def test_link_filtering():
    """Test that link extraction filters out anchor links."""
    print("\n" + "=" * 70)
    print("TEST: Link Filtering (No Anchors)")
    print("=" * 70)
    
    # Simulated HTML with anchor links (like Schumer's site)
    html = """
    <html>
    <body>
        <article>
            <a href="/newsroom/press-releases/bill-introduced">Real Article 1</a>
            <a href="#aria-skip-press">Skip Navigation</a>
            <a href="/press/statement-2024">Real Article 2</a>
            <a href="#content">Skip to Content</a>
            <a href="/news/legislation-update#section">Article with Fragment</a>
        </article>
        <nav>
            <a href="/newsroom/press-releases">Press Releases Index</a>
            <a href="?page=2">Page 2</a>
        </nav>
    </body>
    </html>
    """
    
    base_url = "https://example.senate.gov/newsroom/press-releases"
    links = extract_article_links(html, base_url)
    
    print("\nExtracted links:")
    for link in links:
        print(f"  {link}")
    
    # Verify no anchor-only links
    for link in links:
        assert '#' not in link, f"Link contains fragment: {link}"
        assert not link.endswith('#aria-skip-press'), f"Anchor link not filtered: {link}"
        assert not link.endswith('#content'), f"Anchor link not filtered: {link}"
    
    print("\n✅ No anchor links present")
    
    # Verify expected links are present (with fragments stripped)
    expected_paths = [
        '/newsroom/press-releases/bill-introduced',
        '/press/statement-2024',
        '/news/legislation-update'  # Fragment stripped
    ]
    
    for path in expected_paths:
        found = any(path in link for link in links)
        assert found, f"Expected path not found: {path}"
        print(f"✅ Found: {path}")
    
    # Verify index page is excluded
    assert base_url not in links, "Base URL should be excluded"
    print("✅ Base URL excluded")
    
    print("\n" + "=" * 70)
    print("✅ ALL LINK FILTERING TESTS PASSED")
    print("=" * 70)


def test_schumer_dry_run_regression():
    """
    Regression test: Ensure Schumer dry-run produces no fragment URLs.
    This is a placeholder - actual test would run dry-run and check URLs.
    """
    print("\n" + "=" * 70)
    print("TEST: Schumer Fragment Regression (Manual)")
    print("=" * 70)
    print("\n⚠️  To verify Schumer fix, run:")
    print("    python jobs/ingest_claims.py --person-id chuck_schumer --since-days 30 --limit-pages 3 --dry-run")
    print("\n    Then check output for URLs - none should contain '#'")
    print("\n✅ Test structure ready (manual verification required)")
    print("=" * 70)


if __name__ == "__main__":
    test_bill_reference_extraction()
    test_link_filtering()
    test_schumer_dry_run_regression()
    
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED")
    print("=" * 70)
