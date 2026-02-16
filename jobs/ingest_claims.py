"""
Claim Ingestion Job (MVP v1)
Fetches recent statements from official sources and extracts claim sentences.

Usage:
    python jobs/ingest_claims.py --all --since-days 30 --limit-pages 50
    python jobs/ingest_claims.py --person-id aoc --since-days 7
    python jobs/ingest_claims.py --person-id sanders --dry-run
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, date
from typing import List, Dict, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from sqlalchemy.exc import IntegrityError

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, TrackedMember, Claim, BronzeDocument
from services.extraction.extract_main_text import extract_main_text
from utils.logging import get_logger

logger = get_logger(__name__)


# === RETRY LOGIC (copied from enrich_bills.py pattern) ===

def retry_with_backoff(func, max_retries=3, initial_delay=1.0, max_delay=20.0):
    """
    Retry a function with exponential backoff.
    Handles transient network errors gracefully.
    """
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            return func()
        except (requests.exceptions.Timeout, 
                requests.exceptions.ConnectionError,
                requests.exceptions.RequestException) as e:
            # Check if it's a retryable error
            if isinstance(e, requests.exceptions.RequestException):
                if hasattr(e, 'response') and e.response is not None:
                    status = e.response.status_code
                    # Retry on rate limits and server errors
                    if status not in [429, 500, 502, 503, 504]:
                        raise  # Non-retryable HTTP error
            
            if attempt == max_retries - 1:
                raise  # Last attempt failed
            
            logger.warning(
                "Network error, retrying",
                extra={"attempt": attempt + 1, "max_retries": max_retries, "delay_sec": delay, "error": str(e)}
            )
            time.sleep(delay)
            delay = min(delay * 2, max_delay)
    
    raise Exception("Max retries exceeded")


# === TEXT NORMALIZATION ===

def normalize_text(text: str) -> str:
    """
    Normalize text for deduplication:
    - Lowercase
    - Collapse whitespace
    - Strip punctuation
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)  # Remove punctuation
    text = re.sub(r'\s+', ' ', text)      # Collapse whitespace
    return text.strip()


def compute_claim_hash(person_id: str, text: str, source_url: str) -> str:
    """
    Compute stable SHA256 hash for deduplication.
    Format: sha256(person_id + normalized_text + source_url)
    """
    normalized = normalize_text(text)
    combined = f"{person_id}||{normalized}||{source_url}"
    return hashlib.sha256(combined.encode('utf-8')).hexdigest()


def extract_bill_references(text: str) -> dict:
    """
    Extract bill references from text.
    
    Detects patterns like:
    - H.R. 1234, HR 1234, H R 1234, H.R.1234
    - S. 5678, S 5678, S.5678
    
    Returns dict with:
    - display: ["H.R. 1234", "S. 5678"] (for UI)
    - normalized: ["hr1234", "s5678"] (for matching/joins)
    """
    bill_refs_display = set()
    bill_refs_normalized = set()
    
    # Pattern for House bills: H.R. / HR / H R followed by digits
    hr_patterns = [
        r'\bH\.R\.\s*(\d+)',    # H.R. 1234
        r'\bHR\.?\s*(\d+)',     # HR 1234, HR.1234
        r'\bH\s+R\.?\s*(\d+)',  # H R 1234, H R.1234
    ]
    
    for pattern in hr_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            bill_num = match.group(1)
            bill_refs_display.add(f"H.R. {bill_num}")
            bill_refs_normalized.add(f"hr{bill_num}")
    
    # Pattern for Senate bills: S. / S followed by digits
    s_patterns = [
        r'\bS\.\s*(\d+)',       # S. 1234
        r'\bS\s+(\d+)',         # S 1234
    ]
    
    for pattern in s_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            bill_num = match.group(1)
            bill_refs_display.add(f"S. {bill_num}")
            bill_refs_normalized.add(f"s{bill_num}")
    
    return {
        'display': sorted(bill_refs_display),
        'normalized': sorted(bill_refs_normalized)
    }


# === HTML PARSING ===

