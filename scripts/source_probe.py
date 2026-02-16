"""
Source Quality Probe

Quickly evaluate candidate sources for legislative claim extraction.
Tests how many articles contain bill references and legislative language.

Usage:
    python scripts/source_probe.py --url "https://schumer.senate.gov/newsroom/press-releases" --max-articles 10
    python scripts/source_probe.py --url "https://wyden.senate.gov/news/press-releases" --max-articles 10
"""

import argparse
import sys
import os
import re
from pathlib import Path
from collections import Counter
import requests
from bs4 import BeautifulSoup
import time

sys.path.insert(0, str(Path(__file__).parent.parent))

# Import existing extraction logic
from jobs.ingest_claims import extract_article_links, extract_bill_references
from services.extraction.extract_main_text import extract_main_text


# Legislative verb patterns
LEGISLATIVE_VERBS = [
    'introduced', 'reintroduced', 'cosponsored', 'co-sponsored', 'sponsored',
    'passed', 'voted', 'blocked', 'signed', 'enacted', 'proposed',
    'amendment', 'bill', 'legislation', 'law', 'resolution'
]

LEGISLATIVE_VERB_PATTERN = re.compile(
    r'\b(' + '|'.join(LEGISLATIVE_VERBS) + r')\b',
    re.IGNORECASE
)


def has_legislative_verbs(text: str) -> bool:
    """Check if text contains legislative verbs"""
    return bool(LEGISLATIVE_VERB_PATTERN.search(text))


def extract_url_tokens(url: str) -> list:
    """Extract distinctive tokens from URL path (for pattern analysis)"""
    path = url.split('?')[0].split('#')[0]
    segments = path.split('/')
    
    # Extract meaningful tokens (skip domain, year patterns, etc.)
    tokens = []
    for segment in segments:
        # Skip common patterns
        if not segment or segment.isdigit() or len(segment) < 3:
            continue
        if segment in ['news', 'press', 'releases', 'www', 'http', 'https']:
            continue
        
        # Extract hyphen-separated words
        words = re.split(r'[-_]', segment)
        tokens.extend([w for w in words if len(w) > 3])
    
    return tokens


def probe_article(url: str, timeout: int = 10) -> dict:
    """Fetch and analyze a single article"""
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        text = extract_main_text(soup)
        
        bill_refs = extract_bill_references(text)
        has_bills = bool(bill_refs.get('display'))
        has_verbs = has_legislative_verbs(text)
        url_tokens = extract_url_tokens(url)
        
        return {
            'url': url,
            'text_length': len(text),
            'has_bills': has_bills,
            'bill_refs': bill_refs.get('display', []),
            'has_legislative_verbs': has_verbs,
            'has_both': has_bills and has_verbs,
            'url_tokens': url_tokens,
            'error': None
        }
    except Exception as e:
        return {
            'url': url,
            'error': str(e),
            'has_bills': False,
            'has_legislative_verbs': False,
            'has_both': False
        }


