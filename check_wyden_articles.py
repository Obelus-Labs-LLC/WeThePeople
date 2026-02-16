import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.database import Claim
from jobs.ingest_claims import extract_bill_references
from services.extraction.extract_main_text import extract_main_text
import requests
from bs4 import BeautifulSoup

DATABASE_URL = "sqlite:///./wethepeople.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def check_article_for_bills(url):
    """Fetch article and check for bill numbers"""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        text = extract_main_text(soup)
        refs = extract_bill_references(text)
        return {
            'has_bills': bool(refs.get('display')),
            'bills': refs.get('display', []),
            'text_len': len(text)
        }
    except Exception as e:
        return {'error': str(e)}

db = SessionLocal()
try:
    print("Checking all Wyden claim URLs for bill numbers...\n")
    
    wyden_claims = db.query(Claim).filter(Claim.person_id == 'ron_wyden').all()
    
    urls_checked = set()
    bills_found = 0
    
    for claim in wyden_claims:
        if claim.claim_source_url in urls_checked:
            continue
        urls_checked.add(claim.claim_source_url)
        
        print(f"Checking: {claim.claim_source_url.split('/')[-1][:60]}...")
        result = check_article_for_bills(claim.claim_source_url)
        
        if 'error' in result:
            print(f"  ❌ Error: {result['error']}\n")
        elif result['has_bills']:
            bills_found += 1
            print(f"  ✅ Found bills: {result['bills']}")
            print(f"  Text length: {result['text_len']} chars\n")
        else:
            print(f"  ❌ No bills found (text: {result['text_len']} chars)\n")
    
    print(f"\nSummary: {bills_found}/{len(urls_checked)} articles contain bill numbers")
    
finally:
    db.close()
