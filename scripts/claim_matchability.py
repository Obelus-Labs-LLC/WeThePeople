"""
Claim Matchability Diagnostic

Analyzes claim text and source URLs to predict match likelihood.
Helps distinguish "matcher is broken" from "claims don't mention bills".

Usage:
    python scripts/claim_matchability.py --person-id elizabeth_warren
    python scripts/claim_matchability.py --all
    python scripts/claim_matchability.py --recent-days 7
"""

import argparse
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Claim
from datetime import datetime, timedelta


def extract_bill_identifiers(text: str) -> list:
    """Extract bill identifiers like H.R. 1234, S. 5678."""
    # Matches: H.R. 1234, HR 1234, HR1234, S. 1234, S 1234, S1234
    pattern = r'\b(?:H\.?R\.?|S\.?)\s?\d{1,4}\b'
    return re.findall(pattern, text, re.IGNORECASE)


def extract_act_titles(text: str) -> list:
    """Extract Act titles like 'Infrastructure Investment and Jobs Act'."""
    # Matches multi-word phrases ending in "Act" (at least 2 words before Act)
    pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\s+Act\b'
    return re.findall(pattern, text)


def extract_url_act_tokens(url: str) -> list:
    """Extract act-related tokens from URL slug.
    
    Filters out generic patterns like 'to act', 'must act', 'administration to act'.
    Requires at least 2 distinctive tokens before 'act'.
    """
    url_lower = url.lower()
    
    # Look for "act" in URL path
    if 'act' not in url_lower:
        return []
    
    # Extract path component
    path = url_lower.split('?')[0].split('#')[0]
    
    # Find segments containing "act"
    segments = path.split('/')
    act_segments = [s for s in segments if 'act' in s and len(s) > 10]  # Avoid standalone "act"
    
    # Extract multi-word phrases around "act"
    tokens = []
    for segment in act_segments:
        # Replace hyphens/underscores with spaces
        normalized = re.sub(r'[-_]', ' ', segment)
        
        # Find phrases ending in "act" with at least 2 words before it
        # Must have at least 2 distinctive (non-generic) tokens
        matches = re.findall(r'\b(\w+\s+\w+\s+\w*act)\b', normalized)
        
        for match in matches:
            words = match.split()
            
            # Filter out generic verb-to-act patterns
            if len(words) >= 2:
                # Reject if second-to-last word is a generic connector
                generic_connectors = {'to', 'must', 'can', 'will', 'should', 'would', 'could'}
                if words[-2] in generic_connectors:
                    continue
                
                # Require at least one capitalized word or substantive token
                # (for proper Act names like "Corporate Transparency Act")
                substantive_tokens = [w for w in words[:-1] if len(w) > 3 and w not in {'that', 'this', 'with', 'from', 'into', 'upon', 'about'}]
                if len(substantive_tokens) >= 2:
                    tokens.append(match)
    
    return tokens


def analyze_claim(claim: Claim) -> dict:
    """Analyze a single claim for matchability signals."""
    import json
    
    bill_ids = extract_bill_identifiers(claim.text)
    act_titles = extract_act_titles(claim.text)
    url_acts = extract_url_act_tokens(claim.claim_source_url or '')
    
    # Check bill_refs_json for extracted bill references
    bill_refs = []
    has_bill_refs = False
    if claim.bill_refs_json:
        try:
            refs = json.loads(claim.bill_refs_json)
            bill_refs = refs.get('display', [])
            has_bill_refs = len(bill_refs) > 0
        except:
            pass
    
    return {
        'claim_id': claim.id,
        'person_id': claim.person_id,
        'text_preview': claim.text[:100],
        'has_bill_id': len(bill_ids) > 0,
        'bill_ids': bill_ids,
        'has_act_title': len(act_titles) > 0,
        'act_titles': act_titles,
        'has_url_act': len(url_acts) > 0,
        'url_acts': url_acts,
        'has_bill_refs': has_bill_refs,
        'bill_refs': bill_refs,
        'matchable': len(bill_ids) > 0 or len(act_titles) > 0 or len(url_acts) > 0 or has_bill_refs
    }