def extract_article_links(html: str, base_url: str) -> List[str]:
    """
    Extract article links from an index page.
    Looks for:
    - Links in <article> tags
    - Links containing /press/, /news/, /statements/, /remarks/
    Filters out the base URL itself to avoid re-processing index pages.
    Strips URL fragments (#anchor) to avoid navigation/skip links.
    """
    soup = BeautifulSoup(html, 'html.parser')
    links = set()
    
    # Normalize base URL for comparison (remove trailing slash, query params, fragments)
    base_url_normalized = base_url.rstrip('/').split('?')[0].split('#')[0]
    
    # Strategy 1: Links inside <article> tags
    for article in soup.find_all('article'):
        for a in article.find_all('a', href=True):
            href = a['href']
            # Skip anchor-only links (e.g., #aria-skip-press, #content)
            if not href or href.startswith('#'):
                continue
            
            full_url = urljoin(base_url, href)
            # Strip fragment from full URL (remove #anchor)
            full_url_clean = full_url.split('#')[0]
            
            # Filter out base URL and pagination links
            full_url_normalized = full_url_clean.rstrip('/').split('?')[0]
            if full_url_normalized != base_url_normalized:
                links.add(full_url_clean)
    
    # Strategy 2: Links containing common patterns
    patterns = ['press', 'news', 'statement', 'remark', 'media']
    for a in soup.find_all('a', href=True):
        href = a['href']
        # Skip anchor-only links
        if not href or href.startswith('#'):
            continue
            
        href_lower = href.lower()
        # Match pattern anywhere in URL, but exclude navigation/category pages
        if any(pattern in href_lower for pattern in patterns):
            # Skip navigation, category, and table pages
            skip_patterns = [
                '/table/', '/category/', '/tag/', '?page=', '?tag=',
                '/newsroom/news-coverage', '/newsroom/op-eds', '/newsroom/press-releases$',
                '/newsroom$', '#aria-skip', '#skip'
            ]
            if any(skip in href_lower for skip in skip_patterns):
                continue
            
            full_url = urljoin(base_url, href)
            # Strip fragment from full URL
            full_url_clean = full_url.split('#')[0]
            
            # Filter out base URL
            full_url_normalized = full_url_clean.rstrip('/').split('?')[0]
            base_url_normalized_clean = base_url_normalized.rstrip('/').split('?')[0]
            # Only include if it's a deeper path than the base (actual article)
            if full_url_normalized != base_url_normalized_clean and len(full_url_normalized) > len(base_url_normalized_clean):
                links.add(full_url_clean)
    
    return sorted(links)


def extract_published_date(soup: BeautifulSoup) -> Optional[date]:
    """
    Try to extract published date from HTML.
    Strategies:
    1. JSON-LD datePublished
    2. <time datetime="...">
    3. OpenGraph article:published_time
    """
    # Strategy 1: JSON-LD
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict) and 'datePublished' in data:
                date_str = data['datePublished']
                return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
        except:
            pass
    
    # Strategy 2: <time datetime>
    time_tag = soup.find('time', datetime=True)
    if time_tag:
        try:
            date_str = time_tag['datetime']
            return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
        except:
            pass
    
    # Strategy 3: OpenGraph
    og_time = soup.find('meta', property='article:published_time')
    if og_time and og_time.get('content'):
        try:
            date_str = og_time['content']
            return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
        except:
            pass
    
    return None


# Note: extract_main_text moved to services/extraction/extract_main_text.py
# Now imported at top of file


# === CLAIM EXTRACTION ===

