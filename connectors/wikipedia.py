"""
Wikipedia / MediaWiki API Connector — Politician Profile Data

Scrapes Wikipedia for structured politician profile data:
- Biography summaries (born, grew up, education, career)
- Infobox data (party, office, spouse, alma mater, etc.)
- Section-by-section content (Early life, Education, Career, etc.)
- Wikidata entity IDs for cross-referencing

This powers the "profile" page for each politician in WeThePeople —
a quick backstory, timeline, and educational background.

API docs: https://en.wikipedia.org/w/api.php
Auth: None required (public API)
Rate limit: Be polite — 1s between calls, identify via User-Agent
"""

import re
import time
from typing import Optional, List, Dict, Any, Tuple

from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between API calls (seconds)
POLITE_DELAY = 1.0

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_REST_API = "https://en.wikipedia.org/api/rest_v1"

# User-Agent: Wikipedia requires a descriptive UA
USER_AGENT = "WeThePeople/1.0 (Political accountability platform; contact: dev@wethepeople.app)"

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
}


# ============================================================================
# CORE API HELPERS
# ============================================================================

def _wiki_get(params: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """
    Make a GET request to the MediaWiki Action API.

    Args:
        params: API parameters (action, titles, etc.)

    Returns:
        JSON response dict, or None on error
    """
    import requests

    params["format"] = "json"
    params["formatversion"] = "2"

    try:
        response = requests.get(
            WIKI_API,
            params=params,
            headers=HEADERS,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    except requests.RequestException as e:
        logger.error("Wikipedia API request failed: %s", e)
        return None


def _rest_get(endpoint: str) -> Optional[Dict[str, Any]]:
    """
    Make a GET request to the Wikipedia REST API.

    Args:
        endpoint: REST endpoint (e.g., "page/summary/Barack_Obama")

    Returns:
        JSON response dict, or None on error
    """
    import requests

    url = f"{WIKI_REST_API}/{endpoint}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=15)

        if response.status_code == 404:
            logger.info("Wikipedia REST API: page not found for %s", endpoint)
            return None

        response.raise_for_status()
        return response.json()

    except requests.RequestException as e:
        logger.error("Wikipedia REST API request failed: %s", e)
        return None


# ============================================================================
# PAGE SUMMARY — Quick biography blurb
# ============================================================================

def get_page_summary(title: str) -> Optional[Dict[str, Any]]:
    """
    Get a Wikipedia page summary (intro paragraph + metadata).

    This is the fastest way to get a politician's bio blurb.

    Args:
        title: Wikipedia page title (e.g., "Alexandria_Ocasio-Cortez")

    Returns:
        Dict with:
        - title, description, extract (plain text summary)
        - thumbnail (image URL if available)
        - content_urls (links to full page)
        - wikibase_item (Wikidata QID)
        Or None if not found
    """
    # Normalize title: spaces to underscores
    title = title.strip().replace(" ", "_")

    data = _rest_get(f"page/summary/{title}")
    if not data:
        return None

    logger.info("Got summary for '%s': %d chars", title, len(data.get("extract", "")))
    return data


def get_bio_blurb(name: str) -> Optional[str]:
    """
    Get a plain-text biography blurb for a politician.

    Convenience function — returns just the extract text.

    Args:
        name: Politician name (e.g., "Alexandria Ocasio-Cortez")

    Returns:
        Biography text string, or None
    """
    data = get_page_summary(name)
    if data:
        return data.get("extract")
    return None


# ============================================================================
# PAGE SECTIONS — Structured content (Early life, Education, Career, etc.)
# ============================================================================

def get_page_sections(title: str) -> List[Dict[str, Any]]:
    """
    Get the section structure of a Wikipedia page.

    Useful for identifying which sections exist (Education, Career, etc.)
    before fetching specific section content.

    Args:
        title: Wikipedia page title

    Returns:
        List of section dicts with toclevel, number, line (heading text), index
    """
    title = title.strip().replace(" ", "_")

    data = _wiki_get({
        "action": "parse",
        "page": title,
        "prop": "sections",
    })

    if not data or "parse" not in data:
        return []

    sections = data["parse"].get("sections", [])
    logger.info("Found %d sections for '%s'", len(sections), title)
    return sections


def get_section_text(title: str, section_index: int) -> Optional[str]:
    """
    Get plain text of a specific section by index.

    Args:
        title: Wikipedia page title
        section_index: Section index (from get_page_sections())

    Returns:
        Plain text content of the section, or None
    """
    title = title.strip().replace(" ", "_")

    data = _wiki_get({
        "action": "parse",
        "page": title,
        "prop": "wikitext",
        "section": str(section_index),
    })

    if not data or "parse" not in data:
        return None

    wikitext = data["parse"].get("wikitext", "")

    # Strip basic wikitext markup for readability
    text = _clean_wikitext(wikitext)
    return text if text else None


def get_section_by_name(title: str, section_name: str) -> Optional[str]:
    """
    Get section text by heading name (case-insensitive).

    Args:
        title: Wikipedia page title
        section_name: Section heading (e.g., "Early life", "Education", "Career")

    Returns:
        Plain text of the matching section, or None
    """
    sections = get_page_sections(title)

    for section in sections:
        if section.get("line", "").lower().strip() == section_name.lower().strip():
            return get_section_text(title, int(section["index"]))

    logger.info("Section '%s' not found in '%s'", section_name, title)
    return None


# ============================================================================
# INFOBOX — Structured profile data (party, office, education, etc.)
# ============================================================================

def get_infobox(title: str) -> Dict[str, str]:
    """
    Extract infobox data from a Wikipedia page.

    The infobox is the structured sidebar on politician pages containing
    party, office, alma mater, born, spouse, etc.

    Args:
        title: Wikipedia page title

    Returns:
        Dict mapping infobox field names to values (strings).
        Common fields: office, party, birth_date, birth_place,
        alma_mater, spouse, children, residence, website
    """
    title = title.strip().replace(" ", "_")

    data = _wiki_get({
        "action": "parse",
        "page": title,
        "prop": "wikitext",
        "section": "0",  # Lead section (contains infobox)
    })

    if not data or "parse" not in data:
        return {}

    wikitext = data["parse"].get("wikitext", "")
    return _parse_infobox(wikitext)


def _parse_infobox(wikitext: str) -> Dict[str, str]:
    """
    Parse infobox template from wikitext.

    Handles nested templates and multi-line values.
    """
    infobox = {}

    # Find infobox template
    match = re.search(r'\{\{Infobox[^}]*', wikitext, re.IGNORECASE)
    if not match:
        return {}

    # Extract content between {{ and matching }}
    start = match.start()
    depth = 0
    end = start
    for i in range(start, len(wikitext) - 1):
        if wikitext[i:i+2] == "{{":
            depth += 1
        elif wikitext[i:i+2] == "}}":
            depth -= 1
            if depth == 0:
                end = i + 2
                break

    infobox_text = wikitext[start:end]

    # Parse | key = value pairs
    # Split on | that are at the top level (depth 0)
    current_key = ""
    current_value = ""
    depth = 0

    for line in infobox_text.split("\n"):
        stripped = line.strip()

        # Track template depth
        depth += stripped.count("{{") - stripped.count("}}")

        if depth <= 1 and stripped.startswith("|") and "=" in stripped:
            # Save previous key-value
            if current_key:
                infobox[current_key] = _clean_infobox_value(current_value)

            # Parse new key-value
            parts = stripped[1:].split("=", 1)
            current_key = parts[0].strip().lower()
            current_value = parts[1].strip() if len(parts) > 1 else ""
        elif current_key:
            current_value += " " + stripped

    # Save last key-value
    if current_key:
        infobox[current_key] = _clean_infobox_value(current_value)

    return infobox


def _clean_infobox_value(value: str) -> str:
    """Clean wikitext markup from an infobox value."""
    # Remove [[ ]] links, keeping display text
    value = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', value)
    # Remove {{ }} templates (simple ones)
    value = re.sub(r'\{\{[^}]*\}\}', '', value)
    # Remove HTML tags
    value = re.sub(r'<[^>]+>', '', value)
    # Remove refs
    value = re.sub(r'<ref[^>]*>.*?</ref>', '', value, flags=re.DOTALL)
    value = re.sub(r'<ref[^/]*/>', '', value)
    # Clean up whitespace
    value = re.sub(r'\s+', ' ', value).strip()
    return value


# ============================================================================
# FULL TEXT — Get entire article as plain text
# ============================================================================

def get_full_text(title: str) -> Optional[str]:
    """
    Get the full plain-text extract of a Wikipedia page.

    WARNING: Can be very long for major politicians. Consider using
    get_section_by_name() for targeted data.

    Args:
        title: Wikipedia page title

    Returns:
        Full article text, or None
    """
    title = title.strip().replace(" ", "_")

    data = _wiki_get({
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "explaintext": "true",
        "exsectionformat": "plain",
    })

    if not data:
        return None

    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return None

    page = pages[0]
    if page.get("missing"):
        logger.info("Wikipedia page not found: %s", title)
        return None

    return page.get("extract")


# ============================================================================
# SEARCH — Find politician Wikipedia pages
# ============================================================================

def search_pages(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search Wikipedia for pages matching a query.

    Useful for finding the correct page title for a politician.

    Args:
        query: Search query (e.g., "AOC congresswoman")
        limit: Max results (default 5)

    Returns:
        List of result dicts with title, pageid, snippet
    """
    data = _wiki_get({
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srlimit": str(limit),
        "srprop": "snippet|titlesnippet",
    })

    if not data:
        return []

    results = data.get("query", {}).get("search", [])
    logger.info("Wikipedia search '%s': %d results", query, len(results))
    return results


def find_politician_page(
    name: str,
    state: Optional[str] = None,
    chamber: Optional[str] = None,
) -> Optional[str]:
    """
    Find the Wikipedia page title for a politician by name.

    Searches Wikipedia and returns the best match.  Uses state and chamber
    to disambiguate common names (e.g. "John Kennedy" → the Louisiana senator,
    not JFK).

    Args:
        name: Politician name (e.g., "Alexandria Ocasio-Cortez")
        state: Two-letter state code (e.g., "LA") for disambiguation
        chamber: "house" or "senate" for disambiguation

    Returns:
        Wikipedia page title, or None if not found
    """
    # Build a specific search query using all available context
    chamber_label = {"senate": "senator", "house": "representative"}.get(
        (chamber or "").lower(), "politician"
    )

    # Most specific first: "John Kennedy Louisiana senator"
    if state:
        from utils.state_names import STATE_NAMES  # two-letter → full name
        state_full = STATE_NAMES.get(state.upper(), state)
        query = f"{name} {state_full} {chamber_label}"
    else:
        query = f"{name} {chamber_label}"

    results = search_pages(query, limit=5)

    if not results:
        # Fallback: just name + politician
        results = search_pages(f"{name} politician", limit=5)

    if not results:
        results = search_pages(name, limit=5)

    if not results:
        return None

    # If we have state context, try to pick the result that mentions it
    if state:
        state_full_lower = STATE_NAMES.get(state.upper(), state).lower()
        for r in results:
            snippet = (r.get("snippet", "") + " " + r.get("title", "")).lower()
            if state_full_lower in snippet or state.lower() in snippet:
                title = r["title"]
                logger.info("Best match for '%s' (state=%s): %s", name, state, title)
                return title

    # Default to first result
    title = results[0].get("title", "")
    logger.info("Best match for '%s': %s", name, title)
    return title


# ============================================================================
# PROFILE BUILDER — High-level politician profile
# ============================================================================

def build_politician_profile(
    name: str,
    state: Optional[str] = None,
    chamber: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a comprehensive politician profile from Wikipedia.

    This is the primary function for WeThePeople profile pages.
    Fetches summary, infobox, and key sections in one call.

    Args:
        name: Politician name (e.g., "Alexandria Ocasio-Cortez")
        state: Two-letter state code for disambiguation
        chamber: "house" or "senate" for disambiguation

    Returns:
        Dict with:
        - name: Politician name
        - wikipedia_title: Actual Wikipedia page title
        - summary: Bio blurb (1-2 paragraphs)
        - thumbnail: Profile image URL
        - wikidata_id: Wikidata QID for cross-referencing
        - infobox: Structured data (party, office, alma_mater, birth_date, etc.)
        - sections: Dict of section_name -> text for key biography sections
        - url: Wikipedia page URL
    """
    profile: Dict[str, Any] = {
        "name": name,
        "wikipedia_title": None,
        "summary": None,
        "thumbnail": None,
        "wikidata_id": None,
        "infobox": {},
        "sections": {},
        "url": None,
    }

    # Step 1: Find the page (with disambiguation context)
    title = find_politician_page(name, state=state, chamber=chamber)
    if not title:
        logger.warning("No Wikipedia page found for '%s'", name)
        return profile

    profile["wikipedia_title"] = title
    profile["url"] = f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
    time.sleep(POLITE_DELAY)

    # Step 2: Get summary + thumbnail
    summary_data = get_page_summary(title)
    if summary_data:
        profile["summary"] = summary_data.get("extract")
        profile["wikidata_id"] = summary_data.get("wikibase_item")

        thumbnail = summary_data.get("thumbnail", {})
        if thumbnail:
            profile["thumbnail"] = thumbnail.get("source")

    time.sleep(POLITE_DELAY)

    # Step 3: Get infobox
    profile["infobox"] = get_infobox(title)
    time.sleep(POLITE_DELAY)

    # Step 4: Get key biography sections
    target_sections = [
        "Early life",
        "Early life and education",
        "Education",
        "Early life and career",
        "Career",
        "Political career",
        "Political positions",
        "Personal life",
        "Electoral history",
    ]

    sections_list = get_page_sections(title)
    section_headings = {s.get("line", "").lower(): s for s in sections_list}

    for target in target_sections:
        if target.lower() in section_headings:
            time.sleep(POLITE_DELAY)
            section = section_headings[target.lower()]
            text = get_section_text(title, int(section["index"]))
            if text:
                profile["sections"][target] = text

    found_sections = list(profile["sections"].keys())
    logger.info(
        "Built profile for '%s': summary=%s, infobox=%d fields, sections=%s",
        name,
        "yes" if profile["summary"] else "no",
        len(profile["infobox"]),
        found_sections,
    )

    return profile


# ============================================================================
# WIKITEXT CLEANING HELPERS
# ============================================================================

def _clean_wikitext(text: str) -> str:
    """
    Convert wikitext to readable plain text.

    Handles common markup: links, templates, refs, HTML tags.
    """
    # Remove references
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.DOTALL)
    text = re.sub(r'<ref[^/]*/>', '', text)

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Convert [[ ]] links to display text
    text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', text)

    # Remove {{ }} templates
    # Handle nested templates by iterating
    prev = ""
    while prev != text:
        prev = text
        text = re.sub(r'\{\{[^{}]*\}\}', '', text)

    # Remove section headings markup (== heading ==)
    text = re.sub(r'={2,}\s*(.*?)\s*={2,}', r'\1', text)

    # Remove bullets and list markers
    text = re.sub(r'^\*+\s*', '- ', text, flags=re.MULTILINE)
    text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)

    # Remove file/image links
    text = re.sub(r'\[\[(?:File|Image):[^\]]*\]\]', '', text, flags=re.IGNORECASE)

    # Remove categories
    text = re.sub(r'\[\[Category:[^\]]*\]\]', '', text, flags=re.IGNORECASE)

    # Clean up whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    text = text.strip()

    return text


# ============================================================================
# BATCH — Process multiple politicians
# ============================================================================

def build_profiles_batch(names: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Build profiles for multiple politicians (with polite delays).

    Args:
        names: List of politician names

    Returns:
        Dict mapping name to profile dict
    """
    results = {}
    total = len(names)

    for i, name in enumerate(names, 1):
        logger.info("Building profile %d/%d: %s", i, total, name)
        results[name] = build_politician_profile(name)

        # Extra delay between full profile builds
        if i < total:
            time.sleep(POLITE_DELAY * 2)

    built = sum(1 for p in results.values() if p.get("summary"))
    logger.info("Batch complete: %d/%d profiles built", built, total)
    return results


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys
    import json

    setup_logging("INFO")

    print("Wikipedia / MediaWiki Connector Test")
    print("=" * 60)

    # Test 1: Search for a politician
    test_name = "Alexandria Ocasio-Cortez"
    print(f"\n1. Searching for '{test_name}'...")
    title = find_politician_page(test_name)
    if title:
        print(f"   Found: {title}")
    else:
        print("   Not found")
        sys.exit(1)

    time.sleep(POLITE_DELAY)

    # Test 2: Get summary
    print(f"\n2. Getting page summary...")
    summary = get_page_summary(title)
    if summary:
        blurb = summary.get("extract", "")[:200]
        print(f"   Summary: {blurb}...")
        print(f"   Wikidata ID: {summary.get('wikibase_item', 'N/A')}")
        thumb = summary.get("thumbnail", {})
        if thumb:
            print(f"   Thumbnail: {thumb.get('source', 'N/A')[:80]}...")
    else:
        print("   No summary available")

    time.sleep(POLITE_DELAY)

    # Test 3: Get infobox
    print(f"\n3. Getting infobox data...")
    infobox = get_infobox(title)
    if infobox:
        print(f"   Found {len(infobox)} fields:")
        for key in ["party", "office", "birth_date", "birth_place", "alma_mater",
                     "spouse", "residence"]:
            if key in infobox:
                print(f"   - {key}: {infobox[key][:80]}")
    else:
        print("   No infobox found")

    time.sleep(POLITE_DELAY)

    # Test 4: Get sections list
    print(f"\n4. Getting page sections...")
    sections = get_page_sections(title)
    if sections:
        print(f"   Found {len(sections)} sections:")
        for s in sections[:10]:
            indent = "  " * int(s.get("toclevel", 1))
            print(f"   {indent}{s.get('line', 'unknown')}")
    else:
        print("   No sections found")

    time.sleep(POLITE_DELAY)

    # Test 5: Get "Early life" section
    print(f"\n5. Getting 'Early life and education' section...")
    early = get_section_by_name(title, "Early life and education")
    if not early:
        early = get_section_by_name(title, "Early life")
    if early:
        print(f"   Content ({len(early)} chars): {early[:200]}...")
    else:
        print("   Section not found")

    # Test 6: Full profile build
    print(f"\n6. Building full profile for '{test_name}'...")
    time.sleep(POLITE_DELAY)
    profile = build_politician_profile(test_name)
    print(f"   Wikipedia title: {profile['wikipedia_title']}")
    print(f"   Summary: {'yes' if profile['summary'] else 'no'}")
    print(f"   Thumbnail: {'yes' if profile['thumbnail'] else 'no'}")
    print(f"   Wikidata ID: {profile['wikidata_id']}")
    print(f"   Infobox fields: {len(profile['infobox'])}")
    print(f"   Sections found: {list(profile['sections'].keys())}")
    print(f"   URL: {profile['url']}")

    print("\n" + "=" * 60)
    print("Wikipedia connector test complete.")