def analyze_member(person_id: str, db) -> dict:
    """Analyze all claims for a member."""
    claims = db.query(Claim).filter(Claim.person_id == person_id).all()
    
    if not claims:
        return {
            'person_id': person_id,
            'total_claims': 0,
            'error': 'No claims found'
        }
    
    analyses = [analyze_claim(c) for c in claims]
    
    total = len(analyses)
    bill_id_count = sum(1 for a in analyses if a['has_bill_id'])
    act_title_count = sum(1 for a in analyses if a['has_act_title'])
    url_act_count = sum(1 for a in analyses if a['has_url_act'])
    bill_refs_count = sum(1 for a in analyses if a['has_bill_refs'])
    matchable_count = sum(1 for a in analyses if a['matchable'])
    
    return {
        'person_id': person_id,
        'total_claims': total,
        'bill_id_mentions': bill_id_count,
        'bill_id_pct': (bill_id_count / total * 100) if total > 0 else 0,
        'act_title_mentions': act_title_count,
        'act_title_pct': (act_title_count / total * 100) if total > 0 else 0,
        'url_act_slugs': url_act_count,
        'url_act_pct': (url_act_count / total * 100) if total > 0 else 0,
        'bill_refs_extracted': bill_refs_count,
        'bill_refs_pct': (bill_refs_count / total * 100) if total > 0 else 0,
        'matchable_claims': matchable_count,
        'matchable_pct': (matchable_count / total * 100) if total > 0 else 0,
        'detailed_analyses': analyses
    }


def main():
    parser = argparse.ArgumentParser(description='Analyze claim matchability')
    parser.add_argument('--person-id', help='Analyze specific member')
    parser.add_argument('--all', action='store_true', help='Analyze all members')
    parser.add_argument('--recent-days', type=int, help='Only analyze claims from last N days')
    parser.add_argument('--verbose', action='store_true', help='Show detailed per-claim analysis')
    
    args = parser.parse_args()
    
    db = SessionLocal()
    
    try:
        print("Database: sqlite:///./wethepeople.db")
        print("=" * 70)
        print("CLAIM MATCHABILITY ANALYSIS")
        print("=" * 70)
        
        if args.person_id:
            members = [args.person_id]
        elif args.all:
            # Get all unique person_ids
            members = [r[0] for r in db.query(Claim.person_id).distinct().all()]
        else:
            print("Error: specify --person-id <id> or --all")
            return 1
        
        for person_id in sorted(members):
            result = analyze_member(person_id, db)
            
            if 'error' in result:
                print(f"\n[{person_id}] {result['error']}")
                continue
            
            print(f"\n[{person_id}]")
            print(f"  Total claims: {result['total_claims']}")
            print(f"  Bill ID mentions (H.R./S. ####): {result['bill_id_mentions']} ({result['bill_id_pct']:.1f}%)")
            print(f"  Act title mentions: {result['act_title_mentions']} ({result['act_title_pct']:.1f}%)")
            print(f"  URL act slugs: {result['url_act_slugs']} ({result['url_act_pct']:.1f}%)")
            print(f"  Bill refs extracted (bill_refs_json): {result['bill_refs_extracted']} ({result['bill_refs_pct']:.1f}%)")
            print(f"  Matchable claims: {result['matchable_claims']} ({result['matchable_pct']:.1f}%)")
            
            # Matchability assessment
            matchable_pct = result['matchable_pct']
            if matchable_pct == 0:
                assessment = "❌ VERY LOW - expect near-0% match rate"
            elif matchable_pct < 20:
                assessment = "⚠️  LOW - expect <20% match rate"
            elif matchable_pct < 50:
                assessment = "→ MODERATE - expect 20-50% match rate"
            else:
                assessment = "✓ HIGH - expect 50%+ match rate"
            
            print(f"  Assessment: {assessment}")
            
            if args.verbose and result['matchable_claims'] > 0:
                print(f"\n  Matchable claims detail:")
                for analysis in result['detailed_analyses']:
                    if analysis['matchable']:
                        print(f"    - Claim #{analysis['claim_id']}: {analysis['text_preview']}...")
                        if analysis['bill_ids']:
                            print(f"      Bill IDs: {', '.join(analysis['bill_ids'])}")
                        if analysis['act_titles']:
                            print(f"      Act titles: {', '.join(analysis['act_titles'])}")
                        if analysis['url_acts']:
                            print(f"      URL acts: {', '.join(analysis['url_acts'])}")
                        if analysis['bill_refs']:
                            print(f"      Bill refs (extracted): {', '.join(analysis['bill_refs'])}")
        
        print("\n" + "=" * 70)
        print("LEGEND")
        print("=" * 70)
        print("Matchability % = (claims with bill IDs OR act titles OR URL acts OR bill_refs_json) / total")
        print("  Bill refs extracted: Bills found in full article text via extract_bill_references()")
        print("  0%: No explicit bill mentions → matcher has no signal")
        print("  <20%: Few bill mentions → low match rate expected")
        print("  20-50%: Moderate signal → moderate match rate expected")
        print("  50%+: Strong signal → good match rate expected")
        print("=" * 70)
        
    finally:
        db.close()
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