def probe_source(index_url: str, max_articles: int = 10, rate_limit: float = 0.5):
    """Probe a source index page and sample articles"""
    
    print("=" * 80)
    print("SOURCE QUALITY PROBE")
    print("=" * 80)
    print()
    print(f"Index URL: {index_url}")
    print(f"Max articles to sample: {max_articles}")
    print()
    
    # Fetch index page and extract article links
    print("Fetching index page...")
    try:
        response = requests.get(index_url, timeout=10)
        response.raise_for_status()
        
        # Extract article URLs using existing logic
        article_urls = extract_article_links(response.text, index_url)
        
        # Limit to max_articles
        if len(article_urls) > max_articles:
            article_urls = article_urls[:max_articles]
        
        if not article_urls:
            print("❌ No article URLs found on index page")
            return
        
        print(f"✓ Found {len(article_urls)} article URLs")
        print()
        
    except Exception as e:
        print(f"❌ Failed to fetch index page: {e}")
        return
    
    # Probe each article
    print("Probing articles...")
    print("-" * 80)
    
    results = []
    all_url_tokens = []
    
    for i, url in enumerate(article_urls, 1):
        print(f"[{i}/{len(article_urls)}] {url.split('/')[-1][:60]}...")
        
        result = probe_article(url)
        results.append(result)
        
        if result.get('error'):
            print(f"  ❌ Error: {result['error']}")
        else:
            status_parts = []
            if result['has_bills']:
                status_parts.append(f"Bills: {', '.join(result['bill_refs'][:3])}")
            if result['has_legislative_verbs']:
                status_parts.append("Legislative verbs: ✓")
            if result['has_both']:
                status_parts.append("BOTH: ✓")
            
            status = " | ".join(status_parts) if status_parts else "No signals"
            print(f"  {status}")
            
            if result.get('url_tokens'):
                all_url_tokens.extend(result['url_tokens'])
        
        print()
        time.sleep(rate_limit)
    
    # Calculate statistics
    print()
    print("=" * 80)
    print("PROBE RESULTS")
    print("=" * 80)
    print()
    
    total = len([r for r in results if not r.get('error')])
    if total == 0:
        print("❌ No articles successfully probed")
        return
    
    bills_count = sum(1 for r in results if r.get('has_bills'))
    verbs_count = sum(1 for r in results if r.get('has_legislative_verbs'))
    both_count = sum(1 for r in results if r.get('has_both'))
    error_count = sum(1 for r in results if r.get('error'))
    
    print(f"Total articles probed: {total}")
    print(f"Errors: {error_count}")
    print()
    
    print(f"Articles with bill references: {bills_count}/{total} ({bills_count/total*100:.1f}%)")
    print(f"Articles with legislative verbs: {verbs_count}/{total} ({verbs_count/total*100:.1f}%)")
    print(f"Articles with BOTH: {both_count}/{total} ({both_count/total*100:.1f}%)")
    print()
    
    # Matchability assessment
    both_pct = both_count / total * 100 if total > 0 else 0
    
    if both_pct >= 50:
        assessment = "✅ EXCELLENT - High-quality legislative source"
    elif both_pct >= 20:
        assessment = "✓ GOOD - Acceptable for legislative claims"
    elif both_pct >= 10:
        assessment = "⚠️  MARGINAL - Consider finding better source"
    else:
        assessment = "❌ POOR - Likely not suitable for legislative claims"
    
    print(f"Source Quality: {assessment}")
    print()
    
    # URL token analysis (spot patterns)
    if all_url_tokens:
        print("Top URL tokens (article path patterns):")
        token_counts = Counter(all_url_tokens)
        for token, count in token_counts.most_common(15):
            print(f"  {token}: {count}")
        print()
        
        # Check for red flags
        red_flags = ['funding', 'announces', 'delivers', 'secures', 'town', 'hall', 'event']
        found_flags = [token for token in red_flags if token in token_counts]
        if found_flags:
            print("⚠️  Red flags detected (funding/event focus):")
            for flag in found_flags:
                print(f"  - '{flag}' appears {token_counts[flag]} times")
            print()
    
    # Show sample bills found
    all_bills = []
    for r in results:
        if r.get('bill_refs'):
            all_bills.extend(r['bill_refs'])
    
    if all_bills:
        print(f"Sample bill references found:")
        bill_counts = Counter(all_bills)
        for bill, count in bill_counts.most_common(10):
            print(f"  {bill} ({count}x)")
        print()
    
    print("=" * 80)
    print("RECOMMENDATION")
    print("=" * 80)
    
    if both_pct >= 20:
        print("✓ This source is suitable for legislative claim extraction")
        print("  Proceed with ingestion using this URL")
    else:
        print("✗ This source has low legislative signal")
        print("  Consider alternative sources:")
        print("  - Dedicated 'Legislation' or 'Bills' page")
        print("  - Congress.gov member sponsorship feed")
        print("  - Press releases filtered by category")
    
    print()


def main():
    parser = argparse.ArgumentParser(description='Probe source quality for legislative claims')
    parser.add_argument('--url', required=True, help='Source index URL to probe')
    parser.add_argument('--max-articles', type=int, default=10, 
                       help='Number of articles to sample (default: 10)')
    parser.add_argument('--rate-limit', type=float, default=0.5,
                       help='Delay between article fetches in seconds')
    
    args = parser.parse_args()
    
    probe_source(args.url, max_articles=args.max_articles, rate_limit=args.rate_limit)
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
