"""
HealthCare.gov Content API Connector

Provides access to official ACA / health insurance content:
- Glossary of healthcare terms (200+ terms)
- Articles on coverage topics (pregnancy, retirees, quality ratings, etc.)
- Blog posts with policy updates
- Individual page content (any page as JSON)
- State-specific marketplace information

Useful for WeThePeople when politicians make claims about healthcare policy,
ACA provisions, or insurance coverage — cross-reference against the official
government source of truth.

API docs: https://www.healthcare.gov/developers/
Auth: None required (public API)
Rate limit: Be polite — 1s between calls
CORS: Enabled (client-side use supported)
"""

import time
import re
from typing import Optional, List, Dict, Any

from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between API calls (seconds)
POLITE_DELAY = 1.0

HEALTHCARE_GOV_BASE = "https://www.healthcare.gov"


# ============================================================================
# CORE API HELPER
# ============================================================================

def _hcgov_get(endpoint: str) -> Optional[Any]:
    """
    Make a GET request to the HealthCare.gov content API.

    The API works by appending .json to any page URL.

    Args:
        endpoint: API endpoint path (e.g., "/api/glossary.json")

    Returns:
        JSON response (dict or list), or None on error
    """
    import requests

    url = f"{HEALTHCARE_GOV_BASE}{endpoint}"

    try:
        response = requests.get(
            url,
            timeout=15,
            headers={
                "Accept": "application/json",
                "User-Agent": "WeThePeople/1.0 (Political accountability platform)",
            },
        )

        if response.status_code == 404:
            logger.info("HealthCare.gov: page not found at %s", endpoint)
            return None

        response.raise_for_status()
        return response.json()

    except requests.RequestException as e:
        logger.error("HealthCare.gov API request failed for %s: %s", endpoint, e)
        return None


# ============================================================================
# CONTENT INDEX — Site-wide content inventory
# ============================================================================

def fetch_content_index() -> List[Dict[str, Any]]:
    """
    Fetch the site-wide content index.

    Returns metadata for every post on HealthCare.gov — glossary terms,
    articles, and other content types.

    Returns:
        List of content metadata dicts with:
        - title, url, bite (brief description)
        - tags, categories, topics
        - audience, segment, insurance-status, state, condition
    """
    data = _hcgov_get("/api/index.json")

    if not data:
        return []

    # Can be a list directly or wrapped in an object
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        # Try common wrapper keys
        items = (
            data.get("index", [])
            or data.get("items", [])
            or data.get("results", [])
            or []
        )
    else:
        items = []

    logger.info("Fetched content index: %d items", len(items))
    return items


# ============================================================================
# GLOSSARY — Healthcare terminology definitions
# ============================================================================

def fetch_glossary() -> List[Dict[str, Any]]:
    """
    Fetch all glossary terms from HealthCare.gov.

    The glossary contains 200+ official definitions of healthcare
    and insurance terms — useful for fact-checking politician claims
    about what specific terms mean.

    Returns:
        List of glossary term dicts with:
        - title: Term name
        - url: Page URL
        - bite: Brief definition
        - es-title: Spanish title
        - es-bite: Spanish definition
        - tags, categories, topics
    """
    data = _hcgov_get("/api/glossary.json")

    if not data:
        return []

    if isinstance(data, list):
        terms = data
    elif isinstance(data, dict):
        terms = data.get("glossary", data.get("items", []))
        if not terms and isinstance(data, dict):
            terms = list(data.values())[0] if data else []
    else:
        terms = []

    logger.info("Fetched glossary: %d terms", len(terms))
    return terms


def search_glossary(query: str) -> List[Dict[str, Any]]:
    """
    Search the glossary for terms matching a query.

    Case-insensitive search across title and bite (description).

    Args:
        query: Search term (e.g., "deductible", "premium", "copay")

    Returns:
        List of matching glossary term dicts
    """
    terms = fetch_glossary()
    if not terms:
        return []

    query_lower = query.lower()
    matches = []

    for term in terms:
        title = term.get("title", "").lower()
        bite = term.get("bite", "").lower()

        if query_lower in title or query_lower in bite:
            matches.append(term)

    logger.info("Glossary search '%s': %d matches", query, len(matches))
    return matches


