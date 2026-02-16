"""
LLM-Powered Claim Extraction Job

Replaces regex-based claim extraction with Claude API calls.
Reads source documents (press releases, speeches) and uses an LLM
to extract structured, accurate, verifiable political claims.

Usage:
    python jobs/extract_claims_llm.py --person-id elizabeth_warren --since-days 90
    python jobs/extract_claims_llm.py --all --since-days 30 --limit-pages 20
    python jobs/extract_claims_llm.py --person-id alexandria_ocasio_cortez --dry-run
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

import requests
from bs4 import BeautifulSoup
from sqlalchemy.exc import IntegrityError

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env before any other imports that might need it
from dotenv import load_dotenv
load_dotenv(override=True)

from models.database import SessionLocal, TrackedMember, Claim, BronzeDocument
from services.extraction.extract_main_text import extract_main_text
from services.llm.client import extract_claims_from_text
from utils.logging import get_logger

logger = get_logger(__name__)


# ── Reused utilities from ingest_claims.py ──

def retry_with_backoff(func, max_retries=3, initial_delay=1.0, max_delay=20.0):
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            return func()
        except (requests.exceptions.Timeout,
                requests.exceptions.ConnectionError,
                requests.exceptions.RequestException) as e:
            if isinstance(e, requests.exceptions.RequestException):
                if hasattr(e, 'response') and e.response is not None:
                    status = e.response.status_code
                    if status not in [429, 500, 502, 503, 504]:
                        raise
            if attempt == max_retries - 1:
                raise
            logger.warning("Network error, retrying",
                           extra={"attempt": attempt + 1, "delay_sec": delay})
            time.sleep(delay)
            delay = min(delay * 2, max_delay)
    raise Exception("Max retries exceeded")


def fetch_html(url: str, timeout: int = 10) -> str:
    def _fetch():
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        return response.text
    return retry_with_backoff(_fetch)


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def compute_claim_hash(person_id: str, text: str, source_url: str) -> str:
    normalized = normalize_text(text)
    combined = f"{person_id}||{normalized}||{source_url}"
    return hashlib.sha256(combined.encode('utf-8')).hexdigest()


def extract_article_links(html: str, base_url: str) -> List[str]:
    """Extract article links from an index page."""
    from urllib.parse import urljoin
    soup = BeautifulSoup(html, 'html.parser')
    links = set()
    base_url_normalized = base_url.rstrip('/').split('?')[0].split('#')[0]

    for article in soup.find_all('article'):
        for a in article.find_all('a', href=True):
            href = a['href']
            if not href or href.startswith('#'):
                continue
            full_url = urljoin(base_url, href).split('#')[0]
            full_url_normalized = full_url.rstrip('/').split('?')[0]
            if full_url_normalized != base_url_normalized:
                links.add(full_url)

    patterns = ['press', 'news', 'statement', 'remark', 'media']
    for a in soup.find_all('a', href=True):
        href = a['href']
        if not href or href.startswith('#'):
            continue
        href_lower = href.lower()
        if any(pattern in href_lower for pattern in patterns):
            skip_patterns = ['/table/', '/category/', '/tag/', '?page=', '?tag=',
                             '/newsroom$', '#aria-skip', '#skip']
            if any(skip in href_lower for skip in skip_patterns):
                continue
            full_url = urljoin(base_url, href).split('#')[0]
            full_url_normalized = full_url.rstrip('/').split('?')[0]
            if (full_url_normalized != base_url_normalized
                    and len(full_url_normalized) > len(base_url_normalized)):
                links.add(full_url)

    return sorted(links)


def extract_published_date(soup: BeautifulSoup) -> Optional[date]:
    """Try to extract published date from HTML."""
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict) and 'datePublished' in data:
                return datetime.fromisoformat(
                    data['datePublished'].replace('Z', '+00:00')
                ).date()
        except Exception:
            pass

    time_tag = soup.find('time', datetime=True)
    if time_tag:
        try:
            return datetime.fromisoformat(
                time_tag['datetime'].replace('Z', '+00:00')
            ).date()
        except Exception:
            pass

    og_time = soup.find('meta', property='article:published_time')
    if og_time and og_time.get('content'):
        try:
            return datetime.fromisoformat(
                og_time['content'].replace('Z', '+00:00')
            ).date()
        except Exception:
            pass

    return None


def store_bronze_document(person_id, source_url, raw_html, db, content_type='html'):
    content_hash = hashlib.md5(raw_html.encode('utf-8')).hexdigest()
    existing = db.query(BronzeDocument).filter(
        BronzeDocument.fetch_hash == content_hash
    ).first()
    if existing:
        return existing.id

    bronze_doc = BronzeDocument(
        person_id=person_id,
        source_url=source_url,
        fetched_at=datetime.utcnow(),
        content_type=content_type,
        raw_html=raw_html,
        raw_text=None,
        fetch_hash=content_hash,
    )
    try:
        db.add(bronze_doc)
        db.flush()
        return bronze_doc.id
    except IntegrityError:
        db.rollback()
        return None


# ── LLM-Powered Article Processing ──

def process_article_llm(
    url: str,
    person_id: str,
    person_name: str,
    cutoff_date: date,
    db,
) -> Tuple[int, int, int]:
    """
    Process a single article using Claude LLM for claim extraction.

    Returns:
        (extracted_count, inserted_count, duplicates_skipped)
    """
    # Fetch HTML
    try:
        html = fetch_html(url)
    except Exception:
        logger.error("Failed to fetch article",
                     extra={"person_id": person_id, "source_url": url},
                     exc_info=True)
        return 0, 0, 0

    # Bronze layer: store raw HTML
    store_bronze_document(person_id, url, html, db)

    soup = BeautifulSoup(html, 'html.parser')

    # Date filter
    published_date = extract_published_date(soup)
    if published_date and published_date < cutoff_date:
        return 0, 0, 0
    if not published_date:
        published_date = date.today()

    # Extract main text
    text = extract_main_text(soup)
    if not text or len(text) < 100:
        return 0, 0, 0

    # ── THE KEY DIFFERENCE: LLM extraction instead of regex ──
    try:
        llm_claims = extract_claims_from_text(
            text=text,
            person_name=person_name,
            source_url=url,
            source_type="press_release",
        )
    except Exception as e:
        logger.error("LLM extraction failed",
                     extra={"person_id": person_id, "source_url": url, "error": str(e)})
        return 0, 0, 0

    if not llm_claims:
        return 0, 0, 0

    # Insert claims into database
    inserted = 0
    duplicates = 0

    for llm_claim in llm_claims:
        claim_text = llm_claim["claim_text"]

        # Skip low-confidence claims
        if llm_claim.get("confidence", 0) < 0.3:
            continue

        # Build bill_refs_json from LLM-extracted references
        bill_refs = llm_claim.get("bill_references", [])
        bill_refs_json = None
        if bill_refs:
            # Normalize bill references
            display = bill_refs
            normalized = []
            for ref in bill_refs:
                norm = re.sub(r'[.\s]+', '', ref.lower())
                normalized.append(norm)
            bill_refs_json = json.dumps({
                "display": display,
                "normalized": normalized,
            })

        claim_hash = compute_claim_hash(person_id, claim_text, url)

        claim = Claim(
            person_id=person_id,
            text=claim_text,
            claim_date=published_date,
            claim_source_url=url,
            claim_hash=claim_hash,
            category=llm_claim.get("category", "general"),
            intent=llm_claim.get("intent"),
            bill_refs_json=bill_refs_json,
            needs_recompute=1,
        )

        try:
            db.add(claim)
            db.commit()
            inserted += 1
            logger.info("Inserted LLM claim",
                        extra={
                            "person_id": person_id,
                            "claim_text": claim_text[:80],
                            "category": llm_claim.get("category"),
                            "confidence": llm_claim.get("confidence"),
                        })
        except IntegrityError:
            db.rollback()
            duplicates += 1

    return len(llm_claims), inserted, duplicates


# ── Orchestrator ──

def ingest_claims_llm(
    member: TrackedMember,
    since_days: int,
    limit_pages: int,
    rate_limit: float,
    dry_run: bool,
    db,
) -> Dict[str, int]:
    """Ingest claims for a single member using LLM extraction."""
    stats = {
        'sources_processed': 0,
        'pages_fetched': 0,
        'articles_visited': 0,
        'claims_extracted': 0,
        'claims_inserted': 0,
        'duplicates_skipped': 0,
    }

    if not member.claim_sources_json:
        print(f"  [SKIP] {member.display_name}: no claim sources configured")
        return stats

    try:
        sources = json.loads(member.claim_sources_json)
    except json.JSONDecodeError:
        print(f"  [ERR] {member.display_name}: invalid claim_sources_json")
        return stats

    if not sources:
        return stats

    cutoff_date = date.today() - timedelta(days=since_days)

    print(f"\n{'='*60}")
    print(f"  {member.display_name} ({member.person_id})")
    print(f"  Sources: {len(sources)} | Cutoff: {cutoff_date}")
    print(f"{'='*60}")

    for source in sources:
        source_url = source.get('url')
        if not source_url:
            continue

        stats['sources_processed'] += 1

        # Fetch index page
        try:
            html = fetch_html(source_url)
            stats['pages_fetched'] += 1
        except Exception:
            print(f"  [ERR] Could not fetch index: {source_url}")
            continue

        # Get article links
        article_links = extract_article_links(html, source_url)
        article_links = article_links[:limit_pages]
        print(f"  Found {len(article_links)} articles from {source_url}")

        for i, article_url in enumerate(article_links, 1):
            if dry_run:
                print(f"    [{i}/{len(article_links)}] DRY RUN: {article_url}")
                continue

            print(f"    [{i}/{len(article_links)}] {article_url[:70]}...")

            extracted, inserted, dupes = process_article_llm(
                url=article_url,
                person_id=member.person_id,
                person_name=member.display_name,
                cutoff_date=cutoff_date,
                db=db,
            )

            stats['articles_visited'] += 1
            stats['claims_extracted'] += extracted
            stats['claims_inserted'] += inserted
            stats['duplicates_skipped'] += dupes

            if extracted > 0:
                print(f"      -> {extracted} claims extracted, {inserted} new, {dupes} dupes")

            # Rate limit (both for web servers and Claude API)
            time.sleep(rate_limit)

    return stats


def run(
    person_id: Optional[str],
    all_members: bool,
    since_days: int,
    limit_pages: int,
    rate_limit: float,
    max_seconds: Optional[int],
    dry_run: bool,
):
    """Main entry point."""
    if not person_id and not all_members:
        print("[ERR] Must specify --person-id or --all")
        return

    # Verify API key is set
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("[ERR] ANTHROPIC_API_KEY not set in .env")
        return

    print("=" * 60)
    print("  LLM-POWERED CLAIM EXTRACTION")
    print("=" * 60)
    print(f"  Model: Claude Sonnet 4")
    print(f"  Since: {since_days} days")
    print(f"  Limit: {limit_pages} articles/source")
    print(f"  Rate limit: {rate_limit}s between requests")
    print(f"  Dry run: {dry_run}")
    if max_seconds:
        print(f"  Max seconds: {max_seconds}")

    db = SessionLocal()
    try:
        query = db.query(TrackedMember).filter(TrackedMember.is_active == 1)
        if person_id:
            query = query.filter(TrackedMember.person_id == person_id)

        members = query.all()
        if not members:
            print(f"\n[!] No tracked members found")
            return

        print(f"\n  Processing {len(members)} member(s)")

        start_time = time.time()
        total = {
            'sources_processed': 0,
            'pages_fetched': 0,
            'articles_visited': 0,
            'claims_extracted': 0,
            'claims_inserted': 0,
            'duplicates_skipped': 0,
        }

        for member in members:
            if max_seconds:
                elapsed = time.time() - start_time
                if elapsed >= max_seconds:
                    print(f"\n[!] Time limit reached ({max_seconds}s)")
                    break

            stats = ingest_claims_llm(
                member, since_days, limit_pages, rate_limit, dry_run, db
            )
            for key in total:
                total[key] += stats[key]

        elapsed = time.time() - start_time

        # Summary
        print(f"\n{'='*60}")
        print("  SUMMARY")
        print(f"{'='*60}")
        print(f"  Time elapsed:       {elapsed:.1f}s")
        print(f"  Sources processed:  {total['sources_processed']}")
        print(f"  Pages fetched:      {total['pages_fetched']}")
        print(f"  Articles visited:   {total['articles_visited']}")
        print(f"  Claims extracted:   {total['claims_extracted']}")
        print(f"  Claims inserted:    {total['claims_inserted']}")
        print(f"  Duplicates skipped: {total['duplicates_skipped']}")

    finally:
        db.close()


# ── CLI ──

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="LLM-powered claim extraction from official sources"
    )
    parser.add_argument('--person-id', type=str, help='Specific person ID')
    parser.add_argument('--all', action='store_true', help='All active members')
    parser.add_argument('--since-days', type=int, default=90,
                        help='Look back N days (default: 90)')
    parser.add_argument('--limit-pages', type=int, default=20,
                        help='Max articles per source (default: 20)')
    parser.add_argument('--rate-limit', type=float, default=1.5,
                        help='Seconds between requests (default: 1.5)')
    parser.add_argument('--max-seconds', type=int,
                        help='Gracefully stop after N seconds')
    parser.add_argument('--dry-run', action='store_true',
                        help='List articles without processing')

    args = parser.parse_args()

    run(
        person_id=args.person_id,
        all_members=args.all,
        since_days=args.since_days,
        limit_pages=args.limit_pages,
        rate_limit=args.rate_limit,
        max_seconds=args.max_seconds,
        dry_run=args.dry_run,
    )
