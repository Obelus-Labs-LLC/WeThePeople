"""
Prompt templates for LLM-powered claim extraction.

Prompts are loaded from CLAIM_EXTRACTION_SYSTEM_PROMPT env var (set in prompts.env
on the server). Falls back to a minimal default if not set.
"""

import os

_DEFAULT_CLAIM_PROMPT = (
    "You are a political analyst. Extract factual, verifiable claims from political "
    "documents. Return a JSON array of claim objects. No other text."
)

CLAIM_EXTRACTION_SYSTEM_PROMPT = os.getenv(
    "CLAIM_EXTRACTION_SYSTEM_PROMPT", _DEFAULT_CLAIM_PROMPT
).replace("\\n", "\n")


def build_claim_extraction_prompt(
    text: str,
    person_name: str,
    source_url: str = "",
    source_type: str = "press_release",
) -> str:
    """
    Build the user message prompt for claim extraction.

    Args:
        text: Full document text
        person_name: The politician's display name
        source_url: URL of the source document
        source_type: Type of document
    """
    source_info = f"\nSource URL: {source_url}" if source_url else ""

    return f"""Extract all factual, verifiable claims made by or about {person_name} from the following {source_type}.

For each claim, provide a JSON object with these fields:
- claim_text: A clear, standalone statement of the claim (include the politician's name)
- category: One of: legislative, funding, oversight, policy_position, announcement, vote
- intent: One of: sponsored, cosponsored, voted_for, voted_against, secured_funding, demanded, investigated, announced, opposed, supported
- bill_references: Array of bill IDs mentioned (e.g., ["H.R. 1234", "S. 5678"]), empty array if none
- confidence: 0.0-1.0 how confident you are this is a real, specific, verifiable claim
- source_quote: The exact passage from the document that supports this claim
- context: Brief context about what policy area or issue this relates to

Politician: {person_name}
Document type: {source_type}{source_info}

--- DOCUMENT START ---
{text}
--- DOCUMENT END ---

Extract all claims as a JSON array:"""