CLAIM_TRIGGERS = [
    # First-person direct statements
    r'\bI introduced\b',
    r'\bI sponsor\b',
    r'\bI sponsored\b',
    r'\bI cosponsor\b',
    r'\bI cosponsored\b',
    r'\bI voted\b',
    r'\bI opposed\b',
    r'\bI support\b',
    r'\bI am introducing\b',
    r'\bmy bill\b',
    r'\bthis legislation\b',
    r'\bwe passed\b',
    r'\bwe secured\b',
    r'\bI fought\b',
    r'\bI am fighting\b',
    r'\bI called on\b',
    r'\bI demand\b',
    r'\bI urge\b',
    r'\bI led\b',
    r'\bI authored\b',
    # Third-person attributed statements (for press releases)
    r'\bWarren said\b',
    r'\bWarren called\b',
    r'\bWarren introduced\b',
    r'\bWarren sponsored\b',
    r'\bWarren cosponsored\b',
    r'\bWarren voted\b',
    r'\bWarren opposed\b',
    r'\bWarren urged\b',
    r'\bWarren led\b',
    r'\bWarren authored\b',
    r'\bWarren demanded\b',
    r'\bWarren wrote\b',
    r'\bWarren sent\b',
    r'\bWarren announced\b',
    r'\bWarren pressed\b',
    r'\bWarren slammed\b',
    r'\bWarren blasted\b',
    r'\bSenator.*introduced\b',
    r'\bSenator.*sponsored\b',
    r'\bSenator.*called\b',
    r'\bSenator.*urged\b',
    r'\bSenator.*led\b',
    r'\bSenator.*wrote\b',
    r'\bSenator.*sent\b',
    r'\bSenator.*announced\b',
]

FUNDRAISING_TERMS = [
    'donate', 'chip in', 'contribute', 'fundraiser', 'actblue',
    'donation', 'pledge', 'contribute today'
]

BOILERPLATE_PATTERNS = [
    r'^read more',
    r'^click here',
    r'^share this',
    r'^follow us',
    r'^subscribe',
]


def score_claim_sentence(sentence: str) -> int:
    """
    Score a sentence based on trigger pattern matches.
    Higher score = more claim-like.
    """
    score = 0
    
    for trigger in CLAIM_TRIGGERS:
        if re.search(trigger, sentence, re.IGNORECASE):
            score += 1
    
    return score


def is_boilerplate(sentence: str) -> bool:
    """Check if sentence is likely boilerplate/navigation junk."""
    sentence_lower = sentence.lower()
    
    # Check boilerplate patterns
    for pattern in BOILERPLATE_PATTERNS:
        if re.search(pattern, sentence_lower):
            return True
    
    return False


def contains_fundraising(sentence: str) -> bool:
    """Check if sentence contains fundraising language."""
    sentence_lower = sentence.lower()
    return any(term in sentence_lower for term in FUNDRAISING_TERMS)


# Legislative verb patterns for relevance filtering
LEGISLATIVE_VERBS_PATTERN = re.compile(
    r'\b(introduced|reintroduced|cosponsored|co-sponsored|sponsored|'
    r'passed|voted|blocked|signed|enacted|proposed|'
    r'amendment|legislation)\b',
    re.IGNORECASE
)


def sentence_relevant_to_bills(sentence: str, article_bill_refs: dict, full_text: str) -> bool:
    """
    Check if a sentence is relevant to bill references in the article.
    
    A sentence is relevant if:
    1. The sentence contains the bill reference string itself, OR
    2. The sentence contains legislative verbs AND article has ≤3 bill mentions
       (conservative: only attach bills if article is focused)
    
    Returns True if sentence should get bill_refs_json attached.
    """
    if not article_bill_refs or not article_bill_refs.get('display'):
        return False
    
    # Check if sentence contains any bill reference
    for bill_ref in article_bill_refs['display']:
        if bill_ref in sentence:
            return True
    
    # Check if sentence has legislative verbs AND article is focused (≤3 bills)
    if len(article_bill_refs['display']) <= 3:
        if LEGISLATIVE_VERBS_PATTERN.search(sentence):
            return True
    
    return False


def extract_claim_sentences(text: str, max_claims: int = 10) -> List[str]:
    """
    Extract claim candidate sentences from text.
    
    Process:
    1. Split into sentences
    2. Score each by trigger patterns
    3. Filter boilerplate and fundraising
    4. Return top N by score
    """
    # Split into sentences (improved: handle more cases)
    # First normalize newlines and multiple spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Split on sentence boundaries (handle end of string)
    sentences = re.split(r'[.!?]+(?:\s+|$)', text)
    
    candidates = []
    for sentence in sentences:
        sentence = sentence.strip()
        
        # Skip empty
        if not sentence:
            continue
        
        # Word count
        word_count = len(sentence.split())
        
        # Skip if too short or too long (increased max for formal press releases)
        if word_count < 10 or word_count > 100:
            continue
        
        # Skip boilerplate (check pattern first, before length filter)
        sentence_lower = sentence.lower()
        is_boiler = False
        for pattern in BOILERPLATE_PATTERNS:
            if re.search(pattern, sentence_lower):
                is_boiler = True
                break
        
        if is_boiler:
            continue
        
        # Skip fundraising
        if contains_fundraising(sentence):
            continue
        
        # Score sentence
        score = score_claim_sentence(sentence)
        if score > 0:
            candidates.append((score, sentence))
    
    # Sort by score descending, then by length descending
    candidates.sort(key=lambda x: (x[0], len(x[1])), reverse=True)
    
    # Return top N
    return [sent for score, sent in candidates[:max_claims]]


