"""
Test evidence validation with valid and invalid cases.

Tests both:
1. Evidence array validation (evidence_json column)
2. Evidence dict validation (from match results)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from services.evidence.validate import validate_evidence, validate_evidence_dict
from jsonschema import ValidationError


def test_valid_evidence_arrays():
    """Test that valid evidence arrays pass validation"""
    print("Testing valid evidence arrays...")
    
    # Empty evidence
    validate_evidence(None)
    validate_evidence([])
    
    # Single signals
    validate_evidence(["url_match:HR1234"])
    validate_evidence(["url_partial:health"])
    validate_evidence(["phrase:affordable care act"])
    validate_evidence(["bill_ref:H.R. 1234"])
    validate_evidence(["policy_area:Health"])
    validate_evidence(["timing:before"])
    validate_evidence(["timing:during"])
    validate_evidence(["timing:after"])
    validate_evidence(["timing:follow_through"])
    validate_evidence(["timing:retroactive_credit"])
    validate_evidence(["timing:unknown"])
    validate_evidence(["progress:introduced"])
    validate_evidence(["progress:passed_committee"])
    validate_evidence(["progress:passed_chamber"])
    validate_evidence(["progress:passed_house"])
    validate_evidence(["progress:passed_senate"])
    validate_evidence(["progress:enacted"])
    validate_evidence(["progress:unknown"])
    validate_evidence(["fuzzy_title_match:0.92:0.85"])
    validate_evidence(["vote_record:s123-2024"])
    
    # Multiple signals
    validate_evidence([
        "url_match:HR1234",
        "timing:before",
        "progress:enacted",
        "policy_area:Health",
        "phrase:affordable care act"
    ])
    
    print("PASS: All valid evidence arrays passed\n")


def test_invalid_evidence_arrays():
    """Test that invalid evidence arrays are rejected"""
    print("Testing invalid evidence arrays...")
    
    invalid_cases = [
        (["invalid-format"], "Missing colon separator"),
        (["timing:tomorrow"], "Invalid timing value"),
        (["progress:pending"], "Invalid progress value"),
        (["unknown_type:value"], "Unknown evidence type"),
        ([""], "Empty string"),
    ]
    
    for evidence, reason in invalid_cases:
        try:
            validate_evidence(evidence)
            print(f"  ❌ FAILED: {reason} should have been rejected: {evidence}")
            sys.exit(1)
        except ValidationError:
            print(f"  PASS: Correctly rejected: {reason}")
    
    print()


def test_valid_evidence_dicts():
    """Test that valid evidence dicts pass validation"""
    print("Testing valid evidence dicts...")
    
    # Minimal valid dict
    validate_evidence_dict({"tier": "none"})
    validate_evidence_dict({"tier": "weak"})
    validate_evidence_dict({"tier": "moderate"})
    validate_evidence_dict({"tier": "medium"})
    validate_evidence_dict({"tier": "strong"})
    validate_evidence_dict({"tier": "very_strong"})
    
    # With optional fields
    validate_evidence_dict({
        "tier": "strong",
        "relevance": "high",
        "progress": "passed_committee",
        "timing": "follow_through"
    })
    
    # With None values (allowed)
    validate_evidence_dict({
        "tier": "medium",
        "relevance": None,
        "progress": None,
        "timing": None
    })
    
    print("PASS: All valid evidence dicts passed\n")


def test_invalid_evidence_dicts():
    """Test that invalid evidence dicts are rejected"""
    print("Testing invalid evidence dicts...")
    
    invalid_cases = [
        ({}, "Missing tier field"),
        ({"tier": "invalid_tier"}, "Invalid tier value"),
        ({"tier": "strong", "timing": "tomorrow"}, "Invalid timing value"),
        ({"tier": "strong", "progress": "pending"}, "Invalid progress value"),
        ("not a dict", "Not a dict"),
    ]
    
    for evidence, reason in invalid_cases:
        try:
            validate_evidence_dict(evidence)
            print(f"  ❌ FAILED: {reason} should have been rejected: {evidence}")
            sys.exit(1)
        except (ValueError, ValidationError):
            print(f"  PASS: Correctly rejected: {reason}")
    
    print()


def test_realistic_examples():
    """Test realistic evidence from actual matching scenarios"""
    print("Testing realistic examples...")
    
    # Example 1: Strong match with URL, timing, progress
    validate_evidence([
        "url_match:HR1234",
        "timing:before",
        "progress:enacted",
        "policy_area:Health"
    ])
    
    # Example 2: Medium match with phrase hits
    validate_evidence([
        "phrase:affordable care act",
        "phrase:health insurance",
        "timing:during",
        "progress:passed_house"
    ])
    
    # Example 3: Weak match with fuzzy title
    validate_evidence([
        "fuzzy_title_match:0.87:0.85",
        "timing:after"
    ])
    
    # Example 4: Vote match
    validate_evidence([
        "vote_record:s123-2024",
        "timing:during"
    ])
    
    # Example 5: Bill reference match
    validate_evidence([
        "bill_ref:H.R. 7322",
        "url_partial:hr7322",
        "timing:before",
        "progress:introduced"
    ])
    
    print("PASS: All realistic examples passed\n")


if __name__ == "__main__":
    print("=" * 70)
    print("EVIDENCE VALIDATION TEST SUITE")
    print("=" * 70)
    print()
    
    test_valid_evidence_arrays()
    test_invalid_evidence_arrays()
    test_valid_evidence_dicts()
    test_invalid_evidence_dicts()
    test_realistic_examples()
    
    print("=" * 70)
    print("PASS: ALL TESTS PASSED")
    print("=" * 70)
