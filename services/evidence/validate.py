"""
Evidence validation module.

Validates evidence_json arrays against a strict schema to ensure:
1. All signals follow the type:value format
2. Signal types are from the allowed vocabulary
3. Signal values match expected patterns (e.g., timing must be before/during/after)

This prevents garbage data from entering the evidence layer and provides
clear error messages when validation fails.
"""

import json
from pathlib import Path
from typing import List, Optional
import jsonschema
from jsonschema import validate, ValidationError


# Load schema once at module import
SCHEMA_PATH = Path(__file__).parent / "schema.json"
with open(SCHEMA_PATH) as f:
    EVIDENCE_SCHEMA = json.load(f)


def validate_evidence(evidence_list: Optional[List[str]]) -> None:
    """
    Validate evidence array against schema.
    
    Args:
        evidence_list: Array of evidence signals in "type:value" format
    
    Raises:
        jsonschema.ValidationError: If evidence doesn't match schema
    
    Examples:
        >>> validate_evidence(["url_match:HR1234", "timing:before"])
        # Success - no exception
        
        >>> validate_evidence(["invalid-format"])
        # Raises ValidationError
        
        >>> validate_evidence(["timing:tomorrow"])
        # Raises ValidationError - invalid timing value
    """
    if evidence_list is None:
        return  # None is allowed (no evidence)
    
    # Validate against schema
    try:
        validate(instance=evidence_list, schema=EVIDENCE_SCHEMA)
    except ValidationError as e:
        # Enhance error message with context
        raise ValidationError(
            f"Evidence validation failed: {e.message}\n"
            f"Invalid evidence: {evidence_list}\n"
            f"Path: {'.'.join(str(p) for p in e.path)}"
        )


def validate_evidence_dict(evidence_dict: dict) -> None:
    """
    Validate evidence structure from match results before serialization.
    
    Expected structure from services/matching.py:
        {
            "tier": str,
            "relevance": str | None,
            "progress": str | None,
            "timing": str | None,
        }
    
    Args:
        evidence_dict: Evidence dict from match result
        
    Raises:
        ValueError: If evidence dict has invalid structure
    """
    if not isinstance(evidence_dict, dict):
        raise ValueError(f"Evidence must be dict, got {type(evidence_dict)}")
    
    # Required field
    if "tier" not in evidence_dict:
        raise ValueError("Evidence dict missing required 'tier' field")
    
    # Tier must be valid (align with services/matching evidence framework)
    # Keep backwards-compatible values.
    valid_tiers = {"none", "weak", "moderate", "medium", "strong", "very_strong"}
    if evidence_dict["tier"] not in valid_tiers:
        raise ValueError(
            f"Invalid tier '{evidence_dict['tier']}'. Must be one of: {valid_tiers}"
        )
    
    # Optional timing field validation
    if "timing" in evidence_dict and evidence_dict["timing"] is not None:
        # Matching currently emits: follow_through | retroactive_credit | unknown
        # Keep older values for compatibility.
        valid_timing = {"before", "during", "after", "follow_through", "retroactive_credit", "unknown"}
        if evidence_dict["timing"] not in valid_timing:
            raise ValueError(
                f"Invalid timing '{evidence_dict['timing']}'. Must be one of: {valid_timing}"
            )
    
    # Optional progress field validation
    if "progress" in evidence_dict and evidence_dict["progress"] is not None:
        # Matching currently emits: introduced | passed_committee | passed_chamber | enacted | unknown
        # Keep older values for compatibility.
        valid_progress = {
            "introduced",
            "passed_committee",
            "passed_chamber",
            "passed_house",
            "passed_senate",
            "enacted",
            "unknown",
        }
        if evidence_dict["progress"] not in valid_progress:
            raise ValueError(
                f"Invalid progress '{evidence_dict['progress']}'. Must be one of: {valid_progress}"
            )


if __name__ == "__main__":
    # Self-test
    print("Testing evidence validation...")
    
    # Valid cases
    validate_evidence(None)
    validate_evidence([])
    validate_evidence(["url_match:HR1234"])
    validate_evidence(["timing:before", "progress:enacted", "phrase:health care reform"])
    
    # Valid evidence dict
    validate_evidence_dict({
        "tier": "strong",
        "relevance": "high",
        "progress": "enacted",
        "timing": "before"
    })
    
    print("✓ All validation tests passed")
    
    # Invalid cases (should raise)
    try:
        validate_evidence(["invalid-format"])
        assert False, "Should have raised ValidationError"
    except ValidationError:
        print("✓ Correctly rejected invalid format")
    
    try:
        validate_evidence(["timing:tomorrow"])
        assert False, "Should have raised ValidationError"
    except ValidationError:
        print("✓ Correctly rejected invalid timing value")
    
    try:
        validate_evidence_dict({"tier": "invalid_tier"})
        assert False, "Should have raised ValueError"
    except ValueError:
        print("✓ Correctly rejected invalid tier")
    
    print("\n✓ Evidence validation module working correctly")