# === MAIN INGESTION LOGIC ===

def fetch_html(url: str, timeout: int = 10) -> str:
    """Fetch HTML with retry logic."""
    def _fetch():
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        return response.text
    
    return retry_with_backoff(_fetch)


def store_bronze_document(
    person_id: str,
    source_url: str,
    raw_html: str,
    db,
    content_type: str = 'html'
) -> Optional[int]:
    """
    Store raw fetched HTML in Bronze layer.
    
    Returns:
        Bronze document ID if successful, None otherwise
    """
    # Compute content hash for deduplication
    content_hash = hashlib.md5(raw_html.encode('utf-8')).hexdigest()
    
    # Check if already exists
    existing = db.query(BronzeDocument).filter(
        BronzeDocument.fetch_hash == content_hash
    ).first()
    
    if existing:
        logger.info(
            "Bronze document already exists",
            extra={"person_id": person_id, "source_url": source_url, "bronze_id": existing.id}
        )
        return existing.id
    
    # Create new Bronze document
    bronze_doc = BronzeDocument(
        person_id=person_id,
        source_url=source_url,
        fetched_at=datetime.utcnow(),
        content_type=content_type,
        raw_html=raw_html,
        raw_text=None,  # Could extract later
        fetch_hash=content_hash
    )
    
    try:
        db.add(bronze_doc)
        db.flush()  # Get ID without committing yet
        logger.info(
            "Stored Bronze document",
            extra={"person_id": person_id, "source_url": source_url, "bronze_id": bronze_doc.id}
        )
        return bronze_doc.id
    except IntegrityError:
        db.rollback()
        logger.warning(
            "Bronze document hash collision",
            extra={"person_id": person_id, "source_url": source_url}
        )
        return None


def process_article(
    url: str,
    person_id: str,
    since_days: int,
    cutoff_date: date,
    db
) -> Tuple[int, int, int]:
    """
    Process a single article page.
    
    Returns:
        (extracted_count, inserted_count, duplicates_skipped)
    """
    try:
        html = fetch_html(url)
    except Exception as e:
        logger.error(
            "Failed to fetch article",
            extra={"person_id": person_id, "source_url": url, "step": "fetch"},
            exc_info=True
        )
    
    # BRONZE LAYER: Store raw HTML first
    bronze_id = store_bronze_document(person_id, url, html, db)
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Extract published date
    published_date = extract_published_date(soup)
    
    # Freshness filter
    if published_date:
        if published_date < cutoff_date:
            logger.info(
                "Skipping old article",
                extra={
                    "person_id": person_id,
                    "source_url": url,
                    "step": "filter",
                    "published_date": str(published_date),
                    "cutoff_date": str(cutoff_date)
                }
            )
            return 0, 0, 0
    else:
        # No date found - use today as fallback
        published_date = date.today()
    
    # Extract main text
    text = extract_main_text(soup)
    if not text or len(text) < 100:
        logger.info(
            "Skipping article with insufficient content",
            extra={"person_id": person_id, "source_url": url, "text_length": len(text) if text else 0}
        )
        return 0, 0, 0
    
    # Extract bill references from full article text
    article_bill_refs = extract_bill_references(text)
    
    # Extract claim sentences
    claim_sentences = extract_claim_sentences(text)
    if not claim_sentences:
        logger.info(
            "No claim sentences found in article",
            extra={"person_id": person_id, "source_url": url}
        )
        return 0, 0, 0
    
    # Insert claims
    inserted = 0
    duplicates = 0
    
    for sentence in claim_sentences:
        # Check if this sentence is relevant to article's bill references
        # Only attach bill_refs_json if sentence mentions the bill or has legislative context
        sentence_bill_refs_json = None
        if sentence_relevant_to_bills(sentence, article_bill_refs, text):
            sentence_bill_refs_json = json.dumps(article_bill_refs)
        
        claim_hash = compute_claim_hash(person_id, sentence, url)
        
        claim = Claim(
            person_id=person_id,
            text=sentence,
            claim_date=published_date,
            claim_source_url=url,
            claim_hash=claim_hash,
            category='general',  # Default for MVP
            intent=None,         # Can be inferred later
            bill_refs_json=sentence_bill_refs_json,
        )
        
        try:
            db.add(claim)
            db.commit()
            inserted += 1
        except IntegrityError:
            db.rollback()
            duplicates += 1
    
    return len(claim_sentences), inserted, duplicates