def get_glossary_term(term_slug: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a specific glossary term by URL slug.

    Args:
        term_slug: URL slug (e.g., "deductible", "premium-tax-credit")

    Returns:
        Term dict with full content, or None
    """
    return _hcgov_get(f"/glossary/{term_slug}.json")


# ============================================================================
# ARTICLES — Healthcare topic articles
# ============================================================================

def fetch_articles() -> List[Dict[str, Any]]:
    """
    Fetch all articles from HealthCare.gov.

    Articles cover major healthcare topics: coverage options, pregnancy,
    retirees, quality ratings, etc.

    Returns:
        List of article dicts with title, url, content (HTML), tags, categories
    """
    data = _hcgov_get("/api/articles.json")

    if not data:
        return []

    if isinstance(data, list):
        articles = data
    elif isinstance(data, dict):
        articles = data.get("articles", data.get("items", []))
        if not articles and isinstance(data, dict):
            articles = list(data.values())[0] if data else []
    else:
        articles = []

    logger.info("Fetched articles: %d items", len(articles))
    return articles


def search_articles(query: str) -> List[Dict[str, Any]]:
    """
    Search articles for a query string.

    Case-insensitive search across title and content.

    Args:
        query: Search term (e.g., "pregnancy", "medicaid", "marketplace")

    Returns:
        List of matching article dicts
    """
    articles = fetch_articles()
    if not articles:
        return []

    query_lower = query.lower()
    matches = []

    for article in articles:
        title = article.get("title", "").lower()
        content = article.get("content", "").lower()

        if query_lower in title or query_lower in content:
            matches.append(article)

    logger.info("Article search '%s': %d matches", query, len(matches))
    return matches


# ============================================================================
# BLOG — Policy updates and announcements
# ============================================================================

def fetch_blog_posts() -> List[Dict[str, Any]]:
    """
    Fetch blog posts from HealthCare.gov.

    Blog posts contain timely policy updates, enrollment deadlines,
    and announcements about ACA changes.

    Returns:
        List of blog post dicts
    """
    data = _hcgov_get("/api/blog.json")

    if not data:
        return []

    if isinstance(data, list):
        posts = data
    elif isinstance(data, dict):
        posts = data.get("blog", data.get("posts", data.get("items", [])))
        if not posts:
            posts = list(data.values())[0] if data else []
    else:
        posts = []

    logger.info("Fetched blog posts: %d items", len(posts))
    return posts


# ============================================================================
# INDIVIDUAL PAGES — Any page as JSON
# ============================================================================

def fetch_page(url_path: str) -> Optional[Dict[str, Any]]:
    """
    Fetch any HealthCare.gov page as JSON.

    Any page URL with a trailing slash can be converted to JSON by
    replacing the trailing slash with .json.

    Args:
        url_path: Page path (e.g., "/coverage/what-marketplace-plans-cover")

    Returns:
        Page content dict, or None if not found
    """
    # Normalize: ensure leading slash, remove trailing slash, add .json
    if not url_path.startswith("/"):
        url_path = f"/{url_path}"
    url_path = url_path.rstrip("/")

    return _hcgov_get(f"{url_path}.json")


# ============================================================================
# TOPICS — Content organized by topic
# ============================================================================

def fetch_topics() -> List[Dict[str, Any]]:
    """
    Fetch the topics/categories index.

    Returns:
        List of topic dicts
    """
    data = _hcgov_get("/api/topics.json")

    if not data:
        return []

    if isinstance(data, list):
        return data
    elif isinstance(data, dict):
        topics = data.get("topics", data.get("items", []))
        return topics if topics else []
    return []


# ============================================================================
# CONTENT HELPERS
# ============================================================================

def strip_html(html_content: str) -> str:
    """
    Strip HTML tags from content, returning plain text.

    Args:
        html_content: HTML string

    Returns:
        Plain text string
    """
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', html_content)
    # Decode common HTML entities
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    text = text.replace("&nbsp;", " ")
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def get_article_text(url_path: str) -> Optional[str]:
    """
    Get plain text content of an article by URL path.

    Args:
        url_path: Article URL path

    Returns:
        Plain text content, or None
    """
    page = fetch_page(url_path)
    if not page:
        return None

    content = page.get("content", "")
    return strip_html(content) if content else None


# ============================================================================
# COVERAGE TOPICS — Quick reference for common claim areas
# ============================================================================

# Common coverage pages that politicians make claims about
COVERAGE_PAGES = {
    "marketplace_plans": "/coverage/what-marketplace-plans-cover",
    "preventive_care": "/coverage/preventive-care-benefits",
    "pre_existing": "/coverage/pre-existing-conditions",
    "young_adults": "/young-adults/children-under-26",
    "medicaid_chip": "/medicaid-chip/getting-medicaid-chip",
    "prescription_drugs": "/coverage/prescription-drugs",
    "mental_health": "/coverage/mental-health-substance-abuse-coverage",
    "pregnancy": "/what-if-im-pregnant-or-plan-to-get-pregnant",
    "dental": "/coverage/dental-coverage",
    "emergency": "/using-marketplace-coverage/getting-emergency-care",
}


def fetch_coverage_topic(topic_key: str) -> Optional[Dict[str, Any]]:
    """
    Fetch content for a common coverage topic.

    Args:
        topic_key: Key from COVERAGE_PAGES (e.g., "pre_existing", "mental_health")

    Returns:
        Page content dict, or None
    """
    path = COVERAGE_PAGES.get(topic_key)
    if not path:
        logger.error("Unknown coverage topic: %s (valid: %s)",
                     topic_key, list(COVERAGE_PAGES.keys()))
        return None

    return fetch_page(path)


def list_coverage_topics() -> Dict[str, str]:
    """Return available coverage topic keys and their page paths."""
    return COVERAGE_PAGES.copy()


# ============================================================================
# FACT CHECK HELPERS — For verifying politician claims
# ============================================================================

def verify_coverage_claim(claim_text: str) -> Dict[str, Any]:
    """
    Search HealthCare.gov content to find relevant information for a claim.

    Searches across glossary, articles, and blog posts for content
    related to the claim text.

    Args:
        claim_text: The politician's claim about healthcare (e.g.,
                    "The ACA covers pre-existing conditions")

    Returns:
        Dict with:
        - glossary_matches: Matching glossary terms
        - article_matches: Matching articles
        - relevant_coverage: Related coverage topic pages
    """
    results: Dict[str, Any] = {
        "glossary_matches": [],
        "article_matches": [],
        "relevant_coverage": [],
    }

    claim_lower = claim_text.lower()

    # Search glossary
    # Extract key terms to search
    key_terms = _extract_healthcare_terms(claim_lower)
    for term in key_terms:
        matches = search_glossary(term)
        for m in matches:
            if m not in results["glossary_matches"]:
                results["glossary_matches"].append(m)
        time.sleep(POLITE_DELAY)

    # Search articles
    article_matches = search_articles(claim_text[:100])
    results["article_matches"] = article_matches

    # Check relevant coverage topics
    for topic_key, path in COVERAGE_PAGES.items():
        topic_words = topic_key.replace("_", " ").split()
        if any(word in claim_lower for word in topic_words):
            results["relevant_coverage"].append({
                "topic": topic_key,
                "path": path,
                "url": f"{HEALTHCARE_GOV_BASE}{path}",
            })

    logger.info(
        "Claim verification: %d glossary, %d articles, %d coverage topics",
        len(results["glossary_matches"]),
        len(results["article_matches"]),
        len(results["relevant_coverage"]),
    )
    return results


def _extract_healthcare_terms(text: str) -> List[str]:
    """
    Extract likely healthcare-related terms from claim text.

    Simple keyword extraction for glossary lookup.
    """
    # Common healthcare terms to look for
    healthcare_keywords = [
        "premium", "deductible", "copay", "copayment", "coinsurance",
        "marketplace", "exchange", "medicaid", "medicare", "chip",
        "subsidy", "tax credit", "premium tax credit", "enrollment",
        "open enrollment", "special enrollment", "pre-existing",
        "essential health benefits", "preventive care", "out-of-pocket",
        "maximum", "network", "formulary", "generic", "brand name",
        "hmo", "ppo", "epo", "pos", "catastrophic",
        "metal level", "bronze", "silver", "gold", "platinum",
        "aca", "affordable care act", "obamacare",
        "mandate", "penalty", "exemption", "hardship",
        "cobra", "hipaa", "erisa",
        "mental health", "substance abuse", "parity",
        "maternity", "pediatric", "dental", "vision",
        "prescription", "drug", "pharmaceutical",
    ]

    found = []
    for keyword in healthcare_keywords:
        if keyword in text:
            found.append(keyword)

    return found[:5]  # Limit to top 5 to avoid too many API calls


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys

    setup_logging("INFO")

    print("HealthCare.gov Content API Connector Test")
    print("=" * 60)

    # Test 1: Fetch content index
    print("\n1. Fetching content index...")
    index = fetch_content_index()
    print(f"   Found {len(index)} content items")
    for item in index[:3]:
        print(f"   - {item.get('title', 'no title')}: {item.get('bite', 'no desc')[:60]}")

    time.sleep(POLITE_DELAY)

    # Test 2: Fetch glossary
    print("\n2. Fetching glossary...")
    glossary = fetch_glossary()
    print(f"   Found {len(glossary)} terms")
    for term in glossary[:3]:
        print(f"   - {term.get('title', 'no title')}: {term.get('bite', 'no desc')[:60]}")

    time.sleep(POLITE_DELAY)

    # Test 3: Search glossary
    print("\n3. Searching glossary for 'deductible'...")
    matches = search_glossary("deductible")
    print(f"   Found {len(matches)} matches")
    for m in matches[:3]:
        print(f"   - {m.get('title', 'no title')}")

    time.sleep(POLITE_DELAY)

    # Test 4: Fetch articles
    print("\n4. Fetching articles...")
    articles = fetch_articles()
    print(f"   Found {len(articles)} articles")
    for a in articles[:3]:
        print(f"   - {a.get('title', 'no title')}")

    time.sleep(POLITE_DELAY)

    # Test 5: Fetch specific coverage page
    print("\n5. Fetching 'pre-existing conditions' coverage page...")
    page = fetch_coverage_topic("pre_existing")
    if page:
        content = page.get("content", "")
        text = strip_html(content)[:200] if content else "no content"
        print(f"   Title: {page.get('title', 'no title')}")
        print(f"   Content: {text}...")
    else:
        print("   Page not found")

    time.sleep(POLITE_DELAY)

    # Test 6: Blog posts
    print("\n6. Fetching blog posts...")
    posts = fetch_blog_posts()
    print(f"   Found {len(posts)} posts")
    for p in posts[:3]:
        print(f"   - {p.get('title', 'no title')}")

    # Test 7: Coverage topics
    print("\n7. Available coverage topics:")
    for key, path in list_coverage_topics().items():
        print(f"   - {key}: {path}")

    print("\n" + "=" * 60)
    print("HealthCare.gov connector test complete.")
