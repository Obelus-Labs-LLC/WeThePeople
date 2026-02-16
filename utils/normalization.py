"""
Normalization utilities for bill identifiers and deduplication.
Prevents chaos from inconsistent formatting in Congress.gov API.
"""
import hashlib
import re


def normalize_bill_id(congress: int, bill_type: str, bill_number: int) -> str:
    """
    Create stable, deterministic bill identifier.
    
    Format: {bill_type}{bill_number}-{congress}
    Examples: hr12-118, s42-117, hjres5-119
    
    Args:
        congress: Congress number (e.g., 118)
        bill_type: Bill type (HR, S, HJRES, etc.)
        bill_number: Bill number (e.g., 2670)
    
    Returns:
        Normalized bill_id string (lowercase, consistent format)
    """
    # Normalize bill_type to lowercase, strip whitespace
    normalized_type = str(bill_type).lower().strip()
    
    # Format: {type}{number}-{congress}
    return f"{normalized_type}{bill_number}-{congress}"


def normalize_action_text(text: str) -> str:
    """
    Normalize action text for deduplication.
    
    - Lowercase
    - Strip extra whitespace
    - Remove common punctuation variations
    
    Args:
        text: Raw action text from Congress.gov
    
    Returns:
        Normalized text for hashing
    """
    if not text:
        return ""
    
    # Lowercase
    normalized = text.lower()
    
    # Replace multiple whitespace with single space
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Strip leading/trailing whitespace
    normalized = normalized.strip()
    
    # Remove trailing periods (common variation)
    normalized = normalized.rstrip('.')
    
    return normalized


def compute_action_dedupe_hash(bill_id: str, action_date: str, action_text: str) -> str:
    """
    Compute SHA1 hash for action deduplication.
    
    Prevents duplicate actions from being stored when Congress.gov
    returns the same action with slight rephrasing or formatting changes.
    
    Args:
        bill_id: Normalized bill identifier (e.g., "hr2670-118")
        action_date: ISO date string (e.g., "2024-01-15")
        action_text: Raw action text from Congress.gov
    
    Returns:
        40-character SHA1 hex digest
    """
    # Normalize action text before hashing
    normalized_text = normalize_action_text(action_text)
    
    # Combine components
    key = f"{bill_id}|{action_date}|{normalized_text}"
    
    # SHA1 hash
    return hashlib.sha1(key.encode('utf-8')).hexdigest()


def extract_chamber_from_action(action_code: str = None, action_text: str = None) -> str | None:
    """
    Extract chamber from action data when explicitly provided.
    
    ONLY returns chamber if it's clear from action_code or explicitly stated.
    Does NOT infer from action_text to avoid hallucination.
    
    Args:
        action_code: Action code from Congress.gov (e.g., "Intro-H", "Passed/agreed to in Senate")
        action_text: Action text (only used for explicit chamber mentions)
    
    Returns:
        "House", "Senate", or None (if unclear)
    """
    if not action_code and not action_text:
        return None
    
    # Check action_code first (most reliable)
    if action_code:
        action_code_lower = action_code.lower()
        
        # Common action codes with clear chamber
        if any(code in action_code_lower for code in ['intro-h', 'h11100', 'h12410']):
            return "House"
        elif any(code in action_code_lower for code in ['intro-s', 's11100']):
            return "Senate"
        elif 'house' in action_code_lower:
            return "House"
        elif 'senate' in action_code_lower:
            return "Senate"
    
    # Check action_text for explicit chamber mentions (conservative)
    if action_text:
        text_lower = action_text.lower()
        
        # Only match very explicit phrases
        if text_lower.startswith('introduced in house'):
            return "House"
        elif text_lower.startswith('introduced in senate'):
            return "Senate"
        elif text_lower.startswith('passed house'):
            return "House"
        elif text_lower.startswith('passed senate'):
            return "Senate"
        elif text_lower.startswith('received in the house'):
            return "House"
        elif text_lower.startswith('received in the senate'):
            return "Senate"
    
    # If unclear, return None (don't hallucinate)
    return None


def extract_committee_from_action(action_text: str = None, raw_json: dict = None) -> str | None:
    """
    Extract committee name from action data when explicitly provided.
    
    ONLY returns committee if it's in raw_json or very explicitly stated.
    Does NOT parse action_text aggressively to avoid hallucination.
    
    Args:
        action_text: Action text from Congress.gov
        raw_json: Raw JSON response (may contain committee data)
    
    Returns:
        Committee name or None (if not explicitly provided)
    """
    # Check raw_json first (most reliable)
    if raw_json:
        # Congress.gov may provide committee data in various structures
        if 'committee' in raw_json:
            committee = raw_json['committee']
            if isinstance(committee, dict) and 'name' in committee:
                return committee['name']
            elif isinstance(committee, str):
                return committee
        
        if 'committees' in raw_json and raw_json['committees']:
            # Take first committee if array
            first_committee = raw_json['committees'][0]
            if isinstance(first_committee, dict) and 'name' in first_committee:
                return first_committee['name']
    
    # Check action_text for very explicit committee mentions
    if action_text:
        # Only match explicit patterns like "referred to the Committee on X"
        match = re.search(r'referred to the (?:Committee on |)([^,\.]+)', action_text, re.IGNORECASE)
        if match:
            committee_name = match.group(1).strip()
            # Return only if it looks like a real committee name (not too short/generic)
            if len(committee_name) > 3:
                return committee_name
    
    # If unclear, return None (don't hallucinate)
    return None