def ingest_claims_for_member(
    member: TrackedMember,
    since_days: int,
    limit_pages: int,
    rate_limit: float,
    dry_run: bool,
    db
) -> Dict[str, int]:
    """
    Ingest claims for a single member.
    
    Returns:
        Stats dictionary
    """
    stats = {
        'sources_processed': 0,
        'pages_fetched': 0,
        'articles_visited': 0,
        'claims_extracted': 0,
        'claims_inserted': 0,
        'duplicates_skipped': 0,
        'stale_skipped': 0,
    }
    
    # Load claim sources
    if not member.claim_sources_json:
        logger.info(
            "No claim sources configured",
            extra={"person_id": member.person_id}
        )
        return stats
    
    try:
        sources = json.loads(member.claim_sources_json)
    except json.JSONDecodeError:
        logger.error(
            "Invalid JSON in claim_sources_json",
            extra={"person_id": member.person_id},
            exc_info=True
        )
        return stats
    
    if not sources:
        logger.info(
            "Empty claim sources list",
            extra={"person_id": member.person_id}
        )
        return stats
    
    # Compute cutoff date
    cutoff_date = date.today() - timedelta(days=since_days)
    
    logger.info(
        "Processing member",
        extra={
            "person_id": member.person_id,
            "display_name": member.display_name,
            "source_count": len(sources),
            "cutoff_date": str(cutoff_date)
        }
    )
    
    # Process each source
    for source in sources:
        source_url = source.get('url')
        source_type = source.get('type', 'unknown')
        
        if not source_url:
            continue
        
        stats['sources_processed'] += 1
        
        logger.info(
            "Processing source",
            extra={"person_id": member.person_id, "source_type": source_type, "source_url": source_url}
        )
        
        # Fetch index page
        try:
            html = fetch_html(source_url)
            stats['pages_fetched'] += 1
        except Exception as e:
            logger.error(
                "Failed to fetch index",
                extra={"person_id": member.person_id, "source_url": source_url},
                exc_info=True
            )
            continue
        
        # Extract article links
        article_links = extract_article_links(html, source_url)
        logger.info(
            "Found article links",
            extra={"person_id": member.person_id, "source_url": source_url, "count": len(article_links)}
        )
        
        # Limit articles per source
        article_links = article_links[:limit_pages]
        
        # Process each article
        for i, article_url in enumerate(article_links, 1):
            logger.info(
                "Processing article",
                extra={
                    "person_id": member.person_id,
                    "article_index": i,
                    "total_articles": len(article_links),
                    "article_url": article_url
                }
            )
            
            if dry_run:
                logger.info(
                    "DRY RUN: Would process article",
                    extra={"person_id": member.person_id, "article_url": article_url}
                )
                continue
            
            extracted, inserted, duplicates = process_article(
                article_url,
                member.person_id,
                since_days,
                cutoff_date,
                db
            )
            
            stats['articles_visited'] += 1
            stats['claims_extracted'] += extracted
            stats['claims_inserted'] += inserted
            stats['duplicates_skipped'] += duplicates
            
            if extracted > 0:
                logger.info(
                    "Article processing results",
                    extra={
                        "person_id": member.person_id,
                        "article_url": article_url,
                        "extracted": extracted,
                        "inserted": inserted,
                        "duplicates": duplicates
                    }
                )
            
            # Rate limit
            time.sleep(rate_limit)
    
    return stats


