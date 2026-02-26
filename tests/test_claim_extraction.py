"""
Test claim extraction logic.
Validates that we extract expected claim sentences from sample HTML.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import extract_claim_sentences


def test_basic_extraction():
    """Test basic claim extraction with known triggers."""
    
    sample_text = """
    Today, I introduced the Climate Action Now Act to combat climate change and protect our environment for future generations.
    This is a historic moment for our community and we are grateful. I am proud to serve you all.
    I voted for the Infrastructure Investment and Jobs Act last week to create thousands of good-paying jobs across America.
    The weather is nice today and we had a great meeting yesterday. Everyone enjoyed it very much.
    I cosponsored legislation to expand Medicare coverage and lower prescription drug costs for millions of American families.
    Please donate to support our campaign and help us win. Click here to chip in just five dollars today.
    My bill will create thousands of good-paying jobs and strengthen our economy for working families across the country.
    """
    
    claims = extract_claim_sentences(sample_text, max_claims=10)
    
    print("Extracted claims:")
    for i, claim in enumerate(claims, 1):
        print(f"{i}. {claim}")
    
    # Assertions
    assert len(claims) > 0, "Should extract at least one claim"
    
    # Check that fundraising sentences are excluded
    fundraising_excluded = all('donate' not in claim.lower() and 'chip in' not in claim.lower() for claim in claims)
    assert fundraising_excluded, "Fundraising sentences should be excluded"
    
    # Check that trigger phrases are present
    trigger_found = any(
        'introduced' in claim.lower() or 
        'voted' in claim.lower() or 
        'cosponsored' in claim.lower() or
        'my bill' in claim.lower()
        for claim in claims
    )
    assert trigger_found, "At least one claim should contain a trigger phrase"
    
    print("\n[OK] All assertions passed")


def test_boilerplate_filtering():
    """Test that boilerplate is filtered out."""
    
    sample_text = """
    Click here to read more about our work and see what we are doing every day.
    I introduced the American Jobs Act to create millions of good-paying jobs and rebuild our infrastructure for the future.
    Follow us on social media for daily updates and news about our work in Congress and beyond.
    Share this important message with your friends and family members so they can stay informed about everything.
    I fought to secure federal funding for our local schools and ensure every child gets a quality education they deserve.
    """
    
    claims = extract_claim_sentences(sample_text, max_claims=10)
    
    print("\nBoilerplate filtering test:")
    for i, claim in enumerate(claims, 1):
        print(f"{i}. {claim}")
    
    # Check that boilerplate is excluded
    boilerplate_excluded = all(
        'click here' not in claim.lower() and
        'follow us' not in claim.lower() and
        'share this' not in claim.lower()
        for claim in claims
    )
    assert boilerplate_excluded, "Boilerplate should be excluded"
    
    # Check that real claims are included
    real_claims = any('introduced' in claim.lower() or 'fought' in claim.lower() for claim in claims)
    assert real_claims, f"Real claims should be included (got {len(claims)} claims)"
    
    print("\n[OK] Boilerplate filtering passed")


def test_sentence_length_filtering():
    """Test that very short and very long sentences are filtered."""
    
    sample_text = """
    I voted yes.
    I introduced the Comprehensive Climate Action and Economic Justice Act of 2024 to address the urgent crisis of climate change through bold policy reforms.
    I cosponsored legislation to expand access to affordable healthcare for all Americans.
    """ + " ".join(["word"] * 100)  # 100-word sentence (too long)
    
    claims = extract_claim_sentences(sample_text, max_claims=10)
    
    print("\nLength filtering test:")
    for i, claim in enumerate(claims, 1):
        print(f"{i}. ({len(claim.split())} words) {claim[:80]}...")
    
    # Check length constraints
    for claim in claims:
        word_count = len(claim.split())
        assert 10 <= word_count <= 60, f"Claim has {word_count} words, should be 10-60"
    
    print("\n[OK] Length filtering passed")


if __name__ == "__main__":
    print("=" * 70)
    print("CLAIM EXTRACTION TESTS")
    print("=" * 70)
    
    test_basic_extraction()
    test_boilerplate_filtering()
    test_sentence_length_filtering()
    
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED")
    print("=" * 70)
