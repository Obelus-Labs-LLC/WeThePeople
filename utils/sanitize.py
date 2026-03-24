"""
Input sanitization utilities for user-supplied data.

Provides string cleaning, search query sanitization, and entity ID validation.
Uses only Python stdlib — no external dependencies.
"""

import re
import unicodedata


def sanitize_string(s: str, max_length: int = 1000) -> str:
    """Strip null bytes, control characters, and enforce max length.

    Args:
        s: Raw input string.
        max_length: Maximum allowed length (default 1000).

    Returns:
        Cleaned string, truncated to max_length.
    """
    if not isinstance(s, str):
        return ""

    # Remove null bytes
    s = s.replace("\x00", "")

    # Remove ASCII control characters (0x01-0x08, 0x0B-0x0C, 0x0E-0x1F, 0x7F)
    # but preserve \t (0x09), \n (0x0A), \r (0x0D)
    s = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]", "", s)

    # Remove Unicode control category characters (Cc) except whitespace
    cleaned = []
    for ch in s:
        if unicodedata.category(ch) == "Cc" and ch not in ("\t", "\n", "\r"):
            continue
        cleaned.append(ch)
    s = "".join(cleaned)

    # Truncate
    return s[:max_length]


# Patterns that look like SQL injection attempts
_SQL_PATTERNS = re.compile(
    r"""
    (?:--|;|\b(?:DROP|ALTER|INSERT|UPDATE|DELETE|EXEC|EXECUTE|UNION|SELECT)\b)
    """,
    re.IGNORECASE | re.VERBOSE,
)


def sanitize_search_query(q: str) -> str:
    """Sanitize a search query string.

    Applies sanitize_string plus:
      - Strips SQL-like patterns (DROP, UNION SELECT, etc.)
      - Normalizes whitespace to single spaces
      - Trims leading/trailing whitespace

    Args:
        q: Raw search query.

    Returns:
        Cleaned query string.
    """
    q = sanitize_string(q, max_length=200)

    # Strip SQL-like patterns
    q = _SQL_PATTERNS.sub("", q)

    # Normalize whitespace
    q = re.sub(r"\s+", " ", q).strip()

    return q


# Valid entity ID: alphanumeric, hyphens, underscores
_ENTITY_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def validate_entity_id(entity_id: str) -> str:
    """Validate an entity ID (alphanumeric, hyphens, underscores only).

    Args:
        entity_id: Raw entity identifier.

    Returns:
        The validated entity_id string.

    Raises:
        ValueError: If the ID contains invalid characters or exceeds 100 chars.
    """
    if not isinstance(entity_id, str) or not entity_id:
        raise ValueError("Entity ID must be a non-empty string")

    entity_id = entity_id.strip()

    if len(entity_id) > 100:
        raise ValueError("Entity ID must be 100 characters or fewer")

    if not _ENTITY_ID_PATTERN.match(entity_id):
        raise ValueError(
            "Entity ID must contain only alphanumeric characters, hyphens, and underscores"
        )

    return entity_id