def run_ingestion(
    person_id: Optional[str],
    all_members: bool,
    since_days: int,
    force_old: bool,
    limit_pages: int,
    rate_limit: float,
    max_seconds: Optional[int],
    dry_run: bool
):
    """Main ingestion orchestrator."""
    
    # Validation
    if since_days > 180 and not force_old:
        logger.error("Validation failed: since_days > 180 requires --force-old flag to prevent accidental processing of stale content")
        return
    
    if not person_id and not all_members:
        logger.error("Validation failed: Must specify --person-id or --all")
        return
    
    # Header
    logger.info(
        "Starting claim ingestion job",
        extra={
            "person_id": person_id or "ALL",
            "since_days": since_days,
            "limit_pages": limit_pages,
            "dry_run": dry_run
        }
    )
    print("=" * 70)
    print(f"Since days: {since_days}")
    print(f"Limit pages per source: {limit_pages}")
    print(f"Rate limit: {rate_limit}s")
    print(f"Dry run: {dry_run}")
    if max_seconds:
        print(f"Max seconds: {max_seconds}")
    print()
    
    # Connect to database
    db = SessionLocal()
    
    # Load members
    query = db.query(TrackedMember).filter(TrackedMember.is_active == 1)
    if person_id:
        query = query.filter(TrackedMember.person_id == person_id)
    
    members = query.all()
    
    if not members:
        print(f"[!] No tracked members found")
        db.close()
        return
    
    print(f"Processing {len(members)} member(s)\n")
    
    # Process each member
    start_time = time.time()
    total_stats = {
        'sources_processed': 0,
        'pages_fetched': 0,
        'articles_visited': 0,
        'claims_extracted': 0,
        'claims_inserted': 0,
        'duplicates_skipped': 0,
        'stale_skipped': 0,
    }
    
    for member in members:
        # Check time limit
        if max_seconds:
            elapsed = time.time() - start_time
            if elapsed >= max_seconds:
                print(f"\n[!] Time limit reached ({max_seconds}s), stopping gracefully")
                break
        
        stats = ingest_claims_for_member(
            member,
            since_days,
            limit_pages,
            rate_limit,
            dry_run,
            db
        )
        
        # Accumulate stats
        for key in total_stats:
            total_stats[key] += stats[key]
    
    db.close()
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Sources processed:    {total_stats['sources_processed']}")
    print(f"Pages fetched:        {total_stats['pages_fetched']}")
    print(f"Articles visited:     {total_stats['articles_visited']}")
    print(f"Claims extracted:     {total_stats['claims_extracted']}")
    print(f"Claims inserted:      {total_stats['claims_inserted']}")
    print(f"Duplicates skipped:   {total_stats['duplicates_skipped']}")
    print(f"Stale skipped:        {total_stats['stale_skipped']}")


# === CLI ===

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest claims from official sources")
    
    parser.add_argument('--person-id', type=str, help='Specific person ID to ingest')
    parser.add_argument('--all', action='store_true', help='Ingest for all active members')
    parser.add_argument('--since-days', type=int, default=30, help='Look back N days (default: 30)')
    parser.add_argument('--force-old', action='store_true', help='Required if since-days > 180')
    parser.add_argument('--limit-pages', type=int, default=50, help='Max articles per source (default: 50)')
    parser.add_argument('--rate-limit', type=float, default=0.4, help='Delay between requests in seconds (default: 0.4)')
    parser.add_argument('--max-seconds', type=int, help='Gracefully stop after N seconds')
    parser.add_argument('--dry-run', action='store_true', help='Print what would be done, insert nothing')
    
    args = parser.parse_args()
    
    run_ingestion(
        person_id=args.person_id,
        all_members=args.all,
        since_days=args.since_days,
        force_old=args.force_old,
        limit_pages=args.limit_pages,
        rate_limit=args.rate_limit,
        max_seconds=args.max_seconds,
        dry_run=args.dry_run
    )
